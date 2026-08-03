// RicDOM コア実装
// JSON 構文で DOM を宣言的に定義・差分更新する軽量ライブラリ
// ブラウザ / Electron の renderer プロセスで動作する（Node.js 単体では動かない）

'use strict';

// =====================================================================
// NOOP_PROXY
// render_fn が関数でない場合など、エラー時に返すダミー Proxy
// =====================================================================

// ターゲット関数にすることで apply トラップが使えるようになる
// （NOOP_PROXY() のような誤用でも壊れない）
const noop_function = () => NOOP_PROXY;

// モジュールスコープで単一インスタンスとして保持する
// get のたびに新しい Proxy を生成するとメモリリークするため、自分自身を返す設計にする
const NOOP_PROXY = new Proxy(noop_function, {
  get:            () => NOOP_PROXY, // 何にアクセスしても自分自身を返す
  set:            () => true,       // 代入は静かに受け付けて何もしない
  apply:          () => NOOP_PROXY, // 関数として呼ばれても自分自身を返す
  deleteProperty: () => true,       // delete も静かに無視する
});

// =====================================================================
// ユーティリティ：スタイル正規化
// =====================================================================

// ハイフンケース → キャメルケース変換
// 例: 'padding-top' → 'paddingTop'
// 注: CSS Custom Property (`--*`) はそのまま返す。`--ric-color-bg` を
// 変換すると `-RicColorBg` になり、leading `--` が `-` 1 個になって
// CSS variable として認識されなくなるため。Custom Property は
// el.style.setProperty(key, value) で書き込む必要があり (普通の
// `el.style[key] = value` では silent no-op になる仕様)、そのためにも
// 元のキー名を保つ必要がある。
const convert_style_key_to_camel = (key) => {
  if (key.startsWith('--')) return key;
  return key.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
};

// style の正規化（3形式 + 配列マージ形式を受け付ける）
// 戻り値はキャメルケースオブジェクト、または文字列（cssText 用）
const normalize_style = (style) => {
  if (!style) return {};

  // 配列形式：後勝ちでマージして1つのキャメルケースオブジェクトにまとめる
  if (Array.isArray(style)) {
    return style.reduce((merged, item) => {
      if (item == null) return merged;             // null / undefined はスキップ
      const normalized = normalize_style(item);
      // 文字列形式はマージ対象外（個別プロパティとして扱えないため）
      if (typeof normalized === 'string') return merged;
      return { ...merged, ...normalized };
    }, {});
  }

  // 文字列形式：element.style.cssText に代入するためそのまま返す
  if (typeof style === 'string') return style;

  // オブジェクト形式：キーをキャメルケースに統一する
  return Object.fromEntries(
    Object.entries(style).map(([key, val]) => [
      convert_style_key_to_camel(key),
      val,
    ])
  );
};

// =====================================================================
// ユーティリティ：RicNode 正規化
// =====================================================================

// 非表示とみなす値か判定する
// null / undefined / false / 空配列 / 空オブジェクト は描画しない
const is_invisible_value = (val) => {
  if (val === null || val === undefined || val === false) return true;
  if (Array.isArray(val) && val.length === 0) return true;
  if (typeof val === 'object' && !Array.isArray(val) && Object.keys(val).length === 0) return true;
  return false;
};

// JSON ノードを正規化された内部形式に変換する
// class/style の統一などを行う
// 戻り値: { tag, id, class: [...], style: {...} or string, ctx: [...], ref, ...その他属性 }
const normalize_ric_node = (raw_node) => {
  // テキストノードや数値はそのまま返す
  if (typeof raw_node === 'string' || typeof raw_node === 'number') {
    return { node_type: 'text', text: String(raw_node) };
  }

  // 非表示値はスキップ用のマーカーを返す
  if (is_invisible_value(raw_node)) {
    return { node_type: 'invisible' };
  }

  // タグ・ID・クラスを確定する
  const tag = raw_node.tag ?? 'div';
  const id  = raw_node.id  ?? null;
  let classes = [];

  // class プロパティ（文字列・配列を受け付ける）
  const class_prop = raw_node.class;
  if (typeof class_prop === 'string' && class_prop) {
    classes = class_prop.split(/\s+/).filter(Boolean);
  } else if (Array.isArray(class_prop)) {
    classes = class_prop.filter(Boolean);
  }

  // ctx を確定する
  const raw_ctx = raw_node.ctx ?? [];
  const ctx_array = Array.isArray(raw_ctx) ? raw_ctx : (raw_ctx != null ? [raw_ctx] : []);

  // style を正規化する
  const normalized_style = normalize_style(raw_node.style ?? {});

  // その他の属性を収集する（tag/id/class/style/ctx/ref/key を除く）
  // key は v0.3.25〜 リスト reconciliation 用の論理 ID。DOM 属性としては出さない。
  const exclude_keys = new Set([
    'tag', 'id', 'class', 'style', 'ctx', 'ref', 'key',
  ]);
  const extra_attrs = {};
  for (const key of Object.keys(raw_node)) {
    if (!exclude_keys.has(key)) {
      extra_attrs[key] = raw_node[key];
    }
  }

  // key: リスト reconciliation 用の論理 ID。null は「key 無し」を意味する。
  // 文字列 / 数値 / Symbol 等、=== 比較できるものなら何でも OK。
  const key = (raw_node.key !== undefined && raw_node.key !== null) ? raw_node.key : null;

  return {
    node_type: 'element',
    tag,
    id,
    class:  classes,
    style:  normalized_style,
    ctx:    ctx_array,
    ref:    raw_node.ref ?? null,
    key,
    ...extra_attrs,
  };
};

// =====================================================================
// JSON 比較（差分更新の変化判定）
// =====================================================================

// 2つのノードツリーが等しいか再帰的に判定する
// 関数は参照同一性で比較する（異なるクロージャ → false → ハンドラが正しく更新される）
const is_json_equal = (a, b) => {
  if (a === b) return true;  // 同じ参照（同一関数含む）→ true
  if (typeof a !== typeof b) return false;
  // typeof null === 'object' なので b === null も明示的にガードする
  // （a がオブジェクト、b が null の場合に Object.keys(b) がクラッシュするのを防ぐ）
  if (typeof a !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;

  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    return a.every((item, i) => is_json_equal(item, b[i]));
  }

  const keys_a = Object.keys(a);
  const keys_b = Object.keys(b);
  if (keys_a.length !== keys_b.length) return false;
  return keys_a.every(key => is_json_equal(a[key], b[key]));
};

// =====================================================================
// DOM 構築
// =====================================================================

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

// class 属性を要素種別に応じて正しく書き込む。
// HTML 要素: el.className = val で OK (DOM の string プロパティ)。
// SVG 要素:  el.className は SVGAnimatedString (object) で、文字列代入は
//            silent no-op。setAttribute('class', val) を使う必要がある。
// 空文字列が来たら属性自体を削除する (cleaner)。
const _set_class = (el, value) => {
  if (el.namespaceURI === SVG_NAMESPACE) {
    if (value) el.setAttribute('class', value);
    else       el.removeAttribute('class');
  } else {
    el.className = value || '';
  }
};

// 単一 style プロパティを inline style に書き込む。
// 通常プロパティは el.style[key] = val、CSS Custom Property (`--*`) は
// el.style.setProperty(key, val) を使う必要がある (bracket setter は --*
// に対して silent no-op になる仕様)。
// 値が現状と同じならスキップする (mount/diff 共通使用、わずかな最適化)。
const _set_style_prop = (el, key, val) => {
  if (key.startsWith('--')) {
    if (el.style.getPropertyValue(key) !== String(val)) {
      el.style.setProperty(key, val);
    }
  } else {
    if (el.style[key] !== val) {
      el.style[key] = val;
    }
  }
};

// 単一 style プロパティを inline style から削除する。
// 通常プロパティは el.style[key] = ''、CSS Custom Property (`--*`) は
// el.style.removeProperty(key) を使う必要がある。
const _remove_style_prop = (el, key) => {
  if (key.startsWith('--')) el.style.removeProperty(key);
  else                      el.style[key] = '';
};

// DOM プロパティとして直接代入すべきキー（setAttribute ではなく代入する）
const DOM_PROPERTY_KEYS = new Set([
  'value', 'checked', 'selected', 'disabled',
  'innerHTML', 'textContent', 'innerText',
  'scrollTop', 'scrollLeft',
]);

// VDOM 上で prev=next が equal でも、毎 render で DOM に再代入するキー。
// 理由: これらはユーザー操作で DOM 側が独自に drift するため、VDOM の equality に
// 頼ると「state は checked=true を主張しているのに DOM は false」のような乖離が起きる。
// React / Preact 等の主要 VDOM ライブラリも controlled input は force-set する canon。
//
// innerHTML / textContent / innerText / disabled を含めなかった理由:
//   - innerHTML 等は毎 render で再代入すると全 child DOM 破棄再生成 = 性能 disaster
//   - disabled はユーザー操作で drift しない (JS 必須)
//   - contenteditable + state-controlled text の corner case は SPEC.md で注意喚起
const FORCE_REAPPLY_DOM_KEYS = new Set([
  'value', 'checked', 'selected',
  'scrollTop', 'scrollLeft',
]);

// イベントハンドラのプレフィックス
const is_event_handler_key = (key) => /^on[a-z]/.test(key);

// VDOM ノードの「構造を表すキー」集合。
// これらは normalize 処理が個別に処理するため、属性・プロパティ・イベントの
// 一般ループでは無視する（apply / patch 両方のパスで共通利用）。
// 'key' は v0.3.25〜 リスト reconciliation 用の論理 ID で、DOM 属性には出さない。
const STRUCTURAL_NODE_KEYS = new Set(['node_type','tag','id','class','style','ctx','ref','key']);

// ノードに属性・プロパティ・イベントハンドラを適用する
const apply_attributes_to_element = (el, normalized) => {
  // id
  if (normalized.id) {
    el.id = normalized.id;
  }

  // class (SVG では setAttribute 必須なので _set_class 経由)
  if (normalized.class && normalized.class.length > 0) {
    _set_class(el, normalized.class.join(' '));
  }

  // style
  const style = normalized.style;
  if (style) {
    if (typeof style === 'string') {
      el.style.cssText = style;
    } else {
      for (const [key, val] of Object.entries(style)) {
        _set_style_prop(el, key, val);
      }
    }
  }

  // その他の属性（イベント・プロパティ・HTML属性）
  for (const [key, val] of Object.entries(normalized)) {
    // normalize 済みの構造キーはスキップ
    if (STRUCTURAL_NODE_KEYS.has(key)) continue;

    if (is_event_handler_key(key)) {
      // イベントハンドラ：null は未設定として扱う
      if (typeof val === 'function') {
        el[key] = val;
      } else if (val === null) {
        el[key] = null;
      }
    } else if (DOM_PROPERTY_KEYS.has(key)) {
      // DOM プロパティ：直接代入する
      el[key] = val;
    } else if (typeof val === 'boolean') {
      // boolean 属性（disabled, hidden など）
      if (val) {
        el.setAttribute(key, '');
      } else {
        el.removeAttribute(key);
      }
    } else if (val !== null && val !== undefined) {
      // それ以外は setAttribute（SVG の viewBox 等に対応）
      el.setAttribute(key, val);
    }
  }
};

// 正規化済み RicNode から DOM ノードを構築する（再帰）
// inherited_namespace：SVG コンテキストを子孫に引き継ぐため
const build_dom_node = (raw_node, inherited_namespace = null) => {
  const normalized = normalize_ric_node(raw_node);

  if (normalized.node_type === 'invisible') return null;

  if (normalized.node_type === 'text') {
    return document.createTextNode(normalized.text);
  }

  // svg タグを検出したらネームスペースを確定し、子孫全体に引き継ぐ
  const current_namespace = (normalized.tag === 'svg')
    ? SVG_NAMESPACE
    : inherited_namespace;

  const el = current_namespace
    ? document.createElementNS(current_namespace, normalized.tag)
    : document.createElement(normalized.tag);

  // 属性・プロパティ・イベントハンドラを適用する
  apply_attributes_to_element(el, normalized);

  // ref が指定されている場合、data-ric-ref 属性を設定する
  // DOM の id 属性とは異なり DOM には直接出力しない（RicDOM の内部管理用）
  // register_refs_from_element() が querySelectorAll('[data-ric-ref]') で収集するために必要
  if (normalized.ref) {
    el.dataset.ricRef = normalized.ref;
  }

  // 子要素を再帰的に構築する。
  // normalize_children でネスト配列を展開してから回す (patch 経路と同じ規則)。
  // これが無いと `ctx: [items.map(...)]` のような配列入り ctx が、初期 build で
  // 「配列を element として normalize → 数字 key を setAttribute → DOMException」
  // になって落ちる (patch 経路だけ展開できても初期描画で死ぬ)。
  for (const child of normalize_children(normalized.ctx)) {
    const child_el = build_dom_node(child, current_namespace);
    if (child_el) el.appendChild(child_el);
  }

  // select の value は option が生えた後でないと選択に反映できない。
  // apply_attributes_to_element は子 append より前に呼ばれるため、value 代入
  // 時点では <option> が 0 個で、ブラウザは自動的に先頭 option を選択してしまう
  // (その後 value は再適用されないため選択がズレたまま確定する)。
  // ここで option 構築後にもう一度 value を当て直して確定させる。
  // 'value' in normalized で判定するのは、未指定時に el.value = undefined を
  // 実行して "undefined" という文字列の option 選択を試みる事故を避けるため。
  // build_dom_node は初回 mount・patch 中の新規ノード生成の両方で使われるので、
  // ここ 1 箇所の修正で両経路をカバーできる。
  // textarea の value・radio の checked は子要素の有無に依存しないため対象外
  // (再現しない症状への speculative fix はしない)。
  if (normalized.tag === 'select' && 'value' in normalized) {
    el.value = normalized.value;
  }

  return el;
};

// =====================================================================
// 差分更新（reconciliation）
// =====================================================================

// prev・next 両方の子要素リストから重複タグ名を収集して Set で返す
// 例: prev に div が 1 個、next に div が 2 個 → {div}
// prev・next の union を取ることで「消えた」「現れた」どちらの側にも対応する
const collect_duplicate_tags = (prev_children, next_children) => {
  const count_tags = (children) => {
    const counts = {};
    for (const child of children) {
      if (typeof child === 'object' && child !== null && !Array.isArray(child)) {
        const normalized = normalize_ric_node(child);
        if (normalized.node_type === 'element') {
          counts[normalized.tag] = (counts[normalized.tag] ?? 0) + 1;
        }
      }
    }
    return counts;
  };
  const prev_counts = count_tags(prev_children);
  const next_counts = count_tags(next_children);
  const dup_tags = new Set();
  for (const [tag, n] of Object.entries(prev_counts)) { if (n > 1) dup_tags.add(tag); }
  for (const [tag, n] of Object.entries(next_counts)) { if (n > 1) dup_tags.add(tag); }
  return dup_tags;
};

// 子要素リストにシリアルキーを割り当てる
// dup_tags に含まれるタグは 'div@0', 'div@1' のようにシリアル番号付き
// それ以外はタグ名そのまま。テキストノードは 'text'
// 実際の DOM タグ名は変えない（このキーはマッチングにのみ使う）
const build_serial_key_list = (children, dup_tags) => {
  const counters = {};
  return children.map(child => {
    if (typeof child === 'string' || typeof child === 'number') return 'text';
    if (typeof child !== 'object' || child === null)            return 'invisible';
    const normalized = normalize_ric_node(child);
    if (normalized.node_type !== 'element') return 'text';
    const tag = normalized.tag;
    if (!dup_tags.has(tag)) return tag; // 重複なし → タグ名そのまま
    const n = counters[tag] ?? 0;
    counters[tag] = n + 1;
    return `${tag}@${n}`; // 重複あり → シリアル番号付き
  });
};

// 属性の差分を DOM に反映する
// build 時の apply_attributes_to_element と対になる diff 版。処理対象キーの
// 分類 (id/ref/class/style/その他) は共通。
const patch_attributes = (prev_normalized, next_normalized, el) => {
  // id の差分
  const next_id = next_normalized.id ?? '';
  if ((prev_normalized.id ?? '') !== next_id) {
    el.id = next_id;
  }

  // ref の差分（data-ric-ref 属性を更新する）
  // ref は HTML の id 属性とは異なり DOM に直接出力しない（RicDOM の内部管理用）
  // register_refs_from_element() が querySelectorAll('[data-ric-ref]') で収集するために必要
  const prev_ref = prev_normalized.ref ?? '';
  const next_ref = next_normalized.ref ?? '';
  if (prev_ref !== next_ref) {
    if (next_ref) {
      el.dataset.ricRef = next_ref;
    } else {
      delete el.dataset.ricRef;
    }
  }

  // class の差分 (SVG では setAttribute 必須なので _set_class 経由)
  const prev_class = (prev_normalized.class ?? []).join(' ');
  const next_class = (next_normalized.class ?? []).join(' ');
  if (prev_class !== next_class) {
    _set_class(el, next_class);
  }

  // style の差分
  const prev_style = prev_normalized.style ?? {};
  const next_style = next_normalized.style ?? {};

  if (typeof next_style === 'string') {
    if (el.style.cssText !== next_style) {
      el.style.cssText = next_style;
    }
  } else {
    // 旧 style が文字列形式（cssText 一括指定）だった場合は、object を当てる前に
    // cssText をクリアする。これを忘れると旧の inline style が DOM に残留する。
    // 例: prev style:'flex:1' → next style: undefined / {} のとき、下のリセット
    // ループは prev が string だと回らないので、ここで cssText を空にしないと
    // 'flex:1' がノード上に残ってしまう。
    if (typeof prev_style === 'string') {
      el.style.cssText = '';
    }

    // 次のスタイルを適用する (--* / 通常プロパティの分岐は helper に集約)
    for (const [key, val] of Object.entries(next_style)) {
      _set_style_prop(el, key, val);
    }
    // 前にあったが次にないスタイルをリセットする（prev も object のケース）。
    // prev が string のケースは上の cssText='' で一括クリア済み。
    if (typeof prev_style !== 'string') {
      for (const key of Object.keys(prev_style)) {
        if (!(key in next_style)) {
          _remove_style_prop(el, key);
        }
      }
    }
  }

  // その他の属性・プロパティ・イベントハンドラの差分
  const prev_extra = Object.fromEntries(Object.entries(prev_normalized).filter(([k]) => !STRUCTURAL_NODE_KEYS.has(k)));
  const next_extra = Object.fromEntries(Object.entries(next_normalized).filter(([k]) => !STRUCTURAL_NODE_KEYS.has(k)));

  // 次の値を適用する
  for (const [key, val] of Object.entries(next_extra)) {
    if (is_event_handler_key(key)) {
      // イベントハンドラは差分チェックを通さず常に最新ハンドラで上書きする。
      // render 関数の中で毎回 () => {...} を作るのが普通の使い方なので、
      // 参照は毎回新しい。同一参照が渡ってきた場合でも、最新クロージャに
      // 差し替わることを保証するため一律上書きする（性能影響は無視できる小ささ）。
      el[key] = (typeof val === 'function') ? val : null;
    } else if (FORCE_REAPPLY_DOM_KEYS.has(key)) {
      // user 操作で DOM が drift しうる prop は、prev=next でも毎回 DOM に再代入する。
      // (例: checkbox を user がクリックして checked=false にした後、state は true のまま
      // 再 render してもこの代入が無いと DOM が false のまま残る。)
      el[key] = val;
    } else if (!is_json_equal(prev_extra[key], val)) {
      if (DOM_PROPERTY_KEYS.has(key)) {
        el[key] = val;
      } else if (typeof val === 'boolean') {
        if (val) { el.setAttribute(key, ''); } else { el.removeAttribute(key); }
      } else if (val !== null && val !== undefined) {
        el.setAttribute(key, val);
      } else {
        el.removeAttribute(key);
      }
    }
  }

  // 前にあったが次にない属性を削除する。
  // DOM プロパティはデフォルト値に戻す術が型ごとに違うため、HTML 属性と同じく
  // removeAttribute で代用する（属性 → 対応プロパティの初期化はブラウザに任せる）。
  for (const key of Object.keys(prev_extra)) {
    if (!(key in next_extra)) {
      if (is_event_handler_key(key)) el[key] = null;
      else                            el.removeAttribute(key);
    }
  }
};

// raw な子ノードリストを正規化して invisible を除去する
const normalize_children = (raw_children) => {
  const result = [];
  for (const child of raw_children) {
    if (is_invisible_value(child)) continue;
    // 配列は展開する（ctx に配列を渡した場合）
    if (Array.isArray(child)) {
      for (const nested_child of child) {
        if (!is_invisible_value(nested_child)) result.push(nested_child);
      }
    } else {
      result.push(child);
    }
  }
  return result;
};

// VDOM 構造短絡時の FORCE_REAPPLY 専用 walker (v0.3.24〜)。
// VDOM 自体は prev=next なので構造 patch は不要だが、user 操作で DOM が drift した
// FORCE_REAPPLY_DOM_KEYS (= value / checked / selected / scrollTop / scrollLeft)
// だけは VDOM の値で上書き直す。
// normalized_children は normalize_children() 通過済みなので invisible は除外済み
// だが、各 element は normalize_ric_node() を通っていない raw 形 (= ctx 等が raw)。
const _apply_force_reapply_to_subtree = (normalized_children, parent_el) => {
  for (let i = 0; i < normalized_children.length; i++) {
    const child = normalized_children[i];
    // テキスト・null 等は dom_index に対応する DOM ノードがあるが force-reapply 対象は
    // 持たない (= text node に value/checked 等は無い)。
    if (typeof child !== 'object' || child === null) continue;
    const dom_el = parent_el.childNodes[i];
    if (!dom_el || dom_el.nodeType !== Node.ELEMENT_NODE) continue;
    // 該当する FORCE_REAPPLY prop だけを直接代入する。
    for (const key of FORCE_REAPPLY_DOM_KEYS) {
      if (key in child) dom_el[key] = child[key];
    }
    // 子孫も走査する (ctx は raw な配列 / 単一値 / undefined のいずれか)。
    if (child.ctx != null) {
      const ctx_array = Array.isArray(child.ctx) ? child.ctx : [child.ctx];
      _apply_force_reapply_to_subtree(normalize_children(ctx_array), dom_el);
    }
  }
};

// 子要素リストに 1 つでも `key` 属性が付いていれば true。
// 付いていれば key-based reconciliation を使う (v0.3.25〜)。
// 引数は normalize_children() 通過済みのリストであること (= ネスト配列は展開済み)。
// raw のまま渡すと `ctx: [items.map(...)]` のようなネスト配列内の key を見落とす。
const _children_have_any_key = (children) => {
  for (const c of children) {
    if (c && typeof c === 'object' && !Array.isArray(c) && c.key != null) return true;
  }
  return false;
};

// 子要素リストの差分を DOM に反映する。
// raw な children を受け取り、内部で normalize_children() してから
// key-based / position-based のどちらかの reconciliation に dispatch する。
const patch_children = (prev_raw_children, next_raw_children, parent_el) => {
  const prev_children = normalize_children(prev_raw_children);
  const next_children = normalize_children(next_raw_children);

  // 変化がなければ DOM 構造の patch はスキップ。ただし FORCE_REAPPLY_DOM_KEYS だけは
  // user 操作で DOM が drift しているかもしれないので、subtree を walk して再適用する
  // (v0.3.24〜、TrendGuard 報告)。
  //   - 構造短絡を維持する理由: parent が <div ref="mount"> のような空 ctx を返して、
  //     child instance が外部から DOM を mount するパターンを守るため (= 末尾削除ループが
  //     externally-managed な child を巻き込まない)。
  //   - FORCE_REAPPLY 専用 walk のコスト: 該当 prop を持たない node なら for-of が短いだけ
  //     で実害なし。再帰的に ctx を辿るが normalize 済み tree なのでフラット。
  if (is_json_equal(prev_children, next_children)) {
    _apply_force_reapply_to_subtree(next_children, parent_el);
    return;
  }

  // v0.3.25〜: 子要素のどれかに `key` が付いていれば key-based reconciliation を使う。
  // (= リスト並べ替え / 中央挿入 / 削除に強い。React / Preact と同じ canon。)
  // key が無い従来のコードは引き続き position-based (= 後方互換)。
  // 検査は normalize 済みリストに対して行う (raw だと `ctx: [items.map(...)]` の
  // ようなネスト配列内の key を見落とすため)。
  if (_children_have_any_key(prev_children) || _children_have_any_key(next_children)) {
    patch_children_by_key(prev_children, next_children, parent_el);
    return;
  }

  // prev・next 両方から重複タグを収集し、シリアルキーリストを生成する
  // 重複タグがある場合でも innerHTML リセットはせず、シリアルキーで位置マッチングする
  // 理由: innerHTML = '' は input のフォーカス・IME 変換状態・スクロール位置を破壊するため
  // シリアルキー例: [div(ラベル), input, div(挨拶)] → ['div@0', 'input', 'div@1']
  //                 prev に div が 1 個しかなくても同じルールで 'div@0' と割り当てるため
  //                 prev 側の div@0 ↔ next 側の div@0 が正しく対応付けられる
  const dup_tags         = collect_duplicate_tags(prev_children, next_children);
  const prev_serial_keys = build_serial_key_list(prev_children, dup_tags);
  const next_serial_keys = build_serial_key_list(next_children, dup_tags);

  patch_children_by_position(prev_children, next_children, parent_el, prev_serial_keys, next_serial_keys);
};

// key 属性ベースの差分更新 (v0.3.25〜)
//
// key 付き子要素は「論理エンティティ」として prev/next を Map で対応付けし、
// DOM を必要なら insertBefore で並び替える。
// key 無しの兄弟は「prev 側の同 tag の先頭から順に消費」する (= position-based のサブセット)。
//
// この path に入る条件: prev_raw_children か next_raw_children のどれかに `key` がある。
// 全て key 無しなら従来の patch_children_by_position に dispatch されるので、ここには来ない。
const patch_children_by_key = (prev_children, next_children, parent_el) => {
  // 1) prev を keyed Map と unkeyed queue に振り分け
  const prev_doms      = Array.from(parent_el.childNodes);
  const prev_keyed_map = new Map();   // key → { normalized, dom }
  const prev_unkeyed   = [];           // [{ normalized, dom }, ...] FIFO
  for (let i = 0; i < prev_children.length; i++) {
    const normalized = normalize_ric_node(prev_children[i]);
    const dom  = prev_doms[i];
    if (normalized.node_type === 'element' && normalized.key !== null) {
      prev_keyed_map.set(normalized.key, { normalized, dom });
    } else {
      prev_unkeyed.push({ normalized, dom });
    }
  }

  // 2) next を順に処理して、DOM を target order に組み直す
  let cursor = parent_el.firstChild;   // 「ここに挿入する」位置 (= 次に処理するべき DOM ノード)
  for (let i = 0; i < next_children.length; i++) {
    const next_raw  = next_children[i];
    const next_normalized = normalize_ric_node(next_raw);
    let target_dom = null;
    let prev_normalized  = null;

    if (next_normalized.node_type === 'element' && next_normalized.key !== null) {
      // keyed: prev_keyed_map から同 key を探して再利用
      const entry = prev_keyed_map.get(next_normalized.key);
      if (entry) {
        target_dom = entry.dom;
        prev_normalized  = entry.normalized;
        prev_keyed_map.delete(next_normalized.key);
      }
    } else {
      // unkeyed: prev_unkeyed の先頭から取り、tag 一致 (or text 同士) なら再利用
      if (prev_unkeyed.length > 0) {
        const entry = prev_unkeyed[0];
        const same_type =
          entry.normalized.node_type === next_normalized.node_type &&
          (next_normalized.node_type === 'text' || entry.normalized.tag === next_normalized.tag);
        if (same_type) {
          target_dom = entry.dom;
          prev_normalized  = entry.normalized;
          prev_unkeyed.shift();
        }
      }
    }

    // マッチしなければ新規作成
    if (!target_dom) {
      target_dom = build_dom_node(next_raw, parent_el.namespaceURI);
      if (!target_dom) continue;
    }

    // DOM 位置調整: cursor と一致するなら cursor を進めるだけ、違うなら insertBefore で移動
    if (cursor === target_dom) {
      cursor = cursor.nextSibling;
    } else {
      parent_el.insertBefore(target_dom, cursor);
      // cursor はそのまま (target_dom が cursor の前に挿入されたので、次に処理する DOM は cursor)
    }

    // 既存 DOM 再利用なら attribute / child を patch
    if (prev_normalized) {
      if (next_normalized.node_type === 'text') {
        if (target_dom.nodeType === Node.TEXT_NODE && target_dom.textContent !== next_normalized.text) {
          target_dom.textContent = next_normalized.text;
        }
      } else if (next_normalized.node_type === 'element') {
        patch_attributes(prev_normalized, next_normalized, target_dom);
        patch_children(prev_normalized.ctx ?? [], next_normalized.ctx ?? [], target_dom);
      }
    }
  }

  // 3) 余った prev DOM (= 不要になったもの) を全部削除
  for (const entry of prev_keyed_map.values()) {
    if (entry.dom && entry.dom.parentNode === parent_el) {
      parent_el.removeChild(entry.dom);
    }
  }
  for (const entry of prev_unkeyed) {
    if (entry.dom && entry.dom.parentNode === parent_el) {
      parent_el.removeChild(entry.dom);
    }
  }
};

// 位置ベースの差分更新
// prev_serial_keys / next_serial_keys: build_serial_key_list() が返すキーリスト
// シリアルキーを「このポジションのノードが同一ノードか」の判定に使う
// キーが同じ → インプレース更新（DOM ノード再利用）
// キーが違う → 置き換え（前のノードとは別物とみなす）
const patch_children_by_position = (prev_children, next_children, parent_el, prev_serial_keys, next_serial_keys) => {
  const prev_len = prev_children.length;
  const next_len = next_children.length;
  const max_len  = Math.max(prev_len, next_len);

  for (let i = 0; i < max_len; i++) {
    const prev_node = prev_children[i];
    const next_node = next_children[i];
    // childNodes は live NodeList のため削除後にインデックスがずれる点に注意
    const dom_el = parent_el.childNodes[i];

    if (next_node === undefined) {
      // 余分なノードを削除する
      if (dom_el) {
        parent_el.removeChild(dom_el);
      }
    } else if (prev_node === undefined) {
      // 新規ノードを追加する
      // 親の namespaceURI を引き継ぐ（SVG サブツリーへの動的追加で
      // 子要素が HTML namespace で生成されないようにするため）
      const new_el = build_dom_node(next_node, parent_el.namespaceURI);
      if (new_el) parent_el.appendChild(new_el);
    } else {
      const prev_normalized = normalize_ric_node(prev_node);
      const next_normalized = normalize_ric_node(next_node);

      // テキストノードの差分（シリアルキーは関係ない）
      if (next_normalized.node_type === 'text') {
        if (prev_normalized.node_type === 'text') {
          if (dom_el && dom_el.nodeType === Node.TEXT_NODE && dom_el.textContent !== next_normalized.text) {
            dom_el.textContent = next_normalized.text;
          }
        } else {
          const new_el = document.createTextNode(next_normalized.text);
          if (dom_el) { parent_el.replaceChild(new_el, dom_el); }
          else         { parent_el.appendChild(new_el); }
        }
        continue;
      }

      // シリアルキーが違う場合は別ノードとみなして置き換える
      // 同じキー（例: 'div@0' ↔ 'div@0'）なら DOM ノードを再利用してインプレース更新する
      const prev_key = prev_serial_keys[i];
      const next_key = next_serial_keys[i];
      if (prev_key !== next_key) {
        // 親の namespaceURI を引き継ぐ（追加パスと同じ理由）
        const new_el = build_dom_node(next_node, parent_el.namespaceURI);
        if (new_el && dom_el) {
          parent_el.replaceChild(new_el, dom_el);
        } else if (new_el) {
          parent_el.appendChild(new_el);
        }
        continue;
      }

      // 同一ノード → 属性だけ更新して子要素を再帰処理する
      // DOM ノードを再利用するため input のフォーカス・IME 状態が保たれる
      if (dom_el) {
        patch_attributes(prev_normalized, next_normalized, dom_el);
        patch_children(
          prev_normalized.ctx ?? [],
          next_normalized.ctx ?? [],
          dom_el,
        );
      }
    }
  }

  // 超過した DOM ノードを後ろから削除する
  while (parent_el.childNodes.length > next_len) {
    parent_el.removeChild(parent_el.lastChild);
  }
};

// =====================================================================
// 描画スケジューラ（requestAnimationFrame ベース + setTimeout バックストップ）
// =====================================================================

// rAF は hidden タブ・kiosk の全画面遷移・Electron の backgroundThrottling 等で
// 発火しないことがある。旧実装はフラグ解除が rAF コールバック内の 1 本道だった
// ため、一度でも rAF が飛ぶとフラグが永久に立ちっぱなしになり再描画が完全停止
// する silent failure があった (v0.3.36 で修正、Unizon kiosk consumer 報告)。
//
// 対策: schedule 時に rAF と setTimeout(200ms) の両方を張り、先に発火した方が
// 描画する（フラグガードで他方は no-op）。200ms は「健常な rAF (~16ms) の描画
// タイミングを邪魔せず、かつ詰まったときの復旧が体感できる速さ」として選定。
// 健常時は rAF が先に走りバックストップは clearTimeout される。rAF が飛んだ
// 場合もバックストップがフラグを解いて描画するため、永久停止は構造的に起きない
// (hidden タブでは setTimeout 自体もブラウザに throttle され 1 秒以上になり
// うるが、「いずれ必ず発火してフラグが解ける」ことは保証される)。
//
// インスタンスごとに生成し、同一フレーム内の多重スケジュールを防ぎ、描画を
// 1回にまとめる。
const create_render_scheduler = (do_render) => {
  // let が必要な数少ないケース：rAF / バックストップのどちらかで解除するため
  let render_scheduled = false;
  let raf_id = null;
  let backstop_id = null;

  // rAF / バックストップ共通の実行体。先に来た方が描画し、
  // 後から来た方は render_scheduled ガードで no-op になる。
  const run = () => {
    if (!render_scheduled) return; // 相方が処理済み、または外部で描画済み（render_now 等）
    render_scheduled = false;
    raf_id = null;
    if (backstop_id !== null) { clearTimeout(backstop_id); backstop_id = null; }
    do_render();
  };

  const schedule_render = () => {
    // すでにスケジュール済みなら何もしない（同一フレーム内の重複登録を防ぐ）
    if (render_scheduled) return;
    render_scheduled = true;
    raf_id = requestAnimationFrame(run);
    backstop_id = setTimeout(run, 200);
  };

  // render_now() のように schedule_render を経由せず外部から直接 do_render した
  // 直後に呼ぶ。保留中の rAF / バックストップを解除し、後追いで run() が発火して
  // 二重描画するのを防ぐ（cancelAnimationFrame は環境によって存在しないことが
  // あるため typeof で確認する。無くても render_scheduled ガードにより二重描画
  // 自体は防げるので、あくまで zombie timer の掃除としての位置づけ）。
  const cancel_pending = () => {
    if (!render_scheduled) return;
    render_scheduled = false;
    if (raf_id !== null) {
      if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf_id);
      raf_id = null;
    }
    if (backstop_id !== null) { clearTimeout(backstop_id); backstop_id = null; }
  };

  return { schedule_render, cancel_pending };
};

// =====================================================================
// shared state 管理
// =====================================================================

// raw state オブジェクトに対して共有 Proxy とサブスクライバーリストを WeakMap で管理する
// WeakMap を使う理由：raw state が GC されたときに自動的にエントリが削除される（メモリリーク防止）
const state_subscribers_map = new WeakMap(); // raw state → Set<schedule_render>
const state_proxy_map       = new WeakMap(); // raw state → 共有Proxy

// =====================================================================
// target 探索
// =====================================================================

// DOM 要素として受け付けられる型かを判定する。
// 注: HTMLElement だけでなく Element 全般を許容する (v0.3.15〜)。
// `<svg>` 等の SVGElement は HTMLElement を継承していないため、HTMLElement
// だけで判定すると SVG 要素を target に指定できない。
// Element 判定が primary path (HTMLElement も Element を継承しているため
// real DOM 環境ではこれで十分)。HTMLElement への fallback は、`Element` を
// global に出していない古い test setup 互換のための safety net。
// `typeof` 前置ガードは Node 等で両方が未定義のときの ReferenceError 回避。
const _is_dom_element = (target) =>
  (typeof Element     !== 'undefined' && target instanceof Element) ||
  (typeof HTMLElement !== 'undefined' && target instanceof HTMLElement);

// target を文字列（CSS セレクタ）または DOM 要素として受け付ける。
// 文字列の場合は document.querySelector で取得する。
const resolve_target_element = (target) => {
  if (typeof target === 'string') {
    return document.querySelector(target);
  }
  if (_is_dom_element(target)) {
    return target;
  }
  return null;
};

// =====================================================================
// create_RicDOM：メインのファクトリ関数
// =====================================================================

const create_RicDOM = (target, raw_state = {}) => {

  // ── 引数の正規化 ─────────────────────────────────────────
  // API: create_RicDOM(target, state_with_render)
  //   target: CSS セレクタ文字列 or DOM 要素
  //   state_with_render: 初期 state。render: (s) => VDOM を含めると描画関数として使われる
  //   render 後付け: handle.render = fn（per-instance）
  //
  // 第 1 引数が object だった過去の 3 引数 form（create_RicDOM(state, target, render)）
  // は v0.3.3 で削除した。複数 instance + 共有 state + 独立 render は、
  // 2 引数 form + handle.render = fn で同じことが書ける。
  // target は CSS セレクタ文字列 or DOM 要素 (Element 派生)。
  // _is_dom_element は HTMLElement / Element の両方を許容する (v0.3.15〜)。
  if (typeof target !== 'string' && !_is_dom_element(target)) {
    console.error(
      'RicDOM: 第 1 引数は CSS セレクタ文字列または DOM 要素です。\n' +
      '✅ 正しい例: create_RicDOM(\'#app\', { count: 0, render: s => ({ tag: \'div\', ctx: [s.count] }) })\n' +
      '⚠️ 旧 3 引数形式 create_RicDOM(state, target, render) は v0.3.3 で削除されました。',
    );
    return NOOP_PROXY;
  }

  // state が null / undefined の場合もエラーを通知する
  // （raw_state.render への次のアクセスより前にガードする必要がある。
  //   このチェックが後ろにあると null.render で TypeError が throw され、
  //   ハウス契約「throw しない (console.error + NOOP_PROXY 返却)」に反する）
  if (raw_state === null || raw_state === undefined || typeof raw_state !== 'object') {
    console.error(
      'RicDOM: state がオブジェクトではありません。\n' +
      '✅ 正しい例: create_RicDOM(\'#app\', { count: 0 })',
    );
    return NOOP_PROXY;
  }

  const render_fn = raw_state.render;
  // render は state のプロパティだが、raw_state からは削除しない
  // （s.render の get/set trap で管理するため）

  // render_fn のバリデーション
  if (render_fn !== undefined && render_fn !== null && typeof render_fn !== 'function') {
    console.error(
      'RicDOM: render が関数ではありません。\n' +
      '✅ 正しい例: create_RicDOM(\'#app\', { count: 0, render: s => ({ tag: \'div\', ctx: [s.count] }) })\n' +
      '✅ 省略も可: create_RicDOM(\'#app\', { count: 0 }) → handle.render = fn で後設定',
    );
    return NOOP_PROXY;
  }

  // render_fn 省略時は null。handle.render = fn で設定するまで描画しない。
  let _render_fn = typeof render_fn === 'function' ? render_fn : null;
  const _render_fn_provided = _render_fn !== null;

  // ---------------------------------------------------------------
  // インスタンス固有の変数
  // ---------------------------------------------------------------

  // 破棄フラグ：destroy() 後の描画・タイマーをスキップするために使う
  let is_destroyed = false;

  // target 探索リトライタイマーの ID（destroy() 時に停止するために保持する）
  let target_search_timer = null;

  // 前回描画時の JSON ツリー（差分更新の基準になる）
  let prev_tree = null;

  // DOM への ref 参照マップ（インスタンス固有。shared state には載せない）
  const refs_map = new Map();

  // マウント先の DOM 要素（解決後にセットする）
  let target_el = null;

  // ---------------------------------------------------------------
  // shared state のセットアップ
  // ---------------------------------------------------------------

  // このstateへの購読者リストを取得（なければ作成）
  if (!state_subscribers_map.has(raw_state)) {
    state_subscribers_map.set(raw_state, new Set());
  }
  const subscribers = state_subscribers_map.get(raw_state);

  // 初期 state 内のファクトリオブジェクトに __notify を注入する
  // （set trap を通らずに初期状態に入ったものへ対応。
  //   create_RicDOM('#app', { dlg: create_ui_dialog(), ... }) のような
  //   コンパクト記法で popup/dialog の内部イベントから再描画をトリガーできるようにする）
  // non-enumerable で定義することで Object.keys/entries/JSON.stringify 等で
  // ユーザーデータに混入しない（json_root のような「データそのもの」を state
  // に置くケースを壊さないため）。
  const _inject_notify = (value) => {
    if (value == null || (typeof value !== 'object' && typeof value !== 'function')) return;
    if (value.__notify) return;
    Object.defineProperty(value, '__notify', {
      value: () => subscribers.forEach(schedule => schedule()),
      enumerable: false, configurable: true, writable: true,
    });
  };
  // 複数 instance 生成時に毎回走るが、_inject_notify は冪等 (既に __notify が
  // あれば早期 return) なので安全。
  for (const key of Object.keys(raw_state)) {
    if (key === 'ignore' || key === 'render') continue;
    _inject_notify(raw_state[key]);
  }

  // このstateの共有Proxyを取得（なければ作成）
  if (!state_proxy_map.has(raw_state)) {

    // 一段目のオブジェクト/関数に対する子 Proxy キャッシュ
    // s.dark.density = 'compact' のように、一段目のメンバへの代入でも
    // 再描画をトリガーする。ignore メンバへの代入はスキップする。
    // WeakMap を使うことで、オブジェクトが GC されればキャッシュも消える。
    const _child_proxies = new WeakMap();

    const _wrap_child = (val) => {
      if (!_child_proxies.has(val)) {
        _child_proxies.set(val, new Proxy(val, {
          set(target, prop, value) {
            target[prop] = value;
            // ignore への代入は再描画しない（トップレベルと同じルール）
            if (prop === 'ignore') return true;
            // v0.3.25〜: child proxy 経由の代入 (例: s.popups[sym] = create_ui_popup()) でも、
            // 値が factory 等の object/function なら __notify を自動付与する。
            // (TrendGuard 報告: 動的に factory を state に追加したケースで __notify が
            // 刺さらず、内部イベントから safe_notify しても再描画が走らなかった bug 修正)
            _inject_notify(value);
            subscribers.forEach(schedule => schedule());
            return true;
          },
        }));
      }
      return _child_proxies.get(val);
    };

    const shared_proxy = new Proxy(raw_state, {
      get(obj, key) {
        // s.render → 現在の描画関数を返す（未設定時は undefined）
        if (key === 'render') return _render_fn ?? undefined;
        const val = obj[key];
        // ignore / null / プリミティブ / 配列はそのまま返す
        // 配列を Proxy ラップしない結果、 `s.list.push(x)` のような mutation では
        // 再描画はトリガされない。配列は置き換え（`s.list = [...s.list, x]`）で扱うこと。
        // この制限は SPEC.md「Proxy 監視深度」にも明記されている。
        if (key === 'ignore' || val == null
            || (typeof val !== 'object' && typeof val !== 'function')
            || Array.isArray(val)) {
          return val;
        }
        // 一段目のオブジェクト/関数を子 Proxy でラップして返す
        return _wrap_child(val);
      },
      set(obj, key, value) {
        // s.render = fn（render 関数内から shared_proxy 経由）で描画関数を差し替え。
        // s.page = ... 等の代入で既に rAF がスケジュール済みの場合、
        // rAF コールバックは同期コード完了後に走るため、
        // この時点で _render_fn を設定しておけば rAF 内の do_render で使われる。
        //
        // 注意: shared_proxy はキャッシュ（state_proxy_map）で複数 instance 間で共有されるが、
        // この `_render_fn` は **最初の create_RicDOM 呼び出しのクロージャ変数**。
        // そのため shared_proxy.render = fn は「最初の instance の render のみ」を変更する。
        // 複数 instance で異なる render を使いたい場合は `handle.render = fn` を使うこと
        // （instance_handle 側の set トラップで per-instance に処理される）。
        if (key === 'render' && typeof value === 'function') {
          _render_fn = value;
          // target 解決済みなら同期で初回描画（FOUC 防止）
          if (target_el) { do_render(); }
          else { subscribers.forEach(schedule => schedule()); }
          return true;
        }
        // ignore は監視対象外（代入しても再描画しない）
        if (key === 'ignore') { obj[key] = value; return true; }
        obj[key] = value;
        // ファクトリオブジェクトに再描画通知コールバックを注入する
        // create_ui_xxx() が返すオブジェクトが s.xxx に代入されたとき、
        // 内部のイベントハンドラから __notify() で再描画をトリガーできるようになる
        // non-enumerable で定義することで Object.keys/entries/JSON.stringify 等に
        // 拾われない（ユーザーデータへの混入を防ぐ）
        _inject_notify(value);
        // 登録済み全インスタンスの schedule_render を叩く
        subscribers.forEach(schedule => schedule());
        return true;
      },
      deleteProperty(obj, key) {
        // ignore の削除は再描画しない
        if (key === 'ignore') { delete obj[key]; return true; }
        delete obj[key];
        // 削除も変更として全インスタンスに通知する
        subscribers.forEach(schedule => schedule());
        return true;
      },
    });
    state_proxy_map.set(raw_state, shared_proxy);
  }
  const shared_proxy = state_proxy_map.get(raw_state);

  // ---------------------------------------------------------------
  // ref の処理（描画後に DOM ノードへの参照を登録する）
  // ---------------------------------------------------------------

  // 描画後に ref が付いたノードを refs_map に再登録する。
  // render ごとに全走査するのはコスト的に許容範囲（典型的には ref 数十個以下）。
  const register_refs_from_element = (target_element) => {
    refs_map.clear();

    const nodes_with_ref = target_element.querySelectorAll('[data-ric-ref]');
    for (const node of nodes_with_ref) {
      const ref_name = node.dataset.ricRef;
      if (ref_name) refs_map.set(ref_name, node);
    }
  };

  // ---------------------------------------------------------------
  // 描画処理
  // ---------------------------------------------------------------

  // next_render() 用の保留 Promise（v0.3.32〜）。
  // 呼ばれるまで作らない（未使用時に Promise ゴミを増やさないため）。
  // do_render の DOM commit 完了直後に resolve → 参照をクリアし、次回呼び出しで新規作成する。
  let pending_render_resolve = null;
  let pending_render_promise = null;

  const do_render = () => {
    if (is_destroyed)  return;
    if (!target_el)    return;
    if (!_render_fn)   return; // render 未設定時はスキップ

    // render_fn を呼び出して JSON ツリーを取得する
    const next_raw_tree = _render_fn(shared_proxy);

    if (prev_tree === null) {
      // 初回描画：DOM を全量構築する。
      // target が SVG 要素 (`<svg>` / `<g>` 等) のとき、生成する子は SVG
      // namespace で作る必要がある。`build_dom_node` の第 2 引数で
      // `target_el.namespaceURI` を引き継ぐ (patch path と同じ canon)。
      // HTML 要素 (XHTML_NS) を引き継いでも createElementNS は等価に動くため、
      // namespace 判別は不要 (常に引き継ぐ)。
      target_el.innerHTML = '';
      const dom_el = build_dom_node(next_raw_tree, target_el.namespaceURI);
      if (dom_el) target_el.appendChild(dom_el);
    } else {
      // 2回目以降：差分更新する
      // ルートノードを単一の子ノードとして扱う
      patch_children([prev_tree], [next_raw_tree], target_el);
    }

    // ref の再登録
    register_refs_from_element(target_el);

    prev_tree = next_raw_tree;

    // DOM commit 完了。next_render() の待機者がいれば resolve して手放す
    // （自然スケジュール／render_now() どちらの完了でもここを通る）。
    if (pending_render_resolve) {
      const resolve = pending_render_resolve;
      pending_render_resolve = null;
      pending_render_promise = null;
      resolve();
    }
  };

  // ---------------------------------------------------------------
  // 描画スケジューラの設定
  // ---------------------------------------------------------------

  const { schedule_render, cancel_pending } = create_render_scheduler(() => {
    if (!is_destroyed) do_render();
  });

  // 購読者リストにこのインスタンスの schedule_render を登録する
  subscribers.add(schedule_render);

  // ---------------------------------------------------------------
  // target 探索と初回描画
  // ---------------------------------------------------------------

  const start_target_search = () => {
    const el = resolve_target_element(target);
    if (el) {
      target_el = el;
      if (_render_fn_provided) do_render(); // render_fn 省略時は初回描画スキップ
      return;
    }

    // target が見つからない場合は 0.5秒間隔でリトライする
    let retry_count = 0;
    const max_retry = 40; // 0.5秒 × 40 = 20秒

    target_search_timer = setInterval(() => {
      if (is_destroyed) {
        clearInterval(target_search_timer);
        target_search_timer = null;
        return;
      }

      const found_el = resolve_target_element(target);
      if (found_el) {
        clearInterval(target_search_timer);
        target_search_timer = null;
        target_el = found_el;
        if (_render_fn_provided) do_render();
        return;
      }

      retry_count++;
      if (retry_count >= max_retry) {
        clearInterval(target_search_timer);
        target_search_timer = null;
        console.error(
          `RicDOM: target "${target}" が見つかりません。20秒待機しましたが検出できませんでした。`,
        );
      }
    }, 500);
  };

  start_target_search();

  // ---------------------------------------------------------------
  // インスタンス固有メソッド
  // ---------------------------------------------------------------

  const instance_destroy = () => {
    // shared state への変更通知を受け取らないよう購読を解除する
    // これをしないと destroy 後も schedule_render が呼ばれ続けメモリリークする
    subscribers.delete(schedule_render);

    // target 探索中のリトライタイマーを止める
    if (target_search_timer !== null) {
      clearInterval(target_search_timer);
      target_search_timer = null;
    }

    // 以降の再描画をすべて無視するフラグを立てる（残留rAFをスキップするため）
    is_destroyed = true;

    // ref の参照をクリアする
    refs_map.clear();
  };

  const instance_force_render = () => {
    // destroy() 後は何もしない（is_destroyed フラグで無視）
    if (is_destroyed) return;
    // schedule_render 経由の rAF / バックストップが保留中なら解除する。
    // これをしないと、この直後の do_render とは別に後追いで run() が発火し
    // 二重描画してしまう（v0.3.36〜）。
    cancel_pending();
    do_render();
  };

  // render_now = 強制・同期（呼んだ瞬間に do_render を叩く）。
  // next_render = 非強制・観測専用（v0.3.32〜）。
  //   「次に完了する render」を待つ Promise を返すだけで、自分からは
  //   render を一切起こさない。自然スケジュール（rAF バッチ）でも
  //   render_now() 強制でも、do_render が完了すればどちらでも resolve する。
  //   state 変化が一度も起きなければ resolve されない（呼び出し側の責任）。
  //   UnizonTool 要望: headless E2E で `el.click(); await handle.next_render();`
  //   として、setTimeout マジックナンバーなしに rAF バッチ経路のまま完了を待ちたい。
  // 複数箇所から同時に await されても、同じ Promise を共有する（1 render で全員 resolve）。
  const instance_next_render = () => {
    if (!pending_render_promise) {
      pending_render_promise = new Promise((resolve) => {
        pending_render_resolve = resolve;
      });
    }
    return pending_render_promise;
  };

  // ---------------------------------------------------------------
  // インスタンスハンドルの生成
  // ---------------------------------------------------------------

  // state へのアクセスは共有Proxy を通しつつ、
  // refs はインスタンス固有にする
  // destroy は内部実装として存在するが、_internal 経由でのみアクセス可能。
  // render_now は v0.3.25〜 正規 API として公開 (handle.render_now())。
  // next_render は v0.3.32〜 正規 API として公開 (handle.next_render())。
  // _internal.force_render は後方互換のため残置。
  const instance_handle = new Proxy(shared_proxy, {
    get(_, key) {
      if (key === 'refs')        return refs_map;
      if (key === 'render_now')  return instance_force_render;
      if (key === 'next_render') return instance_next_render;
      if (key === '_internal')  return { destroy: instance_destroy, force_render: instance_force_render };
      return shared_proxy[key]; // それ以外は共有Proxy に委譲
    },
    set(_, key, value) {
      // render の代入は per-instance で処理する。
      // shared_proxy.render = fn は最初の create_RicDOM のクロージャの _render_fn を
      // 書き換えるため、複数 instance が同じ raw_state を共有するときに
      // handle.render = fn_B が handle.render = fn_A を上書きしてしまう問題があった。
      // instance_handle で受け止めれば、自分の _render_fn クロージャに書ける。
      if (key === 'render' && typeof value === 'function') {
        _render_fn = value;
        if (target_el) do_render();   // 同期描画（shared_proxy.render = fn と同じ挙動）
        else schedule_render();       // target 解決前なら rAF に任せる
        return true;
      }
      shared_proxy[key] = value; // それ以外は共有Proxy 経由 → 全 instance 再描画
      return true;
    },
    deleteProperty(_, key) {
      delete shared_proxy[key]; // 共有Proxy の deleteProperty トラップを経由 → 全員再描画
      return true;
    },
  });

  return instance_handle;
};

// =====================================================================
// エクスポート
// =====================================================================

const version = require('./version');

// CommonJS 形式でエクスポートする（Node.js / Electron 対象）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { create_RicDOM, NOOP_PROXY, version };

  // テスト環境でのみ純粋関数を公開する（NODE_ENV=test のときだけ使える）
  // プロダクションコードからは直接参照しないこと
  if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
    module.exports.__test_exports = {
      convert_style_key_to_camel,
      normalize_style,
      normalize_ric_node,
      is_json_equal,
      collect_duplicate_tags,
      build_serial_key_list,
    };
  }
}

// ブラウザ環境ではグローバルに公開する
if (typeof window !== 'undefined') {
  window.create_RicDOM = create_RicDOM;
  window.NOOP_PROXY    = NOOP_PROXY;
}

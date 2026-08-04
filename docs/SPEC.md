# RicDOM Technical Specification

AI（Claude Code 等）がコーディングする際の詳細仕様書。
人間向けの概要は README.md を参照。

## 公開 API 早見表

すぐに API だけ確認したい場合の一覧。詳細は各節を参照。

### RicDOM コア

| API | 用途 |
|---|---|
| `create_RicDOM(target, state_with_render)` | インスタンス生成・マウント |
| `handle.refs: Map<string, Element>` | `ref: 'name'` 付き要素の DOM 参照 (再描画ごとに rebuild、unmount された ref は自動削除) |
| `handle.render = fn` | render 関数の per-instance 差し替え |
| `handle.render_now()` | 同期的に即時再描画 (v0.3.25〜、要約: rAF を待たずに do_render する) |
| `handle.next_render()` | 次の render 完了で resolve する Promise (非強制・観測専用、v0.3.32〜) |
| VDOM ノードの `key` | リスト reconciliation 用の論理 ID (v0.3.25〜、§DOM 差分アルゴリズム 参照) |
| `RicDOM.version` | バージョン文字列 |

### RicUI（`window.RicUI` / `require('../ric_ui')`）

| カテゴリ | API |
|---|---|
| **layout** | `create_ui_page` / `ui_col` / `ui_row` / `ui_grid` |
| **surface** | `ui_panel` / `create_ui_panel` |
| **control (純関数)** | `ui_button` / `ui_input` / `ui_textarea` / `ui_checkbox` / `ui_radiobutton` / `ui_range` / `ui_color` / `ui_select` / `ui_separator` / `ui_icon` |
| **control (state バインド)** | `bind_input` / `bind_textarea` / `bind_checkbox` / `bind_radiobutton` / `bind_range` / `bind_color` / `bind_select` |
| **control (ヘルパ)** | `focus_when(el, cond)` |
| **text** | `ui_text` / `ui_code_pre` / `ui_md_pre` |
| **popup（ファクトリ）** | `create_ui_popup` / `create_ui_tooltip` / `create_ui_dialog` / `create_ui_toast` |
| **composite（ファクトリ）** | `create_ui_accordion` / `create_ui_splitter` / `create_ui_scroll_pane` / `create_ui_collapse_box` / `create_ui_tweak_panel` |
| **composite (純関数)** | `ui_tabs` / `bind_tabs` / `ui_inline_menu` / `ui_tweak_panel` / `ui_tweak_folder` / `ui_tweak_row` / `tweak_infer_type` |
| **helpers** | `watch_outside_click` |
| **theme util** | `create_theme` / `create_density` / `create_font_size` / `export_theme` / `export_settings` / `make_css_vars` |
| **css util** | `css_for(...names)`（v0.3.34〜、「使う分だけ」CSS を取り出す公式ルート） |
| **meta** | `version` |

全 `ui_*` は rest スプレッド契約（任意 DOM 属性透過）、`create_ui_*` は `s` のトップレベル格納＋`__notify` 自動注入、という共通ルール。詳細は [rest スプレッド契約](#任意属性の透過rest-スプレッド契約) と [Controlled / Uncontrolled パターン](#controlled--uncontrolled-パターン) を参照。

`create_ui_*` を state 外 (module level const 等) に置くと `__notify` が
注入されず、内部イベントから再描画が発火されない silent failure が起きる。
v0.3.8 以降は誤用検知で `console.warn` が一度出る。ただし**警告は「ファクトリが
内部イベントで再描画しようとした瞬間」に出る** (= 初回 render では出ない)。
**controlled ダイアログのように親 state が開閉を駆動するケースは、ファクトリ自身が
`__notify` をほぼ呼ばないため警告が出ないことがある** — 「エラーも警告も無いのに
見た目だけ変」のときは全 `create_ui_*` を `s.xxx = create_ui_xxx()` に置いているか
確認すること。詳しくは [TUTORIAL.md「ありがちな誤用」](TUTORIAL.md#ありがちな誤用--create_ui_-を-state-外に置かない) を参照。

### data-ric-role 属性 (v0.3.8〜)

composite / popup の各内部要素には `data-ric-role` 属性が付与される。
class 名 (`.ric-splitter__divider` 等) は build 時に minify されるが、
`data-ric-role` 属性は minify 対象外で **常に semantic な値が残る**。
consumer 側で CSS カスタマイズや E2E テストの selector として使える契約として
公開している (regression test あり、勝手に削除しない)。

| component | role 値 |
|---|---|
| `create_ui_splitter` | `splitter-side` / `splitter-divider` / `splitter-toggle` / `splitter-main` |
| `create_ui_dialog`   | `dialog-overlay` / `dialog` / `dialog-header` / `dialog-title` / `dialog-close` / `dialog-body` / `dialog-footer` |
| `create_ui_popup`    | `popup-trigger` / `popup-overlay` / `popup-body` |
| `create_ui_toast`    | `toast-container` / `toast-item` / `toast-msg` / `toast-close` |
| `create_ui_tooltip`  | `tooltip-target` / `tooltip` |
| `create_ui_accordion`| `accordion` / `accordion-item` / `accordion-header` / `accordion-title` / `accordion-arrow` / `accordion-body` |
| `ui_tabs`            | `tabs` / `tabs-bar` / `tabs-tab` / `tabs-panel` |
| `create_ui_collapse_box` | `collapse-box` |

使い方の例:

```javascript
// E2E テスト
await page.click('[data-ric-role="dialog-close"]');

// CSS カスタマイズ
[data-ric-role="splitter-divider"] { background: hsl(220 30% 80%); }
```

CSS class (`.ric-xxx__yyy`) も併存しており、内部 minify されているケースで
JS bundle 側で参照する場合は class 経由でも構わない (ただし minify 名は
リリース間で変わる可能性があるため、外部からは `data-ric-role` 推奨)。

---

## 1. アーキテクチャ概要

### 2層構造

| バンドル | 内容 |
|---------|------|
| `RicDOM.min.js` | コア（必須）— Proxy リアクティビティ + JSON→DOM 差分更新 |
| `RicUI.min.js` | UI コンポーネント集（5 テーマ）+ パラメータ調整パネル |

バンドルサイズは README.md を参照。

### JSON の 4 つの層

RicDOM/RicUI を使うアプリは、目的の違う 4 種類の JSON を扱うことがある。
混同を避けるため、各層の責務と相互変換を明示しておく。

```
┌──────────────────────────────────────────────────────────────────┐
│  ❶ アプリ設計 JSON        ・人 (or GUI Designer) が手書きする       │
│  (例: { type: 'ui_button', props: {...}, bind: '...' })          │
│                          ・部品種別 / 位置 / 振る舞いメタの記述      │
│                          ・round-trip 可 / save & load 可          │
└────────────────────────────┬─────────────────────────────────────┘
                             │  ↓ アプリ側で変換ロジックを書く
┌────────────────────────────▼─────────────────────────────────────┐
│  ❷ RicUI 部品の JSON      ・関数呼び出しの戻り値                    │
│  (例: ui_button({ ctx, variant, onclick }))                      │
│                          ・theme / density / variant 等の意味を    │
│                            class 名や CSS 変数に焼き込む            │
└────────────────────────────┬─────────────────────────────────────┘
                             │  ↓ 関数の戻り値として返る
┌────────────────────────────▼─────────────────────────────────────┐
│  ❸ RicDOM JSON (素の VDOM)・{ tag, class, style, ctx, onclick }   │
│                          ・DOM に最も近い形                        │
│                          ・create_RicDOM の render が返す形         │
└────────────────────────────┬─────────────────────────────────────┘
                             │  ↓ ricdom.js の diff エンジンが解釈
┌────────────────────────────▼─────────────────────────────────────┐
│  ❹ 実 DOM                ・document.createElement の結果           │
│                          ・class や data-ric-role は維持される     │
└──────────────────────────────────────────────────────────────────┘

別軸:
┌──────────────────────────────────────────────────────────────────┐
│  ❺ データ JSON           ・アプリの business state                 │
│  (例: { name: '', age: 0 })   ・bind_input(s, 'name') 等で結ぶ     │
│                          ・❶ の bind 指定から空骨格を生成可        │
└──────────────────────────────────────────────────────────────────┘
```

層の役割分担:

| 層 | 誰が書く | 形式 | 例 |
|---|---|---|---|
| ❶ アプリ設計 | 人 / GUI Designer | アプリごとの schema | `{type:'ui_button', props:{text:'保存'}, bind:'name'}` |
| ❷ RicUI 部品 | ライブラリ (関数戻り値) | 統一スキーマ (factory 呼び出し) | `ui_button({ variant:'primary', ctx:['保存'] })` |
| ❸ RicDOM (VDOM) | render の戻り値 | DOM 寄り JSON | `{tag:'button', class:'ric-button', ctx:['保存']}` |
| ❹ 実 DOM | ricdom.js | HTMLElement | `<button class="ric-button">保存</button>` |
| ❺ データ | アプリの state | 任意 | `s.name = '...'` |

ライブラリが**標準化**しているのは ❷❸❹ (RicUI / RicDOM / 実 DOM の対応規則)。
❶ アプリ設計 JSON と ❺ データ JSON は **アプリ側の責務** (アプリごとに自由に
設計してよい)。GUI Designer のようなツールが ❶ ↔ ❷ の変換を担当する場合、
これは「アプリ側ロジック」であってライブラリの公開 API ではない。

bind 指定 (`{ bind: 'customer.name' }` のような string path) を library が
標準化することは意図的に避けている。アプリごとに binding 規約は異なるべき
で、library が決め打つと表現力を狭めてしまう。代わりに RicUI は ❷ レベルで
`bind_input(s, 'name')` のような **state Proxy と関数の組み合わせ** で binding
を提供する。

### ファイル構成

```
src/
  ricdom.js              # RicDOM コア実装
  ricdom_globals.js      # ブラウザ window 公開エントリ
  ricui_globals.js       # RicUI window 公開エントリ
  version.js             # バージョン文字列（package.json から自動生成）

ric_ui/
  index.js               # RicUI 公開 API 入口
  context.js             # テーマ CSS 変数（5テーマ × density × font_size）
  css_registry.js        # CSS クラス収集・ビルドキャッシュ
  css_templates.js       # CSS テンプレート（コンポーネント別）
  style_utils.js         # style プロパティ → cssText 文字列変換ヘルパ
  layout/                # ui_page, ui_col, ui_row, ui_grid
  surface/               # ui_panel, create_ui_panel
  control/               # ui_button, ui_input, bind_input, ui_textarea, bind_textarea, ui_range, bind_range, ui_color, bind_color, ui_separator, focus_when, etc.
  text/                  # ui_text, ui_code_pre, ui_md_pre
  popup/                 # create_ui_popup, create_ui_tooltip, create_ui_dialog, create_ui_toast
  composite/             # create_ui_accordion, create_ui_splitter, create_ui_scroll_pane, create_ui_collapse_box, ui_tabs, bind_tabs, ui_inline_menu, create_ui_tweak_panel, ui_tweak_panel, ui_tweak_folder, ui_tweak_row
  dom_helpers.js         # watch_outside_click
```


---

## 2. RicDOM コア

### create_RicDOM

```javascript
create_RicDOM(target, state_with_render) → instance_handle
```

| 引数 | 型 | 説明 |
|------|---|------|
| `target` | string \| Element | マウント先（CSS セレクタ or DOM 要素）。SVGElement (`<svg>` 等) も可（v0.3.15〜） |
| `state_with_render` | object | 初期 state。`render: (s) => VDOM` を含めると描画関数として使われる |

target が SVG 要素 (`<svg>` / `<g>` 等) の場合、render が返す `path` / `circle` 等は自動的に SVG namespace で生成される（target の `namespaceURI` を引き継ぐ canon、v0.3.15〜）。

`render` は後から `handle.render = fn` でも設定可能（`render` 未指定で作成した場合、最初の代入まで描画は保留される）。`handle.render = fn` の代入は **per-instance**：複数の instance が同じ `raw_state` を共有していても、各 instance は独立した render を持てる。

#### 複数 instance で state を共有する

複数の instance が同じ state を共有したい場合は、同じ state オブジェクトを渡す。各 instance は独自の render を持てる:

```javascript
const state = { counter: 0 };
const a = create_RicDOM('#mount-a', state);
const b = create_RicDOM('#mount-b', state);
a.render = (s) => ({ tag: 'span', ctx: [`A:${s.counter}`] });
b.render = (s) => ({ tag: 'span', ctx: [`B:${s.counter}`] });
state.counter = 7;   // 両 instance が再描画される
```

**戻り値** `instance_handle`:
- state プロパティへのアクセス: `handle.count`, `handle.theme` 等
- `handle.refs`: `Map<string, Element>` — ref で登録した DOM 要素
- `handle._internal.destroy()`: 購読解除、再描画タイマー / target 探索タイマー停止、refs クリア（描画済み DOM や CSS は残す）
- `handle._internal.force_render()`: 同期再描画（非推奨）

**エラー時**: `NOOP_PROXY` を返す（全操作が無害に成功する Proxy）

### Proxy メカニズム

#### 共有 Proxy（state_proxy_map）
同一 `raw_state` に対して1つの共有 Proxy を作成。複数の `create_RicDOM` が同じ state を共有可能。

#### トップレベル set トラップ
```javascript
set(obj, key, value) {
  if (key === 'ignore') { obj[key] = value; return true; } // ignore は再描画しない
  obj[key] = value;
  // __notify コールバックを注入（create_ui_xxx のファクトリ用）
  if (value != null && (typeof value === 'object' || typeof value === 'function')) {
    value.__notify = () => subscribers.forEach(schedule => schedule());
  }
  subscribers.forEach(schedule => schedule()); // 全購読者に再描画通知
  return true;
}
```

※ `render` キーの代入は上記に加えて `_render_fn` の書き換えも行う。ただし shared_proxy の `_render_fn` は最初の `create_RicDOM` 呼び出しのクロージャ変数なので、`handle.render = fn` は **`instance_handle` 側の set トラップ** で per-instance に処理される（各 instance 独自の `_render_fn` を書き換える）。複数 instance で異なる render を持ちたい場合は `handle.render = fn` を使う。

#### 一段目 get トラップ（_wrap_child）
```javascript
get(obj, key) {
  const val = obj[key];
  // ignore / null / プリミティブ / 配列 → そのまま返す
  if (key === 'ignore' || val == null || ...) return val;
  // オブジェクト / 関数 → 子 Proxy でラップ（WeakMap キャッシュ）
  return _wrap_child(val);
}
```

子 Proxy の set トラップ:
- `prop === 'ignore'` → 再描画しない
- それ以外 → `subscribers.forEach(schedule => schedule())` で再描画

#### __notify 注入
`s.xxx = create_ui_xxx()` のように state にファクトリを格納すると、set トラップが `value.__notify` にコールバックを注入。ファクトリ内部のイベントハンドラから `inst.__notify?.()` で再描画をトリガーできる。

### state 更新ルール

```javascript
// ✅ トップレベル代入 → 再描画
s.count = 10;

// ✅ 一段目のプロパティ代入 → 再描画（一段目 Proxy）
s.page.theme = 'dark';
s.dark.density = 'compact';

// ❌ 二段目以降 → 再描画されない
s.user.address.city = 'Tokyo';

// 🔒 ignore → 再描画しない（内部キャッシュ用）
s.ignore.cache = someData;
```

**depth-2+ を再描画したい場合は「一段目を差し替える」のが canon**:

```javascript
// 配列の深い要素を更新
s.pages = [...s.pages.slice(0, i), { ...s.pages[i], width: 200 }, ...s.pages.slice(i+1)];

// オブジェクトの深い key を更新
s.user = { ...s.user, address: { ...s.user.address, city: 'Tokyo' } };
```

immer 風 / proxy 自動深層追跡は **意図的に持たない**。state を flat に保つ・
shallow copy で差し替える、の 2 つのルールで RicDOM の reactive 範囲をカバーする
設計。深い構造が頻発するなら state 設計の見直しサイン (= flat な map に
正規化、`pages_by_id`、`selected_id` 等)。

### state field の型制約

state には **POJO (Plain Old JavaScript Object) のみ** を置く。Proxy が
プロパティアクセスを差し込むため、internal slot に依存する組み込み型は
動作しない（`incompatible receiver` 例外）。

サポートされる型:

- POJO (`{}`)、array (`[]`)
- primitive (string / number / boolean / null / undefined)
- function (factory 系 / `render` 等)

サポートされない型:

- `Map` / `Set` / `WeakMap` / `WeakSet`
  → `TypeError: Map.prototype.has called on incompatible receiver`
- `Date`（read だけなら動くが mutation を Proxy が検出できない）
- `Promise`、各種 typed array、その他 internal slot 依存の組み込み型

```javascript
// ❌ NG
const s = create_RicDOM('#app', { items: new Map() });

// ✅ OK — plain object を key-value store として使う
const s = create_RicDOM('#app', { items: {} });
s.items = { ...s.items, [key]: value };  // 再描画したいときは一段目を新オブジェクトに差し替え
```

「再描画したくない計算結果のキャッシュ」として `Map` を置きたい場合は、
`s.ignore` 配下なら Proxy がかからないので使える:

```javascript
const s = create_RicDOM('#app', { ignore: {} });
s.ignore.cache = new Map();   // Proxy 監視外 → OK
```

### 外部ストア + `render_now()` で明示再描画

Proxy 監視に載せにくい状態 — pdf.js ハンドルや `<canvas>` を抱えた重いオブジェクト、
`Map`/`Set`/`Date`、巨大で深いツリー、高頻度に mutate するため shallow copy 差し替えが
重いもの — は、**リアクティブ state の外**に持ち、変更後に `handle.render_now()` で
明示的に再描画するのが canon。

`handle.render_now()` は **v0.3.25〜の正規公開 API**（`rAF` を待たず同期的に
`do_render` する）。minified 内に見える `handle._internal.force_render()` は
**後方互換のための旧名エイリアス**なので、新規コードは `render_now()` を使う。

```javascript
// 外部ストア (Proxy 監視外: モジュール変数 / s.ignore / 自前ストアのいずれでも)
const store = {
  pdfs: [],            // pdf.js / canvas を持つ重いオブジェクト
  conversation: [],    // 伸び続けるグローバル会話ログ
};

const handle = create_RicDOM('#app', {
  render() {
    return view(store);   // store を読んで描画する
  },
});

function add_pdf(path) {
  store.pdfs.push(open_pdf(path));   // 重いオブジェクトを自由に mutate
  handle.render_now();               // ← 明示再描画 (同期)
}
```

**リアクティブに載せる / 載せないの線引き**:

| | 置き場所 | 再描画 |
|---|---|---|
| 描画に直接効く軽量な値（POJO / array / primitive） | リアクティブ state `s.*` | 代入で**自動**（一段目は新オブジェクト差し替えが canon） |
| Proxy 非対応の組み込み型、重いハンドル、巨大ツリー、高頻度 mutation | **外部**（module 変数 / `s.ignore` / 自前ストア） | `handle.render_now()` で**明示** |

state 駆動を保ちたいなら、リアクティブ state にカウンタを置いて `s.rev = s.rev + 1`
でも再描画は起きる（set トラップ経由）。ただし**外部ストアからの再描画は
`render_now()` の方が直接的**で、「state に意味の無い rev を生やす」必要が無い。
（カウンタ方式は、text ノードの内容だけを差分させたい等の別用途で
`data-rev=${rev}` 属性として使う場面はある。後述「controlled input の prop 再適用」参照。）

### JSON ツリー構造

```javascript
{
  tag: 'div',                           // HTML タグ名
  class: 'my-class',                    // class 属性（文字列 or 配列）
  style: { color: 'red' },              // インラインスタイル（文字列 or オブジェクト or 配列）
  ctx: [ ... ],                         // 子要素（配列 or 単体）
  ref: 'myRef',                         // DOM 参照名（handle.refs で取得）
  onclick: () => { ... },               // イベントハンドラ
}
```

`:hover` / `:active` / `:focus` などの疑似クラスが必要な場合は、RicUI の
CSS テンプレート（`ric_ui/css_templates.js`）か、各要素の直近に置いた
`<style>` VDOM ノードで通常の CSS として書く。

**ctx の不可視な子は自動スキップ**: `ctx` 内の `null` / `undefined` / `false`、
および**空配列 `[]` / 空オブジェクト `{}`** は描画されずスキップされる（React 流）。
そのため条件付きの子要素は `.filter(Boolean)` で間引く必要はない:

```javascript
ctx: [
  always_node,
  cond ? extra_node : null,        // ← false/null/undefined はそのまま書いてよい
  list.map(item => row(item)),     // ← ネストした配列も展開される
]
// .filter(Boolean) は不要（書いても害は無いが冗長）
```

注意: 空オブジェクト `{}` もスキップ対象なので、`{}` を「意味のある空ノード」として
描画したい用途には使えない（`{ tag: 'div' }` のように tag を持たせる）。

**スタイル正規化**:
- 文字列 → `el.style.cssText` に直接設定
- オブジェクト → キーを camelCase に変換
- 配列 → 後勝ちマージ（文字列はスキップ）

**スタイル差分の保証**:
- prev / next が string / object / `undefined` のどの組み合わせでも、
  消えたプロパティは正しく DOM からクリアされる
- 例: prev `style: 'flex:1'` → next `style: {}`（または `style` キー省略）
  でも旧 inline style が DOM に残らない

### DOM 差分アルゴリズム

- **key 属性ベース reconciliation** (v0.3.25〜、後述): 子要素のどれかに `key` があれば論理 ID マッチング
- **Serial Key マッチング** (key 無しのときの fallback): 重複タグにインデックスを付与（`div@0`, `div@1`）
- **Position-based パッチング**: キー属性なし、位置ベースで比較
- **ノード再利用**: 同一 key (or serial key) → DOM ノードを再利用（input フォーカス・IME 状態を保持）
- **is_json_equal**: 高速な深い等値比較（関数は参照比較）

### key 属性によるリスト reconciliation (v0.3.25〜)

子要素 (兄弟 list) のどれかに `key` 属性が付いていれば、`patch_children` は
**key-based reconciliation** を使う:

```javascript
render(s) {
  return { tag: 'ul', ctx: s.items.map((it) => (
    { tag: 'li', key: it.id, ctx: [it.label] }   // key で論理 ID を明示
  ))};
}
```

挙動:

- **同じ key** を持つ prev/next 要素は「同じ論理エンティティ」として DOM ノードを再利用
- 並べ替え (sort) は `insertBefore` で DOM を物理的に移動する (= identity 維持)
- 中央への挿入は既存要素を破棄せず、新規要素だけ create する
- 削除は該当 DOM だけ remove する (残りの要素が前のエンティティを引き継がない)
- `key` 無しの兄弟は「同 tag の prev 先頭から順に消費」する fallback

React / Preact / Vue の `key` prop と同じ canon。リスト並べ替え / 中央挿入 / 削除で
input の focus / value / selection が **隣接エンティティに混ざらない** ことが保証される。

**何故必要か**:

key 無しの position-based では、prev `[A, B, C]` から next `[B, C]` への削除で、
DOM[0] (= A の DOM) が next[0] (= B) として再利用される。次に DOM[0] の input の
value は state.B のものに再適用されるが、focus / scroll / IME 変換中の `<input>` は
A のものが残留する。key 付きなら A の DOM ごと remove されて、B / C の DOM は維持される。

**注意**:

- key の値は `===` 比較できるものなら何でも OK (string / number / Symbol)。
- 兄弟内で **key は unique であるべき**。重複 key は後勝ち (= 最初の prev エントリだけ
  マッチして、残りは新規扱い) になる。React 同様、warn は出さないが意図しない再生成が起きる。
- VDOM 上の `key` と `create_ui_collapse_box({ key })` の `key` パラメータは **別物**。
  前者はリスト reconciliation 用、後者は collapse_box 内部の per-instance state map 用。

### controlled input の prop 再適用 (v0.3.24〜)

`value` / `checked` / `selected` / `scrollTop` / `scrollLeft` は **VDOM の prev=next が
equal でも毎 render で DOM に再代入** される (`FORCE_REAPPLY_DOM_KEYS`)。理由はユーザーが
DOM を直接操作 (checkbox クリック、input 入力、スクロール) して DOM 側が state と乖離
しうるため。state が「真実の source」として常に DOM に再同期される。

これにより以下のパターンが期待通りに動く:

```javascript
render(s) {
  // user が click で checked=false に drift しても、state が true なら次の
  // render で DOM が true に強制復帰する (React / Preact と同じ canon)
  return { tag: 'input', type: 'checkbox', checked: s.checked };
}
```

**注意点**:

- `innerHTML` / `textContent` / `innerText` は **対象外**。これらを毎回再代入すると
  child DOM が全破棄再生成されて性能が壊滅するため。contenteditable + state-controlled
  text の場合は user 側で dummy data attribute (`data-rev=${rev++}`) を入れて diff を
  強制発火させる回避策を使う。
- 構造短絡 (= VDOM tree が prev=next で完全に同じ) の場合も、subtree を walk して
  FORCE_REAPPLY 対象 prop だけは再適用する。<div ref="mount"> の外部マウントパターンは
  `ctx: []` のままなら従来通り保護される (構造変更は走らない)。

### レンダースケジューラ

- `requestAnimationFrame` ベースのバッチング
- 同一フレーム内の複数 state 変更 → 1回の再描画
- `render_scheduled` フラグで重複防止
- **`setTimeout(200ms)` バックストップ併用（v0.3.36〜）**: `requestAnimationFrame`
  は hidden タブ・kiosk の全画面遷移直後・Electron の backgroundThrottling 等で
  発火しないことがある。schedule 時に rAF とバックストップの両方を張り、先に
  発火した方が描画する（フラグガードで他方は no-op）。健常時は rAF が先に
  走り（~16ms）バックストップは `clearTimeout` される＝挙動は従来と変わらない。
  rAF が飛んだ場合もバックストップがフラグを解いて描画するため、再描画が
  永久停止することは構造的に起きない（hidden タブでは `setTimeout` 自体も
  ブラウザに throttle され 1 秒以上になりうるが、いずれ必ず発火してフラグが
  解けることは保証される）。`render_now()` のようにスケジューラを経由せず
  外部から直接描画した場合は、保留中の rAF/バックストップを解除してから
  描画する（二重描画防止）。

`render_now()` と `next_render()` は対になる API（v0.3.32〜）。`render_now()` は
**強制・同期**（呼んだ瞬間に rAF を待たず `do_render` する）。`next_render()` は
**非強制・観測専用**（次に完了する render を待つ Promise を返すだけで、自分からは
render を一切起こさない。自然スケジュール／`render_now()` 強制のどちらの完了でも
resolve する。state 変化が起きなければ resolve されないので、呼び出し側が先に
state を変える責任を持つ）。headless E2E で `el.click()` → `await handle.next_render()`
→ DOM を assert、という流れなら setTimeout マジックナンバーなしに rAF バッチ経路
そのままで完了を待てる（UnizonTool 要望）。

**保証範囲**: resolve するのは `do_render` の **DOM commit 完了直後**
（VDOM 構築 + DOM patch 適用まで）で、browser の layout/paint commit は
保証しない。focus / scroll / `getBoundingClientRect` など layout 確定が
前提の操作には後述の「Operational facts — render flush の 2 rAF ルール」を
使うこと。

**使い分け**: state を変えた直後で render が予約済みと分かっている場面は
`await next_render()`（観測）。「今の state が DOM 反映済みであること」の
保証が欲しいだけで render が予約されているか分からない場面は `render_now()`
（強制・同期。未反映なら反映され、反映済みなら同一ツリーの差分ゼロ描画で
実害はない）。`next_render()` を予約の有無が不明な場面で使うと、予約が
無かった場合に永久に resolve しない。タイムアウトで包む前に `render_now()`
への切り替えを検討すること（Potopeta の flaky テスト決定論化事例より）。

### NOOP_PROXY

エラー時の安全なフォールバック。全ての get/set/apply/delete が自身を返す。
`app.panel.count++` のようなチェーンも安全に失敗する。

---

## 3. RicUI コンポーネント

### 3 パターン

| パターン | 内部状態 | 用途 |
|---------|:-------:|------|
| `ui_xxx({ props })` | なし | 純粋な描画（ボタン、テキスト等） |
| `bind_xxx(s, key, opts)` | なし | `ui_xxx` + state 双方向バインドのショートカット |
| `create_ui_xxx(opts?)` | **あり** | 開閉・テーマ・位置等の内部状態を持つ部品 |

`create_ui_xxx()` の戻り値は `s` のトップレベルに格納:
```javascript
s.page = create_ui_page({ theme: 'teal' });
s.dd   = create_ui_popup();
```

### テーマシステム

5 テーマ × 3 密度 × 3 フォントサイズ:

| テーマ | 特徴 |
|--------|------|
| `light` | 明るい背景、青アクセント |
| `dark` | 暗い背景、明るい青アクセント |
| `teal` | グラデーション背景、ティール/緑アクセント |
| `cyber` | グラスモーフィズム、ネオンシアン、角丸なし（radius: 0px） |
| `aqua` | グラスモーフィズム、水滴/ブルー、大角丸、スプリングアニメーション |

密度: `comfortable` / `compact` / `tight`
フォントサイズ: `sm` / `md` / `lg`

### CSS 変数

#### カラー変数（テーマ別）

| 変数 | light | dark | teal | cyber | aqua |
|------|-------|------|------|-------|---------|
| `--ric-color-fg` | #111827 | #e5e7eb | #0d2b24 | #e2e8f0 | #1a2c3c |
| `--ric-color-fg-muted` | #6b7280 | #9ca3af | #46605a | #7aa8c8 | #5c7a8a |
| `--ric-color-bg` | #f9fafb | #0f1115 | gradient | gradient | gradient |
| `--ric-color-control` | #ffffff | #1a1d24 | rgba白0.9 | rgba暗0.6 | rgba白0.5 |
| `--ric-color-border` | #e5e7eb | #2a2f3a | #c5ddd8 | rgba青0.65 | rgba青0.35 |
| `--ric-color-accent` | #2563eb | #60a5fa | #007f6d | #38bdf8 | #0284c7 |
| `--ric-color-accent-fg` | #ffffff | #0f1115 | #ffffff | #04070f | #ffffff |

teal/cyber/aqua は `--ric-color-bg` にグラデーションを使用。
input/select/button は `--ric-color-control` を使い単色（グラデーション回避）。

#### 密度変数

| 変数 | comfortable | compact | tight |
|------|------------|---------|-------|
| `--ric-gap` | 6px | 4px | 1px |
| `--ric-gap-md` | gap * 2（自動導出） | gap * 2（自動導出） | gap * 2（自動導出） |
| `--ric-pad-x` | 14px | 10px | 6px |
| `--ric-pad-y` | 8px | 4px | 1px |
| `--ric-control-h` | 36px | 28px | 22px |

`--ric-radius` は密度ではなくテーマごとに定義: light/dark/teal: 8px、cyber: 0px、aqua: 20px。

#### フォントサイズ変数

| 変数 | sm | md | lg |
|------|-----|-----|-----|
| `--ric-font-size` | 12px | 14px | 16px |

各コンポーネントは em 相対値で自動スケール（0.85em / 1em / 1.25em）。

### Layout

#### create_ui_page(initial?)

```javascript
s.page = create_ui_page({ theme: 'teal', density: 'comfortable', font_size: 'md' });
return s.page({ style: { /* ... */ }, ctx: [...] });

s.page.theme = 'dark';     // 動的変更 → 再描画
s.page.density = 'compact';
```

プロパティ: `theme`, `density`, `font_size`

内部動作:
- CSS 変数をインラインスタイルに注入
- ポータルキューを drain して ctx 末尾に展開
- 使用 CSS クラスを走査して動的 `<style>` タグ生成
- window の `'ric-theme-change'` イベントを listen して自身の設定を自動同期（nav_bar 等の外部から一斉にテーマを変更できる）

> **v0.3.35〜**: `s.page = create_ui_page(...)` のように state のトップレベルに
> 置かず、module scope の `const` 等に置いて呼び出した場合、初回 render 時点で
> `console.warn` する（instance あたり 1 回のみ、throw はしない）。
> テーマ切替 UI を持たない kiosk アプリ等では `'ric-theme-change'` が一度も
> 発火しないため、上記の window リスナー経由の警告機構だけでは検知できない
> silent failure だった穴を埋める。

##### スタイルスコープ（重要 — 「ページ外で無装飾」を避ける）

**RicUI コンポーネントは必ず `create_ui_page` の中で描く。** 理由は上記の内部動作で、
`create_ui_page` が「そのツリーで使われた `ric-*` クラスだけ」を集めて `<style>` を
注入する(セレクタは定数 `.ric-page ...` スコープ)。逆に言うと:

- **`create_ui_page` を通らない別マウント / モーダル / ポータルに RicUI 部品を描くと、
  その部品の CSS 規則がどこにも注入されず「無装飾(ブラウザ既定のフォーム部品)」になる。**
  色(CSS 変数)は親から継承されても、構造 CSS が当たらないので「色は出るが裸」という
  分かりにくい状態になる。
- 対策は **そのサブツリーも `create_ui_page` で包む**こと(別インスタンスでも可。
  theme 違いも共存できる — テーマ変数は `:root` ではなく各 `.ric-page` 要素に載るので、
  複数ページが別テーマを持っても衝突しない)。
- モーダル/ダイアログは **`create_ui_dialog` を使う**(overlay / Esc / 背景クリック閉じ /
  `.ric-page` スコープを内蔵。手組み不要)。
- 素の div に `class="ric-page"` を付けるだけでは**当てにならない**(その部品の規則を
  どこかの `create_ui_page` が既に集めていない限り規則自体が存在しない)。確実なのは
  `create_ui_page` で包むこと。**v0.3.34〜 は `css_for()` で規則を自分で置けば、
  素の `ric-page` + `make_css_vars` で page なしの styled mount が公式にできる**
  (詳細は [css_for / make_css_vars](#css_for--make_css_vars-v0334) 参照):
  ```javascript
  // page なしで styled にマウントする 3 点セット
  { tag: 'div', class: 'ric-page', style: make_css_vars({ theme: 'dark' }), ctx: [
    { tag: 'style', ctx: [css_for('ric-button')] },
    ui_button({ ctx: ['OK'] }),
  ]}
  ```

> ⚠️ **無装飾は「見た目だけ・無言」で壊れる**(エラーも警告も出ない)。「要素が存在する /
> クリックできる」系の E2E テストは**通ってしまう**。特に画面を直接見られない AI
> エージェントは見落としやすい。**スタイル崩れは E2E でスクリーンショットを撮って
> 視覚的に確認すること**(DOM 存在チェックだけでは無装飾を捕まえられない)。

注: 注入される `<style>` は実行時に DOM 挿入されるため、外部 `<link>` より後になり、
**同じ詳細度なら RicUI 側が勝つ**。RicUI の規則は `.ric-page .ric-button` =
詳細度 (0,2,0)。独自 CSS で上書きする場合は詳細度 3 以上
(例: `.ric-page .ric-button.my-active`) にするか、inline style を使う。

例:
- `.ric-page .ric-button`(0,2,0)を上書きするなら `.your-app .your-button.is-active`
  のように詳細度 3 以上にするか、`ric_ui/css_templates.js` に一覧がある通り
  ほぼ全コンポーネントが `.ric-page .ric-xxx`(0,2,0)基準なので同じ考え方で足りる。
  `:hover` 等の状態修飾がある規則は擬似クラス分でさらに 1 段(0,3,0)高くなる。
- 一番簡単で確実なのは `style={{...}}` の inline style で上書きすること
  (詳細度を気にせず常に勝つ)。

#### ui_col / ui_row

```javascript
ui_col({ ctx: [...], style: {} })  // flex-direction: column
ui_row({ ctx: [...], style: {} })  // flex-direction: row, align-items: center
```

#### ui_grid

CSS grid を簡潔に書くための layout コンポーネント。

```javascript
// 数値: '1fr 1fr ...' (n 個) に展開
ui_grid({ columns: 3, ctx: [a, b, c, d, e, f] })

// 文字列: そのまま grid-template-columns に渡す
ui_grid({ columns: '120px 1fr', rows: '80px auto', ctx: [...] })

// 'auto-fit / auto-fill SIZE' は repeat(auto-fit, minmax(SIZE, 1fr)) の省略形
ui_grid({ columns: 'auto-fit 200px', ctx: cards })

// gap: 数値で px / 文字列でそのまま
ui_grid({ columns: 2, gap: 12, ctx: [...] })          // 12px
ui_grid({ columns: 2, gap: '8px 16px', ctx: [...] })  // row-gap col-gap
```

プロパティ: `columns` / `rows` / `gap` / `style` / `ctx`、および任意 DOM 属性
(rest スプレッド契約)。gap 省略時は `--ric-gap-md` から自動取得。

#### css_for / make_css_vars (v0.3.34〜)

「使う分だけ」哲学の CSS 版。`create_ui_page` は内部で「ツリー内の使用 `ric-*`
クラスを集めて `<style>` を注入する」処理をしているが、これを**公開関数として直接
呼べる**ようにしたもの。`create_ui_page` で包めない/包みたくない mount
(別 iframe、外部ウィジェットホスト、既存アプリへの部分導入等) に、規則を自分の
`<style>` として置く公式ルート。

```javascript
const { css_for, make_css_vars, ui_button } = require('ricdom/ric_ui'); // または window.RicUI

// page なしで styled にマウントする 3 点セット
{ tag: 'div', class: 'ric-page', style: make_css_vars({ theme: 'dark' }), ctx: [
  { tag: 'style', ctx: [css_for('ric-button')] },
  ui_button({ ctx: ['OK'] }),
]}
```

- `css_for(...names)`: 指定したテンプレート名 (`'ric-button'` 等、`ric_ui/css_templates.js`
  の `CSS_TEMPLATES` キー) の CSS を連結して返す。`create_ui_page` が注入するものと
  **同一のルール**(`.ric-page ` プレフィックス込み、同じ `build_css` キャッシュを共有)。
- 引数を省略すると **全テンプレート**の CSS を返す(全部入り。公式に許可)。
- 未知のキー(タイポ等)は `console.warn` を出してスキップする(typo 検出。例外は投げない)。
- CSS_TEMPLATES の規則はセレクタが `.ric-page ` スコープなので、**wrapper 側にも
  `class: 'ric-page'` が必要**。テーマ変数は `make_css_vars` が呼び出した要素の
  `style` に直接載る(`:root` は使わないので、既存ページの他の `.ric-page` と
  衝突しない)。
- `make_css_vars({ theme, density, font_size })` は元々 `create_ui_page` /
  `create_ui_panel` の内部関数だったが、v0.3.34 で公開 export に追加(挙動は不変)。

> ⚠️ **portal 系 (popup / tooltip / dialog / toast) は css_for 島では使えない**。
> `create_ui_popup` / `create_ui_tooltip` / `create_ui_dialog` / `create_ui_toast` は
> 開くと VDOM をモジュールレベルの `_page_portal_queue` に `push` するだけで、
> **`create_ui_page` の render が `drain()` して自分の ctx 末尾に展開する**まで
> どこにも現れない。そのため css_for 島(素の `ric-page` div、`create_ui_page` を
> 経由しない)にポータル系部品を置くと、(a) 文書内に `create_ui_page` が 1 つも
> render していなければ queue に溜まったまま **永遠に表示されない**、(b) 別の場所に
> `create_ui_page` があればそこに drain されて **意図しない親の直下に出る**。
> portal が必要な場面は `create_ui_page` で包むこと。css_for 島に置けるのは
> **非 portal 部品**(`ui_button` / `ui_input` / `ui_panel` / `ui_text` / `ui_icon` /
> `ui_radiobutton` 等)に限る。

> **v0.3.38〜: 上記 (a) は console.warn で検知される**。`_page_portal_queue` は
> 初回 `push` から drain が一度も走らないまま既定 1000ms が経つと、1 回だけ
> `[RicUI] ... drain されていません ...` を console.warn する
> (`create_ui_page` の render で同一サイクル内に drain される正常系では発火しない)。
> throw はしない。(b) の「意図しない親の直下に出る」パターンは drain 自体は
> 起きているため対象外(検知不能、設計上の別問題)。

### Surface

#### ui_panel / create_ui_panel

```javascript
// ステートレス（静的コンテナ）
ui_panel({ ctx: [...], layout: 'col', theme: 'dark', disabled: true })

// ファクトリ（動的設定変更）
s.dark = create_ui_panel({ theme: 'dark' });
s.dark.disabled = true;
s.dark({ ctx: [...] })
```

プロパティ: `theme`, `density`, `font_size`, `disabled`, `layout`
`disabled: true` → `inert` 属性 + `opacity: 0.45`（Tab フォーカス・クリック・選択を遮断）

### 任意属性の透過（rest スプレッド契約）

すべての `ui_xxx` コンポーネント（layout / surface / control / text）は、
明示引数にない props を **rest スプレッド**で受け取り、**外側要素**（wrapper）
にそのまま透過する。これにより `onclick` / `id` / `data-*` / `aria-*` /
`style` / `class` 等の任意の DOM 属性を自由に付与できる。

```javascript
ui_button({ ctx: ['Save'], onclick: save, id: 'btn-save', 'data-role': 'primary' })
ui_panel({ ctx: [...], id: 'main', onmouseenter: hover })
ui_input({ id: 'name', onchange: handle, 'aria-label': 'Full name' })
```

**class の連結**: `class` を渡しても基底クラス（`ric-button` 等）は保たれ、
その後ろにユーザ指定 class が連結される。

```javascript
ui_button({ class: 'my-btn' }).class      // → "ric-button my-btn"
ui_panel({ class: 'card', layout: 'row' }) // → "ric-panel ric-panel--row card"
```

**計算済みフィールドは上書き不可**: `tag` / `class` / `ctx` などコンポーネントの
責務で決まるフィールドは rest から上書きできない（計算済みの値が必ず勝つ）。

**隔離契約（内部 input を持つコンポーネント）**: `ui_checkbox` / `ui_radiobutton` /
`ui_range` / `ui_color` は内部に `<input>` を持つが、そこに掛けるべき
`checked` / `value` / `onchange` / `oninput` は**内部 input に限定**され、
外側 wrapper 要素には漏れない。これはテストで保証される契約である。

```javascript
const n = ui_checkbox({ onchange: fn });
n.onchange           // → undefined（label wrapper には付かない）
n.ctx[0].onchange    // → fn（内部 input にのみ付く）
```

**実装ルール**（コンポーネント作者向け）: 戻り値の object リテラルでは
`...rest` を**先頭**に置き、計算済みフィールドを後から列挙する。これにより
rest 経由で tag や class を渡されても計算済みの値で上書きされる。

```javascript
return {
  ...rest,                                                     // 先頭
  tag: 'button',
  class: rest.class ? cls_base + ' ' + rest.class : cls_base,
  ...(onclick ? { onclick } : {}),
  ctx,
};
```

`...rest` を末尾に置くと `class` キーが rest の値で上書きされ、基底クラスが
消える（リグレッションあり、`ui_button` / `ui_input` v0.3.1 まで存在）。

### CSS conflict — `:active` で `transform` を使わない (v0.3.17〜)

`ui_button` / `ui_button--primary` / `ui_checkbox` の押下フィードバック
(`:active` 時の 1px 沈み) は、`transform` プロパティ**ではなく** CSS
Transforms Level 2 の独立した **`translate` プロパティ**で実装されている。

```css
/* library 側 */
.ric-button:active:not(:disabled) {
  translate: 0 1px;       /* ← transform: translateY(1px) ではない */
  filter: brightness(0.85);
}
```

これは「**consumer が `.ric-button` に `transform` を当てる場合、library 側の
`:active` で上書きされない**」ことを保証するための契約。`transform` は単一値
プロパティなので、library が `transform: translateY(1px)` を書いていると、
以下のような consumer 側コードが押下時に壊れる:

```css
/* consumer 側 — absolute 配置の中央寄せ */
.tree-row-dots {
  position: absolute;
  right: 4px; top: 50%;
  transform: translateY(-50%);   /* ← library の :active で消えていた (v0.3.16 まで) */
}
```

v0.3.17〜 は library が `transform` ではなく `translate` を使うので、上記の
ような consumer の `transform` は **何の追加 CSS も書かずに保たれる**。
`transform` と `translate` は composable に動く (両方適用される)。

**ブラウザサポート**: Chrome 104+ / Edge 104+ / Safari 14.1+ / Firefox 72+。
RicDOM の推奨環境 (Chrome 135+ / Electron 35+) では問題なし。

**他の単一値 CSS プロパティとの conflict について**:

- **`filter`** — library は `:active` / `:hover` / `:disabled` で `filter:
  brightness(...)` を使う。consumer が `filter` を併用するケースは稀だが、
  使う場合は consumer 側 CSS の specificity を上げて `:active` を override
  すること (`.my-btn:active { filter: blur(2px) brightness(0.85); }` のように
  自分で chain を組む)。`translate` 同様の仕組みは CSS にない。
- **`box-shadow`** — `.ric-input:focus` 等で focus ring に使われる。
  `box-shadow` は **コンマ区切りで多値**を許すが、`:focus` 時の宣言が
  consumer のベース shadow を「ルールごと」置き換えるので、focus 時に
  自分の shadow を残したい場合は consumer 側で focus 時のルールも書く
  必要がある (`.my-input:focus { box-shadow: 0 2px 4px ..., 0 0 0 3px ...; }`)。

### Control

| 関数 | 説明 |
|------|------|
| `ui_button({ ctx, variant, size, onclick, disabled })` | variant: `default` / `primary` / `ghost` / `link`。size: `undefined`（density 委譲、既定）/ `sm` / `md` / `lg` |
| `ui_input({ value, oninput, placeholder, type, disabled })` | テキスト入力 |
| `bind_input(s, key, options)` | `s[key]` と双方向バインド |
| `ui_textarea({ value, oninput, rows, auto_resize })` | 複数行入力。`auto_resize: { min_rows, max_rows }` で高さ自動調整 |
| `bind_textarea(s, key, options)` | `s[key]` と双方向バインド |
| `focus_when(el, cond)` | 条件の立ち上がりエッジで `el.focus()`。`el` は `handle.refs.get('name')` 等（`render(s)` の `s` は state Proxy で `refs` を持たないため、`create_RicDOM` の戻り値 `handle` を closure 経由で参照する） |
| `ui_checkbox({ checked, onchange, ctx, disabled })` | checked は 0/1（数値） |
| `bind_checkbox(s, key, options)` | `s[key]` と双方向バインド |
| `ui_radiobutton({ name, value, options, onchange })` | options: string[] or {value,label}[]。label は文字列/数値のほか VDOM ノード・配列も可（ui_icon を混ぜられる）。opt の追加キー（title / data-* / id / class 等）は各選択肢の `<label>` に転送される（v0.3.32〜） |
| `bind_radiobutton(s, key, options)` | `s[key]` と双方向バインド |
| `ui_range({ value, min, max, step, oninput, disabled })` | スライダー + 値表示 |
| `bind_range(s, key, options)` | `s[key]` と双方向バインド |
| `ui_color({ value, oninput, disabled })` | カラーピッカー（hex/rgba 自動判定） |
| `bind_color(s, key, options)` | `s[key]` と双方向バインド |
| `ui_separator()` | 水平区切り線 |
| `ui_icon(descriptor, { size, label, spin, strokeWidth, class })` | SVG アイコン (descriptor → SVG VDOM)。後述 |
| `ui_select({ value, options, onchange, disabled, placeholder })` | `appearance: base-select`（Chrome 135+）。option はネイティブ `<select>` のため**テキストのみ**（SVG/アイコン不可）。アイコン入りの選択肢が要るなら `create_ui_popup` を使う |
| `bind_select(s, key, options)` | `s[key]` と双方向バインド |

#### ui_icon (v0.3.28〜)

アイコンを「データ (JSON descriptor)」として扱い、SVG VDOM に変換する純関数。
RicUI 本体にはアイコンデータを**含めない**。アイコンピッカー
(`docs/icon_playground.html`、別途) で「使う分だけ」`const ICONS = {...}` を
コピーして自分の app に置く設計。これにより RicUI バンドルは太らない。

```javascript
const ICONS = {
  check: { p: 'M20 6 9 17l-5-5' },          // s 省略 → stroke 2 (線画。最頻)
  heart: { s: null, p: 'M12 21 ...' },      // s:null → fill (塗り。solid 系)
  menu:  { p: ['M4 6h16', 'M4 12h16', 'M4 18h16'] },  // 複数 path
};

ui_icon(ICONS.check, { size: 20, label: '完了' })   // label → role=img+aria-label
ui_icon(ICONS.check, { size: 16 })                   // label 省略 → aria-hidden
ui_icon(ICONS.loader, { spin: true })                // 回転 (spinner)
ui_button({ ctx: [ui_icon(ICONS.save), '保存'] })    // ボタン内 (gap で自動整列)
```

- **descriptor**: `{ v?, s?, p }` — `v`=viewBox(既定 `0 0 24 24`)、`s`=stroke-width。
  **stroke がデフォルト**(省略=2 / 数値=その太さ / `null`=fill モード)。`p`=path の
  `d` 文字列 or 配列。
- **色**: `currentColor` 固定。CSS の `color` でテーマに追従する。**単色しか出せない
  わけではなく**、状態色(稼働中の緑ドット等)はアイコンだけ別色にしたいので、
  **wrapper の `color` で上書き**する:
  ```javascript
  { tag: 'span', style: { color: '#22c55e' },
    ctx: [ui_icon(ICONS.circle_dot, { size: 10 })] }   // 緑の状態ドット
  ```
- **size**: **数値は px 換算**(`14` → `width/height: 14px`)、**CSS 文字列はそのまま**
  (`'1.25rem'` / `'1em'` 等)。既定 `'1em'`(= 親 font-size 追従)。
- **label**: 指定で `role="img"` + `aria-label`、省略で `aria-hidden="true"`
  (隣にテキストがある装飾アイコンの二重読み上げを防ぐ)。
- **spin**: `true` で回転(spinner 用)。クラス `ric-icon--spin` が付き、
  `@keyframes ric-spin`(グローバル定義、create_ui_page が注入)で回る。
  keyframe / クラス名は公開契約なので、**`prefers-reduced-motion` で止める**等の
  上書きを consumer 側で書ける:
  ```css
  @media (prefers-reduced-motion: reduce) {
    .ric-icon--spin { animation: none; }
  }
  ```
- **strokeWidth**: `descriptor.s` の上書き(16px で線が太い時など)。
- ボタン内に置くと `ric-button` の `gap` で自動的にテキストと横並び・中央揃え。
- **生 RicDOM(`create_ui_page` 不使用)で使う場合**(v0.3.29〜): `size` /
  `vertical-align`(テキスト隣接時のベースライン整列)/ `flex-shrink: 0`
  (flex 内で潰れない)は **inline style** なのでクラス無しでも効く。
  `icon('save') + ' 保存'` のような「アイコン + テキスト」もそのまま揃う。
  必要なら `opts.style.verticalAlign` / `flexShrink` で上書き可。
  一方 `spin` の `@keyframes ric-spin` だけは `.ric-icon` CSS(= `create_ui_page`
  が注入)側にあるため、生 RicDOM で回転させたい場合は `create_ui_page` を使うか
  consumer 側で keyframes を用意する。
- アイコンを**単体で flex/中央配置**する場合、既定の `vertical-align: -0.125em`
  (テキスト併記用)がズレとして見えることがある。調整は
  `ui_icon(d, { style: { verticalAlign: 'middle' } })` — **inline style なので
  CSS からの上書きには `!important` が必要になる。opts.style 経由を推奨**。
- **descriptor は `<path>` 専用**(ui_icon を小さく保つため `<circle>` / `<rect>`
  生成は持たない)。ただし**手で円弧 path に変換する必要はない**:
  `docs/icons/svg_to_descriptor.js` が `<line>` / `<polyline>` / `<polygon>` /
  `<rect>`(rx 角丸含む)/ `<circle>` / `<ellipse>` を**漏れなく path 化**する
  (settings の歯車 + 中心 circle のような混在も出現順を保って変換)。
  **アイコンピッカーの Lucide タブは内部でこの変換器を通す**ので、ピッカー出力は
  常に path 化済み。circle/rect を含むアイコンも**ピッカー/変換器を通せば手作業ゼロ**。
  (= 生 SVG を手でコピーして円弧 path を自前で書く、は不要。)
- **viewBox は `0 0 24 24` 系で統一**。同梱 35 個も Lucide も全て 24 系。`v` で
  別 viewBox も指定できるが、**24 以外を混ぜると stroke-width の見た目がズレる**
  (線の太さは viewBox 座標系に対する相対値のため)。自前 SVG を `svg_to_descriptor`
  で取り込む場合も 24 系に揃えるのが安全。

##### プログラム / AI / CI からの利用 (ピッカー不要)

アイコンピッカー (`icon_playground.html`) は**人間向けの GUI**。CLI / CI / ヘッドレスな
AI エージェントは、GUI を開かず以下で完結できる(「アイコン = データ」の副次効果):

- **`npx ricdom-icon <name...>`** — 名前 → descriptor を **stdout** に出す CLI
  (ピッカーのヘッドレス版)。同梱はオフライン即返し、Lucide は取得して `svg_to_descriptor`
  で path 化する(circle/rect も自動変換)。**「記憶から path を手書きして壊す」事故を
  構造的に防ぐ**のが主目的。
  ```bash
  npx ricdom-icon settings refresh-cw chat     # 貼れる const ICONS = {...} (ISC 帰属込み)
  npx ricdom-icon settings --json              # 素の descriptor だけ ({ name: {...} })
  npx ricdom-icon --search gear                # 名前候補 (同梱 + Lucide)
  npx ricdom-icon --names                      # 同梱の名前一覧
  ```
  ログ/警告は stderr、descriptor は stdout(`>> icons.js` や `$(...)` で受けられる)。
- **同梱 35 個**を読むだけなら `docs/icons/icons.json`(`{ _meta, icons }`)を直接読む。
- **任意の SVG → descriptor** は `require('.../docs/icons/svg_to_descriptor')`(UMD、Node 可)。

> ⚠️ **AI エージェントへ**: descriptor の `p`(path)を**記憶から手書きしないこと**。
> 「それっぽく見えるが sub-path が欠落して壊れている」アイコンが静かに出荷される
> 実例があります(consumer の `settings` が中心円を欠いたまま出荷された等)。
> 必ず `npx ricdom-icon <name>` か `svg_to_descriptor` を経由してください。
> **どうしても手書きが避けられない状況なら、まずユーザー(人間)に確認して許可を得てから**
> 行ってください。

### Text

```javascript
ui_text({ ctx: ['本文'], variant: 'default' })   // <span> font-md
ui_text({ variant: 'muted', ctx: ['補助'] })      // <span> font-sm, fg-muted
ui_text({ variant: 'title', ctx: ['見出し'] })     // <h2> font-lg, bold
ui_text({ variant: 'label', ctx: ['ラベル'] })     // <label> font-sm, semi-bold

ui_code_pre({ obj: data })                         // JSON.stringify + hljs ハイライト
ui_code_pre({ ctx: [code], lang: 'javascript' })   // コード表示

ui_md_pre({ ctx: ['# 見出し\n\nテキスト'] })       // Markdown → VDOM 変換
```

#### ui_md_pre

Markdown テキストを VDOM ノードに変換する簡易パーサー。外部ライブラリ不要。
完全な CommonMark 準拠ではなく、ヘルプ画面・チュートリアル表示用の実用サブセット。

| Props | 型 | 説明 |
|-------|------|------|
| `ctx` | `string[]` | Markdown テキスト（複数渡すと連結） |
| `transform_text` | `(str) => (vnode\|string)[] \| string` | 任意（v0.3.38〜）。プロセ（通常テキスト）のテキストノードにだけ適用し、戻り値で置換する |

##### transform_text (v0.3.38〜)

プロセ（通常テキスト）を独自の vnode に変換したいときのフック。用途例: 資産 ID
（`ast_xxx` 等）の自動リンク化。

```javascript
ui_md_pre({
  ctx: ['資産 ast_abc123 を参照'],
  transform_text: (str) => str.split(/(ast_[a-z0-9]+)/).map(
    (part) => /^ast_/.test(part)
      ? { tag: 'a', href: `/assets/${part}`, ctx: [part] }
      : part,
  ),
})
```

FACT:

- **コードブロック（フェンス ` ``` `）とインラインコード（`` `code` ``）には適用されない**
  （リテラル性を守るため）。見出し / 段落 / リスト項目 / 引用 / テーブルセル / 太字・斜体の
  中のプロセには適用される（`_parse_inline` の再帰経由）。
- 例外を投げた場合は `console.error` を出し、元のテキストのまま表示する
  （NOOP フォールバック、throw しない）。
- 戻り値の vnode に対して `transform_text` が再帰適用されることはない
  （無限ループ対策、1 パスのみ消費）。
- 未指定時は従来の挙動と完全に一致する（挙動を変えない後方互換オプション）。

##### 対応構文

| 記法 | 出力 | 備考 |
|------|------|------|
| `# 〜 ######` | `<h1>` 〜 `<h6>` | 行頭のみ |
| `**太字**` | `<strong>` | インライン |
| `*斜体*` | `<em>` | インライン |
| `` `code` `` | `<code>` | インラインコード |
| ` ```lang ... ``` ` | `<pre><code>` | hljs があれば自動シンタックスハイライト |
| `- item` | `<ul><li>` | ネスト非対応 |
| `> quote` | `<blockquote>` | 単一行 |
| `[text](url)` | `<a>` | `target="_blank" rel="noopener"` 自動付与 |
| `\| a \| b \|` | `<table>` | ヘッダ + `\|---:\|`/`:---\|` でアライメント |
| `---` | `<hr>` | 単独行 |
| 空行 | 段落区切り |  |

##### 非対応

`![img]()` 画像、`> ` 連続引用のネスト、`- ` リストのネスト、`~~取消線~~`、HTML タグ直書き、参照リンク `[text][id]`、checkbox リスト `- [ ]`。

##### サニタイズ

ユーザー入力を表示する場合は呼び出し側で sanitize すること。`ui_md_pre` は HTML 直書きを `<` `>` のままパススルーしないが、`href` / `src` のスキーム検査は行わない（`javascript:` など）。信頼できないソースを表示する用途では追加のフィルタを推奨。

### Popup

全て引数なし。popup の排他制御（1つ開くと他が閉じる）はモジュールレベルで自動管理。

**ポータルテーマ上書き**: 全 Popup 系コンポーネント（popup / tooltip / dialog / toast）は
呼び出し時に `theme` / `density` / `font_size` を指定でき、ポータル要素のテーマを
`create_ui_page` とは独立に上書きできる。省略時は page のテーマを継承する。

```javascript
s.dlg({ ..., theme: 'dark', density: 'compact' })  // ダイアログだけ dark テーマ
```

#### create_ui_popup()

```javascript
s.dd = create_ui_popup();

// ラベルモード（ボタン幅に合わせる）
s.dd({ label: '選択肢', ctx: [...] })

// アイコンモード（160px min-width、左右スマート配置）
s.menu({ icon: '≡', ctx: [...] })

// ghost（ホバーまで枠を隠す）
s.cfg({ icon: '⚙', ghost: true, ctx: [...] })

// chevron: true — ラベルモードに開閉インジケータ（▼）を付与（v0.3.28〜）
// 開いている間は CSS で 180° 回転する（ドロップダウンの affordance）。icon モードでは無視。
s.dd({ label: '選択肢', chevron: true, ctx: [...] })

// icon は文字列だけでなく VDOM（ui_icon）も受け付ける
s.cfg({ icon: ui_icon(ICONS.settings, { size: 18 }), ctx: [...] })
```

**アイコン入りセレクト（`ui_select` の代替）**: ネイティブ `<select>` の option は
テキストのみ（アイコン不可）。プロバイダ/モデル一覧などで選択肢にアイコンを出したい
場合は `create_ui_popup` で「選択中ラベル + 選択肢ボタン」を組む:

```javascript
s.model_dd = create_ui_popup();
// 選択中をラベルに、選択肢を ctx のボタン群に（各ボタンに ui_icon を入れられる）
s.model_dd({ label: current.name, chevron: true, ctx: MODELS.map((m) =>
  ui_button({ variant: m.id === current.id ? 'primary' : 'ghost',
    ctx: [ui_icon(m.icon, { size: 16 }), m.name],
    onclick: () => { s.model = m.id; s.model_dd.close(); } })),
})
```

内部状態: `_o`(open), `_c`(closing), `_d`(dir), `_p`(pos), `_m`(measuring, v0.3.27〜), `_eb`(esc_bound, v0.3.27〜)
メソッド: `inst.close()` — 即座に閉じる（アニメーションなし。排他制御から呼ばれる）。
v0.3.27〜 は `safe_notify` を発火する（dialog.close() と挙動を揃え、multi-instance での portal 残留を防ぐ）。

**開き方向 (above/below) の決定 (v0.3.27〜)**:

ポップアップを開く際、本体が trigger の下に収まるかで `above` / `below` を決める。
v0.3.26 までは `ctx.length × 38px` で高さを見積もっていたが、`ctx` をラッパー要素で
包むと「論理項目数」と「トップレベルノード数」がズレて方向判定が破綻した。

v0.3.27〜 は **実 DOM を測る 2 段階方式**:

1. trigger クリックで、暫定方向のまま `visibility: hidden` で本体を描画する（`_m = true`）
2. 次の `requestAnimationFrame` で本体の `offsetHeight` を実測し、方向を確定して可視化（`_m = false`）

1 フレーム遅延するが、ポップアップは元々 CSS open アニメーションを持つため体感はほぼ無い。
`ctx` をどんな構造で包んでも正しく方向が決まる（マジックナンバー 38px を撤廃）。
`requestAnimationFrame` / `document` が無い環境（SSR 等）では暫定方向のまま即表示に
フォールバックする。

**ESC キー (v0.3.27〜)**:

ポップアップが開いている間だけ `document` に `keydown` を bind し、ESC で
アニメーション付きクローズする（`create_ui_dialog` と同型）。閉じると unbind。

#### create_ui_tooltip()

```javascript
s.tip = create_ui_tooltip();
s.tip({ content: 'ヒント', ctx: [trigger], dir: 'auto' })
```

dir: `auto` | `top` | `bottom` | `right` | `left`（auto: top→bottom→right→left の優先順）

#### create_ui_dialog()

**uncontrolled（トリガーボタン付き）**:

```javascript
s.dlg = create_ui_dialog();
s.dlg({
  trigger_ctx: ['開く'],         // トリガーボタンのラベル
  trigger_variant: 'primary',    // ボタンの variant（default / primary / ghost）
  title: '確認',                 // ヘッダーのタイトル
  ctx: [ui_text({ ctx: ['本当に削除しますか？'] })],  // ダイアログ本体
  actions: [                     // フッターのアクションボタン列
    ui_button({ ctx: ['キャンセル'], onclick: () => s.dlg.close() }),
    ui_button({ ctx: ['削除'], variant: 'primary', onclick: delete_item }),
  ],
})
```

**controlled（外部 state 管理）**:

```javascript
s.dlg = create_ui_dialog();
s.dlg({
  open:     s.page.show_dlg,                       // 開閉状態（外部管理）
  on_close: () => { s.page.show_dlg = false; },    // 閉じ要求時のコールバック
  title: '確認',
  ctx: [...],
  actions: [
    ui_button({ ctx: ['OK'], onclick: () => { s.page.show_dlg = false; } }),
  ],
})
// → 戻り値は null（トリガーボタンなし、ポータルのみ）
```

- `trigger_ctx` と `open` の併用は禁止（`console.error`）。
- `on_close` は overlay クリック・✕ ボタン・ESC キーで発火する。
  親が `open` を `false` にすると閉じアニメーションが再生され、完了後にポータルから除去される。
- ESC キーは uncontrolled / controlled 両モードで有効。
- **`width`（v0.3.31〜）**: ダイアログ幅。数値→px / CSS 文字列→そのまま。小画面で
  溢れないよう内部で `min(…, 90vw)` に包むのでレスポンシブ。省略時は CSS 既定
  `min(360px, 90vw)`。`dlg({ open, on_close, title, ctx, width: 640 })`。
  （これで `[data-ric-role="dialog"] { width: …!important }` の CSS 上書きは不要。）

**`on_close(reason)` — close 発生源の区別（v0.3.26〜）**:

controlled mode の `on_close` は close の発生源を `reason` 引数で受け取る:

| reason | 発生源 |
|---|---|
| `'overlay'` | overlay（外側）クリック |
| `'close-button'` | ✕ ボタン |
| `'escape'` | ESC キー |
| `'api'` | `inst.close()` の programmatic 呼び出し |

これにより「overlay 誤クリックでの誤クローズだけ防ぐ」等を consumer 側で表現できる:

```javascript
on_close: (reason) => {
  if (reason === 'overlay') return;   // 外側クリックは無視（誤操作防止）
  s.page.show_dlg = false;            // ✕ / ESC / api は閉じる
}
```

library 側は reason を渡すだけで、「どの reason で閉じるか」の policy は持たない
（「明示的 > 暗黙的」canon）。既存の `on_close: () => {...}` は引数を無視するだけで
従来通り動く（完全後方互換）。uncontrolled mode は `on_close` を経由しないため
reason は関係しない。

**自前 trigger + programmatic open/close（v0.3.14〜）**:

`trigger_ctx` を省略 (or 明示的に `null`) して `s.dlg({ title, ctx, actions })` と
書くと、戻り値は `null`、つまり trigger ボタンを返さない。controlled mode では
ないので `.open()` / `.close()` で外部から駆動できる。「自前 button を出して
そこから programmatic に開きたい」use case 向け。

```javascript
s.dlg = create_ui_dialog();
// render の中で毎フレーム呼ぶ (portal 登録のために必要)
s.dlg({ title: '確認', ctx: [...], actions: [...] })  // trigger_ctx 省略 → null 返却

// 外部から
ui_button({ ctx: ['カスタム trigger'], onclick: () => s.dlg.open() })
```

注: **factory は render の中で毎フレーム呼ぶ必要がある** (portal 登録のため、
他の `create_ui_*` と同じ canon)。`s.dlg(...)` の戻り値が null でも、副作用と
して `.open()` 状態のとき portal にダイアログ本体が積まれる。

メソッド:
- `inst.open()` — プログラムから開く（uncontrolled のみ。controlled では no-op）。
- `inst.close()` — 閉じる。**未 open 状態での呼出は no-op (v0.3.14〜、冪等)**。
  controlled 時は `on_close` を呼ぶ。
- `inst.is_open()` — 現在表示中か (uncontrolled のみ。controlled では常に false)
  を返す。`reset()` 等で「開いていたら閉じる」を書くときの選択肢。ただし
  `.close()` が冪等になったので、単に `.close()` を呼んでも安全。

#### create_ui_toast()

```javascript
s.toast = create_ui_toast();
// render 内で呼ぶ（ポータル登録）
s.toast();
// 任意のタイミングで表示
s.toast.show('保存しました', { type: 'success', duration: 3000 });
s.toast.show('エラー',       { type: 'error',   duration: 0 });  // 0 = 自動消去なし
```

type: `default` | `success` | `error` | `warning` | `info`
メソッド: `inst.show(msg, { type, duration })` — トースト通知を表示する

### Composite

#### create_ui_accordion(opts?)

accordion は「どのセクションが開いているか」という状態を本質的に持つため、
ファクトリパターンのみを提供する（`ui_accordion` / `bind_accordion` は
存在しない — user が accordion の内部情報を外で管理するのは不自然なため）。

```javascript
s.acc = create_ui_accordion({ default_open: { q1: true } });
s.acc({ items: [{ id: 'q1', title: '質問1', ctx: [...] }], multi: true })
```

`multi: true`（デフォルト）で複数パネル同時展開、`false` で排他モード。

`items[].title` は文字列のほか **VDOM ノード・配列**も受け付ける（`ctx: [title]` に
そのまま入り、RicDOM がネスト配列を展開する）。ヘッダーにアイコンを混ぜられる:

```javascript
s.acc({ items: [
  { id: 'a', title: [ui_icon(ICONS.wrench), ' write_file'], ctx: [...] },
]})
```

#### ui_tabs / bind_tabs

tabs の「どのタブがアクティブか」は radiobutton の value や select の value と
同じく user の関心事（タブ切替で content を描き分けるため）なので、state に
直接持つ。ファクトリ版（`create_ui_tabs`）は存在しない。

```javascript
// ステートレス版
ui_tabs({
  items:    [{ key: 'profile', label: 'プロフィール', ctx: [...] }],
  active:   s.tab,
  onchange: (key) => { s.tab = key; },
  variant:  'line',
})

// state バインド版（推奨）
create_RicDOM('#app', {
  tab: 'profile',
  render(s) {
    return bind_tabs(s, 'tab', { items: [...], variant: 'pill' });
  },
});
```

variant: `line`（アンダーライン、デフォルト）| `pill`（背景色）

#### ui_inline_menu

trigger 要素の near に絶対配置する軽量ポップオーバー。`create_ui_popup` が
重すぎる「行ごとに存在する … メニュー」のための純関数。portal を使わず、
親要素の `position:relative` に対して `position:absolute` で配置するだけ。
インスタンスを取らないので「行数分インスタンスが生まれる」問題が起きない。

```javascript
{
  tag: 'div',
  style: { position: 'relative', /* ... */ },  // ← 親は position:relative にする
  ctx: [
    ui_button({ ctx: ['…'], onclick: () => { s.menu_for = id; } }),
    ui_inline_menu({
      open:   s.menu_for === id,
      anchor: 'br',  // 'br' | 'bl' | 'tr' | 'tl' （br=親の右下）
      ctx:    [...],
    }),
  ],
}
```

**親要素は必ず positioned** (`position: relative` / `absolute` / `fixed` /
`sticky` のいずれか) にすること。`anchor` の `top:100% + right:0` 等は
nearest positioned ancestor を基準に計算されるため、親が `static` のままだと
menu は `<body>` 等の遠い祖先を基準に配置され、画面外に飛ぶ silent failure
になる。v0.3.16〜 は dev mode で `console.warn` を出して気付けるようにした
が、要件自体は変わらない。

メニュー項目は v0.3.16〜 デフォルトで **左揃え**
（`.ric-inline-menu .ric-button { justify-content: flex-start; }`）。
アイコン + ラベルのメニューが自然に縦に揃う。center 揃えに戻したい場合は
アプリ側 CSS で override すること。

含まないもの (意図的):
- **外クリックで閉じる挙動はライブラリに持たせない**。`onclick` は内部で
  `e.stopPropagation()` するため、`document` 級の click handler が
  「menu の外をクリック」を検知できる。helper として
  [`watch_outside_click`](#watch_outside_clickcallback) を使う。
- キーボード操作 / focus trap / ARIA は含まない。これらが必要な場合は
  `create_ui_popup` か独自実装を使うこと。
- **`anchor` は自動反転しない**。`ui_inline_menu` は行ごとに大量配置しても
  安い純関数 (portal なし、インスタンスなし) であることが設計の核であり、
  自動 flip に必要な「開いた後の実測 → 再描画」はこの stateless 設計と
  矛盾する。scroll container の下端付近では下向き anchor のメニューが
  clip しうる。自動 flip が必要な文脈では、呼び出し側が開くタイミングで
  anchor を選ぶこと。

#### watch_outside_click(callback)

`document` に click listener を 1 つ取り付け、bubble してきたクリックで
`callback` を呼ぶ。戻り値は unsubscribe 関数。

```javascript
const unsub = watch_outside_click(() => { s.menu_for = null; });
// テスト / unmount で
unsub();
```

`ui_inline_menu` の `onclick` が `e.stopPropagation()` するため、ここで
渡した callback は **menu の外をクリックしたとき** だけ走る。複数 menu
や popup が共存するアプリでも listener は 1 個で十分（state を 1
callback で集約して閉じる）。

#### create_ui_splitter(opts)

```javascript
s.split = create_ui_splitter({
  side:        'left',   // 'left' | 'right' | 'top' | 'bottom'
  size:        240,      // サイドパネルの初期サイズ (px)
  min:         60,       // 最小サイズ (px)
  max:         400,      // 最大サイズ (px, null = 制限なし)
  collapsible: true,     // 折り畳みボタンを表示する（デフォルト: true）
  on_resize_end: (size) => save(size),  // ドラッグ終了で 1 回 (永続化向け、v0.3.33〜)
});

// render 内で呼ぶ（uncontrolled）
s.split({ side: { ctx: [...] }, main: { ctx: [...] } })

// render 内で呼ぶ（controlled — 折り畳み状態を外部管理）
s.split({
  collapsed:          s.page.sidebar_collapsed,
  on_collapse_change: (v) => { s.page.sidebar_collapsed = v; },
  side: { ctx: [...] },
  main: { ctx: [...] },
})

// 公開 API
s.split.toggle()         // 折りたたみ切替（アニメーション付き）
s.split.collapsed()      // → true/false 折りたたみ状態の取得
s.split.get_size()       // → number 現在のサイドパネルサイズ (px)
s.split.set_size(300)    // サイズ変更（DOM も即時反映）
```

controlled mode では `collapsed` の値変化でトランジションアニメーションが自動再生される。
`on_collapse_change(新しい値)` は折り畳みボタンのクリック時に発火する。
`toggle()` は controlled 時に `on_collapse_change(!current)` を呼ぶ。

`on_resize_end(size)` (v0.3.33〜) の契約:
- ドラッグ終了（mouseup）で **1 回だけ** 呼ぶ。ドラッグ中（mousemove）には呼ばない。
- 引数はドラッグ確定後の最終サイズ（min/max clamp 済みの px 数値、`get_size()` と同じ値）。
- サイズが結果的に変わらなかったドラッグでも呼ぶ（変化判定は consumer 側に委ねる、シンプルな契約を優先）。
- 折り畳みボタンのトグルでは呼ばない（ドラッグ終了専用）。
- 用途例: サイズをローカルストレージ等に永続化する。

#### create_ui_scroll_pane(opts?)

「最下部（または最上部）追従型のスクロール領域」を実現するファクトリ。チャット UI・ログビューア・メッセージ一覧で、内容が追加されたら自動で端までスクロール、ただしユーザーが途中を見ている間は動かさない、という挙動を宣言的に実現する。

```javascript
s.pane = create_ui_scroll_pane({
  follow:    'bottom',   // 'bottom' | 'top' | 'none'
  threshold: 50,         // 端からこの px 以内なら「追従対象」とみなす
});

// render 内
s.pane({ ctx: [...messages] })

// 強制スクロール
s.pane.scroll_to_bottom();
s.pane.scroll_to_top();
```

render 直前に現在の scrollTop を読んで「端にいるか」を判定し、描画完了（`requestAnimationFrame`）後に端まで scrollTop を更新する。インスタンスは `data-ric-sp` 属性で特定するため、minify 時のクラス短縮の影響を受けない。

#### create_ui_collapse_box(opts?) (v0.3.9〜)

「子要素をアニメーションで現す/消す」汎用 container primitive。
`width` / `height` を JS で `0 ↔ natural` に切り替え、CSS transition で
ブラウザ補間させる。アニメーション中は JS / RicDOM 共に走らない (transition は
browser compositor で完結)。

```javascript
s.box = create_ui_collapse_box({
  direction: 'v',     // 'v' (default) | 'h' | 'both'
  duration:  200,     // ms
  easing:    'ease',  // CSS easing 文字列
});

// 単独使用 — controlled mode 一本 (visible を渡す)
s.box({
  visible: s.expanded,
  ctx:     [...],
})

// 複数 instance (v0.3.11〜): 1 factory を key で識別される多数の独立
// アニメーションに使える (sparse list animation 用途)
ctx: sorted.map((f) => animating.has(f.path)
  ? s.box({ key: f.path, visible: animating.get(f.path), ctx: [row] })
  : row,
)
```

引数:
- `key`: string (省略時 `'_default'`)。複数 instance を識別する。同 factory
  内で異なる key は独立した state machine と独立した DOM を持つ。Rancha 等
  「sort 順を維持したまま個別 row をアニメ」する用途に使う。
- `visible`: bool (必須)。controlled mode。
- `ctx`: 子要素配列。

戻り値: VDOM ノード or `null` (完全に閉じている and 閉じる動作中でもないとき)。

状態機械 (per-key):

```
        visible:true              transitionend
[closed] ────────→ [entering] ───────────────────→ [open]
   ↑                                                  │
   │ transitionend                       visible:false│
   └──── [closing] ←─────────────────────────────────┘
```

中断 (`visible` がアニメ中に反転) は `entering ⇄ closing` 直接遷移。CSS
transition は「現在の補間値から新ターゲットへ」を自動で行うため、JS 側で
snapshot ロジックは不要。

実装は browser の CSS transition に補間を委譲する **宣言的 API**。1 つの
collapse_box (key) につき JS が走るのはアニメの開始 / 終了の 2 点のみ。
100 個 key を並行で動かしても CPU 負荷は変わらない。
`prefers-reduced-motion` は user 側 CSS で `transition: none` を当てれば
自動的に瞬時遷移になる。

state GC: closing 完了 / 即 closed corner case で内部 Map から該当 key の
エントリが自動削除される。長時間動作する list アプリで Map が膨らまない。

DOM 属性 (v0.3.22〜):
- `data-ric-cb` = `<factory_id>-<URL-safe key>`、内部 querySelector 用
- `data-ric-role` = `'collapse-box'`
- `data-ric-visible` = `'true'` (entering / open) | `'false'` (closing)。
  e2e test で「閉じ終わり vs アニメ中」を attribute selector で切り分ける用途。
  完全に閉じた状態は要素自体が DOM から消えるので `count(0)` で判別する。

メソッド:
- `inst.is_animating(key?)` (v0.3.22〜): 指定 key が `entering` / `closing` 中なら
  `true`、静止状態 (= 完全に open / closed) なら `false`。e2e test で
  アニメ完了を待ってから座標取得したい場面で使う。key 省略時は `'_default'`。

DOM の `data-ric-cb` 属性に factory id と key を encodeURIComponent した
複合値が入る (例: `'12-path%2Fto%2Ffile'`)。`data-ric-role="collapse-box"`
も付与される (CSS / E2E test の selector に使える)。

⚠️ **canon: 閉じアニメは「自分が開けた要素」にしか効かない**

`create_ui_collapse_box` の state machine は、`visible:true` で **mount された
事実** を `_states` Map で覚えている。**pre-existing な要素を後から wrap して
`visible:false` を渡しても、内部 state が無いので closing 遷移が起きず、
要素は無音で消える (アニメなし)。**

典型的な踏み方: list item が `s.files` に並んでいる状態で、後から
「item を消すアニメを付けたい」と思って `visible:!is_removed` を後付けで
渡すケース。この場合、もとからあった行は initial render が `visible:false`
で `state` を作らない (corner case で即 closed) → アニメ無しで消える。

**解決策**: 退場アニメだけは CSS keyframe で代用する canon:

```css
.list-row--exiting {
  animation: list-row-exit 180ms ease-in forwards;
  pointer-events: none;
  overflow: hidden;
}
@keyframes list-row-exit {
  from { opacity: 1; max-height: 60px; }
  to   { opacity: 0; max-height: 0; padding: 0; }
}
```

そのほうが「collapse_box は登場アニメ専用、退場は CSS keyframe」と
責務分離されて trace しやすい。

⚠️ **canon: 閉じても wrapper 要素は DOM に残る (closing 中だけ)**

closing アニメ中は `data-ric-visible="false"` の `<div>` が DOM に残る
(transition の補間を行うため必要)。アニメ完了で要素ごと unmount される。
そのため:

```javascript
// ❌ これは closing 中 false / 完了後 0 / open 中 1 と振れる
await expect(page.locator('.ric-collapse-box')).toHaveCount(0);

// ✅ 「中身が空か」で判定する canon (= 空 ctx パターン)
return s.box({
  visible: !!s.selected,
  ctx: [{
    tag: 'div', class: 'preview-panel',
    ctx: s.selected ? [/* 中身 */] : [],   // null 時は空 ctx
  }],
});
// e2e:
await expect(page.locator('.preview-panel > *')).toHaveCount(0);
```

「business state が null のとき ctx を空にする」のは、collapse_box の都合と
**業務状態の表現を一致させる** ためで、副作用として e2e の閉じ判定にも使える。

### Controlled / Uncontrolled パターン

`create_ui_dialog` と `create_ui_splitter` は **controlled / uncontrolled** の
2 モードを持つ。制御用 prop（`open` / `collapsed`）が `undefined` なら uncontrolled
（内部状態で自動管理）、明示的に渡されたら controlled（外部 state が優先）。

| コンポーネント | 制御 prop | コールバック | uncontrolled 時の動作 |
|---|---|---|---|
| `create_ui_dialog` | `open` | `on_close` | trigger ボタンで開閉 |
| `create_ui_splitter` | `collapsed` | `on_collapse_change` | 折り畳みボタンで開閉 |

設計原則:
- コールバックは「要求の通知」のみ。内部状態は変更しない（親の判断を待つ）。
- アニメーションは prop の変化を検出して自動再生される。
- `inst.close()` / `inst.toggle()` は両モードで動作する
  （controlled 時はコールバックを呼ぶ）。

### ポータルパターン

popup / tooltip / dialog / toast はポータル経由で `ui_page` 直下に描画される。
`_page_portal_queue` はスタックベースで管理:
- `begin()` で新しいスタックフレームを作成
- `push()` でスタック top のフレームに VDOM を積む
- `drain()` でスタック top を pop して返す（なければデフォルトバッファを drain）

複数の `ui_page` インスタンスがある場合、各 `create_ui_page` が `begin()` → render → `drain()` のサイクルでポータルを分離する。
stacking context 問題（backdrop-filter / clip-path）を回避。

テーマ上書き: `_wrap_portal` が各ポータル要素の style に CSS 変数を注入。

#### portal target ルール

ポータルは **drain した `ui_page` の直接の子** として展開される。これは
`position: fixed` で配置するポータルにとって意味のある不変条件:

- `ui_page` が DOM ツリーの **どこにあっても** ポータルはその直下に入る
- ネストした `ui_page` がある場合、ポータルは **最深** (= 一番内側で drain した) 
  `ui_page` の子になる

**重要な落とし穴**: ポータル本体は `position: fixed` だが、CSS 仕様で
**祖先要素が `transform` / `filter` / `backdrop-filter` / `perspective` / `contain` /
`will-change` 等で containing-block を作る** と、`fixed` 配置は **viewport ではなく
その祖先を基準** に解決される。

```
<div style="transform: translateX(0)">    ← containing-block creator
  <div class="ric-page">                  ← portal target
    ...
    <div class="ric-dialog"               ← position: fixed
         style="top:50%; left:50%">
      ↑ viewport ではなく外側の transform 要素を基準にする
        → 中央寄せが意図と違う場所に出る
    </div>
  </div>
</div>
```

このため:
- **`ui_page` を囲む祖先に containing-block creator を入れない**。`transform`、
  `filter`、`backdrop-filter`、`contain: layout|paint|strict`、`perspective`、
  `will-change: transform` 等が該当
- もし「装飾的に `transform` を当てたい」場合は `ui_page` の **外側** ではなく
  **内側の別 div** に当てる
- 「テーマ provider を自前で作りたい」目的で `ui_page` を平 div に降格すると、
  `color` / `background` などの解決済み CSS プロパティが外側の値を継承する罠が
  ある。canon は `ui_page` をそのまま使うこと

### Operational facts — render flush の 2 rAF ルール

state 変更後、新しく描画される DOM 要素を `querySelector` で取得するには、
**2 つの `requestAnimationFrame` を待つ**:

```javascript
handle.show_dialog = true;
requestAnimationFrame(() => requestAnimationFrame(() => {
  const dlg = document.querySelector('.ric-dialog');
  dlg.querySelector('input').focus();
}));
```

仕組み:

1. **mutation (= `handle.show_dialog = true`)**: Proxy の set trap が
   `schedule_render()` を呼ぶ → scheduler は内部フラグを立てて rAF を予約
2. **1 つ目の rAF**: scheduler 内で `do_render()` 実行 → VDOM 構築 → DOM patch。
   この直後はまだ「browser が layout/paint commit 前」の可能性
3. **2 つ目の rAF**: browser の layout/paint commit が確実に完了。
   `querySelector` で新要素を確実に取得できる

1 つの rAF だと「flush 前」に空振りすることがある (= scheduler の rAF と同じ
フレームで動くと、render はまだ走っていない)。**focus / scroll / 寸法計測** など
DOM 反映前提の操作は 2 rAF wait が確実。

注: 値変更だけ (= `el.value` 等を state 経由で更新) は `bind_input` などの helper
を使えば RicDOM が patch するので明示 wait は不要。2 rAF wait が要るのは
「**新規 DOM 要素** にアクセスしたい」場面のみ。

注: 上記は rAF が正常に発火する前提。hidden タブ・kiosk の全画面遷移直後・
Electron の backgroundThrottling 等 rAF が発火しない環境では、do_render は
「レンダースケジューラ」節の `setTimeout(200ms)` バックストップ経由で走る
(v0.3.36〜)。そうした環境も含めて「render 完了 (DOM commit) だけ知りたい」
場合は `next_render()` (上記) の方が確実。

### テーマユーティリティ

#### create_theme / create_density / create_font_size

```javascript
// ベーステーマに部分上書き
const my_theme = create_theme('teal', { '--ric-color-accent': '#e91e8c' });
// オブジェクト直接指定も可
const my_theme = create_theme({ '--ric-color-fg': '#fff', ... });

// 密度・フォントサイズも同様
const my_density = create_density('compact', { '--ric-control-h': '24px' });
const my_font = create_font_size('md', { '--ric-font-size': '16px' });
```

#### export_theme / export_settings

```javascript
// テーマ変数をオブジェクトで取り出す
const theme_vars = export_theme(document.querySelector('.ric-page'));

// theme / density / font_size を分離して取り出す
const { theme, density, font_size } = export_settings(document.querySelector('.ric-page'));
```

#### 自動導出ルール

- `fg-muted` と `border` は `fg` から `color-mix()` で自動導出（未指定時）
- `--ric-duration`（デフォルト 200ms）と `--ric-easing`（デフォルト ease）は `make_css_vars` で自動注入

### CSS 変数リファレンス

RicUI が提供する CSS 変数。自作コンポーネントやカスタムスタイルで直接参照でき、テーマ切替時もそのまま追従する。

#### 色

| 変数名 | 用途 |
|---|---|
| `--ric-color-fg` | 前景（本文テキスト） |
| `--ric-color-fg-muted` | 薄い前景（キャプション・プレースホルダ） |
| `--ric-color-bg` | 背景 |
| `--ric-color-border` | 枠線 |
| `--ric-color-control` | 入力欄の背景（input / select / textarea 等） |
| `--ric-color-accent` | アクセント（focus リング・primary ボタン等） |
| `--ric-color-accent-fg` | アクセント背景上の前景（デフォルト `#fff`） |

#### サイズ / 密度

| 変数名 | 用途 |
|---|---|
| `--ric-radius` | 角丸半径 |
| `--ric-gap` | コンポーネント間の標準 gap |
| `--ric-gap-md` | やや大きい gap（page レベルなど） |
| `--ric-pad-x` | 水平方向のパディング |
| `--ric-pad-y` | 垂直方向のパディング |
| `--ric-control-h` | 入力系コントロールの高さ |
| `--ric-font-size` | 基準フォントサイズ（デフォルト 14px） |

#### シャドウ / ブラー

| 変数名 | 用途 |
|---|---|
| `--ric-shadow` | ポップアップ / ダイアログの影 |
| `--ric-panel-shadow` | パネルの控えめな影 |
| `--ric-popup-blur` | ポップアップの backdrop-filter |

#### アニメーション

| 変数名 | 用途 |
|---|---|
| `--ric-duration` | 標準トランジション時間（200ms） |
| `--ric-easing` | 標準イージング（ease） |

#### ツールチップ専用

| 変数名 | 用途 |
|---|---|
| `--ric-tooltip-bg` | ツールチップ背景 |
| `--ric-tooltip-fg` | ツールチップ前景 |

自作コンポーネントは `background: var(--ric-color-bg)` のように直接参照すれば、テーマ切替（`s.page.theme = 'dark'` 等）で自動追従する。`create_theme` / `export_theme` で任意キーを上書きできる。

---

## 4. パラメータ調整パネル（ui_tweak）

RicUI の composite カテゴリに統合されたパラメータ調整パネル。
3 段階 API:
- **Tier 1** — `create_ui_tweak_panel({ data })` に data を投げるだけで全自動 GUI
- **Tier 2** — `keys` で一部の行を上書き（type / label / min / max 等）
- **Tier 3** — `ui_tweak_panel({ ctx: [...] })` で ui_tweak_row / ui_tweak_folder を自由に組み立て

### create_ui_tweak_panel（Tier 1/2: factory）

```javascript
// Tier 1: data だけで全自動 GUI
s.tw = create_ui_tweak_panel({ data: params });

// Tier 2: keys で部分上書き
s.tw = create_ui_tweak_panel({
  title: 'Settings',
  data: params,
  keys: {
    speed: { type: 'range', min: 0, max: 100 },
    quality: { type: 'select', options: ['low', 'high'] },
    secret: false,   // 非表示
  },
  width: '100%',
});

// 描画
return s.page({ ctx: [ s.tw() ] });
```

factory を `s` に格納すると RicDOM が `inst.__notify` を自動注入する。
`_generate_rows` の各行の set コールバックが `notify()` を明示的に呼ぶため、
ネストしたプロパティ（`data.nested.key = v`）の変更も再描画につながる
（Proxy の自動検知ではなく、set コールバック経由）。

### ui_tweak_panel（Tier 3: stateless wrapper）

```javascript
ui_tweak_panel({
  title: 'Custom',
  width: '100%',
  ctx: [
    ui_tweak_folder({ label: 'Colors', open: true, ctx: [
      ui_tweak_row({ label: 'fg', get: () => t.fg, set: (v) => { t.fg = v; } }),
    ]}),
    ui_button({ ctx: ['Save'], onclick: save }),
  ],
})
```

### ui_tweak_row

```javascript
ui_tweak_row({
  label: 'speed',
  get: () => data.speed,
  set: (v) => { data.speed = v; },
  type: 'range',      // 省略時は infer_type で自動推論
  min: 0, max: 100,   // type 固有パラメータ
})
```

#### number 行: フォーカス中は「編集優先」（v0.3.37〜）

`type: 'number'` の行はフォーカス中、state 側の値変更が表示に反映されない
（VDOM から `value` キーを落として書き戻しを止めるため）。これは number input の
`value` が RicDOM コアの `FORCE_REAPPLY_DOM_KEYS` 対象で、prev=next でも毎 render
再代入されることによる編集中バッファ破壊（badInput 状態で `.value` が `''` を
返す瞬間に再代入が走ると入力中の桁が丸ごと消える）を防ぐための挙動。blur すると
`min`/`max` があれば clamp した確定値を書き戻し、次の render から通常の
controlled 表示（state → 表示の同期）に復帰する。

### ui_tweak_folder

ネイティブ `<details>` ベース。RicDOM の差分エンジンは vdom 属性が変わらない限り
DOM を再設定しないため、ユーザのクリックによる開閉はプログラム的に保持される。

```javascript
ui_tweak_folder({ label: 'Advanced', open: true, ctx: [...] })
```

### 型推論（infer_type）

| 値 | → type |
|----|--------|
| `boolean` | checkbox |
| `number` | number |
| `'#e11d48'`（hex） | color |
| `'rgb(255,0,0)'` / `'rgba(...)'` | color |
| `'Hello'`（その他文字列） | text |
| `[...]`（配列） | json_preview |
| `{ ... }`（plain object） | folder |

### keys 上書きルール

| keys[k] の値 | 挙動 |
|-------------|------|
| `false` | 行を非表示 |
| `{ tag: ... }` (vdom) | 行をその vdom で差し替え |
| `{ type, label, ... }` | ui_tweak_row のオプションを上書き |
| `{ open, keys, ctx }` (folder) | ネストオブジェクトの folder 設定。ctx 指定時はそれを使用 |

#### keys を関数で渡す（動的 keys）

`keys` にオブジェクトの代わりに **関数** を渡すと、毎 render で評価される。
パラメータの値に応じて他の行を `disabled` にする、`options` を切り替える等に使う。

```javascript
s.tw = create_ui_tweak_panel({
  data: params,
  keys: () => ({
    symmetric: {},
    cx_left:  { type: 'range', ...(params.symmetric ? { disabled: true } : {}) },
    cy_left:  { type: 'range', ...(params.symmetric ? { disabled: true } : {}) },
  }),
});
```

関数は `inst()` が呼ばれるたびに実行される。戻り値は通常の keys オブジェクトと
同じ形式（`false` / vdom / options object / folder config）。

ネストしたフォルダ内の `keys` も関数を許容する（全階層で動的評価）:

```javascript
s.tw = create_ui_tweak_panel({
  data: params,
  keys: {
    shape: {
      open: true,
      keys: () => ({
        symmetric: {},
        cx_left:  { type: 'range', ...(params.shape.symmetric ? { disabled: true } : {}) },
        cx_right: { type: 'range', ...(params.shape.symmetric ? { disabled: true } : {}) },
      }),
    },
  },
});
```

#### ctx を関数で渡す（自前 get/set の動的追従）

`create_ui_tweak_panel` の `ctx` に **関数** を渡すと、毎 render で再評価される
（`keys` と同じ流儀）。自前 `get`/`set` の `ui_tweak_row` を `ctx` で組む場合は
**必ず関数で渡す**こと。静的配列だと初回評価のまま固定され、`get` が再実行されない
ため、外部で値が変わっても表示が追従しない（例: radio の `checked` が古いまま）。

```javascript
// ✅ 関数 → 毎 render で get が再評価され、外部変更に追従する
s.tw = create_ui_tweak_panel({
  ctx: () => [
    ui_tweak_row({ label: 'テーマ', type: 'radiobutton',
      options: ['light', 'dark'],
      get: () => page.theme,            // 外部 state を読む
      set: (v) => set_theme(v) }),
  ],
});

// ❌ 静的配列 → 初回の get 値で固定。page.theme が変わっても radio が更新されない
s.tw = create_ui_tweak_panel({ ctx: [ ui_tweak_row({ ... }) ] });
```

`data` を使う Tier 1/2 では行が毎 render で自動再生成されるためこの問題は起きない。
これは Tier 3（`ctx` 手組み）を factory に載せる場合の注意点。

---

## 5. Performance & Scale

RicDOM は「state 全体の再評価 + VDOM 差分 patch」モデルで、10KB のコアに収めるため局所 reactive（partial re-render）は持たない。本節では規模が大きくなった時の対処パターンと、現状で測定されている性能レンジを記録する。

### 計測の推奨パターン

```javascript
render(s) {
  const t0 = performance.now();
  // ...前処理...
  const t_prep = performance.now();
  const vdom = /* VDOM 構築 */;
  const t_build = performance.now();
  // ...後処理...
  const t_done = performance.now();

  const log = (window.__render_log ||= []);
  log.push({
    total: (t_done  - t0).toFixed(2),
    prep:  (t_prep  - t0).toFixed(2),
    build: (t_build - t_prep).toFixed(2),
    post:  (t_done  - t_build).toFixed(2),
  });
  if (log.length > 1000) log.shift();
  return vdom;
}

// devtools console で統計を確認
window.render_stats = () => {
  const log = window.__render_log || [];
  if (!log.length) return 'no samples';
  const pct = (xs, p) => {
    const s = xs.slice().sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.floor(s.length * p))];
  };
  return Object.keys(log[0]).map(f => {
    const xs = log.map(r => Number(r[f])).filter(Number.isFinite);
    return {
      field: f, n: xs.length,
      mean: (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2),
      p50:  pct(xs, 0.5).toFixed(2),
      p95:  pct(xs, 0.95).toFixed(2),
      max:  Math.max(...xs).toFixed(2),
    };
  });
};
```

目安: 60fps 予算 16.7ms の **10% 以内（1.7ms）** を維持できていれば体感遅延はほぼ生じない。

### 実アプリの計測例

外部ユーザー（production engineering tool、帰属詳細は非公開）による計測:

**アプリ構成**: SVG ステージ 100+ ノード（path/circle/text）、時系列グラフ 3 本（各 40+ ノード）、tweak_panel 4 フォルダ 18 行、splitter × 2（controlled mode）、toast

**スライダを 100 回連続 mutation した時の内訳（ms、36 サンプル）**:

| phase | mean | p50 | p95 | max |
|---|---|---|---|---|
| total | 1.23 | 1.20 | 1.80 | 2.30 |
| fetch dispatch | 0.23 | 0.20 | 0.30 | 0.40 |
| SVG build_vdom | 0.19 | 0.20 | 0.40 | 0.40 |
| graphs build_vdom × 3 | 0.66 | 0.60 | 0.90 | 1.40 |
| layout tree | 0.14 | 0.10 | 0.40 | 0.40 |

60fps 予算対比: 平均 7.4%、ピーク 14%。スクラブ中の体感遅延なし。

### 規模が拡大した時の対処パターン

#### パターン 1: 重い計算結果を `s.ignore` にキャッシュ

`s.ignore` 以下は Proxy の再描画トリガーから除外される。重い derive 結果を保持しつつ、state 汚染を避けられる。

```javascript
render(s) {
  // shape key が変わったときだけ再計算
  const key = `${s.shape.n}-${s.shape.cd}`;
  if (s.ignore.shape_key !== key) {
    s.ignore.shape_key = key;
    s.ignore.geometry = expensive_compute(s.shape);
  }
  return build_vdom(s.ignore.geometry);
}
```

#### パターン 2: ユーザーランド memoize（参考実装）

```javascript
// 30 行の最小メモ化ヘルパ（ユーザーランドで書ける）
const create_memo = (build, key_of) => {
  let cache = { key: Symbol(), vdom: null };
  return (input) => {
    const key = key_of(input);
    if (cache.key === key) return cache.vdom;
    cache = { key, vdom: build(input) };
    return cache.vdom;
  };
};

// 使い方
const build_stage = create_memo(
  (shape) => build_stage_vdom(shape),
  (shape) => `${shape.n}-${shape.cd}-${shape.cx}-${shape.cy}`,
);
render(s) {
  return { tag: 'div', ctx: [build_stage(s.shape), /* ... */] };
}
```

公式 API として `create_ui_memo` を用意するかは需要を見て検討（現時点では未定）。

#### パターン 3: コード分割のための独立 `create_RicDOM`（共有 state）

コードを複数ファイルに分けたいとき、mount point を ref で確保してそこに別 instance を生成する:

```javascript
const state = { title: 'Hello', /* ... */ };
state.render = (s) => ({
  tag: 'div', ctx: [
    { tag: 'header', ctx: [`${s.title}`] },
    { tag: 'div',    ref: 'main_mount' },   // ctx 省略 → child が保持される
  ],
});
const parent = create_RicDOM('#app', state);
// 別ファイルから、同じ state を共有する child を生成
const child = create_RicDOM(parent.refs.get('main_mount'), state);
child.render = render_main;
```

**重要**: 共有 state の mutation は **全 instance が再描画される**（subscriber set が共有されるため）。コード分離の目的には使えるが、**局所 re-render にはならない**。

**FACT (v0.3.38〜明記)**: `create_RicDOM` は `target` が解決済みであれば、呼び出し時点で**同期的に初回描画**を行う（`render` が指定されていれば即座に DOM が構築される。rAF 等を待たない）。そのため、上記のように mount point (`ref: 'main_mount'`) を DOM に作る側のモジュールは、それを `create_RicDOM` の `target` として利用する側より**先に評価されている**必要がある（ES modules では `import` 順、`require` では読み込み順がそのまま評価順になる）。順序が逆だと `target` 未解決のまま作成され、target 探索タイマー待ちの空 instance になる。

> **一般化: diff 対象外の島 (canvas / サードパーティ DOM) との共存 (v0.3.38〜 明記)**
>
> 上の `ref: 'main_mount'` + `ctx` 省略の組み合わせは「別 instance を mount する」用途に
> 限らない。内部実装は「prev/next 両方の `ctx` が省略 (= 空扱い) なら `patch_children` が
> `is_json_equal([], [])` で即座に短絡し、そのノードの子要素には一切触れない」というだけの
> 仕組み（`src/ricdom.js` の `patch_children` 内コメント「parent が `<div ref="mount">`
> のような空 ctx を返して、child instance が外部から DOM を mount するパターンを守る
> ため」参照）。これは **canvas / video / サードパーティ製ウィジェット（チャートライブラリ、
> 地図、リッチテキストエディタ等）が imperative に DOM を書き換える「島」を RicDOM の
> diff から守る**、第一級のユースケースとして使える:
> ```javascript
> render(s) {
>   return {
>     tag: 'div', ctx: [
>       { tag: 'h2', ctx: [s.title] },
>       { tag: 'canvas', ref: 'chart_canvas' }, // ctx 省略 → RicDOM は中身を diff しない
>     ],
>   };
> }
> // マウント後、canvas への描画はサードパーティ製ライブラリが直接 DOM を触ってよい
> const chart = new Chart(handle.refs.get('chart_canvas'), { /* ... */ });
> ```
> **注意**: 保護が効くのは「そのノード自身が同一 key (or serial key) で再利用され続ける」
> 間だけ。親の再描画でそのノードの `tag` が変わる／兄弟の並びがズレる等で別ノード扱いに
> なると、通常の reconciliation（削除→再生成）が起き島の中身は失われる。兄弟が増減する
> 文脈では `key` を明示して識別を安定させること。新しい `static: true` 等の専用フラグは
> **無い** — `ctx` 省略が canon。

#### パターン 4: 真の局所 re-render（独立 state、手動同期）

各 instance が独立 state を持てば、mutation はその instance だけで閉じる:

```javascript
const a = create_RicDOM('#mount-a', { counter: 0, render: render_a });
const b = create_RicDOM('#mount-b', { counter: 0, render: render_b });

a.counter = 1;   // a だけ再描画
b.counter = 1;   // b だけ再描画
```

親子間でデータを同期したい場合は親の render で子のハンドルに書き込む:

```javascript
const child = create_RicDOM('#child', { shared: null, render: render_child });
create_RicDOM('#parent', {
  value: 0,
  render(s) {
    child.shared = s.value;   // 親の state 変更 → 子の state 変更 → 子が再描画
    return { /* 親の VDOM */ };
  }
});
```

### 局所 reactive 用の公式 API（`create_ui_panel` 等）について

現時点では **用意していない**。理由:

- 上記のパターンで大半のユースケースをカバーできる
- コアを 10KB に保つため、optimization API はユーザーランド / RicUI 側で書く方針
- 計測データが示す通り、実アプリで render 評価自体がボトルネックになるケースは稀（1.23ms / SVG 100+ ノード規模）

需要が積み上がってきたら改めて設計する。

---

## 6. コーディング規約

- `var` 禁止、`const` 最大限、`let` 最小限
- `class` 構文不使用、ファクトリ関数パターンで統一
- CommonJS（`require` / `module.exports`）、ESM 不使用
- 命名はスネークケース（例外: `create_RicDOM`）
- エラーは `console.error()` + graceful return（throw しない）
- `NOOP_PROXY` 返却でエラー連鎖を防止
- コメントは日本語・多め
- テスト: `node:test` + jsdom

---

## 7. ビルド

```bash
npm run build        # 全バンドル
npm run build:core   # RicDOM.min.js
npm run build:ui     # RicUI.min.js（調整パネル含む）
npm test             # 575 テスト
```

esbuild でバンドル + minify。`--platform=browser`。
CSS はテンプレートリテラル内に定義（コメント除去済み）。

### LZ 圧縮版 (`*.lz.min.js`) と CSP

`RicDOM.lz.min.js` / `RicUI.lz.min.js` は base64-encoded LZSS を `atob` で展開し
`(0,eval)(...)` で実行する自己展開 IIFE (`scripts/build_lz_bundle.js` / `scripts/lz.js`
参照)。**FACT: 自己展開に `eval` を使うため、Content-Security-Policy を敷く環境では
`script-src` に `'unsafe-eval'` が必要。** 厳格 CSP (`'unsafe-eval'` 禁止) では
`eval` 不使用の素の `*.min.js` を使う（機能・API は LZ 版と完全に同一）。
詳細は README.md「LZ 圧縮版の使い分け」節を参照。

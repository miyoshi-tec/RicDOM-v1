// RicUI — ui_md_pre
// Markdown テキストを VDOM ノードに変換する部品。
// ヘルプ画面・チュートリアル表示用の簡易パーサー。
// 外部ライブラリ不要。完全な CommonMark 準拠ではなく、実用的なサブセットを対応する。
//
// 使い方：
//   ui_md_pre({ ctx: ['# 見出し\n\nテキスト'] })
//
//   // 複数行の Markdown
//   ui_md_pre({ ctx: [`
//     # タイトル
//     **太字** と *斜体* と \`コード\`
//     - リスト A
//     - リスト B
//   `] })
//
// 対応構文：
//   # 〜 ######        見出し（h1〜h6）
//   **text**           太字
//   *text*             斜体
//   `code`             インラインコード
//   ```lang ... ```    コードブロック（ui_code_pre 風の表示、``` / ~~~ 両対応）
//   ~~~lang ... ~~~    コードブロック（チルダフェンス、v0.4.1〜）
//   - item             箇条書きリスト（ネストなし）
//   1. item            順序ありリスト（ネストなし、v0.4.1〜）
//   > quote            引用
//   [text](url)        リンク（javascript: / data: / vbscript: は href を出力しない、v0.4.1〜）
//   ![alt](src)        画像（v0.4.1〜）
//   | a | b |          テーブル（ヘッダ＋区切り＋本体）
//   ---                水平線
//   空行               段落区切り
//
// Props:
//   ctx                  {string[]}   Markdown テキスト（複数渡すと連結される）
//   transform_text       {(str) => (vnode|string)[] | string}   (任意、v0.3.38〜)
//                        プロセ（通常テキスト）のテキストノードだけに適用され、
//                        戻り値（vnode/string の配列、または string 単体）で置換される。
//                        例: 資産 ID を自動リンク化する
//                          transform_text: (str) => str.split(/(ast_[a-z0-9]+)/).map(
//                            part => /^ast_/.test(part)
//                              ? { tag: 'a', href: `/assets/${part}`, ctx: [part] }
//                              : part
//                          )
//                        FACT:
//                        - コードブロック（```）とインラインコード（`code`）には
//                          **適用されない**（リテラル性を守るため）。
//                        - 例外を投げた場合は console.error を出し、元のテキストの
//                          まま表示する（NOOP フォールバック、throw しない）。
//                        - 戻り値の vnode に対して transform_text が再帰適用される
//                          ことはない（無限ループ対策、1 パスのみ）。
//   transform_image_src  {(src, alt) => string}   (任意、v0.4.1〜)
//                        `![alt](src)` の img 生成前に src を差し替えられる。
//                        用途例: 相対パス → カスタムプロトコル解決（Electron の app:// 等）。
//                          transform_image_src: (src) => `app://assets/${src}`
//                        FACT:
//                        - string 以外を返した場合、または例外を投げた場合は
//                          console.error を出し、元の src のまま表示する（NOOP フォールバック）。
//                        - transform_text と同じく rest には漏れない。

'use strict';

const { warn_hljs_missing } = require('../_factory_helpers');

// transform_text を安全に適用してノード配列へ push する。
// 例外時は console.error + 元テキストのまま（NOOP 流儀）。
// 戻り値は 1 パスのみで消費し、結果を再度 _parse_inline に通したりはしない
// （無限ループ対策 — 過去に修正歴のある safety net と同じ考え方）。
const _push_prose_text = (nodes, str, transform_text) => {
  if (!str) return;
  if (typeof transform_text !== 'function') { nodes.push(str); return; }
  try {
    const result = transform_text(str);
    if (typeof result === 'string') {
      nodes.push(result);
    } else if (Array.isArray(result)) {
      nodes.push(...result);
    } else {
      // 想定外の戻り値（undefined 等）は元のテキストのままにする
      nodes.push(str);
    }
  } catch (e) {
    console.error('[RicUI] ui_md_pre: transform_text が例外を投げました。元のテキストで表示を続けます。', e);
    nodes.push(str);
  }
};

// transform_image_src を安全に適用して src 文字列を返す（v0.4.1〜）。
// transform_text と同じ NOOP 流儀：戻り値が string でない／例外時は console.error
// を出し、元の src をそのまま使う。用途例: 相対パス → カスタムプロトコル解決
// （Electron の app:// 等）。
const _resolve_image_src = (src, alt, transform_image_src) => {
  if (typeof transform_image_src !== 'function') return src;
  try {
    const result = transform_image_src(src, alt);
    if (typeof result === 'string') return result;
    console.error('[RicUI] ui_md_pre: transform_image_src は string を返す必要があります。元の src で表示を続けます。');
    return src;
  } catch (e) {
    console.error('[RicUI] ui_md_pre: transform_image_src が例外を投げました。元の src で表示を続けます。', e);
    return src;
  }
};

// href の危険スキーム判定（v0.4.1〜、FACT）。
// javascript: / data: / vbscript: を大文字小文字を問わず前方一致でブロックする。
// 「java\tscript:」のような制御文字混入での回避を防ぐため、判定用に制御文字
// （改行・タブ等）を取り除いてから trim + toLowerCase → 前方一致判定する
// （出力する href 自体は元の文字列のまま加工しない）。
// whitelist にはしない（http/https/mailto/相対パス/app:// 等のカスタムプロトコルは
// 全て素通しする。Electron consumer がカスタムプロトコルを正当利用するため）。
const _DANGEROUS_HREF_SCHEMES = ['javascript:', 'data:', 'vbscript:'];
const _strip_control_chars = (str) => {
  // for...of は codePoint 単位で走査するため、サロゲートペアも安全に扱える。
  let out = '';
  for (const ch of String(str)) {
    const code = ch.codePointAt(0);
    if (code > 0x1F && code !== 0x7F) out += ch;
  }
  return out;
};
const _is_dangerous_href = (href) => {
  const cleaned = _strip_control_chars(href).trim().toLowerCase();
  return _DANGEROUS_HREF_SCHEMES.some((scheme) => cleaned.startsWith(scheme));
};

// ── インライン Markdown → VDOM ノード配列 ──────────────────────────
// 太字・斜体・インラインコード・画像・リンクを解析して VDOM ノードの配列を返す。
// ネストは「太字の中に斜体」程度まで対応する。
// transform_text はプロセ（通常テキスト）部分にのみ適用し、インラインコード
// (`m[1]`) には適用しない（リテラル性を守る）。
const _parse_inline = (text, transform_text, transform_image_src) => {
  const nodes = [];
  // 正規表現: コード → 画像 → リンク → 太字 → 斜体 の優先度で探す。
  // 画像 `![alt](src)` はリンクより前に置く（そうしないと `!` が単独プロセに
  // なった後 `[alt](src)` だけがリンクとして誤マッチする）。
  const re = /`([^`]+)`|!\[([^\]]*)\]\(([^)]+)\)|\[([^\]]+)\]\(([^)]+)\)|\*\*(.+?)\*\*|\*(.+?)\*/g;
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    // マッチ前のプレーンテキスト（プロセ）
    if (m.index > last) _push_prose_text(nodes, text.slice(last, m.index), transform_text);
    if (m[1] !== undefined) {
      // `code` — インラインコードなので transform_text を適用しない
      nodes.push({ tag: 'code', class: 'ric-md-pre__code', ctx: [m[1]] });
    } else if (m[2] !== undefined) {
      // ![alt](src)
      const alt = m[2];
      const src = _resolve_image_src(m[3], alt, transform_image_src);
      nodes.push({ tag: 'img', class: 'ric-md-pre__img', src, alt });
    } else if (m[4] !== undefined) {
      // [text](url) — javascript: / data: / vbscript: は href を出力しない
      const href = m[5];
      nodes.push(_is_dangerous_href(href)
        ? { tag: 'a', class: 'ric-md-pre__link', ctx: [m[4]] }
        : { tag: 'a', class: 'ric-md-pre__link', href, target: '_blank', rel: 'noopener', ctx: [m[4]] });
    } else if (m[6] !== undefined) {
      // **bold** — 中身を再帰パースして斜体等に対応
      nodes.push({ tag: 'strong', ctx: _parse_inline(m[6], transform_text, transform_image_src) });
    } else if (m[7] !== undefined) {
      // *italic*
      nodes.push({ tag: 'em', ctx: _parse_inline(m[7], transform_text, transform_image_src) });
    }
    last = m.index + m[0].length;
  }
  // 残りのプレーンテキスト（プロセ）
  if (last < text.length) _push_prose_text(nodes, text.slice(last), transform_text);
  return nodes;
};

// ── ブロックレベル Markdown → VDOM ノード配列 ─────────────────────
// 行単位でパースし、VDOM ノードの配列を返す。
// transform_text はコードブロック（``` / ~~~）の中身には適用しない（下記参照）。
const _parse_blocks = (src, transform_text, transform_image_src) => {
  const lines = src.split('\n');
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // ── コードブロック ``` / ~~~ (v0.4.1〜 チルダフェンス対応) ──
    // 開始と同じ文字種（` または ~）で閉じる。info string の扱いは共通。
    const fence_trimmed = line.trimStart();
    if (fence_trimmed.startsWith('```') || fence_trimmed.startsWith('~~~')) {
      const fence_str = fence_trimmed.slice(0, 3);
      const lang = fence_trimmed.slice(3).trim() || null;
      const code_lines = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith(fence_str)) {
        code_lines.push(lines[i]);
        i++;
      }
      i++; // 閉じフェンス行をスキップ

      const raw = code_lines.join('\n');
      // 注: フェンスコードブロックの中身には transform_text を適用しない
      // （リテラル性を守るため。プロセ以外は変換対象外という FACT の一部）。
      // hljs でハイライトを試みる（ui_code_pre と同じロジック）
      // lang 指定ありのときのみ hljs を呼ぶ。指定なしはプレーンテキスト。
      // highlightAuto はリアルタイム入力で重くなるため使わない。
      let code_node;
      if (lang && typeof window !== 'undefined') {
        if (typeof window.hljs === 'undefined') {
          // lang 指定があるのに hljs が無い = ユーザは highlight 期待していた、初回 warn
          warn_hljs_missing();
          code_node = { tag: 'code', ctx: [raw] };
        } else {
          try {
            const result = window.hljs.highlight(raw, { language: lang });
            code_node = { tag: 'code', class: 'hljs', innerHTML: result.value };
          } catch (_) {
            // 未知の言語名などで失敗したらプレーンテキストにフォールバック
            code_node = { tag: 'code', ctx: [raw] };
          }
        }
      } else {
        // lang 指定なし or 非 window 環境 (= SSR): silent fallback
        code_node = { tag: 'code', ctx: [raw] };
      }
      blocks.push({
        tag: 'pre', class: 'ric-md-pre__fence', ctx: [code_node],
      });
      continue;
    }

    // ── 空行（段落区切り）──
    if (line.trim() === '') { i++; continue; }

    // ── 水平線 --- ──
    if (/^-{3,}\s*$/.test(line.trim())) {
      blocks.push({ tag: 'hr', class: 'ric-md-pre__hr' });
      i++;
      continue;
    }

    // ── 見出し # 〜 ###### ──
    const heading_match = line.match(/^(#{1,6})\s+(.+)/);
    if (heading_match) {
      const level = heading_match[1].length;
      // タグは実レベル通り。class は h4〜h6 を h3 と同じスタイルに統一する。
      const tag = 'h' + level;
      const cls = level <= 3 ? 'ric-md-pre__h' + level : 'ric-md-pre__h3';
      blocks.push({
        tag, class: cls,
        ctx: _parse_inline(heading_match[2], transform_text, transform_image_src),
      });
      i++;
      continue;
    }

    // ── 引用 > ──
    if (line.trimStart().startsWith('> ')) {
      const quote_lines = [];
      while (i < lines.length && lines[i].trimStart().startsWith('> ')) {
        quote_lines.push(lines[i].trimStart().slice(2));
        i++;
      }
      blocks.push({
        tag: 'blockquote', class: 'ric-md-pre__quote',
        ctx: _parse_blocks(quote_lines.join('\n'), transform_text, transform_image_src),
      });
      continue;
    }

    // ── リスト - ──
    if (/^\s*[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        const item_text = lines[i].replace(/^\s*[-*]\s+/, '');
        items.push({ tag: 'li', ctx: _parse_inline(item_text, transform_text, transform_image_src) });
        i++;
      }
      blocks.push({ tag: 'ul', class: 'ric-md-pre__list', ctx: items });
      continue;
    }

    // ── 順序ありリスト 1. item (v0.4.1〜) ──
    // ネストは非対応（ul と同じ割り切り）。start 番号は最初の行の数字を反映する
    // （3. から始まれば <ol start="3">）。番号のズレ（1. 3. 5. 等）は
    // 複雑になるため追わず、常に連番として描画する（ブラウザの既定挙動）。
    if (/^\s*\d+\.\s+/.test(line)) {
      const first_num = parseInt(line.match(/^\s*(\d+)\.\s+/)[1], 10);
      const items = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        const item_text = lines[i].replace(/^\s*\d+\.\s+/, '');
        items.push({ tag: 'li', ctx: _parse_inline(item_text, transform_text, transform_image_src) });
        i++;
      }
      const ol_node = { tag: 'ol', class: 'ric-md-pre__ol', ctx: items };
      if (first_num !== 1) ol_node.start = first_num;
      blocks.push(ol_node);
      continue;
    }

    // ── テーブル | ... | ──
    // ヘッダ行 + 区切り行（|---|---| or ---|---）+ 本体行のパターン
    if (line.trim().startsWith('|') && i + 1 < lines.length &&
        /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(lines[i + 1].trim())) {
      // ヘルパー: | で分割してセル文字列の配列を返す
      const _split_row = (row) => {
        let s = row.trim();
        if (s.startsWith('|')) s = s.slice(1);
        if (s.endsWith('|')) s = s.slice(0, -1);
        return s.split('|').map(c => c.trim());
      };
      // アライメント解析（区切り行の :--- / :---: / ---: パターン）
      const _parse_align = (sep) => {
        return _split_row(sep).map(c => {
          const t = c.trim().replace(/\s/g, '');
          if (t.startsWith(':') && t.endsWith(':')) return 'center';
          if (t.endsWith(':')) return 'right';
          return 'left';
        });
      };
      const header_cells = _split_row(lines[i]);
      const aligns = _parse_align(lines[i + 1]);
      i += 2; // ヘッダ行 + 区切り行をスキップ
      // ヘッダ行
      const thead = {
        tag: 'thead', ctx: [{
          tag: 'tr', ctx: header_cells.map((cell, ci) => ({
            tag: 'th', class: 'ric-md-pre__th',
            style: aligns[ci] !== 'left' ? `text-align:${aligns[ci]}` : undefined,
            ctx: _parse_inline(cell, transform_text, transform_image_src),
          })),
        }],
      };
      // 本体行（| で始まる連続行を消費）
      const body_rows = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const cells = _split_row(lines[i]);
        body_rows.push({
          tag: 'tr', ctx: cells.map((cell, ci) => ({
            tag: 'td', class: 'ric-md-pre__td',
            style: aligns[ci] !== 'left' ? `text-align:${aligns[ci]}` : undefined,
            ctx: _parse_inline(cell, transform_text, transform_image_src),
          })),
        });
        i++;
      }
      blocks.push({
        tag: 'table', class: 'ric-md-pre__table',
        ctx: [thead, { tag: 'tbody', ctx: body_rows }],
      });
      continue;
    }

    // ── 段落（連続する非空行をまとめる）──
    // 段落の終端条件（次のブロックが始まる条件）は、上の if チェインと一致させる。
    // 注意：「# で始まる」だけで終端にしてはいけない。`#hello` や `#` のように
    // 上のヘッダー判定に失敗したトークンまで段落から追い出すと、どのブロックにも
    // 拾われず i++ が走らず無限ループになる。ここでは「正しい見出しパターン」に
    // 限定して終端判定する。
    const para_lines = [];
    while (i < lines.length && lines[i].trim() !== '' &&
           !/^#{1,6}\s+\S/.test(lines[i].trimStart()) &&
           !lines[i].trimStart().startsWith('```') &&
           !lines[i].trimStart().startsWith('~~~') &&
           !lines[i].trimStart().startsWith('> ') &&
           !/^\s*[-*]\s+/.test(lines[i]) &&
           !/^\s*\d+\.\s+/.test(lines[i]) &&
           !/^-{3,}\s*$/.test(lines[i].trim()) &&
           !lines[i].trim().startsWith('|')) {
      para_lines.push(lines[i]);
      i++;
    }
    if (para_lines.length > 0) {
      blocks.push({
        tag: 'p', class: 'ric-md-pre__p',
        ctx: _parse_inline(para_lines.join('\n'), transform_text, transform_image_src),
      });
      continue;
    }

    // ── セーフティネット（無限ループ防止）──
    // どの分岐でも line を消費できなかった場合は、その 1 行を素の段落として
    // 吐き出し、必ず i++ する。将来同じ形のバグが混入しても落ちないように
    // while ループの終端を保証する。
    blocks.push({
      tag: 'p', class: 'ric-md-pre__p',
      ctx: _parse_inline(lines[i], transform_text, transform_image_src),
    });
    i++;
  }

  return blocks;
};

// ── ui_md_pre 本体 ────────────────────────────────────────────────
// transform_text / transform_image_src は rest から分離する
// （DOM 属性ではないので div へ透過させない）。
const ui_md_pre = ({ ctx = [], transform_text, transform_image_src, ...rest } = {}) => {
  const src = ctx.join('\n');
  const children = _parse_blocks(src, transform_text, transform_image_src);

  // rest スプレッド契約: ...rest を先頭に置き、算出値（tag/class/ctx）で上書きする。
  // rest.class を基底クラスに連結することで、呼び出し側の追加クラスも共存する。
  return {
    ...rest,
    tag:   'div',
    class: rest.class ? 'ric-md-pre ' + rest.class : 'ric-md-pre',
    ctx:   children,
  };
};

module.exports = { ui_md_pre };

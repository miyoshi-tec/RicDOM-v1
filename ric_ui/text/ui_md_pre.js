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
//   ```lang ... ```    コードブロック（ui_code_pre 風の表示）
//   - item             箇条書きリスト（ネストなし）
//   > quote            引用
//   [text](url)        リンク
//   | a | b |          テーブル（ヘッダ＋区切り＋本体）
//   ---                水平線
//   空行               段落区切り
//
// Props:
//   ctx            {string[]}   Markdown テキスト（複数渡すと連結される）
//   transform_text {(str) => (vnode|string)[] | string}   (任意、v0.3.38〜)
//                  プロセ（通常テキスト）のテキストノードだけに適用され、
//                  戻り値（vnode/string の配列、または string 単体）で置換される。
//                  例: 資産 ID を自動リンク化する
//                    transform_text: (str) => str.split(/(ast_[a-z0-9]+)/).map(
//                      part => /^ast_/.test(part)
//                        ? { tag: 'a', href: `/assets/${part}`, ctx: [part] }
//                        : part
//                    )
//                  FACT:
//                  - コードブロック（```）とインラインコード（`code`）には
//                    **適用されない**（リテラル性を守るため）。
//                  - 例外を投げた場合は console.error を出し、元のテキストの
//                    まま表示する（NOOP フォールバック、throw しない）。
//                  - 戻り値の vnode に対して transform_text が再帰適用される
//                    ことはない（無限ループ対策、1 パスのみ）。

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

// ── インライン Markdown → VDOM ノード配列 ──────────────────────────
// 太字・斜体・インラインコード・リンクを解析して VDOM ノードの配列を返す。
// ネストは「太字の中に斜体」程度まで対応する。
// transform_text はプロセ（通常テキスト）部分にのみ適用し、インラインコード
// (`m[1]`) には適用しない（リテラル性を守る）。
const _parse_inline = (text, transform_text) => {
  const nodes = [];
  // 正規表現: コード → リンク → 太字 → 斜体 の優先度で探す
  const re = /`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)|\*\*(.+?)\*\*|\*(.+?)\*/g;
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    // マッチ前のプレーンテキスト（プロセ）
    if (m.index > last) _push_prose_text(nodes, text.slice(last, m.index), transform_text);
    if (m[1] !== undefined) {
      // `code` — インラインコードなので transform_text を適用しない
      nodes.push({ tag: 'code', class: 'ric-md-pre__code', ctx: [m[1]] });
    } else if (m[2] !== undefined) {
      // [text](url)
      nodes.push({
        tag: 'a', class: 'ric-md-pre__link',
        href: m[3], target: '_blank', rel: 'noopener',
        ctx: [m[2]],
      });
    } else if (m[4] !== undefined) {
      // **bold** — 中身を再帰パースして斜体等に対応
      nodes.push({ tag: 'strong', ctx: _parse_inline(m[4], transform_text) });
    } else if (m[5] !== undefined) {
      // *italic*
      nodes.push({ tag: 'em', ctx: _parse_inline(m[5], transform_text) });
    }
    last = m.index + m[0].length;
  }
  // 残りのプレーンテキスト（プロセ）
  if (last < text.length) _push_prose_text(nodes, text.slice(last), transform_text);
  return nodes;
};

// ── ブロックレベル Markdown → VDOM ノード配列 ─────────────────────
// 行単位でパースし、VDOM ノードの配列を返す。
// transform_text はコードブロック（```）の中身には適用しない（下記参照）。
const _parse_blocks = (src, transform_text) => {
  const lines = src.split('\n');
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // ── コードブロック ``` ──
    if (line.trimStart().startsWith('```')) {
      const lang = line.trimStart().slice(3).trim() || null;
      const code_lines = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
        code_lines.push(lines[i]);
        i++;
      }
      i++; // ``` の閉じ行をスキップ

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
        ctx: _parse_inline(heading_match[2], transform_text),
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
        ctx: _parse_blocks(quote_lines.join('\n'), transform_text),
      });
      continue;
    }

    // ── リスト - ──
    if (/^\s*[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        const item_text = lines[i].replace(/^\s*[-*]\s+/, '');
        items.push({ tag: 'li', ctx: _parse_inline(item_text, transform_text) });
        i++;
      }
      blocks.push({ tag: 'ul', class: 'ric-md-pre__list', ctx: items });
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
            ctx: _parse_inline(cell, transform_text),
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
            ctx: _parse_inline(cell, transform_text),
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
           !lines[i].trimStart().startsWith('> ') &&
           !/^\s*[-*]\s+/.test(lines[i]) &&
           !/^-{3,}\s*$/.test(lines[i].trim()) &&
           !lines[i].trim().startsWith('|')) {
      para_lines.push(lines[i]);
      i++;
    }
    if (para_lines.length > 0) {
      blocks.push({
        tag: 'p', class: 'ric-md-pre__p',
        ctx: _parse_inline(para_lines.join('\n'), transform_text),
      });
      continue;
    }

    // ── セーフティネット（無限ループ防止）──
    // どの分岐でも line を消費できなかった場合は、その 1 行を素の段落として
    // 吐き出し、必ず i++ する。将来同じ形のバグが混入しても落ちないように
    // while ループの終端を保証する。
    blocks.push({
      tag: 'p', class: 'ric-md-pre__p',
      ctx: _parse_inline(lines[i], transform_text),
    });
    i++;
  }

  return blocks;
};

// ── ui_md_pre 本体 ────────────────────────────────────────────────
// transform_text は rest から分離する（DOM 属性ではないので div へ透過させない）。
const ui_md_pre = ({ ctx = [], transform_text, ...rest } = {}) => {
  const src = ctx.join('\n');
  const children = _parse_blocks(src, transform_text);

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

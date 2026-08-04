'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { ui_md_pre } = require('../ric_ui/text/ui_md_pre');
const c = (md) => ui_md_pre({ ctx: [md] }).ctx;

describe('basic', () => {
  test('tag', () => assert.equal(ui_md_pre().tag, 'div'));
  test('class', () => assert.equal(ui_md_pre().class, 'ric-md-pre'));
  test('empty', () => assert.deepEqual(c(''), []));
});

describe('headings', () => {
  test('h1', () => assert.equal(c('# T')[0].tag, 'h1'));
  test('h2', () => assert.equal(c('## T')[0].tag, 'h2'));
  test('h3', () => assert.equal(c('### T')[0].tag, 'h3'));
});

describe('inline', () => {
  test('bold', () => assert.equal(c('a **b** c')[0].ctx[1].tag, 'strong'));
  test('italic', () => assert.equal(c('a *i* c')[0].ctx[1].tag, 'em'));
  test('code', () => assert.equal(c('a `x` c')[0].ctx[1].tag, 'code'));
  test('link', () => assert.equal(c('[R](http://x)')[0].ctx[0].tag, 'a'));
});

describe('blocks', () => {
  test('list', () => assert.equal(c('- A\n- B')[0].tag, 'ul'));
  test('quote', () => assert.equal(c('> text')[0].tag, 'blockquote'));
  test('fence', () => assert.equal(c('```\nx\n```')[0].tag, 'pre'));
  test('hr', () => assert.equal(c('---')[0].tag, 'hr'));
  test('para', () => assert.equal(c('text')[0].tag, 'p'));
  test('h4', () => { const n = c('#### T')[0]; assert.equal(n.tag, 'h4'); assert.equal(n.class, 'ric-md-pre__h3'); });
});

// 無限ループ回帰テスト：上のブロック分岐で拾われない行が段落に降りてきたときに
// 無限ループせず段落として消費されることを確認する。
// 過去に `#hello` / `#` / `####### ` / `|foo` などで _parse_blocks が無限ループした。
describe('safety net (infinite loop regression)', () => {
  test('#hello (no space)', () => { const n = c('#hello')[0]; assert.equal(n.tag, 'p'); });
  test('# alone',         () => { const n = c('#')[0];       assert.equal(n.tag, 'p'); });
  test('####### (7 #s)',  () => { const n = c('####### hi')[0]; assert.equal(n.tag, 'p'); });
  test('|foo (no table)', () => { const n = c('|foo')[0];    assert.equal(n.tag, 'p'); });
  test('#### alone',      () => { const n = c('####')[0];    assert.equal(n.tag, 'p'); });
  test('mixed', () => {
    // 不正見出し（#bad）は段落の終端ではないので、3 行がひとつの段落にまとまる
    const nodes = c('text1\n#bad\ntext2');
    assert.equal(nodes.length, 1);
    assert.equal(nodes[0].tag, 'p');
  });
  test('valid heading still terminates para', () => {
    // 正しい見出し（## H）は段落の終端になる
    const nodes = c('text1\n## H\ntext2');
    assert.equal(nodes.length, 3);
    assert.equal(nodes[0].tag, 'p');
    assert.equal(nodes[1].tag, 'h2');
    assert.equal(nodes[2].tag, 'p');
  });
});

describe('table', () => {
  const tbl = () => c('| A | B |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |')[0];
  test('tag', () => assert.equal(tbl().tag, 'table'));
  test('class', () => assert.equal(tbl().class, 'ric-md-pre__table'));
  test('thead', () => assert.equal(tbl().ctx[0].tag, 'thead'));
  test('th', () => assert.equal(tbl().ctx[0].ctx[0].ctx[0].ctx[0], 'A'));
  test('tbody rows', () => assert.equal(tbl().ctx[1].ctx.length, 2));
  test('td', () => assert.equal(tbl().ctx[1].ctx[0].ctx[0].ctx[0], '1'));
  test('align center', () => {
    const t = c('| L | C |\n|---|:---:|\n| a | b |')[0];
    assert.equal(t.ctx[0].ctx[0].ctx[1].style, 'text-align:center');
  });
  test('align right', () => {
    const t = c('| L | R |\n|---|---:|\n| a | b |')[0];
    assert.equal(t.ctx[0].ctx[0].ctx[1].style, 'text-align:right');
  });
  test('inline in cell', () => {
    const t = c('| H |\n|---|\n| **b** |')[0];
    assert.equal(t.ctx[1].ctx[0].ctx[0].ctx[0].tag, 'strong');
  });
});

// ─────────────────────────────────────────────────────────────
// transform_text フック (v0.3.38〜、設計OS AI-FUMI v2 consumer 報告)
// ─────────────────────────────────────────────────────────────
// プロセ（通常テキスト）のテキストノードにだけ適用され、コードブロック / インライン
// コードのリテラル性は守られる。例外時は console.error + 元テキストのままの NOOP。
describe('transform_text フック (v0.3.38〜)', () => {

  // 資産 ID (ast_xxx) をリンク化する例。JSDoc の例と同じ発想。
  const linkify_ast = (str) => str.split(/(ast_[a-z0-9]+)/).map(
    (part) => /^ast_/.test(part)
      ? { tag: 'a', href: `/assets/${part}`, ctx: [part] }
      : part,
  );

  test('未指定時は従来と完全一致する（挙動を変えない）', () => {
    const md = '# T\n\n**b** と *i* と `code`\n\n- item1\n- item2\n\n```js\nast_123\n```';
    const with_opt    = ui_md_pre({ ctx: [md] });
    const without_opt = ui_md_pre({ ctx: [md], transform_text: undefined });
    assert.deepEqual(with_opt, without_opt);
  });

  test('プロセのテキストが transform_text の戻り値（配列）で置換される', () => {
    const p = ui_md_pre({ ctx: ['資産 ast_abc123 を参照'], transform_text: linkify_ast }).ctx[0];
    // ['資産 ', {a}, ' を参照'] の 3 要素に分割されるはず
    assert.equal(p.tag, 'p');
    const link = p.ctx.find((n) => typeof n === 'object' && n.tag === 'a');
    assert.ok(link, 'リンクノードが生成されている');
    assert.equal(link.href, '/assets/ast_abc123');
    assert.equal(link.ctx[0], 'ast_abc123');
  });

  test('transform_text が string を返した場合はそのまま 1 ノードとして置換される', () => {
    const upper = (str) => str.toUpperCase();
    const p = ui_md_pre({ ctx: ['hello world'], transform_text: upper }).ctx[0];
    assert.equal(p.ctx[0], 'HELLO WORLD');
  });

  test('見出し / リスト / テーブルセル / 引用でもプロセに適用される', () => {
    const h = ui_md_pre({ ctx: ['# ast_h1'], transform_text: linkify_ast }).ctx[0];
    assert.ok(h.ctx.some((n) => typeof n === 'object' && n.tag === 'a'), 'heading');

    const li = ui_md_pre({ ctx: ['- ast_li1'], transform_text: linkify_ast }).ctx[0].ctx[0];
    assert.ok(li.ctx.some((n) => typeof n === 'object' && n.tag === 'a'), 'list item');

    const quote = ui_md_pre({ ctx: ['> ast_q1'], transform_text: linkify_ast }).ctx[0].ctx[0];
    assert.ok(quote.ctx.some((n) => typeof n === 'object' && n.tag === 'a'), 'blockquote');

    const table = ui_md_pre({ ctx: ['| H |\n|---|\n| ast_td1 |'], transform_text: linkify_ast }).ctx[0];
    const td = table.ctx[1].ctx[0].ctx[0];
    assert.ok(td.ctx.some((n) => typeof n === 'object' && n.tag === 'a'), 'table cell');
  });

  test('コードブロック（フェンス）の中身には適用されない', () => {
    const p = ui_md_pre({ ctx: ['```\nast_should_not_link\n```'], transform_text: linkify_ast }).ctx[0];
    const code_node = p.ctx[0];
    assert.equal(code_node.tag, 'code');
    // 中身がプレーンな元テキストのまま（リンク化されていない）
    assert.equal(code_node.ctx[0], 'ast_should_not_link');
  });

  test('インラインコードの中身には適用されない', () => {
    const p = ui_md_pre({ ctx: ['ast_outer1 `ast_should_not_link` を'], transform_text: linkify_ast }).ctx[0];
    const code_node = p.ctx.find((n) => typeof n === 'object' && n.tag === 'code');
    assert.ok(code_node, 'インラインコードノードが存在する');
    assert.equal(code_node.ctx[0], 'ast_should_not_link');
    // 一方でコードの外側のプロセ部分にはリンクが生成されている
    assert.ok(p.ctx.some((n) => typeof n === 'object' && n.tag === 'a'), '外側のプロセにはリンクがある');
  });

  test('太字 / 斜体の中のプロセにも適用される（再帰 _parse_inline 経由）', () => {
    const p = ui_md_pre({ ctx: ['**ast_bold1**'], transform_text: linkify_ast }).ctx[0];
    const strong = p.ctx.find((n) => typeof n === 'object' && n.tag === 'strong');
    assert.ok(strong, 'strong ノードが存在する');
    assert.ok(strong.ctx.some((n) => typeof n === 'object' && n.tag === 'a'), '太字内にリンクが生成される');
  });

  test('例外を投げたら console.error を出し、元のテキストのまま表示する（NOOP フォールバック）', () => {
    const throwing = () => { throw new Error('boom'); };
    const errors = [];
    const orig_error = console.error;
    console.error = (...args) => { errors.push(args.join(' ')); };
    let p;
    try {
      p = ui_md_pre({ ctx: ['plain text'], transform_text: throwing }).ctx[0];
    } finally {
      console.error = orig_error;
    }
    assert.equal(errors.length, 1, 'console.error が 1 回呼ばれる');
    assert.match(errors[0], /transform_text/);
    assert.equal(p.ctx[0], 'plain text', '元のテキストのまま表示される');
  });

  test('置換結果の vnode に再帰的に transform_text が適用されない（無限ループ対策）', () => {
    // 戻り値の文字列が偶然 transform 対象パターンを含んでいても、
    // 1 パスで消費されるだけで再度 transform_text にはかけられない。
    let call_count = 0;
    const wrap_once = (str) => {
      call_count++;
      return [{ tag: 'span', ctx: [str] }]; // vnode の中に元テキストをそのまま埋め込む
    };
    const p = ui_md_pre({ ctx: ['ast_x'], transform_text: wrap_once }).ctx[0];
    assert.equal(call_count, 1, 'transform_text はプロセ 1 個につき 1 回だけ呼ばれる');
    assert.equal(p.ctx[0].tag, 'span');
    assert.equal(p.ctx[0].ctx[0], 'ast_x');
  });

  test('transform_text は rest スプレッドを介して DOM 属性として漏れない', () => {
    const node = ui_md_pre({ ctx: ['x'], transform_text: linkify_ast });
    assert.equal('transform_text' in node, false);
  });
});

// ─────────────────────────────────────────────────────────────
// hljs 未読み込み時の warn (v0.3.22〜、Rancha dev 報告)
// ─────────────────────────────────────────────────────────────
// `lang` 指定ありで window.hljs が未定義のとき、初回 1 度だけ console.warn を出す。
// silent fallback だと「なぜハイライトされない?」が分からない、を改善。
describe('hljs 未読み込み時の warn (v0.3.22〜)', () => {
  const { _reset_hljs_warning } = require('../ric_ui/_factory_helpers');
  const { JSDOM } = require('jsdom');

  const setup = () => {
    const dom = new JSDOM('<html><body></body></html>');
    global.window = dom.window;
    delete dom.window.hljs;          // hljs が未読み込みであることを保証
    _reset_hljs_warning();
    const warns = [];
    const orig = console.warn;
    console.warn = (...args) => { warns.push(args.join(' ')); };
    return { warns, teardown: () => { console.warn = orig; delete global.window; } };
  };

  test('lang 指定ありで hljs 未定義 → 1 度だけ warn', () => {
    const { warns, teardown } = setup();
    ui_md_pre({ ctx: ['```js\nconst x = 1;\n```'] });
    teardown();
    assert.equal(warns.length, 1, 'warn が 1 回出る');
    assert.match(warns[0], /hljs/, 'メッセージに hljs が含まれる');
  });

  test('複数回呼んでも warn は 1 回のみ (spam 防止)', () => {
    const { warns, teardown } = setup();
    ui_md_pre({ ctx: ['```js\nA\n```'] });
    ui_md_pre({ ctx: ['```py\nB\n```'] });
    ui_md_pre({ ctx: ['```rs\nC\n```'] });
    teardown();
    assert.equal(warns.length, 1, '計 1 回だけ');
  });

  test('lang 指定なし (fenced だが言語ヒント無し) なら warn しない', () => {
    const { warns, teardown } = setup();
    ui_md_pre({ ctx: ['```\nplain\n```'] });
    teardown();
    assert.equal(warns.length, 0, 'hljs を使う意図が無いので warn 不要');
  });

  test('Node 環境 (= window が無い) では warn しない', () => {
    _reset_hljs_warning();
    delete global.window;
    const warns = [];
    const orig = console.warn;
    console.warn = (...args) => { warns.push(args.join(' ')); };
    ui_md_pre({ ctx: ['```js\nx\n```'] });
    console.warn = orig;
    assert.equal(warns.length, 0, 'SSR / Node では発火しない');
  });

  test('ui_code_pre 経由でも同じ flag を共有 (合計 1 回)', () => {
    const { ui_code_pre } = require('../ric_ui/text/ui_code_pre');
    const { warns, teardown } = setup();
    ui_md_pre({ ctx: ['```js\nA\n```'] });
    ui_code_pre({ ctx: ['B'], lang: 'js' });
    teardown();
    assert.equal(warns.length, 1, '両 component を使っても warn は 1 回 (共有 flag)');
  });
});

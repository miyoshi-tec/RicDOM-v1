// RicUI v0.2 — create_ui_page テスト
//
// テスト方針:
//   1. 出力ノードの構造（tag / class / ctx 先頭の style タグ）
//   2. theme / density / font_size が CSS variables 文字列に変換される
//   3. ctx が style タグの後ろに展開される

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { create_ui_page } = require('../ric_ui/layout/ui_page');
const { make_css_vars }  = require('../ric_ui/context');

// create_ui_page() のインスタンスを呼び出すヘルパー（旧 ui_page() 相当）
const ui_page = (props) => create_ui_page()(props);

// =====================================================================
// 1. 出力ノードの構造
// =====================================================================

describe('ui_page: 基本構造', () => {

  test('tag は div', () => {
    assert.equal(ui_page().tag, 'div');
  });

  test('class は ric-page', () => {
    assert.equal(ui_page().class, 'ric-page');
  });

  test('ctx[0] が style タグ', () => {
    const node = ui_page();
    const style_node = node.ctx[0];
    assert.equal(style_node.tag, 'style');
  });

  test('style タグの ctx[0] が文字列（CSS）', () => {
    const node = ui_page();
    const css = node.ctx[0].ctx[0];
    assert.equal(typeof css, 'string');
  });

  test('渡した ctx が style タグの後ろに展開される', () => {
    const child1 = { tag: 'div' };
    const child2 = { tag: 'p' };
    const node = ui_page({ ctx: [child1, child2] });

    assert.equal(node.ctx[1], child1);
    assert.equal(node.ctx[2], child2);
  });

  test('ctx が空のとき ctx.length は 1（style タグのみ）', () => {
    assert.equal(ui_page().ctx.length, 1);
  });
});

describe('ui_page: style（CSS variables）', () => {

  test('style が文字列（cssText 形式）で設定される', () => {
    const node = ui_page();
    assert.equal(typeof node.style, 'string');
  });

  test('style に --ric- 変数が含まれる', () => {
    const node = ui_page();
    assert.ok(node.style.includes('--ric-'), 'style に --ric-* 変数がある');
  });
});

// =====================================================================
// 2. theme / density / font_size の CSS variables 変換
// =====================================================================

describe('make_css_vars: theme', () => {

  test('theme=light のとき light カラー変数が含まれる', () => {
    const vars = make_css_vars({ theme: 'light' });
    assert.ok(vars.includes('--ric-color-bg: #f9fafb'), 'light の bg 色');
  });

  test('theme=dark のとき dark カラー変数が含まれる', () => {
    const vars = make_css_vars({ theme: 'dark' });
    assert.ok(vars.includes('--ric-color-bg: #111318'), 'dark の bg 色');
  });

  test('theme=cyber のとき accent が水色系', () => {
    const vars = make_css_vars({ theme: 'cyber' });
    assert.ok(vars.includes('--ric-color-accent: #38bdf8'), 'cyber の accent 色');
  });

  test('theme=aqua のとき accent がブルー系', () => {
    const vars = make_css_vars({ theme: 'aqua' });
    assert.ok(vars.includes('--ric-color-accent: #0284c7'), 'aqua の accent 色');
  });

  test('theme 省略（デフォルト）は light と同じ', () => {
    const with_default = make_css_vars({});
    const with_light   = make_css_vars({ theme: 'light' });
    assert.equal(with_default, with_light);
  });

  test('不明な theme は light にフォールバックする', () => {
    const vars_unknown = make_css_vars({ theme: 'unknown' });
    const vars_light   = make_css_vars({ theme: 'light' });
    assert.equal(vars_unknown, vars_light);
  });
});

// --ric-code-bg / --ric-code-fg (v0.4.1〜)
// 従来 ui_md_pre のフェンス / ui_code_pre が --ric-tooltip-bg/fg を流用していたため、
// light 系テーマでも常にダーク表示になるバグがあった。専用トークンを全 5 テーマに
// 追加し、light 系は明色、dark 系は暗色になるようにした修正の回帰テスト。
describe('make_css_vars: code トークン (v0.4.1〜)', () => {

  test('全 5 テーマで --ric-code-bg / --ric-code-fg が定義される', () => {
    for (const theme of ['light', 'dark', 'teal', 'cyber', 'aqua']) {
      const vars = make_css_vars({ theme });
      assert.match(vars, /--ric-code-bg: /, `${theme}: --ric-code-bg が無い`);
      assert.match(vars, /--ric-code-fg: /, `${theme}: --ric-code-fg が無い`);
    }
  });

  test('light 系テーマ（light/teal/aqua）は明るい code 背景になる（旧バグ回帰防止）', () => {
    // 旧実装は --ric-tooltip-bg を流用しており、light テーマでも #1f2937 のような
    // 暗い背景になっていた。新トークンは light 系では明るい背景であること。
    for (const theme of ['light', 'teal', 'aqua']) {
      const vars = make_css_vars({ theme });
      const m = vars.match(/--ric-code-bg: ([^;]+)/);
      assert.ok(m, `${theme}: --ric-code-bg が見つからない`);
      assert.notEqual(m[1].trim(), 'var(--ric-tooltip-bg)', `${theme}: tooltip 流用のままになっている`);
    }
  });

  test('dark 系テーマ（dark/cyber）は暗い code 背景になる', () => {
    const dark_vars  = make_css_vars({ theme: 'dark' });
    const cyber_vars = make_css_vars({ theme: 'cyber' });
    assert.match(dark_vars, /--ric-code-bg: #374151/);
    assert.match(cyber_vars, /--ric-code-bg: rgba\(4,7,15,0\.92\)/);
  });

  test('ric-md-pre__fence / ric-code-pre の CSS が --ric-code-bg/fg を参照する（--ric-tooltip-bg/fg ではない）', () => {
    const { CSS_TEMPLATES } = require('../ric_ui/css_templates');
    const md_pre_css   = CSS_TEMPLATES['ric-md-pre']();
    const code_pre_css = CSS_TEMPLATES['ric-code-pre']();

    assert.match(md_pre_css, /\.ric-md-pre__fence\s*\{[^}]*var\(--ric-code-bg\)/);
    assert.match(md_pre_css, /\.ric-md-pre__fence\s*\{[^}]*var\(--ric-code-fg\)/);
    assert.match(code_pre_css, /\.ric-code-pre\s*\{[^}]*var\(--ric-code-bg\)/);
    assert.match(code_pre_css, /\.ric-code-pre\s*\{[^}]*var\(--ric-code-fg\)/);

    // tooltip 側の参照は変えない（回帰防止）
    const tooltip_css = CSS_TEMPLATES['ric-tooltip']();
    assert.match(tooltip_css, /var\(--ric-tooltip-bg\)/);
    assert.match(tooltip_css, /var\(--ric-tooltip-fg\)/);
  });
});

describe('make_css_vars: density', () => {

  test('density=comfortable のとき gap が 6px', () => {
    const vars = make_css_vars({ density: 'comfortable' });
    assert.ok(vars.includes('--ric-gap: 6px'));
  });

  test('density=compact のとき gap が 4px', () => {
    const vars = make_css_vars({ density: 'compact' });
    assert.ok(vars.includes('--ric-gap: 4px'));
  });

  test('gap-md は gap から自動導出される', () => {
    const vars = make_css_vars({ density: 'comfortable' });
    assert.ok(vars.includes('--ric-gap-md: calc(var(--ric-gap) * 2)'));
  });

  test('density=comfortable のとき control-h が 36px', () => {
    const vars = make_css_vars({ density: 'comfortable' });
    assert.ok(vars.includes('--ric-control-h: 36px'));
  });

  test('density=compact のとき control-h が 28px', () => {
    const vars = make_css_vars({ density: 'compact' });
    assert.ok(vars.includes('--ric-control-h: 28px'));
  });

  test('density 省略（デフォルト）は comfortable と同じ', () => {
    const with_default      = make_css_vars({});
    const with_comfortable  = make_css_vars({ density: 'comfortable' });
    assert.equal(with_default, with_comfortable);
  });
});

describe('make_css_vars: font_size', () => {

  test('font_size=md のとき font-size が 14px', () => {
    const vars = make_css_vars({ font_size: 'md' });
    assert.ok(vars.includes('--ric-font-size: 14px'));
  });

  test('font_size=sm のとき font-size が 12px', () => {
    const vars = make_css_vars({ font_size: 'sm' });
    assert.ok(vars.includes('--ric-font-size: 12px'));
  });

  test('font_size=lg のとき font-size が 16px', () => {
    const vars = make_css_vars({ font_size: 'lg' });
    assert.ok(vars.includes('--ric-font-size: 16px'));
  });

  test('font_size 省略（デフォルト）は md と同じ', () => {
    const with_default = make_css_vars({});
    const with_md      = make_css_vars({ font_size: 'md' });
    assert.equal(with_default, with_md);
  });
});

describe('make_css_vars: theme が density の --ric-radius を上書きできる', () => {

  test('cyber テーマは --ric-radius: 0px で density の radius を上書きする', () => {
    const vars = make_css_vars({ theme: 'cyber', density: 'comfortable' });
    // comfortable は 8px だが cyber の 0px が優先される
    // 文字列内に複数あっても、最後の値が 0px であることを確認
    const entries = vars.split(';').map(s => s.trim()).filter(Boolean);
    const radius_entries = entries.filter(e => e.startsWith('--ric-radius'));
    // 最後のエントリが cyber の値
    const last_radius = radius_entries[radius_entries.length - 1];
    assert.ok(last_radius.includes('0px'), `cyber は radius=0px だが実際は: ${last_radius}`);
  });
});

// =====================================================================
// 3. ui_page と CSS 収集
// =====================================================================

describe('ui_page: CSS 収集（collect_classes）', () => {

  test('ctx に ric-col を含む子を渡すと style に .ric-col の CSS が入る', () => {
    const { ui_col } = require('../ric_ui/layout/ui_col');
    const node = ui_page({ ctx: [ui_col({ ctx: ['テスト'] })] });
    const css = node.ctx[0].ctx[0];
    assert.ok(css.includes('ric-col'), 'ric-col の CSS が生成されている');
  });

  test('ui_page 自身の ric-page CSS も含まれる', () => {
    const node = ui_page();
    const css = node.ctx[0].ctx[0];
    assert.ok(css.includes('ric-page'), 'ric-page の CSS が含まれる');
  });
});

// =====================================================================
// 4. rest スプレッド（任意属性透過）
// =====================================================================

describe('ui_page: rest スプレッド', () => {
  test('onclick が透過される', () => {
    const fn = () => {};
    assert.equal(ui_page({ onclick: fn }).onclick, fn);
  });
  test('id / data-* / aria-* が透過される', () => {
    const n = ui_page({ id: 'main', 'data-role': 'page', 'aria-label': 'App' });
    assert.equal(n.id, 'main');
    assert.equal(n['data-role'], 'page');
    assert.equal(n['aria-label'], 'App');
  });
  test('class が ric-page の後ろに連結される', () => {
    assert.equal(ui_page({ class: 'theme-x' }).class, 'ric-page theme-x');
  });
  test('rest で tag を上書きできない', () => {
    assert.equal(ui_page({ tag: 'span' }).tag, 'div');
  });
  test('rest で ctx を上書きしようとしても style タグ + 指定 ctx の構造が保たれる', () => {
    const child = { tag: 'div' };
    const n = ui_page({ ctx: [child] });
    // ctx[0] は <style>、ctx[1] に渡した child が来る
    assert.equal(n.ctx[0].tag, 'style');
    assert.equal(n.ctx[1], child);
  });
});

// =====================================================================
// 5. state 外配置の検知 (v0.3.35〜、Unizon kiosk consumer 報告)
//
//   'ric-theme-change' イベントが一度も発火しない kiosk アプリでは、既存の
//   window リスナー経由の safe_notify では __notify 欠如を検知できない
//   (イベントが来ないと safe_notify 自体が呼ばれないため)。
//   初回 render 時点で __notify の有無を直接チェックして warn する。
// =====================================================================

describe('ui_page: state 外配置の検知', () => {

  // console.warn をキャプチャするヘルパ (tests/factory_safe_notify.test.js と同じ流儀)
  const capture_warns = () => {
    const captured = [];
    const original = console.warn;
    console.warn = (...args) => { captured.push(args.join(' ')); };
    return {
      captured,
      restore: () => { console.warn = original; },
    };
  };

  test('s.page = create_ui_page() として state に正しく置いた場合、render で warn しない', async () => {
    const { setup_jsdom, flush } = require('./_helpers/jsdom_env');
    setup_jsdom();
    const w = capture_warns();
    try {
      const { create_RicDOM } = require('../src/ricdom');
      const target = document.querySelector('#app');
      create_RicDOM(target, {
        page: create_ui_page({ theme: 'light' }),
        render: (s) => s.page({ ctx: ['hello'] }),
      });
      await flush();

      const warned = w.captured.filter(s => s.includes('create_ui_page() instance has no __notify'));
      assert.equal(warned.length, 0, 'state に正しく置いた正規使用で warn が出てはいけない');
    } finally {
      w.restore();
      delete global.window;
      delete global.document;
      delete global.Node;
      delete global.HTMLElement;
      delete global.requestAnimationFrame;
    }
  });

  test('state 外 (module scope const) で呼んだ場合、初回 render で warn が 1 回出る', () => {
    const w = capture_warns();
    try {
      // state に入れない使い方 — __notify は注入されない
      const page = create_ui_page();
      page({ ctx: ['hello'] });

      const warned = w.captured.filter(s => s.includes('create_ui_page() instance has no __notify'));
      assert.equal(warned.length, 1, 'state 外置きで初回 render に 1 回 warn する');
      assert.match(warned[0], /state のトップレベルに置いてください/);
    } finally {
      w.restore();
    }
  });

  test('同じ page インスタンスで複数回 render しても warn は 1 回だけ (spam 防止)', () => {
    const w = capture_warns();
    try {
      const page = create_ui_page();
      page({ ctx: ['a'] });
      page({ ctx: ['b'] });
      page({ ctx: ['c'] });

      const warned = w.captured.filter(s => s.includes('create_ui_page() instance has no __notify'));
      assert.equal(warned.length, 1, '複数回 render しても warn は 1 回だけ');
    } finally {
      w.restore();
    }
  });

  test('warn が出ても render 自体は throw せず正常に VDOM を返す', () => {
    const w = capture_warns();
    try {
      const page = create_ui_page();
      const node = page({ ctx: ['hello'] });

      assert.equal(node.tag, 'div');
      assert.equal(node.class, 'ric-page');
      assert.equal(node.ctx[0].tag, 'style');
      assert.equal(node.ctx[1], 'hello');
    } finally {
      w.restore();
    }
  });
});

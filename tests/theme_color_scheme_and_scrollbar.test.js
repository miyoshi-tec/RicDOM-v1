'use strict';

// RicUI v0.4.2 — テーマの color-scheme + ページ全体スクロールバー既定スタイル
//
// 背景 (consumer 要望第 3 弾、RaccoonMemo/Rancha/Brownies Desktop 共通):
//   RicUI のテーマは CSS 変数の色付けのみで color-scheme を宣言しないため、
//   ダークテーマでも UA ネイティブ描画（スクロールバー・select・checkbox・
//   日付ピッカー等）が白いまま。3 アプリが同一 workaround を個別実装していた。
//
// テスト方針:
//   A. make_css_vars の出力に color-scheme が全 5 テーマ分正しく含まれる /
//      create_theme の継承・上書き / export_theme・export_settings が
//      color-scheme を round-trip できる
//   B. build_css / css_for('ric-page') の出力に ::-webkit-scrollbar 規則と
//      新トークンが含まれる / make_css_vars にトークン自動導出が含まれる /
//      .ric-scroll-pane が新トークン参照に統一されている

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  make_css_vars,
  create_theme,
  export_theme,
  export_settings,
} = require('../ric_ui/context');
const { CSS_TEMPLATES } = require('../ric_ui/css_templates');
const { css_for } = require('../ric_ui/css_registry');

// =====================================================================
// A. color-scheme
// =====================================================================

describe('make_css_vars: color-scheme (v0.4.2〜)', () => {

  test('全 5 テーマで color-scheme が出力に含まれる', () => {
    for (const theme of ['light', 'dark', 'teal', 'cyber', 'aqua']) {
      const vars = make_css_vars({ theme });
      assert.match(vars, /color-scheme: \w+/, `${theme}: color-scheme が無い`);
    }
  });

  test('light 系テーマ（light/teal/aqua）は --ric-color-bg が明るく、color-scheme: light', () => {
    for (const theme of ['light', 'teal', 'aqua']) {
      const vars = make_css_vars({ theme });
      assert.match(vars, /color-scheme: light/, `${theme}: light であるべき`);
    }
  });

  test('dark 系テーマ（dark/cyber）は --ric-color-bg が暗く、color-scheme: dark', () => {
    for (const theme of ['dark', 'cyber']) {
      const vars = make_css_vars({ theme });
      assert.match(vars, /color-scheme: dark/, `${theme}: dark であるべき`);
    }
  });

  test('theme 省略（デフォルト）は light と同じ color-scheme', () => {
    const with_default = make_css_vars({});
    const with_light   = make_css_vars({ theme: 'light' });
    assert.equal(with_default, with_light);
  });
});

describe('create_theme: color-scheme の継承・上書き', () => {

  test('ベーステーマから color-scheme を継承する', () => {
    const custom = create_theme('dark', { '--ric-color-accent': '#ff00ff' });
    assert.equal(custom['color-scheme'], 'dark');
  });

  test('ベーステーマ light から継承する', () => {
    const custom = create_theme('light', {});
    assert.equal(custom['color-scheme'], 'light');
  });

  test('overrides で color-scheme を明示的に上書きできる', () => {
    const custom = create_theme('light', { 'color-scheme': 'dark' });
    assert.equal(custom['color-scheme'], 'dark');
  });

  test('create_theme が返すオブジェクトを make_css_vars に渡すと上書きした color-scheme が出力される', () => {
    const custom = create_theme('light', { 'color-scheme': 'dark' });
    const vars = make_css_vars({ theme: custom });
    assert.match(vars, /color-scheme: dark/);
  });
});

describe('export_theme / export_settings: color-scheme の round-trip (v0.4.2〜)', () => {

  // page 要素を模した最小オブジェクト（_parse_css_text は el.style.cssText を読む）
  const fake_page_el = (cssText) => ({ style: { cssText } });

  test('export_theme が color-scheme を含む', () => {
    const vars = make_css_vars({ theme: 'dark' });
    const result = export_theme(fake_page_el(vars));
    assert.equal(result['color-scheme'], 'dark');
  });

  test('export_settings の theme グループに color-scheme が入る（density/font_size には入らない）', () => {
    const vars = make_css_vars({ theme: 'cyber', density: 'compact', font_size: 'lg' });
    const { theme, density, font_size } = export_settings(fake_page_el(vars));
    assert.equal(theme['color-scheme'], 'dark');
    assert.equal(density['color-scheme'], undefined);
    assert.equal(font_size['color-scheme'], undefined);
  });
});

// =====================================================================
// B. スクロールバー既定スタイル + トークン
// =====================================================================

describe('make_css_vars: スクロールバートークン自動導出 (v0.4.2〜)', () => {

  test('未指定時、--ric-scrollbar-thumb / --ric-scrollbar-thumb-hover が自動導出される', () => {
    const vars = make_css_vars({ theme: 'light' });
    assert.match(vars, /--ric-scrollbar-thumb: color-mix\(in srgb, var\(--ric-color-fg\) 30%, transparent\)/);
    assert.match(vars, /--ric-scrollbar-thumb-hover: color-mix\(in srgb, var\(--ric-color-fg\) 50%, transparent\)/);
  });

  test('テーマオブジェクトで明示指定した場合はそちらが優先される', () => {
    const custom = create_theme('light', { '--ric-scrollbar-thumb': '#ff0000' });
    const vars = make_css_vars({ theme: custom });
    assert.match(vars, /--ric-scrollbar-thumb: #ff0000/);
    assert.ok(!vars.includes('color-mix(in srgb, var(--ric-color-fg) 30%'), '明示指定時は自動導出が上書きされない');
  });
});

describe('CSS_TEMPLATES / css_for: ric-page のスクロールバー規則', () => {

  test('ric-page テンプレートに ::-webkit-scrollbar 系規則が含まれる（自身 + 配下）', () => {
    const css = CSS_TEMPLATES['ric-page']();
    assert.match(css, /\.ric-page::-webkit-scrollbar\b/, '.ric-page 自身のルールが無い');
    assert.match(css, /\.ric-page \*::-webkit-scrollbar\b/, '.ric-page 配下のルールが無い');
    assert.match(css, /::-webkit-scrollbar-thumb\s*,\s*\.ric-page \*::-webkit-scrollbar-thumb\s*\{\s*background: var\(--ric-scrollbar-thumb\)/);
    assert.match(css, /::-webkit-scrollbar-thumb:hover[\s\S]*background: var\(--ric-scrollbar-thumb-hover\)/);
    assert.match(css, /::-webkit-scrollbar-track/, 'track ルールが無い');
    assert.match(css, /::-webkit-scrollbar-corner/, 'corner ルールが無い');
  });

  test('ric-page テンプレートに Firefox 用 scrollbar-width/scrollbar-color が含まれる', () => {
    const css = CSS_TEMPLATES['ric-page']();
    assert.match(css, /scrollbar-width: thin/);
    assert.match(css, /scrollbar-color: var\(--ric-scrollbar-thumb\) transparent/);
  });

  test('css_for(\'ric-page\') の出力にも同じ規則が含まれる（build_css 経由でも一致）', () => {
    const css = css_for('ric-page');
    assert.match(css, /\.ric-page::-webkit-scrollbar\b/);
    assert.match(css, /var\(--ric-scrollbar-thumb\)/);
    assert.match(css, /var\(--ric-scrollbar-thumb-hover\)/);
  });

  test('create_ui_page が注入する CSS にもスクロールバー規則が含まれる', () => {
    const { create_ui_page } = require('../ric_ui/layout/ui_page');
    const page = create_ui_page()({ ctx: [] });
    const injected_css = page.ctx[0].ctx[0];
    assert.match(injected_css, /var\(--ric-scrollbar-thumb\)/);
  });
});

describe('CSS_TEMPLATES: ric-scroll-pane は新トークン参照に統一（見た目は現状維持）', () => {

  test('ric-scroll-pane が --ric-scrollbar-thumb を参照する（旧 --ric-color-fg-muted ではない）', () => {
    const css = CSS_TEMPLATES['ric-scroll-pane']();
    assert.match(css, /scrollbar-color: var\(--ric-scrollbar-thumb\) transparent/);
    assert.match(css, /::-webkit-scrollbar-thumb\s*\{\s*background: var\(--ric-scrollbar-thumb\)/);
    assert.ok(!css.includes('--ric-color-fg-muted'), '旧トークン参照が残っていない');
  });
});

// RicUI — Context ユーティリティ
// theme / density / font_size の 3 キーを CSS variables 文字列に変換する。
// make_css_vars() が create_ui_page / create_ui_panel から呼ばれる中心関数。

'use strict';

// ──────────────────────────────────────────────
// theme → 色変数
// ──────────────────────────────────────────────

const COLOR_VARS_LIGHT = {
  '--ric-color-fg':         '#111827',
  '--ric-color-fg-muted':   '#6b7280',
  '--ric-color-bg':          '#f9fafb',
  '--ric-color-control':   '#ffffff',
  '--ric-color-border':     '#e5e7eb',
  '--ric-color-accent':     '#2563eb',
  '--ric-color-accent-fg':  '#ffffff',   // アクセント背景上のテキスト色
  '--ric-tooltip-bg':       '#1f2937',   // ツールチップ背景
  '--ric-tooltip-fg':       '#f9fafb',   // ツールチップ文字色
  // コードブロック配色 (v0.4.1〜、tooltip とは独立)。light 系テーマなので
  // 明るい背景 + 暗い文字（従来 tooltip 流用でダーク固定になっていたバグの修正）。
  '--ric-code-bg':          '#f6f8fa',
  '--ric-code-fg':          '#24292f',
  // shadow / animation / overlay
  '--ric-shadow':           '0 4px 16px rgba(0,0,0,0.10)',
  '--ric-radius':           '8px',
};

const COLOR_VARS_DARK = {
  '--ric-color-fg':         '#e5e7eb',
  '--ric-color-fg-muted':   '#9ca3af',
  '--ric-color-bg':          '#111318',
  '--ric-color-control':   '#1a1d24',
  '--ric-color-border':     '#2a2f3a',
  '--ric-color-accent':     '#60a5fa',
  '--ric-color-accent-fg':  '#0f1115',   // 明るいアクセント上には暗いテキスト
  '--ric-tooltip-bg':       '#374151',
  '--ric-tooltip-fg':       '#f9fafb',
  // コードブロック配色 (v0.4.1〜)。dark 系テーマなので従来の tooltip 値相当を踏襲。
  '--ric-code-bg':          '#374151',
  '--ric-code-fg':          '#f9fafb',
  // shadow / animation / overlay
  '--ric-shadow':           '0 4px 24px rgba(0,0,0,0.50)',
  '--ric-radius':           '8px',
};

// ティールテーマ：ライトベースで緑系アクセント
// light の青アクセントをティール（青緑）に差し替えたバリアント。
// JSON エディタなど緑系 UI に適している。
const COLOR_VARS_TEAL = {
  '--ric-color-fg':         '#0d2b24',
  '--ric-color-fg-muted':   '#46605a',
  '--ric-color-bg':          'linear-gradient(135deg, #e6f9f0 0%, #f2f9f7 40%, #fef3c7 70%, #fce7f3 100%)',
  '--ric-color-control':   'rgba(255,255,255,0.9)',
  '--ric-color-border':     '#c5ddd8',
  '--ric-color-accent':     '#007f6d',
  '--ric-color-accent-fg':  '#ffffff',
  '--ric-tooltip-bg':       '#0d2b24',
  '--ric-tooltip-fg':       '#f0fdf9',
  // コードブロック配色 (v0.4.1〜)。light 系テーマなので明るい背景 + 暗い文字。
  // パレットのボーダー/背景トーン（#c5ddd8 / #e6f9f0）に合わせたティール寄りの明色。
  '--ric-code-bg':          '#e6f2ef',
  '--ric-code-fg':          '#0d2b24',
  // shadow / animation / overlay
  '--ric-shadow':           '0 4px 16px rgba(0,60,50,0.12)',
  '--ric-radius':           '8px',
};

// サイバーテーマ：ダークガラス・ネオン青緑
// パネルと背景が半透明。背後が透けて見えるグラスモーフィズム。

const COLOR_VARS_CYBER = {
  '--ric-color-fg':          '#e2e8f0',
  '--ric-color-fg-muted':    '#7aa8c8',
  '--ric-color-bg':           'radial-gradient(ellipse at top left,#5500aa 0%,transparent 50%),radial-gradient(ellipse at top right,#007799 0%,transparent 50%),radial-gradient(ellipse at bottom left,#660033 0%,transparent 50%),radial-gradient(ellipse at bottom right,#003388 0%,transparent 50%),#04070f',
  '--ric-color-control':    'rgba(10,18,40,0.5)',
  '--ric-color-border':      'rgba(80,200,255,0.65)',
  '--ric-color-accent':      '#38bdf8',
  '--ric-color-accent-fg':   '#04070f',   // ネオン上には黒テキスト（コントラスト確保）
  '--ric-tooltip-bg':        'rgba(4,7,15,0.92)',
  '--ric-tooltip-fg':        '#38bdf8',   // ネオン文字
  // コードブロック配色 (v0.4.1〜)。dark 系テーマなので従来の tooltip 値相当（ネオン）を踏襲。
  '--ric-code-bg':           'rgba(4,7,15,0.92)',
  '--ric-code-fg':           '#38bdf8',
  // glass 効果
  '--ric-popup-bg':          'rgba(10,18,40,0.4)',
  '--ric-popup-blur':        'blur(10px)',
  // box-shadow は clip-path の外側でクリップされるため inset のみ使用
  '--ric-panel-shadow':      'inset 0 1px 0 rgba(255,255,255,0.15), inset 0 0 0 1px rgba(80,200,255,0.5)',
  // 角丸なし（すべての要素をシャープに）
  '--ric-radius':            '0px',
  // shadow / animation / overlay（ネオン発光シャドウ・高速）
  '--ric-shadow':            '0 0 20px rgba(0,200,255,0.25), inset 0 1px 0 rgba(80,200,255,0.15)',
  '--ric-duration':          '80ms',
  '--ric-easing':            'linear',
};

// アクアテーマ：水滴ガラス・やわらかブルー
// 淡い海の透明パネルに大きな角丸で水滴・波のような印象。
const COLOR_VARS_AQUA = {
  '--ric-color-fg':          '#1a2c3c',
  '--ric-color-fg-muted':    '#5c7a8a',
  '--ric-color-bg':           'radial-gradient(ellipse at top left,#c0e8f8 0%,transparent 55%),radial-gradient(ellipse at top right,#a0d4f0 0%,transparent 55%),radial-gradient(ellipse at bottom left,#7ab8e8 0%,transparent 55%),radial-gradient(ellipse at bottom right,#90c8e0 0%,transparent 55%),#a0d8f0',
  '--ric-color-control':    'rgba(255,255,255,0.5)',
  '--ric-color-border':      'rgba(100,170,210,0.35)',
  '--ric-color-accent':      '#0284c7',
  '--ric-color-accent-fg':   '#ffffff',
  '--ric-tooltip-bg':        'rgba(20,45,70,0.92)',
  '--ric-tooltip-fg':        '#f0f8ff',
  // コードブロック配色 (v0.4.1〜)。light 系テーマなので明るいガラス背景 + 暗い文字。
  '--ric-code-bg':           'rgba(255,255,255,0.55)',
  '--ric-code-fg':           '#1a2c3c',
  // glass 効果
  '--ric-popup-bg':          'rgba(255,255,255,0.4)',
  '--ric-popup-blur':        'blur(10px)',
  '--ric-panel-shadow':      '0 8px 32px rgba(20,80,140,0.08), inset 0 1px 0 rgba(255,255,255,0.75)',
  // 水滴らしい大きな角丸
  '--ric-radius':            '20px',
  // shadow / animation（やわらか・スプリング — 水滴が揺れるような「行き過ぎて戻る」）
  '--ric-shadow':            '0 4px 20px rgba(20,80,140,0.12), inset 0 1px 0 rgba(255,255,255,0.60)',
  '--ric-duration':          '600ms',
  '--ric-easing':            'linear(0, 0.009, 0.035 2.1%, 0.141 4.4%, 0.723 12.9%, 0.938 16.7%, 1.017, 1.069, 1.099 24.3%, 1.105 26%, 1.096 27.9%, 1.053 32.8%, 1.019 38.1%, 0.999 44.2%, 0.995 51.9%, 1.0 62.6%, 1.001 99.9%)',
};

// ──────────────────────────────────────────────
// density → 寸法変数
// ──────────────────────────────────────────────

const SIZE_VARS_COMFORTABLE = {
  '--ric-gap':       '6px',
  '--ric-pad-x':     '14px',
  '--ric-pad-y':     '8px',
  '--ric-control-h': '36px',
};

const SIZE_VARS_COMPACT = {
  '--ric-gap':       '4px',
  '--ric-pad-x':     '10px',
  '--ric-pad-y':     '4px',
  '--ric-control-h': '28px',
};

const SIZE_VARS_TIGHT = {
  '--ric-gap':       '1px',
  '--ric-pad-x':     '6px',
  '--ric-pad-y':     '1px',
  '--ric-control-h': '22px',
};

// ──────────────────────────────────────────────
// font_size → ベースフォントサイズ
// .ric-page の font-size を設定し、各コンポーネントは em 相対値で自動スケール。
//   0.85em : ラベル・補助テキスト
//   1em    : 本文・ボタン・入力
//   1.25em : タイトル
// ──────────────────────────────────────────────

const FONT_VARS_SM = { '--ric-font-size': '12px' };
const FONT_VARS_MD = { '--ric-font-size': '14px' };
const FONT_VARS_LG = { '--ric-font-size': '16px' };

// ──────────────────────────────────────────────
// 内部ヘルパー：文字列またはオブジェクトをプリセット変数オブジェクトに解決する
// ──────────────────────────────────────────────

const _resolve_color_vars = (theme) => {
  if (theme !== null && typeof theme === 'object') return theme;
  return theme === 'dark'    ? COLOR_VARS_DARK
       : theme === 'teal'    ? COLOR_VARS_TEAL
       : theme === 'cyber'   ? COLOR_VARS_CYBER
       : theme === 'aqua' ? COLOR_VARS_AQUA
       :                       COLOR_VARS_LIGHT;
};

const _resolve_size_vars = (density) => {
  if (density !== null && typeof density === 'object') return density;
  return density === 'tight'   ? SIZE_VARS_TIGHT
       : density === 'compact' ? SIZE_VARS_COMPACT
       :                         SIZE_VARS_COMFORTABLE;
};

const _resolve_font_vars = (font_size) => {
  if (font_size !== null && typeof font_size === 'object') return font_size;
  return font_size === 'sm' ? FONT_VARS_SM
       : font_size === 'lg' ? FONT_VARS_LG
       :                      FONT_VARS_MD;
};

// ──────────────────────────────────────────────
// make_css_vars: Context → cssText 文字列
// create_ui_page() がルート div の style に渡す形式で返す。
//
// RicDOM の normalize_style はキーをキャメルケース変換するため、
// CSS カスタムプロパティ（--ric-*）はオブジェクト形式では機能しない。
// 文字列（cssText 形式）で渡すことで el.style.cssText に直接設定される。
// ──────────────────────────────────────────────

const make_css_vars = ({ theme = 'light', density = 'comfortable', font_size = 'md' } = {}) => {
  const color = _resolve_color_vars(theme);
  const size  = _resolve_size_vars(density);
  const font  = _resolve_font_vars(font_size);
  // --ric-radius はテーマ専用（density には含まない）
  const vars  = { ...size, ...font, ...color };
  // fg-muted / border が未指定の場合、fg から color-mix で自動導出
  if (!vars['--ric-color-fg-muted']) {
    vars['--ric-color-fg-muted'] = 'color-mix(in srgb, var(--ric-color-fg) 50%, transparent)';
  }
  if (!vars['--ric-color-border']) {
    vars['--ric-color-border'] = 'color-mix(in srgb, var(--ric-color-fg) 15%, transparent)';
  }
  // gap-md を gap から自動導出（gap * 2）
  if (!vars['--ric-gap-md']) {
    vars['--ric-gap-md'] = 'calc(var(--ric-gap) * 2)';
  }
  // duration / easing のデフォルト値（テーマで上書き可能）
  if (!vars['--ric-duration']) vars['--ric-duration'] = '200ms';
  if (!vars['--ric-easing'])   vars['--ric-easing']   = 'ease';
  return Object.entries(vars).map(([k, v]) => `${k}: ${v}`).join('; ');
};

// ──────────────────────────────────────────────
// create_theme: ベーステーマに部分上書きしたカスタムテーマオブジェクトを返す
//
// 使い方：
//   const my_theme = create_theme('teal', { '--ric-color-accent': '#e91e8c' });
//   create_ui_page({ theme: my_theme })
//
//   // 完全カスタム（ベースなし）
//   const my_theme = create_theme({ '--ric-color-fg': '#fff', ... });
//
// 引数：
//   base     : 'light' | 'dark' | 'teal' | 'cyber' | 'aqua' | オブジェクト
//   overrides: 上書きする CSS 変数のオブジェクト（省略可）
// ──────────────────────────────────────────────
const create_theme = (base = 'light', overrides = {}) => {
  return { ..._resolve_color_vars(base), ...overrides };
};

// ──────────────────────────────────────────────
// create_density: ベース density に部分上書きしたカスタム寸法オブジェクトを返す
//
// 使い方：
//   const my_density = create_density('compact', { '--ric-control-h': '24px' });
//   create_ui_page({ density: my_density })
//
// 引数：
//   base     : 'comfortable' | 'compact' | 'tight' | オブジェクト
//   overrides: 上書きする CSS 変数のオブジェクト（省略可）
// ──────────────────────────────────────────────
const create_density = (base = 'comfortable', overrides = {}) => {
  return { ..._resolve_size_vars(base), ...overrides };
};

// ──────────────────────────────────────────────
// create_font_size: ベース font_size に部分上書きしたカスタムフォントオブジェクトを返す
//
// 使い方：
//   const my_font = create_font_size('md', { '--ric-font-size': '16px' });
//   create_ui_page({ font_size: my_font })
//
// 引数：
//   base     : 'sm' | 'md' | 'lg' | オブジェクト
//   overrides: 上書きする CSS 変数のオブジェクト（省略可）
// ──────────────────────────────────────────────
const create_font_size = (base = 'md', overrides = {}) => {
  return { ..._resolve_font_vars(base), ...overrides };
};

// ──────────────────────────────────────────────
// export_theme: ui_page 要素から現在のテーマ変数をオブジェクトで取り出す
//
// density・font 系の変数は除外し、テーマ固有の変数（色・装飾）のみ返す。
// density と font_size まで含めて保存したい場合は export_settings() を使用する。
//
// 使い方：
//   const saved = export_theme(document.querySelector('.ric-page'));
//   localStorage.setItem('theme', JSON.stringify(saved));
//   s.theme = JSON.parse(localStorage.getItem('theme'));
// ──────────────────────────────────────────────
const _DENSITY_PREFIXES = ['--ric-gap', '--ric-pad-', '--ric-control-h'];
const _FONT_PREFIXES    = ['--ric-font-'];
const _is_density_var = (key) => _DENSITY_PREFIXES.some(p => key.startsWith(p));
const _is_font_var    = (key) => _FONT_PREFIXES.some(p => key.startsWith(p));

// cssText を { key: value } オブジェクトに変換する内部ヘルパー
const _parse_css_text = (page_el) => {
  if (!page_el || !page_el.style) {
    console.error('[RicUI] export_theme / export_settings: 有効な DOM 要素（.ric-page）を渡してください');
    return null;
  }
  const result = {};
  page_el.style.cssText.split(';').forEach(decl => {
    const colon = decl.indexOf(':');
    if (colon === -1) return;
    const key = decl.slice(0, colon).trim();
    const val = decl.slice(colon + 1).trim();
    if (key && val) result[key] = val;
  });
  return result;
};

const export_theme = (page_el) => {
  const all = _parse_css_text(page_el);
  if (!all) return {};
  const result = {};
  Object.entries(all).forEach(([key, val]) => {
    if (!key.startsWith('--ric-')) return;
    if (_is_density_var(key) || _is_font_var(key)) return;
    result[key] = val;
  });
  return result;
};

// ──────────────────────────────────────────────
// export_settings: ui_page 要素から theme / density / font_size を
//                  すべてグループ別に取り出す
//
// 返り値は ui_page の引数にそのまま展開して渡せる形式。
//
// 使い方：
//   const saved = export_settings(document.querySelector('.ric-page'));
//   localStorage.setItem('settings', JSON.stringify(saved));
//
//   // 復元
//   const saved = JSON.parse(localStorage.getItem('settings'));
//   if (saved) Object.assign(s, saved);   // state に theme / density / font_size を一括反映
// ──────────────────────────────────────────────
const export_settings = (page_el) => {
  const all = _parse_css_text(page_el);
  if (!all) return {};
  const theme     = {};
  const density   = {};
  const font_size = {};
  Object.entries(all).forEach(([key, val]) => {
    if (!key.startsWith('--ric-')) return;
    if (_is_font_var(key))    { font_size[key] = val; return; }
    if (_is_density_var(key)) { density[key]   = val; return; }
    theme[key] = val;
  });
  return { theme, density, font_size };
};

module.exports = {
  make_css_vars,
  create_theme,
  create_density,
  create_font_size,
  export_theme,
  export_settings,
};

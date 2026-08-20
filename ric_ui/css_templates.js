// RicUI — CSS テンプレート
// 部品ごとに CSS 文字列を返す小さな関数を定義する。
//
// 設計方針:
//   - 各テンプレートは CSS rules の文字列を返す関数
//   - 最終 style を JS で計算しない。CSS variables で受け取るだけ
//   - ベースクラスのテンプレートにバリアント・状態・擬似クラスも含める
//
// CSS 変数の var() 参照を定数化してバンドルサイズを削減する。
// esbuild は文字列リテラルを minify しないため、テンプレートリテラル内の
// ${定数} 展開で重複を排除する。

'use strict';

// ── CSS var() 定数（minify 対象外の文字列リテラル重複を排除）──
const _fg  = 'var(--ric-color-fg)';
const _fm  = 'var(--ric-color-fg-muted)';
const _bg  = 'var(--ric-color-bg)';
const _bd  = 'var(--ric-color-border)';
const _ct  = 'var(--ric-color-control)';
const _ac  = 'var(--ric-color-accent)';
const _af  = 'var(--ric-color-accent-fg, #fff)';
const _r   = 'var(--ric-radius)';
const _g   = 'var(--ric-gap)';
const _gm  = 'var(--ric-gap-md)';
const _px  = 'var(--ric-pad-x)';
const _py  = 'var(--ric-pad-y)';
const _ch  = 'var(--ric-control-h)';
const _dur = 'var(--ric-duration)';
const _eas = 'var(--ric-easing)';
const _sh  = 'var(--ric-shadow)';
const _tb  = 'var(--ric-tooltip-bg)';
const _tf  = 'var(--ric-tooltip-fg)';
const _cb  = 'var(--ric-code-bg)';    // コードブロック背景 (v0.4.1〜、tooltip とは独立)
const _cf  = 'var(--ric-code-fg)';    // コードブロック文字色 (v0.4.1〜)
const _bl  = 'var(--ric-popup-blur)';
const _fs  = 'var(--ric-font-size, 14px)';
const _ps  = 'var(--ric-panel-shadow)';

// 複合パターン
const _b1  = `1px solid ${_bd}`;       // border: 1px solid var(--ric-color-border)
const _da  = `${_dur} ${_eas}`;         // var(--ric-duration) var(--ric-easing)
const _P   = '.ric-page ';             // セレクタプレフィックス（末尾スペース含む）

const CSS_TEMPLATES = {

  // ── layout ──────────────────────────────────

  'ric-page': () => `
${_P}{
  color: ${_fg};
  background: ${_bg};
  font-size: ${_fs};
  box-sizing: border-box;
  overflow: hidden;
  padding: ${_gm};
}
${_P}*, ${_P}*::before, ${_P}*::after {
  box-sizing: inherit;
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
}
${_P}*:hover {
  scrollbar-color: color-mix(in srgb, ${_ac} 50%, transparent) color-mix(in srgb, ${_fg} 6%, transparent);
}`,

  'ric-col': () => `
${_P}.ric-col {
  display: flex;
  flex-direction: column;
  gap: ${_gm};
}`,

  'ric-row': () => `
${_P}.ric-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: ${_gm};
}`,

  'ric-grid': () => `
${_P}.ric-grid {
  display: grid;
  gap: ${_gm};
}`,

  // collapse-box は inline style の overflow / transition / width / height で
  // 動作するため、CSS template 側ではセマンティクスとしての class 名だけ用意。
  // user 側で .ric-collapse-box--entering / --closing を見て追加演出 (border /
  // shadow など) を載せたい場合に使う。
  'ric-collapse-box': () => `
${_P}.ric-collapse-box {
  display: block;
}`,

  // ── ric-tweak（パラメータ調整パネル）────────────
  // ui_tweak_panel / create_ui_tweak_panel のルートコンテナ + タイトル。

  'ric-tweak': () => `
${_P}.ric-tweak {
  display: flex;
  flex-direction: column;
  color: ${_fg};
  background: ${_bg};
  border: ${_b1};
  border-radius: ${_r};
  padding: ${_g} 0;
  user-select: none;
  overflow: hidden;
  box-sizing: border-box;
}
${_P}.ric-tweak__title {
  font-size: 1em;
  font-weight: bold;
  color: ${_fg};
  padding: ${_g} ${_gm};
  margin-bottom: ${_g};
  border-bottom: ${_b1};
}`,

  // ui_tweak_row — 1 行の binding control（label + コントロール）。
  // 子の .ric-input / .ric-range 等は flex:1 でラベル右側を埋める。
  // __json は infer_type が "json_preview" の場合のフォールバック表示。
  'ric-tweak-row': () => `
${_P}.ric-tweak-row {
  display: flex;
  align-items: center;
  gap: ${_g};
  padding: ${_g} ${_gm};
  min-width: 0;
}
${_P}.ric-tweak-row:hover {
  background: color-mix(in srgb, ${_fg} 6%, transparent);
}
${_P}.ric-tweak-row__label {
  width: 80px;
  flex-shrink: 0;
  font-size: 0.85em;
  color: ${_fm};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* checkbox 行は ui_checkbox 内蔵ラベルを使うため __label を持たない。
   通常行とトーンを揃えるため、内部の .ric-checkbox にも同じ色・サイズを適用する。 */
${_P}.ric-tweak-row--checkbox .ric-checkbox {
  font-size: 0.85em;
  color: ${_fm};
}
${_P}.ric-tweak-row > .ric-input,
${_P}.ric-tweak-row > .ric-range,
${_P}.ric-tweak-row > .ric-select,
${_P}.ric-tweak-row > .ric-color {
  flex: 1;
  min-width: 0;
}
${_P}.ric-tweak-row__json {
  flex: 1;
  margin: 0;
  padding: ${_g} 5px;
  background: ${_bg};
  border: ${_b1};
  border-radius: ${_r};
  font-size: 0.75em;
  font-family: monospace;
  color: ${_fm};
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 80px;
  overflow-y: auto;
  box-sizing: border-box;
}`,

  // ui_tweak_folder — <details> ベースの折り畳みセクション。
  // ▶ 矢印は CSS ::before + rotate で開閉アニメーション。
  'ric-tweak-folder': () => `
${_P}.ric-tweak-folder {
  border-top: ${_b1};
}
${_P}.ric-tweak-folder__summary {
  list-style: none;
  cursor: pointer;
  padding: ${_g} ${_gm};
  font-size: 0.9em;
  font-weight: 600;
  color: ${_fg};
  background: ${_bg};
  user-select: none;
  display: flex;
  align-items: center;
}
${_P}.ric-tweak-folder__summary::-webkit-details-marker { display: none; }
${_P}.ric-tweak-folder__summary::before {
  content: '\\25B6';
  font-size: 0.7em;
  margin-right: ${_g};
  color: ${_fm};
  transition: rotate ${_da};
}
${_P}.ric-tweak-folder[open] > .ric-tweak-folder__summary::before {
  rotate: 90deg;
}
${_P}.ric-tweak-folder__summary:hover {
  background: color-mix(in srgb, ${_fg} 6%, transparent);
}
${_P}.ric-tweak-folder__body {
  display: flex;
  flex-direction: column;
}`,

  // ── surface ─────────────────────────────────

  'ric-panel': () => `
${_P}.ric-panel {
  display: flex;
  flex-direction: column;
  gap: ${_gm};
  color: ${_fg};
  font-size: var(--ric-font-size, inherit);
  background: ${_bg};
  border: ${_b1};
  border-radius: ${_r};
  padding: ${_gm};
  backdrop-filter: ${_bl};
  -webkit-backdrop-filter: ${_bl};
  box-shadow: ${_ps};
}
${_P}.ric-panel--row {
  flex-direction: row;
  align-items: center;
}`,


  // ── control ─────────────────────────────────

  // アイコン (v0.3.28〜)。サイズ・色は ui_icon が inline (style width/height +
  // currentColor) で持つので、ここでは整列と回転だけを担う。
  //   vertical-align: -0.125em … テキスト隣接時のベースライン微調整 (標準的な値)
  //   flex-shrink: 0           … ボタン/flex 内でアイコンが潰れないように
  //   @keyframes ric-spin      … spin:true (spinner) 用。グローバル定義 (prefix 不要)
  'ric-icon': () => `
${_P}.ric-icon {
  display: inline-block;
  vertical-align: -0.125em;
  flex-shrink: 0;
}
@keyframes ric-spin { to { transform: rotate(360deg); } }
${_P}.ric-icon--spin {
  animation: ric-spin 1.4s linear infinite;
}`,

  'ric-button': () => `
${_P}.ric-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.4em;
  height: ${_ch};
  padding: 0 ${_px};
  border: ${_b1};
  border-radius: ${_r};
  background: ${_ct};
  color: ${_fg};
  font-size: 1em;
  font-weight: 500;
  cursor: pointer;
  user-select: none;
  appearance: none;
  white-space: nowrap;
  transition: background 0.1s, border-color 0.1s, filter 0.1s, translate 0.07s;
}
${_P}.ric-button:hover:not(:disabled) {
  background: ${_bd};
  border-color: ${_fm};
}
${_P}.ric-button:active:not(:disabled) {
  /* translate を使う: consumer の transform と composable (SPEC「CSS conflict」) */
  translate: 0 1px;
  filter: brightness(0.85);
}
${_P}.ric-button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
${_P}.ric-button--primary {
  background: ${_ac};
  border-color: ${_ac};
  color: ${_af};
}
${_P}.ric-button--primary:hover:not(:disabled) {
  background: ${_ac};
  border-color: ${_ac};
  filter: brightness(1.15);
}
${_P}.ric-button--primary:active:not(:disabled) {
  translate: 0 1px;
  filter: brightness(0.9);
}
${_P}.ric-button--ghost {
  border-color: transparent;
  background: transparent;
}
${_P}.ric-button--ghost:hover:not(:disabled) {
  border-color: ${_fm};
  background: ${_bd};
}
${_P}.ric-button--link {
  border-color: transparent;
  background: transparent;
  color: inherit;
  font: inherit;
  height: auto;
  padding: 1px 5px;
  line-height: 1.4;
  white-space: nowrap;
}
${_P}.ric-button--link:hover:not(:disabled) {
  background: ${_bd};
  border-color: transparent;
}
${_P}.ric-button--link:active:not(:disabled) {
  /* link variant: press-jump しない (テキスト風) */
  translate: 0;
  filter: none;
  background: color-mix(in srgb, ${_fg} 14%, transparent);
}
${_P}.ric-button--sm {
  height: 22px;
  font-size: 12px;
  padding: 0 8px;
}
${_P}.ric-button--md {
  height: 28px;
  font-size: 14px;
  padding: 0 10px;
}
${_P}.ric-button--lg {
  height: 36px;
  font-size: 16px;
  padding: 0 14px;
}`,

  'ric-input': () => `
${_P}.ric-input {
  display: block;
  width: 100%;
  height: ${_ch};
  padding: 0 ${_px};
  border: ${_b1};
  border-radius: ${_r};
  background: ${_ct};
  color: ${_fg};
  font-size: 1em;
  outline: none;
  appearance: none;
  transition: background 0.1s, border-color 0.15s, box-shadow 0.15s, translate 0.07s, filter 0.1s;
}
${_P}.ric-input:hover:not(:disabled) {
  background: ${_bd};
  border-color: ${_fm};
}
${_P}.ric-input:focus {
  background: ${_ct};
  border-color: ${_ac};
  box-shadow: 0 0 0 3px color-mix(in srgb, ${_ac} 20%, transparent);
  translate: 0;                 /* defensive: :active 残留沈みクリア */
  filter: none;
}
${_P}.ric-input:active:not(:disabled) {
  filter: brightness(0.88);
}
${_P}.ric-input::placeholder {
  color: ${_fm};
}`,

  // スクロール領域（テーマに合うスクロールバー配色のみ提供）。
  // 大部分の挙動は inline style（overflow-y:auto）で担う。
  'ric-scroll-pane': () => `
${_P}.ric-scroll-pane {
  min-height: 0;
  scrollbar-color: ${_fm} transparent;
  scrollbar-width: thin;
}
${_P}.ric-scroll-pane::-webkit-scrollbar { width: 8px; height: 8px; }
${_P}.ric-scroll-pane::-webkit-scrollbar-thumb {
  background: ${_fm};
  border-radius: 4px;
}
${_P}.ric-scroll-pane::-webkit-scrollbar-track { background: transparent; }`,

  // textarea は ric-input のスタイルを下敷きにしつつ、
  // 高さ可変・フォント統一・resize 無効（auto_resize 併用時の整合）を足す。
  'ric-textarea': () => `
${_P}.ric-textarea {
  display: block;
  width: 100%;
  padding: ${_py} ${_px};
  border: ${_b1};
  border-radius: ${_r};
  background: ${_ct};
  color: ${_fg};
  font-family: inherit;
  font-size: 1em;
  line-height: 1.5;
  outline: none;
  resize: vertical;
  transition: background 0.1s, border-color 0.15s, box-shadow 0.15s;
}
${_P}.ric-textarea:hover:not(:disabled) {
  background: ${_bd};
  border-color: ${_fm};
}
${_P}.ric-textarea:focus {
  background: ${_ct};
  border-color: ${_ac};
  box-shadow: 0 0 0 3px color-mix(in srgb, ${_ac} 20%, transparent);
}
${_P}.ric-textarea::placeholder {
  color: ${_fm};
}`,

  'ric-checkbox': () => `
${_P}.ric-checkbox {
  display: inline-flex;
  align-items: center;
  gap: ${_g};
  padding: ${_py} ${_px};
  border: 1px solid transparent;
  border-radius: ${_r};
  cursor: pointer;
  user-select: none;
  font-size: 1em;
  color: ${_fg};
  transition: background 0.1s, border-color 0.1s, translate 0.07s;
}
${_P}.ric-checkbox:hover {
  background: ${_bd};
  border-color: ${_fm};
}
${_P}.ric-checkbox:active {
  translate: 0 1px;
  filter: brightness(0.88);
}
${_P}.ric-checkbox input[type="checkbox"] {
  width: 15px;
  height: 15px;
  margin: 0;
  flex-shrink: 0;
  cursor: pointer;
  accent-color: ${_ac};
}
${_P}.ric-checkbox--disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
${_P}.ric-checkbox--disabled:hover {
  background: transparent;
  border-color: transparent;
}
${_P}.ric-checkbox--disabled:active {
  translate: 0;
  filter: none;
}
${_P}.ric-checkbox--disabled input[type="checkbox"] {
  cursor: not-allowed;
}`,

  'ric-select': () => `
${_P}.ric-select,
.ric-select::picker(select) {
  appearance: base-select;
}
${_P}.ric-select {
  display: flex;
  align-items: center;
  width: 100%;
  height: ${_ch};
  padding: 0 ${_px};
  border: ${_b1};
  border-radius: ${_r};
  background: ${_ct};
  color: ${_fg};
  font-size: 1em;
  font-family: inherit;
  cursor: pointer;
  outline: none;
  transition: background 0.1s, border-color 0.15s, box-shadow 0.15s, filter 0.1s;
}
${_P}.ric-select:hover:not(:disabled) {
  background: ${_bd};
  border-color: ${_fm};
}
${_P}.ric-select:focus {
  background: ${_ct};
  border-color: ${_ac};
  box-shadow: 0 0 0 3px color-mix(in srgb, ${_ac} 20%, transparent);
}
${_P}.ric-select:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.ric-select::picker-icon {
  content: '❯';
  color: ${_fm};
  font-size: 0.6em;
  rotate: 90deg;
  overflow: visible;
  margin-right: 2px;
  transition: rotate calc(${_dur} * 2) ${_eas};
}
.ric-select:open::picker-icon {
  rotate: 270deg;
}
.ric-select::picker(select) {
  background: ${_ct};
  border: ${_b1};
  border-radius: ${_r};
  box-shadow: ${_sh};
  padding: ${_g};
  opacity: 0;
  transition: opacity calc(${_dur} * 2) ${_eas}, overlay calc(${_dur} * 2) allow-discrete, display calc(${_dur} * 2) allow-discrete;
}
.ric-select:open::picker(select) {
  opacity: 1;
  @starting-style {
    opacity: 0;
  }
}
.ric-select option {
  padding: ${_py} ${_px};
  border-radius: calc(${_r} - 2px);
  color: ${_fg};
  transition: background 0.1s;
}
.ric-select option:hover {
  background: ${_bd};
}
.ric-select option:checked {
  background: ${_ac};
  color: ${_af};
}`,

  'ric-radiogroup': () => `
${_P}.ric-radiogroup {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  gap: ${_g};
}
${_P}.ric-radio {
  display: inline-flex;
  align-items: center;
  gap: ${_g};
  padding: ${_py} ${_px};
  border: 1px solid transparent;
  border-radius: ${_r};
  cursor: pointer;
  user-select: none;
  font-size: 1em;
  color: ${_fg};
  transition: background 0.1s, border-color 0.1s, filter 0.1s;
}
${_P}.ric-radio:hover {
  background: ${_bd};
  border-color: ${_fm};
}
${_P}.ric-radio:active {
  filter: brightness(0.88);
}
${_P}.ric-radio input[type="radio"] {
  width: 15px;
  height: 15px;
  margin: 0;
  flex-shrink: 0;
  cursor: pointer;
  accent-color: ${_ac};
}
${_P}.ric-radio__label {
  display: inline-flex;
  align-items: center;
  gap: 0.4em;
}
${_P}.ric-radio--disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
${_P}.ric-radio--disabled:hover {
  background: transparent;
  border-color: transparent;
}
${_P}.ric-radio--disabled:active {
  filter: none;
}
${_P}.ric-radio--disabled input[type="radio"] {
  cursor: not-allowed;
}`,

  // ── range ───────────────────────────────────

  'ric-range': () => `
${_P}.ric-range {
  display: flex;
  align-items: center;
  gap: ${_g};
  width: 100%;
  min-width: 0;
}
${_P}.ric-range input[type="range"] {
  flex: 1;
  min-width: 0;
  cursor: pointer;
  accent-color: ${_ac};
  height: ${_ch};
}
${_P}.ric-range__value {
  font-size: 0.85em;
  color: ${_fm};
  min-width: 32px;
  text-align: right;
  font-family: monospace;
  flex-shrink: 0;
}`,

  // ── color ───────────────────────────────────

  'ric-color': () => `
${_P}.ric-color {
  display: flex;
  align-items: center;
  gap: ${_g};
  width: 100%;
  min-width: 0;
}
${_P}.ric-color--rgba {
  flex-direction: column;
  align-items: stretch;
}
${_P}.ric-color__picker {
  flex: 1;
  min-width: 0;
  height: 28px;
  padding: 2px;
  border: ${_b1};
  border-radius: ${_r};
  cursor: pointer;
  background: none;
  box-sizing: border-box;
}
${_P}.ric-color--rgba .ric-color__picker {
  width: 100%;
  flex: 0 0 auto;
}
${_P}.ric-color__alpha-row {
  display: flex;
  align-items: center;
  gap: ${_g};
  min-width: 0;
}
${_P}.ric-color__alpha {
  flex: 1;
  min-width: 0;
  height: 20px;
  cursor: pointer;
  accent-color: ${_ac};
}
${_P}.ric-color__value {
  font-size: 0.85em;
  color: ${_fm};
  font-family: monospace;
  min-width: 54px;
  text-align: right;
  flex-shrink: 0;
}`,

  // ── separator ──────────────────────────────

  'ric-separator': () => `
${_P}.ric-separator {
  border: none;
  border-top: ${_b1};
  margin: ${_g} 0;
}`,

  // ── text ────────────────────────────────────

  'ric-text': () => `
${_P}.ric-text {
  font-size: 1em;
  line-height: 1.5;
}
${_P}.ric-text--muted {
  color: ${_fm};
  font-size: 0.85em;
}
${_P}.ric-text--title {
  font-size: 1.25em;
  font-weight: 700;
  line-height: 1.3;
  margin: 0;
}
${_P}.ric-text--label {
  font-size: 0.85em;
  font-weight: 600;
  color: ${_fm};
}`,

  // ── popup ────────────────────────────────────

  'ric-popup': () => `
@keyframes ric-popup-in  { from { opacity:0; transform:scaleY(0.6); } to { opacity:1; transform:scaleY(1); } }
@keyframes ric-popup-out { from { opacity:1; transform:scaleY(1); }   to { opacity:0; transform:scaleY(0.6); } }
${_P}.ric-popup { position: relative; display: inline-flex; }

${_P}.ric-popup__trigger {
  width: ${_ch}; height: ${_ch};
  border-radius: ${_r};
  background: ${_ct}; border: ${_b1};
  cursor: pointer; font-size: 18px; color: ${_fg};
  display: flex; align-items: center; justify-content: center;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
}
${_P}.ric-popup__trigger:hover { border-color: ${_ac}; }

${_P}.ric-popup__trigger--label {
  width: 100%; justify-content: space-between;
  padding: 0 ${_px};
  font-size: 1em;
}

${_P}.ric-popup__trigger--ghost { border-color: transparent; background: transparent; }
${_P}.ric-popup__trigger--ghost:hover { border-color: ${_bd}; background: ${_ct}; }

${_P}.ric-popup__trigger--open {
  background: ${_ac}; color: ${_af};
  border-color: ${_ac};
}

${_P}.ric-popup__chevron { transition: transform 0.2s ${_eas}; opacity: 0.7; }
${_P}.ric-popup__chevron--open { transform: rotate(180deg); }

.ric-popup__body {
  min-width: 160px;
  background: ${_ct};
  border: ${_b1};
  border-radius: ${_r};
  box-shadow: ${_sh};
  overflow: hidden;
}
.ric-popup__body--below { transform-origin: top; animation: ric-popup-in ${_da}; }
.ric-popup__body--above { transform-origin: bottom; animation: ric-popup-in ${_da}; }
.ric-popup__body--out { pointer-events: none; }
.ric-popup__body--out.ric-popup__body--below, .ric-popup__body--out.ric-popup__body--above { animation: ric-popup-out ${_da} forwards; }

${_P}.ric-popup__body .ric-button {
  display: flex !important; width: 100%;
  justify-content: flex-start; text-align: left;
  border-radius: 0; border: 1px solid transparent;
}
${_P}.ric-popup__body .ric-button:hover { border-color: ${_bd}; }
${_P}.ric-popup__sep { height: 1px; background: ${_bd}; margin: 4px 0; }`,

  'ric-tooltip': () => `
@keyframes ric-tip-h { from { opacity:0; transform:translateX(-50%) scale(0.85); } to { opacity:1; transform:translateX(-50%) scale(1); } }
@keyframes ric-tip-v { from { opacity:0; transform:translateY(-50%) scale(0.85); } to { opacity:1; transform:translateY(-50%) scale(1); } }
${_P}.ric-tooltip { display: inline-flex; }
.ric-tooltip__popup {
  background: ${_tb};
  color: ${_tf};
  font-size: 0.85em;
  padding: 4px 10px;
  border-radius: ${_r};
  white-space: nowrap; pointer-events: none; max-width: 200px;
}

.ric-tooltip__popup--top    { transform: translateX(-50%); transform-origin: center bottom; animation: ric-tip-h ${_da}; }
.ric-tooltip__popup--bottom { transform: translateX(-50%); transform-origin: center top; animation: ric-tip-h ${_da}; }
.ric-tooltip__popup--right  { transform: translateY(-50%); transform-origin: left center; animation: ric-tip-v ${_da}; }
.ric-tooltip__popup--left   { transform: translateY(-50%); transform-origin: right center; animation: ric-tip-v ${_da}; }

.ric-tooltip__popup::after {
  content: ''; position: absolute; width: 0; height: 0;
  border: 5px solid transparent;
}
.ric-tooltip__popup--top::after {
  bottom: -5px; left: 50%; transform: translateX(-50%);
  border-top-color: ${_tb}; border-bottom-width: 0;
}
.ric-tooltip__popup--bottom::after {
  top: -5px; left: 50%; transform: translateX(-50%);
  border-bottom-color: ${_tb}; border-top-width: 0;
}
.ric-tooltip__popup--right::after {
  left: -5px; top: 50%; transform: translateY(-50%);
  border-right-color: ${_tb}; border-left-width: 0;
}
.ric-tooltip__popup--left::after {
  right: -5px; top: 50%; transform: translateY(-50%);
  border-left-color: ${_tb}; border-right-width: 0;
}`,

  // ── dialog ──────────────────────────────────

  'ric-dialog': () => `
@keyframes ric-dlg-in  { from { opacity:0; transform:translate(-50%,-50%) scale(.8); } to { opacity:1; transform:translate(-50%,-50%) scale(1); } }
@keyframes ric-dlg-out { from { opacity:1; transform:translate(-50%,-50%) scale(1); } to { opacity:0; transform:translate(-50%,-50%) scale(.8); } }
@keyframes ric-ovl-in  { from { opacity:0; } to { opacity:1; } }
@keyframes ric-ovl-out { from { opacity:1; } to { opacity:0; } }

.ric-dialog__overlay { background: color-mix(in srgb, ${_tb} 10%, transparent); animation: ric-ovl-in ${_da}; }
.ric-dialog__overlay--out { animation: ric-ovl-out ${_da} forwards; pointer-events: none; }
.ric-dialog {
  background: var(--ric-popup-bg, ${_bg});
  border: ${_b1};
  border-radius: ${_r};
  box-shadow: ${_sh};
  backdrop-filter: ${_bl};
  -webkit-backdrop-filter: ${_bl};
  width: min(360px, 90vw); overflow: hidden;
  animation: ric-dlg-in ${_da};
}
.ric-dialog--out { animation: ric-dlg-out ${_da} forwards; pointer-events: none; }
.ric-dialog__header {
  display: flex; align-items: center; justify-content: space-between;
  padding: ${_py} ${_px};
  border-bottom: ${_b1};
}
.ric-dialog__title { font-weight: 700; font-size: 1em; color: ${_fg}; }
.ric-dialog__close {
  display: flex; align-items: center; justify-content: center;
  width: 24px; height: 24px;
  border: none; background: transparent; cursor: pointer;
  color: ${_fm}; font-size: 14px;
  border-radius: ${_r};
  transition: background 0.1s, color 0.1s;
}
.ric-dialog__close:hover { background: ${_bd}; color: ${_fg}; }
.ric-dialog__body { padding: ${_px}; font-size: 1em; color: ${_fg}; }
.ric-dialog__footer {
  display: flex; justify-content: flex-end; gap: ${_g};
  padding: ${_g} ${_px} ${_py};
  border-top: ${_b1};
}`,

  // ── toast ────────────────────────────────────

  'ric-toast__item': () => `
@keyframes ric-toast-in  { from { opacity:0; transform:translateX(calc(100% + 20px)); } to { opacity:1; transform:translateX(0); } }
@keyframes ric-toast-out { from { opacity:1; transform:translateX(0); } to { opacity:0; transform:translateX(calc(100% + 20px)); } }

.ric-toast__item {
  display: flex; align-items: center; gap: ${_g};
  min-width: 220px; max-width: 360px;
  padding: ${_py} ${_px};
  background: var(--ric-popup-bg, ${_bg});
  border: ${_b1};
  border-radius: ${_r};
  box-shadow: ${_sh};
  backdrop-filter: ${_bl};
  -webkit-backdrop-filter: ${_bl};
}

.ric-toast__item--in  { animation: ric-toast-in  ${_da} both; }
.ric-toast__item--success { border-left: 3px solid #22c55e; }
.ric-toast__item--error   { border-left: 3px solid #ef4444; }
.ric-toast__item--warning { border-left: 3px solid #f59e0b; }
.ric-toast__item--info    { border-left: 3px solid ${_ac}; }
.ric-toast__item--out { animation: ric-toast-out ${_da} forwards; pointer-events: none; }
.ric-toast__msg {
  flex: 1; font-size: 1em; color: ${_fg}; line-height: 1.4;
}
.ric-toast__close {
  flex-shrink: 0; width: 20px; height: 20px;
  border: none; background: transparent; cursor: pointer;
  color: ${_fm}; font-size: 11px;
  border-radius: ${_r};
  display: flex; align-items: center; justify-content: center;
  transition: background 0.1s, color 0.1s;
}
.ric-toast__close:hover { background: ${_bd}; color: ${_fg}; }`,

  // ── accordion ────────────────────────────────

  'ric-accordion': () => `
.ric-accordion {
  display: flex; flex-direction: column;
  border: ${_b1};
  border-radius: ${_r};
  overflow: hidden;
}
.ric-accordion__item + .ric-accordion__item {
  border-top: ${_b1};
}
.ric-accordion__header {
  display: flex; align-items: center; justify-content: space-between;
  width: 100%; padding: ${_py} ${_px};
  background: ${_bg};
  border: none; cursor: pointer;
  font-size: 1em; color: ${_fg}; font-weight: 500;
  text-align: left; user-select: none;
  transition: background ${_da};
}
.ric-accordion__header:hover, .ric-accordion__header--open { background: ${_bd}; }
.ric-accordion__title { flex: 1; text-align: left; }
.ric-accordion__arrow { color: ${_fm}; margin-left: ${_g}; transition: transform ${_da}; }
.ric-accordion__header--open .ric-accordion__arrow { transform: rotate(180deg); }
/* grid-template-rows のトリックで auto 高さに対してアニメーションする。
   閉じ: 0fr → 開き: 1fr（子要素は min-height:0 + overflow:hidden が必須） */
.ric-accordion__body {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows ${_da};
}
.ric-accordion__body--open {
  grid-template-rows: 1fr;
}
.ric-accordion__body-inner {
  min-height: 0;
  overflow: hidden;
}
.ric-accordion__body--open > .ric-accordion__body-inner {
  padding: ${_gm} ${_px};
  background: ${_bg};
  border-top: ${_b1};
}`,

  // ── splitter ─────────────────────────────────

  'ric-splitter': () => `
.ric-splitter { overflow: hidden; }

.ric-splitter__side {
  flex-shrink: 0;
  overflow: hidden;
}

.ric-splitter__main { flex: 1; overflow: auto; min-width: 0; min-height: 0; }

.ric-splitter__divider {
  flex: 0 0 5px;
  background: ${_bd};
  display: flex; align-items: center; justify-content: center;
  position: relative;
  transition: background 0.15s;
  user-select: none;
  z-index: 1;
}

/* variant クラスは *直接の* divider にのみ効かせる。
   子孫セレクタ（空白区切り）だと、外側 vertical splitter の
   中にある内側 horizontal splitter の divider にも vertical スタイルが
   漏れるため、> で 1 階層に限定する。 */
.ric-splitter--horizontal > .ric-splitter__divider { cursor: col-resize; }
.ric-splitter--vertical   > .ric-splitter__divider { cursor: row-resize; }
.ric-splitter--collapsed  > .ric-splitter__divider { cursor: pointer; }

.ric-splitter__divider:hover,
.ric-splitter__divider--dragging { background: ${_ac}; }

.ric-splitter__collapse-btn {
  position: absolute;
  left: 50%; top: 50%;
  transform: translate(-50%, -50%);
  width: 20px; height: 40px; padding: 0;
  background: ${_bg};
  border: ${_b1};
  border-radius: 10px;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  font-size: 9px; color: ${_fm};
  z-index: 2;
  opacity: 0;
  transition: opacity 0.15s, background 0.1s, color 0.1s, border-color 0.1s;
}

/* vertical 用の縦長→横長ボタン切替も同じ理由で直下限定にする */
.ric-splitter--vertical > .ric-splitter__divider > .ric-splitter__collapse-btn {
  width: 40px; height: 20px; border-radius: 10px;
}

.ric-splitter:hover > .ric-splitter__divider > .ric-splitter__collapse-btn,
.ric-splitter__divider--dragging > .ric-splitter__collapse-btn { opacity: 1; }
.ric-splitter__collapse-btn:hover {
  background: ${_ac};
  color: ${_af};
  border-color: ${_ac};
}

.ric-splitter__divider:hover > .ric-splitter__collapse-btn,
.ric-splitter__divider--dragging > .ric-splitter__collapse-btn {
  border-color: var(--ric-color-accent-fg, rgba(255,255,255,0.35));
}`,

  // ── tabs ─────────────────────────────────────

  'ric-tabs': () => `
.ric-tabs { display: flex; flex-direction: column; gap: ${_g}; width: 100%; }

.ric-tabs__bar {
  display: flex;
  flex-shrink: 0;
  border-bottom: ${_b1};
}

.ric-tabs__tab {
  padding: ${_g} ${_px};
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  cursor: pointer;
  font-size: 1em;
  color: ${_fm};
  white-space: nowrap;
  transition: color 0.15s, border-bottom-color 0.15s, background 0.15s;
}
.ric-tabs__tab:hover { color: ${_fg}; background: color-mix(in srgb, ${_fg} 8%, transparent); }

.ric-tabs__tab--active {
  color: ${_ac};
  border-bottom-color: ${_ac};
  background: color-mix(in srgb, ${_fg} 10%, transparent);
  font-weight: 600;
}

.ric-tabs__panel { flex: 1; overflow: auto; min-height: 0; }

.ric-tabs--pill .ric-tabs__bar {
  border-bottom: none;
  background: ${_bg};
  border-radius: ${_r};
  padding: 3px;
  gap: 2px;
  align-self: flex-start;
}
.ric-tabs--pill .ric-tabs__tab {
  border-bottom: none;
  border-radius: calc(${_r} - 2px);
  margin-bottom: 0;
}
.ric-tabs--pill .ric-tabs__tab--active {
  background: ${_ac};
  color: ${_af};
  font-weight: 600;
  box-shadow: 0 1px 3px rgba(0,0,0,0.2);
}`,

  // ── inline-menu ──────────────────────────────
  // trigger 要素の近くに absolute 配置するポップオーバー。portal を使わない
  // 軽量版。CSS は箱の見た目だけを担当し、位置は ui_inline_menu の style で
  // 直接指定する（anchor → top/left/right/bottom を組み立てる）。
  'ric-inline-menu': () => `
${_P}.ric-inline-menu {
  background: ${_ct};
  border: ${_b1};
  border-radius: ${_r};
  padding: 4px;
  box-shadow: ${_sh};
  display: flex;
  flex-direction: column;
  gap: 2px;
}
${_P}.ric-inline-menu .ric-button {
  justify-content: flex-start;
  text-align: left;
}`,

  'ric-md-pre': () => `
.ric-md-pre {
  line-height: 1.7;
  color: ${_fg};
  font-size: ${_fs};
}
.ric-md-pre__h1 {
  font-size: 1.6em; font-weight: 700;
  margin: 0.8em 0 0.4em; padding-bottom: 0.2em;
  border-bottom: ${_b1};
}
.ric-md-pre__h2 {
  font-size: 1.3em; font-weight: 700;
  margin: 0.7em 0 0.3em; padding-bottom: 0.15em;
  border-bottom: ${_b1};
}
.ric-md-pre__h3 {
  font-size: 1.1em; font-weight: 700;
  margin: 0.6em 0 0.2em;
}
.ric-md-pre__p {
  margin: 0.5em 0;
}
.ric-md-pre__list {
  margin: 0.5em 0; padding-left: 1.5em;
}
.ric-md-pre__list li {
  margin: 0.2em 0;
}
.ric-md-pre__ol {
  margin: 0.5em 0; padding-left: 1.5em;
}
.ric-md-pre__ol li {
  margin: 0.2em 0;
}
.ric-md-pre__img {
  max-width: 100%;
  height: auto;
  border-radius: ${_r};
}
.ric-md-pre__quote {
  margin: 0.5em 0; padding: 0.3em 0.8em;
  border-left: 3px solid ${_ac};
  color: ${_fm};
}
.ric-md-pre__fence {
  margin: 0.5em 0; padding: ${_gm};
  background: ${_cb}; color: ${_cf};
  border: 1px solid color-mix(in srgb, ${_fg} 6%, transparent);
  border-radius: ${_r};
  overflow-x: auto;
  font-family: Consolas, "Cascadia Code", "Source Code Pro", Monaco, monospace;
  font-size: 0.85em; line-height: 1.6;
  white-space: pre;
}
.ric-md-pre__fence > code {
  display: block;
}
.ric-md-pre__fence > code.hljs {
  background: transparent; padding: 0; overflow: visible;
}
.ric-md-pre__code {
  padding: 0.15em 0.4em;
  background: color-mix(in srgb, ${_fg} 8%, transparent);
  border-radius: 3px;
  font-family: Consolas, "Cascadia Code", "Source Code Pro", Monaco, monospace;
  font-size: 0.9em;
}
.ric-md-pre__link {
  color: ${_ac}; text-decoration: none;
}
.ric-md-pre__link:hover {
  text-decoration: underline;
}
.ric-md-pre__hr {
  border: none; border-top: ${_b1};
  margin: 1em 0;
}
.ric-md-pre__table {
  margin: 0.5em 0; border-collapse: collapse; width: auto;
  font-size: 0.95em;
}
.ric-md-pre__th {
  padding: 0.35em 0.8em; font-weight: 700;
  border-bottom: 2px solid ${_bd};
  text-align: left; white-space: nowrap;
}
.ric-md-pre__td {
  padding: 0.3em 0.8em;
  border-bottom: ${_b1};
}`,

  'ric-code-pre': () => `
.ric-code-pre {
  margin: 0;
  padding: ${_gm};
  background: ${_cb};
  color: ${_cf};
  border: 1px solid color-mix(in srgb, ${_fg} 6%, transparent);
  border-radius: var(--ric-radius, 8px);
  overflow-x: auto;
  font-family: Consolas, "Cascadia Code", "Source Code Pro", Monaco, monospace;
  font-size: 0.85em;
  line-height: 1.6;
  white-space: pre;
}
.ric-code-pre:hover {
  scrollbar-color: color-mix(in srgb, ${_cf} 40%, transparent) transparent;
}
.ric-code-pre > code {
  display: block;
}
.ric-code-pre > code.hljs {
  background: transparent;
  padding: 0;
  overflow: visible;
}`,

};

module.exports = { CSS_TEMPLATES };

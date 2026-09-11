// tests/_helpers/jsdom_env.js
// jsdom セットアップの共通ヘルパー。
// rAF shim は必ず setImmediate を使う (setTimeout(cb,0) ではない)。
// 理由: Node.js (v24 で確認) では setTimeout(0) の連鎖が稀に starve する race があり、
// _measure → safe_notify → schedule_render → rAF の連鎖で rAF callback が
// flush(10ms) 内に発火しない fail が ~30% 起きる (create_ui_collapse_box テストで実証)。
// setImmediate は I/O ループ末尾で確実に発火するため deterministic に動く。
'use strict';
const { JSDOM } = require('jsdom');

// body: <body> 内の HTML (既定 '<div id="app"></div>')
// globals: 追加で global に載せる window プロパティ名の配列
//          (例: ['Element'], ['KeyboardEvent'], ['getComputedStyle', 'Event'])
const setup_jsdom = ({ body = '<div id="app"></div>', globals = [] } = {}) => {
  const dom = new JSDOM(`<!DOCTYPE html><html><head></head><body>${body}</body></html>`);
  global.window      = dom.window;
  global.document    = dom.window.document;
  global.Node        = dom.window.Node;
  global.HTMLElement = dom.window.HTMLElement;
  for (const g of globals) global[g] = dom.window[g];
  global.requestAnimationFrame = (cb) => setImmediate(cb);
  return dom;
};

// rAF (setImmediate) が一巡して DOM commit が終わるのを待つ。
// v0.4.5 以前は setTimeout(ms) だけで待っていたが、フルスイート負荷時に 10ms 以内に
// rAF コールバックが回らず、旧値のまま assert に入る単発 flake が 3 回観測された
// (dom_snapshot「state 変更後にテキストが更新される」等)。時間ではなく「setImmediate の
// 順番」で待てば、待ち始める前に予約された rAF コールバックは必ず先に発火する (FIFO)。
// 手順: rAF を数巡 drain → 従来どおり ms 待つ (ライブラリ内の setTimeout 系に依存する
// テストの互換) → 待ち中に新たに予約された rAF をもう一度 drain。
// 「反映済み保証」だけなら next_render() / render_now() を直接使う方が本筋 (SPEC 参照)。
const RAF_DRAIN_TURNS = 3;
const immediate = () => new Promise((r) => setImmediate(r));
const drain_raf = async () => {
  for (let i = 0; i < RAF_DRAIN_TURNS; i++) await immediate();
};
const flush = async (ms = 10) => {
  await drain_raf();
  await new Promise((r) => setTimeout(r, ms));
  await drain_raf();
};

module.exports = { setup_jsdom, flush };

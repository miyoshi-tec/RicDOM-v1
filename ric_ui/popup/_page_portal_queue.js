// RicUI — ポータルキュー
// popup / tooltip / dialog / toast は、開いているとき VDOM をここに push する。
// ui_page が描画時に drain() で取り出し、.ric-page の直接の子として展開する。
// これにより .ric-panel 等の backdrop-filter / transform が作る
// stacking context / containing block の影響を受けずにポータルを配置できる。
//
// 前提: JS はシングルスレッドで render は同期実行されるため、
//   「children 評価で push → inst() が drain」が交錯せず安全。
//   複数の ui_page がある場合も JS の評価順（引数が左から順に評価される）で
//   各 page の children → inst → drain が逐次に完結するため、
//   単一バッファで正しく分離される。
//
// ── page 不在検知 (v0.3.38〜、設計OS AI-FUMI v2 consumer 報告) ──────────
// portal (popup/dialog/tooltip/toast) は drain の責務を持つ create_ui_page の
// render が一度も走らないプロセス状態 (= css_for 島だけで組んだ / create_ui_page
// を消し忘れた等) だと、push された VDOM がキューに溜まったまま永遠に画面へ
// 出てこない silent failure になる (SPEC.md「css_for / make_css_vars」の
// ⚠️ 参照)。正常系は同一 render サイクル内で push → drain が完結するため、
// 初回 push から一定時間 (既定 1000ms) 経っても一度も drain されていなければ
// 1 回だけ console.warn する。throw はしない・正常系には一切影響しない。
'use strict';

let _buf = [];

// drain が一度でも実行されたかどうか（プロセス生存中は true のまま保持する）。
let _drained_once = false;

// 監視用 setTimeout を既に仕掛けたか（初回 push でだけ 1 本張れば十分なため）。
let _watch_started = false;

// 初回 push から warn までの猶予 (ms)。テストで待ち時間を縮められるよう変数化。
let _check_delay_ms = 1000;

const push = (...items) => {
  _buf.push(...items);

  // 初回 push かつ drain が一度も走っていない状態でだけ監視タイマーを仕掛ける。
  // 以後 drain が一度でも走れば _drained_once が true になり warn は発火しない。
  if (!_drained_once && !_watch_started) {
    _watch_started = true;
    const timer = setTimeout(() => {
      if (_drained_once) return; // 正常系: 発火前に drain 済み → 誤検知しない
      console.warn(
        '[RicUI] popup / dialog / tooltip / toast の VDOM が create_ui_page() の ' +
        'render で一度も drain されていません。portal 系コンポーネントは ' +
        'create_ui_page の render が drain する設計です。対象の subtree を ' +
        'create_ui_page() で包んでください（css_for 島には portal 系は使えません — ' +
        'SPEC.md「css_for / make_css_vars」参照）。'
      );
    }, _check_delay_ms);
    // Node 環境では監視タイマーがプロセス終了を妨げないよう unref する
    // （ブラウザの数値ハンドルには unref が無いので typeof チェックで安全に skip）。
    if (timer && typeof timer.unref === 'function') timer.unref();
  }
};

const drain = () => {
  _drained_once = true;
  const items = _buf;
  _buf = [];
  return items;
};

// test 用: 内部状態を初期化する（他テストへの影響を防ぐ）。
const _reset_for_test = () => {
  _buf = [];
  _drained_once = false;
  _watch_started = false;
};

// test 用: 監視タイマーの遅延を短縮する。
const _set_check_delay_ms_for_test = (ms) => { _check_delay_ms = ms; };

module.exports = { push, drain, _reset_for_test, _set_check_delay_ms_for_test };

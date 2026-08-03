'use strict';

// _page_portal_queue — page 不在検知の console.warn 回帰テスト (v0.3.38〜)
//
// 背景: popup / dialog / tooltip / toast は開いているとき VDOM を
// _page_portal_queue に push するだけで、create_ui_page の render が drain()
// するまでどこにも現れない。文書内に create_ui_page が一度も render しない
// プロセス状態 (= css_for 島だけで組んだ / create_ui_page を消し忘れた等) だと
// push された VDOM が永遠に画面に出てこない silent failure になる
// (設計OS AI-FUMI v2 consumer 報告)。
//
// 検証範囲:
//   1. page 無し (drain が一度も走らない) → 監視時間経過後に 1 回だけ warn
//   2. push が複数回あっても warn は 1 回だけ (spam しない)
//   3. page あり (同一サイクルで drain される) → warn しない (誤検知しない)
//   4. create_ui_page 経由の実 render で drain されるケースでも warn しない (結合テスト)

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const _portal = require('../ric_ui/popup/_page_portal_queue');

// console.warn をキャプチャするヘルパー
const capture_warns = () => {
  const captured = [];
  const original = console.warn;
  console.warn = (...args) => { captured.push(args.join(' ')); };
  return {
    captured,
    restore: () => { console.warn = original; },
  };
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// テスト間で監視状態が持ち越されないよう、毎回リセット + 遅延を短縮する。
// 本番の既定値 (1000ms) を待つとテストが遅くなるため、テストだけ短縮する。
const DELAY_MS = 20;
beforeEach(() => {
  _portal._reset_for_test();
  _portal._set_check_delay_ms_for_test(DELAY_MS);
});
afterEach(() => {
  _portal._reset_for_test();
  _portal._set_check_delay_ms_for_test(1000); // 既定値に戻す
});

describe('_page_portal_queue: page 不在検知 (v0.3.38〜)', () => {

  it('page 無し: drain が一度も走らないまま監視時間が過ぎると 1 回だけ warn する', async () => {
    const w = capture_warns();
    try {
      _portal.push({ tag: 'div', class: 'ric-dialog__overlay' });

      // 監視時間経過前はまだ warn していない
      assert.equal(w.captured.length, 0);

      await wait(DELAY_MS + 20);

      assert.equal(w.captured.length, 1);
      assert.match(w.captured[0], /drain/);
      assert.match(w.captured[0], /create_ui_page/);
    } finally {
      w.restore();
    }
  });

  it('page 無し: push を複数回行っても warn は 1 回だけ (spam しない)', async () => {
    const w = capture_warns();
    try {
      _portal.push({ tag: 'div' });
      _portal.push({ tag: 'div' });
      _portal.push({ tag: 'div' });

      await wait(DELAY_MS + 20);

      assert.equal(w.captured.length, 1);
    } finally {
      w.restore();
    }
  });

  it('page あり: 監視時間内に drain されれば warn しない (誤検知しない)', async () => {
    const w = capture_warns();
    try {
      _portal.push({ tag: 'div' });
      _portal.drain(); // 同一サイクルで drain された想定

      await wait(DELAY_MS + 20);

      assert.equal(w.captured.length, 0);
    } finally {
      w.restore();
    }
  });

  it('drain が一度でも走れば、以降 push があっても warn しない', async () => {
    const w = capture_warns();
    try {
      _portal.push({ tag: 'div' });
      _portal.drain();

      // drain 済みプロセス状態からさらに push (通常の 2 回目以降の open/close)
      _portal.push({ tag: 'div' });

      await wait(DELAY_MS + 20);

      assert.equal(w.captured.length, 0);
    } finally {
      w.restore();
    }
  });

  it('push しなければ warn は発火しない', async () => {
    const w = capture_warns();
    try {
      await wait(DELAY_MS + 20);
      assert.equal(w.captured.length, 0);
    } finally {
      w.restore();
    }
  });
});

// ── 結合テスト: create_ui_page 経由の実 render で drain されるケース ──
describe('_page_portal_queue: create_ui_page 経由の実 render (結合テスト)', () => {

  const setup_jsdom = () => {
    const { JSDOM } = require('jsdom');
    const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div></body></html>');
    global.window      = dom.window;
    global.document    = dom.window.document;
    global.Node        = dom.window.Node;
    global.HTMLElement = dom.window.HTMLElement;
    global.requestAnimationFrame = (cb) => setImmediate(cb);
    return dom;
  };

  afterEach(() => {
    delete global.window;
    delete global.document;
    delete global.Node;
    delete global.HTMLElement;
    delete global.requestAnimationFrame;
  });

  it('create_ui_page が render すれば toast を push しても warn しない', async () => {
    setup_jsdom();
    const w = capture_warns();
    try {
      const { create_RicDOM } = require('../src/ricdom');
      const { create_ui_page } = require('../ric_ui/layout/ui_page');
      const { create_ui_toast } = require('../ric_ui');

      const target = document.querySelector('#app');
      const s = create_RicDOM(target, {
        page:  create_ui_page(),
        toast: create_ui_toast(),
        render(s) {
          s.toast(); // ポータル登録（副作用のみ、null を返す）
          return s.page({ ctx: [] });
        },
      });

      s.toast.show('保存しました', { duration: 0 }); // 0 = 自動消去なし（残留タイマー防止）
      await wait(DELAY_MS + 30);

      assert.equal(w.captured.filter(m => /drain/.test(m)).length, 0);
    } finally {
      w.restore();
    }
  });
});

// RicUI — safe_notify (__notify 未注入時の console.warn) テスト
//
// 検証範囲:
//   1. ファクトリを state に置いた正常使用では warn しない
//   2. ファクトリを state 外で作成・操作すると warn する (silent failure 防止)
//   3. factory_name ごとに 1 回限り warn する (spam しない)
//   4. _reset_safe_notify_warnings() で履歴クリアできる

'use strict';

const { test, describe, beforeEach } = require('node:test');
const { strict: assert } = require('node:assert');

const { setup_jsdom, flush } = require('./_helpers/jsdom_env');

// console.warn をキャプチャするヘルパ
const capture_warns = () => {
  const captured = [];
  const original = console.warn;
  console.warn = (...args) => { captured.push(args.join(' ')); };
  return {
    captured,
    restore: () => { console.warn = original; },
  };
};

describe('safe_notify: state に正しく置いたファクトリは warn しない', () => {

  beforeEach(setup_jsdom);

  test('create_ui_splitter を state に置いて collapse → warn なし', async () => {
    const { _reset_safe_notify_warnings } = require('../ric_ui/_factory_helpers');
    _reset_safe_notify_warnings();
    const w = capture_warns();
    try {
      const { create_RicDOM } = require('../src/ricdom');
      const { create_ui_splitter } = require('../ric_ui/composite/create_ui_splitter');

      const target = document.querySelector('#app');
      const s = create_RicDOM(target, {
        split: create_ui_splitter({ side: 'left', size: 200, collapsible: true }),
        render: (s) => s.split({
          side: { ctx: ['side'] },
          main: { ctx: ['main'] },
        }),
      });

      // collapse をトグル — 正しく state に置いていれば __notify 経由で再描画
      s.split.toggle();
      await flush(); // 固定 10ms ではなく rAF (setImmediate) の drain で待つ (v0.4.6)

      const warned = w.captured.filter(s => s.includes('has no __notify'));
      assert.equal(warned.length, 0, '正規使用で warn が出てはいけない');
    } finally {
      w.restore();
    }
  });
});

describe('safe_notify: state 外のファクトリは warn する (silent failure 防止)', () => {

  beforeEach(setup_jsdom);

  test('module-level const に置いた splitter を collapse すると warn が 1 回出る', () => {
    const { _reset_safe_notify_warnings } = require('../ric_ui/_factory_helpers');
    _reset_safe_notify_warnings();
    const w = capture_warns();
    try {
      const { create_ui_splitter } = require('../ric_ui/composite/create_ui_splitter');

      // state に入れない使い方 — __notify は注入されない
      const split = create_ui_splitter({ side: 'left', size: 200, collapsible: true });
      // 初回 render を一度走らせて内部状態を作る
      split({ side: { ctx: [] }, main: { ctx: [] } });

      // toggle 内部で safe_notify が呼ばれる → __notify 無し → warn 発火
      split.toggle();

      const warned = w.captured.filter(s => s.includes('has no __notify'));
      assert.equal(warned.length, 1, 'state 外置きで 1 回 warn する');
      assert.match(warned[0], /create_ui_splitter/);
      assert.match(warned[0], /top level of state/);
      // user が即ドキュメントに飛べるよう、warning 内で TUTORIAL.md を案内する
      assert.match(warned[0], /TUTORIAL\.md/);
    } finally {
      w.restore();
    }
  });

  test('同じ factory_name は 2 回目以降 warn しない (spam 防止)', () => {
    const { _reset_safe_notify_warnings } = require('../ric_ui/_factory_helpers');
    _reset_safe_notify_warnings();
    const w = capture_warns();
    try {
      const { create_ui_splitter } = require('../ric_ui/composite/create_ui_splitter');
      const split = create_ui_splitter({ side: 'left', collapsible: true });
      split({ side: { ctx: [] }, main: { ctx: [] } });

      split.toggle();
      split.toggle();
      split.toggle();

      const warned = w.captured.filter(s => s.includes('has no __notify'));
      assert.equal(warned.length, 1, 'spam しない: 何度 toggle しても 1 回だけ');
    } finally {
      w.restore();
    }
  });

  test('異なる factory_name は別カウンタで warn する', () => {
    const { _reset_safe_notify_warnings } = require('../ric_ui/_factory_helpers');
    _reset_safe_notify_warnings();
    const w = capture_warns();
    try {
      const { create_ui_splitter } = require('../ric_ui/composite/create_ui_splitter');
      const { create_ui_accordion } = require('../ric_ui/composite/create_ui_accordion');

      const split = create_ui_splitter({ side: 'left', collapsible: true });
      split({ side: { ctx: [] }, main: { ctx: [] } });
      split.toggle();

      const acc = create_ui_accordion();
      // accordion は items 内の onclick で safe_notify する。VDOM 経由でないと
      // 発火しないので、render 結果から onclick を直接取り出して呼ぶ。
      const node = acc({ items: [{ id: 'a', title: 't', ctx: [] }] });
      const header_btn = node.ctx[0].ctx[0];  // .ric-accordion__header
      header_btn.onclick();

      const splitter_warned  = w.captured.filter(s => s.includes('create_ui_splitter'));
      const accordion_warned = w.captured.filter(s => s.includes('create_ui_accordion'));
      assert.equal(splitter_warned.length,  1, 'splitter 1 回');
      assert.equal(accordion_warned.length, 1, 'accordion 1 回 (別カウンタ)');
    } finally {
      w.restore();
    }
  });

  test('_reset_safe_notify_warnings() で履歴をクリアすると再度 warn する', () => {
    const { _reset_safe_notify_warnings } = require('../ric_ui/_factory_helpers');
    _reset_safe_notify_warnings();
    const w = capture_warns();
    try {
      const { create_ui_splitter } = require('../ric_ui/composite/create_ui_splitter');
      const split = create_ui_splitter({ side: 'left', collapsible: true });
      split({ side: { ctx: [] }, main: { ctx: [] } });

      split.toggle();
      assert.equal(w.captured.length, 1);

      // reset 後はもう 1 回 warn が出る
      _reset_safe_notify_warnings();
      split.toggle();
      assert.equal(w.captured.length, 2);
    } finally {
      w.restore();
    }
  });
});

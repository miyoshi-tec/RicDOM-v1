'use strict';

// create_ui_popup: open_at() テスト (v0.4.3〜)
//
// 背景: consumer (Trend Guard) が「行の右クリック位置に popup を開く」ために、
// trigger を疑似 click した後 popup 本体の DOM に body.style.left / right を
// 直書きするハックを使っていた。RicDOM の style パッチは VDOM を正とするため、
// トースト表示等で popup 本体まで再 render が届くと直書きした left と VDOM 側の
// right が両立して popup が伸びるバグを踏んだ (RicDOM の canon どおりの挙動)。
// open_at はこれを埋める「座標を渡して開く公式 API」。
//
// 実 DOM への測定 (rAF で offsetWidth/offsetHeight を読む) が絡むため、
// 大半のテストは create_RicDOM + create_ui_page + 実 jsdom マウントで検証する。

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { create_ui_popup } = require('../ric_ui');
const { setup_jsdom: setup_jsdom_base, flush } = require('./_helpers/jsdom_env');

// ─────────────────────────────────────────────────────────────
// 実 DOM マウントのヘルパー
// ─────────────────────────────────────────────────────────────
// page + popup(menu) + toast を state のトップレベルに置いて create_RicDOM で
// マウントする。open_at は実 DOM を rAF で測るため、VDOM 検査だけでなく
// 実際に #app 配下へ描画する必要がある。
const setup_full = ({ innerHeight = 800, doc_width = 1024, doc_height = 800 } = {}) => {
  const dom = setup_jsdom_base({ body: '<div id="app"></div>', globals: ['getComputedStyle', 'Element', 'Event'] });
  Object.defineProperty(dom.window, 'innerHeight', { configurable: true, value: innerHeight });
  Object.defineProperty(dom.window.document.documentElement, 'clientWidth',  { configurable: true, value: doc_width });
  Object.defineProperty(dom.window.document.documentElement, 'clientHeight', { configurable: true, value: doc_height });

  const { create_RicDOM } = require('../src/ricdom');
  const { create_ui_page } = require('../ric_ui/layout/ui_page');
  const { create_ui_popup: _create_ui_popup, create_ui_toast } = require('../ric_ui');

  const target = document.querySelector('#app');
  const s = create_RicDOM(target, {
    page:  create_ui_page(),
    menu:  _create_ui_popup(),
    toast: create_ui_toast(),
    render(st) {
      st.toast(); // ポータル登録のみ（副作用のみ、null を返す）
      return st.page({ ctx: [
        st.menu({ ctx: [{ tag: 'div', ctx: ['項目'] }] }),
      ]});
    },
  });
  return { dom, s };
};

const get_popup_body   = () => document.querySelector('[data-ric-role="popup-body"]');
const get_popup_trigger = () => document.querySelector('[data-ric-role="popup-trigger"]');

// ─────────────────────────────────────────────────────────────
// 基本: 座標指定で開く
// ─────────────────────────────────────────────────────────────
describe('create_ui_popup: open_at() 基本', () => {

  it('open_at({x, y}) で _o=true になり、body が実 DOM に描画され、left/top が入り right は無い', async () => {
    const { s } = setup_full();
    s.menu.open_at({ x: 200, y: 100 });
    assert.equal(s.menu._o, true);

    await flush(30);

    const body = get_popup_body();
    assert.ok(body, 'popup body が実 DOM に描画される');
    assert.match(body.style.left, /^-?\d+(\.\d+)?px$/, 'left は座標由来の px 値');
    assert.match(body.style.top, /^-?\d+(\.\d+)?px$/, 'top は座標由来の px 値 (below 方向)');
    assert.equal(body.style.right, '', 'right は使わない');
  });

  it('MouseEvent 互換 ({ clientX, clientY, target }) を渡しても同じ結果になる', async () => {
    const { s } = setup_full();
    const target_el = document.querySelector('#app');
    s.menu.open_at({ clientX: 150, clientY: 60, target: target_el });
    assert.equal(s.menu._o, true);

    await flush(30);

    const body = get_popup_body();
    assert.ok(body);
    assert.match(body.style.left, /^-?\d+(\.\d+)?px$/);
    assert.equal(body.style.right, '');
  });
});

// ─────────────────────────────────────────────────────────────
// 回帰: 再 render で位置が保たれる / 旧ハックとの対照
// ─────────────────────────────────────────────────────────────
describe('create_ui_popup: open_at() の再 render 耐性 (回帰)', () => {

  it('open_at で開いた後 toast.show() で再 render しても left が保たれ right が出ない', async () => {
    const { s } = setup_full();
    s.menu.open_at({ x: 358, y: 40 });
    await flush(30);

    const body_before = get_popup_body();
    const left_before  = body_before.style.left;
    assert.equal(body_before.style.right, '');

    s.toast.show('保存しました', { duration: 0 }); // 0 = 自動消去なし
    await flush(30);

    const body_after = get_popup_body();
    assert.ok(body_after, '再 render 後も popup は開いたまま');
    assert.equal(body_after.style.left, left_before, 'toast の再 render 後も left が保たれる');
    assert.equal(body_after.style.right, '', 'right は依然として出ない（伸びない）');
  });

  it('対照: 旧ハック（popup 本体への DOM 直書き）は次の render で VDOM 側の値に上書きされる（canon の FACT 化）', async () => {
    const { s } = setup_full();

    // trigger 経由で開く（icon モード）。expand_right=false になるよう trigger の
    // rect を右寄りにモックし、_compute_pos が right を使うケースを作る。
    const trigger = get_popup_trigger();
    assert.ok(trigger);
    trigger.getBoundingClientRect = () => ({ top: 50, bottom: 70, left: 900, right: 940, width: 40 });
    trigger.onclick({ currentTarget: trigger });
    await flush(30);

    const body = get_popup_body();
    const right_before = body.style.right;
    assert.notEqual(right_before, '', '前提: 通常経路では right が使われる (expand_right=false)');

    // 旧ハック: 本体 DOM に直書きして「座標を動かす」
    body.style.left  = '358px';
    body.style.right = 'auto';

    // 何らかの理由で再 render が起きる（toast 等）
    s.toast.show('通知', { duration: 0 });
    await flush(30);

    const body_after = get_popup_body();
    // VDOM が正のため、直書きは消え、right は元の VDOM 値に復活する
    // (= left と right が両立して伸びる、というバグ報告どおりの再現)
    assert.equal(body_after.style.right, right_before, 'VDOM 側の right が復活する (RicDOM の canon)');
  });
});

// ─────────────────────────────────────────────────────────────
// 座標 clamp（横方向）
// ─────────────────────────────────────────────────────────────
describe('create_ui_popup: open_at() の横方向 clamp', () => {

  it('右端をはみ出す座標では left が containing block 内に収まるよう縮む', async () => {
    const { s, dom } = setup_full({ doc_width: 400, doc_height: 800 });
    // 実測本体幅を 300px に固定
    Object.defineProperty(dom.window.HTMLElement.prototype, 'offsetWidth', {
      configurable: true, get() { return 300; },
    });

    s.menu.open_at({ x: 390, y: 40 }); // 400 - 300 - 8(margin) = 92 が上限
    await flush(30);

    const body = get_popup_body();
    assert.equal(body.style.left, '92px', 'containing block 幅 400 / 本体幅 300 / margin 8 → 92px に clamp');
  });
});

// ─────────────────────────────────────────────────────────────
// 上下 flip（above への切り替え）
// ─────────────────────────────────────────────────────────────
describe('create_ui_popup: open_at() の上下 flip', () => {

  it('下に収まらなければ above が使われ top は付かない', async () => {
    const { s, dom } = setup_full({ innerHeight: 100 });
    // 実測本体高さを 300px に固定（下の空き 10px では到底収まらない）
    Object.defineProperty(dom.window.HTMLElement.prototype, 'offsetHeight', {
      configurable: true, get() { return 300; },
    });

    s.menu.open_at({ x: 50, y: 90 });
    await flush(30);

    assert.equal(s.menu._d, 'above');
    const body = get_popup_body();
    assert.equal(body.style.top, '', 'above のとき top は付かない');
    assert.match(body.style.bottom, /^-?\d+(\.\d+)?px$/, 'above のとき bottom が入る');
  });
});

// ─────────────────────────────────────────────────────────────
// 不正な引数
// ─────────────────────────────────────────────────────────────
describe('create_ui_popup: open_at() の不正な引数', () => {

  const capture_errors = () => {
    const calls = [];
    const original = console.error;
    console.error = (...args) => { calls.push(args); };
    return { calls, restore: () => { console.error = original; } };
  };

  it('undefined を渡すと console.error を出し、開かない（throw しない）', () => {
    const inst = create_ui_popup();
    inst.__notify = () => {};
    const err = capture_errors();
    try {
      assert.doesNotThrow(() => inst.open_at(undefined));
      assert.equal(inst._o, false);
      assert.equal(err.calls.length, 1);
    } finally {
      err.restore();
    }
  });

  it('{} (x/y も clientX/clientY も無い) を渡すと console.error を出し、開かない', () => {
    const inst = create_ui_popup();
    inst.__notify = () => {};
    const err = capture_errors();
    try {
      assert.doesNotThrow(() => inst.open_at({}));
      assert.equal(inst._o, false);
      assert.equal(err.calls.length, 1);
    } finally {
      err.restore();
    }
  });
});

// ─────────────────────────────────────────────────────────────
// 開いている最中の再呼び出し
// ─────────────────────────────────────────────────────────────
describe('create_ui_popup: open_at() の連続呼び出し', () => {

  it('開いている最中に別の座標で open_at を呼んでも閉じずに位置だけ更新される', async () => {
    const { s } = setup_full();
    s.menu.open_at({ x: 100, y: 50 });
    await flush(30);
    assert.equal(s.menu._o, true);

    const body1 = get_popup_body();
    const left1 = body1.style.left;

    s.menu.open_at({ x: 300, y: 60 });
    // 呼び出し直後、閉じてはいない（_c=false のまま、_o=true のまま）
    assert.equal(s.menu._o, true, '閉じない');
    assert.equal(s.menu._c, false, '閉じアニメにも入らない');

    await flush(30);

    const body2 = get_popup_body();
    assert.ok(body2, '再呼び出し後も popup は存在する');
    const left2 = body2.style.left;
    assert.notEqual(left2, left1, '位置が新しい座標に更新される');
  });
});

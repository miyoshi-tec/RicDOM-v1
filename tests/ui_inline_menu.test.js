// RicUI — ui_inline_menu テスト
//
// 検証範囲:
//   1. open=false で null を返す (render から消える)
//   2. open=true で div ノードを返し、position:absolute + anchor が style に出る
//   3. anchor の 4 方向すべてで style 文字列が正しい
//   4. onclick は e.stopPropagation() を呼ぶ（外クリック検知パターンの前提）
//   5. ctx / class / style 透過

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { ui_inline_menu } = require('../ric_ui/composite/ui_inline_menu');

describe('ui_inline_menu: 開閉', () => {

  test('open=false のとき null を返す', () => {
    assert.equal(ui_inline_menu({ open: false }), null);
  });

  test('open 省略時 (default=false) も null', () => {
    assert.equal(ui_inline_menu(), null);
  });

  test('open=true で div ノードを返す', () => {
    const n = ui_inline_menu({ open: true });
    assert.equal(n.tag, 'div');
  });

  test('open=true で ric-inline-menu class が付く', () => {
    assert.equal(ui_inline_menu({ open: true }).class, 'ric-inline-menu');
  });
});

describe('ui_inline_menu: anchor', () => {

  test('anchor=br (default) は top:100% + right:0', () => {
    const s = ui_inline_menu({ open: true }).style;
    assert.equal(s.top, '100%');
    assert.equal(s.right, 0);
  });

  test('anchor=bl は top:100% + left:0', () => {
    const s = ui_inline_menu({ open: true, anchor: 'bl' }).style;
    assert.equal(s.top, '100%');
    assert.equal(s.left, 0);
  });

  test('anchor=tr は bottom:100% + right:0', () => {
    const s = ui_inline_menu({ open: true, anchor: 'tr' }).style;
    assert.equal(s.bottom, '100%');
    assert.equal(s.right, 0);
  });

  test('anchor=tl は bottom:100% + left:0', () => {
    const s = ui_inline_menu({ open: true, anchor: 'tl' }).style;
    assert.equal(s.bottom, '100%');
    assert.equal(s.left, 0);
  });

  test('知らない anchor は default(br) に fallback', () => {
    const s = ui_inline_menu({ open: true, anchor: 'xx' }).style;
    assert.equal(s.top, '100%');
    assert.equal(s.right, 0);
  });

  test('position:absolute と z-index が必ず含まれる', () => {
    for (const a of ['br', 'bl', 'tr', 'tl']) {
      const s = ui_inline_menu({ open: true, anchor: a }).style;
      assert.equal(s.position, 'absolute', `anchor=${a}`);
      assert.equal(s.zIndex,   10,         `anchor=${a}`);
    }
  });
});

describe('ui_inline_menu: 外クリック検知の前提', () => {

  test('onclick が定義されている (stopPropagation のため)', () => {
    const n = ui_inline_menu({ open: true });
    assert.equal(typeof n.onclick, 'function');
  });

  test('onclick は e.stopPropagation() を呼ぶ', () => {
    const n = ui_inline_menu({ open: true });
    let called = false;
    const fake_event = { stopPropagation: () => { called = true; } };
    n.onclick(fake_event);
    assert.equal(called, true,
      'menu 内クリックは document に bubble させない — outside-click 検知の前提');
  });
});

describe('ui_inline_menu: 透過', () => {

  test('ctx が透過される', () => {
    const child = { tag: 'span', ctx: ['x'] };
    const n = ui_inline_menu({ open: true, ctx: [child] });
    assert.deepEqual(n.ctx, [child]);
  });

  test('class が ric-inline-menu の後ろに連結される', () => {
    const n = ui_inline_menu({ open: true, class: 'my-menu' });
    assert.equal(n.class, 'ric-inline-menu my-menu');
  });

  test('style (object) が base / anchor / 呼び出し側追加でマージされる', () => {
    const n = ui_inline_menu({
      open: true,
      style: { minWidth: '120px', maxWidth: '300px' },
    });
    // base
    assert.equal(n.style.position, 'absolute');
    // anchor (br)
    assert.equal(n.style.top, '100%');
    // 呼び出し側追加
    assert.equal(n.style.minWidth, '120px');
    assert.equal(n.style.maxWidth, '300px');
  });

  test('style (string 後方互換) も object に正規化されて受け入れられる', () => {
    // 公式は object 推奨だが、string 渡しも壊さない（後方互換）
    const n = ui_inline_menu({ open: true, style: 'min-width:120px' });
    assert.equal(n.style['min-width'], '120px');
  });
});

// =====================================================================
// dev warning: 親が positioned でないと silent failure になるのを検知 (v0.3.16〜)
// =====================================================================
// `top:100% + right:0` は nearest positioned ancestor を基準に計算されるため、
// 親が position:static (default) のままだと意図しない場所に出現する。
// 描画後 1 フレーム以内に親を点検して console.warn を出す。

describe('ui_inline_menu: dev warning (親の positioning)', () => {

  const { JSDOM } = require('jsdom');

  // 各テスト独立の jsdom + console.warn capture + ui_inline_menu の WeakSet を
  // 隔離するために、毎回 require cache をクリアして fresh module を取り直す。
  const setup = (parent_style) => {
    const dom = new JSDOM(
      `<!DOCTYPE html><html><body>` +
      `<div id="parent" style="${parent_style}">` +
      `  <!-- menu はここに RicDOM が render する想定だが、test では直接配置 -->` +
      `</div></body></html>`
    );
    global.window   = dom.window;
    global.document = dom.window.document;
    global.getComputedStyle = dom.window.getComputedStyle;
    global.WeakSet = WeakSet;
    // jsdom 標準には rAF が無いので setImmediate で代替
    // (setTimeout(cb,0) は Node v24 で稀に starve する race がある。tests/_helpers/jsdom_env.js 参照)
    global.requestAnimationFrame = (cb) => setImmediate(cb);

    const warns = [];
    const orig_warn = console.warn;
    console.warn = (...args) => { warns.push(args); };

    // モジュールキャッシュをクリアして WeakSet を新規にする
    delete require.cache[require.resolve('../ric_ui/composite/ui_inline_menu')];
    const { ui_inline_menu: fresh } = require('../ric_ui/composite/ui_inline_menu');

    // menu element を parent 配下に手動で追加 (RicDOM render の代わり)
    const menu_el = dom.window.document.createElement('div');
    menu_el.className = 'ric-inline-menu';
    dom.window.document.getElementById('parent').appendChild(menu_el);

    return {
      ui_inline_menu: fresh,
      warns,
      teardown: () => { console.warn = orig_warn; },
    };
  };

  // rAF (= setImmediate) が回るまで待つ。v0.4.5 以前はここだけ固定 10ms の setTimeout で
  // 待っていて、フルスイート負荷時に警告が出る前に assert に入る単発 flake があった
  // (18 回中 2 回)。共通ヘルパーの flush は setImmediate の順番で drain するので負荷に依存しない
  const { flush } = require('./_helpers/jsdom_env');

  test('親が position:static (default) のとき警告を出す', async () => {
    const { ui_inline_menu: f, warns, teardown } = setup('');
    f({ open: true });
    await flush();
    teardown();
    assert.equal(warns.length, 1, '警告が 1 回出る');
    assert.match(warns[0][0], /position/, 'メッセージに position が含まれる');
  });

  test('親が position:relative のとき警告を出さない', async () => {
    const { ui_inline_menu: f, warns, teardown } = setup('position: relative;');
    f({ open: true });
    await flush();
    teardown();
    assert.equal(warns.length, 0, '正しく positioned なので警告なし');
  });

  test('open=false なら親が static でも警告を出さない (check 自体が走らない)', async () => {
    const { ui_inline_menu: f, warns, teardown } = setup('');
    f({ open: false });
    await flush();
    teardown();
    assert.equal(warns.length, 0);
  });

  test('同じ親で複数回 open しても警告は 1 回だけ', async () => {
    const { ui_inline_menu: f, warns, teardown } = setup('');
    f({ open: true });
    await flush();
    f({ open: true });   // 同 render を再現
    await flush();
    f({ open: true });
    await flush();
    teardown();
    assert.equal(warns.length, 1, 'WeakSet で de-dupe される');
  });
});

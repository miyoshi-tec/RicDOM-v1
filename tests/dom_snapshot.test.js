// DOM スナップショットテスト
// jsdom で create_RicDOM を動かし、生成された innerHTML を確認する

'use strict';

process.env.NODE_ENV = 'test';

const { test, before } = require('node:test');
const { strict: assert } = require('node:assert');

const { setup_jsdom: setup_jsdom_base, flush: flush_raf } = require('./_helpers/jsdom_env');
// jsdom 環境をセットアップする（ricdom.js は window / document を前提とする）
// Element は SVGElement target を直接渡すケース (v0.3.15〜) で必要。
// _is_dom_element は HTMLElement にも fallback するので、Element 未設定の
// 古い setup でも HTML target は動作するが、SVG target テストには必須。
const setup_jsdom = (body = '<div id="app"></div>') =>
  setup_jsdom_base({ body, globals: ['Element'] });

// =====================================================================
// 初回描画（フルビルド）
// =====================================================================

test('シンプルな div が正しく描画される', async () => {
  const dom = setup_jsdom();
  const { create_RicDOM } = require('../src/ricdom');

  const state = { count: 0 };
  const target = dom.window.document.querySelector('#app');

  create_RicDOM(target, { ...state, render: s => ({
    tag: 'div', ctx: [ `カウント: ${s.count}` ],
  })});

  // 初回は同期描画
  assert.ok(target.innerHTML.includes('カウント: 0'), `innerHTML="${target.innerHTML}"`);
});

test('span に class と style が適用される', async () => {
  const dom = setup_jsdom();
  const { create_RicDOM } = require('../src/ricdom');

  const state = {};
  const target = dom.window.document.querySelector('#app');

  create_RicDOM(target, { ...state, render: _s => ({
    tag: 'span', class: 'my-label',
    ctx: [ 'テスト' ],
    style: { color: 'red' },
  })});

  const el = target.querySelector('.my-label');
  assert.ok(el, 'my-label クラスの要素が存在する');
  assert.equal(el.tagName.toLowerCase(), 'span');
  assert.equal(el.style.color, 'red');
  assert.equal(el.textContent, 'テスト');
});

test('button に id と複数クラスが適用される', async () => {
  const dom = setup_jsdom();
  const { create_RicDOM } = require('../src/ricdom');

  const state = {};
  const target = dom.window.document.querySelector('#app');

  create_RicDOM(target, { ...state, render: _s => ({
    tag: 'button', id: 'ok-btn', class: 'ric-button ric-button--primary',
    ctx: [ 'OK' ],
  })});

  const el = target.querySelector('#ok-btn');
  assert.ok(el, 'id=ok-btn の要素が存在する');
  assert.ok(el.classList.contains('ric-button'),           'ric-button クラスが付いている');
  assert.ok(el.classList.contains('ric-button--primary'),  'ric-button--primary クラスが付いている');
});

// =====================================================================
// 差分更新（reconciliation）
// =====================================================================

test('state 変更後にテキストが更新される', async () => {
  const dom = setup_jsdom();
  const { create_RicDOM } = require('../src/ricdom');

  const state = { count: 0 };
  const target = dom.window.document.querySelector('#app');

  const panel = create_RicDOM(target, { ...state, render: s => ({
    tag: 'div', ctx: [ `カウント: ${s.count}` ],
  })});

  // 初回描画確認
  assert.ok(target.textContent.includes('カウント: 0'));

  // state を更新して、予約された render の完了を観測する (時間待ちではなく next_render)。
  // v0.4.5 以前は flush_raf() の固定 10ms 待ちだったため、フルスイート負荷時に旧値のまま
  // assert に入る単発 flake が起きていた (3 回観測、v0.4.6 で見直し)
  panel.count = 5;
  await panel.next_render();

  assert.ok(target.textContent.includes('カウント: 5'), `textContent="${target.textContent}"`);
});

test('input に value と type が設定される', async () => {
  const dom = setup_jsdom();
  const { create_RicDOM } = require('../src/ricdom');

  const state = { text: 'hello' };
  const target = dom.window.document.querySelector('#app');

  create_RicDOM(target, { ...state, render: s => ({
    tag: 'input',
    type:  'text',
    value: s.text,
  })});

  const input_el = target.querySelector('input');
  assert.ok(input_el, 'input 要素が存在する');
  assert.equal(input_el.value, 'hello');
  assert.equal(input_el.type, 'text');
});

test('null 要素は描画されない', async () => {
  const dom = setup_jsdom();
  const { create_RicDOM } = require('../src/ricdom');

  const state = { show: false };
  const target = dom.window.document.querySelector('#app');

  create_RicDOM(target, { ...state, render: s => ({
    tag: 'div', ctx: [
      '常に表示',
      s.show ? { tag: 'span', ctx: ['オプション'] } : null,
    ],
  })});

  assert.ok(!target.querySelector('span'), 'show=false では span が存在しない');
  assert.ok(target.textContent.includes('常に表示'));
});

test('state 変更で要素が出現する', async () => {
  const dom = setup_jsdom();
  const { create_RicDOM } = require('../src/ricdom');

  const state = { show: false };
  const target = dom.window.document.querySelector('#app');

  const panel = create_RicDOM(target, { ...state, render: s => ({
    tag: 'div', ctx: [
      { tag: 'div', ctx: ['ラベル'] },
      s.show ? { tag: 'span', ctx: ['出現'] } : null,
    ],
  })});

  assert.ok(!target.querySelector('span'), '初期は span なし');

  panel.show = true;
  await flush_raf();

  assert.ok(target.querySelector('span'), 'show=true 後は span が存在する');
  assert.equal(target.querySelector('span').textContent, '出現');
});

// =====================================================================
// input フォーカス問題（シリアルキー修正の回帰テスト）
// =====================================================================

test('同層に div が複数ある状態遷移で input が再生成されない', async () => {
  // 修正前は innerHTML = '' で input が破棄されていたバグの回帰テスト
  // シリアルキー方式（div@0 / div@1）でノードを再利用するようにした修正の検証
  const dom = setup_jsdom();
  const { create_RicDOM } = require('../src/ricdom');

  const state2 = { name: '' };
  const target2 = dom.window.document.querySelector('#app');

  const panel2 = create_RicDOM(target2, { ...state2, render: s => ({
    tag: 'div', ctx: [
      { tag: 'div', ctx: ['お名前'] },
      { tag: 'input', type: 'text', value: s.name },
      s.name ? { tag: 'div', ctx: [`こんにちは、${s.name}さん`] } : null,
    ],
  })});

  // 初回：input が存在する
  const input_first = target2.querySelector('input');
  assert.ok(input_first, '初期状態で input が存在する');

  // state.name を変更（挨拶 div が追加される → 同層に div が2個）
  panel2.name = 'やまざき';
  await flush_raf();

  const input_after = target2.querySelector('input');
  assert.ok(input_after, '再描画後も input が存在する');

  // input が同一 DOM ノードかどうか（再生成されていないか）
  // 修正前は innerHTML='' → input が破棄されて別ノードになっていた
  assert.strictEqual(input_first, input_after,
    'シリアルキー修正後は input ノードを再利用するため同一参照になる');

  // 挨拶テキストが表示されている
  assert.ok(target2.textContent.includes('こんにちは、やまざきさん'));
});

// =====================================================================
// ref システム
// =====================================================================

test('ref を付けた要素が panel.refs.get() で取得できる', async () => {
  const dom = setup_jsdom();
  const { create_RicDOM } = require('../src/ricdom');

  const state = {};
  const target = dom.window.document.querySelector('#app');

  const panel = create_RicDOM(target, { ...state, render: _s => ({
    tag: 'div', ctx: [
      { tag: 'input', type: 'text', ref: 'name-input' },
      { tag: 'div', ctx: ['ラベル'] },
    ],
  })});

  const ref_el = panel.refs.get('name-input');
  assert.ok(ref_el, 'refs.get("name-input") が DOM ノードを返す');
  assert.equal(ref_el.tagName.toLowerCase(), 'input');
  // ref は id 属性としては出力されない
  assert.equal(ref_el.id, '');
  // data-ric-ref 属性が設定されている
  assert.equal(ref_el.dataset.ricRef, 'name-input');
});

test('ref は DOM に id 属性として出力されない', async () => {
  const dom = setup_jsdom();
  const { create_RicDOM } = require('../src/ricdom');

  const state = {};
  const target = dom.window.document.querySelector('#app');

  create_RicDOM(target, { ...state, render: _s => ({
    tag: 'div',
    ctx: [ '内容' ],
    ref: 'my-div',
  })});

  // id 属性は付かない（ref と id は別物）
  const by_id = dom.window.document.getElementById('my-div');
  assert.equal(by_id, null, 'ref 名では getElementById で取得できない');

  // data-ric-ref は付いている
  const by_ref = target.querySelector('[data-ric-ref="my-div"]');
  assert.ok(by_ref, '[data-ric-ref="my-div"] 要素が存在する');
});

test('ref が動的に変化しても refs.get() が追従する', async () => {
  const dom = setup_jsdom();
  const { create_RicDOM } = require('../src/ricdom');

  const state = { mode: 'a' };
  const target = dom.window.document.querySelector('#app');

  const panel = create_RicDOM(target, { ...state, render: s => ({
    tag: 'div', ctx: [
      // mode に応じて別々の要素に ref を付ける
      s.mode === 'a'
        ? { tag: 'span', ctx: ['A'], ref: 'active-el' }
        : { tag: 'button', ctx: ['B'], ref: 'active-el' },
    ],
  })});

  const ref_a = panel.refs.get('active-el');
  assert.equal(ref_a.tagName.toLowerCase(), 'span', '初期は span が active-el');

  // mode を変える（ref は同じ名前だが別ノードに付く）
  panel.mode = 'b';
  await flush_raf();

  const ref_b = panel.refs.get('active-el');
  assert.equal(ref_b.tagName.toLowerCase(), 'button', '変更後は button が active-el');
  assert.notStrictEqual(ref_a, ref_b, '異なるノードに切り替わっている');
});

// =====================================================================
// 非表示値
// =====================================================================

test('false / undefined は描画されない', async () => {
  const dom = setup_jsdom();
  const { create_RicDOM } = require('../src/ricdom');

  const state = {};
  const target = dom.window.document.querySelector('#app');

  create_RicDOM(target, { ...state, render: _s => ({
    tag: 'div', ctx: [
      'テキスト',
      false,
      undefined,
    ],
  })});

  assert.equal(target.textContent, 'テキスト');
});

// =====================================================================
// 複数 ref の共存
// =====================================================================

test('複数の ref が同一パネルに共存できる', async () => {
  const dom = setup_jsdom();
  const { create_RicDOM } = require('../src/ricdom');

  const state = {};
  const target = dom.window.document.querySelector('#app');

  const panel = create_RicDOM(target, { ...state, render: _s => ({
    tag: 'div', ctx: [
      { tag: 'input',    type: 'text', ref: 'title-input' },
      { tag: 'textarea', ref: 'body-input' },
      { tag: 'button',   ctx: ['送信'], ref: 'submit-btn' },
    ],
  })});

  const title_el = panel.refs.get('title-input');
  const body_el  = panel.refs.get('body-input');
  const btn_el   = panel.refs.get('submit-btn');

  assert.ok(title_el, 'title-input ref が存在する');
  assert.ok(body_el,  'body-input ref が存在する');
  assert.ok(btn_el,   'submit-btn ref が存在する');
  assert.equal(title_el.tagName.toLowerCase(), 'input',    'title-input は input 要素');
  assert.equal(body_el.tagName.toLowerCase(),  'textarea', 'body-input は textarea 要素');
  assert.equal(btn_el.tagName.toLowerCase(),   'button',   'submit-btn は button 要素');
  // 3つのノードがすべて別々の DOM ノードを指している
  assert.notStrictEqual(title_el, body_el);
  assert.notStrictEqual(body_el,  btn_el);
});

// =====================================================================
// destroy()
// =====================================================================

test('destroy() 後は state を変更しても再描画されない', async () => {
  // destroy() が subscribers.delete(schedule_render) を正しく呼んでいることの確認
  // 購読が解除されていれば rAF が積まれず DOM は更新されない
  const dom = setup_jsdom();
  const { create_RicDOM } = require('../src/ricdom');

  const state = { count: 0 };
  const target = dom.window.document.querySelector('#app');

  const panel = create_RicDOM(target, { ...state, render: s => ({
    tag: 'div', ctx: [ `${s.count}` ],
  })});

  assert.ok(target.textContent.includes('0'), '初期描画: 0');

  panel._internal.destroy();

  // destroy 後に state を変更する（raw_state は変わるが re-render はスキップされる）
  panel.count = 99;
  await flush_raf();

  assert.ok(target.textContent.includes('0'),  '再描画されずに 0 のまま');
  assert.ok(!target.textContent.includes('99'), '99 は表示されない');
});

test('destroy() 後は refs が空になる', async () => {
  const dom = setup_jsdom();
  const { create_RicDOM } = require('../src/ricdom');

  const state = {};
  const target = dom.window.document.querySelector('#app');

  const panel = create_RicDOM(target, { ...state, render: _s => ({
    tag: 'div', ctx: [ { tag: 'input', ref: 'my-input' } ],
  })});

  assert.ok(panel.refs.get('my-input'), 'destroy 前は ref が取得できる');

  panel._internal.destroy();

  // destroy() 内で refs_map.clear() が呼ばれるため undefined になる
  assert.equal(panel.refs.get('my-input'), undefined, 'destroy 後は refs が空');
});

test('destroy() 後に force_render() を呼んでも no-op', async () => {
  const dom = setup_jsdom();
  const { create_RicDOM } = require('../src/ricdom');

  const state = { count: 0 };
  const target = dom.window.document.querySelector('#app');

  const panel = create_RicDOM(target, { ...state, render: s => ({
    tag: 'div', ctx: [ `${s.count}` ],
  })});

  // 一度描画させる
  panel.count = 5;
  await flush_raf();
  assert.ok(target.textContent.includes('5'), '変更後 5');

  panel._internal.destroy();

  // force_render() を呼んでもエラーなし・DOM 変化なし
  panel._internal.force_render();
  assert.ok(target.textContent.includes('5'), 'destroy 後の force_render は no-op');
});

// =====================================================================
// shared state（複数インスタンスで state を共有）
// =====================================================================

test('shared state：片方のハンドルを変更すると両方のインスタンスが再描画される', async () => {
  // コア機能：同じ raw state を渡した2インスタンスは常に同期して再描画される
  const dom = setup_jsdom();
  const { create_RicDOM } = require('../src/ricdom');

  const shared = { count: 0 };
  // 独立した2つのターゲットを用意する
  const target_a = dom.window.document.createElement('div');
  const target_b = dom.window.document.createElement('div');
  dom.window.document.body.appendChild(target_a);
  dom.window.document.body.appendChild(target_b);

  shared.render = s => ({ tag: 'div', ctx: [`A:${s.count}`] });
  const panel_a = create_RicDOM(target_a, shared);
  shared.render = s => ({ tag: 'div', ctx: [`B:${s.count}`] });
  /* panel_b = */ create_RicDOM(target_b, shared);

  assert.ok(target_a.textContent.includes('A:0'), `初期 A: "${target_a.textContent}"`);
  assert.ok(target_b.textContent.includes('B:0'), `初期 B: "${target_b.textContent}"`);

  // panel_a のハンドルから count を変更する → 両方が再描画されるはず
  panel_a.count = 5;
  await flush_raf();

  assert.ok(target_a.textContent.includes('A:5'), `変更後 A: "${target_a.textContent}"`);
  assert.ok(target_b.textContent.includes('B:5'), `変更後 B: "${target_b.textContent}"`);
});

test('shared state：一方を destroy() しても他方は引き続き動作する', async () => {
  const dom = setup_jsdom();
  const { create_RicDOM } = require('../src/ricdom');

  const shared = { count: 0 };
  const target_a = dom.window.document.createElement('div');
  const target_b = dom.window.document.createElement('div');
  dom.window.document.body.appendChild(target_a);
  dom.window.document.body.appendChild(target_b);

  shared.render = s => ({ tag: 'div', ctx: [`A:${s.count}`] });
  const panel_a = create_RicDOM(target_a, shared);
  shared.render = s => ({ tag: 'div', ctx: [`B:${s.count}`] });
  const panel_b = create_RicDOM(target_b, shared);

  // panel_a だけ先に破棄する
  panel_a._internal.destroy();

  // panel_b から count を変更する
  panel_b.count = 7;
  await flush_raf();

  // destroy 済みの panel_a は再描画されない
  assert.ok(target_a.textContent.includes('A:0'), `destroy 済みの A は更新されない: "${target_a.textContent}"`);
  // panel_b は引き続き動作する
  assert.ok(target_b.textContent.includes('B:7'), `B は更新される: "${target_b.textContent}"`);
});

test('numeric text 0 -> 1 is reflected on first click', async () => {
  const dom = setup_jsdom();
  const { create_RicDOM } = require('../src/ricdom');

  const state = { count: 0 };
  const target = dom.window.document.querySelector('#app');

  create_RicDOM(target, { ...state, render: s => ({
    tag: 'div', ctx: [
      { tag: 'h2', ctx: ['Counter'] },
      { tag: 'div', ctx: s.count },
      { tag: 'button', ctx: ['+1'], onclick: () => { s.count += 1; } },
    ],
  })});

  const button = target.querySelector('button');
  assert.ok(button, 'button exists');
  assert.ok(target.textContent.includes('0'), `initial textContent="${target.textContent}"`);

  button.onclick();
  await flush_raf();

  assert.ok(target.textContent.includes('1'), `after first click textContent="${target.textContent}"`);
});

// =====================================================================
// s.render による描画関数の後設定
// =====================================================================

test('render_fn 省略で create_RicDOM が正常に返る（NOOP_PROXY にならない）', async () => {
  const dom = setup_jsdom();
  const { create_RicDOM } = require('../src/ricdom');

  const target = dom.window.document.querySelector('#app');
  const s = create_RicDOM(target, { count: 0 });

  // NOOP_PROXY ではなく Proxy が返る（count にアクセスできる）
  assert.equal(s.count, 0, 'state にアクセスできる');

  // 初回描画はスキップされる（render_fn が空関数のため）
  assert.equal(target.innerHTML, '', '初回描画はスキップ');
});

test('s.render = fn で描画が実行される', async () => {
  const dom = setup_jsdom();
  const { create_RicDOM } = require('../src/ricdom');

  const target = dom.window.document.querySelector('#app');
  const s = create_RicDOM(target, { name: 'world' });

  assert.equal(target.innerHTML, '', '描画前は空');

  // render 関数を後から設定
  s.render = (s) => ({ tag: 'div', ctx: [`Hello, ${s.name}!`] });
  await flush_raf();

  assert.ok(target.textContent.includes('Hello, world!'), `描画された: "${target.textContent}"`);
});

test('s.render 設定後に state 変更で再描画される', async () => {
  const dom = setup_jsdom();
  const { create_RicDOM } = require('../src/ricdom');

  const target = dom.window.document.querySelector('#app');
  const s = create_RicDOM(target, { count: 0, ignore: {} });

  s.render = (s) => ({ tag: 'div', ctx: [`count: ${s.count}`] });
  await flush_raf();

  assert.ok(target.textContent.includes('count: 0'), '初回描画');

  s.count = 42;
  await flush_raf();

  assert.ok(target.textContent.includes('count: 42'), `再描画: "${target.textContent}"`);
});

test('新APIの2引数パターン（render内蔵）が動作する', async () => {
  const dom = setup_jsdom();
  const { create_RicDOM } = require('../src/ricdom');

  const target = dom.window.document.querySelector('#app');
  const s = create_RicDOM(target, { msg: 'hello', render: (s) => ({
    tag: 'div', ctx: [s.msg],
  })});

  // 初回は同期描画
  assert.ok(target.textContent.includes('hello'), '初回同期描画');

  s.msg = 'updated';
  await flush_raf();

  assert.ok(target.textContent.includes('updated'), `再描画: "${target.textContent}"`);
});

// =====================================================================
// SVG namespace
// =====================================================================

const SVG_NS = 'http://www.w3.org/2000/svg';

test('SVG: 初回マウントで svg/子孫が SVG namespace で作られる', () => {
  const dom = setup_jsdom();
  const { create_RicDOM } = require('../src/ricdom');

  const target = dom.window.document.querySelector('#app');
  create_RicDOM(target, { render: () => ({
    tag: 'svg', viewBox: '0 0 100 100',
    ctx: [{ tag: 'circle', cx: 50, cy: 50, r: 40, fill: 'red' }],
  })});

  const svg = target.querySelector('svg');
  const circle = target.querySelector('circle');
  assert.equal(svg.namespaceURI, SVG_NS, 'svg は SVG namespace');
  assert.equal(circle.namespaceURI, SVG_NS, 'circle も SVG namespace を継承');
});

test('SVG: 差分更新で新規追加される子要素も SVG namespace で作られる', async () => {
  const dom = setup_jsdom();
  const { create_RicDOM } = require('../src/ricdom');

  const target = dom.window.document.querySelector('#app');
  const s = create_RicDOM(target, { count: 0, render: (s) => ({
    tag: 'svg', viewBox: '0 0 100 100',
    ctx: s.count === 0
      ? []
      : [{ tag: 'circle', cx: 50, cy: 50, r: 40, fill: 'red' }],
  })});

  // 初回: 子なし
  assert.equal(target.querySelector('circle'), null);

  // 差分更新で circle を追加
  s.count = 1;
  await flush_raf();

  const circle = target.querySelector('circle');
  assert.ok(circle, 'circle が追加される');
  assert.equal(circle.namespaceURI, SVG_NS,
    '差分追加された circle も SVG namespace で生成される');
});

test('SVG: serial key が変わった子要素の置換でも SVG namespace が維持される', async () => {
  const dom = setup_jsdom();
  const { create_RicDOM } = require('../src/ricdom');

  const target = dom.window.document.querySelector('#app');
  const s = create_RicDOM(target, { shape: 'circle', render: (s) => ({
    tag: 'svg', viewBox: '0 0 100 100',
    ctx: [
      s.shape === 'circle'
        ? { tag: 'circle', cx: 50, cy: 50, r: 40, fill: 'red' }
        : { tag: 'rect',   x: 10, y: 10, width: 80, height: 80, fill: 'blue' },
    ],
  })});

  // 初回: circle
  assert.equal(target.querySelector('circle').namespaceURI, SVG_NS);

  // 置換: rect (serial key が違うので replaceChild 経由)
  s.shape = 'rect';
  await flush_raf();

  const rect = target.querySelector('rect');
  assert.ok(rect, 'rect に置換される');
  assert.equal(rect.namespaceURI, SVG_NS,
    '置換された rect も SVG namespace を引き継ぐ');
});

test('SVG: 動的に要素数が変わっても全要素が SVG namespace で作られる', async () => {
  const dom = setup_jsdom();
  const { create_RicDOM } = require('../src/ricdom');

  const target = dom.window.document.querySelector('#app');
  const s = create_RicDOM(target, { n: 1, render: (s) => ({
    tag: 'svg', viewBox: '0 0 100 100',
    ctx: Array.from({ length: s.n }, (_, i) =>
      ({ tag: 'circle', cx: 10 + i * 10, cy: 50, r: 4, fill: 'red' })
    ),
  })});

  // n=3 に増やす
  s.n = 3;
  await flush_raf();

  const circles = target.querySelectorAll('circle');
  assert.equal(circles.length, 3);
  for (const c of circles) {
    assert.equal(c.namespaceURI, SVG_NS);
  }
});

test('SVG: HTML 要素の差分更新は従来通り HTML namespace', async () => {
  const dom = setup_jsdom();
  const { create_RicDOM } = require('../src/ricdom');
  const XHTML_NS = 'http://www.w3.org/1999/xhtml';

  const target = dom.window.document.querySelector('#app');
  const s = create_RicDOM(target, { count: 0, render: (s) => ({
    tag: 'div',
    ctx: s.count === 0 ? [] : [{ tag: 'span', ctx: ['hello'] }],
  })});

  s.count = 1;
  await flush_raf();

  const span = target.querySelector('span');
  assert.ok(span);
  // parent.namespaceURI が XHTML でも、HTML 要素として正しく動作する
  assert.equal(span.namespaceURI, XHTML_NS, 'span は HTML namespace のまま');
});

// =====================================================================
// SVG namespace: target が SVG 要素のケース (v0.3.15〜)
// =====================================================================
// 旧バグ (UnizonTool dev 報告): 静的 HTML の `<svg id="stage">` を target に
// して create_RicDOM すると、初回 build_dom_node が inherited_namespace 無しで
// 呼ばれ、生成される `<path>` / `<g>` / `<circle>` 等が HTML namespace になる。
// DOM 上には存在するが SVG renderer が認識しないため画面が真っ白になる。
// 修正後: do_render の初回マウントで target_el.namespaceURI を引き継ぐ。

const SVG_STAGE_BODY = '<svg id="stage" viewBox="0 0 100 100"></svg>';

test('SVG: target=<svg> selector で初回マウントしても子は SVG namespace', () => {
  const dom = setup_jsdom(SVG_STAGE_BODY);
  const { create_RicDOM } = require('../src/ricdom');

  create_RicDOM('#stage', { render: () => ({
    tag: 'path', d: 'M 0,0 L 100,100', stroke: 'red',
  })});

  const path = dom.window.document.querySelector('path');
  assert.ok(path, 'path が DOM 上に存在する');
  assert.equal(path.namespaceURI, SVG_NS,
    '<svg> target に対する初回 path も SVG namespace で生成される');
});

test('SVG: target=<svg> 要素を直接渡しても受け付ける (HTMLElement 派生でなくとも)', () => {
  const dom = setup_jsdom(SVG_STAGE_BODY);
  const { create_RicDOM } = require('../src/ricdom');

  const svg_el = dom.window.document.querySelector('#stage');
  // SVGElement は HTMLElement を継承していないので、HTMLElement 判定だけだと reject される。
  // Element 判定に変わったことを保証する regression test。
  const handle = create_RicDOM(svg_el, { render: () => ({
    tag: 'circle', cx: 50, cy: 50, r: 40,
  })});

  assert.ok(handle, 'handle が NOOP_PROXY ではなく実 instance');
  const circle = dom.window.document.querySelector('circle');
  assert.ok(circle, 'circle が DOM 上に存在する');
  assert.equal(circle.namespaceURI, SVG_NS, 'circle も SVG namespace');
});

test('SVG: target=<svg> での差分更新後も子は SVG namespace を維持', async () => {
  const dom = setup_jsdom(SVG_STAGE_BODY);
  const { create_RicDOM } = require('../src/ricdom');

  const s = create_RicDOM('#stage', {
    n: 1,
    render: (s) => ({
      tag: 'g',
      ctx: Array.from({ length: s.n }, (_, i) => ({
        tag: 'circle', cx: 10 + i * 10, cy: 50, r: 4,
      })),
    }),
  });

  // 初回 g + 1 circle, ともに SVG namespace
  assert.equal(dom.window.document.querySelector('g').namespaceURI, SVG_NS);
  assert.equal(dom.window.document.querySelector('circle').namespaceURI, SVG_NS);

  // 差分追加
  s.n = 3;
  await flush_raf();
  const circles = dom.window.document.querySelectorAll('circle');
  assert.equal(circles.length, 3, '差分追加で circle が 3 個');
  for (const c of circles) {
    assert.equal(c.namespaceURI, SVG_NS, '差分追加された circle も SVG namespace');
  }
});

// =====================================================================
// style diff: prev/next の (string | object | 無し) 全組み合わせ
// =====================================================================
// 旧バグ: prev が文字列形式 (style: 'flex:1' 等) のとき、次の render で
//        style が object（空含む）になっても cssText がクリアされず残留した。
//        else 分岐のリセットループが typeof prev_style !== 'string' でガード
//        されていて prev が string だと丸ごとスキップされていたのが原因。
// 修正後: else 分岐冒頭で prev が string なら cssText='' で一括クリアする。

// 共通のヘルパ — mode を切り替えて span の style 遷移を検証する。
// 初回 render は create_RicDOM の同期描画で prev が当たる。s.mode を 'b' に
// 切り替えて flush_raf することで次 render に進み、next が当たる。
// next === undefined のときは VDOM の style キーごと省略する（「style プロパティ
// 自体が無いノード」と「style:{} なノード」を呼び分けたいため）。
const run_style_transition = async ({ prev, next }) => {
  const dom = setup_jsdom();
  const { create_RicDOM } = require('../src/ricdom');
  const target = dom.window.document.querySelector('#app');

  const s = create_RicDOM(target, {
    mode: 'a',
    render: (s) => {
      const node = { tag: 'span', ctx: ['X'] };
      const style = s.mode === 'a' ? prev : next;
      if (style !== undefined) node.style = style;
      return node;
    },
  });

  s.mode = 'b';
  await flush_raf();

  return target.querySelector('span');
};

test('style diff: string → string で cssText が完全に上書きされる', async () => {
  const span = await run_style_transition({
    prev: 'color:red',
    next: 'background:blue',
  });
  // prev の color は残らず、next の background のみが効いている
  assert.equal(span.style.color, '');
  assert.equal(span.style.background, 'blue');
});

test('style diff: string → object で旧 cssText がクリアされる', async () => {
  const span = await run_style_transition({
    prev: 'color:red',
    next: { background: 'blue' },
  });
  assert.equal(span.style.color, '', 'prev の color が残ってはいけない');
  assert.equal(span.style.background, 'blue', 'next の background は適用される');
});

test('style diff: string → style キー無しで inline style が消える', async () => {
  const span = await run_style_transition({
    prev: 'color:red',
    next: undefined,  // VDOM から style プロパティ自体を省略
  });
  assert.equal(span.getAttribute('style') || '', '', 'inline style が空になっている');
});

test('style diff: string → 空 object で inline style が消える', async () => {
  // Rancha の path bar で踏んだ症状（spacer span の style:'flex:1' が、
  // style を持たない sibling span に差し替えたとき残留する）と同質のケース。
  const span = await run_style_transition({
    prev: 'flex:1',
    next: {},
  });
  assert.equal(span.getAttribute('style') || '', '', 'flex:1 が残ってはいけない');
});

test('style diff: object → string で cssText が完全に上書きされる', async () => {
  const span = await run_style_transition({
    prev: { color: 'red' },
    next: 'background:blue',
  });
  assert.equal(span.style.color, '');
  assert.equal(span.style.background, 'blue');
});

test('style diff: object → object で消えたキーがリセットされる', async () => {
  const span = await run_style_transition({
    prev: { color: 'red', background: 'yellow' },
    next: { background: 'blue' },
  });
  assert.equal(span.style.color, '', '消えた color はクリアされる');
  assert.equal(span.style.background, 'blue', '残った background は更新される');
});

test('style diff: object → style キー無しで inline style が消える', async () => {
  const span = await run_style_transition({
    prev: { color: 'red' },
    next: undefined,
  });
  assert.equal(span.getAttribute('style') || '', '');
});

// =====================================================================
// CSS Custom Property (`--*`) 対応
// =====================================================================
// 旧バグ: vdom の style object に `'--my-var': 'red'` を書いても DOM に
//        反映されない。原因は 2 つ:
//   1) convert_style_key_to_camel が '--ric-color-bg' を '-RicColorBg' に
//      壊してしまう (leading -- が - 1 個になり CSS variable 認識しなくなる)
//   2) el.style[key] = val は CSS Custom Property に対して silent no-op
//      (必ず el.style.setProperty(key, val) を使う必要がある)
// 修正後: convert は --* を保護、apply/reset ループは --* を setProperty /
//        removeProperty で扱う。

const { create_RicDOM } = require('../src/ricdom');

test('CSS Custom Property: vdom style に --* を書くと DOM に setProperty で適用される', () => {
  const dom = setup_jsdom();
  const target = dom.window.document.querySelector('#app');

  create_RicDOM(target, {
    render: () => ({
      tag: 'div', id: 'box',
      style: { '--my-var': 'red', background: 'var(--my-var)' },
    }),
  });

  const el = dom.window.document.querySelector('#box');
  // getPropertyValue で読めること = setProperty で書かれた証拠
  assert.equal(el.style.getPropertyValue('--my-var'), 'red', '--my-var が setProperty で書かれている');
  // var() 参照も inline style に残る (browser が解決するのは表示時)
  assert.match(el.style.cssText, /var\(--my-var\)/);
});

test('CSS Custom Property: --* を含む key が camelCase に壊されない', () => {
  // 単体ユニットテストとして convert を直接叩く (__test_exports は
  // process.env.NODE_ENV === 'test' のときだけ生える)
  const { __test_exports } = require('../src/ricdom');
  const conv = __test_exports.convert_style_key_to_camel;
  assert.equal(conv('--ric-color-bg'), '--ric-color-bg', '--* はそのまま');
  assert.equal(conv('--x'), '--x', '短い --* もそのまま');
  // 通常の kebab-case 変換は維持されている (regression guard)
  assert.equal(conv('padding-top'), 'paddingTop');
  assert.equal(conv('background-color'), 'backgroundColor');
});

test('CSS Custom Property: 値変更で DOM が追従する', async () => {
  const dom = setup_jsdom();
  const target = dom.window.document.querySelector('#app');
  const s = create_RicDOM(target, {
    color: 'red',
    render: (s) => ({
      tag: 'div', id: 'box', style: { '--my-var': s.color },
    }),
  });

  let el = dom.window.document.querySelector('#box');
  assert.equal(el.style.getPropertyValue('--my-var'), 'red');

  s.color = 'blue';
  await flush_raf();

  el = dom.window.document.querySelector('#box');
  assert.equal(el.style.getPropertyValue('--my-var'), 'blue', '値変更で DOM 追従');
});

test('CSS Custom Property: style から削除すると DOM からも removeProperty される', async () => {
  const dom = setup_jsdom();
  const target = dom.window.document.querySelector('#app');
  const s = create_RicDOM(target, {
    has_var: true,
    render: (s) => ({
      tag: 'div', id: 'box',
      style: s.has_var ? { '--my-var': 'red' } : {},
    }),
  });

  let el = dom.window.document.querySelector('#box');
  assert.equal(el.style.getPropertyValue('--my-var'), 'red');

  s.has_var = false;
  await flush_raf();

  el = dom.window.document.querySelector('#box');
  assert.equal(el.style.getPropertyValue('--my-var'), '',
    '--* が style から消えると DOM の custom property も消える');
});

test('CSS Custom Property: 通常の style プロパティと混在しても両方反映', () => {
  const dom = setup_jsdom();
  const target = dom.window.document.querySelector('#app');

  create_RicDOM(target, {
    render: () => ({
      tag: 'div', id: 'box',
      style: {
        '--theme-fg': '#111',
        '--theme-bg': '#fff',
        padding:      '8px',
        background:   'var(--theme-bg)',
      },
    }),
  });

  const el = dom.window.document.querySelector('#box');
  assert.equal(el.style.getPropertyValue('--theme-fg'), '#111');
  assert.equal(el.style.getPropertyValue('--theme-bg'), '#fff');
  assert.equal(el.style.padding, '8px');
  assert.match(el.style.cssText, /var\(--theme-bg\)/);
});

test('CSS Custom Property: string style → object style (--* 含む) で --* が反映される', async () => {
  // prev が string style だと cssText='' で sweep されるパスを通る。
  // その後 object 側の apply で --* が setProperty 経由で書かれることを保証。
  const dom = setup_jsdom();
  const target = dom.window.document.querySelector('#app');

  const s = create_RicDOM(target, {
    use_string: true,
    render: (s) => ({
      tag: 'div', id: 'box',
      style: s.use_string
        ? 'color: red'                         // string 形式
        : { '--my-var': 'blue', color: 'green' }, // object with --*
    }),
  });

  let el = dom.window.document.querySelector('#box');
  assert.equal(el.style.color, 'red', '初期 string style');

  s.use_string = false;
  await flush_raf();

  el = dom.window.document.querySelector('#box');
  assert.equal(el.style.getPropertyValue('--my-var'), 'blue',
    'string → object 遷移で --* が setProperty 経由で書かれる');
  assert.equal(el.style.color, 'green', '通常プロパティも反映');
});

test('CSS Custom Property: object style (--* 含む) → string style で --* が cssText で sweep される', async () => {
  // prev に --* がある状態で next が string style に切り替わると、
  // 旧の --* が残らない (cssText 一括上書きで sweep される) ことを保証。
  const dom = setup_jsdom();
  const target = dom.window.document.querySelector('#app');

  const s = create_RicDOM(target, {
    use_object: true,
    render: (s) => ({
      tag: 'div', id: 'box',
      style: s.use_object
        ? { '--my-var': 'red', color: 'blue' }
        : 'background: green',
    }),
  });

  let el = dom.window.document.querySelector('#box');
  assert.equal(el.style.getPropertyValue('--my-var'), 'red', '初期 --my-var');

  s.use_object = false;
  await flush_raf();

  el = dom.window.document.querySelector('#box');
  assert.equal(el.style.getPropertyValue('--my-var'), '',
    'object → string 遷移で --* が cssText 一括上書きで消える (残留しない)');
  assert.equal(el.style.background, 'green', '新 string style が適用');
});

// =====================================================================
// SVG className (setAttribute 必須)
// =====================================================================
// 旧バグ: SVG 要素では el.className が SVGAnimatedString (object) で、
//        文字列代入は silent no-op になる仕様。class 属性が一切付かない。
// 修正後: el.namespaceURI === SVG_NAMESPACE のとき setAttribute('class', val)
//        を使う。空文字列なら removeAttribute('class') で属性自体を消す。

test('SVG: <svg> に class を指定すると DOM の class 属性が設定される', () => {
  const dom = setup_jsdom();
  const target = dom.window.document.querySelector('#app');

  create_RicDOM(target, { render: () => ({
    tag: 'svg', class: 'icon icon--small', viewBox: '0 0 100 100',
    ctx: [{ tag: 'circle', cx: 50, cy: 50, r: 40 }],
  })});

  const svg = target.querySelector('svg');
  assert.equal(svg.getAttribute('class'), 'icon icon--small',
    'SVG 要素に class 属性が setAttribute 経由で付く');
});

test('SVG: 子要素 (circle / rect) の class も attribute として付く', () => {
  const dom = setup_jsdom();
  const target = dom.window.document.querySelector('#app');

  create_RicDOM(target, { render: () => ({
    tag: 'svg', viewBox: '0 0 100 100',
    ctx: [
      { tag: 'circle', class: 'highlighted', cx: 50, cy: 50, r: 40 },
      { tag: 'rect',   class: 'frame',       x: 10, y: 10, width: 80, height: 80 },
    ],
  })});

  const circle = target.querySelector('circle');
  const rect   = target.querySelector('rect');
  assert.equal(circle.getAttribute('class'), 'highlighted', 'circle.class');
  assert.equal(rect.getAttribute('class'),   'frame',       'rect.class');
});

test('SVG: 差分更新で class が変化する', async () => {
  const dom = setup_jsdom();
  const target = dom.window.document.querySelector('#app');

  const s = create_RicDOM(target, {
    selected: false,
    render: (s) => ({
      tag: 'svg', viewBox: '0 0 100 100',
      ctx: [
        { tag: 'circle',
          class: s.selected ? 'circle highlighted' : 'circle',
          cx: 50, cy: 50, r: 40 },
      ],
    }),
  });

  let circle = target.querySelector('circle');
  assert.equal(circle.getAttribute('class'), 'circle', '初期: circle のみ');

  s.selected = true;
  await flush_raf();

  circle = target.querySelector('circle');
  assert.equal(circle.getAttribute('class'), 'circle highlighted',
    '差分更新で highlighted が追加される');
});

test('SVG: class を空にすると属性自体が消える (空 class="" にならない)', async () => {
  const dom = setup_jsdom();
  const target = dom.window.document.querySelector('#app');

  const s = create_RicDOM(target, {
    has_class: true,
    render: (s) => ({
      tag: 'svg', viewBox: '0 0 100 100',
      ctx: [{ tag: 'circle',
              class: s.has_class ? 'foo' : '',
              cx: 50, cy: 50, r: 40 }],
    }),
  });

  let circle = target.querySelector('circle');
  assert.equal(circle.getAttribute('class'), 'foo');

  s.has_class = false;
  await flush_raf();

  circle = target.querySelector('circle');
  assert.equal(circle.getAttribute('class'), null,
    'class="" ではなく属性自体が消える (removeAttribute で清掃)');
});

test('HTML: class の挙動は変わらない (regression guard)', () => {
  const dom = setup_jsdom();
  const target = dom.window.document.querySelector('#app');

  create_RicDOM(target, { render: () => ({
    tag: 'div', class: 'panel panel--active',
    ctx: ['hello'],
  })});

  const div = target.querySelector('div.panel');
  assert.ok(div, 'HTML 要素は従来通り className 経由で class が付く');
  assert.equal(div.className, 'panel panel--active');
});

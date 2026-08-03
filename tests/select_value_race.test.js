// RicDOM — <select> value/option 構築順レース修正 (v0.3.38)
//
// 報告元: 設計OS AI-FUMI v2 consumer（第2信、jsdom での最小再現つき自動テスト報告）
//
// バグ:
//   build_dom_node は 属性適用 (apply_attributes_to_element、value は DOM プロパティ
//   代入) → 子要素 append の順で処理する。<select> に value と options を同時に
//   初回描画させると、value 代入時点ではまだ <option> が 0 個のため、ブラウザは
//   自動的に先頭 option を選択してしまう。その後 value は再適用されないため、
//   意図した option ではなく先頭 option が選択されたまま確定する。
//
//   例: { tag:'select', value:'b', ctx:[option(a), option(b)] }
//       → 修正前は select.value === 'a' になってしまう（'b' を期待）。
//
// 修正:
//   build_dom_node の子 append ループの後に、tag が 'select' かつ normalized に
//   'value' キーが存在する場合のみ el.value を再適用する。build_dom_node は
//   初回 mount・patch 中の新規ノード生成の両方で使われるため、この 1 箇所で
//   両経路をカバーする。

'use strict';

const { test, describe, beforeEach } = require('node:test');
const { strict: assert } = require('node:assert');

const { setup_jsdom, flush } = require('./_helpers/jsdom_env');

describe('select value/option 構築順レース (build_dom_node)', () => {

  beforeEach(setup_jsdom);

  test('初回描画: value + options が同時出現しても指定 option が選択される（最小再現）', async () => {
    const { create_RicDOM } = require('../src/ricdom');

    create_RicDOM('#app', {
      render: () => ({
        tag: 'select', id: 'sel', value: 'b', ctx: [
          { tag: 'option', value: 'a', ctx: ['A'] },
          { tag: 'option', value: 'b', ctx: ['B'] },
        ],
      }),
    });

    await flush();
    const sel = document.getElementById('sel');
    assert.equal(sel.value, 'b', '初回描画で value=b が反映される（修正前は a になっていた）');
  });

  test('patch 中に select が新規生成される場合も正しい value になる', async () => {
    const { create_RicDOM } = require('../src/ricdom');

    const handle = create_RicDOM('#app', {
      show_select: false,
      render: (s) => s.show_select
        ? { tag: 'select', id: 'sel', value: 'c', ctx: [
            { tag: 'option', value: 'x', ctx: ['X'] },
            { tag: 'option', value: 'c', ctx: ['C'] },
          ] }
        : { tag: 'div', id: 'placeholder', ctx: ['no select yet'] },
    });

    await flush();
    assert.ok(!document.getElementById('sel'), '初回は select が存在しない');

    // 条件が切り替わり、select が新規ノードとして patch 中に build_dom_node される
    handle.show_select = true;
    await flush();

    const sel = document.getElementById('sel');
    assert.ok(sel, 'select が新規生成された');
    assert.equal(sel.value, 'c', 'patch 経路の新規ノードでも value が正しく反映される');
  });

  test('regression: 既存 select への value 差分パッチは従来どおり動く', async () => {
    const { create_RicDOM } = require('../src/ricdom');

    const handle = create_RicDOM('#app', {
      sel: 'a',
      render: (s) => ({
        tag: 'select', id: 'sel', value: s.sel, ctx: [
          { tag: 'option', value: 'a', ctx: ['A'] },
          { tag: 'option', value: 'b', ctx: ['B'] },
          { tag: 'option', value: 'c', ctx: ['C'] },
        ],
      }),
    });

    await flush();
    const sel = document.getElementById('sel');
    assert.equal(sel.value, 'a', '初期描画で a 選択');

    handle.sel = 'c';
    await flush();
    assert.equal(sel.value, 'c', '既存 select への value 差分パッチが従来どおり反映される');
  });

  test('regression: value 未指定の select は従来どおり先頭 option が選ばれる', async () => {
    const { create_RicDOM } = require('../src/ricdom');

    create_RicDOM('#app', {
      render: () => ({
        tag: 'select', id: 'sel', ctx: [
          { tag: 'option', value: 'a', ctx: ['A'] },
          { tag: 'option', value: 'b', ctx: ['B'] },
        ],
      }),
    });

    await flush();
    const sel = document.getElementById('sel');
    assert.equal(sel.value, 'a', 'value 未指定時はブラウザ既定どおり先頭 option (挙動不変)');
  });
});

// RicDOM — key 属性ベースの子要素 reconciliation (v0.3.25〜)
//
// 検証範囲:
//   1. key 一致 → 同じ DOM ノードを再利用 (input focus / value / scroll を維持)
//   2. 並べ替え (sort) で DOM ノードが正しく移動
//   3. 中央挿入 (= 既存要素と新規要素が混在) で既存 DOM の identity が保たれる
//   4. 削除 (1 件抜き) で残りの DOM が前のエンティティを引き継がない
//   5. 後方互換: key 無しの場合は従来の position-based path
//
// 報告元: TrendGuard (v0.3.24 時点でリスト並べ替え時に input / select の状態混在)

'use strict';

const { test, describe, beforeEach } = require('node:test');
const { strict: assert } = require('node:assert');

const { setup_jsdom, flush } = require('./_helpers/jsdom_env');

describe('key 属性: 論理エンティティと DOM ノードの対応付け', () => {

  beforeEach(setup_jsdom);

  test('同じ key の要素は再 render 後も同じ DOM ノード identity を保つ', async () => {
    const { create_RicDOM } = require('../src/ricdom');
    const handle = create_RicDOM('#app', {
      tick: 0,
      render: (s) => {
        void s.tick;
        return { tag: 'div', ctx: [
          { tag: 'div', key: 'A', ctx: ['A'] },
          { tag: 'div', key: 'B', ctx: ['B'] },
        ]};
      },
    });
    await flush();

    const before = Array.from(document.querySelectorAll('#app > div > div'));
    assert.equal(before.length, 2);
    const dom_A_before = before[0];
    const dom_B_before = before[1];

    handle.tick++;
    await flush();

    const after = Array.from(document.querySelectorAll('#app > div > div'));
    assert.equal(after[0], dom_A_before, 'key=A は同じ DOM ノード');
    assert.equal(after[1], dom_B_before, 'key=B は同じ DOM ノード');
  });

  test('並べ替え (sort): 要素 swap で DOM が物理的に入れ替わり、identity は維持', async () => {
    const { create_RicDOM } = require('../src/ricdom');
    const handle = create_RicDOM('#app', {
      items: [{ id: 'A', label: 'apple' }, { id: 'B', label: 'banana' }],
      render: (s) => ({ tag: 'ul', ctx: s.items.map((it) => (
        { tag: 'li', key: it.id, ctx: [it.label] }
      ))}),
    });
    await flush();

    const items_before = Array.from(document.querySelectorAll('li'));
    const dom_A = items_before[0];
    const dom_B = items_before[1];
    assert.equal(dom_A.textContent, 'apple');
    assert.equal(dom_B.textContent, 'banana');

    // 並べ替え (B が先、A が後)
    handle.items = [{ id: 'B', label: 'banana' }, { id: 'A', label: 'apple' }];
    await flush();

    const items_after = Array.from(document.querySelectorAll('li'));
    assert.equal(items_after[0], dom_B, '先頭は元の B の DOM (移動した)');
    assert.equal(items_after[1], dom_A, '末尾は元の A の DOM (移動した)');
  });

  test('中央挿入: 新しい key を中央に入れても既存 DOM は維持される', async () => {
    const { create_RicDOM } = require('../src/ricdom');
    const handle = create_RicDOM('#app', {
      items: [{ id: 'A' }, { id: 'C' }],
      render: (s) => ({ tag: 'ul', ctx: s.items.map((it) => (
        { tag: 'li', key: it.id, ctx: [it.id] }
      ))}),
    });
    await flush();
    const li_A_before = document.querySelectorAll('li')[0];
    const li_C_before = document.querySelectorAll('li')[1];

    // B を中央に挿入
    handle.items = [{ id: 'A' }, { id: 'B' }, { id: 'C' }];
    await flush();

    const items_after = document.querySelectorAll('li');
    assert.equal(items_after.length, 3);
    assert.equal(items_after[0], li_A_before, 'A は同じ DOM');
    assert.equal(items_after[1].textContent, 'B', '新規 B が中央に挿入');
    assert.equal(items_after[2], li_C_before, 'C は同じ DOM (中央挿入で破棄されない)');
  });

  test('削除 (中央 1 件抜き): 残った要素の DOM 識別子は維持される', async () => {
    const { create_RicDOM } = require('../src/ricdom');
    const handle = create_RicDOM('#app', {
      items: [{ id: 'A' }, { id: 'B' }, { id: 'C' }],
      render: (s) => ({ tag: 'ul', ctx: s.items.map((it) => (
        { tag: 'li', key: it.id, ctx: [it.id] }
      ))}),
    });
    await flush();
    const li_A_before = document.querySelectorAll('li')[0];
    const li_C_before = document.querySelectorAll('li')[2];

    // B を抜く
    handle.items = [{ id: 'A' }, { id: 'C' }];
    await flush();

    const items_after = document.querySelectorAll('li');
    assert.equal(items_after.length, 2);
    assert.equal(items_after[0], li_A_before, 'A は維持');
    assert.equal(items_after[1], li_C_before,
      'C は維持 (B 削除で C が「位置がずれて A と取り違える」ことはない)');
  });

  test('input value が key 入れ替え時に正しく追従する (TrendGuard 報告の核心)', async () => {
    const { create_RicDOM } = require('../src/ricdom');
    const handle = create_RicDOM('#app', {
      items: [{ id: 'A', val: 'apple' }, { id: 'B', val: 'banana' }],
      render: (s) => ({ tag: 'div', ctx: s.items.map((it) => (
        { tag: 'input', key: it.id, type: 'text', value: it.val }
      ))}),
    });
    await flush();

    const inputs_before = document.querySelectorAll('input');
    const input_A = inputs_before[0];
    const input_B = inputs_before[1];
    assert.equal(input_A.value, 'apple');
    assert.equal(input_B.value, 'banana');

    // user が input A に focus + 編集
    input_A.value = 'apricot';
    // 並べ替え
    handle.items = [{ id: 'B', val: 'banana' }, { id: 'A', val: 'apple' }];
    await flush();

    const inputs_after = document.querySelectorAll('input');
    // DOM identity: input_B が先頭、input_A が末尾に移動
    assert.equal(inputs_after[0], input_B, 'input B が先頭に移動 (DOM identity 維持)');
    assert.equal(inputs_after[1], input_A, 'input A が末尾に移動 (DOM identity 維持)');
    // value: state を信じて再適用される (FORCE_REAPPLY_DOM_KEYS = value)
    assert.equal(input_A.value, 'apple',
      'input A の value は state.val=apple に戻る (user 編集の apricot は破棄)');
  });

  test('key 無しの兄弟は従来通り position-based (後方互換)', async () => {
    const { create_RicDOM } = require('../src/ricdom');
    const handle = create_RicDOM('#app', {
      tick: 0,
      render: (s) => {
        void s.tick;
        return { tag: 'div', ctx: [
          { tag: 'span', ctx: ['header'] },
          { tag: 'p',    ctx: ['body'] },
          { tag: 'span', ctx: ['footer'] },
        ]};
      },
    });
    await flush();
    const span_h = document.querySelector('#app span');
    handle.tick++;
    await flush();
    // 同じ tag/位置の DOM は再利用される (= 位置ベースのインプレース更新)
    assert.equal(document.querySelector('#app span'), span_h, 'header の DOM は再利用');
  });

  test('key と無 key の混在: keyed は key で match、unkeyed は同 tag の先頭から消費', async () => {
    const { create_RicDOM } = require('../src/ricdom');
    const handle = create_RicDOM('#app', {
      mode: 'a',
      render: (s) => ({ tag: 'div', ctx: s.mode === 'a' ? [
        { tag: 'p', ctx: ['plain'] },
        { tag: 'p', key: 'X', ctx: ['keyed-X'] },
      ] : [
        { tag: 'p', key: 'X', ctx: ['keyed-X'] },
        { tag: 'p', ctx: ['plain'] },
      ]}),
    });
    await flush();
    const ps_before = document.querySelectorAll('p');
    const p_plain  = ps_before[0];
    const p_keyed  = ps_before[1];

    handle.mode = 'b';   // swap
    await flush();

    const ps_after = document.querySelectorAll('p');
    assert.equal(ps_after[0], p_keyed, 'keyed=X が先頭に移動 (DOM identity 維持)');
    assert.equal(ps_after[1], p_plain, 'unkeyed plain は末尾 (DOM identity 維持)');
  });

  test('ネスト配列 (ctx: [items.map(...)]) でも key reconciliation が効く', async () => {
    // normalize_children が配列を 1 段展開するので、`ctx: [...items.map()]` と
    // `ctx: [items.map()]` は等価のはず。だが v0.3.25 当初は key 検査を raw children
    // に対して行っていたため、後者で key が見落とされて position-based に落ちていた。
    // また初期 build 経路もネスト配列を展開しておらず DOMException で落ちていた。
    // 両方の regression をここでカバーする。
    const { create_RicDOM } = require('../src/ricdom');
    const handle = create_RicDOM('#app', {
      items: [{ id: 'A' }, { id: 'B' }],
      render: (s) => ({ tag: 'ul', ctx: [
        s.items.map((it) => ({ tag: 'li', key: it.id, ctx: [it.id] })),   // ← 非 spread
      ]}),
    });
    await flush();

    // 初期 build がネスト配列で例外を出さず 2 つの li を生成する
    const before = document.querySelectorAll('li');
    assert.equal(before.length, 2, 'ネスト配列でも初期 build が成功する');
    const li_A = before[0];
    const li_B = before[1];

    // 並べ替え → key で DOM identity が維持される
    handle.items = [{ id: 'B' }, { id: 'A' }];
    await flush();

    const after = document.querySelectorAll('li');
    assert.equal(after[0], li_B, 'B の DOM が先頭に移動 (ネスト配列でも key が効く)');
    assert.equal(after[1], li_A, 'A の DOM が末尾に移動');
  });
});

// 重複 key の回帰テスト (v0.4.5)
//
// 兄弟内で key が重複すると、旧実装では render のたびに子要素が増殖した
// (5 → 7 → 9 → 11 → 13...)。原因は patch_children_by_key() の 2 か所:
//   - prev 側: keyed map への Map.set() が重複 key を上書きし、上書きされた
//     エントリの DOM がどこからも参照されなくなって削除パスから漏れる (リーク)
//   - next 側: 最初の同 key が map のエントリを消費すると、2 個目以降は
//     get() が外れて毎回新規生成される
// 修正: 重複 key を「2 個目以降は unkeyed 扱い」に落とし、位置ベースの
// フォールバック (先頭から tag 一致で消費) で吸収する。
describe('key 属性: 兄弟内で重複した場合 (v0.4.5 回帰テスト)', () => {

  beforeEach(setup_jsdom);

  test('重複 key を含むリストを複数回 render しても子要素数が増殖しない', async () => {
    const { create_RicDOM } = require('../src/ricdom');
    const items = [{ k: 'a' }, { k: 'b' }, { k: 'b' }, { k: 'b' }, { k: 'c' }];
    const handle = create_RicDOM('#app', {
      tick: 0,
      render: (s) => ({ tag: 'ul', ctx: items.map((it, i) => (
        { tag: 'li', key: it.k, ctx: [`${it.k}#${i} r${s.tick}`] }
      ))}),
    });
    await flush();

    const counts = [document.querySelectorAll('li').length];
    for (let r = 1; r <= 4; r++) {
      handle.tick = r;
      await flush();
      counts.push(document.querySelectorAll('li').length);
    }

    assert.deepEqual(counts, [5, 5, 5, 5, 5], '重複 key があっても子要素数は 5 のまま');

    // テキストは最新の render 内容、順序は items の順のまま
    const texts = Array.from(document.querySelectorAll('li')).map((li) => li.textContent);
    assert.deepEqual(texts, ['a#0 r4', 'b#1 r4', 'b#2 r4', 'b#3 r4', 'c#4 r4']);
  });

  test('重複した key の DOM ノードは (位置ベースで) 再利用される', async () => {
    const { create_RicDOM } = require('../src/ricdom');
    const handle = create_RicDOM('#app', {
      tick: 0,
      render: (s) => {
        void s.tick;
        return { tag: 'ul', ctx: [
          { tag: 'li', key: 'b', ctx: ['b-1'] },
          { tag: 'li', key: 'b', ctx: ['b-2'] },
          { tag: 'li', key: 'b', ctx: ['b-3'] },
        ]};
      },
    });
    await flush();

    const before = Array.from(document.querySelectorAll('li'));
    assert.equal(before.length, 3);

    handle.tick++;
    await flush();

    const after = Array.from(document.querySelectorAll('li'));
    assert.equal(after.length, 3, '子要素数は増殖しない');
    // 同じ index にある DOM ノードが再利用される (identity 維持) — 新規生成されていない
    assert.equal(after[0], before[0], '1 番目の重複 key ノードが再利用される');
    assert.equal(after[1], before[1], '2 番目の重複 key ノードが再利用される');
    assert.equal(after[2], before[2], '3 番目の重複 key ノードが再利用される');
  });

  test('重複が解消された次の render で余分な DOM が消える', async () => {
    const { create_RicDOM } = require('../src/ricdom');
    const handle = create_RicDOM('#app', {
      items: [{ k: 'b' }, { k: 'b' }, { k: 'b' }],
      render: (s) => ({ tag: 'ul', ctx: s.items.map((it) => (
        { tag: 'li', key: it.k, ctx: [it.k] }
      ))}),
    });
    await flush();
    assert.equal(document.querySelectorAll('li').length, 3, '重複 key のまま 3 件生成される');

    // 重複を解消 (b が 1 件だけに)
    handle.items = [{ k: 'b' }];
    await flush();

    assert.equal(document.querySelectorAll('li').length, 1, '余分な DOM は削除される');
  });

  test('number 型の key が重複した場合も同様に増殖しない', async () => {
    const { create_RicDOM } = require('../src/ricdom');
    const items = [{ k: 1 }, { k: 2 }, { k: 2 }, { k: 3 }];
    const handle = create_RicDOM('#app', {
      tick: 0,
      render: (s) => ({ tag: 'ul', ctx: items.map((it, i) => (
        { tag: 'li', key: it.k, ctx: [`${it.k}#${i} r${s.tick}`] }
      ))}),
    });
    await flush();

    const counts = [document.querySelectorAll('li').length];
    for (let r = 1; r <= 3; r++) {
      handle.tick = r;
      await flush();
      counts.push(document.querySelectorAll('li').length);
    }

    assert.deepEqual(counts, [4, 4, 4, 4], 'number key の重複でも子要素数は 4 のまま');
  });

  // 統括レビュー (2026-09-04) で指摘された過剰修正の回帰テスト。
  //
  // 上の「重複 key」対応で next 側を「keyed だが map miss なら unkeyed 経路へ」と
  // 広く倒すと、重複ではない *新規 key* (prev に存在せず、この pass でも初出) の要素
  // まで、同 tag の unkeyed prev DOM を奪えてしまっていた。これは keyed/unkeyed が
  // 混在するリストで、unkeyed 側の入力状態 (input の値など) が無関係な新規 keyed
  // 要素に移ってしまうバグ修正範囲外の挙動変更だった。
  // next_seen_keys で「この pass で既出の key か」を区別し、新規 key は素直に
  // 新規生成する (= unkeyed プールを消費しない) ことで防ぐ。
  test('新規 key (prev に無い key) は同 tag の unkeyed prev DOM を奪わない', async () => {
    const { create_RicDOM } = require('../src/ricdom');
    const handle = create_RicDOM('#app', {
      mode: 'before',
      render: (s) => ({ tag: 'ul', ctx: s.mode === 'before' ? [
        { tag: 'li', key: 'A', ctx: [{ tag: 'input', type: 'text', value: 'a-val' }] },
        { tag: 'li', ctx: [{ tag: 'input', type: 'text', value: 'x-val' }] },   // unkeyed X
      ] : [
        { tag: 'li', key: 'B', ctx: [{ tag: 'input', type: 'text', value: 'b-val' }] },   // 新規 key (prev に無い)
        { tag: 'li', ctx: [{ tag: 'input', type: 'text', value: 'x-val' }] },   // unkeyed X (変化なし)
      ]}),
    });
    await flush();

    const lis_before = document.querySelectorAll('li');
    const li_A_before = lis_before[0];
    const li_X_before = lis_before[1];
    const input_X = li_X_before.querySelector('input');
    // user が unkeyed X の input を編集 (state とは無関係な DOM 側の drift)
    input_X.value = 'x-edited';

    // A を新規 key B に差し替え、X はそのまま
    handle.mode = 'after';
    await flush();

    const lis_after = document.querySelectorAll('li');
    assert.equal(lis_after.length, 2, '子要素数は 2 のまま');
    // unkeyed X の li は同じ DOM ノードのまま (= 新規 key B に奪われていない)
    assert.equal(lis_after[1], li_X_before,
      'unkeyed X の DOM ノードは維持される (新規 key に奪われない)');
    // keyed B は A の DOM とは別物の新規ノード (map miss かつ pass 内初出なので新規生成)
    assert.notEqual(lis_after[0], li_A_before, 'keyed B は新規生成された別 DOM ノード');
    assert.notEqual(lis_after[0], li_X_before,
      'keyed B は unkeyed X の DOM を奪っていない (別ノード)');
  });
});

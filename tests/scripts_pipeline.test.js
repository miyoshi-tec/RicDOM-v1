// RicDOM — build pipeline scripts の特性テスト (characterization test)
//
// build_icons.js / shorten_css_classes.js / compress_css_in_js.js / copy_docs.js は
// これまでテストがゼロだった (lz / build_lz_bundle / icon / svg_to_descriptor は
// テスト済み)。ここでは「現在の挙動」を固定し、将来のリファクタリングで
// 無言 drift しないようにする。
//
// shorten_css_classes / compress_css_in_js は一時ファイルに最小 JS を書いて
// スクリプトを CLI として実行し、出力を検証する。
// copy_docs / build_icons は冪等スクリプトなので実 repo に対して直接実行し、
// 実行前後で内容が変わらないこと (= 既に同期済みであること) を確認する。

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');

// 一時ディレクトリに文字列を書き、node でスクリプトを実行して stdout を返す
const run_script_on_tmp_file = (script, content, tmp_name = 'input.js') => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ric-'));
  const file = path.join(dir, tmp_name);
  fs.writeFileSync(file, content, 'utf8');
  const stdout = execFileSync('node', [path.join(ROOT, 'scripts', script), file], { encoding: 'utf8' });
  const out = fs.readFileSync(file, 'utf8');
  return { dir, file, stdout, out };
};

// =====================================================================
// shorten_css_classes.js
// =====================================================================

describe('shorten_css_classes.js', () => {
  const SRC = 'const css = `.ric-page .ric-popup__body--out{color:red}`; const cls = "ric-popup__body--out";';

  test('CSS 側とリテラル側が同じ短縮名に置換される', () => {
    const { out } = run_script_on_tmp_file('shorten_css_classes.js', SRC);
    // ric-popup__body の短縮名を CSS 側から抽出し、リテラル側にも同じ短縮名が使われていることを確認
    const m = out.match(/\.ric-page \.([a-z0-9]+)--out\{color:red\}/);
    assert.ok(m, `CSS 部分が期待した形で短縮されていない: ${out}`);
    const short = m[1];
    assert.ok(out.includes(`"${short}--out"`), `リテラル側が同じ短縮名 (${short}) に置換されていない: ${out}`);
  });

  test('ric-page (PUBLIC_BASE_PREFIXES) は不変', () => {
    const { out } = run_script_on_tmp_file('shorten_css_classes.js', SRC);
    assert.ok(out.includes('.ric-page '), 'ric-page が短縮されてしまっている');
  });

  test('同一入力 2 回で同一出力 (決定性)', () => {
    const { out: out1 } = run_script_on_tmp_file('shorten_css_classes.js', SRC);
    const { out: out2 } = run_script_on_tmp_file('shorten_css_classes.js', SRC);
    assert.equal(out1, out2);
  });
});

// =====================================================================
// compress_css_in_js.js
// =====================================================================

describe('compress_css_in_js.js', () => {
  // 改行・インデント入り template literal、${...} 式を含む
  const SRC = [
    'const make = (color) => `',
    '  .ric-foo {',
    '    color: ${color};',
    '    padding:   8px   16px ;',
    '  }',
    '`;',
  ].join('\n');

  test('${...} の中身は 1 byte も変わらない', () => {
    const { out } = run_script_on_tmp_file('compress_css_in_js.js', SRC);
    assert.ok(out.includes('${color}'), `\${color} が破壊されている: ${out}`);
  });

  test('CSS 部分の空白が畳まれる', () => {
    const { out } = run_script_on_tmp_file('compress_css_in_js.js', SRC);
    // 改行・インデントが除去され、区切り文字周りの空白も畳まれていること
    assert.ok(!/\n\s+/.test(out), `改行+インデントが残っている: ${out}`);
    assert.ok(out.includes('.ric-foo{'), `セレクタ周りの空白が畳まれていない: ${out}`);
  });
});

// =====================================================================
// copy_docs.js (冪等スクリプト、実 repo に対して実行)
// =====================================================================

// v0.4.5 以前は実 repo に対して copy_docs.js を走らせていたが、node --test はファイル単位で
// 並列プロセスを立てるため、他のテスト (v03_lz_bundle 等) が読んでいる最中の min.js を
// 上書きすることになり、Windows で copyfile が UNKNOWN (-4094) で落ちる単発 flake があった
// (18 回中 1 回)。副作用として docs/*.min.js が改行コードだけ dirty になる運用上の煩わしさも
// 同じ原因。v0.4.6 から、スクリプト本体は一時ディレクトリ (RICDOM_ROOT) に対して実行し、
// 「実 repo の docs/ が同期済みか」は読み取りだけで確認する 2 段構成にした。
describe('copy_docs.js', () => {
  test('一時 root に対して実行すると min.js / SPEC.md / TUTORIAL.md が docs/ にバイト一致で複製される', () => {
    const tmp_root = fs.mkdtempSync(path.join(os.tmpdir(), 'ric-copy-docs-'));
    fs.mkdirSync(path.join(tmp_root, 'docs'));
    // REQUIRED 2 本 + OPTIONAL 1 本 (もう 1 本は意図的に置かず、存在時のみコピーされることを見る)
    const fixtures = {
      'RicDOM.min.js': 'globalThis.__copy_docs_core = 1;',
      'RicUI.min.js': 'globalThis.__copy_docs_ui = 2;',
      'RicDOM.lz.min.js': 'globalThis.__copy_docs_lz = 3;',
      'SPEC.md': '# spec\n',
      'TUTORIAL.md': '# tutorial\n',
    };
    for (const [name, body] of Object.entries(fixtures)) fs.writeFileSync(path.join(tmp_root, name), body, 'utf8');

    execFileSync('node', [path.join(ROOT, 'scripts', 'copy_docs.js')], {
      cwd: tmp_root,
      env: { ...process.env, RICDOM_ROOT: tmp_root },
    });

    for (const [name, body] of Object.entries(fixtures)) {
      assert.equal(fs.readFileSync(path.join(tmp_root, 'docs', name), 'utf8'), body, `${name} が docs/ にバイト一致で複製されていない`);
    }
    assert.ok(!fs.existsSync(path.join(tmp_root, 'docs', 'RicUI.lz.min.js')), '存在しない OPTIONAL ファイルは docs/ に作られない');
  });

  test('必須の min.js が無ければ exit 1 (古い配信版が無言で残らない)', () => {
    const tmp_root = fs.mkdtempSync(path.join(os.tmpdir(), 'ric-copy-docs-'));
    fs.mkdirSync(path.join(tmp_root, 'docs'));
    const r = spawnSync('node', [path.join(ROOT, 'scripts', 'copy_docs.js')], {
      cwd: tmp_root,
      env: { ...process.env, RICDOM_ROOT: tmp_root },
      encoding: 'utf8',
    });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /必須ファイルが見つかりません/);
  });

  test('実 repo の docs/SPEC.md・docs/TUTORIAL.md はソースと同期済み (読み取りのみ、drift 検知)', () => {
    for (const f of ['SPEC.md', 'TUTORIAL.md']) {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
      const docs = fs.readFileSync(path.join(ROOT, 'docs', f), 'utf8');
      assert.equal(src, docs, `${f} と docs/${f} がバイト一致しない (copy_docs.js の実行漏れ)`);
    }
  });
});

// =====================================================================
// build_icons.js (冪等スクリプト、実 repo に対して実行)
// =====================================================================

describe('build_icons.js', () => {
  test('icons.json の生成規則を満たし、実行前後で内容が変わらない (冪等)', () => {
    const icons_path = path.join(ROOT, 'docs', 'icons', 'icons.json');
    const before = JSON.parse(fs.readFileSync(icons_path, 'utf8'));

    execFileSync('node', [path.join(ROOT, 'scripts', 'build_icons.js')], { cwd: ROOT });

    const after = JSON.parse(fs.readFileSync(icons_path, 'utf8'));

    assert.equal(after._meta.count, Object.keys(after.icons).length, '_meta.count と icons のキー数が一致しない');
    assert.equal(after.icons['circle-dot'].s, null, 'circle-dot.s === null が保持されていない');
    assert.equal(after.icons['x'].s, undefined, 'x.s は既定 stroke 2 のため省略されるはず');

    assert.deepEqual(after, before, 'build_icons 再実行で icons.json の内容が変わった (drift の疑い)');
  });

  // contrast アイコン (v0.4.1〜、Raccoon/Brownies/Rancha の 3 consumer がテーマ切替 UI で
  // 個別に手書きしていたのを解消。ricdom-icon CLI で Lucide から取得・path 化して追加した)
  test('contrast アイコンが存在し、descriptor が valid', () => {
    const icons_path = path.join(ROOT, 'docs', 'icons', 'icons.json');
    const data = JSON.parse(fs.readFileSync(icons_path, 'utf8'));

    assert.ok(data.icons.contrast, 'contrast が icons.json に存在しない');
    const def = data.icons.contrast;
    const ps = Array.isArray(def.p) ? def.p : [def.p];
    assert.ok(ps.length > 0, 'p が空');
    for (const d of ps) {
      assert.equal(typeof d, 'string');
      assert.notEqual(d.trim(), '');
    }
    // リング（circle）+ 右半分の扇形（半円弧を含む path）という要望の幾何を満たすこと
    assert.equal(ps.length, 2, 'circle 相当の path + 右半分の path の 2 本構成のはず');
  });
});

// =====================================================================
// update_sizes.js (冪等スクリプト、実 repo に対して実行)
//
// R9 で「0-match でも無言で成功ログ」を WARN 化した。regex がドキュメント側の
// 実際の文言にマッチしなくなった場合 (将来の README/index.html 改稿など) に、
// この特性テストが落ちて気付けるようにする。
// =====================================================================

describe('update_sizes.js', () => {
  test('実行しても WARN が出ず、README.md / docs/index.html の内容が変わらない (regex が現物に一致・現値が正)', () => {
    const readme_path = path.join(ROOT, 'README.md');
    const index_path  = path.join(ROOT, 'docs', 'index.html');
    const before_readme = fs.readFileSync(readme_path, 'utf8');
    const before_index  = fs.readFileSync(index_path, 'utf8');

    // update_sizes.js は WARN を console.warn (= stderr) に出す。execFileSync の戻り値は
    // stdout のみで stderr は含まれない (デフォルトでは親プロセスに継承されて画面には出るが
    // 呼び出し元の変数には乗らない) ため、WARN を捕捉するには spawnSync で stderr も
    // 明示的に取得する必要がある。
    const result = spawnSync('node', [path.join(ROOT, 'scripts', 'update_sizes.js')], { cwd: ROOT, encoding: 'utf8' });
    assert.equal(result.status, 0, `update_sizes.js が異常終了した:\n${result.stderr}`);

    assert.ok(!/WARN/.test(result.stderr), `update_sizes.js が WARN を出した (regex がドキュメントにマッチしていない):\n${result.stderr}`);

    const after_readme = fs.readFileSync(readme_path, 'utf8');
    const after_index  = fs.readFileSync(index_path, 'utf8');
    assert.equal(before_readme, after_readme, 'update_sizes 実行で README.md の内容が変わった (サイズ表記が stale だった疑い)');
    assert.equal(before_index, after_index, 'update_sizes 実行で docs/index.html の内容が変わった (サイズ表記が stale だった疑い)');
  });
});

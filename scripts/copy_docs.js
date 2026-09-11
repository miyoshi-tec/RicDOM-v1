#!/usr/bin/env node
// copy_docs.js
// ビルド成果物（min.js）を docs/ にコピーする（クロスプラットフォーム対応）。
// package.json の build:docs から呼ばれる。
//
// サンプルファイルは docs/samples/ が唯一のソースなのでコピー不要。

'use strict';

const fs = require('fs');
const path = require('path');

// RICDOM_ROOT: テスト専用の root 差し替え (tests/scripts_pipeline.test.js が一時ディレクトリに
// 対して実行するため)。実リポジトリに対して走らせると、並列実行中の他テストが読んでいる
// min.js を上書きして Windows で copyfile が UNKNOWN で落ちる単発 flake があった (v0.4.6)。
const root = process.env.RICDOM_ROOT ? path.resolve(process.env.RICDOM_ROOT) : path.resolve(__dirname, '..');

// min.js をコピー。
// REQUIRED = build 失敗時に欠けていたら古い配信版が無言で残ってしまうため exit 1。
// OPTIONAL = LZ 版は build_lz_bundle が失敗しても本体 build は成立しうるので存在時のみコピー。
// ※ このリストへの追加漏れはエラーにならず無言で docs/ 未反映になる。
//    配布物 (docs/ に置くべき min.js) を増やしたら必ずここに追記すること。
const REQUIRED = ['RicDOM.min.js', 'RicUI.min.js'];
const OPTIONAL = ['RicDOM.lz.min.js', 'RicUI.lz.min.js'];

for (const f of REQUIRED) {
  const src = path.join(root, f);
  if (!fs.existsSync(src)) {
    console.error(`[copy_docs] 必須ファイルが見つかりません: ${f} (build が失敗している可能性)`);
    process.exit(1);
  }
  fs.copyFileSync(src, path.join(root, 'docs', f));
}
for (const f of OPTIONAL) {
  const src = path.join(root, f);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(root, 'docs', f));
  }
}

// Markdown ドキュメントをコピー（spec.html / tutorial.html が fetch する）
for (const f of ['SPEC.md', 'TUTORIAL.md']) {
  fs.copyFileSync(path.join(root, f), path.join(root, 'docs', f));
}

console.log('[copy_docs] docs/ updated.');

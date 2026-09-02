// 各サンプル HTML に <meta name="description"> 等の SEO タグを注入する。
// 既に description が入っているファイルはスキップ (冪等)。
// 1 度実行したら、以降は新規サンプルの追加時にこのテーブルへ 1 行追加するだけ。

'use strict';

const fs   = require('fs');
const path = require('path');

const REPO_BASE = 'https://miyoshi-tec.github.io/RicDOM-v1/samples/';

// ファイル名 → { title, description } のマップ
const ENTRIES = {
  '00_hello.html':                     { title: 'Hello World — RicDOM',                       desc: 'RicDOM の Hello World サンプル。RicDOM 単体と RicUI 利用の最小コードを並べて比較。' },
  '01_forms.html':                     { title: 'フォーム — RicDOM',                          desc: 'bind_input / ui_checkbox / ui_radiobutton による双方向バインドのデモ。' },
  '02_controls.html':                  { title: 'コントロール — RicDOM',                       desc: 'ui_button と create_ui_popup の基本的な使い方デモ。' },
  '03_popup.html':                     { title: 'ポップアップ — RicDOM',                       desc: 'create_ui_popup と create_ui_tooltip のデモ。開き方向の自動判定と排他制御。' },
  '04_accordion_dialog.html':          { title: 'ダイアログ & トースト — RicDOM',              desc: 'create_ui_dialog と create_ui_toast のデモ。controlled / uncontrolled 両モード対応。' },
  '05_toast_accordion.html':           { title: 'アコーディオン — RicDOM',                     desc: 'create_ui_accordion で複数パネルの開閉。' },
  '06_splitter.html':                  { title: 'スプリッター — RicDOM',                       desc: 'create_ui_splitter と bind_tabs によるリサイズ可能なレイアウト。' },
  '07_tweak_splitter.html':            { title: 'Tweak Panel + スプリッター — RicDOM',         desc: 'create_ui_tweak_panel をスプリッターに配置したパラメータ調整 UI。' },
  '08_tweak_menu.html':                { title: 'Tweak Panel + メニュー — RicDOM',             desc: 'create_ui_tweak_panel をポップアップメニュー内に展開。' },
  '09_json_editor.html':               { title: 'JSON エディタ — RicDOM',                       desc: 'スプリッター + ダイアログ + トースト + collapse_box で JSON 編集ツール。' },
  '10_theme_studio.html':              { title: 'Theme Studio — RicDOM',                       desc: 'CSS 変数エディタ + UI プレビュー + JSON での保存 / 読み込み。' },
  '11_theme_override.html':            { title: 'テーマ上書き — RicDOM',                       desc: 'create_ui_panel のテーマ / 密度 / disabled を組み合わせて比較。' },
  '12_md_viewer.html':                 { title: 'Markdown ビューア — RicDOM',                   desc: 'ui_md_pre で Markdown を VDOM に変換、コードハイライト対応。' },
  '13_controlled_dialog_splitter.html':{ title: 'Controlled Mode — RicDOM',                    desc: 'state 駆動の dialog / splitter + SVG グラフ + コード表示。' },
  '14_collapse_box.html':              { title: 'Collapse Box — RicDOM',                       desc: 'collapse_box の入退場アニメーション、6 パターン。配列状態とフラグの扱い canon。' },
  '15_ai_chat.html':                   { title: 'AI チャット + 接続設定 — RicDOM',              desc: '各種 LLM を OpenAI 互換として切替・接続確認し、そのまま会話できる設定ダイアログ + チャット。create_ui_dialog / ui_tabs のリファレンス。' },
  '16_svg_editor.html':                { title: 'SVG ツリーエディタ — RicDOM',                  desc: 'SVG ノードの選択・編集・追加、ドラッグで直感的に配置。' },
  '17_multi_ricdom.html':              { title: 'Multi-instance Memo — RicDOM',                desc: '複数の create_RicDOM インスタンスをパネル単位に配置して再描画スコープを分離。' },
  '18_key_reconciliation.html':        { title: 'Key Reconciliation — RicDOM',                 desc: 'key 属性でリスト並べ替え時に input focus / value が混ざらない、FLIP アニメで可視化。' },
};

// 静的 SEO fallback を生成する。
// <div id="nav_bar" data-sample="XX"> の中に挿入され、_nav_bar.js (RicDOM) が
// 最初の render で innerHTML='' により上書きするので、JS ユーザーには見えない。
// Googlebot の初回 HTML fetch / JS 無効環境では、ページの内容が「最低限の意味」として読める。
const build_fallback = (file, title, desc) => {
  const repo_url = `https://github.com/miyoshi-tec/RicDOM-v1/blob/main/docs/samples/${file}`;
  return `
    <!-- ▼ 静的 SEO fallback (RicDOM の最初の render で innerHTML='' により消える) ▼ -->
    <header>
      <h1>${title}</h1>
      <p>${desc}</p>
    </header>
    <p><small>これは <strong>RicDOM</strong> 公式のサンプルページです。
    JavaScript を有効にすると、ナビゲーションバーと実動するデモが表示されます。</small></p>
    <nav>
      <a href="../index.html">← RicDOM トップ</a> ·
      <a href="${repo_url}">GitHub でソースを見る</a> ·
      <a href="https://github.com/miyoshi-tec/RicDOM-v1">リポジトリ</a>
    </nav>
    <!-- ▲ 静的 SEO fallback はここまで ▲ -->`;
};

const samples_dir = path.join(__dirname, '..', 'docs', 'samples');

let head_updated = 0, head_skipped = 0;
let body_updated = 0, body_skipped = 0, body_no_navbar = 0;

for (const [file, { title, desc }] of Object.entries(ENTRIES)) {
  const fp = path.join(samples_dir, file);
  if (!fs.existsSync(fp)) {
    console.warn(`!! ${file} not found, skip`);
    continue;
  }
  let content = fs.readFileSync(fp, 'utf8');

  // ── head: meta description / OG / Twitter / canonical ──
  if (content.includes('meta name="description"')) {
    head_skipped++;
  } else {
    const url = REPO_BASE + file;
    const seo_block =
`  <meta name="description" content="${desc}">
  <meta name="author" content="miyoshi-tec">
  <meta name="robots" content="index, follow">
  <link rel="canonical" href="${url}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${url}">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${desc}">
  <meta property="og:site_name" content="RicDOM">
  <meta property="og:locale" content="ja_JP">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${desc}">`;

    const new_content = content.replace(
      /(<meta name="viewport"[^>]*>)/,
      `$1\n${seo_block}`,
    );
    if (new_content === content) {
      console.warn(`!! ${file}: viewport meta not found, skip head`);
    } else {
      content = new_content;
      head_updated++;
    }
  }

  // ── body: <div id="nav_bar" ...> の中に静的 fallback を入れる ──
  // 既に "▼ 静的 SEO fallback" マーカーがあれば skip (冪等)
  if (content.includes('▼ 静的 SEO fallback')) {
    body_skipped++;
  } else {
    // 空の <div id="nav_bar" ...></div> を fallback 入り版に置換
    const new_content = content.replace(
      /(<div id="nav_bar"[^>]*)><\/div>/,
      (_match, open) => `${open}>${build_fallback(file, title, desc)}\n  </div>`,
    );
    if (new_content === content) {
      console.warn(`!! ${file}: empty <div id="nav_bar"></div> not found, skip body`);
      body_no_navbar++;
    } else {
      content = new_content;
      body_updated++;
    }
  }

  fs.writeFileSync(fp, content);
}

console.log(`[seo head] updated ${head_updated}, skipped (already had description) ${head_skipped}`);
console.log(`[seo body] updated ${body_updated}, skipped (already had fallback) ${body_skipped}, no nav_bar ${body_no_navbar}`);

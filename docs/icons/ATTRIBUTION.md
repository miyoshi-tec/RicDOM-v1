# RicDOM アイコン — 出典とライセンス

## このセットについて

`docs/icons/icons.json` に含まれるアイコンの大半は、**RicDOM のオリジナル**として
手書きした単純な幾何アイコンです (24×24、stroke-width 2、round cap、Lucide 互換の
スタイル)。RicDOM 本体と同じライセンスで利用できます。

例外は下記「Lucide」節に明記した個別アイコンで、Lucide 由来です (`ricdom-icon` CLI
で取得・path 化して `icons/src.json` に追記したもの。手書きではありません)。

ソースは `icons/src.json`。`npm run build:icons` (= `node scripts/build_icons.js`)
で検証して `docs/icons/icons.json` を再生成します。

## 使い方

`ui_icon` (RicUI) に descriptor を渡します:

```javascript
// アイコンピッカー、または icons.json から「使う分だけ」コピーする
const ICONS = {
  check: { p: 'M20 6 9 17l-5-5' },
  x:     { p: 'M18 6 6 18M6 6l12 12' },
};

ui_icon(ICONS.check, { size: 20, label: '完了' });
```

descriptor 形式: `{ v?, s?, p }`
- `v` = viewBox (省略時 `0 0 24 24`)
- `s` = stroke-width (省略時 2、`null` で塗りつぶしモード)
- `p` = path の `d` 文字列、または複数 path の配列

## Lucide

同梱アイコンのうち `contrast` (v0.4.1〜、テーマ切替 UI 用) は
[Lucide](https://lucide.dev/) から `node scripts/icon.js contrast --json`
(`ricdom-icon` CLI) で取得・path 化したものです。

Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2022
as part of Feather (MIT). All other copyright (c) for Lucide are held
by Lucide Contributors 2022. Licensed under the ISC License.
https://github.com/lucide-icons/lucide/blob/main/LICENSE

## 別のアイコンセット (Lucide 等) を追加する場合

[Lucide](https://lucide.dev/) (ISC)、[Tabler](https://tabler.io/icons) (MIT)、
[Feather](https://feathericons.com/) (MIT) などの permissive ライセンスの
アイコンを取り込むこともできます。その場合:

1. 各セットの**ライセンス表記をこのファイルに残す**こと (ISC / MIT とも著作権表示の
   保持が条件)。例:

   ```
   ## Lucide
   Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2022
   as part of Feather (MIT). All other copyright (c) for Lucide are held
   by Lucide Contributors 2022. Licensed under the ISC License.
   https://github.com/lucide-icons/lucide/blob/main/LICENSE
   ```

2. descriptor 形式 (`{ v, s, p }`) に変換して `icons/src.json` に追記するか、
   `scripts/build_icons.js` を拡張して SVG を直接読み込む。

   ※ Lucide のアイコンは `<rect>` / `<circle>` / `<line>` 等を含むものがある。
     descriptor は path ベースなので、それらは path に変換する (line/polyline は
     `M..L..` で厳密変換可能、rect/circle は arc 付き path に変換)。

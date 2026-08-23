# RicDOM

Electron・社内ツール・IoT デバイス UI 向け。JSON で書く 10KB の軽量 DOM ライブラリ。

| レイヤー | サイズ | 役割 |
|---------|------:|------|
| **RicDOM** | 10KB | コア — JSON → DOM 差分更新 + Proxy リアクティビティ |
| **RicUI** | 70KB | 部品集 — CSS 変数テーマ + ボタン・ポップアップ・スプリッター + 調整パネル |

Virtual DOM を持たず、JSON オブジェクトの差分から実 DOM を直接パッチします。
Electron やブラウザで、リアルタイムなダッシュボード・パラメータ調整 UI・データ可視化ツールを素早く構築できます。

### React / Vue と何が違うか

- **ビルド不要** — `<script>` タグ 1 つで動く。webpack / Vite / JSX 不要
- **学習コスト最小** — `create_RicDOM(target, { render(s){...} })` の 2 引数だけ
- **IME / フォーカスを壊さない** — Virtual DOM の再構築がないため、input 入力中に日本語変換が途切れない
- **対象** — Electron アプリ、社内ツール、プロトタイプ、パラメータ調整 UI。大規模 SPA には向かない

## 特徴

- **JSON 記述** — `{ tag: 'div', ctx: [...] }` の plain object で UI を定義
- **Virtual DOM なし** — JSON 差分 → 実 DOM を直接パッチ（input フォーカスや IME を壊さない）
- **Proxy 自動追跡** — state への代入で自動再描画（トップレベル＋一段目まで）
- **極小バンドル** — RicDOM コア 10KB / RicUI 70KB（minified、個別読み込み）
- **学習コスト最小** — `create_RicDOM(target, { render(s){...} })` の 2 引数だけ覚えればよい
- **アイコン** — 同梱 36 個 + Lucide を[アイコンピッカー](docs/icon_playground.html)または
  `npx ricdom-icon` で取得（path の手書きは非推奨）

## 設計思想 — 心・技・体

### 1. 指標より体験

RicDOM は「React より 3ms 速い」「bundle size 最小」を競いません。それは Goodhart の法則の罠に陥りやすく、数字を追い求めた結果、肝心の価値 — 書き味・軽やかさ・できることの広がり — を失うと考えているからです。

そのため価値軸を**心・技・体**で捉えます：

- **心（感動）** — `s.count = 5` で動く直感性、JSON が UI になる美しさ
- **技（できる）** — 実 DOM を直接操作、テーマ × 密度、Electron / ブラウザ両対応
- **体（快適・軽やか）** — IME を壊さない、ビルド不要、学習コスト低

ちなみにコア 10KB という数字も目的ではなく、「ビルド不要で `<script>` タグ 1 つで動く」を成立させるための**結果**です。機能追加のために 12KB になる方が価値があるなら、そうします。

### 2. やらないこと（反 road map）

以下は、ユーザーから要望が来ても原則 RicDOM には入れません：

- **Virtual DOM** — 「IME を壊さない」の根本が失われる
- **SSR / SEO 最適化** — 苦手領域を無理に取りに行くと設計が歪む
- **競合との機能比較ベンチマーク** — 数字競争の土俵に乗らない
- **破壊的な大規模 API 刷新** — v0.3.x の書き方が v1 でも動くことを守る

### 3. 新機能の判断基準

PR / 要望を評価するとき、こう問います：

> この機能を入れて、**心・技・体のどれかが育つか？**

育たない機能（数字は良くなるが体験は変わらない）は、入れません。
既存のテストを通すためだけの機能、競合との差別化のためだけの機能は、断ります。

## 対応環境

- **推奨**: Chrome / Edge 135+、Electron 35+
- **動作確認済み**: Firefox 128+、Safari 17.4+（`ui_select` のカスタム表示は Chrome 系のみ。他ブラウザではネイティブ `<select>` にフォールバック）
- **非対応**: IE（`Proxy` 必須のため）

## クイックスタート

### インストール

npm パッケージとしては公開していません。
このリポジトリの `docs/` にあるビルド済みファイル（`RicDOM.min.js` / `RicUI.min.js`）を
プロジェクトにコピーして `<script>` タグで読み込んでください。
まずは `RicDOM.min.js` だけで試し、必要になったら RicUI を追加するのがおすすめです。

```html
<script src="RicDOM.min.js"></script>
<script src="RicUI.min.js"></script>  <!-- コンポーネント集 + 調整パネル（任意） -->
```

| バンドル | サイズ | 内容 |
|---------|------:|------|
| `RicDOM.min.js`    | 10KB | コア（必須） |
| `RicDOM.lz.min.js` |  7KB | 同上の LZSS 自己展開版 (v0.3.18〜、下記参照) |
| `RicUI.min.js`     | 70KB | UI コンポーネント集 + パラメータ調整パネル |
| `RicUI.lz.min.js`  | 40KB | 同上の LZSS 自己展開版 (v0.3.18〜、下記参照) |

#### LZ 圧縮版 (`*.lz.min.js`) の使い分け

通常版と機能・API は **完全に同一**。違いはファイルサイズと読み込み時の挙動だけ:

- **`*.min.js` (通常版)**: そのまま `window.RicDOM` / `window.RicUI` を expose する
  従来の bundle。HTTP 配信なら gzip/brotli が走るので transfer 量はこちらでも小さい。
  debug 性 (DevTools の Source タブで読める) はこちらが上。
- **`*.lz.min.js` (LZ 版)**: 起動時に内部の base64-encoded LZSS を `atob` で展開し、
  `(0,eval)(...)` で実行する自己展開版。**HTTP 圧縮が走らない配信** (IoT、組込み、
  オフライン Electron 配布、CDN なしの社内サーバー等) で **disk / 転送量を 27-43%
  削減** できる。debug 時は通常版に切り替えるのが楽。

> ⚠️ **CSP 環境の注意 (v0.3.38〜 明記)**: LZ 版は自己展開に `eval` を使うため、
> Content-Security-Policy を敷いている環境では `script-src` に `'unsafe-eval'` が
> 必要。厳格な CSP (`'unsafe-eval'` 禁止) を敷いている場合は **素の `*.min.js`
> を使うこと**（`eval` 不使用、機能・API は LZ 版と完全に同一）。

```html
<!-- 通常: HTTP 圧縮が効く環境 -->
<script src="RicDOM.min.js"></script>
<script src="RicUI.min.js"></script>

<!-- LZ: 無圧縮で配信される環境 -->
<script src="RicDOM.lz.min.js"></script>
<script src="RicUI.lz.min.js"></script>
```

両ファイルは **self-contained** で互いに依存しない (decompressor が各自に含まれる
~160B)。通常版と LZ 版を混ぜることも可能。

#### 自分のアプリも LZ 圧縮する (v0.3.20〜)

RicDOM の LZ 圧縮ツールは外部 consumer 向けにも公開されている。自分の `app.js` を
同じ流儀 (LZSS + base64 + 自己展開 IIFE) で圧縮できる:

**CLI (`ricdom-lz`)** — Unix-style stdin/stdout 対応:

> 注: npm 未公開のため、`npx` はリポジトリ内または
> `npm i -D github:miyoshi-tec/RicDOM` でインストールした環境で動きます。
> vendoring している場合は `node scripts/build_lz_bundle.js` / `node scripts/icon.js`
> を直接実行してください。

```bash
# stdin → stdout (pipe)
$ cat src/app.min.js | npx ricdom-lz > dist/app.lz.min.js

# file → stdout
$ npx ricdom-lz src/app.min.js > dist/app.lz.min.js

# file → file
$ npx ricdom-lz src/app.min.js dist/app.lz.min.js
```

ログ (圧縮率・marker 情報) は stderr に出るので、stdout pipe を汚染しない。

**Node module API** — build script から呼ぶ:

```javascript
const { lz_compress } = require('ricdom/scripts/lz');

const minified = fs.readFileSync('src/app.min.js', 'utf8');
const wrapper  = lz_compress(minified);       // → 自己展開 wrapper string
fs.writeFileSync('dist/app.lz.min.js', wrapper);
```

詳細情報が必要なら `build_lz_bundle(source)` を使う (`{ wrapper, marker_code,
substitution, compressed_length }` を返す)。

期待出力は通常の `*.lz.min.js` と同じ形 (自己展開 IIFE)。`window.X = ...` 等の
global 副作用は decompress 後の `eval` で発火する。consumer の bundle 内に top-level
`let X` がない限り (= 通常の esbuild minify 出力は IIFE 包まれている)、他の
`.lz.min.js` と並列に load して問題ない。

**ブラウザで試す** — `docs/lz_playground.html` をブラウザで開くと、貼り付け / ファイル
読み込みで圧縮率を即座に確認できる。LZ vs gzip の比較と「この経路で LZ にする価値が
あるか」の推奨も表示するので、インストール不要で適用判断が可能。
公開ページ: <https://miyoshi-tec.github.io/RicDOM/lz_playground.html>

## アイコン CLI (`ricdom-icon`)

`ui_icon` の descriptor を**名前 → stdout** で引く CLI。アイコンピッカー
(`docs/icon_playground.html`) のヘッドレス版で、GUI を開けない CLI / CI / AI
エージェント向け。同梱 36 個はオフライン即返し、Lucide は取得して `svg_to_descriptor`
で path 化する(circle/rect も自動変換 → 手書きで壊す事故を防ぐ)。

> 注: npm 未公開のため、`npx` はリポジトリ内または
> `npm i -D github:miyoshi-tec/RicDOM` でインストールした環境で動きます。
> vendoring している場合は `node scripts/icon.js` を直接実行してください。

```bash
# 貼れる const ICONS = {...} (Lucide 由来は ISC 帰属コメント込み) を stdout に
$ npx ricdom-icon settings refresh-cw chat >> src/icons.js

# 素の descriptor だけ ({ name: {...} }) — 自前マージ用
$ npx ricdom-icon settings --json

# 名前が分からない時の候補出し / 同梱一覧
$ npx ricdom-icon --search gear
$ npx ricdom-icon --names
```

ログ/警告は stderr、descriptor は stdout(pipe を汚さない)。同梱を読むだけなら
`docs/icons/icons.json` を直接読んでもよい。変換器単体は
`require('ricdom/docs/icons/svg_to_descriptor')`(UMD)。

> ⚠️ **AI エージェントへ**: アイコンの path を**記憶から手書きしないでください**。
> 見た目はそれっぽくても sub-path 欠落等で静かに壊れます。必ず `npx ricdom-icon` か
> `svg_to_descriptor` を通すこと。手書きが避けられない状況なら、先にユーザー(人間)の
> 許可を取ってください。

### Hello World（RicDOM のみ）

```html
<div id="app"></div>
<script>
const { create_RicDOM } = RicDOM;

create_RicDOM('#app', {
  name: '',
  render(s) {
    return {
      tag: 'div',
      ctx: [
        { tag: 'h3', ctx: ['はじめまして'] },
        { tag: 'input',
          type: 'text', placeholder: '名前…',
          value: s.name,
          oninput: (e) => { s.name = e.target.value; },
        },
        s.name
          ? { tag: 'p', ctx: [`こんにちは、${s.name}さん！`] }
          : { tag: 'p', style: { color: '#aaa' }, ctx: ['（名前を入力してください）'] },
      ],
    };
  },
});
</script>
```

### Hello World（RicUI 使用）

RicUI では `create_RicDOM('#app', state)` でハンドルを作り、`s.render` を後から設定します。
popup や dialog のファクトリを render の外で初期化できるため、コードの見通しが良くなります。

> ⚠️ **RicUI 部品は必ず `create_ui_page` の中で描いてください。** 配下にないと CSS が
> 注入されず「無装飾(ブラウザ既定の部品)」になります(エラーは出ません)。モーダル/
> ポータル/別マウントも `create_ui_page` で包む(またはモーダルは `create_ui_dialog` を
> 使う)。無装飾は見た目だけ壊れて DOM テストは通るので、**E2E でスクショ確認**を推奨。
> 詳細は SPEC.md「スタイルスコープ」節。

```javascript
const { create_RicDOM } = RicDOM;
const { create_ui_page, ui_panel, ui_text, bind_input } = RicUI;

const s = create_RicDOM('#app', { name: '' });

// UI
s.page = create_ui_page({ theme: 'light' });

// render
s.render = (s) => s.page({
  ctx: [
    ui_panel({ ctx: [
      ui_text({ variant: 'title', ctx: ['はじめまして'] }),
      bind_input(s, 'name', { placeholder: '名前…' }),
      s.name
        ? ui_text({ ctx: [`こんにちは、${s.name}さん！`] })
        : ui_text({ variant: 'muted', ctx: ['（名前を入力してください）'] }),
    ]}),
  ],
});
```

### Hello World（RicUI コンパクト記法）

state・ファクトリ・render を1つのオブジェクトにまとめると、より簡潔に書けます。
サンプルコードはすべてこの記法で書かれています。

```javascript
const { create_RicDOM } = RicDOM;
const { create_ui_page, ui_panel, ui_text, bind_input } = RicUI;

create_RicDOM('#app', {
  name: '',

  // UI
  page: create_ui_page({ theme: 'light' }),

  // render
  render: (s) => s.page({ ctx: [
    ui_panel({ ctx: [
      ui_text({ variant: 'title', ctx: ['はじめまして'] }),
      bind_input(s, 'name', { placeholder: '名前…' }),
      s.name
        ? ui_text({ ctx: [`こんにちは、${s.name}さん！`] })
        : ui_text({ variant: 'muted', ctx: ['（名前を入力してください）'] }),
    ]}),
  ]}),
});
```


## 基本コンセプト

### 基本パターン

```javascript
create_RicDOM(
  '#app',                    // ① マウント先（CSS セレクタ or HTMLElement）
  {                          // ② state + render を1つのオブジェクトで渡す
    count: 0,
    render(s) {
      return {
        tag: 'button',
        ctx: [`Count: ${s.count}`],
        onclick: () => { s.count++; },
      };
    },
  }
);
```

`render` は後から設定することもできます:

```javascript
const handle = create_RicDOM('#app', { count: 0 });
handle.render = (s) => ({
  tag: 'button',
  ctx: [`Count: ${s.count}`],
  onclick: () => { s.count++; },
});
```

- **state** に代入すると自動で再描画（`s.count++` → UI 更新）
- **描画関数** は毎回 JSON ツリーを返す。RicDOM が前回との差分を検出し、変更箇所だけ DOM を更新する
- **handle** から `refs`（DOM 参照の Map）にアクセス可能

### JSON ツリー構造

```javascript
{
  tag: 'div',                           // HTML タグ名
  class: 'my-class',                    // class 属性
  style: { color: 'red', gap: '8px' },  // インラインスタイル
  ctx: [ ... ],                         // 子要素（配列 or 単体）
  onclick: () => { ... },               // イベントハンドラ
  ref: 'myRef',                         // DOM 参照名（handle.refs で取得）
}
```

> **`ctx` を省略すると、その要素の子は diff の対象外になり保持されます。**
> `canvas` / `video` / サードパーティ製ウィジェット（チャートライブラリ等）が
> imperative に DOM を書き換える「島」を RicDOM の diff から守るのに使えます
> （`ref` で DOM 参照を取り、外部ライブラリに渡す）。詳細は SPEC.md「5. Performance
> & Scale」内「一般化: diff 対象外の島 (canvas / サードパーティ DOM) との共存」を参照。

### state 更新のルール

```javascript
// ✅ トップレベル代入 → 再描画される
s.count = 10;
s.tasks = [...s.tasks, newTask];

// ✅ 一段目のプロパティ代入 → 再描画される
s.page.theme = 'dark';
s.dark.density = 'compact';

// ❌ 二段目以降のネスト変更 → 再描画されない
s.user.address.city = 'Tokyo';

// 🔒 s.ignore 以下は再描画をトリガーしない（内部キャッシュ用）
s.ignore.cache = someData;
```

> ⚠️ **よく踏むハマりどころ — フォーム draft の更新**
>
> 編集中の入力値を `s.draft = { ... }` のような **オブジェクト** で持つと、
> ネスト代入は再描画されません。**スプレッドで丸ごと差し替える**のが正解です:
>
> ```javascript
> // ❌ 再描画されない（draft は s の二段目以降）
> s.draft.title = 'new title';
>
> // ✅ トップレベルを差し替える
> s.draft = { ...s.draft, title: 'new title' };
>
> // ✅ もしくはトップレベルにフラットに持つ
> s.draft_title = 'new title';
> ```
>
> Proxy 監視は「トップレベル + その一段目」の合計 2 階層まで。深くなるほど
> 「丸ごと差し替え」のパターンが効率も読みやすさも勝ります。

## RicUI コンポーネント

RicUI は RicDOM の上に構築された CSS 変数ベースのコンポーネント集です。

### テーマ

5 種類の組み込みテーマ。

| テーマ | 説明 |
|--------|------|
| `light` | 明るい背景、青アクセント（デフォルト） |
| `dark` | 暗い背景、明るい青アクセント |
| `teal` | 明るい背景、ティール/緑アクセント |
| `cyber` | グラスモーフィズム、ネオンシアン |
| `aqua` | グラスモーフィズム、水滴/ブルー |

密度（`comfortable` / `compact` / `tight`）とフォントサイズ（`sm` / `md` / `lg`）も切替可能。

### create_ui_page — テーマの入口

`create_ui_page()` で page ファクトリを作り、`s` のトップレベルに格納する。
テーマ・密度・フォントサイズをプロパティとして持ち、代入で動的に変更できる。

```javascript
s.page = create_ui_page({ theme: 'teal', density: 'comfortable' });

// 設定変更 → 自動再描画
s.page.theme    = 'dark';
s.page.density  = 'compact';
s.page.font_size = 'lg';

// 描画
return s.page({ ctx: [...] });
```

### create_ui_panel — セクションの区切り

背景・ボーダー付きのコンテナ。page とは別のテーマを指定できる。
`disabled` で操作を無効化（`inert` 属性で Tab フォーカスも遮断）。

```javascript
s.dark = create_ui_panel({ theme: 'dark', density: 'compact' });

// 設定変更 → 自動再描画
s.dark.disabled = true;

// 描画
return s.dark({ ctx: [...] })
```

### Layout と Surface の使い分け

```
create_ui_page ─ テーマの入口。CSS 変数を注入する
│
├─ ui_col ─── 縦に並べる（透明、padding なし）
├─ ui_row ─── 横に並べる（透明、padding なし）
├─ ui_grid ── CSS grid で並べる（透明、padding なし）
│
└─ create_ui_panel ─ 背景 + ボーダー。テーマ上書き・disabled 対応
```

| 関数 | 背景 | ボーダー | padding | 用途 |
|------|:----:|:-------:|:-------:|------|
| `create_ui_page` | 有 | — | 標準 | テーマの入口（最外層に1つ） |
| `ui_col` | — | — | — | 縦に並べる（純レイアウト） |
| `ui_row` | — | — | — | 横に並べる（純レイアウト） |
| `ui_grid` | — | — | — | CSS grid で並べる（`columns: 3` / `'120px 1fr'` / `'auto-fit 200px'`） |
| `create_ui_panel` | 有 | 有 | 標準 | セクションの区切り |

> **`create_ui_page` で包めない/包みたくない mount** (別 iframe、既存アプリへの部分導入、
> 単発のウィジェット埋め込み等) で `ric-*` クラスの要素が無装飾（ブラウザ既定の見た目）に
> なったら `css_for()` を使う。素の `ric-page` div + `make_css_vars` + `css_for` の
> 3 点セットで page なしの styled mount が作れる（v0.3.34〜、詳細は
> [SPEC.md「css_for / make_css_vars」](SPEC.md#css_for--make_css_vars-v0334) /
> [TUTORIAL.md「page で包めないとき」](TUTORIAL.md#page-で包めないとき--css_for-で埋め込み-v0334) 参照）。
> ただし portal 系 (popup / tooltip / dialog / toast) は css_for 島では使えない。

### コンポーネント一覧

すべての `ui_xxx` コンポーネントは、表に記載の引数に加えて任意の DOM 属性
（`onclick` / `id` / `data-*` / `aria-*` / `style` / `class`）を**外側要素に透過**します。
`class` は基底クラスの後ろに自動連結されます（例: `ui_button({ class: 'my' }).class` → `"ric-button my"`）。
詳細は [SPEC.md の rest スプレッド契約](SPEC.md#任意属性の透過rest-スプレッド契約) を参照。

```javascript
ui_button({ ctx: ['Save'], onclick: save, id: 'save-btn', 'data-role': 'primary' }),
ui_panel({ id: 'main', onmouseenter: hover, ctx: [...] }),
```

#### Control

| 関数 | 説明 |
|------|------|
| `ui_button({ ctx, variant, size, onclick })` | ボタン（variant: `default` / `primary` / `ghost` / `link`、size: `sm` / `md` / `lg` 任意） |
| `ui_input({ value, oninput, placeholder })` | テキスト入力 |
| `bind_input(s, key, options)` | state と双方向バインドされた input |
| `ui_textarea({ value, oninput, auto_resize })` | 複数行入力。`auto_resize: { min_rows, max_rows }` で高さ自動調整 |
| `bind_textarea(s, key, options)` | state と双方向バインドされた textarea |
| `ui_checkbox({ checked, onchange })` | チェックボックス |
| `bind_checkbox(s, key, options)` | state と双方向バインドされた checkbox |
| `ui_radiobutton({ name, value, options })` | ラジオボタングループ |
| `bind_radiobutton(s, key, options)` | state と双方向バインドされた radiobutton |
| `ui_select({ value, options, onchange })` | セレクトボックス |
| `bind_select(s, key, options)` | state と双方向バインドされた select |
| `ui_range({ value, min, max, step })` | スライダー（値表示付き） |
| `bind_range(s, key, options)` | state と双方向バインドされた range |
| `ui_color({ value, oninput })` | カラーピッカー（hex/rgba 自動判定） |
| `bind_color(s, key, options)` | state と双方向バインドされた color |
| `ui_separator()` | 水平区切り線 |
| `focus_when(el, cond)` | `cond` の立ち上がりエッジで `el.focus()`。`render(s)` の `s` には `refs` が無いため、`el` は `handle.refs.get('name')` を closure で渡す（TUTORIAL FAQ 参照） |

#### Text

| 関数 | 説明 |
|------|------|
| `ui_text({ ctx, variant })` | テキスト |
| `ui_code_pre({ ctx, obj, lang })` | コードブロック |
| `ui_md_pre({ ctx })` | Markdown → VDOM 変換（見出し / 太字 / 斜体 / インライン code / コードブロック / リスト / 引用 / リンク / テーブル / `---`。対応範囲・非対応・サニタイズは [SPEC.md#ui_md_pre](SPEC.md#ui_md_pre) 参照） |

`ui_text` の variant：

| variant | 説明 | HTMLタグ |
|---------|------|---------|
| `default` | 本文テキスト | `<span>` |
| `muted` | 薄いテキスト | `<span>` |
| `title` | 見出し（太字・大） | `<h2>` |
| `label` | ラベル（小・セミボールド） | `<label>` |

#### Popup（ファクトリ関数）

`s` のトップレベルに格納する。内部状態（開閉・位置等）は自動管理される。

```javascript
s.dd  = create_ui_popup();
s.dlg = create_ui_dialog();
s.tip = create_ui_tooltip();

// ラベル付き（旧 dropdown）
s.dd({ label: '選択肢', ctx: [...] })

// アイコン（旧 menu）— label も icon も省略すると ≡
s.menu({ icon: '⚙', ctx: [...] })

// ghost: ホバーまで枠を隠す
s.cfg({ icon: '⋯', ghost: true, ctx: [...] })

// ダイアログ（trigger_variant / title / actions でカスタマイズ）
s.dlg({ trigger_ctx: ['開く'], title: '確認', ctx: [...],
        actions: [ui_button({ ctx: ['OK'], onclick: () => s.dlg.close() })] })

// ダイアログ（controlled — 外部 state で開閉を管理）
s.dlg({ open: s.page.show_dlg, on_close: () => { s.page.show_dlg = false; },
        title: '確認', ctx: [...] })
// → 戻り値 null（トリガーボタンなし）。ESC キーでも on_close が発火する。

// トースト通知（render 内で s.toast() を呼び、任意のタイミングで show）
s.toast = create_ui_toast();
s.toast.show('保存しました', { type: 'success', duration: 3000 });
```

| 関数 | 説明 | 公開メソッド |
|------|------|------|
| `create_ui_popup()` | 汎用ポップアップ（label / icon / ghost） | `inst.close()` |
| `create_ui_tooltip()` | ツールチップ | — |
| `create_ui_dialog()` | モーダルダイアログ | `inst.close()` / `inst.open()` |
| `create_ui_toast()` | トースト通知 | `inst.show(msg, opts)` |

全て引数なし。popup の排他制御（1つ開くと他を閉じる）は自動管理。
呼び出し時に `theme` / `density` / `font_size` を渡すとポータル要素のテーマを個別に上書きできる。

#### Composite

| 関数 | 説明 | 公開メソッド |
|------|------|------|
| `create_ui_accordion(options)` | アコーディオン（折りたたみ） | — |
| `ui_tabs({ items, active, onchange })` | タブナビゲーション | — |
| `bind_tabs(s, key, options)` | state とバインドされた tabs | — |
| `ui_inline_menu({ open, anchor, ctx })` | 親要素 (`position:relative`) の四隅に絶対配置する軽量ポップオーバー。`watch_outside_click` と組で「外クリックで閉じる」を構成する | — |
| `create_ui_splitter(options)` | ドラッグ可能なペイン分割 | `toggle()` / `collapsed()` / `get_size()` / `set_size(px)` |
| `create_ui_scroll_pane(options)` | 追従型スクロール領域（チャット UI 等） | `scroll_to_bottom()` / `scroll_to_top()` |
| `create_ui_collapse_box(options)` | 子要素をアニメーションで現す/消す container (v0.3.9〜)。`visible: bool` で controlled。w/h を JS で 0↔natural、CSS transition で補間 | — |

#### Helpers

| 関数 | 説明 |
|------|------|
| `watch_outside_click(callback)` | `document` クリックで `callback` を呼ぶ。戻り値は unsubscribe 関数 |

### 3 種類のコンポーネントパターン

| パターン | 内部状態 | 用途 |
|---------|:-------:|------|
| `ui_xxx()` | なし | 純粋な描画（ボタン、テキスト等） |
| `bind_xxx(s, key)` | なし | `ui_xxx` + state 双方向バインドのショートカット |
| `create_ui_xxx()` | **あり** | 開閉・テーマ・位置等の内部状態を持つ部品。dialog / splitter は controlled mode（外部 state 管理）にも対応 |

`create_ui_xxx()` の戻り値は `s` のトップレベルに格納する：

```javascript
// ✅ 正しい — s のトップレベルに格納
s.dd  = create_ui_popup();
s.acc = create_ui_accordion({ default_open: { q1: true } });
```

## パラメータ調整パネル（ui_tweak）

dat.GUI / Tweakpane ライクなパラメータ調整パネル。任意の JavaScript オブジェクトのプロパティをリアルタイムに操作できる。RicUI に統合されているため追加の読み込みは不要。

3 段階の使い方:

### Tier 1: data を渡すだけで全自動 GUI

```javascript
const { create_ui_tweak_panel } = RicUI;

const params = {
  speed: 50,
  color: '#e11d48',
  wireframe: false,
  settings: { volume: 80, mute: false },
};

// data だけ渡せば値の型から自動推論して GUI 化
s.tw = create_ui_tweak_panel({ data: params });
return s.page({ ctx: [ s.tw() ] });
```

| 値 | → 自動推論 |
|----|-----------|
| `boolean` | checkbox |
| `number` | number input |
| `'Hello'` | text input |
| `'#e11d48'` | color picker（hex 検出） |
| `'rgb(255,0,0)'` | color picker（rgb / rgba 検出） |
| `{ ... }` (plain object) | folder（再帰展開） |
| `[...]` / その他 | JSON preview |

### Tier 2: keys で部分的に上書き

```javascript
s.tw = create_ui_tweak_panel({
  title: 'Settings',
  data: params,
  keys: {
    speed: { type: 'range', min: 0, max: 100 },
    color: { type: 'color' },
    secret: false,  // この行は非表示
    settings: { open: true, keys: {
      volume: { type: 'range', min: 0, max: 100 },
    }},
  },
});
```

`keys` にはオブジェクトの代わりに関数を渡せます。毎描画で評価されるため、
パラメータの値に応じた動的な `disabled` / `options` 切り替え等が可能です。
ネストしたフォルダ内の `keys` も関数を許容します（全階層で動的評価）。

```javascript
keys: () => ({
  symmetric: {},
  cx: { type: 'range', ...(params.symmetric ? { disabled: true } : {}) },
}),
```

### Tier 3: 自由な vdom で組み立て

```javascript
const { ui_tweak_panel, ui_tweak_folder, ui_tweak_row, ui_button } = RicUI;

ui_tweak_panel({
  title: 'Custom Editor',
  ctx: [
    ui_tweak_folder({ label: 'Colors', open: true, ctx: [
      ui_tweak_row({ label: 'fg', get: () => t.fg, set: (v) => { t.fg = v; } }),
    ]}),
    ui_button({ ctx: ['Save'], onclick: save }),
  ],
})
```


## サンプル

`docs/samples/` にサンプルを同梱。

| ファイル | 内容 |
|---------|------|
| `00_hello.html` | RicDOM 生 vs RicUI の比較（最小例） |
| `01_forms.html` | フォーム入力パターン |
| `02_controls.html` | ラジオ・セレクト・ドロップダウン |
| `03_popup.html` | ポップアップ・ツールチップ |
| `04_accordion_dialog.html` | ダイアログ・トースト |
| `05_toast_accordion.html` | アコーディオン |
| `06_splitter.html` | ペイン分割（4方向） |
| `07_tweak_splitter.html` | 調整パネル + スプリッター |
| `08_tweak_menu.html` | 調整パネル + ポップアップメニュー |
| `09_json_editor.html` | JSON エディタ |
| `10_theme_studio.html` | テーマエディタ（CSS 変数見える化 + JSON 保存/読込） |
| `11_theme_override.html` | テーマ上書き・全コンポーネント比較 |
| `12_md_viewer.html` | Markdown ビューア（`ui_md_pre`） |
| `13_controlled_dialog_splitter.html` | controlled mode（外部 state で開閉管理）|
| `14_collapse_box.html` | collapse_box — 入退場アニメーション 6 パターン |
| `15_ai_chat.html` | AI チャット + 接続設定（OpenAI 互換プロバイダ切替・接続テスト・SSE streaming）|
| `16_svg_editor.html` | SVG ツリーエディタ（rect / circle / path のドラッグ編集）|
| `17_multi_ricdom.html` | Multi-instance Memo（create_RicDOM をパネル単位に分離）|
| `18_key_reconciliation.html` | Key Reconciliation — `key` 属性で並べ替え時に focus / value が混ざらない（v0.3.25〜）|

ローカルで確認するには、お好みの静的サーバーで `docs/` を配信してください。例:

```bash
npx http-server docs -p 8080
# または
python -m http.server 8080 --directory docs
```

## ビルド

```bash
npm install
npm run build        # 全バンドルをビルド
npm run build:core   # RicDOM.min.js のみ
npm run build:ui     # RicUI.min.js のみ（調整パネル含む）
npm test             # テスト実行
```

## 上級者向け（非推奨 API）

通常は不要ですが、`_internal` 経由で低レベル操作にアクセスできます。

### インスタンスの破棄

SPA で画面を動的に切り替える場合など、購読やスタイルタグを手動でクリーンアップしたいとき。
通常のページ遷移やタブを閉じる場合は GC が処理するため不要。

```javascript
const s = create_RicDOM('#app', {
  count: 0,
  render: s => ({ tag: 'div', ctx: [`${s.count}`] }),
});

// 購読を解除し、再描画タイマーと target 探索タイマーを停止し、refs をクリアする
// （描画した DOM や CSS は残るため、必要なら呼び出し側で削除する）
s._internal.destroy();
```

### 強制再描画

ネストしたプロパティを直接変更した場合の回避策。
正しい方法はトップレベル再代入（`s.user = { ...s.user, name: 'Taro' }`）なので、
通常はこの API を使う必要はない。

```javascript
// 非推奨：ネスト変更 + 強制再描画
s.user.name = 'Taro';
s._internal.force_render();

// 推奨：トップレベル再代入（自動で再描画される）
s.user = { ...s.user, name: 'Taro' };
```

## ライセンス

v0.4.0 から、[PolyForm Noncommercial License 1.0.0](https://polyformproject.org/licenses/noncommercial/1.0.0)
と [PolyForm Internal Use License 1.0.0](https://polyformproject.org/licenses/internal-use/1.0.0)
の**デュアル許諾**（利用者がどちらか選べる）に変更しました。商用の製品組み込み・SaaS・
受託成果物としての再配布は、従来どおり別途相談です。

以下は日本語のサマリです。**法的拘束力を持つのは英文条文**（[LICENSE](./LICENSE) /
[LICENSE-POLYFORM-NONCOMMERCIAL.md](./LICENSE-POLYFORM-NONCOMMERCIAL.md) /
[LICENSE-POLYFORM-INTERNAL-USE.md](./LICENSE-POLYFORM-INTERNAL-USE.md)）で、
この節はあくまで参考情報です。

| 用途 | 適用ライセンス |
|------|:----:|
| 個人の学習・研究・趣味プロジェクト / 非営利組織（教育・公的研究・政府等） | **PolyForm Noncommercial 1.0.0** |
| 企業の社内ツール・業務効率化（社外への再配布なし） | **PolyForm Internal Use 1.0.0** |
| 商用製品への組み込み・SaaS・受託での再配布 | **要相談** |

「要相談」は禁止ではありません。用途と規模を添えてご連絡ください。
連絡先: info@miyoshi-seisakusyo.jp

**バージョン境界**: v0.3.38 以前のリリースは、それぞれに同梱された旧ライセンス
（非商用 MIT / 商用要相談の自作条文）のままです。本デュアル許諾は遡及せず、
v0.4.0 以降のリリースに適用されます。

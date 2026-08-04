# RicDOM チュートリアル

Electron・社内ツール・パラメータ調整 UI 向けの軽量 DOM ライブラリ「RicDOM」を
ゼロから使えるようになるチュートリアルです。

**所要時間**: 15 分
**前提知識**: HTML と JavaScript の基礎（DOM 操作の経験があるとスムーズ）
**必要なもの**: テキストエディタ + ブラウザ

---

## 1. 準備 — ファイルを置いて動かす

RicDOM はビルドツール不要。HTML ファイルと `.min.js` だけで動きます。

```
my-project/
  index.html
  RicDOM.min.js   ← 必須
  RicUI.min.js    ← RicUI を使うなら必要（任意）
```

**`.min.js` の入手方法**:

- **リポジトリを clone 済みの場合**: `docs/RicDOM.min.js` と `docs/RicUI.min.js` をプロジェクトにコピー
- **公開ページから取りたい場合**: `https://miyoshi-tec.github.io/RicDOM/RicDOM.min.js` と `.../RicUI.min.js` を直接ダウンロード
- **GitHub Pages 上で試す場合**: `<script src="RicDOM.min.js"></script>` のように同階層を参照すればそのまま読み込めます

`index.html` を作成します:

```html
<!DOCTYPE html>
<html lang="ja">
<head><meta charset="UTF-8"><title>RicDOM Tutorial</title></head>
<body>
<div id="app"></div>
<script src="RicDOM.min.js"></script>
<script>
const { create_RicDOM } = RicDOM;

create_RicDOM('#app', {
  render(s) {
    return { tag: 'h2', ctx: ['Hello, RicDOM!'] };
  },
});
</script>
</body>
</html>
```

ブラウザで開いて「Hello, RicDOM!」と表示されれば成功です。

> **ポイント**: `create_RicDOM` の引数は 2 つだけ。
> ① マウント先（CSS セレクタ）、② state + render のオブジェクト。
> これが RicDOM の全てです。

---

## 2. JSON で UI を書く

RicDOM では HTML タグを JSON オブジェクトで表現します。

```javascript
// HTML: <div class="card"><h3>タイトル</h3><p>本文</p></div>
// ↓ RicDOM の書き方:
{
  tag: 'div',
  class: 'card',
  ctx: [
    { tag: 'h3', ctx: ['タイトル'] },
    { tag: 'p',  ctx: ['本文'] },
  ],
}
```

| プロパティ | 意味 | 例 |
|-----------|------|-----|
| `tag` | HTML タグ名 | `'div'`, `'button'`, `'input'` |
| `ctx` | 子要素（配列） | `['テキスト']`, `[{ tag: 'span', ... }]` |
| `class` | CSS クラス | `'card'`, `['card', 'active']` |
| `style` | インラインスタイル | `{ color: 'red', gap: '8px' }` |
| `onclick` 等 | イベントハンドラ | `(e) => { ... }` |

`ctx` は "contents" の略で、そのタグの中身です。
文字列を入れればテキスト、オブジェクトを入れれば子要素になります。

---

## 3. state を変えると画面が変わる

RicDOM の核心は「**state に代入するだけで自動再描画**」です。

```html
<div id="app"></div>
<script src="RicDOM.min.js"></script>
<script>
const { create_RicDOM } = RicDOM;

create_RicDOM('#app', {
  count: 0,                          // ← これが state
  render(s) {
    return {
      tag: 'div', ctx: [
        { tag: 'h3', ctx: [`カウント: ${s.count}`] },
        { tag: 'button', ctx: ['＋1'],
          onclick: () => { s.count++; },        // ← 代入で再描画
        },
        { tag: 'button', ctx: ['リセット'],
          onclick: () => { s.count = 0; },
        },
      ],
    };
  },
});
</script>
```

`s.count++` と書くだけで、RicDOM が自動的に画面を更新します。
`render(s)` が返す JSON と前回の JSON を比較して、変わった箇所だけ DOM をパッチします。

> **重要ルール**:
> - `s.count = 10` — トップレベル代入 → **再描画される**
> - `s.page.theme = 'dark'` — 一段目のプロパティ代入 → **再描画される**
> - `s.user.address.city = 'Tokyo'` — 二段目以降 → **再描画されない**
>
> 深いネストを更新したいときは `s.user = { ...s.user, address: { ...s.user.address, city: 'Tokyo' } }` のようにトップレベルで再代入してください。

---

## 4. テキスト入力を繋げる

input 要素も JSON で書けます。`value` と `oninput` を繋げれば双方向バインドです。

```javascript
create_RicDOM('#app', {
  name: '',
  render(s) {
    return {
      tag: 'div', ctx: [
        { tag: 'input',
          type: 'text',
          placeholder: '名前を入力…',
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
```

> **IME を壊しにくい**: RicDOM は input 要素を再利用して属性のみを
> パッチするため、日本語入力中に DOM 再構築が走って変換が途切れる
> ということが起きにくい構造です。ただし `value` を state 側から
> 頻繁に書き換える controlled input では IME 確定前に上書きが起きる
> 可能性があるため、日本語が中心の用途では `onchange`（確定時発火）
> や composition イベント対応も検討してください。

ここまでが RicDOM コアの基本です。
次のステップからは RicUI を使って、見た目と開発効率を一気に上げます。

---

## 5. RicUI で見た目を整える

`RicUI.min.js` を追加で読み込むと、テーマ付きの UI コンポーネントが使えます。

```html
<div id="app"></div>
<script src="RicDOM.min.js"></script>
<script src="RicUI.min.js"></script>
<script>
const { create_RicDOM } = RicDOM;
const { create_ui_page, ui_panel, ui_text, bind_input } = RicUI;

create_RicDOM('#app', {
  name: '',
  page: create_ui_page({ theme: 'light' }),

  render(s) {
    return s.page({ ctx: [
      ui_panel({ ctx: [
        ui_text({ variant: 'title', ctx: ['はじめまして'] }),
        bind_input(s, 'name', { placeholder: '名前…' }),
        s.name
          ? ui_text({ ctx: [`こんにちは、${s.name}さん！`] })
          : ui_text({ variant: 'muted', ctx: ['（名前を入力してください）'] }),
      ]}),
    ]});
  },
});
</script>
```

ステップ 4 と同じ機能ですが、見た目がまったく違うはずです。

**何が起きているか:**

1. `create_ui_page({ theme: 'light' })` — テーマを持つ page ファクトリを作る
2. `s.page = ...` — state のトップレベルに格納する（これが重要）
3. `s.page({ ctx: [...] })` — render 内で呼ぶと、テーマ CSS + 子要素の vdom が返る
4. `bind_input(s, 'name', ...)` — `s.name` と input を自動で双方向バインド

> **テーマを変えてみよう**: `'light'` を `'dark'`、`'teal'`、`'cyber'`、`'aqua'` に変えて
> ブラウザをリロードしてみてください。コード変更なしで見た目が切り替わります。

### なぜ `s.page({ ctx: [...] })` と書くのか

初見だと `s.page({ ctx: [...] })` という書き方に驚くかもしれません。React の
`<Page>...</Page>` や Vue の `<template>` とは違う見た目ですが、理由はシンプルです。

- RicDOM は **ビルドツール不要** が最優先。JSX やテンプレートはトランスパイラが必要
- `s.page` は **ただの関数** — 呼ぶと JSON（VDOM ノード）を返す
- `{ tag: 'div', class: 'ric-page', ctx: [...] }` のような JSON を手書きする代わりに、
  関数が内部状態（テーマ・密度等）を含めて組み立ててくれる

つまり `s.page({ ctx: [...] })` は「page 関数に子要素を渡して、完成した JSON を受け取る」
だけです。JSX の `<Page>` に相当するものが、ビルドなしで動く関数呼び出しになっている
と考えてください。

```javascript
// これと同じことを手書きすると…
return {
  tag: 'div', class: 'ric-page',
  style: { '--ric-color-bg': '#f9fafb', '--ric-color-fg': '#111318', /* ... */ },
  ctx: [
    { tag: 'style', ctx: ['.ric-page { ... } .ric-button { ... }'] },
    // ...子要素
  ],
};

// s.page() が全部やってくれる
return s.page({ ctx: [/* 子要素だけ書けばいい */] });
```

他の `create_ui_xxx()` 系（`create_ui_popup` / `create_ui_dialog` / `create_ui_splitter` 等）
もすべて同じパターンです。`s` のトップレベルに格納し、render 内で関数として呼びます。

### ありがちな誤用 — `create_ui_*` を state 外に置かない

React の `const Sidebar = () => ...` や Vue の `<Sidebar>` に慣れていると、
ファクトリも「module レベルの const で 1 度だけ作ればいい」と直感的に思いがちです。
しかしこれは **ハマりやすい誤用** で、ボタンを押しても何も起きない silent failure
を引き起こします。

❌ **これだと collapse / theme 切替が動きません**

```javascript
const split = create_ui_splitter({ side: 'left', size: 240 });   // module level const

create_RicDOM('#app', {
  render: () => split({ side: { ctx: [...] }, main: { ctx: [...] } }),
});
```

✅ **正しくは state のトップレベルに格納します**

```javascript
create_RicDOM('#app', {
  split: create_ui_splitter({ side: 'left', size: 240 }),
  render: (s) => s.split({ side: { ctx: [...] }, main: { ctx: [...] } }),
});
```

**理由**: RicDOM の Proxy は、state のトップレベルに置かれたファクトリ instance に
`__notify` というコールバックを注入します。splitter の collapse ボタンや内部の
transitionend など「内部イベントから再描画を発火したい」場面で、ファクトリは
この `__notify` を呼びます。state 外に置くと `__notify` が undefined のまま
**内部状態は変化するが DOM が更新されない**、という気付きにくい挙動になります。

注入の仕組み:
- `create_RicDOM(target, raw_state)` は `raw_state` を Proxy で包む
- Proxy の **set trap** が `s.foo = create_ui_splitter(...)` の代入を観測
- 代入された値が typeof === 'function' or オブジェクトかつ非配列なら、
  `value.__notify = schedule_render` を **non-enumerable で注入**する
- ファクトリの内部イベントが `this.__notify()` を呼ぶことで再描画が走る

つまり「state トップレベルへの代入」が `__notify` 注入の **唯一のフック**
であり、`const split = create_ui_splitter(...)` のように代入を経由しない
配置だと注入されない。これが canon pattern の根拠です。

v0.3.8 以降は誤用を検知すると `console.warn` が一度だけ出ます:

```
[RicDOM] create_ui_splitter() instance has no __notify — place the factory at the
top level of state so RicDOM can wire it up:
  create_RicDOM(target, { my_widget: create_ui_splitter({...}) })
```

このメッセージが出たら、上の ✅ パターンに直してください。

> ⚠️ **警告の発火タイミングに注意**: この `console.warn` は「ファクトリが**内部イベントで
> 再描画しようとした瞬間**」(splitter の collapse、popup の開閉、dialog の閉じアニメ、
> theme-change 等) に初めて出ます。**初回 render の時点では出ません。** そのため:
> - **controlled ダイアログ**のように開閉を**親 state が駆動**するケースは、ファクトリ自身が
>   `__notify` をほぼ呼ばないため、state 外に置いても**警告が出ないまま**「初回は出るが
>   その後うまく動かない/特定操作で固まる」状態になりえます。
> - 「エラーも警告も無いのに見た目だけ変」のときは、まず **`create_ui_*` をすべて
>   `s.xxx = create_ui_xxx()` の形(state トップレベル)に置いているか**を確認してください
>   (= この canon を守れば踏みません)。`create_ui_dialog` / `create_ui_page` を含む
>   **全 `create_ui_*` ファクトリが対象**です。
> - 例外として **`create_ui_page` のみ v0.3.35〜、初回 render の時点で** `__notify`
>   欠如を直接チェックして警告します(`'ric-theme-change'` イベント発火を待たない)。
>   他の `create_ui_*` は上記の「内部イベントで初めて出る」挙動のままです。

> **「render のたびに作り直したくない」と思ったときも、state 配置で OK**:
> state に置けば一度生成された instance を使い回せます (再代入しない限り
> Proxy はそのまま `s.split` を返す)。「state 外に置けば 1 度だけ生成される」
> という発想は誤り — state に置いても 1 度だけ生成されます。

### テーマの動的切替

テーマはプログラムからも変更できます:

```javascript
// ボタンクリックでテーマを切替
ui_button({ ctx: ['ダークモード'], onclick: () => { s.page.theme = 'dark'; } }),
```

`s.page.theme = 'dark'` と代入するだけで、画面全体が即座に再描画されます。

### DOM 属性を自由に付与する

`ui_xxx` コンポーネントには、表に載っている引数のほかに任意の DOM 属性を
そのまま渡せます。`id` / `data-*` / `aria-*` / `onclick` / `class` などが
外側要素に透過されます。

```javascript
ui_button({
  ctx: ['保存'],
  onclick: save,
  id: 'save-btn',            // ← id が button 要素に付く
  'data-action': 'save',     // ← data-* 属性も透過
  'aria-label': 'Save file', // ← アクセシビリティ属性
  class: 'emphasized',       // ← 基底クラス ric-button の後ろに連結
}),

ui_panel({
  id: 'main',
  onmouseenter: () => { console.log('hover'); },
  ctx: [ /* ... */ ],
}),
```

`class` を指定しても `ric-button` 等の基底クラスは消えず、後ろに連結される
ので、テーマスタイルを壊さずにクラスを追加できます。

また、`ui_checkbox` / `ui_range` / `ui_color` のように内部に `<input>` を
持つコンポーネントでは、`onchange` や `value` は内部 input にだけ掛かり、
外側の要素には漏れません。そのため、これらのコンポーネントに `id` や
`onclick` を付けても、イベントハンドラが混線する心配はありません。

### page で包めないとき — css_for で埋め込み (v0.3.34〜)

ここまでは常に `create_ui_page` でアプリ全体を包んできました。これが**基本
(canon)** です。しかし「既存アプリの一角に RicUI の部品を少しだけ置きたい」
「その部分に `.ric-page` の見た目(背景色・パディング等)が乗るのは邪魔」
というケースでは、`create_ui_page` で全体を包み直すのは大げさすぎます。

判断基準:

- アプリ全体・1 ページ丸ごとが RicUI = **`create_ui_page` が基本**
- 既存アプリの中の一部だけに RicUI 部品を置きたい／page の見た目(背景色・
  パディング)がそのまま乗ると邪魔 = **`css_for` の 3 点セット**を使う

```javascript
const { css_for, make_css_vars, ui_panel, ui_text, ui_button } = RicUI;

// 3 点セット: ① class 'ric-page' ② make_css_vars を style に ③ css_for を <style> に
{
  tag: 'div',
  class: 'ric-page',                              // ① CSS_TEMPLATES は .ric-page スコープ
  style: make_css_vars({ theme: 'dark' }),        // ② テーマ変数をこの要素に注入
  ctx: [
    { tag: 'style', ctx: [css_for('ric-panel', 'ric-button', 'ric-text')] }, // ③ 使う分だけ
    ui_panel({ ctx: [
      ui_text({ ctx: ['既存アプリの中の RicUI 島'] }),
      ui_button({ ctx: ['OK'], onclick: () => {} }),
    ]}),
  ],
}
```

`create_ui_page` は内部でこれと同じこと(使用クラスの収集 → `css_for` 相当 →
`<style>` 注入)をツリー全体に対して自動でやっています。`css_for` は公開版 —
自分でスコープを絞って好きな場所に置けます。

> ⚠️ **portal 系 (`create_ui_popup` / `create_ui_tooltip` / `create_ui_dialog` /
> `create_ui_toast`) は css_for 島では使えません。** これらは開くと VDOM を
> キューに積むだけで、**`create_ui_page` の render がそれを drain して展開する**
> ため、page を経由しない島の中では永遠に表示されないか、別の場所の
> `create_ui_page` に意図せず出てしまいます。popup/dialog/toast/tooltip が
> 必要な部分は `create_ui_page` で包んでください。

「既存アプリへの埋め込み」の完全なサンプルは
[docs/samples/19_css_embed.html](docs/samples/19_css_embed.html) を参照してください。
テーマの異なる 2 つの島を並べ、島ごとに独立してテーマを持てることも示しています。

---

## 6. JSON を投げるだけで調整パネルを作る

RicDOM の最大の売り: **JavaScript オブジェクトを渡すだけで GUI が自動生成**されます。

```html
<div id="app"></div>
<script src="RicDOM.min.js"></script>
<script src="RicUI.min.js"></script>
<script>
const { create_RicDOM } = RicDOM;
const { create_ui_page, create_ui_tweak_panel, ui_code_pre } = RicUI;

// ← このオブジェクトを GUI 化する
const params = {
  speed: 5,
  color: '#e11d48',
  wireframe: false,
};

create_RicDOM('#app', {
  params,
  page: create_ui_page({ theme: 'light' }),
  tw: create_ui_tweak_panel({ data: params }),

  render(s) {
    return s.page({ ctx: [
      s.tw(),                          // ← 調整パネル（自動生成）
      ui_code_pre({ obj: s.params }),  // ← リアルタイムで値を確認
    ]});
  },
});
</script>
```

`create_ui_tweak_panel({ data: params })` に渡すだけで:
- `speed` (number) → 数値入力
- `color` ('#e11d48') → カラーピッカー
- `wireframe` (boolean) → チェックボックス

が自動で生成されます。値を変えると `params` が直接書き換わり、画面も更新されます。

### もう少し細かく指定する（keys による上書き）

自動推論だけでは足りない場合、`keys` で一部だけ上書きできます:

```javascript
s.tw = create_ui_tweak_panel({
  data: params,
  keys: {
    speed: { type: 'range', min: 1, max: 10, step: 0.5 },  // スライダーに変更
  },
});
```

ネストしたオブジェクトは自動で折り畳みフォルダになります:

```javascript
const params = {
  character: { name: 'Hero', hp: 100 },
  physics:   { speed: 5, gravity: 9.8 },
};
// → character フォルダと physics フォルダが自動生成される
s.tw = create_ui_tweak_panel({ data: params });
```

> **NOTE**: 数値行 (`type: 'number'`) はフォーカス中「編集優先」になり、blur するまで
> state 側の変更が表示に反映されません（入力途中の値を再描画が潰さないための挙動、
> blur で `min`/`max` があれば clamp される）。詳細は SPEC.md の ui_tweak 節を参照。

> **サンプル**: より完全な例は `docs/samples/07_tweak_splitter.html` を参照してください。

---

## 7. ポップアップとダイアログ

ここからは RicUI の「ファクトリ関数」パターンを学びます。
popup や dialog のように**開閉状態を持つ部品**は `create_ui_xxx()` で作り、
**state のトップレベルに格納**します。

```javascript
const { create_RicDOM } = RicDOM;
const { create_ui_page, create_ui_popup, create_ui_dialog,
        ui_panel, ui_text, ui_button } = RicUI;

create_RicDOM('#app', {
  page: create_ui_page({ theme: 'light' }),
  menu: create_ui_popup(),         // ← ポップアップ
  dlg:  create_ui_dialog(),        // ← ダイアログ

  render(s) {
    return s.page({ ctx: [
      ui_panel({ ctx: [
        ui_text({ variant: 'title', ctx: ['Popup & Dialog'] }),

        // ── ポップアップメニュー ──
        s.menu({ ctx: [
          ui_button({ ctx: ['項目 A'], variant: 'ghost' }),
          ui_button({ ctx: ['項目 B'], variant: 'ghost' }),
        ]}),

        // ── ダイアログ ──
        s.dlg({
          trigger_ctx: ['確認ダイアログを開く'],
          title: '確認',
          ctx: [ui_text({ ctx: ['この操作を実行しますか？'] })],
          actions: [
            ui_button({ ctx: ['OK'], variant: 'primary', onclick: s.dlg.close }),
            ui_button({ ctx: ['キャンセル'], onclick: s.dlg.close }),
          ],
        }),
      ]}),
    ]});
  },
});
```

**パターンのまとめ**:

```
create_ui_xxx()  →  s に格納  →  render 内で s.xxx({ ... }) として呼ぶ
```

| 関数 | 作るもの |
|------|---------|
| `create_ui_popup()` | ドロップダウン / メニュー |
| `create_ui_dialog()` | モーダルダイアログ |
| `create_ui_tooltip()` | ツールチップ |
| `create_ui_toast()` | トースト通知 |

排他制御（popup を 1 つ開くと他が閉じる）は自動管理されます。

dialog と splitter は **controlled mode** にも対応しています。
`open` / `collapsed` を render 時に渡すと、開閉状態を外部の state で管理できます。
詳しくは SPEC.md の「Controlled / Uncontrolled パターン」を参照してください。

### 開閉アニメーション付きのコンテナ (`create_ui_collapse_box`)

panel / settings 領域などを「アニメーションで現す / 消す」場合は
`create_ui_collapse_box` が便利です。`visible: true/false` で開閉、
width / height が 0 ↔ 自然サイズに CSS transition で補間されます。

```javascript
create_RicDOM('#app', {
  expanded: false,
  box:      create_ui_collapse_box({ direction: 'v', duration: 200 }),
  render: (s) => s.page({ ctx: [
    ui_button({ ctx: ['詳細を' + (s.expanded ? '隠す' : '開く')],
                onclick: () => { s.expanded = !s.expanded; } }),
    s.box({ visible: s.expanded, ctx: [
      ui_panel({ ctx: ['詳細コンテンツ...'] }),
    ]}),
  ]}),
});
```

direction: `'v'` (縦折り、デフォルト) / `'h'` (横折り) / `'both'`。
アニメ中は JS / RicDOM は一切走らず、ブラウザの compositor で補間されるため
複数同時に開閉しても CPU 負荷は変わりません。

---

## 8. フォーム部品を使う

RicUI にはフォーム部品とその `bind_xxx` ショートカットが揃っています。

```javascript
const { create_RicDOM } = RicDOM;
const { create_ui_page, ui_panel, ui_col, ui_text,
        bind_input, bind_checkbox, bind_select, bind_range,
        ui_button, ui_code_pre } = RicUI;

create_RicDOM('#app', {
  name: '', agree: false, lang: 'ja', volume: 50,
  page: create_ui_page({ theme: 'light' }),

  render(s) {
    return s.page({ ctx: [
      ui_panel({ ctx: [
        ui_col({ ctx: [
          ui_text({ variant: 'label', ctx: ['名前'] }),
          bind_input(s, 'name', { placeholder: '入力…' }),

          bind_checkbox(s, 'agree', { ctx: ['利用規約に同意する'] }),

          ui_text({ variant: 'label', ctx: ['言語'] }),
          bind_select(s, 'lang', {
            options: [
              { value: 'ja', label: '日本語' },
              { value: 'en', label: 'English' },
            ],
          }),

          ui_text({ variant: 'label', ctx: ['音量'] }),
          bind_range(s, 'volume', { min: 0, max: 100 }),

          // state の中身をリアルタイム表示
          ui_code_pre({ obj: { name: s.name, agree: s.agree, lang: s.lang, volume: s.volume } }),
        ]}),
      ]}),
    ]});
  },
});
```

`bind_xxx(s, 'key', options)` は `s.key` と自動で双方向バインドします。
イベントハンドラを自分で書く必要はありません。

---

## 9. recipe — render 後に DOM を触りたいとき

state 変更後に新しく描画された DOM 要素を取りたい (= focus、scroll、寸法計測など)
場合は、**2 段の `requestAnimationFrame` を待つ** のが canon です。

```javascript
handle.show_editor = true;
requestAnimationFrame(() => requestAnimationFrame(() => {
  const editor = document.querySelector('.my-editor');
  editor.querySelector('input').focus();
  editor.scrollTop = editor.scrollHeight;
}));
```

仕組み (詳細は [SPEC.md「Operational facts」](SPEC.md) 参照):

1. `handle.show_editor = true` → scheduler が rAF を予約
2. **1 つ目の rAF**: do_render が VDOM 構築 + DOM patch を実行
3. **2 つ目の rAF**: browser の layout/paint commit が確実に完了

1 rAF だけだと「flush 前」に空振りすることがあります。
**focus / scroll / `getBoundingClientRect` 等は必ず 2 rAF 後** に。

> 上記は「rAF が正常に発火する」通常環境での説明です。hidden タブ・kiosk の
> 全画面遷移直後・Electron の backgroundThrottling 等で rAF が発火しない環境では、
> v0.3.36〜 の `setTimeout(200ms)` バックストップ経由で do_render が走ります
> (詳細は [SPEC.md「レンダースケジューラ」](SPEC.md) 参照)。この場合 2 rAF recipe の
> 「1 つ目の rAF で patch 完了」という前提そのものが崩れるため、そうした環境を
> 意識する必要があるなら次項の `next_render()` を使ってください。

### 使い分け: `next_render()` と 2 rAF recipe

- **render 完了 (= DOM patch 完了) を知りたいだけ** → `await handle.next_render()`。
  rAF が発火しない環境でもバックストップ経由で必ず resolve します
  (state 変化が一度も起きない場合を除く)。
- **新しい DOM の layout/paint 確定後に測る/触る (focus・scroll・
  `getBoundingClientRect` 等)** → 上記の 2 rAF recipe。`next_render()` は
  DOM commit 直後に resolve するだけで、layout/paint の確定までは保証しません。
- **「今の state が反映済み」の保証が欲しいだけ (render が予約されているか
  不明)** → `handle.render_now()`（強制・同期）。`next_render()` は render
  予約が無いと永久に resolve しない点に注意してください。

### async 境界の整理

「2 rAF で何が保証されるか」をまとめると:

| やりたいこと | canon |
|---|---|
| focus / scroll / `getBoundingClientRect` | 2 rAF (上記) で OK |
| `<img>` の decode 完了後に操作 | 2 rAF 内で `await img.decode()` |
| フォント読み込み完了後に寸法計測 | `await document.fonts.ready` |

**DOM 反映 (= VDOM patch) ≠ image decode ≠ font load** です。
2 rAF はあくまで「DOM commit までの同期」であり、media decode や font fetch は
別 task として非同期に走ります。

### 画像 decode を待ちたいとき

`<img>` の async decode 完了は **2 rAF wait だけでは保証されません**
(= rAF は layout commit までで、image decode は別 task)。decode 完了が必要なら
`HTMLImageElement.decode()` の Promise を await してください:

```javascript
handle.preview_url = new_url;
requestAnimationFrame(() => requestAnimationFrame(async () => {
  const img = document.querySelector('.preview img');
  await img.decode();                           // decode 完了を待つ
  img.scrollIntoView({ block: 'center' });      // 確実に layout 済み
}));
```

### SVG を VDOM で挿入した場合

VDOM で挿入した `<svg>` 要素は `<img>` と異なり、**decode 待ちは不要** です。
`<svg>` は layout 上 block 要素として扱われるため、2 rAF 後には
`scrollWidth` / `scrollHeight` / `getBoundingClientRect` の値が確定しています:

```javascript
handle.show_chart = true;
requestAnimationFrame(() => requestAnimationFrame(() => {
  const svg = document.querySelector('.my-chart svg');
  const { width, height } = svg.getBoundingClientRect();  // 確定している
  // ...
}));
```

RicDOM の責務は **「state → VDOM → DOM commit」までの同期化** で、それ以降の
async DOM event (= image decode、video load、fetch 完了) は標準 web API に
直接乗ってください。

### canvas / サードパーティ DOM と共存する (v0.3.38〜 明記)

Chart.js / 地図ライブラリ / リッチテキストエディタのように、**要素の中身を
imperative に自分で書き換えるライブラリ**と RicDOM を共存させたい場合は、
その要素の `ctx` を省略して `ref` だけ付けます:

```javascript
render(s) {
  return {
    tag: 'div', ctx: [
      { tag: 'h2', ctx: [s.title] },
      { tag: 'canvas', ref: 'chart_canvas' }, // ctx を省略する（ctx: [] と書いても同じ効果）
    ],
  };
}

const handle = create_RicDOM('#app', state);
// マウント後、canvas の中身は Chart.js が直接 DOM を書き換えてよい
const chart = new Chart(handle.refs.get('chart_canvas'), { /* ... */ });
```

**なぜ動くか**: `ctx` を省略した要素は、再描画のたびに「前回も今回も子要素なし」と
判定されて DOM 差分パッチが**その要素の中身には一切触れません**（`ctx: []` と書いても
同じ）。これは元々「別ファイルに分けた子 `create_RicDOM` instance を mount する」ための
仕組みですが（[SPEC.md「パターン 3」](SPEC.md)参照）、外部ライブラリが imperative に
書き換える「diff 対象外の島」を作る用途にもそのまま使えます。

**注意**: `key` を付けない兄弟リストで要素の並びが変わると、別ノード扱いされて中身
（= canvas の描画内容）が失われることがあります。並び替えが起きる文脈では `key` を
明示してください。専用の `static: true` のようなフラグは提供していません —
**`ctx` 省略が canon** です。

### 「after_render フックが欲しい」と思ったら

`handle.after_render(cb)` のような **persistent なコールバック登録型** の API は
**意図的に提供していません**。理由:

- 「DOM 反映直後」は 2 rAF wait や次項の `next_render()` で十分捕捉できる
- 「async 完了後」は標準 API (`Promise`、`decode()`、`addEventListener`) が解
- コールバック登録式のフックを提供すると「persistent vs one-shot?」「unregister
  は?」「render が走らなかったら?」と仕様が膨らみ、polysemic になる

代わりに `handle.next_render()` (v0.3.32〜) を用意しています。これは
**一回限り・観測専用の `Promise`** で、コールバック登録ではありません:

```javascript
handle.show_editor = true;
await handle.next_render();
// この時点で DOM commit は完了している (= querySelector で新要素が取れる)
```

- **自分からは render を起こしません**。呼び出し側が先に state を変える必要があり、
  state 変化が一度も起きなければこの Promise は **永久に resolve しません**。
- resolve タイミングは **do_render の DOM commit 完了直後**です。layout/paint の
  確定までは保証しないため、focus / scroll / `getBoundingClientRect` など
  layout 確定が要る操作には従来通り 2 rAF recipe を使ってください。
- 自然スケジュール (rAF バッチ、バックストップ含む) でも `render_now()` 強制でも、
  どちらの完了でも resolve します。

state ↔ render の一方向データフロー (= 「state を変える → RicDOM が DOM に
反映する」) を保つことで、library が小さく predictable に保たれます。

---

## 10. 次のステップ

おつかれさまでした。ここまでで RicDOM の主要な機能を一通り体験しました。

### おすすめの次のステップ

1. **サンプルを動かす** — `docs/samples/` を順に見てみてください:
   - `00_hello.html` — RicDOM 生 vs RicUI の比較
   - `03_popup.html` — ポップアップ・ツールチップの実例
   - `07_tweak_splitter.html` — 調整パネル + ペイン分割
   - `10_theme_studio.html` — テーマエディタ（全部品のプレビュー付き）

2. **README を読む** — API 一覧とパターンの全体像

3. **SPEC.md を読む** — CSS 変数・テーマ・Proxy メカニズムの詳細

### 3 つのパターンを覚える

| パターン | 例 | 使い分け |
|---------|-----|---------|
| `ui_xxx()` | `ui_button`, `ui_text` | 状態を持たない純粋な描画 |
| `bind_xxx(s, key)` | `bind_input`, `bind_checkbox` | state との双方向バインド |
| `create_ui_xxx()` | `create_ui_popup`, `create_ui_page` | 内部状態を持つ部品。**s のトップレベルに格納** |

### FAQ

**Q: React / Vue と何が違う？**
RicDOM は Virtual DOM を使わず、JSON 差分から実 DOM を直接パッチします。
ビルドツール不要で、`<script>` タグ 1 つで動きます。
大規模 SPA には向きませんが、Electron アプリ・社内ツール・パラメータ調整 UI では
学習コストの低さと IME 対応の確実さが利点です。

**Q: どういうときに向いている？**
- Electron アプリの設定画面・ダッシュボード
- 社内ツール・業務用 UI
- プロトタイプ・データ可視化
- ゲームやシミュレーションのパラメータ調整 UI

**Q: `s.refs.get(...)` にしたら undefined になった**
`render(s)` の `s` は state Proxy で、`refs` を持っていません。DOM 参照マップ (`refs`)
は `create_RicDOM` の戻り値（handle）にしかないので、以下のように書きます:

```javascript
const { focus_when } = RicUI;              // ← import を忘れずに
const handle = create_RicDOM('#app', { ... });
handle.render = (s) => {
  // ❌ s.refs は undefined
  // ✅ handle を closure で参照
  focus_when(handle.refs.get('input'), !s.busy);
  return { /* ... */ };
};
```

これは `focus_when` や、独自に DOM を触りたいときに必要になります。
通常の `ui_xxx` コンポーネントだけで完結する UI では refs は使いません。

**Q: 商用利用は？**
非商用（個人利用・学習・研究・OSS 開発）は自由です。
商用利用は要相談。詳細は [LICENSE](./LICENSE) を参照してください。

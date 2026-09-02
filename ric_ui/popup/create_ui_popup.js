// RicUI — create_ui_popup
// 汎用ポップアップ（ポータルパターン）。
// 旧 create_ui_dropdown / create_ui_menu を統合。
//
// 使い方:
//   s.dd   ??= create_ui_popup();
//   s.menu ??= create_ui_popup();
//   s.cfg  ??= create_ui_popup();
//
//   // ラベル付き（旧 dropdown）— ポップアップはボタン幅に合う
//   s.dd({ label: '選択肢', ctx: [...] })
//
//   // chevron: true — ラベルに開閉インジケータ（▼）を付ける（開くと 180° 回転）
//   s.dd({ label: '選択肢', chevron: true, ctx: [...] })
//
//   // アイコン（旧 menu）— 正方形ボタン、ポップアップは min-width: 160px
//   s.menu({ icon: '≡', ctx: [...] })
//
//   // ghost: ホバーまで枠を隠す
//   s.cfg({ icon: '⚙', ghost: true, ctx: [...] })
//
// プログラム的に任意の座標へ開く（v0.4.3〜。trigger ボタンを使わないケース用）:
//   s.menu.open_at({ x: 120, y: 340 })                 // { x, y } でも
//   s.menu.open_at(e)                                  // MouseEvent (clientX/clientY/target) でも可
//   例: 行の右クリック位置に開く
//     oncontextmenu: (e) => { e.preventDefault(); s.menu.open_at(e); }
//
// 1インスタンス = 1トリガー。
// 開いているときオーバーレイ＋ポップアップを _page_portal_queue に積む。
// ui_page がレンダー時に取り出して .ric-page 末尾に展開する（ポータルパターン）。
//
// 内部状態（短縮名 → 原名）:
//   _o  — open          開閉状態
//   _c  — closing       閉じるアニメーション中
//   _d  — dir           ポップアップ展開方向 ('below'|'above')
//   _p  — pos           位置情報オブジェクト
//   _m  — measuring     実測フェーズ中（v0.3.27〜。下記参照）
//   _eb — esc_bound     ESC ハンドラの bind 状態（v0.3.27〜）
//   _pid— popup_id      DOM 上の本体を一意特定するための id（v0.3.27〜。closure const。inst._pid ではない）
//
// 開き方向 (above/below) の決定 (v0.3.27〜):
//   旧実装は `ctx.length * 38px` で高さを見積もっていたが、ctx をラッパー要素で
//   包むと「論理項目数」と「トップレベルノード数」がズレて方向判定が破綻した
//   (TrendGuard 報告)。v0.3.27 では実 DOM を測る 2 段階方式に変更:
//     1) trigger onclick で暫定方向のまま visibility:hidden で開く (_m=true)
//     2) 次の rAF で本体の offsetHeight を実測し、方向を確定して可視化 (_m=false)
//   1 フレーム遅延するが、popup は元々 CSS open アニメを持つため体感はほぼ無い。
//   rAF / document が無い環境 (SSR 等) では暫定方向のまま即表示にフォールバックする
//   (= 旧挙動、popup が hidden のまま固まらないための保護)。
//
// open_at (座標指定で開く公式 API、v0.4.3〜):
//   consumer (Trend Guard) が「行の右クリック位置に開く」ために、trigger を疑似
//   click した後 popup 本体の DOM に body.style.left / right を直書きするハックを
//   使っていた。RicDOM の style パッチは VDOM を正とする (= 次の render で VDOM 側の
//   値が再適用される) ため、トースト表示等で popup 本体まで再 render が届くと
//   直書きした left と VDOM 側の right が両立して popup が伸びるバグを踏んだ。
//   これは RicDOM の canon どおりの挙動 (バグではない) — 欠けていたのは「座標を
//   渡して開く公式 API」だった。open_at はこれを埋める:
//     - 座標は viewport 基準 (clientX/clientY 系)。containing block は
//       trigger と同じ _get_portal_cb() で求める (anchor は point.target が
//       Element ならそれ、無ければ document.body)
//     - trigger 版と同じ 2 段階実測パイプライン (暫定 below → rAF で実測 → 確定)
//       を使う。横方向は right を使わず left のみで、containing block 内に
//       収まるよう [8px, cb.width - 本体幅 - 8px] へ clamp する
//     - 開いている最中に呼ばれたら閉じずに位置だけ更新して再 measure する
//   ⚠️ popup 本体の inline style を DOM 直書きで変えても、次の render で VDOM 側の
//   値に上書きされる (VDOM が正)。位置を変えたいなら open_at を使うこと。

'use strict';

const _portal                   = require('./_page_portal_queue');
const { apply_theme_to_portal } = require('./_wrap_portal');
const {
  _make_popup_dir, _make_popup_dir_at, _pos_style, _get_portal_cb, _get_expand_ref,
  _register_popup, _close_others,
} = require('./_popup_utils');
const { safe_notify } = require('../_factory_helpers');
const { ui_icon } = require('../control/ui_icon');

// label モードの開閉インジケータ (chevron:true のとき)。開くと CSS で 180° 回転。
const _CHEVRON_DOWN = { p: 'm6 9 6 6 6-6' };

// popup 本体の DOM を一意特定するためのモジュールレベルカウンタ。
let _next_popup_id = 0;

const create_ui_popup = () => {

  const _pid = ++_next_popup_id;

  // アニメーション終了時の後片付け
  const _on_anim_end = () => {
    if (!inst._c) return;
    inst._o = false;
    inst._c = false;
    safe_notify(inst, 'create_ui_popup');
  };

  // アニメーション付きクローズ
  const _do_close = () => {
    if (inst._c) return;
    inst._c = true;
    safe_notify(inst, 'create_ui_popup');
  };

  // ESC キーハンドラ（ファクトリ作成時に 1 回だけ定義）
  // dialog と同型: 開いている間だけ document に bind し、ESC でアニメ付きクローズ。
  const _esc_handler = (e) => {
    if (e.key === 'Escape' && inst._o && !inst._c) _do_close();
  };

  // 位置情報 _p を方向 (dir) から計算する。
  // rect: trigger の getBoundingClientRect、cb: containing block。
  // 実測フェーズの前後どちらでも同じ計算を使えるよう helper に切り出した (v0.3.27〜)。
  const _compute_pos = (rect, cb, dir, is_label, trigger_el) => {
    if (is_label) {
      // ラベルモード：ボタン幅を最小幅として、コンテンツに合わせて広がる
      return {
        top:    dir === 'below' ? rect.bottom - cb.top + 2  : undefined,
        bottom: dir === 'above' ? cb.bottom - rect.top + 2  : undefined,
        left:   rect.left - cb.left,
        minWidth: rect.width,
      };
    }
    // アイコンモード：trigger が論理コンテナの左半分にあれば右方向へ展開
    const ref = _get_expand_ref(trigger_el);
    const expand_right = rect.left < (ref.left + ref.right) / 2;
    return {
      top:    dir === 'below' ? rect.bottom - cb.top + 4  : undefined,
      bottom: dir === 'above' ? cb.bottom - rect.top + 4  : undefined,
      left:   expand_right ? rect.left - cb.left : undefined,
      right:  expand_right ? undefined : cb.right - rect.right,
    };
  };

  // open_at 用の位置計算 (v0.4.3〜)。trigger 版の _compute_pos と違い、
  // 座標 (x, y) 一点から計算する。right は使わず left のみ (横方向の伸縮は
  // clamp で吸収する。DOM 直書きハックが踏んだ「left と right の両立」を
  // そもそも起こしようがない形にしている)。
  // w: 実測した本体幅 (measured_w)。未計測時 (初回の暫定位置) は undefined を渡し、
  // clamp をスキップする。
  const _compute_pos_at = (x, y, cb, dir, w) => {
    const pos = {
      top:    dir === 'below' ? y - cb.top + 2 : undefined,
      bottom: dir === 'above' ? cb.bottom - y + 2 : undefined,
      left:   x - cb.left,
    };
    if (w !== undefined) {
      const margin   = 8;
      const cb_width = cb.right - cb.left;
      const max_left = Math.max(margin, cb_width - w - margin);
      pos.left = Math.min(Math.max(pos.left, margin), max_left);
    }
    return pos;
  };

  // inst(props) → VDOM
  const inst = ({ label, icon, ghost = false, chevron = false, ctx = [], theme, density, font_size } = {}) => {
    // label / icon どちらもなければデフォルトアイコン
    const is_label = !!label && !icon;
    const trigger_text = icon ?? (label ? undefined : '≡');

    // ── ESC キー bind / unbind（開いている間だけ）──
    if (typeof document !== 'undefined') {
      if (inst._o && !inst._eb) {
        document.addEventListener('keydown', _esc_handler);
        inst._eb = true;
      }
      if (!inst._o && inst._eb) {
        document.removeEventListener('keydown', _esc_handler);
        inst._eb = false;
      }
    }

    if (inst._o) {
      const portal_items = [
        // 透明オーバーレイ：外クリックで閉じる
        { tag: 'div',
          'data-ric-role': 'popup-overlay',
          style: { position: 'fixed', inset: 0, zIndex: 401 },
          onclick: _do_close },
        // ポップアップ本体
        // 実測フェーズ中 (_m) は visibility:hidden で 1 フレーム描画し、offsetHeight を
        // 測ってから可視化する (方向確定のため。下記 onclick の rAF を参照)。
        { tag: 'div',
          class: 'ric-popup__body ric-popup__body--' + inst._d
               + (inst._c ? ' ric-popup__body--out' : ''),
          'data-ric-role': 'popup-body',
          'data-ric-popup-id': _pid,
          style: inst._m ? { ..._pos_style(inst._p), visibility: 'hidden' } : _pos_style(inst._p),
          onclick: _do_close,
          onanimationend: _on_anim_end,
          ctx: ctx,
        },
      ];
      _portal.push(...apply_theme_to_portal(portal_items, { theme, density, font_size }));
    }

    // トリガーボタンの class を組み立て
    const trigger_cls = 'ric-popup__trigger'
      + (is_label ? ' ric-popup__trigger--label' : '')
      + (ghost    ? ' ric-popup__trigger--ghost'  : '')
      + (inst._o  ? ' ric-popup__trigger--open' : '');

    // トリガーの中身を組み立てる。
    //   label モード: ラベル span。chevron:true なら開閉インジケータ (▼) を右端に追加し、
    //                 開いている間は --open クラスで CSS が 180° 回転させる。
    //   icon モード:  アイコン文字 (or VDOM) をそのまま。
    let trigger_ctx;
    if (is_label) {
      trigger_ctx = [{ tag: 'span', ctx: [label] }];
      if (chevron) {
        trigger_ctx.push(ui_icon(_CHEVRON_DOWN, { size: '1em',
          class: 'ric-popup__chevron' + (inst._o ? ' ric-popup__chevron--open' : '') }));
      }
    } else {
      trigger_ctx = [trigger_text];
    }

    return {
      tag: 'div', class: 'ric-popup',
      ctx: [
        { tag: 'button', class: trigger_cls,
          'data-ric-role': 'popup-trigger',
          onclick: (e) => {
            if (inst._c) return;
            if (inst._o) {
              _do_close();
              return;
            }
            const trigger_el = e.currentTarget;
            const rect = trigger_el.getBoundingClientRect();
            const cb   = _get_portal_cb(trigger_el);
            _close_others(inst);

            // 暫定方向: ctx.length 見積りで一旦決める (実測前のプレースホルダ)。
            inst._d = _make_popup_dir(trigger_el, ctx.length * 38 + 8);
            inst._p = _compute_pos(rect, cb, inst._d, is_label, trigger_el);

            // rAF + document があれば実測フェーズに入る (visibility:hidden で開く)。
            // 無ければ暫定方向のまま即表示 (SSR 等のフォールバック = 旧挙動)。
            const can_measure = typeof requestAnimationFrame !== 'undefined'
                             && typeof document !== 'undefined';
            inst._m = can_measure;
            inst._o = true;
            safe_notify(inst, 'create_ui_popup');

            if (can_measure) {
              requestAnimationFrame(() => {
                // 開いている最中でなければ何もしない (連打で閉じた等)
                if (!inst._o || inst._c) { inst._m = false; return; }
                const body = document.querySelector(`[data-ric-popup-id="${_pid}"]`);
                if (!body) { inst._m = false; safe_notify(inst, 'create_ui_popup'); return; }
                // 実測した本体高さで方向を再判定
                const measured_h = body.offsetHeight;
                const new_dir = _make_popup_dir(trigger_el, measured_h);
                if (new_dir !== inst._d) {
                  inst._d = new_dir;
                  inst._p = _compute_pos(rect, cb, new_dir, is_label, trigger_el);
                }
                inst._m = false;   // 可視化
                safe_notify(inst, 'create_ui_popup');
              });
            }
          },
          ctx: trigger_ctx,
        },
      ],
    };
  };

  // 内部状態
  inst._o  = false;   // open
  inst._c  = false;   // closing
  inst._d  = 'below'; // dir
  inst._p  = {};      // pos
  inst._m  = false;   // measuring（実測フェーズ中、v0.3.27〜）
  inst._eb = false;   // esc_bound（v0.3.27〜）

  // 外部・排他制御から閉じるための API（即座・アニメなし）。
  // v0.3.27〜: safe_notify を発火するようにした。理由:
  //   - dialog.close() と挙動を揃える (従来 popup だけ notify せず非対称だった)
  //   - multi-instance で別インスタンスの popup を閉じたとき、その popup の portal が
  //     残留する bug を解消 (閉じた側の __notify で再描画されて portal が除去される)
  //   排他制御 (_close_others) からの呼び出しでも、open する側の notify と rAF で
  //   バッチされるので二重描画にはならない。
  inst.close = () => {
    inst._o = false;
    inst._c = false;
    inst._m = false;
    safe_notify(inst, 'create_ui_popup');
  };

  // 任意の座標に開く公式 API (v0.4.3〜)。trigger ボタンを持たないケース
  // (右クリックメニュー等) 用。ファイル冒頭コメント「open_at」の背景を参照。
  //
  // point: { x, y } または { clientX, clientY, target } (MouseEvent をそのまま渡せる)。
  //   x/y は viewport 基準 (clientX/clientY 系)。target が Element ならそれを
  //   anchor として containing block を求め、無ければ document.body を使う。
  // 不正な引数 (x/y を持たない等) は console.error + 何もしない (NOOP 流儀、throw しない)。
  // 閉じアニメーション中 (_c) は無視。開いている最中 (_o && !_c) に呼ばれたら
  // 閉じずに位置だけ更新して再 measure する (trigger onclick と共通のパイプライン)。
  inst.open_at = (point) => {
    if (inst._c) return; // 閉じアニメ中は無視

    if (!point || typeof point !== 'object') {
      console.error('[RicUI] create_ui_popup.open_at: point には { x, y } または ' +
        '{ clientX, clientY } を持つオブジェクト (MouseEvent 可) を渡してください。');
      return;
    }
    const x = point.x ?? point.clientX;
    const y = point.y ?? point.clientY;
    if (typeof x !== 'number' || typeof y !== 'number' || Number.isNaN(x) || Number.isNaN(y)) {
      console.error('[RicUI] create_ui_popup.open_at: x/y (または clientX/clientY) が数値ではありません。');
      return;
    }

    const has_document = typeof document !== 'undefined';
    const anchor_el = (typeof Element !== 'undefined' && point.target instanceof Element)
      ? point.target
      : (has_document ? document.body : undefined);
    const cb = anchor_el ? _get_portal_cb(anchor_el) : { top: 0, left: 0, right: 0, bottom: 0 };

    _close_others(inst);

    // 暫定方向は below 固定（trigger 版と違い基準要素が無いため below を既定にする）。
    inst._d = 'below';
    inst._p = _compute_pos_at(x, y, cb, inst._d, undefined);

    // rAF + document があれば実測フェーズに入る (visibility:hidden で開く)。
    // 無ければ暫定位置のまま即表示 (SSR 等のフォールバック = trigger 版と同じ)。
    const can_measure = typeof requestAnimationFrame !== 'undefined' && has_document;
    inst._m = can_measure;
    inst._o = true;
    safe_notify(inst, 'create_ui_popup');

    if (can_measure) {
      requestAnimationFrame(() => {
        if (!inst._o || inst._c) { inst._m = false; return; }
        const body = document.querySelector(`[data-ric-popup-id="${_pid}"]`);
        if (!body) { inst._m = false; safe_notify(inst, 'create_ui_popup'); return; }
        // 実測した本体サイズで方向を再判定し、横方向は clamp する
        const measured_w = body.offsetWidth;
        const measured_h = body.offsetHeight;
        const new_dir = _make_popup_dir_at(y, measured_h);
        inst._d = new_dir;
        inst._p = _compute_pos_at(x, y, cb, new_dir, measured_w);
        inst._m = false;   // 可視化
        safe_notify(inst, 'create_ui_popup');
      });
    }
  };

  // 排他制御リストに登録（モジュールレベル）
  _register_popup(inst);
  return inst;
};

module.exports = { create_ui_popup };

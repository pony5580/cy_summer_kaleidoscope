/* ============================================================
   SUMMER KALEIDOSCOPE ― interactions (v4 / scroll-driven floating)
   ------------------------------------------------------------
   スクロールするまで図形は完全に静止。スクロールすると各要素が浮遊し始め、
   スクロール量（を平滑化した drive p）に応じて深度別にドリフトする。
   減衰バネで追従するため、弾くと少し行き過ぎて減衰しながら止まる＝物理的な
   慣性と緩急（加速・減速）。中心軸まわりの旋回（万華鏡的な動き）は行わない。

     .floaters__rotor   … 図形をまとめる静的コンテナ（回転はしない）
       .floater         … 位置アンカー
         .floater__scroll … 深度別パララックス移動（drive 連動）
           .floater__drift … 自由浮遊（1D バリューノイズ駆動・非周期）
             .floater__shape … 図形本体（緩やかな自転 / 速度で微膨張、bar は長さ）

   駆動は GSAP + ScrollTrigger + Lenis（CLAUDE.md 準拠）。
   - transform / opacity のみをアニメート（レイアウト reflow を起こさない）
   - force3D:false … iOS Safari で図形が恒久レイヤー化して mix-blend が
     切れるのを防ぐ（前面テキストと背面図形の乗算ブレンドを守る）
   - prefers-reduced-motion / ライブラリ未読込 時は静止して全内容を表示
   ============================================================ */
(function () {
  "use strict";

  var doc = document;
  var root = doc.documentElement;
  var reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  var hasGSAP = !!(window.gsap && window.ScrollTrigger);

  /* ---------- 図形コンフィグ（vmin / vw / vh 基準） ---------- */
  // depth : スクロール & マウス視差の効き（大きいほど手前＝大きく動く）
  // drift : 常時ドリフトの振幅（vmin）と周期（秒）
  // spin  : 自転の振れ幅（deg）／ breathe: 呼吸 scale ［min,max］
  // baseRot: 図形本体の基準角度 ／ barScroll: スクロールで長さ scaleX ［開始,終了］
  // 元の 6 要素（ゴールド円・赤リング・赤バー×2・赤正方形・ゴールド長方形）を
  // 初期位置・サイズそのままで復元。モーション（drift / parallax / pointer）だけ高度化。
  var FLOATERS = [
    // ゴールドの円
    {
      cls: "s-circle c-gold",
      vars: { "--size": "100vmin" },
      pos: { top: "-5vh", right: "-20vw" },
      depth: 0.42,
      drift: { x: 22, y: 26, r: 8, dur: 23 },
      spin: 10,
      breathe: [0.92, 2.08],
    },
    // 赤いリング（元は border-width が伸縮 → transform の scale パルスに置換）
    {
      cls: "s-ring c-red",
      vars: { "--size": "100vmin", "--ring": "4vmin" },
      pos: { top: "10vh", left: "-10vw" },
      depth: 0.28,
      drift: { x: 30, y: 22, r: -9, dur: 17 },
      breathe: [0.82, 2.14],
    },
    // 左上の一点（top:15vh / left:15vw）で X 字に交差してスタートする 2 本のバー。
    // 元同様アンカーを中心に配置（xPercent/yPercent -50）。長さは scaleX でモーフ。
    {
      cls: "s-bar c-red",
      vars: { "--len": "86vmin", "--th": "2vmin" },
      pos: { top: "15vh", left: "5vw" },
      center: true,
      depth: 0.4,
      drift: { x: 30, y: 36, r: 0, dur: 45 },
      baseRot: 2,
      barScroll: [1.0, 2.2],
    },
    {
      cls: "s-bar c-red",
      vars: { "--len": "80vmin", "--th": "2vmin" },
      pos: { top: "17vh", left: "15vw" },
      center: true,
      depth: 0.5,
      drift: { x: -26, y: 32, r: 0, dur: 21 },
      baseRot: 25,
      barScroll: [1.0, 1.5],
    },
    // 赤い正方形
    {
      cls: "s-square c-red",
      vars: { "--size": "30vmin" },
      pos: { bottom: "33vh", right: "15vw" },
      depth: 0.55,
      drift: { x: -16, y: 20, r: 16, dur: 11 },
      baseRot: 24,
      spin: 28,
      breathe: [0.9, 1.12],
    },
    // ゴールドの長方形
    {
      cls: "s-rect c-gold",
      vars: { "--w": "70vmin", "--h": "34vmin" },
      pos: { bottom: "10vh", left: "-20vw" },
      depth: 0.22,
      drift: { x: 22, y: -10, r: -12, dur: 19 },
      baseRot: -45,
      spin: 8,
      breathe: [0.95, 1.56],
    },
  ];

  /* ---------- 図形 DOM を生成 ----------
     図形群は .floaters__rotor でまとめる（現在は静的コンテナ。回転はしない）。
     各図形はスクロール量に応じて深度別に浮遊ドリフトする。 */
  var floatersEl = doc.querySelector(".floaters");
  var rotor = null;
  var built = [];
  // 合成モードを次のランダムな 1 種へ進める関数。切り替えを行わない条件
  // （iOS / reduced-motion）では null のままにして、呼び出し側で無効化する。
  var cycleBlend = null;
  if (floatersEl) {
    rotor = doc.createElement("div");
    rotor.className = "floaters__rotor";

    FLOATERS.forEach(function (cfg) {
      var floater = doc.createElement("div");
      floater.className = "floater";
      // 位置（left/right/top/bottom）を最外ラッパーに付与
      Object.keys(cfg.pos).forEach(function (k) {
        floater.style[k] = cfg.pos[k];
      });

      var scroll = doc.createElement("div");
      scroll.className = "floater__scroll";

      var drift = doc.createElement("div");
      drift.className = "floater__drift";

      var shape = doc.createElement("div");
      shape.className = "floater__shape " + cfg.cls;
      if (cfg.vars) {
        Object.keys(cfg.vars).forEach(function (k) {
          shape.style.setProperty(k, cfg.vars[k]);
        });
      }

      drift.appendChild(shape);
      scroll.appendChild(drift);
      floater.appendChild(scroll);
      rotor.appendChild(floater);

      built.push({
        cfg: cfg,
        floater: floater,
        scroll: scroll,
        drift: drift,
        shape: shape,
      });
    });

    floatersEl.appendChild(rotor);

    /* 図形の合成モード（mix-blend-mode）。
       iOS(WebKit) はアニメーション中の mix-blend-mode が不安定で図形が別の図形の
       下に隠れる不具合が出るため、iOS では無効化（normal）する。
       それ以外のブラウザでは 10 種からランダムに 1 つ適用し、以降は一定量
       スクロールするたびに別の 1 種へ切り替える（直前と同じ種類は選ばない）。
       切り替えのタイミングと図形のフェードは下の GSAP ループが受け持つ。
       CSS 変数 --floater-blend をセット → .floater が参照する。
       ※ reduced-motion 時は cycleBlend を持たせず、初回の 1 種で固定。 */
    var isIOS =
      /iP(hone|od|ad)/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (isIOS) {
      floatersEl.style.setProperty("--floater-blend", "normal");
    } else {
      var BLENDS = [
        "color-burn",
        "color-dodge",
        "difference",
        "exclusion",
        "multiply",
        "hard-light",
        "hue",
        "luminosity",
        "overlay",
        "plus-lighter",
      ];
      var blendIndex = Math.floor(Math.random() * BLENDS.length);
      floatersEl.style.setProperty("--floater-blend", BLENDS[blendIndex]);

      if (!reduceMotion) {
        cycleBlend = function () {
          // 直前と同じにならないよう、残り n-1 種から選ぶ
          blendIndex =
            (blendIndex + 1 + Math.floor(Math.random() * (BLENDS.length - 1))) %
            BLENDS.length;
          floatersEl.style.setProperty("--floater-blend", BLENDS[blendIndex]);
        };
      }
    }
  }

  /* ---------- 静止フォールバック（reduced-motion / ライブラリ未読込） ---------- */
  function showAllStatic() {
    // 登場前に隠していた要素をすべて表示（html.js セレクタを無効化）
    root.classList.remove("js");
    // reveal も表示
    doc.querySelectorAll(".reveal").forEach(function (el) {
      el.classList.add("is-visible");
    });
    // バーの基準角度など、静止時でも見た目を整える
    built.forEach(function (b) {
      var t = b.cfg.center ? "translate(-50%,-50%) " : "";
      if (b.cfg.baseRot) t += "rotate(" + b.cfg.baseRot + "deg)";
      if (t) b.shape.style.transform = t.trim();
    });
  }

  if (reduceMotion || !hasGSAP) {
    showAllStatic();
    return;
  }

  /* ============================================================
     ここから GSAP 駆動
     ============================================================ */
  var gsap = window.gsap;
  var ScrollTrigger = window.ScrollTrigger;
  gsap.registerPlugin(ScrollTrigger);
  // iOS の mix-blend を守るため 3D レイヤー化しない
  gsap.config({ force3D: false });

  var vmin = function (v) {
    return (v / 100) * Math.min(window.innerWidth, window.innerHeight);
  };

  /* ---------- 1. Lenis スムーススクロール ---------- */
  var lenis = null;
  if (window.Lenis) {
    root.style.scrollBehavior = "auto";
    lenis = new window.Lenis({
      lerp: 0.09,
      wheelMultiplier: 1,
      smoothWheel: true,
    });
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add(function (time) {
      lenis.raf(time * 1000);
    });
    gsap.ticker.lagSmoothing(0);
  }

  /* ---------- 2. スクロール駆動の万華鏡（物理・慣性） ----------
     ・スクロールするまで完全静止（drive p = 0）。常時アニメ・マウス視差は無し。
     ・スクロール位置を正規化した目標へ、減衰バネ（アンダーダンプ）で追従。
       弾くと少し行き過ぎて（overshoot）減衰しながら止まる＝物理的な慣性と緩急。
     ・drive p と その速度 vp を transform へ写像：
         rotor  … p に比例して全体を旋回（筒をひねる）、|vp| で微膨張
         shape  … baseRot + p×個別の逆回転、|vp| で微膨張、bar は p で長さ scaleX
         scroll層 … p に比例した深度別パララックス移動 */

  function clamp01(x) {
    return x < 0 ? 0 : x > 1 ? 1 : x;
  }

  var R = gsap.utils.random;

  /* ---------- 1D バリューノイズ（fBm） ----------
     整数格子ごとに hash で疑似乱数を作り、smoothstep で補間する。
     ・速度が連続 → カクつかず滑らかに漂う
     ・非周期 → サイン合成のような「読めるリズム」にならない
     ・tanh で [-1,1] に有界 → ブラウン運動と違い累積ドリフトせず、
       図形が画面外へ流れ去らない（振幅 a が excursion の上限になる） */
  function hash1(n) {
    var s = Math.sin(n * 12.9898) * 43758.5453;
    return 2 * (s - Math.floor(s)) - 1; // [-1,1)
  }
  function noise1(t, seed) {
    var i = Math.floor(t);
    var f = t - i;
    var u = f * f * (3 - 2 * f); // smoothstep（格子の両端で速度 0＝滑らかに繋がる）
    return hash1(i + seed) * (1 - u) + hash1(i + 1 + seed) * u;
  }
  // 3 オクターブ。周波数比を非整数にしてうねりが噛み合わないようにする。
  // tanh のゲインは「典型的な振れ幅」の調整用（大きいほど端に張り付く動きになる）。
  function fbm(t, seed) {
    return Math.tanh(
      2.6 *
        (noise1(t, seed) * 0.6 +
          noise1(t * 2.13, seed + 37.7) * 0.3 +
          noise1(t * 4.31, seed + 91.3) * 0.12),
    );
  }

  var FREE_K = 1.6; // 自由浮遊の振幅倍率（1.0 = 旧サイン合成と同等）

  // 図形ごとのモーション係数を前計算し、初期状態（アンカー）を確定
  built.forEach(function (b, i) {
    var cfg = b.cfg;
    var d = cfg.drift || {};
    b.parX = vmin(d.x || 0); // フル drive でのパララックス移動量（px）
    b.parY = vmin(d.y || 0);
    // 個別の自転（スクロール連動）：spin か既定 + drift.r、偶奇で逆向き
    var dir = i % 2 === 0 ? 1 : -1;
    b.turn = (cfg.spin || 16) * dir + (d.r || 0);
    b.base = cfg.baseRot || 0;
    b.isBar = !!cfg.barScroll;

    // --- 自由浮遊：ノイズ駆動 ---
    // 図形ごとに「性格」を乱数レンジから引く。seed も含めて毎回引き直すので、
    // リロードのたびに軌道もテンポも変わる。
    var dep = cfg.depth;
    var speed = R(0.35, 1.5); // 鈍い図形と機敏な図形が混ざる
    var amp = R(0.7, 1.35); // 同じ depth でも振れ幅に差が出る
    var A = vmin((15 + dep * 26) * FREE_K * amp); // 振幅の上限（px）
    // x / y / 自転 / 呼吸を独立チャンネルに。時間スケールも seed も別々なので、
    // 軌道が楕円や 8 の字に落ちず不定形に漂う。
    // w は「1 格子あたり 1/w 秒」。0.16*speed → 4〜18 秒で 1 セル。
    b.nx = { a: A, w: 0.16 * speed * R(0.8, 1.25), s: R(0, 9999) };
    b.ny = { a: A * R(0.75, 1.1), w: 0.16 * speed * R(0.8, 1.25), s: R(0, 9999) };
    b.nr = { a: (12 + dep * 22) * amp, w: 0.13 * speed * R(0.7, 1.3), s: R(0, 9999) }; // 自転（deg）
    b.ns = { a: 0.08 + dep * 0.06, w: 0.11 * speed * R(0.7, 1.3), s: R(0, 9999) }; // 呼吸

    if (cfg.center) gsap.set(b.shape, { xPercent: -50, yPercent: -50 });
    gsap.set(b.shape, {
      rotation: b.base,
      scaleX: cfg.barScroll ? cfg.barScroll[0] : 1,
    });
  });

  var FLOAT_K = 2.0; // スクロール連動パララックスの倍率
  var TURN_K = 0.6; // 図形の自転（スクロール連動）の強さ
  var RAMP = 1.8; // 秒。静止 → 自由浮遊へ滑らかに立ち上がる時間
  var STIFF = 0.09; // スクロール追従バネの剛性
  var DAMP = 0.85; // 減衰（1 に近いほど慣性が残る）

  // --- 自由浮遊の振幅をスクロール速度で駆動（活性度 act）---
  // スクロール中は振れ幅がフルに開き、手を止めるとゆっくり IDLE_K まで収縮する。
  // 0 にはしないので完全には止まらず、静かに漂い続ける。
  var IDLE_K = 0.35; // 静止時に残る振幅（フル振幅に対する比）
  // vp はページ全長で正規化された値なので、そのまま使うとページが長いほど
  // 同じ px/s でも活性度が下がってしまう。maxScroll を掛けて px/frame に戻し、
  // 「この速度でフルに開く」を px/s で指定する（60fps 基準）。
  var ACT_FULL_PXPS = 400; // この速度以上のスクロールで振幅がフルに開く
  var ACT_ATTACK = 0.18; // 立ち上がり（大きいほど即反応。約 0.1 秒で追従）
  var ACT_RELEASE = 0.012; // 収まり（小さいほどゆっくり収縮。約 4 秒で静止側へ）

  // --- 合成モードの切り替え（累計スクロール量で駆動）---
  // mix-blend-mode は transition が効かず、そのまま差し替えると色が飛んで唐突に
  // 見える。そこで図形の opacity を一度落とし、底で差し替えてから戻すことで
  // 「一瞬すっと引いて別の色で戻ってくる」変化にする。
  // 上下どちらのスクロールも距離としてカウントし、静止中は絶対に切り替わらない。
  var BLEND_STEP = [1.2, 2.0]; // 次の切り替えまでの距離（画面高の倍数。毎回ランダム）
  var FADE_OUT = 0.3; // 秒。薄くなるまで
  var FADE_IN = 0.6; // 秒。戻るまで（戻りをゆっくりにして引っかかりを消す）
  var FADE_MIN = 0.3; // 底の opacity（0 にすると消えて見えるので残す）

  var maxScroll = 1;
  function measure() {
    maxScroll = Math.max(
      1,
      doc.documentElement.scrollHeight - window.innerHeight,
    );
  }
  measure();

  function scrollTop() {
    return window.pageYOffset || doc.documentElement.scrollTop || 0;
  }

  function smooth01(x) {
    x = x < 0 ? 0 : x > 1 ? 1 : x;
    return x * x * (3 - 2 * x); // smoothstep（両端で速度 0＝滑らかな立ち上がり）
  }
  var p = 0; // 平滑化スクロール drive（0..1 近傍、overshoot で外れることあり）
  var vp = 0; // その速度
  var act = 0; // 活性度 0..1（スクロール速度を非対称スムージングしたもの）
  var started = false;
  var startTime = 0;
  var prevTime = 0;

  var lastTop = 0; // 前フレームのスクロール位置（累計距離の計算用）
  var blendAcc = 0; // 前回の切り替えからの累計スクロール距離（px）
  var blendGap = 0; // 次に切り替えるまでの距離（px）。start() で決める
  var fadeT = -1; // フェード経過秒。-1 は非進行
  var fadeSwapped = false; // 今回のフェードで差し替え済みか

  // 毎フレーム（gsap.ticker、連続駆動）：スクロールのバネ追従と連続サインの自由浮遊を
  // 合成して適用。time は ticker の経過秒。env で静止→浮遊を滑らかに立ち上げる。
  function frame(time) {
    if (startTime === 0) startTime = time;
    var t = time - startTime;
    var dt = Math.min(0.1, t - prevTime); // タブ復帰時の巨大な dt を切り詰める
    prevTime = t;
    var env = smooth01(t / RAMP);

    // スクロール追従（減衰バネ＝物理的な慣性・緩急）
    var top = scrollTop();
    var target = top / maxScroll;
    vp = (vp + (target - p) * STIFF) * DAMP;
    p += vp;

    // 累計スクロール距離が閾値を超えたら合成モードのフェード切り替えを開始。
    // 上下どちらの移動も加算するので、行ったり来たりでも進む。
    blendAcc += Math.abs(top - lastTop);
    lastTop = top;
    if (cycleBlend && fadeT < 0 && blendAcc >= blendGap) {
      blendAcc = 0;
      blendGap = R(BLEND_STEP[0], BLEND_STEP[1]) * window.innerHeight;
      fadeT = 0;
      fadeSwapped = false;
    }

    // フェードの進行。落ちきった底で blend を差し替える。
    var fade = 1;
    if (fadeT >= 0) {
      fadeT += dt;
      if (fadeT < FADE_OUT) {
        fade = 1 - (1 - FADE_MIN) * smooth01(fadeT / FADE_OUT);
      } else {
        if (!fadeSwapped) {
          cycleBlend();
          fadeSwapped = true;
        }
        var u = (fadeT - FADE_OUT) / FADE_IN;
        fade = FADE_MIN + (1 - FADE_MIN) * smooth01(u);
        if (u >= 1) fadeT = -1;
      }
    }

    // 活性度：立ち上がりは速く、収まりは遅い非対称スムージング。
    // → スクロールした瞬間にふわっと開き、止めたあとゆっくり収縮していく。
    var drive = clamp01((Math.abs(vp) * maxScroll * 60) / ACT_FULL_PXPS);
    act += (drive - act) * (drive > act ? ACT_ATTACK : ACT_RELEASE);
    // 振幅係数。act=0 でも IDLE_K 残るので完全には止まらない。
    var amp = env * (IDLE_K + (1 - IDLE_K) * act);

    for (var i = 0; i < built.length; i++) {
      var b = built[i];
      // 自由浮遊レイヤー（ノイズ駆動＝非周期だが滑らか。振れ幅は amp で伸縮）
      gsap.set(b.drift, {
        x: amp * b.nx.a * fbm(t * b.nx.w, b.nx.s),
        y: amp * b.ny.a * fbm(t * b.ny.w, b.ny.s),
        rotation: amp * b.nr.a * fbm(t * b.nr.w, b.nr.s),
        scale: 1 + amp * b.ns.a * fbm(t * b.ns.w, b.ns.s),
        // blend 差し替え時のみ 1 未満。opacity は .floater の内側に掛かるので
        // .floater 自身の mix-blend-mode は保たれる。
        opacity: fade,
      });
      // スクロール連動パララックス層
      gsap.set(b.scroll, { x: b.parX * p * FLOAT_K, y: b.parY * p * FLOAT_K });
      // 図形本体：スクロール連動の緩やかな自転（bar は長さ scaleX が伸縮）
      if (b.isBar) {
        var m = b.cfg.barScroll;
        gsap.set(b.shape, {
          rotation: b.base + p * b.turn * TURN_K,
          scaleX: m[0] + (m[1] - m[0]) * clamp01(p),
        });
      } else {
        gsap.set(b.shape, { rotation: b.base + p * b.turn * TURN_K });
      }
    }
  }

  /* ---------- 作家カード画像の先読み・先デコード ----------
     loading="lazy" のままだと、フェッチ → デコード → テクスチャ転送が
     「カードがビューポートに近づいた瞬間」＝ reveal のフェードインと同じ
     タイミングに集中する。iOS はデコードが遅くメモリ逼迫時にデコード結果を
     破棄して再デコードするため、ここでスクロールが引っかかる。
     最初のスクロールを合図に、アイドル時間で 1 枚ずつ decode() まで
     済ませておき、reveal のフレームには載せない。 */
  var warmed = false;
  function warmProfileImages() {
    if (warmed) return;
    warmed = true;
    var imgs = [].slice.call(doc.querySelectorAll(".profile-card__img"));
    var idle =
      window.requestIdleCallback ||
      function (fn) {
        return setTimeout(fn, 200);
      };
    var i = 0;
    function next() {
      if (i >= imgs.length) return;
      var im = imgs[i++];
      im.loading = "eager"; // 遅延読み込みを解除してこの場で取りに行かせる
      var after = function () {
        idle(next); // 1 枚ずつ順に。同時デコードでメインスレッドを詰まらせない
      };
      if (im.decode) im.decode().then(after, after);
      else after();
    }
    idle(next);
  }

  function start() {
    if (started) return;
    started = true;
    lastTop = scrollTop(); // 開始位置を基準に累計距離を数え始める
    blendGap = R(BLEND_STEP[0], BLEND_STEP[1]) * window.innerHeight;
    warmProfileImages();
    gsap.ticker.add(frame); // 一度始まれば連続駆動（自由浮遊が滑らかに続く）
  }

  // スクロール入力で始動（それまでは完全静止）。Lenis があればその scroll も。
  if (lenis) lenis.on("scroll", start);
  window.addEventListener("scroll", start, { passive: true });
  if (scrollTop() > 0) start(); // リロードで途中位置なら即開始

  /* ---------- 4. ヒーローの登場（スタガー） ---------- */
  var heroLines = gsap.utils.toArray(".hero-line");
  var heroArtists = gsap.utils.toArray(".hero-artists li");

  // CSS 側で html.js .hero-line { opacity:0 } を敷いて FOUC を防いでいる。
  // gsap.from は「現在値（=0）」を終了値に採ってしまうため、明示的に to で 1 へ。
  gsap.set(heroLines, { opacity: 0, y: 34 });
  gsap.set(heroArtists, { opacity: 0, y: 18 });

  var tl = gsap.timeline({
    defaults: { ease: "expo.out" },
    delay: 0.15,
  });
  tl.to(heroLines, {
    y: 0,
    opacity: 1,
    duration: 1.1,
    stagger: 0.09,
  }).to(
    heroArtists,
    {
      y: 0,
      opacity: 1,
      duration: 0.7,
      stagger: 0.06,
    },
    "-=0.7",
  );
  // アニメ後は will-change を掃除（恒久レイヤー化を残さない）
  tl.set(heroLines.concat(heroArtists), { clearProps: "will-change" });

  /* ---------- 5. プロフィールカードの reveal（スタガー） ---------- */
  var cards = gsap.utils.toArray(".reveal");
  ScrollTrigger.batch(cards, {
    start: "top 85%",
    onEnter: function (batch) {
      batch.forEach(function (el, k) {
        gsap.delayedCall(k * 0.08, function () {
          el.classList.add("is-visible");
        });
      });
    },
  });

  /* ---------- 6. イベントエリアの配色切り替え ----------
     #event に入っている間だけ html に theme-event を付ける。
     配色そのものは CSS 変数（--*-rgb）で持っているので、クラスの付け外しだけで
     背景・文字・罫線・図形の色が一斉に変わる（補間は CSS の transition が担当）。
     しきい値はビューポート中央。セクションの上端／下端が中央を跨いだ時点で入れ替わる。 */
  var eventSection = doc.querySelector("#event");
  if (eventSection) {
    ScrollTrigger.create({
      trigger: eventSection,
      start: "top center",
      end: "bottom center",
      onToggle: function (self) {
        root.classList.toggle("theme-event", self.isActive);
      },
    });
  }

  /* ---------- 7. リサイズ時に基準を更新 ---------- */
  window.addEventListener("resize", function () {
    measure(); // スクロール量の最大値を測り直す
    ScrollTrigger.refresh();
  });
})();

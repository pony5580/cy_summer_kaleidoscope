/* ============================================================
   SUMMER KALEIDOSCOPE ― interactions (v4 / scroll-driven floating)
   ------------------------------------------------------------
   スクロールするまで図形は完全に静止。スクロールすると各要素が浮遊し始め、
   スクロール量（を平滑化した drive p）に応じて深度別にドリフトする。
   減衰バネで追従するため、弾くと少し行き過ぎて減衰しながら止まる＝物理的な
   慣性と緩急（加速・減速）。中心軸まわりの旋回（万華鏡的な動き）は行わない。

     .floaters__rotor   … 図形をまとめる静的コンテナ（回転はしない）
       .floater         … 位置アンカー
         .floater__scroll … 深度別パララックス移動＋緩い揺らぎ（drive 連動）
           .floater__drift … （予備レイヤー）
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
       それ以外のブラウザではアクセスごとに 10 種からランダムに 1 つ適用する。
       CSS 変数 --floater-blend をセット → .floater が参照する。 */
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
      var blend = BLENDS[Math.floor(Math.random() * BLENDS.length)];
      floatersEl.style.setProperty("--floater-blend", blend);
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
  var TAU = Math.PI * 2;

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

    // --- 自由浮遊：連続した複数サイン波の合成 ---
    // 各軸を 2 つの非整数比サインで重ねる。速度が常に連続＝停止せず滑らかに漂い、
    // 周期が噛み合わないので規則的なループに見えない。
    var dep = cfg.depth;
    var A = vmin(15 + dep * 26); // 振幅（depth が大きいほど大きく動く）
    b.fx = [
      { a: A * 0.62, w: R(0.33, 0.52), p: R(0, TAU) },
      { a: A * 0.34, w: R(0.55, 0.82), p: R(0, TAU) },
    ];
    b.fy = [
      { a: A * 0.6, w: R(0.3, 0.48), p: R(0, TAU) },
      { a: A * 0.34, w: R(0.6, 0.9), p: R(0, TAU) },
    ];
    b.fr = { a: 12 + dep * 22, w: R(0.28, 0.5), p: R(0, TAU) }; // 自転（deg）
    b.fs = { a: 0.08 + dep * 0.06, w: R(0.3, 0.55), p: R(0, TAU) }; // 呼吸

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
  function sines(list, t) {
    var s = 0;
    for (var k = 0; k < list.length; k++) {
      s += list[k].a * Math.sin(list[k].w * t + list[k].p);
    }
    return s;
  }

  var p = 0; // 平滑化スクロール drive（0..1 近傍、overshoot で外れることあり）
  var vp = 0; // その速度
  var started = false;
  var startTime = 0;

  // 毎フレーム（gsap.ticker、連続駆動）：スクロールのバネ追従と連続サインの自由浮遊を
  // 合成して適用。time は ticker の経過秒。env で静止→浮遊を滑らかに立ち上げる。
  function frame(time) {
    if (startTime === 0) startTime = time;
    var t = time - startTime;
    var env = smooth01(t / RAMP);

    // スクロール追従（減衰バネ＝物理的な慣性・緩急）
    var target = scrollTop() / maxScroll;
    vp = (vp + (target - p) * STIFF) * DAMP;
    p += vp;

    for (var i = 0; i < built.length; i++) {
      var b = built[i];
      // 自由浮遊レイヤー（連続サイン＝停止せず滑らか）
      gsap.set(b.drift, {
        x: env * sines(b.fx, t),
        y: env * sines(b.fy, t),
        rotation: env * b.fr.a * Math.sin(b.fr.w * t + b.fr.p),
        scale: 1 + env * b.fs.a * Math.sin(b.fs.w * t + b.fs.p),
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

  function start() {
    if (started) return;
    started = true;
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

  /* ---------- 6. リサイズ時に基準を更新 ---------- */
  window.addEventListener("resize", function () {
    measure(); // スクロール量の最大値を測り直す
    ScrollTrigger.refresh();
  });
})();

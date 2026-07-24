/* ============================================================
   SUMMER KALEIDOSCOPE ― interactions
   各セクションを IntersectionObserver でフェードイン。
   （ゴールドの円 / 赤いリングの浮遊は styles.css の CSS アニメで実装）
   モーション控えめ設定 (prefers-reduced-motion) を尊重。
   ============================================================ */
(function () {
  "use strict";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const reveals = document.querySelectorAll(".reveal");

  if (reduceMotion || !("IntersectionObserver" in window)) {
    reveals.forEach(function (el) { el.classList.add("is-visible"); });
  } else {
    const io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: "0px 0px -10% 0px" });

    reveals.forEach(function (el) { io.observe(el); });
  }
})();

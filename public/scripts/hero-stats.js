// @ts-nocheck
// Hero stats count-up — extracted from Hero.astro as part of the
// perf audit (Step 2, 2026-08-21). Loaded via <script src="/scripts/hero-stats.js" defer>
// at the end of the Hero component. The `defer` attribute preserves
// the original execution timing.
//
// Every line below is byte-equivalent to the original inline script
// in Hero.astro (lines 378-456 of the previous version).

// Hero stats count-up.
// Each .hero-stat__num has data-count-to="N"; on first viewport entry we
// animate from 0 → N with a pronounced ease-out so the digits glide in
// and settle instead of snapping. Honors prefers-reduced-motion by
// jumping straight to the target value. Re-entering the viewport does
// NOT replay — once is enough for a stats line.
(function () {
  const row = document.getElementById('hero-stats');
  if (!row) return;
  const nums = row.querySelectorAll('.hero-stat__num');
  if (!nums.length) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Step 7 (mobile-perf pass): on phones, skip the count-up animation
  // entirely. The 1.7-2.2s tick does ~120 digit repaints behind a
  // gradient + drop-shadow filter, in the same above-the-fold window
  // where the YouTube decoder is trying to do its work. The hero is
  // the user's first impression — the digits don't need to glide in
  // to read as "100+". Mobile width matches the CSS @media (max-width:
  // 640px) gate used by the rest of the lite-mode pass.
  const isMobile = window.matchMedia('(max-width: 640px)').matches;

  // Longer durations + a stronger ease curve makes the deceleration
  // feel like the digits are settling into place rather than ticking.
  const durationFor = (target) => (target >= 100 ? 2200 : 1700);

  // Ease-out quint: very fast start, long gentle tail into the final
  // value. Combined with the longer duration above, the last 20% of
  // the animation is almost a glide.
  const easeOutQuint = (t) => 1 - Math.pow(1 - t, 5);

  const animate = (el) => {
    const target = parseInt(el.dataset.countTo, 10) || 0;
    if (reduceMotion || isMobile || target === 0) {
      el.textContent = String(target);
      return;
    }
    const duration = durationFor(target);
    const start = performance.now();
    const tick = (now) => {
      const elapsed = now - start;
      const t = Math.min(elapsed / duration, 1);
      const value = Math.round(easeOutQuint(t) * target);
      el.textContent = String(value);
      if (t < 1) {
        requestAnimationFrame(tick);
      } else {
        // Guarantee the final frame paints exactly the target, even if
        // a rounding edge left us at target-1.
        el.textContent = String(target);
      }
    };
    requestAnimationFrame(tick);
  };

  // If the row is already in the viewport at load (short pages, refresh
  // mid-scroll), animate immediately. Otherwise wait for first entry.
  const rect = row.getBoundingClientRect();
  const inViewport = rect.top < window.innerHeight && rect.bottom > 0;

  if (inViewport) {
    nums.forEach(animate);
  } else if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          nums.forEach(animate);
          io.disconnect();
        }
      });
    }, { threshold: 0.4 });
    io.observe(row);
  } else {
    // No IO support — just show the final values.
    nums.forEach(animate);
  }
})();

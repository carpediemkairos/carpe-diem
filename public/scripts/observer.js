// @ts-nocheck
// Off-screen animation pause — extracted from Base.astro as part of the
// perf audit (Step 2, 2026-08-21). Loaded via <script src="/scripts/observer.js" defer>
// at the end of <body> in Base.astro, AFTER main.js. The `defer` attribute
// preserves the original execution timing: runs after the HTML is fully
// parsed, after main.js (which is also deferred), before DOMContentLoaded.
//
// Every line below is byte-equivalent to the original inline script
// in Base.astro (lines 1901-1966 of the previous version, including
// the Step 1 desktop-animation-pause extension). The behavior and
// all observed selectors are unchanged.

(() => {
  // Bail out on browsers without IntersectionObserver (very old) — they
  // get the unoptimized behavior, which is what they had before.
  if (!('IntersectionObserver' in window)) return;

  const rootMargin = '0px 0px -10% 0px'; // pause slightly before fully off-screen
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      // getAnimations() returns every running CSS animation on this
      // element AND its descendants. We pause the whole subtree.
      const animations = entry.target.getAnimations({ subtree: true });
      for (const anim of animations) {
        if (entry.isIntersecting) {
          // element is on screen — resume if it was paused by us
          if (anim.playState === 'paused') anim.play();
        } else {
          // element is off screen — pause (saves CPU/GPU)
          if (anim.playState === 'running') anim.pause();
        }
      }
    }
  }, { rootMargin, threshold: 0 });

  // Watch every element that might carry an animation. This is a small
  // set in our site — the things with infinite animations are:
  //   - the Background layers (aurora, grids, scanlines, noise)
  //   - the Navbar (conic, sheen, aurora drift, brand mark)
  //   - the Profile ring
  //   - the showreel cards (reel border spin, badge pulse, video progress)
  //   - the status dot pulse
  //   - glass-shine panels (continuous shine sweep)
  //   - glass-panel.glossy (wetGlossStreak continuous sheen)
  //   - featured video card (8s conic border spin — biggest card on page)
  //
  // Step 1 of the desktop perf roadmap (2026-08-21): the original list
  // only covered the background layers + hero + showreel wrapper. The
  // featured showreel card's 8s conic-border spin, the glass-shine
  // sweep, the .glossy wetGlossStreak, and the .bg-scanlines layer
  // were all running 24/7 on desktop. Mobile already killed them via
  // @media (max-width: 640px) overrides in global.css; on desktop we
  // just hook them into this same observer so they pause when the
  // user scrolls past. Visually identical — when the user is looking
  // at them, they animate; when they're scrolled off-screen, they
  // pause. Pure CPU/GPU savings.
  //
  // Rather than maintain a list, we watch the body and the most common
  // animated parents. The observer only fires on intersection changes,
  // so this is cheap.
  const targets = [
    document.body,
    document.querySelector('header#hero'),
    document.querySelector('#navbar'),
    document.querySelector('.showreel-section'),
    document.querySelector('.bg-gradient-aurora'),
    document.querySelector('.bg-grid'),
    document.querySelector('.bg-grid-fine'),
    document.querySelector('.bg-noise'),
    document.querySelector('.bg-scanlines'),
    document.querySelector('.video-card--featured'),
    document.querySelector('.glass-shine'),
    document.querySelector('.glass-panel.glossy')
  ].filter(Boolean);

  targets.forEach((el) => { if (el) observer.observe(el); });
})();

// @ts-nocheck
// Base layout main script — extracted from Base.astro as part of the
// perf audit (Step 2, 2026-08-21). Loaded via <script src="/scripts/main.js" defer>
// at the end of <body> in Base.astro. The `defer` attribute preserves the
// original execution timing: runs after the HTML is fully parsed, after
// any synchronous inline scripts in the body, before DOMContentLoaded.
//
// Every line below is byte-equivalent to the original inline script
// in Base.astro (lines 1170-1839 of the previous version). The behavior,
// the order of operations, and all global side effects are unchanged.

// -------- Reduced motion preference (declared first so handlers can use it) --------
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// -------- Reveal-on-scroll using IntersectionObserver --------
(() => {
  const els = document.querySelectorAll('.reveal, .stagger');
  if (!('IntersectionObserver' in window) || reduceMotion) {
    els.forEach(el => el.classList.add('is-visible'));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) {
        e.target.classList.add('is-visible');
        io.unobserve(e.target);
      }
    }
  }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
  els.forEach(el => io.observe(el));
})();

// -------- 3D tilt + magnetic hover (merged into one shared RAF loop) --------
// Step 10 (perf audit, 2026-08-05): previously each [data-tilt] and
// [data-magnet] element ran its own requestAnimationFrame. On a page
// with 20 cards that meant 40 concurrent RAF callbacks — fine on desktop,
// but on mid-range phones each one stutters when the cursor moves fast.
//
// Now we keep one rolling list of "dirty" elements (tilt + magnet), and
// a single shared RAF that flushes them in one pass per frame. The
// mousemove handler just marks elements dirty and schedules one frame.
// Visual behavior is identical — only the execution model changed.
//
// Effect is gated on (pointer: fine) so it ONLY runs on devices with
// a real cursor (desktop, laptops with trackpad). Touch-primary
// devices — phones, tablets, 2-in-1s in tablet mode — skip the
// whole block. There is no cursor to track on touch, the listeners
// would just be overhead, and the document-level mousemove handler
// at the bottom of this block fires on touchmove / scroll / synthetic
// WebView events on some Android builds. (pointer: fine) is the
// correct signal here, not a width check — a 1024px tablet in
// landscape reports (pointer: coarse) and stays excluded, while a
// 13" laptop with a trackpad reports (pointer: fine) and gets the
// effect.
const hasFinePointer = window.matchMedia('(pointer: fine)').matches;
if (!reduceMotion && hasFinePointer) {
  // Collect every element that needs per-frame transform updates.
  // Each entry: { el, type, max, dirty, reset }
  const animated = [];

  // Tilt cards: rotateX/rotateY follow the cursor over the card surface.
  document.querySelectorAll('[data-tilt]').forEach((el) => {
    const max = parseFloat(el.dataset.tilt) || 8;
    const entry = { el, type: 'tilt', max, dirty: false, reset: false };
    animated.push(entry);

    el.addEventListener('mousemove', (e) => {
      const r = el.getBoundingClientRect();
      entry._x = (e.clientX - r.left) / r.width  - 0.5;
      entry._y = (e.clientY - r.top)  / r.height - 0.5;
      entry.dirty = true;
    });
    el.addEventListener('mouseleave', () => {
      entry.reset = true;
      entry.dirty = true;
    });
  });

  // Magnet buttons: small translate(x, y) pulls the element toward the cursor.
  document.querySelectorAll('[data-magnet]').forEach((el) => {
    const strength = parseFloat(el.dataset.magnet) || 0.25;
    const entry = { el, type: 'magnet', strength, dirty: false, reset: false };
    animated.push(entry);

    el.addEventListener('mousemove', (e) => {
      const r = el.getBoundingClientRect();
      entry._x = e.clientX - (r.left + r.width / 2);
      entry._y = e.clientY - (r.top  + r.height / 2);
      entry.dirty = true;
    });
    el.addEventListener('mouseleave', () => {
      entry.reset = true;
      entry.dirty = true;
    });
  });

  // One shared RAF loop flushes all dirty entries per frame.
  // Idle (no hover) → loop is dormant, zero CPU cost.
  let rafScheduled = false;
  const flush = () => {
    rafScheduled = false;
    for (const entry of animated) {
      if (!entry.dirty) continue;
      entry.dirty = false;
      if (entry.reset) {
        entry.reset = false;
        entry.el.style.transform =
          entry.type === 'tilt'
            ? 'perspective(900px) rotateX(0) rotateY(0) translateZ(0)'
            : 'translate(0, 0)';
        // Drop the entry from the active set until the next hover.
        continue;
      }
      if (entry.type === 'tilt') {
        const x = entry._x, y = entry._y;
        entry.el.style.transform =
          `perspective(900px) rotateX(${(-y * entry.max).toFixed(2)}deg) rotateY(${(x * entry.max).toFixed(2)}deg) translateZ(0)`;
        entry.el.style.setProperty('--mx', ((x + 0.5) * 100) + '%');
        entry.el.style.setProperty('--my', ((y + 0.5) * 100) + '%');
      } else {
        entry.el.style.transform =
          `translate(${(entry._x * entry.strength).toFixed(2)}px, ${(entry._y * entry.strength).toFixed(2)}px)`;
      }
    }
    // If anything is still dirty (e.g. another mousemove during the flush),
    // schedule one more frame so the cursor stays glued to the element.
    if (animated.some((e) => e.dirty)) schedule();
  };
  const schedule = () => {
    if (rafScheduled) return;
    // pauseForPlayback gate: while the video lightbox is open we don't
    // want this loop consuming any CPU at all — let the video decoder
    // have it. mousemove still fires (so the dirty flags stay set), and
    // the loop resumes the moment the user closes the dialog.
    if (window.__pauseForPlayback) return;
    rafScheduled = true;
    requestAnimationFrame(flush);
  };
  // Any entry marked dirty schedules a frame. We listen at the document
  // level and forward only when the target is one of ours — but since the
  // listeners are attached directly on each element above, we just need a
  // tiny coordinator. Marking happens in the per-element handlers; here
  // we trigger the schedule whenever a frame might be needed.
  // (The simplest path: re-schedule from inside flush() if anything
  // becomes dirty during the flush — see the tail of flush() above.)
  // For first-paint hover, the per-element handler also calls schedule:
  document.addEventListener('mousemove', schedule, { passive: true });
}

// -------- Navbar scrolled state --------
const navbar = document.getElementById('navbar');
if (navbar) {
  const onScroll = () => navbar.classList.toggle('scrolled', window.scrollY > 16);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

// -------- Start a Project: focus the Main Category dropdown after scroll --------
// When the user clicks the Hero "Start a Project" CTA, smoothly scroll to the
// contact form and focus the Main Category <select>, so the dropdown becomes
// the obvious next action.
const startBtn = document.getElementById('start-project-btn');
if (startBtn) {
  startBtn.addEventListener('click', () => {
    // Defer focus until after the smooth-scroll settles (browser handles the
    // anchor jump natively for #contact). ~600ms matches the reveal transition.
    setTimeout(() => {
      const mainCategory = document.getElementById('main-category');
      if (mainCategory) {
        mainCategory.focus({ preventScroll: true });
      }
    }, 650);
  });
}

// -------- Hire Me: highlight Name + Email fields after scroll --------
// Both desktop and mobile "Hire Me" buttons scroll to the contact form. After
// the smooth-scroll settles, focus the Name field and add a temporary cyan
// glow to the Name + Email form groups so the user sees where to start.
const highlightContactFields = () => {
  // Wait ~650ms for the smooth-scroll to settle (same as Start a Project)
  setTimeout(() => {
    const nameGroup = document.getElementById('name')?.closest('.form-group');
    const emailGroup = document.getElementById('email')?.closest('.form-group');
    const nameInput = document.getElementById('name');
    [nameGroup, emailGroup].forEach((g) => {
      if (!g) return;
      g.classList.add('form-highlight');
      // Auto-clear the glow after a few seconds so it doesn't linger
      setTimeout(() => g.classList.remove('form-highlight'), 4000);
    });
    // Focus the Name field so the user can start typing right away
    if (nameInput) nameInput.focus({ preventScroll: true });
  }, 650);
};
['hire-me-btn', 'mobile-hire-me-btn'].forEach((id) => {
  const btn = document.getElementById(id);
  if (btn) btn.addEventListener('click', highlightContactFields);
});

// -------- Mobile menu (fullscreen overlay) --------
const menuBtn = document.getElementById('mobile-menu-btn');
const menu = document.getElementById('mobile-menu');
if (menuBtn && menu) {
  const isOpen = () => !menu.hasAttribute('hidden');
  const setMenu = (open) => {
    if (open) {
      menu.removeAttribute('hidden');
      menu.setAttribute('aria-hidden', 'false');
      // next frame so the transition runs from the closed state
      requestAnimationFrame(() => requestAnimationFrame(() => menu.classList.add('is-open')));
      document.body.style.overflow = 'hidden';
    } else {
      menu.classList.remove('is-open');
      menu.setAttribute('aria-hidden', 'true');
      setTimeout(() => menu.setAttribute('hidden', ''), 260);
      document.body.style.overflow = '';
    }
    menuBtn.setAttribute('aria-expanded', String(open));
    menuBtn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    const icon = menuBtn.querySelector('#menu-icon');
    if (icon) {
      icon.setAttribute('d', open ? 'M6 6l12 12M18 6L6 18' : 'M4 6h16M4 12h16M4 18h16');
    }
  };
  menuBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu(!isOpen());
  });
  // Close when any link inside the menu is clicked
  menu.querySelectorAll('a').forEach((el) =>
    el.addEventListener('click', () => setMenu(false))
  );
  // Close on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen()) setMenu(false);
  });
  // Resize: if the viewport becomes desktop-sized while the menu is open, close it
  window.addEventListener('resize', () => {
    if (isOpen() && window.innerWidth >= 768) setMenu(false);
  });
}

// -------- Lightbox open/close + global shim for React components --------
const lightbox = document.getElementById('lightbox');
const lightboxContent = document.getElementById('lightbox-content');
const lightboxClose = document.getElementById('lightbox-close');

// -------- Page-pause / page-resume (video playback perf) --------
// While the video lightbox is open, pause every CSS animation AND
// the tilt/magnet RAF loop on the rest of the page. The video
// decoder needs the CPU/GPU to itself — without this, on a Realme
// C 21 the conic border spin + badge pulse + 3D tilt + background
// gradients eat enough budget that YouTube stalls and re-buffers
// every ~4 seconds.
//
// We collect the animations once, pause them, then resume the same
// set on close. Skips any element inside the dialog (the iframe
// itself, the close button, the "Esc to close" hint) so the player's
// own UI keeps animating normally.
const __pausedAnimations = [];
function pausePageForPlayback() {
  if (window.__pauseForPlayback) return;
  window.__pauseForPlayback = true;
  document.querySelectorAll('body *').forEach((el) => {
    if (lightbox && lightbox.contains(el)) return;
    const anims = el.getAnimations?.({ subtree: true });
    if (!anims) return;
    for (const a of anims) {
      if (a.playState === 'running') {
        a.pause();
        __pausedAnimations.push(a);
      }
    }
  });
}
function resumePageAfterPlayback() {
  if (!window.__pauseForPlayback) return;
  window.__pauseForPlayback = false;
  for (const a of __pausedAnimations) {
    if (a.playState === 'paused') a.play();
  }
  __pausedAnimations.length = 0;
  // Kick the tilt/magnet loop back into life if the cursor was over
  // a card right before the dialog opened — dirty flags were set,
  // schedule() was just short-circuiting. One mousemove isn't needed
  // because the global mousemove listener will fire on the first
  // cursor movement after close.
}

// Build a YouTube embed iframe AND its matching loader bar, append
// both into the given parent, and wire up the iframe-load → hide-
// loader flow. Used by both the lite-embed poster path (poster's
// click handler calls this on user gesture) and the immediate-iframe
// legacy path (called right inside openLightbox). Pulled out so the
// two call sites share the param set + styling — drift between them
// was the bug the original vq=small comment was trying (and failing)
// to prevent.
//
// Returns the iframe element so the poster's click handler can use
// replaceWith(iframe) — and so the openLightbox caller can attach
// its own listener (e.g. the page-pause deferral).
function buildYoutubeIframe(videoOrYoutubeId, title, parent) {
  const iframe = document.createElement('iframe');
  // Why these params:
  //   youtube.com/embed  (NOT youtube-nocookie.com):
  //     The nocookie domain uses a cookie-less session that
  //     has a known issue on Chrome-on-Android (esp. Realme UI
  //     and older WebView builds): the player initializes,
  //     buffers 3-5 seconds, then stalls forever because it
  //     can't renegotiate the session. youtube.com uses a
  //     normal cookie session and plays cleanly. We keep the
  //     "nocookie" privacy stance via the lite-embed pattern
  //     (the iframe only loads AFTER the user clicks play,
  //     and we never set YouTube tracking cookies ourselves).
  //   enablejsapi=1 REMOVED:
  //     Opens a postMessage channel that some Android browsers
  //     mishandle when combined with autoplay=1. The player
  //     waits for a JS handshake that never arrives, then
  //     pauses to "save bandwidth" — looks exactly like
  //     infinite buffering. Not needed here (we don't talk
  //     to the iframe after creation).
  //   autoplay=1 + playsinline=1 KEPT:
  //     autoplay works because the click that opened the
  //     lightbox IS the user gesture. playsinline keeps the
  //     video inline (no auto-fullscreen on Android tap).
  //   rel=0 + modestbranding=1:
  //     Hides end-screens + YouTube logo. Cosmetic.
  iframe.src = `https://www.youtube.com/embed/${videoOrYoutubeId}?autoplay=1&rel=0&modestbranding=1&playsinline=1`;
  // No border-radius on the iframe on purpose. The parent
  // .lightbox-frame has overflow: hidden + border-radius: 1rem
  // which clips the iframe to the frame's rounded shape. Adding
  // a border-radius directly on the iframe is unreliable —
  // Chrome inconsistently honors border-radius on replaced
  // elements (iframes), and when it does honor it, the curve
  // can be 1-2px outside the frame's clip (because the frame's
  // 1px border eats into the inner radius), leaving the
  // iframe's corners peeking out past the frame's curve.
  //
  // background: #000 set explicitly to match the frame. Some
  // browsers render iframes with a white default background
  // before the embedded page paints — that white would show
  // through any transparent areas of YouTube's page and create
  // a visible color edge at the rounded corner clip.
  iframe.className = 'w-full h-full';
  iframe.style.background = '#000';
  iframe.title = title || 'YouTube video';
  iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture');
  iframe.setAttribute('allowfullscreen', '');

  // Loading bar — matches YouTube's own loading bar exactly
  // (3px, #ff0000, bottom-flush, indeterminate slide). Shows
  // while the iframe fetches base.js + player.js + playManifest
  // before its first paint. Hidden on the iframe's `load` event.
  // Why match YouTube's bar instead of our own spinner: the
  // player takes over ~1-3s later with the same exact bar in
  // the same exact position. A spinner would have to fade out
  // and be replaced by the YouTube bar, which reads as a UI
  // transition. Matching the bar reads as the player booting
  // up — the same experience the user has on youtube.com.
  //
  // Note: the loader is appended into the iframe's parent (the
  // lightbox wrap), not into the iframe itself. The caller is
  // responsible for putting the loader where it should sit
  // (sibling of the iframe, not inside it).
  const loader = document.createElement('div');
  loader.className = 'lightbox-loader lightbox-loader--pending';
  loader.setAttribute('aria-hidden', 'true');
  loader.innerHTML = '<div class="lightbox-loader__bar" aria-hidden="true"></div>';
  // After 120ms, if the iframe is still loading, fade the bar
  // in. This avoids a flash when the iframe `load` event fires
  // from browser cache (under ~100ms) — the bar never becomes
  // visible, so a snappy open stays snappy.
  const showTimer = setTimeout(() => loader.classList.remove('lightbox-loader--pending'), 120);
  // Use a one-time `load` listener. `{ once: true }` auto-removes
  // it after firing so we don't leak handlers on repeat opens.
  // Fallback: if `load` never fires (network blocked, ad-blocker
  // rewriting the iframe, etc.) the bar stays up to 8s, then we
  // give up and let the user see whatever the iframe shows.
  let loaderHidden = false;
  const hideLoader = () => {
    if (loaderHidden) return;
    loaderHidden = true;
    clearTimeout(showTimer);
    loader.classList.add('lightbox-loader--hidden');
    // Remove from the DOM after the fade so the user can't tab
    // to a now-invisible element.
    setTimeout(() => loader.remove(), 250);
  };
  iframe.addEventListener('load', hideLoader, { once: true });
  setTimeout(hideLoader, 8000);

  // Append into the parent as siblings — the loader must NOT be inside
  // the iframe (it would be hidden by the iframe document, and cross-
  // origin prevents DOM access either way).
  parent.appendChild(iframe);
  parent.appendChild(loader);
  return iframe;
}

function openLightbox(title, videoOrYoutubeId, thumbnailUrl) {
  if (!lightbox || !lightboxContent) return;
  // Reset content
  lightboxContent.innerHTML = '';
  const heading = document.createElement('p');
  heading.className = 'font-orbitron text-xs tracking-widest text-cyan mb-3 absolute top-3 left-4';
  heading.textContent = title || 'PREVIEW';
  const wrap = document.createElement('div');
  wrap.className = 'relative w-full h-full flex items-center justify-center';
  if (videoOrYoutubeId) {
    // Heuristic: a YouTube video ID is exactly 11 chars and contains
    // only [A-Za-z0-9_-]. Direct URLs (mp4/webm/etc.) start with http.
    const isYoutubeId =
      videoOrYoutubeId.length === 11 &&
      /^[A-Za-z0-9_-]+$/.test(videoOrYoutubeId) &&
      !videoOrYoutubeId.startsWith('http');
    if (isYoutubeId) {
      // LITE-EMBED PATH (perf audit, 2026-08-22):
      // When the caller passes a thumbnail URL, render the thumbnail +
      // a big centered play button instead of the iframe. The user sees
      // an instant visual (the thumbnail is already loaded by the card),
      // and the YouTube iframe is NOT created until they click play.
      // This is the entire reason the lightbox "felt slow" before —
      // YouTube's player fetches ~500 KB of JS + the playManifest
      // before it can paint its first frame (1-3s on a typical
      // connection). Showing the thumbnail eliminates that wait.
      //
      // Autoplay still works: the play-button click IS the user
      // gesture, exactly the same as the original lightbox-open click.
      // Playsinline keeps it inline on Android (no auto-fullscreen).
      //
      // Backwards compat: callers that don't pass a thumbnail (direct
      // video URLs, "coming soon" placeholders, anything else) fall
      // through to the original immediate-iframe path below.
      if (thumbnailUrl) {
        const poster = document.createElement('button');
        poster.type = 'button';
        poster.className = 'lightbox-poster';
        poster.setAttribute('aria-label', `Play ${title || 'video'}`);
        // Store the YouTube ID + title on the button so the click
        // handler (defined right below) can build the iframe without
        // needing to capture variables from the outer scope. Also
        // useful for debugging — the button tells you what it is.
        poster.dataset.ytId = videoOrYoutubeId;
        poster.dataset.ytTitle = title || '';
        poster.innerHTML = `
          <img class="lightbox-poster__img" src="${thumbnailUrl}" alt="" loading="eager" decoding="async" />
          <span class="lightbox-poster__play" aria-hidden="true">
            <svg viewBox="0 0 68 48"><path d="M66.52 7.74c-.78-2.93-2.49-5.41-5.42-6.19C55.79.13 34 0 34 0S12.21.13 6.9 1.55C3.97 2.33 2.27 4.81 1.48 7.74.06 13.05 0 24 0 24s.06 10.95 1.48 16.26c.78 2.93 2.49 5.41 5.42 6.19C12.21 47.87 34 48 34 48s21.79-.13 27.1-1.55c2.93-.78 4.64-3.26 5.42-6.19C67.94 34.95 68 24 68 24s-.06-10.95-1.48-16.26z" fill="#f00"/><path d="M45 24 27 14v20" fill="#fff"/></svg>
          </span>`;
        // Click → swap poster for iframe (autoplay). Using replaceWith
        // so the poster is gone from the DOM, not just hidden — we
        // don't want the user's next Tab to land on an invisible button.
        poster.addEventListener('click', () => {
          const ytId = poster.dataset.ytId;
          const ytTitle = poster.dataset.ytTitle || 'YouTube video';
          // Build the iframe + loader as siblings inside `wrap` (the
          // poster's parent). replaceWith below moves the iframe into
          // the poster's slot — the loader stays where buildYoutubeIframe
          // appended it, also inside wrap, right next to the iframe.
          const iframe = buildYoutubeIframe(ytId, ytTitle, wrap);
          poster.replaceWith(iframe);
          // Now that the iframe exists, the page-pause walk can run.
          // Same defer-to-load pattern as the immediate-iframe path below.
          const doPause = () => pausePageForPlayback();
          iframe.addEventListener('load', doPause, { once: true });
          setTimeout(doPause, 1200);
        }, { once: true });
        wrap.appendChild(poster);
      } else {
        // IMMEDIATE-IFRAME PATH (legacy callers, e.g. direct video URLs
        // and any caller that didn't pass a thumbnail). Same as before
        // — iframe is built right now and the page-pause walk is
        // deferred until it fires `load`.
        buildYoutubeIframe(videoOrYoutubeId, title, wrap);
      }
    } else {
      // Direct video URL (mp4, webm, etc.)
      const v = document.createElement('video');
      // No border-radius on the video — the parent .lightbox-frame
      // clips to its own 1rem curve. Same reason as the iframe above.
      // background: #000 matches the frame so any transparent areas
      // blend seamlessly.
      v.className = 'w-full h-full object-cover';
      v.style.background = '#000';
      v.src = videoOrYoutubeId;
      v.controls = true;
      v.autoplay = true;
      v.playsInline = true;
      wrap.appendChild(v);
    }
  } else {
    const msg = document.createElement('p');
    msg.className = 'font-orbitron text-sm tracking-widest text-silver';
    msg.textContent = 'VIDEO COMING SOON';
    wrap.appendChild(msg);
  }
  lightboxContent.appendChild(wrap);
  lightboxContent.appendChild(heading);
  // OPEN — native <dialog> (perf audit Step 14, 2026-08-05).
  // The browser handles focus trap, ESC-to-close, inert background,
  // click-outside-to-close, and ARIA for free.
  lightbox.showModal();
  document.body.style.overflow = 'hidden';
  // Defer pausePageForPlayback until the iframe fires `load`, so the
  // page-pause walk (which does `document.querySelectorAll('body *')`
  // + `el.getAnimations({ subtree: true })` on every node — ~100-400ms
  // on a busy page) doesn't block the main thread during the click-to-
  // first-paint window. The video decoder is competing for the same
  // main thread; the walk loses to it.
  //
  // If we never reach the iframe branch (direct video URL or "coming
  // soon"), fall through to a setTimeout so the walk still happens
  // shortly after the dialog opens — better to pause 100ms late than
  // never. The 1.2s fallback is a safety net for the rare case where
  // the iframe `load` event never fires (network blocked, ad-blocker
  // rewriting the iframe, etc.) — at that point the video is unlikely
  // to play, so we just pause to recover whatever CPU we can.
  let didPause = false;
  const doPause = () => {
    if (didPause) return;
    didPause = true;
    pausePageForPlayback();
  };
  // Three cases:
  //   1. Lite-embed poster in the wrap → user hasn't clicked play yet,
  //      so the page-pause walk is wired up in the poster's own click
  //      handler (above). Do nothing here.
  //   2. Immediate iframe in the wrap → defer the walk until the
  //      iframe fires `load`, with a 1.2s safety net.
  //   3. Neither (direct video URL or "coming soon") → no iframe to
  //      listen for, so pause on the next tick. Better late than never.
  if (wrap.querySelector('.lightbox-poster')) {
    // Lite-embed: the pause is owned by the poster's click handler.
  } else if (wrap.querySelector('iframe')) {
    wrap.querySelector('iframe').addEventListener('load', doPause, { once: true });
    setTimeout(doPause, 1200);
  } else {
    setTimeout(doPause, 0);
  }
}

function closeLightbox() {
  if (!lightbox || !lightboxContent) return;
  // Stop any playing video AND tear down iframes so YouTube pauses
  lightboxContent.querySelectorAll('video').forEach(v => { v.pause(); v.src = ''; });
  lightboxContent.querySelectorAll('iframe').forEach(f => f.remove());
  lightboxContent.innerHTML = '<p class="font-orbitron text-sm tracking-widest">SELECT A PROJECT TO PLAY</p>';
  // CLOSE — native <dialog> (Step 14). Restores focus + body scroll.
  lightbox.close();
  document.body.style.overflow = '';
  // Resume everything we paused when the lightbox opened.
  resumePageAfterPlayback();
}

// Expose for React / other components
window.openLightbox = openLightbox;
window.closeLightbox = closeLightbox;

// -------- Lightbox close-button auto-hide (desktop only) --------
// After 4s of mouse inactivity inside the dialog, the close button
// fades to ~25% opacity via the .idle class. Any mouse movement
// cancels the idle state instantly. Mobile (hover: none) skips
// this entirely — see the @media (hover: none) block in global.css
// which keeps the button fully opaque there.
(() => {
  const closeBtn = document.getElementById('lightbox-close');
  const lightboxEl = document.getElementById('lightbox');
  if (!closeBtn || !lightboxEl) return;

  // Bail out on touch-only devices — no hover state to fade.
  // window.matchMedia('(hover: none)') matches true on phones,
  // tablets, and any device whose primary input is touch.
  const canHover = window.matchMedia('(hover: hover)').matches;
  if (!canHover) return;

  const IDLE_MS = 4000;
  let idleTimer = 0;

  const scheduleIdle = () => {
    clearTimeout(idleTimer);
    idleTimer = window.setTimeout(() => {
      closeBtn.classList.add('idle');
    }, IDLE_MS);
  };

  const wake = () => {
    closeBtn.classList.remove('idle');
    scheduleIdle();
  };

  // Lightbox close handler already calls lightbox.close() — also
  // reset the idle state and cancel the timer.
  const observer = new MutationObserver(() => {
    if (!lightboxEl.hasAttribute('open')) {
      clearTimeout(idleTimer);
      closeBtn.classList.remove('idle');
    } else if (!closeBtn.classList.contains('idle')) {
      scheduleIdle();
    }
  });
  observer.observe(lightboxEl, { attributes: true, attributeFilter: ['open'] });

  // Any movement inside the dialog cancels idle and reschedules.
  lightboxEl.addEventListener('mousemove', wake, { passive: true });
  lightboxEl.addEventListener('mouseenter', wake, { passive: true });
})();

// -------- Lazy secondary-showreel thumbnails (Step 3, perf roadmap) --------
// The 2 below-the-fold YouTube cards in the showreel section are rendered
// with their thumbnail URL in a `data-thumb-url` attribute instead of an
// inline `style="background-image: url(...)"`. Browsers can't fetch
// anything from a data-* attribute, so the ~23 KB (mqdefault) thumbnail
// isn't requested until we set the inline style here, when the card is
// within 200px of the viewport.
//
// Why 200px and not the IO default rootMargin of 0px:
//   The secondary cards sit just below the featured card. On desktop
//   the featured card is ~600px tall, so by the time the secondary cards
//   are visible in the viewport they're usually already there — no
//   prebuffer is needed. On mobile the featured card is taller still
//   (~52% of the viewport at 16:9), and the user often swipes down
//   quickly. 200px gives a comfortable prebuffer so the image is
//   already loaded (or in-flight) by the time the card scrolls into
//   view, avoiding a blank-flash moment.
//
// Same pattern PortfolioFilter.astro uses for the 24 grid thumbs.
// IntersectionObserver support is the only browser requirement — if
// missing, we fall back to eager-load everything (no worse than before).
(() => {
  const targets = document.querySelectorAll('.yt-embed[data-thumb-url]');
  if (!targets.length) return;

  const reveal = (btn) => {
    const url = btn.getAttribute('data-thumb-url');
    if (!url) return;
    btn.style.backgroundImage = `url('${url}')`;
    btn.removeAttribute('data-thumb-url');
  };

  if (!('IntersectionObserver' in window)) {
    targets.forEach(reveal);
    return;
  }

  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) {
        reveal(e.target);
        io.unobserve(e.target);
      }
    }
  }, { rootMargin: '0px 0px 200px 0px', threshold: 0 });

  targets.forEach((btn) => io.observe(btn));

  // Safety net (matches PortfolioFilter.astro): if a card is already in
  // the viewport at load time but the observer hasn't fired yet (e.g.
  // short pages, refresh mid-scroll), force-reveal everything after 2s.
  // Without this the user would see blank cards for up to 2s.
  setTimeout(() => {
    document.querySelectorAll('.yt-embed[data-thumb-url]').forEach(reveal);
  }, 2000);
})();

// -------- Mobile showreel: progress bar + rail dot indicator --------
// On mobile (≤767px) the cover card has a thin progress bar that fills
// while the muted video plays, and the rail has a dot indicator that
// highlights the tile currently snapped into view. Both are gated on
// viewport width so desktop code paths are unaffected.
//
// Step 11 (lite-mode pass): the progress bar RAF loop is skipped on
// all small devices (≤767px). It's pure decoration (a fake 8s fill
// cycle on a static thumbnail), and requestAnimationFrame ticks at
// 60Hz on a class with a CSS transition on width — every tick
// schedules a paint even when the value only changed by 0.02%.
// The cover card stays as a static thumbnail + play button on
// every small device, not just low-end ones. The viewport check
// below already returns on desktop / tablet, so this only affects
// phones.
(() => {
  const isMobile = () => window.matchMedia('(max-width: 767px)').matches;
  if (!isMobile()) return;

  // --- Progress bar for the cover card ---
  // The video is muted/looped with no audio; we use a fake 8s cycle so
  // the bar fills smoothly and resets — matching the perceived pacing
  // of a cinematic teaser without depending on the (currently empty)
  // video src.
  //
  // Skipped on every small device (≤767px) — the cover card just
  // shows a static thumbnail. The fill div stays at its CSS
  // default (width: 0) and never animates, so the GPU/CPU is free
  // for the video decoder if the user taps play.
  return;

  // (Rail dot indicator removed 2026-08-12 — the horizontal scroll
  //  rail was replaced by a 2-col grid of secondary reels, so there
  //  is nothing left for the dots to indicate. Mobile now reads as
  //  one big featured card + a 2-up grid below.)
})();

// Showreel cards open the lightbox with the placeholder
document.querySelectorAll('.video-card').forEach((card) => {
  card.setAttribute('role', 'button');
  card.setAttribute('tabindex', '0');
  const trigger = () => {
    // If the card has a YouTubeEmbed inside it, prefer that component's
    // own thumbnail + ID. The click already routed through YouTubeEmbed's
    // document handler when the click was on the .yt-embed button itself
    // (stopPropagation blocks us), so reaching this code means the user
    // clicked somewhere else on the card — meta strip, NOW PLAYING badge,
    // padding. We still want to open the same video, just via the lite-
    // embed pattern (instant thumbnail, no 1-3s wait).
    const ytEmbedBtn = card.querySelector('.yt-embed');
    if (ytEmbedBtn) {
      const ytId = ytEmbedBtn.dataset.ytId;
      const ytTitle = ytEmbedBtn.dataset.ytTitle || card.dataset.title || 'SHOWREEL';
      const thumbUrl = ytEmbedBtn.dataset.thumbUrl || '';
      if (ytId) {
        openLightbox(ytTitle, ytId, thumbUrl);
        return;
      }
    }
    // Fallback: no YouTubeEmbed inside (or it has no ID — "coming soon").
    // Matches the pre-lite-embed behavior: show whatever the card declared.
    openLightbox(card.dataset.title || 'SHOWREEL', card.dataset.video || '');
  };
  card.addEventListener('click', (e) => {
    // Skip if the click was inside a YouTubeEmbed lite-button —
    // that handler (YouTubeEmbed.astro) opens the dialog itself and
    // calls stopPropagation. Belt-and-braces guard so the dialog
    // never shows "VIDEO COMING SOON" on top of a real YouTube play.
    if (e.target.closest('.yt-embed')) return;
    trigger();
  });
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); trigger(); }
  });
});

lightboxClose?.addEventListener('click', closeLightbox);
// Click-outside-to-close (click on the <dialog> backdrop itself — the
// inner content catches its own clicks so they don't reach here).
lightbox?.addEventListener('click', (e) => { if (e.target === lightbox) closeLightbox(); });
// <dialog> handles ESC natively and dispatches a 'close' event. Listen for
// it so we restore body scroll even when the user closes via ESC or the
// browser's own close affordance (perf audit Step 14, 2026-08-05).
lightbox?.addEventListener('close', () => { document.body.style.overflow = ''; });

// -------- Copy email to clipboard (Hero badge) --------
// The real email address is stored in `data-email` so it never appears as
// plaintext in the DOM — scrapers that only read rendered text see the
// masked version. On click, we copy the real value and flash "Copied!".
const copyEmailBtn = document.getElementById('copy-email-btn');
if (copyEmailBtn) {
  copyEmailBtn.addEventListener('click', async () => {
    const email = copyEmailBtn.getAttribute('data-email') || '';
    if (!email) return;
    const hint = document.getElementById('email-copy-hint');
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(email);
      } else {
        // Fallback for non-HTTPS / older browsers: temporary textarea
        const ta = document.createElement('textarea');
        ta.value = email;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      if (hint) {
        hint.textContent = 'Copied!';
        clearTimeout(window.__emailCopyTimer);
        window.__emailCopyTimer = setTimeout(() => { hint.textContent = 'Copy'; }, 2000);
      }
      showToast('Email copied to clipboard.');
    } catch (err) {
      console.error('Email copy failed:', err);
      showToast('Could not copy. Please email me directly.');
    }
  });
}

// -------- Contact form submit (sends to Web3Forms; shows toast) --------
const form = document.getElementById('contact-form');
const toast = document.getElementById('toast');
const toastMsg = document.getElementById('toast-message');
function showToast(msg) {
  if (!toast || !toastMsg) return;
  toastMsg.textContent = msg;
  toast.classList.remove('hidden');
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => toast.classList.add('hidden'), 4000);
}
function resetContactForm() {
  form.reset();
  const sub = document.getElementById('sub-category');
  if (sub) {
    sub.innerHTML = '<option value="">Select a main category first</option>';
    sub.disabled = true;
  }
}
if (form) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Build FormData from the form, then strip the honeypot field before
    // anything else. Real users never fill `botcheck`; bots that auto-fill
    // every input get silently dropped here on the client.
    const formData = new FormData(form);
    if (formData.get('botcheck')) {
      // Pretend success so bots can't tell they were filtered.
      showToast("Thanks! I'll reply within 24 hours.");
      resetContactForm();
      return;
    }
    formData.delete('botcheck');

    // Light client-side validation (browsers also enforce `required`,
    // but this gives a clearer message).
    const name    = (formData.get('name')    || '').toString().trim();
    const email   = (formData.get('email')   || '').toString().trim();
    const message = (formData.get('message') || '').toString().trim();
    if (!name || !email || !message) {
      showToast('Please fill in all required fields.');
      return;
    }

    // Read the Web3Forms access key from the <meta> tag in <head>.
    const accessKeyMeta = document.querySelector('meta[name="web3forms-key"]');
    const accessKey = accessKeyMeta ? accessKeyMeta.getAttribute('content') : '';
    if (!accessKey || accessKey === 'REPLACE_WITH_YOUR_ACCESS_KEY') {
      showToast('Form is not configured yet. Please email me directly.');
      return;
    }

    // Friendly metadata so the inbox email is actionable:
    // _subject  → email subject line
    // _replyto  → "Reply" in the mail client goes to the visitor
    // _template → "table" makes the email render as a clean summary
    formData.set('access_key', accessKey);
    formData.set('_subject', `New portfolio inquiry from ${name}`);
    formData.set('_replyto', email);
    formData.set('_template', 'table');
    formData.set('from_name', name);

    // Disable the submit button while the request is in flight so a
    // double-click doesn't send two copies.
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalBtnHTML = submitBtn ? submitBtn.innerHTML : '';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span>Sending…</span>';
    }

    try {
      const res = await fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        body: formData
      });
      const result = await res.json().catch(() => ({}));
      if (res.ok && result && result.success) {
        showToast(`Thanks, ${name}! I'll reply within 24 hours.`);
        resetContactForm();
      } else {
        console.error('Web3Forms error:', res.status, result);
        showToast('Something went wrong. Please email me directly.');
      }
    } catch (err) {
      console.error('Contact form submit failed:', err);
      showToast('Network error. Please email me directly.');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnHTML;
      }
    }
  });
}

// -------- Smooth scroll for in-page anchors (with reduced-motion respect) --------
// reduceMotion is declared at the top of this script
document.querySelectorAll('a[href^="#"]').forEach((a) => {
  a.addEventListener('click', (e) => {
    const id = a.getAttribute('href');
    if (!id || id === '#') return;
    const target = document.querySelector(id);
    if (!target) return;
    e.preventDefault();
    target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  });
});

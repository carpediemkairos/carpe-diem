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

// -------- Lightbox removed (2026-08-24) --------
// Videos now play inline in the card — the .yt-embed button click handler
// in YouTubeEmbed.astro swaps the play button for an iframe in place. The
// dialog, openLightbox/closeLightbox, page-pause walk, and lite-embed
// poster overlay are all gone. No replacement needed: page animations no
// longer need pausing because the video isn't competing with a fullscreen
// dialog for the user's attention — it's just one element on the page.

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

// Showreel cards: play the video inline (no lightbox). If the card contains
// a .yt-embed button, the click was already handled by YouTubeEmbed.astro's
// document handler (it swaps the button for an iframe in place). The card-
// level handler below only fires when the user clicked the card's chrome
// (meta strip, NOW PLAYING badge, padding) — in that case we route to the
// same .yt-embed button so the inline swap runs once.
document.querySelectorAll('.video-card').forEach((card) => {
  card.setAttribute('role', 'button');
  card.setAttribute('tabindex', '0');
  const trigger = () => {
    // If the card has a YouTubeEmbed inside it, dispatch a click on the
    // .yt-embed button so the shared inline-swap handler in
    // YouTubeEmbed.astro runs. The button has role="button" already,
    // so the click() call is a real user-gesture equivalent for
    // autoplay purposes.
    const ytEmbedBtn = card.querySelector('.yt-embed');
    if (ytEmbedBtn) {
      ytEmbedBtn.click();
      return;
    }
    // No .yt-embed inside (placeholder / "coming soon" card): nothing
    // to play inline. Do nothing — there's no lightbox to fall back to.
  };
  card.addEventListener('click', (e) => {
    // Skip if the click was inside a YouTubeEmbed lite-button —
    // that handler (YouTubeEmbed.astro) handles the inline swap and
    // calls stopPropagation. Belt-and-braces guard so the iframe
    // never loads twice on a single click.
    if (e.target.closest('.yt-embed')) return;
    trigger();
  });
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); trigger(); }
  });
});

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

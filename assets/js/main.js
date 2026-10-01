/* ==========================================================================
   NUVEJO — interaction layer
   Small, dependency-free, and quiet when the user prefers reduced motion.
   ========================================================================== */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $  = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  /* ------------------------------------------------------------------
     Sticky masthead
     ------------------------------------------------------------------ */
  var head = $('.masthead');
  if (head) {
    var onScroll = function () {
      head.classList.toggle('is-stuck', window.scrollY > 24);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* ------------------------------------------------------------------
     Mobile navigation drawer
     ------------------------------------------------------------------ */
  var burger = $('.burger');
  var nav    = $('.mainnav');
  var veil   = $('.nav-veil');

  function setNav(open) {
    if (!burger || !nav) return;
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    nav.classList.toggle('is-open', open);
    if (veil) veil.classList.toggle('is-on', open);
    document.body.classList.toggle('nav-locked', open);
  }

  if (burger && nav) {
    burger.addEventListener('click', function () {
      setNav(burger.getAttribute('aria-expanded') !== 'true');
    });
    if (veil) veil.addEventListener('click', function () { setNav(false); });
    nav.addEventListener('click', function (e) {
      if (e.target.closest('a')) setNav(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && burger.getAttribute('aria-expanded') === 'true') {
        setNav(false);
        burger.focus();
      }
    });
    // Reset the drawer if the viewport grows back to desktop.
    window.addEventListener('resize', function () {
      if (window.innerWidth > 860) setNav(false);
    });
  }

  /* ------------------------------------------------------------------
     Scroll reveal — staggered per group
     ------------------------------------------------------------------ */
  var revealables = $$('.rv');
  if (revealables.length) {
    if (reduced || !('IntersectionObserver' in window)) {
      revealables.forEach(function (el) { el.classList.add('in'); });
    } else {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('in');
          io.unobserve(entry.target);
        });
      }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });

      // Stagger siblings that share a parent so groups cascade rather than pop.
      var seen = new Map();
      revealables.forEach(function (el) {
        var p = el.parentElement;
        var n = seen.get(p) || 0;
        if (n) el.style.setProperty('--d', Math.min(n, 6) * 70 + 'ms');
        seen.set(p, n + 1);
        io.observe(el);
      });
    }
  }

  /* ------------------------------------------------------------------
     Hero stage — exploded view scrubbed by scroll, plus pointer parallax

     The graphic is pinned inside .stage (which stretches to the height of the
     copy column beside it), and the slabs pull apart in step with how far
     through that pinned range the page has scrolled — no timeline, so
     scrolling back up closes them again.

     The scroll handler does arithmetic only: every measurement is taken once
     up front and re-taken on resize, and all writes are batched into one
     rAF callback that touches three custom properties on a single element.
     The stylesheet derives the rest.
     ------------------------------------------------------------------ */
  var stage = $('.stage');
  var pin   = $('.stage__pin');
  var stack = $('.stack');

  if (stage && pin && stack && !reduced) {
    var mx = 0, my = 0, fan = 0;
    var raf = null, rzRaf = null;
    var mode  = 'pin';   // 'pin' on desktop, 'view' on narrow layouts
    var near  = true;    // is the stage close enough to the viewport to matter?
    var startY = 0, rangeY = 1;

    // Below this the pin hardly moves, so pinning would be a twitch rather
    // than an animation — fall back to the viewport-travel mode instead.
    var MIN_TRAVEL = 80;

    // Where the pinned graphic parks, as a fraction of the leftover viewport
    // height. Past the halfway mark, so the slabs sit low enough that there is
    // real scrolling to do before they finish opening.
    var PIN_BIAS = 0.62;

    // The fan doesn't consume the whole pinned range: it stays shut for the
    // first slice and fully open for the last, so the opening reads as a
    // deliberate move rather than something already over by the time the
    // graphic is looked at.
    var LEAD = 0.22;
    var TAIL = 0.92;

    function measure() {
      // All reads first, then all writes: mixing them forces a reflow per pass.
      var pinH   = pin.offsetHeight;
      var cs     = getComputedStyle(stage);
      var padT   = parseFloat(cs.paddingTop) || 0;
      var padB   = parseFloat(cs.paddingBottom) || 0;
      var boxTop = stage.getBoundingClientRect().top + window.scrollY + padT;
      var travel = (stage.clientHeight - padT - padB) - pinH;
      var vh     = window.innerHeight || 800;
      var wide   = window.innerWidth > 1080;

      // Park the graphic below mid-screen, but never under the masthead.
      var pinTop = Math.max(96, Math.round((vh - pinH) * PIN_BIAS));
      stage.style.setProperty('--pin-top', pinTop + 'px');

      if (wide && travel >= MIN_TRAVEL) {
        // Desktop: the graphic is held still by position:sticky while the copy
        // scrolls past, and the fan is scrubbed across that pinned stretch.
        mode = 'pin';
        var stickAt = boxTop - pinTop;
        startY = Math.max(0, stickAt);
        rangeY = Math.max(1, stickAt + travel - startY);
      } else {
        // Narrow layouts stack into one column, so the stage is only as tall as
        // the graphic and there is no spare height to pin against. Drive the
        // fan off the graphic's own climb up the viewport instead: shut as it
        // appears at the bottom edge, fully open by the time it nears the top.
        mode = 'view';
        startY = Math.max(0, boxTop - vh);
        rangeY = Math.max(1, (boxTop - vh * 0.18) - startY);
      }
    }

    function apply() {
      raf = null;
      stack.style.setProperty('--mx', mx.toFixed(4));
      stack.style.setProperty('--my', my.toFixed(4));
      stack.style.setProperty('--fan', fan.toFixed(4));
    }

    function schedule() { if (!raf) raf = requestAnimationFrame(apply); }

    function readScroll() {
      var p = (window.scrollY - startY) / rangeY;
      // Only the pinned range gets the lead-in/hold shaping; the viewport range
      // is already paced by how fast the graphic crosses the screen.
      if (mode === 'pin') p = (p - LEAD) / (TAIL - LEAD);
      fan = p < 0 ? 0 : p > 1 ? 1 : p;
      schedule();
    }

    measure();
    readScroll();

    window.addEventListener('scroll', function () {
      if (near) readScroll();
    }, { passive: true });

    // Geometry depends on the hero's height, which depends on how the copy
    // wraps — so re-measure whenever that can change.
    function remeasure() {
      if (rzRaf) cancelAnimationFrame(rzRaf);
      rzRaf = requestAnimationFrame(function () {
        rzRaf = null;
        measure();
        readScroll();
      });
    }
    window.addEventListener('resize', remeasure);
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(remeasure).catch(function () {});
    }

    // Skip the arithmetic entirely once the hero is well out of the way. The
    // margin is generous so the observer flips back on before the stage can
    // reappear, and the callback re-syncs after any scroll we sat out.
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        near = entries[0].isIntersecting;
        if (near) readScroll();
      }, { rootMargin: '50% 0px 50% 0px' }).observe(stage);
    }

    pin.addEventListener('pointermove', function (e) {
      var r = pin.getBoundingClientRect();
      mx = (e.clientX - r.left) / r.width - 0.5;
      my = (e.clientY - r.top) / r.height - 0.5;
      schedule();
    });
    pin.addEventListener('pointerleave', function () { mx = 0; my = 0; schedule(); });
  }

  /* ------------------------------------------------------------------
     Contact form — package preselect, validation, feedback
     ------------------------------------------------------------------ */
  var form = $('#enquiry');
  if (form) {
    var picked     = $('#picked');
    var pickedName = $('#picked-name');
    var pickedInp  = $('#package');

    function showPicked(value) {
      if (!picked || !pickedInp) return;
      if (!value) {
        picked.hidden = true;
        pickedInp.value = '';
        return;
      }
      pickedInp.value = value;
      if (pickedName) pickedName.textContent = value;
      picked.hidden = false;
    }

    // ?package=Business — set when arriving from a pricing card. Kept in sync
    // with the #interest options above: a value with no matching option
    // would light up the picked-package chip while leaving the select and
    // the emailed "interest" line blank.
    var q = new URLSearchParams(window.location.search).get('package');
    var allowed = ['Starter', 'Business', 'Premium'];
    if (q && allowed.indexOf(q) !== -1) {
      showPicked(q);
      var sel = $('#interest');
      if (sel) {
        var match = Array.prototype.find.call(sel.options, function (o) { return o.value === q; });
        if (match) sel.value = q;
      }
    }

    var clearBtn = $('#picked-clear');
    if (clearBtn) clearBtn.addEventListener('click', function () { showPicked(''); });

    var status   = $('#form-status');
    var formBody = $('#form-body');

    function fail(field, msg) {
      var wrap = field.closest('.field');
      if (!wrap) return;
      wrap.classList.add('is-bad');
      var err = $('.field__err', wrap);
      if (err && msg) err.textContent = msg;
      field.setAttribute('aria-invalid', 'true');
    }
    function ok(field) {
      var wrap = field.closest('.field');
      if (wrap) wrap.classList.remove('is-bad');
      field.removeAttribute('aria-invalid');
    }

    $$('input, textarea, select', form).forEach(function (f) {
      f.addEventListener('input', function () { ok(f); });
    });

    // Native constraint validation blocks the submit before the handler below
    // ever runs, so the custom messages would only be reachable with the
    // required attributes off. Worse for the consent checkbox: its real
    // <input> is transparent (see .check input in styles.css), leaving the
    // browser nothing to anchor its bubble to — the submit is refused and
    // nothing at all appears. So take the invalid event instead (capture, as
    // it doesn't bubble), suppress the native bubble, and light up the field's
    // own .field__err, whose text already sits in the markup.
    form.addEventListener('invalid', function (e) {
      e.preventDefault();
      fail(e.target);
      if (status) {
        status.hidden = false;
        status.classList.remove('is-ok');
        status.textContent = 'Please check the highlighted fields.';
      }
    }, true);

    // ?success=true — legacy fallback param, kept harmless in case it's ever
    // reached via a bookmarked or shared link.
    if (status && new URLSearchParams(window.location.search).get('success') === 'true') {
      status.hidden = false;
      status.classList.add('is-ok');
      status.textContent = "Thanks! Your message has arrived. I'll get back to you once I've read it.";
      // Drop the param so a refresh or back-navigation doesn't re-show it.
      window.history.replaceState(null, '', window.location.pathname);
    }

    var submitBtn = $('button[type="submit"]', form);

    form.addEventListener('submit', function (e) {
      // Always ours now: on success we render the confirmation in place
      // rather than letting the browser navigate anywhere at all.
      e.preventDefault();

      var name = $('#f-name'), mail = $('#f-mail'), msg = $('#f-msg'), consent = $('#f-ok');
      var bad = false;

      if (!name.value.trim())          { fail(name, 'Please enter your name.'); bad = true; } else ok(name);
      if (!/^\S+@\S+\.\S{2,}$/.test(mail.value.trim())) {
        fail(mail, 'Please enter a valid email address.'); bad = true;
      } else ok(mail);
      if (msg.value.trim().length < 10) {
        fail(msg, 'A few sentences about your plans helps me a lot.'); bad = true;
      } else ok(msg);
      // The checkbox's real <input> is visually hidden (see .check input in
      // styles.css), which is exactly the shape of element browsers tend to
      // skip when placing their native "please fill out this field" bubble —
      // so it gets the same custom fail()/ok() treatment as the text fields
      // instead of relying on native constraint validation to be seen.
      if (!consent.checked) { fail(consent, 'Please confirm the privacy policy first.'); bad = true; } else ok(consent);

      if (bad) {
        if (status) {
          status.hidden = false;
          status.classList.remove('is-ok');
          status.textContent = 'Please check the highlighted fields.';
        }
        var firstBad = $('.field.is-bad input, .field.is-bad textarea', form);
        if (firstBad) firstBad.focus();
        return;
      }

      if (submitBtn) submitBtn.disabled = true;

      // Sent as JSON to our Cloudflare Pages Function at /api/contact, which
      // relays it via the Brevo API. Netlify Forms is no longer in the
      // picture post-migration to Cloudflare Pages.
      var payload = {
        name: name.value.trim(),
        email: mail.value.trim(),
        message: msg.value.trim(),
        business: ($('#f-business') ? $('#f-business').value.trim() : ''),
        interest: ($('#interest') ? $('#interest').value : '')
      };

      fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).then(function (res) {
        if (!res.ok) throw new Error('Contact form responded with ' + res.status);
        if (formBody) formBody.hidden = true;
        if (status) {
          status.hidden = false;
          status.classList.add('is-ok');
          status.textContent = "Thanks! Your message has arrived. I'll get back to you once I've read it.";
        }
      }).catch(function () {
        if (submitBtn) submitBtn.disabled = false;
        if (status) {
          status.hidden = false;
          status.classList.remove('is-ok');
          status.textContent = 'Something went wrong — please try again in a moment.';
        }
      });
    });
  }

  /* ------------------------------------------------------------------
     Footer year
     ------------------------------------------------------------------ */
  $$('[data-year]').forEach(function (el) {
    el.textContent = String(new Date().getFullYear());
  });
})();
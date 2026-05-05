// Mobile bypass — show a simplified static preloader on small/touch devices
if (window.innerWidth <= 1024 || "ontouchstart" in window) {
  var _pl = document.getElementById('preloader');
  var _bar = document.getElementById('pl-bar-fill');
  var _logo = document.querySelector('.pl-logo-wrap');

  if (_pl && _logo) {
    // Show logo with fade-in
    _logo.style.transition = 'opacity 0.8s ease';
    _logo.style.opacity = '0';

    // Make all logo paths visible immediately
    document.querySelectorAll('#preloader svg path').forEach(function(p) {
      p.setAttribute('fill-opacity', '1');
    });

    setTimeout(function() {
      _logo.style.opacity = '1';
    }, 100);

    // Animate progress bar
    if (_bar) {
      _bar.style.transition = 'width 1.2s cubic-bezier(0.4,0,0.2,1)';
      _bar.style.width = '0%';
      setTimeout(function() { _bar.style.width = '100%'; }, 200);
    }

    // Fade out preloader
    setTimeout(function() {
      _pl.style.transition = 'opacity 0.6s ease';
      _pl.style.opacity = '0';
      setTimeout(function() {
        _pl.style.display = 'none';
        document.documentElement.classList.remove('preloader-active');
        document.body.style.overflow = 'auto';
        if (typeof window.heroTL !== 'undefined') window.heroTL.play();
      }, 650);
    }, 1800);
  } else {
    // Fallback if elements not found
    if (_pl) _pl.style.display = 'none';
    document.documentElement.classList.remove('preloader-active');
    document.body.style.overflow = 'auto';
  }
} else {
/**
 * AXYOM PRELOADER — preloader.js
 *
 * Drop-in script. Requires the matching #preloader HTML fragment
 * (from preloader.html) and preloader.css to be present on the page.
 *
 * Rendering strategy:
 *   .pl-logo-wrap is sized to match the hero wordmark (up to 960px) so the
 *   SVG always rasterises at full resolution. JS scales it down to ~420px
 *   for the preloader appearance, then animates scale back to 1 during the
 *   morph — the browser never has to upscale a low-res rasterisation.
 *
 * Animation phases:
 *   1. Stroke draw  — paths are drawn in teal, left→right with stagger.
 *   2. Wave reveal  — a masked rect sweeps left→right, revealing all fill
 *                     colours simultaneously in one smooth wave. The teal
 *                     strokes dissolve as the wave passes.
 *   3. Glow pulse   — soft teal drop-shadow pulses on the completed logo.
 *   4. Exit         — FLIP-morphs to #hero-wordmark, then plays window.heroTL.
 *                     Fallback: simple fade-scale exit when #hero-wordmark is absent.
 *
 * Public API:
 *   window.hidePreloader(callback?)
 */
(function () {
  'use strict';

  /* ─────────────────────────────────────────────
     CONFIG
  ───────────────────────────────────────────── */
  var DRAW_DURATION  = 1100;                               // Phase 1: stroke draw
  var STAGGER        = 90;                                 // per-path draw delay
  var FILL_DELAY     = DRAW_DURATION + 6 * STAGGER + 140; // gap before wave starts
  var FILL_DURATION  = 950;                                // Phase 2: wave sweep
  var EXIT_DELAY     = 3800;
  var MORPH_DURATION = 850;

  /* ─────────────────────────────────────────────
     ELEMENTS
  ───────────────────────────────────────────── */
  var preloader = document.getElementById('preloader');
  var logoWrap  = document.querySelector('.pl-logo-wrap');
  var barFill   = document.querySelector('.pl-bar-fill');
  var svg       = document.getElementById('pl-svg');

  if (!preloader || !svg) return;

  /* ─────────────────────────────────────────────
     NATURAL SIZE — measure before any transform
  ───────────────────────────────────────────── */
  var naturalRect   = logoWrap.getBoundingClientRect();
  var naturalWidth  = naturalRect.width;
  var naturalHeight = naturalRect.height;

  var apparentWidth = Math.min(420, window.innerWidth * 0.8);
  var initialScale  = naturalWidth > 0 ? (apparentWidth / naturalWidth) : 1;

  logoWrap.style.transformOrigin = 'center center';
  logoWrap.style.transform       = 'scale(' + initialScale + ')';

  /* ─────────────────────────────────────────────
     PATH ORDER
  ───────────────────────────────────────────── */
  var pathOrder = ['pl-p0','pl-p1','pl-p5','pl-p4','pl-p6','pl-p3','pl-p2'];

  var paths = pathOrder.map(function (id) {
    return document.getElementById(id);
  }).filter(Boolean);

  var originalFills = paths.map(function (p) {
    return p.getAttribute('fill');
  });

  /* ─────────────────────────────────────────────
     PHASE 1 — stroke draw
     All paths draw with a solid teal stroke. Using a solid colour (not a
     gradient URL) avoids the rendering artefact where a gradient stroke on a
     complex path shows different gradient stops at the animated leading edge,
     causing a visible flicker as dashoffset changes.
  ───────────────────────────────────────────── */
  paths.forEach(function (p, i) {
    var len = Math.ceil(p.getTotalLength());

    p.setAttribute('fill-opacity',   '0');
    p.setAttribute('stroke',         'rgba(0,178,160,0.9)');
    p.setAttribute('stroke-width',   '4');
    p.setAttribute('stroke-linejoin','round');
    p.setAttribute('stroke-linecap', 'round');
    p.setAttribute('stroke-opacity', '1');

    p.style.strokeDasharray  = String(len);
    p.style.strokeDashoffset = String(len);
  });

  requestAnimationFrame(function () {
    requestAnimationFrame(function () {
      paths.forEach(function (p, i) {
        p.style.transition =
          'stroke-dashoffset ' + DRAW_DURATION + 'ms ' +
          'cubic-bezier(0.25,0.1,0.25,1) ' + (i * STAGGER) + 'ms';
        p.style.strokeDashoffset = '0';
      });
    });
  });

  /* ─────────────────────────────────────────────
     PHASE 2 — wave colour reveal
     A <g> of cloned paths (at full fill opacity) is inserted behind the
     stroke paths and masked by #pl-fill-mask. The mask contains two rects:
       • body  — fully opaque, grows from width=0 to width=SVG_W
       • edge  — 90px gradient fade, provides a soft leading edge
     Both rects are animated via requestAnimationFrame with expo-out easing.
     The teal strokes fade out in sync with the wave.
  ───────────────────────────────────────────── */
  var fillTimer = setTimeout(function () {

    var bodyRect = document.getElementById('pl-wave-body');
    var edgeRect = document.getElementById('pl-wave-edge');

    if (!bodyRect || !edgeRect) {
      /* Fallback: simple per-path opacity if mask elements are missing */
      paths.forEach(function (p, i) {
        var delay = i * 70;
        p.style.transition = [
          'fill-opacity '   + FILL_DURATION + 'ms cubic-bezier(0.16,1,0.3,1) ' + delay + 'ms',
          'stroke-opacity ' + Math.round(FILL_DURATION * 0.75) + 'ms ease '    + delay + 'ms',
        ].join(', ');
        p.style.fillOpacity   = '1';
        p.style.strokeOpacity = '0';
      });
      return;
    }

    /* ── Build fill-reveal group (cloned paths, no stroke, masked) ── */
    var fillGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    fillGroup.setAttribute('mask', 'url(#pl-fill-mask)');

    paths.forEach(function (p, i) {
      var clone = p.cloneNode(false);  // shallow: copies all attributes
      clone.removeAttribute('id');
      clone.removeAttribute('style'); // clear inline dasharray/transition from Phase 1
      clone.setAttribute('fill',         originalFills[i] || 'white');
      clone.setAttribute('fill-opacity', '1');
      clone.setAttribute('stroke',       'none');
      fillGroup.appendChild(clone);
    });

    /* Insert BELOW the stroke paths so strokes render on top during the sweep.
       Start at opacity:0 so there is no flash on the frame of insertion — the
       browser can paint the element before the mask takes effect on some GPUs. */
    fillGroup.setAttribute('opacity', '0');
    svg.insertBefore(fillGroup, svg.firstChild);

    /* ── Fade strokes out over the full wave duration ── */
    paths.forEach(function (p) {
      p.style.transition    = 'stroke-opacity ' + FILL_DURATION + 'ms cubic-bezier(0.4,0,0.6,1)';
      p.style.strokeOpacity = '0';
    });

    /* ── Animate the wave mask ── */
    var SVG_W  = 1664;
    var EDGE_W = 90;

    function easeExpoOut(t) {
      return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
    }

    var waveStart = null;
    function stepWave(ts) {
      if (!waveStart) waveStart = ts;
      var t     = Math.min(1, (ts - waveStart) / FILL_DURATION);
      var eased = easeExpoOut(t);
      var w     = eased * (SVG_W + EDGE_W); // 0 → SVG_W + EDGE_W

      /* body covers [0 … w-EDGE_W], edge sits at [w-EDGE_W … w] */
      bodyRect.setAttribute('width', String(Math.max(0, w - EDGE_W)));
      edgeRect.setAttribute('x',     String(w - EDGE_W));

      if (t < 1) requestAnimationFrame(stepWave);
    }

    /* Make fill group visible one rAF before the wave starts, ensuring the
       mask is already applied and body width is still 0 (nothing visible). */
    requestAnimationFrame(function () {
      fillGroup.setAttribute('opacity', '1');
      requestAnimationFrame(stepWave);
    });

  }, FILL_DELAY);

  /* ─────────────────────────────────────────────
     LOADING BAR
  ───────────────────────────────────────────── */
  requestAnimationFrame(function () {
    if (barFill) barFill.classList.add('pl-bar-run');
  });

  /* ─────────────────────────────────────────────
     PHASE 4 — EXIT
  ───────────────────────────────────────────── */
  function doSimpleExit(callback) {
    preloader.classList.add('pl-exit');
    preloader.addEventListener('animationend', function () {
      preloader.style.display = 'none';
      document.documentElement.classList.remove('preloader-active');
      if (typeof callback === 'function') callback();
    }, { once: true });
  }

  function doMorphExit(callback) {
    var heroWordmark = document.getElementById('hero-wordmark');
    if (!heroWordmark || !logoWrap) { doSimpleExit(callback); return; }

    /* Ensure hero wordmark is hidden and at its final transform */
    heroWordmark.style.opacity    = '0';
    heroWordmark.style.transition = '';
    heroWordmark.style.transform  = 'none';

    /* ── FLIP measurements (done before any layout shift) ── */
    var firstRect    = logoWrap.getBoundingClientRect();
    var firstCenterX = firstRect.left + firstRect.width  / 2;
    var firstCenterY = firstRect.top  + firstRect.height / 2;

    var lastRect     = heroWordmark.getBoundingClientRect();
    var lastCenterX  = lastRect.left + lastRect.width  / 2;
    var lastCenterY  = lastRect.top  + lastRect.height / 2;

    var tx         = lastCenterX - firstCenterX;
    var ty         = lastCenterY - firstCenterY;
    var finalScale = lastRect.width / naturalWidth;
    var pinLeft    = firstCenterX - naturalWidth  / 2;
    var pinTop     = firstCenterY - naturalHeight / 2;

    /* Freeze path transitions */
    paths.forEach(function (p) { p.style.transition = 'none'; });

    logoWrap.style.cssText =
      'position:fixed;' +
      'left:'             + pinLeft      + 'px;' +
      'top:'              + pinTop       + 'px;' +
      'width:'            + naturalWidth + 'px;' +
      'margin:0;z-index:100000;filter:none;will-change:auto;' +
      'transform-origin:center center;' +
      'transform:scale(' + initialScale + ');';
    document.body.appendChild(logoWrap);

    /* Fade out dark overlay */
    preloader.style.willChange    = 'auto';
    preloader.style.transition    = 'opacity 0.65s cubic-bezier(0.4,0,0.2,1)';
    preloader.style.opacity       = '0';
    preloader.style.pointerEvents = 'none';

    /* ── Fly + scale to hero position ── */
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        logoWrap.style.transition = 'transform ' + MORPH_DURATION + 'ms cubic-bezier(0.76,0,0.24,1)';
        logoWrap.style.transform  = 'translate(' + tx + 'px,' + ty + 'px) scale(' + finalScale + ')';

        setTimeout(function () {
          /* Crossfade: hero wordmark fades in, preloader logo fades out */
          heroWordmark.style.transition = 'opacity 0.3s ease';
          heroWordmark.style.opacity    = '1';
          logoWrap.style.transition     = 'opacity 0.3s ease';
          logoWrap.style.opacity        = '0';

          setTimeout(function () {
            if (logoWrap.parentNode) logoWrap.parentNode.removeChild(logoWrap);
            preloader.style.display = 'none';
            document.documentElement.classList.remove('preloader-active');
            heroWordmark.style.transition = '';

            if (typeof window.heroTL !== 'undefined') window.heroTL.play();
            if (typeof callback === 'function') callback();
          }, 300);

        }, MORPH_DURATION + 40);
      });
    });
  }

  function doExit(callback) {
    if (document.getElementById('hero-wordmark')) {
      doMorphExit(callback);
    } else {
      doSimpleExit(callback);
    }
  }

  var exitTimer = setTimeout(function () { doExit(); }, EXIT_DELAY);

  /* ─────────────────────────────────────────────
     PUBLIC API
  ───────────────────────────────────────────── */
  window.hidePreloader = function (callback) {
    clearTimeout(fillTimer);
    clearTimeout(exitTimer);
    doExit(callback);
  };

})();
}

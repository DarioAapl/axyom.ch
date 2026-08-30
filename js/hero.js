/* ============================================================
   Axyom AI — hero 3D mark loader
   Deferred module: it never blocks first paint, and every failure
   path leaves the static <img> fallback inside #logo3d untouched,
   so the hero is complete with or without the 3D module.
   Contract:  mountLogo3D(el, opts) -> { destroy(), setProgress(t) }
   ============================================================ */

const stage = document.getElementById('logo3d');

function clamp01(n) {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/* Reuse the translated alt text already on the static fallback image. */
function stageFallbackAlt() {
  const img = stage && stage.querySelector('.stage-fallback');
  return (img && img.getAttribute('alt')) || 'Axyom logo';
}

async function boot() {
  if (!stage) return;

  let mountLogo3D;
  try {
    ({ mountLogo3D } = await import('./logo3d.js'));
  } catch (err) {
    /* Module missing or failed to parse — keep the fallback image. */
    return;
  }
  if (typeof mountLogo3D !== 'function') return;

  /* The module appends its canvas (or its own <img>) to the container; it
     never clears it. Hide our static fallback only once something real is
     actually in there — so a module that mounts but renders nothing still
     leaves a complete hero. */
  function claimStage() {
    if (stage.querySelector('canvas, img:not(.stage-fallback)')) {
      stage.classList.add('is-mounted');
    }
  }

  let handle;
  try {
    handle = mountLogo3D(stage, {
      color: '#00B2A0',
      fallbackSrc: 'Assets/axyomlogo.png',
      fallbackAlt: stageFallbackAlt(),
      onReady: claimStage
    });
  } catch (err) {
    return;
  }
  if (!handle) return;

  claimStage();
  requestAnimationFrame(function () { requestAnimationFrame(claimStage); });
  setTimeout(claimStage, 1200);

  window.addEventListener('pagehide', function () {
    try { if (typeof handle.destroy === 'function') handle.destroy(); } catch (e) {}
  }, { once: true });

  if (typeof handle.setProgress !== 'function') return;

  /* Scroll-linked progress across the hero: 0 at the top, 1 once the
     hero has scrolled away. Directly tied to the user's own scrolling,
     rAF-throttled, and never self-animating. */
  const hero = stage.closest('section') || stage.parentElement;
  let ticking = false;

  function push() {
    ticking = false;
    const h = (hero && hero.offsetHeight) || window.innerHeight || 1;
    try { handle.setProgress(clamp01(window.scrollY / h)); } catch (e) {}
  }
  function request() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(push);
  }

  window.addEventListener('scroll', request, { passive: true });
  window.addEventListener('resize', request, { passive: true });
  push();
}

boot();

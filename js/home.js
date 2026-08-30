/* ============================================================
   Axyom AI — homepage behaviour
   Classic script, deferred. No dependencies beyond translations.js
   (which defines the global LANGS object and loads before this file).
   ============================================================ */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ============================================================
     Shopify CTA target — THE ONE LINE TO FLIP
     The app is not on the Shopify App Store yet, so there is no public
     listing to link to. While this constant is empty every CTA marked
     [data-shopify-cta] keeps its markup href and sends people to the
     #contact form. Set it when the App Store listing is live and the
     same CTAs point at the listing instead — that is the only change
     needed here.
     ============================================================ */
  const SHOPIFY_LISTING_URL = ''; // set when the App Store listing is live

  if (SHOPIFY_LISTING_URL) {
    document.querySelectorAll('[data-shopify-cta]').forEach(function (a) {
      a.setAttribute('href', SHOPIFY_LISTING_URL);
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener');
    });
  }


  /* ---------- sticky header shade ---------- */
  var hdr = document.getElementById('hdr');
  var onScroll = function () {
    hdr.classList.toggle('scrolled', window.scrollY > 8);
  };
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  /* ---------- scroll reveals ----------
     The hidden state is scoped to .js-reveal, which only ever gets added
     here — so with JS off (or broken) the page renders fully visible.
     Skipped entirely when the visitor asks for reduced motion. */
  if (!reduced && 'IntersectionObserver' in window) {
    document.documentElement.classList.add('js-reveal');
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add('in');
          io.unobserve(e.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    document.querySelectorAll('.reveal').forEach(function (el) { io.observe(el); });
  }

  /* ============================================================
     i18n
     English lives inline in the HTML and is snapshotted here, so
     switching back to EN never needs a page reload.
     ============================================================ */
  var LANG_KEY = 'axyom-lang';
  var supported = { en: 1, de: 1, it: 1, fr: 1 };

  var nodes = {
    text: [].slice.call(document.querySelectorAll('[data-i18n]')),
    html: [].slice.call(document.querySelectorAll('[data-i18n-html]')),
    ph:   [].slice.call(document.querySelectorAll('[data-i18n-ph]')),
    aria: [].slice.call(document.querySelectorAll('[data-i18n-aria]')),
    alt:  [].slice.call(document.querySelectorAll('[data-i18n-alt]'))
  };

  var EN = { text: [], html: [], ph: [], aria: [], alt: [] };
  nodes.text.forEach(function (el) { EN.text.push(el.textContent); });
  nodes.html.forEach(function (el) { EN.html.push(el.innerHTML); });
  nodes.ph.forEach(function (el) { EN.ph.push(el.placeholder); });
  nodes.aria.forEach(function (el) { EN.aria.push(el.getAttribute('aria-label')); });
  nodes.alt.forEach(function (el) { EN.alt.push(el.getAttribute('alt')); });

  function dict(lang) {
    return (typeof LANGS !== 'undefined' && LANGS && LANGS[lang]) ? LANGS[lang] : null;
  }

  /* translate strings generated at runtime (form feedback) */
  function tr(key, fallback) {
    var t = dict(document.documentElement.lang || 'en');
    return (t && t[key]) || fallback;
  }

  function applyLang(lang) {
    if (!supported[lang]) lang = 'en';
    var t = dict(lang);
    if (lang !== 'en' && !t) lang = 'en';

    document.documentElement.lang = lang;
    try { localStorage.setItem(LANG_KEY, lang); } catch (e) {}
    document.querySelectorAll('.lang button').forEach(function (b) {
      var on = b.dataset.l === lang;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });

    nodes.text.forEach(function (el, i) {
      var v = t && t[el.dataset.i18n];
      el.textContent = v || EN.text[i];
    });
    nodes.html.forEach(function (el, i) {
      var v = t && t[el.dataset.i18nHtml];
      el.innerHTML = v || EN.html[i];
    });
    nodes.ph.forEach(function (el, i) {
      var v = t && t[el.dataset.i18nPh];
      el.placeholder = v || EN.ph[i];
    });
    nodes.aria.forEach(function (el, i) {
      var v = t && t[el.dataset.i18nAria];
      el.setAttribute('aria-label', v || EN.aria[i]);
    });
    nodes.alt.forEach(function (el, i) {
      var v = t && t[el.dataset.i18nAlt];
      el.setAttribute('alt', v || EN.alt[i]);
    });

    syncCompareLabels();
  }

  document.querySelectorAll('.lang button').forEach(function (b) {
    b.addEventListener('click', function () { applyLang(b.dataset.l); });
  });

  /* ---------- comparison table: mobile row labels ----------
     The stacked mobile layout prints each column heading via
     content:attr(data-label); mirror the translated <th> text into it. */
  function syncCompareLabels() {
    var table = document.getElementById('cmp-table');
    if (!table) return;
    var heads = table.querySelectorAll('thead th');
    if (heads.length < 3) return;
    table.querySelectorAll('tbody tr').forEach(function (row) {
      row.querySelectorAll('td').forEach(function (cell, i) {
        cell.setAttribute('data-label', heads[i + 1].textContent.trim());
      });
    });
  }

  var saved = null;
  try { saved = localStorage.getItem(LANG_KEY); } catch (e) {}
  applyLang(saved && supported[saved] ? saved : 'en');

  /* ============================================================
     Mobile navigation
     ============================================================ */
  var menuBtn = document.getElementById('menu-btn');
  var mobileNav = document.getElementById('mobile-nav');

  function setMenu(open) {
    menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    mobileNav.hidden = !open;
  }
  menuBtn.addEventListener('click', function () {
    setMenu(menuBtn.getAttribute('aria-expanded') !== 'true');
  });
  mobileNav.querySelectorAll('a').forEach(function (a) {
    a.addEventListener('click', function () { setMenu(false); });
  });
  window.addEventListener('resize', function () {
    if (window.innerWidth > 860) setMenu(false);
  });

  /* ============================================================
     Modals (Impressum / Privacy)
     ============================================================ */
  var opener = null;
  var FOCUSABLE = 'a[href],button:not([disabled]),input,textarea,select,[tabindex]:not([tabindex="-1"])';

  function openModal(id) {
    var bg = document.getElementById('modal-' + id);
    if (!bg) return;
    opener = document.activeElement;
    bg.classList.add('open');
    document.body.style.overflow = 'hidden';
    var first = bg.querySelector(FOCUSABLE);
    if (first) first.focus();
  }
  function closeModal() {
    var any = false;
    document.querySelectorAll('.modal-bg.open').forEach(function (m) {
      m.classList.remove('open');
      any = true;
    });
    if (!any) return;
    document.body.style.overflow = '';
    if (opener && opener.focus) opener.focus();
    opener = null;
  }

  document.querySelectorAll('[data-modal]').forEach(function (b) {
    b.addEventListener('click', function () { openModal(b.dataset.modal); });
  });
  document.querySelectorAll('[data-close]').forEach(function (b) {
    b.addEventListener('click', closeModal);
  });
  document.querySelectorAll('.modal-bg').forEach(function (bg) {
    bg.addEventListener('click', function (e) { if (e.target === bg) closeModal(); });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      closeModal();
      if (menuBtn.getAttribute('aria-expanded') === 'true') {
        setMenu(false);
        menuBtn.focus();
      }
      return;
    }
    if (e.key !== 'Tab') return;
    var open = document.querySelector('.modal-bg.open');
    if (!open) return;
    var items = [].slice.call(open.querySelectorAll(FOCUSABLE));
    if (!items.length) return;
    var first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  /* ============================================================
     Contact form -> existing api.axyom.ch backend
     ============================================================ */
  var send = document.getElementById('f-send');
  if (send) {
    send.addEventListener('click', function () {
      var note = document.getElementById('f-note');
      var payload = {
        name: (document.getElementById('f-name').value || ''),
        email: (document.getElementById('f-email').value || ''),
        website: (document.getElementById('f-web').value || ''),
        message: (document.getElementById('f-msg').value || '')
      };
      send.disabled = true;
      fetch('https://api.axyom.ch/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).then(function (r) {
        note.textContent = r.ok
          ? tr('cta.f.sent', "Message sent! We'll get back to you within 24 hours.")
          : tr('cta.f.err', 'Something went wrong — please email kontakt@axyom.ch directly.');
      }).catch(function () {
        note.textContent = tr('cta.f.err', 'Something went wrong — please email kontakt@axyom.ch directly.');
      }).then(function () {
        send.disabled = false;
      });
    });
  }
})();

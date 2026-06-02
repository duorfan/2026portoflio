/* =====================================================================
   Duorfan portfolio — local overrides (runtime JS)
   Loaded by every page. Each block self-checks the page context so it's
   safe to ship on all pages without dispatch logic at build time.
   ===================================================================== */

(function () {
  'use strict';

  // SHA-256 hash of the Scale Social password. Default is "duorfan2026".
  // To change: in DevTools, run
  //   crypto.subtle.digest('SHA-256', new TextEncoder().encode('your-new-password'))
  //     .then(b => console.log([...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')))
  const SCALESOCIAL_HASH = 'fa9d15378253ad7c7d8b0e7558b33d182fc8c6d9b1409ed57362eaf2997a2a9b'; // SHA-256("duorfan2026")

  // ------------------------------------------------------------------
  // 1) Name-wrapper guard (migrated from inline script in captured HTML)
  //    Idempotent: only wraps if no .name-wrapper exists yet.
  // ------------------------------------------------------------------
  function initNameWrapper() {
    const heading = document.querySelector('h1');
    if (!heading || !heading.textContent.includes('Duorfan')) return;
    if (!heading.querySelector('.name-wrapper')) {
      heading.innerHTML = heading.innerHTML.replace(
        /Duorfan(?!.*Duorfan)/,
        '<span class="name-wrapper">Duorfan<span class="hint-icon">ⓘ</span>' +
        '<span class="pronunciation-tooltip">🚪 door + 🪭 fan</span></span>'
      );
    }
    const icon = heading.querySelector('.hint-icon');
    const tooltip = heading.querySelector('.pronunciation-tooltip');
    if (!icon || !tooltip) return;
    icon.addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      tooltip.classList.toggle('active');
      if (window.innerWidth <= 768 && tooltip.classList.contains('active')) {
        setTimeout(() => tooltip.classList.remove('active'), 3000);
      }
    });
    document.addEventListener('click', function (event) {
      if (!icon.contains(event.target) && !tooltip.contains(event.target)) {
        tooltip.classList.remove('active');
      }
    });
  }

  // ------------------------------------------------------------------
  // 3) Filter bar — chip toggles + URL hash deep-linking
  // ------------------------------------------------------------------
  const FILTER_DEFS = [
    { id: '',               label: 'All' },
    { id: 'ai-build',       label: 'AI Build' },
    { id: 'ai-film',        label: 'AI Film' },
    { id: 'product-design', label: 'Product Design' },
    { id: 'ux-research',    label: 'UX Research' },
    { id: 'front-end',      label: 'Front-End' },
    { id: 'creative-tech',  label: 'Creative Tech' },
  ];

  function initFilterBar() {
    // Only mount on pages that have a filter target.
    const hasProjects = document.querySelector('[data-tags]');
    if (!hasProjects) return;
    if (document.querySelector('.filter-bar')) return;

    const hero = document.querySelector('.hero-section');
    const mountAfter = hero || document.querySelector('section');
    if (!mountAfter) return;

    const bar = document.createElement('nav');
    bar.className = 'filter-bar';
    bar.setAttribute('aria-label', 'Filter projects by capability');
    bar.innerHTML = '<span class="filter-label">Filter</span>';
    for (const def of FILTER_DEFS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'filter-chip';
      btn.dataset.filter = def.id;
      btn.setAttribute('aria-pressed', 'false');
      const count = countCards(def.id);
      if (def.id && count === 0) btn.classList.add('is-zero');
      btn.innerHTML = def.label + (def.id ? '<span class="count">' + count + '</span>' : '');
      btn.addEventListener('click', () => applyFilter(def.id, true));
      bar.appendChild(btn);
    }
    mountAfter.parentNode.insertBefore(bar, mountAfter.nextSibling);

    // Mount empty-state message right after the filter bar so it lands in the project area.
    mountEmptyState(bar);

    // Initial filter: from hash if present
    const m = (location.hash || '').match(/filter=([a-z-]+)/i);
    applyFilter(m ? m[1] : '', false);

    window.addEventListener('hashchange', () => {
      const m2 = (location.hash || '').match(/filter=([a-z-]+)/i);
      applyFilter(m2 ? m2[1] : '', false);
    });
  }

  // Renders a friendly empty-state message that appears when the active filter yields zero
  // visible cards on this page. On the home page, also offers a cross-link to the More gallery
  // (the long tail likely has matches).
  function mountEmptyState(filterBar) {
    if (document.querySelector('.filter-empty-state')) return;
    const el = document.createElement('div');
    el.className = 'filter-empty-state';
    el.innerHTML = `
      <span class="emoji">🌱</span>
      <p class="msg" id="filter-empty-msg">No matches for this filter here.</p>
      <a href="/more-projects-gallery" class="crosslink" id="filter-empty-link" style="display:none;">
        Try the More projects gallery →
      </a>`;
    filterBar.parentNode.insertBefore(el, filterBar.nextSibling);
  }

  function countCards(tagId) {
    if (!tagId) {
      return document.querySelectorAll('[data-tags]').length;
    }
    return document.querySelectorAll('[data-tags~="' + tagId + '"]').length;
  }

  function applyFilter(tagId, writeHash) {
    const valid = FILTER_DEFS.some(d => d.id === tagId);
    const id = valid ? tagId : '';
    if (id) document.documentElement.setAttribute('data-filter', id);
    else document.documentElement.removeAttribute('data-filter');

    // Update pressed state on chips
    for (const btn of document.querySelectorAll('.filter-chip')) {
      btn.setAttribute('aria-pressed', String(btn.dataset.filter === id));
    }
    // Hide sections whose visible cards are all filtered out
    for (const section of document.querySelectorAll('[data-filterable-section]')) {
      const cards = section.querySelectorAll('[data-tags]');
      let anyVisible = false;
      for (const c of cards) {
        if (getComputedStyle(c).display !== 'none') { anyVisible = true; break; }
      }
      section.classList.toggle('section-empty', !anyVisible && cards.length > 0);
    }
    // Empty-state: any visible card anywhere? If not, show the message.
    const anyCardVisible = [...document.querySelectorAll('[data-tags]')].some(
      el => getComputedStyle(el).display !== 'none'
    );
    document.body.classList.toggle('is-empty-filter', !!id && !anyCardVisible);
    // If we're on the home page and a filter has zero hits here, point users at the More gallery
    // with the same filter pre-applied. (On the More page, hide the crosslink.)
    const link = document.getElementById('filter-empty-link');
    const msg = document.getElementById('filter-empty-msg');
    if (link && msg) {
      const onMore = /\/more-projects-gallery(\/|$)/.test(location.pathname);
      if (!!id && !anyCardVisible) {
        const label = (FILTER_DEFS.find(d => d.id === id) || {}).label || id;
        if (onMore) {
          msg.textContent = `No “${label}” projects in this gallery.`;
          link.style.display = 'none';
        } else {
          msg.textContent = `No “${label}” projects on the landing page.`;
          link.href = '/more-projects-gallery#filter=' + id;
          link.style.display = 'inline-flex';
        }
      }
    }
    if (writeHash) {
      const newHash = id ? ('#filter=' + id) : '';
      if (newHash !== location.hash) history.replaceState(null, '', location.pathname + location.search + newHash);
    }
  }

  // ------------------------------------------------------------------
  // 4) Scale Social password gate
  // ------------------------------------------------------------------
  async function sha256Hex(str) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function initScaleSocialGate() {
    if (!/\/scalesocial(\/|$)/.test(location.pathname)) return;
    if (sessionStorage.getItem('scaleSocialUnlocked') === '1') return;

    document.body.classList.add('gated-hidden');
    const modal = document.createElement('div');
    modal.className = 'gate-modal';
    modal.innerHTML = `
      <div class="gate-card" role="dialog" aria-labelledby="gate-title">
        <h2 id="gate-title">Protected case study</h2>
        <p>This work is shared with permission for recruiters and collaborators.<br>
           Enter the access code to continue.</p>
        <input type="password" id="gate-input" placeholder="Access code" autocomplete="off" autofocus>
        <button type="button" id="gate-submit">Unlock</button>
        <div class="gate-error" id="gate-error" aria-live="polite"></div>
        <div class="gate-hint">
          Don't have the code?
          <a href="mailto:nf2111@nyu.edu?subject=Scale%20Social%20case%20study%20access">Email Duorfan</a>
          for access.
        </div>
      </div>`;
    document.body.appendChild(modal);

    const input = modal.querySelector('#gate-input');
    const btn = modal.querySelector('#gate-submit');
    const err = modal.querySelector('#gate-error');
    const submit = async () => {
      err.textContent = '';
      const v = (input.value || '').trim();
      if (!v) return;
      const h = await sha256Hex(v);
      if (h === SCALESOCIAL_HASH) {
        sessionStorage.setItem('scaleSocialUnlocked', '1');
        modal.remove();
        document.body.classList.remove('gated-hidden');
      } else {
        err.textContent = 'That code didn\'t match. Try again or email for access.';
        input.select();
      }
    };
    btn.addEventListener('click', submit);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  }

  // ------------------------------------------------------------------
  // 5) Mornova "Live demo" pill — wire pulse to the iframe wrapper
  //    (Pill markup is injected at build time; this just ensures the
  //    pulse animation is in the DOM tree and the anchor scrolls.)
  // ------------------------------------------------------------------
  function initMornovaDemoAnchor() {
    const a = document.querySelector('a[href="#mornova-demo"]');
    if (!a) return;
    a.addEventListener('click', (e) => {
      const target = document.querySelector('#mornova-demo');
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  // ------------------------------------------------------------------
  // Boot
  // ------------------------------------------------------------------
  function boot() {
    // Gate first — it hides the body before anything else runs.
    initScaleSocialGate();
    initNameWrapper();
    initFilterBar();
    initMornovaDemoAnchor();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();

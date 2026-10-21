(() => {
  'use strict';
  const INITIAL_COUNT = 6;
  const STATE_KEY = 'duorfanMoreWork';

  function start() {
    const section = document.getElementById('more-work');
    if (!section || section.dataset.moreWorkEnhanced) return;
    const cards = [...section.querySelectorAll('[data-gallery-category]')];
    const controls = section.querySelector('.more-work-controls');
    const filters = [...section.querySelectorAll('[data-work-filter]')];
    const toggle = section.querySelector('.more-work-toggle');
    const count = section.querySelector('.more-work-count');
    const empty = section.querySelector('.more-work-empty');
    if (!cards.length || !controls || !filters.length || !toggle || !count || !empty) return;

    const categories = new Set(filters.map(button => button.dataset.workFilter));
    let active = 'all';
    let expanded = false;
    const readCategory = () => {
      const value = new URL(window.location.href).searchParams.get('work') || 'all';
      return categories.has(value) ? value : 'all';
    };
    const safeFocus = element => {
      if (element && typeof element.focus === 'function') element.focus({ preventScroll: true });
    };
    const activeButton = () => filters.find(button => button.dataset.workFilter === active) || filters[0];

    function writeHistory(mode = 'push') {
      const url = new URL(window.location.href);
      if (active === 'all') url.searchParams.delete('work');
      else url.searchParams.set('work', active);
      url.hash = 'more-work';
      const previous = history.state && typeof history.state === 'object' ? history.state : {};
      const state = { ...previous, [STATE_KEY]: { expanded, category: active } };
      const next = `${url.pathname}${url.search}${url.hash}`;
      if (mode === 'replace' || next === `${location.pathname}${location.search}${location.hash}`) history.replaceState(state, '', next);
      else history.pushState(state, '', next);
    }

    function render({ announce = true, focusRevealed = false } = {}) {
      const focused = document.activeElement;
      const matching = cards.filter(card => active === 'all' || card.dataset.galleryCategory.split(/\s+/).includes(active));
      const visible = active === 'all' && !expanded ? matching.slice(0, INITIAL_COUNT) : matching;
      const visibleSet = new Set(visible);
      const hiddenFocus = cards.some(card => !visibleSet.has(card) && card.contains(focused));
      cards.forEach(card => { card.hidden = !visibleSet.has(card); });
      filters.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.workFilter === active)));
      empty.hidden = matching.length > 0;
      toggle.hidden = active !== 'all' || cards.length <= INITIAL_COUNT;
      toggle.textContent = expanded ? 'Show less' : `Show all (${cards.length})`;
      toggle.setAttribute('aria-expanded', String(expanded));
      const categoryLabel = activeButton().textContent.trim();
      const message = active === 'all'
        ? `${visible.length} of ${cards.length} projects`
        : `${matching.length} ${matching.length === 1 ? 'project' : 'projects'} · ${categoryLabel}`;
      if (!announce) count.setAttribute('aria-live', 'off');
      count.textContent = message;
      if (!announce) requestAnimationFrame(() => count.setAttribute('aria-live', 'polite'));
      if (hiddenFocus || (focused === toggle && toggle.hidden)) safeFocus(activeButton());
      if (focusRevealed && visible[INITIAL_COUNT]) safeFocus(visible[INITIAL_COUNT].querySelector('a'));
      section.dispatchEvent(new CustomEvent('portfolio:content-change', { bubbles: true, detail: { source: 'more-work' } }));
    }

    filters.forEach(button => button.addEventListener('click', () => {
      const next = button.dataset.workFilter;
      if (next === active) return;
      active = next;
      expanded = false;
      render();
      writeHistory();
    }));
    toggle.addEventListener('click', event => {
      expanded = !expanded;
      render({ focusRevealed: expanded && event.detail === 0 });
      if (!expanded) toggle.scrollIntoView({ behavior: 'auto', block: 'nearest' });
      writeHistory('replace');
    });
    window.addEventListener('popstate', event => {
      active = readCategory();
      const saved = event.state && event.state[STATE_KEY];
      expanded = !!(saved && saved.category === active && saved.expanded);
      render();
    });

    active = readCategory();
    const saved = history.state && history.state[STATE_KEY];
    expanded = !!(saved && saved.category === active && saved.expanded);
    section.dataset.moreWorkEnhanced = 'true';
    controls.hidden = false;
    render({ announce: false });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();

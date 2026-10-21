(() => {
  const aliases = { av: 'film', 'ai-film': 'film', physical: 'physical', graphic: 'visual', ui: 'product', games: 'interactive', ai: 'interactive', 'ai-build': 'interactive', 'product-design': 'product', 'ux-research': 'product', 'front-end': 'product' };
  const valid = ['product', 'interactive', 'physical', 'film', 'visual'];
  const hash = new URLSearchParams(location.hash.slice(1));
  const query = new URLSearchParams(location.search);
  const old = query.get('work') || hash.get('filter') || '';
  const category = aliases[old] || (valid.includes(old) ? old : '');
  if (/^\/more-projects-gallery\/?$/.test(location.pathname)) {
    location.replace('/' + (category ? '?work=' + category : '') + '#more-work');
    return;
  }
  let destination;
  if (hash.has('filter') || location.hash === '#creative-explorations') {
    if (category) query.set('work', category); else query.delete('work');
    destination = '#more-work';
  } else if (['#ai-builds', '#selected-project'].includes(location.hash)) destination = '#selected-work';
  else if (location.hash === '#ai-films') { query.set('work', 'film'); destination = '#more-work'; }
  if (destination) {
    history.replaceState(null, '', '/' + (query.size ? '?' + query : '') + destination);
    const jump = () => requestAnimationFrame(() => document.getElementById(destination.slice(1))?.scrollIntoView({ behavior: 'auto', block: 'start' }));
    if (document.readyState === 'loading' || document.readyState === 'interactive') document.addEventListener('DOMContentLoaded', jump, { once: true });
    else jump();
  }
})();

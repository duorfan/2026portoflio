(() => {
  const home = document.body.classList.contains('portfolio-home');
  if (!home) return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const more = document.getElementById('more-work');
  const selected = document.getElementById('selected-work');
  if (!more || !selected) return;
  [more, selected].forEach(section => section.setAttribute('tabindex', '-1'));
  // Section links use one accessible scroll, without competing Webflow handlers.
  document.addEventListener('click', event => {
    const link = event.target.closest('a[href]');
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const url = new URL(link.href, location.href);
    if (url.origin !== location.origin || url.pathname !== location.pathname || !['#selected-work', '#more-work'].includes(url.hash)) return;
    if (url.search !== location.search) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const menuButton = document.querySelector('.navbar-2 .w-nav-button');
    if (menuButton?.getAttribute('aria-expanded') === 'true') menuButton.click();
    if (location.hash !== url.hash) history.pushState(null, '', url.hash);
    const target = url.hash === '#more-work' ? more : selected;
    target.focus({ preventScroll: true });
    target.scrollIntoView({ behavior: reduced.matches ? 'auto' : 'smooth', block: 'start' });
  }, true);
  let scheduled = false;
  const update = () => {
    scheduled = false;
    const current = more.getBoundingClientRect().top <= Math.min(innerHeight * .35, 240) ? '#more-work' : '#selected-work';
    document.querySelectorAll('.nav-menu-2 a').forEach(link => {
      if (!['#selected-work', '#more-work'].includes(link.hash)) return;
      if (link.hash === current) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  };
  window.addEventListener('scroll', () => {
    if (!scheduled) { scheduled = true; requestAnimationFrame(update); }
  }, { passive: true });
  update();
})();

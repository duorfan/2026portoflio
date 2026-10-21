(() => {
  const nav = document.querySelector('.creative-case-study .cc-shared-navigation');
  if (!nav) return;
  const button = nav.querySelector('.cc-native-nav-toggle');
  const menu = nav.querySelector('#creative-navigation-menu');
  if (!button || !menu) return;
  const mobile = window.matchMedia('(max-width: 767px)');

  // This page owns its header geometry, including when shared overrides differ.
  const measure = () => document.documentElement.style.setProperty('--cc-nav-height', `${nav.offsetHeight}px`);
  let lastY = scrollY;
  let scheduled = false;
  const updatePosition = () => {
    scheduled = false;
    const delta = scrollY - lastY;
    if (scrollY < 120) document.body.classList.remove('cc-native-nav-hidden');
    else if (Math.abs(delta) > 6) document.body.classList.toggle('cc-native-nav-hidden', delta > 0);
    document.body.classList.toggle('nav-solid', scrollY > 80);
    lastY = scrollY;
  };
  window.addEventListener('scroll', () => {
    if (!scheduled) { scheduled = true; requestAnimationFrame(updatePosition); }
  }, { passive: true });
  window.addEventListener('resize', measure, { passive: true });
  if ('ResizeObserver' in window) new ResizeObserver(measure).observe(nav);
  const syncFocus = () => document.body.classList.toggle('cc-nav-focused', nav.contains(document.activeElement));
  const setOpen = (open, restoreFocus = false) => {
    open = open && mobile.matches;
    nav.classList.toggle('cc-nav-open', open);
    document.body.classList.toggle('cc-nav-open', open);
    button.setAttribute('aria-expanded', String(open));
    button.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    if (open) menu.querySelector('a[href]')?.focus({ preventScroll: true });
    else if (restoreFocus) button.focus({ preventScroll: true });
    else if (mobile.matches && menu.contains(document.activeElement)) document.activeElement.blur();
    syncFocus();
  };

  nav.classList.add('cc-nav-ready');
  document.body.classList.add('cc-nav-enhanced');
  measure();
  updatePosition();
  button.addEventListener('click', () => setOpen(button.getAttribute('aria-expanded') !== 'true', button.getAttribute('aria-expanded') === 'true'));
  menu.addEventListener('click', event => {
    if (event.target.closest('a[href]') && mobile.matches) setOpen(false, true);
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && nav.classList.contains('cc-nav-open')) {
      event.preventDefault();
      setOpen(false, true);
    }
  });
  document.addEventListener('pointerdown', event => {
    if (nav.classList.contains('cc-nav-open') && !nav.contains(event.target)) setOpen(false);
  });
  nav.addEventListener('focusin', syncFocus);
  nav.addEventListener('focusout', () => queueMicrotask(() => {
    if (!nav.contains(document.activeElement) && nav.classList.contains('cc-nav-open')) setOpen(false);
    syncFocus();
  }));
  const closeOnResize = () => setOpen(false, mobile.matches && menu.contains(document.activeElement));
  mobile.addEventListener('change', closeOnResize);
  window.addEventListener('resize', closeOnResize, { passive: true });
})();

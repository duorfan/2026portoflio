(() => {
  const dialog = document.querySelector('.cc-lightbox');
  if (!dialog || typeof dialog.showModal !== 'function') return;
  const image = dialog.querySelector('img');
  const caption = dialog.querySelector('figcaption');
  let trigger;
  document.querySelectorAll('[data-cc-image]').forEach(link => {
    link.addEventListener('click', event => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      trigger = link;
      image.src = link.href;
      image.alt = link.querySelector('img').alt;
      caption.textContent = link.closest('figure')?.querySelector('figcaption')?.textContent || image.alt;
      dialog.showModal();
      document.body.classList.add('cc-dialog-open');
    });
  });
  dialog.querySelector('button').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => {
    document.body.classList.remove('cc-dialog-open');
    image.removeAttribute('src');
    trigger?.focus({preventScroll:true});
  });
})();

// The reading guide is specific to the creative stories; reveal motion is shared
// with the portfolio's other case studies in portfolio-motion.js.
(() => {
  const page = document.querySelector('.creative-case-study');
  if (!page) return;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  // A quiet reading guide: the current chapter and a thin progress line.
  const index = page.querySelector('.cc-index');
  if (!index) return;
  const links = [...index.querySelectorAll('a[href^="#"]')];
  const chapters = links.map(link => document.getElementById(link.hash.slice(1)));
  const main = page.querySelector('main');
  let current = -1;
  let scheduled = false;
  const updateGuide = () => {
    scheduled = false;
    const threshold = Math.min(innerHeight * .3, 220);
    let active = 0;
    chapters.forEach((section, i) => { if (section && section.getBoundingClientRect().top <= threshold) active = i; });
    if (active !== current) {
      current = active;
      links.forEach((link, i) => {
        if (i === active) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      });
      const link = links[active];
      const track = link.parentElement;
      if (track.scrollWidth > track.clientWidth) {
        const left = link.offsetLeft - track.offsetLeft;
        if (left < track.scrollLeft || left + link.offsetWidth > track.scrollLeft + track.clientWidth) {
          track.scrollTo({ left: Math.max(0, left - 20), behavior: reducedMotion.matches ? 'auto' : 'smooth' });
        }
      }
    }
    const beginning = page.querySelector('.cc-hero').getBoundingClientRect().bottom + scrollY;
    const end = main.getBoundingClientRect().bottom + scrollY - innerHeight;
    const progress = Math.max(0, Math.min(1, (scrollY - beginning) / Math.max(1, end - beginning)));
    index.style.setProperty('--cc-progress', progress.toFixed(4));
  };
  const scheduleGuide = () => {
    if (!scheduled) { scheduled = true; requestAnimationFrame(updateGuide); }
  };
  window.addEventListener('scroll', scheduleGuide, { passive: true });
  window.addEventListener('resize', scheduleGuide, { passive: true });
  document.fonts?.ready.then(scheduleGuide);
  updateGuide();
})();

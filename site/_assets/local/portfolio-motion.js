(() => {
  'use strict';
  const creativeSelectors = [
    '.cc-hero-copy > *', '.cc-hero-figure', '.cc-meta > div',
    '.cc-context > *', '.cc-section-heading > *', '.cc-figure',
    '.cc-flow > div', '.cc-hardware-copy', '.cc-dep-process > article',
    '.cc-dep-story > *', '.cc-pf-build > .cc-prose', '.cc-closing', '.cc-next'
  ];
  const legacyRoots = ':is(.section-mornova, .section-ss, .section-schego, .section-cyco, .section-ver, .section-capybara, .project-content-section.black-bg .w-richtext)';
  const legacySelectors = [
    '[data-portfolio-reveal]',
    '.project-title-section .project-container > *', '.project-title-section > .project-heading > *',
    '.project-content-section:not(.black-bg) .summary-div',
    '.project-content-section:not(.black-bg) .summary-title',
    '.project-content-section:not(.black-bg) .summary-info',
    '.project-content-section:not(.black-bg) img', '.section-web-link a',
    `${legacyRoots} :is(h1, h2, h3, h4, p, blockquote, ul, ol, img, figure, .w-embed, .w-embed-youtubevideo, .w-video)`,
    '.project-title-section + section > .container > h2',
    '.project-title-section + section > .container > p',
    '.project-title-section + section > .container > div:not(.grid)',
    '.project-title-section + section > .container > .grid > .summary-div'
  ];
  const excluded = '.w-condition-invisible, .navbar-2, .footer, .other-projects-section, dialog, .gate-modal';

  function start() {
    const page = document.body;
    if (!page.matches('.creative-case-study, [data-portfolio-page]') && !page.querySelector('[data-portfolio-reveal]')) return;
    // The protected study starts its story only after the existing access gate opens.
    if (page.classList.contains('gated-hidden')) {
      const gate = new MutationObserver(() => {
        if (!page.classList.contains('gated-hidden')) { gate.disconnect(); enhance(page); }
      });
      gate.observe(page, { attributes: true, attributeFilter: ['class'] });
    } else enhance(page);
  }

  function enhance(page) {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (reducedMotion.matches || !('IntersectionObserver' in window) || typeof Element.prototype.animate !== 'function') return;
    const selectors = page.matches('.creative-case-study') ? creativeSelectors :
      page.dataset.portfolioPage === 'case-study' ? legacySelectors : ['[data-portfolio-reveal]'];
    const candidates = [...page.querySelectorAll(selectors.join(','))].filter(element => !element.closest(excluded) && (!element.closest('[hidden]') || element.closest('#more-work')));
    const candidateSet = new Set(candidates);
    const elements = candidates.filter(element => {
      // Animate a small editorial group once, never its nested paragraphs again.
      for (let parent = element.parentElement; parent && parent !== page; parent = parent.parentElement) {
        if (candidateSet.has(parent)) return false;
      }
      return true;
    });
    const pending = new Set();
    const animations = new Set();
    let observer;
    const track = animation => {
      animations.add(animation);
      animation.finished.catch(() => {}).finally(() => animations.delete(animation));
    };
    const reveal = (element, animate = true, delay = 0) => {
      pending.delete(element);
      observer?.unobserve(element);
      element.dataset.portfolioState = 'visible';
      if (!animate || reducedMotion.matches) return;
      const visual = element.matches('figure, img, .w-embed, .w-embed-youtubevideo, .w-video, [data-portfolio-reveal="card"]');
      track(element.animate([
        { opacity: 0, transform: `translate3d(0,${visual ? 30 : 20}px,0)` },
        { opacity: 1, transform: 'translate3d(0,0,0)' }
      ], { duration: visual ? 1000 : 800, delay, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'backwards' }));
      // The subtle image settle is reserved for cropped photography, never UX diagrams.
      const image = element.querySelector('.cc-image-link img');
      if (image && element.matches('.cc-hero-figure, .cc-three-images figure, .cc-wear-grid figure, .cc-materials figure, .cc-pf-fabrication figure, .cc-pf-keepsake figure, .cc-dep-panorama')) {
        track(image.animate([{ transform: 'scale(1.035)' }, { transform: 'scale(1)' }],
          { duration: 1250, delay, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'backwards' }));
      }
    };
    const revealAll = () => {
      observer?.disconnect();
      pending.forEach(element => reveal(element, false));
      animations.forEach(animation => animation.cancel());
    };
    const revealDestination = () => {
      let target;
      try { target = document.getElementById(decodeURIComponent(location.hash.slice(1))); } catch (_) { return; }
      if (target) pending.forEach(element => {
        if (target === element || target.contains(element) || element.contains(target)) reveal(element, false);
      });
    };
    try {
      observer = new IntersectionObserver(entries => {
        try {
          const rowCounts = new Map();
          entries.filter(entry => entry.isIntersecting).forEach(({ target }) => {
            const group = target.parentElement;
            const order = rowCounts.get(group) || 0;
            rowCounts.set(group, order + 1);
            reveal(target, true, innerWidth > 640 ? Math.min(order * 95, 190) : 0);
          });
        } catch (_) { revealAll(); }
      }, { rootMargin: '0px 0px -5% 0px', threshold: 0.01 });
      elements.forEach(element => {
        const bounds = element.getBoundingClientRect();
        if (bounds.height && bounds.bottom <= 0) return;
        if (bounds.height && bounds.top < innerHeight * .95) {
          // Deep links and restored scroll positions remain immediately readable.
          if (!location.hash && scrollY < 30) {
            const siblings = [...element.parentElement.children].filter(child => candidateSet.has(child));
            reveal(element, true, Math.min(siblings.indexOf(element) * 65, 220));
          }
        } else {
          pending.add(element);
          element.dataset.portfolioState = 'pending';
          observer.observe(element);
        }
      });
      revealDestination();
    } catch (_) { revealAll(); }
    document.addEventListener('focusin', event => {
      const element = event.target.closest('[data-portfolio-state="pending"]');
      if (element) reveal(element, false);
    });
    window.addEventListener('hashchange', revealDestination);
    window.addEventListener('beforeprint', revealAll);
    window.addEventListener('pageshow', event => { if (event.persisted) revealAll(); });
    reducedMotion.addEventListener('change', () => { if (reducedMotion.matches) revealAll(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();

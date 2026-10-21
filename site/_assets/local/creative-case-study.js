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

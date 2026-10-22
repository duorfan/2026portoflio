(() => {
  const states = {
    'dashboard': ['Dashboard in-progress state showing goals, programs, and campaign activity.', 'In progress / Progress toward defined goals, with program and campaign activity below.'],
    'cold-start': ['Dashboard cold-start state before content activity has begun.', 'Cold start / Orient the team before there is activity to report.'],
    'no-goals': ['Dashboard state with activity but without configured goals.', 'No goals / Show available activity without inventing a target.'],
    'single-program': ['Dashboard state for a brand with one program.', 'Single program / Keep the hierarchy useful without implying additional programs.']
  };
  const figure = document.querySelector('.ss-state-preview');
  if (!figure) return;
  const image = figure.querySelector('img');
  const link = figure.querySelector('a');
  const caption = figure.querySelector('figcaption');
  caption.setAttribute('aria-live', 'polite');
  document.querySelectorAll('[data-state]').forEach(button => button.addEventListener('click', () => {
    const key = button.dataset.state;
    document.querySelectorAll('[data-state]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    image.src = link.href = '/_assets/local/ss-' + key + '.webp';
    image.alt = states[key][0];
    link.setAttribute('aria-label', 'Enlarge: ' + states[key][0]);
    caption.textContent = states[key][1];
  }));
})();

(() => {
  'use strict';
  const stage = document.getElementById('mn-demo-stage');
  const demoSource = document.getElementById('mn-demo-source');
  const description = document.getElementById('mn-demo-description');
  if (stage && demoSource && description) {
    const demos = {
      lamp: { id: '15KDBSX7jFJIbbD8OeluvzQp-x8XT8nSY', title: 'Mornova physical lamp demonstration', poster: '/_assets/local/mornova-lamp.webp', alt: 'The finished Mornova lamp illuminated on a desk.', button: 'Watch the lamp demo', detail: 'Original recording · Opens in a new tab', description: 'The physical prototype in use, recorded during the project.' },
      dashboard: { id: '1NrXBb0FtNcpzGW6EcHTI8UtsXKu7ezDG', title: 'Mornova web dashboard demonstration', poster: '/_assets/local/mornova-cover.webp', alt: 'Mornova lamp and personality setup interface.', button: 'Watch the dashboard demo', detail: 'Original recording · Opens in a new tab', description: 'A recorded walkthrough of the web dashboard from the project documentation.' }
    };
    let active = 'lamp';
    document.querySelectorAll('[data-mn-demo]').forEach(button => {
      button.addEventListener('click', () => {
        if (button.dataset.mnDemo === active) return;
        active = button.dataset.mnDemo;
        const demo = demos[active];
        document.querySelectorAll('[data-mn-demo]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
        const poster = document.createElement('img');
        poster.src = demo.poster;
        poster.alt = demo.alt;
        const play = document.createElement('a');
        play.href = `https://drive.google.com/file/d/${demo.id}/view`;
        play.target = '_blank';
        play.rel = 'noopener';
        play.className = 'mn-play';
        const icon = document.createElement('span');
        icon.className = 'mn-play-icon'; icon.setAttribute('aria-hidden', 'true'); icon.textContent = '▶';
        const label = document.createElement('span'); label.textContent = `${demo.button} ↗`;
        const detail = document.createElement('small'); detail.textContent = demo.detail; label.append(detail);
        play.append(icon, label);
        stage.replaceChildren(poster, play);
        stage.classList.remove('mn-playing');
        description.textContent = demo.description;
        demoSource.href = `https://drive.google.com/file/d/${demo.id}/view`;
      });
    });
  }
  const launch = document.getElementById('mn-load-preview');
  launch?.addEventListener('click', () => {
    const shell = document.getElementById('mn-preview-shell');
    const frame = document.createElement('iframe');
    frame.src = '/_assets/mornova.duorfan.com/index.html';
    frame.title = 'Mornova interaction preview: personality, routine, and scripted wake-up flow';
    shell.classList.add('mn-loaded');
    shell.replaceChildren(frame);
    frame.focus();
  });
})();

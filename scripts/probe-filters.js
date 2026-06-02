// Open the home page and the More gallery, click every filter chip, and report
// which cards remain visible plus any anomalies (empty sections still visible, etc).
const CDP = require('chrome-remote-interface');

async function open(url) {
  const ws = (await (await fetch('http://localhost:9222/json/version')).json()).webSocketDebuggerUrl;
  const browser = await CDP({ target: ws });
  const { targetId } = await browser.Target.createTarget({ url: 'about:blank' });
  const client = await CDP({ port: 9222, target: targetId });
  await client.Page.enable();
  await client.Runtime.enable();
  const loaded = new Promise((r) => client.Page.loadEventFired(() => r()));
  await client.Page.navigate({ url });
  await Promise.race([loaded, new Promise((r) => setTimeout(r, 12000))]);
  await new Promise((r) => setTimeout(r, 1200));
  return { browser, client, targetId };
}
async function close({ browser, client, targetId }) {
  await client.close();
  await browser.Target.closeTarget({ targetId });
  await browser.close();
}

async function exercise(pageUrl) {
  console.log(`\n=== ${pageUrl} ===`);
  const ctx = await open(pageUrl);
  try {
    const { result } = await ctx.client.Runtime.evaluate({
      expression: `
        (async () => {
          const log = [];
          const chips = [...document.querySelectorAll('.filter-chip')];
          if (!chips.length) { log.push('NO FILTER BAR'); return log; }
          log.push('chips: ' + chips.map(c => c.dataset.filter || 'all').join(', '));
          for (const chip of chips) {
            chip.click();
            await new Promise(r => setTimeout(r, 250));
            const id = chip.dataset.filter || '(all)';
            const filter = document.documentElement.getAttribute('data-filter') || '(none)';
            const visibleCards = [...document.querySelectorAll('[data-tags]')].filter(
              el => getComputedStyle(el).display !== 'none'
            );
            const visibleSections = [...document.querySelectorAll('[data-filterable-section]')].filter(
              el => getComputedStyle(el).display !== 'none'
            ).map(s => s.id || s.className);
            // Pull just the title of each visible card (h2 or h1 inside)
            const cards = visibleCards.map(c => {
              const h = c.querySelector('h1, h2, h3') || c.querySelector('.ai-film-overlay h3');
              return (h ? h.textContent : c.textContent).trim().slice(0, 28);
            });
            log.push('  click "' + id + '" → data-filter=' + filter + ' · ' + visibleCards.length + ' cards · sections [' + visibleSections.join(',') + ']');
            log.push('    visible: ' + cards.join(' | '));
          }
          return log;
        })()
      `,
      returnByValue: true,
      awaitPromise: true,
    });
    for (const line of result.value) console.log(line);
  } finally {
    await close(ctx);
  }
}

(async () => {
  await exercise('http://localhost:5173/');
  await exercise('http://localhost:5173/more-projects-gallery');
})();

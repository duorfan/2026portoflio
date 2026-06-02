// Capture More projects gallery across breakpoints.
const CDP = require('chrome-remote-interface');
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, '..', 'diagnostics', 'screenshots');

const WIDTHS = [
  { w: 360,  h: 780,  m: true,  label: '360' },
  { w: 768,  h: 1024, m: true,  label: '768' },
  { w: 1440, h: 900,  m: false, label: '1440' },
];

(async () => {
  const ws = (await (await fetch('http://localhost:9222/json/version')).json()).webSocketDebuggerUrl;
  const browser = await CDP({ target: ws });
  const { targetId } = await browser.Target.createTarget({ url: 'about:blank' });
  const client = await CDP({ port: 9222, target: targetId });
  await client.Page.enable(); await client.Runtime.enable();

  for (const v of WIDTHS) {
    await client.Emulation.setDeviceMetricsOverride({
      width: v.w, height: v.h, deviceScaleFactor: v.m ? 2 : 1, mobile: v.m,
    });
    const loaded = new Promise((r) => client.Page.loadEventFired(() => r()));
    await client.Page.navigate({ url: 'http://localhost:5173/more-projects-gallery' });
    await Promise.race([loaded, new Promise((r) => setTimeout(r, 10000))]);
    await new Promise((r) => setTimeout(r, 2000));

    // Take a few scroll positions
    for (const [i, y] of [0, 600, 1500, 2500].entries()) {
      await client.Runtime.evaluate({ expression: `window.scrollTo(0, ${y})` });
      await new Promise((r) => setTimeout(r, 600));
      const { data } = await client.Page.captureScreenshot({ format: 'png' });
      fs.writeFileSync(path.join(OUT, `more-${v.label}-${i}.png`), Buffer.from(data, 'base64'));
    }
  }

  // Inspect the More page structure
  const { result } = await client.Runtime.evaluate({
    returnByValue: true,
    expression: `(() => {
      const cards = document.querySelectorAll('.collection-item-2');
      const section = document.querySelector('.section-selected.black-bg');
      const r = section ? section.getBoundingClientRect() : null;
      return JSON.stringify({
        cardCount: cards.length,
        sectionH: r ? Math.round(r.height) : null,
        sectionBg: section ? getComputedStyle(section).backgroundColor : null,
        cardSample: cards[0] ? {
          tag: cards[0].querySelector('.tag.scroll-right')?.textContent.trim(),
          title: cards[0].querySelector('h2, h3, .title-2')?.textContent.trim() || '(no title)',
          dataTags: cards[0].dataset.tags,
        } : null,
      }, null, 2);
    })()`,
  });
  console.log('--- MORE page structure ---');
  console.log(result.value);

  await client.close();
  await browser.Target.closeTarget({ targetId });
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });

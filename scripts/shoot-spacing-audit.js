// Capture mobile + desktop screenshots at key section boundaries for a spacing audit.
const CDP = require('chrome-remote-interface');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'diagnostics', 'screenshots');

async function bootMobile(client, w, h, mobile) {
  await client.Emulation.setDeviceMetricsOverride({
    width: w, height: h, deviceScaleFactor: mobile ? 2 : 1, mobile,
  });
  const loaded = new Promise((r) => client.Page.loadEventFired(() => r()));
  await client.Page.navigate({ url: 'http://localhost:5173/' });
  await Promise.race([loaded, new Promise((r) => setTimeout(r, 12000))]);
  await new Promise((r) => setTimeout(r, 1600));
}

async function shoot(client, label) {
  const { data } = await client.Page.captureScreenshot({ format: 'png' });
  fs.writeFileSync(path.join(OUT, `audit-${label}.png`), Buffer.from(data, 'base64'));
  console.log('wrote', `audit-${label}.png`);
}

(async () => {
  const ws = (await (await fetch('http://localhost:9222/json/version')).json()).webSocketDebuggerUrl;
  const browser = await CDP({ target: ws });
  const { targetId } = await browser.Target.createTarget({ url: 'about:blank' });
  const client = await CDP({ port: 9222, target: targetId });
  await client.Page.enable(); await client.Runtime.enable();

  // Mobile audit
  await bootMobile(client, 390, 844, true);

  // Measure key elements
  const { result } = await client.Runtime.evaluate({
    returnByValue: true,
    expression: `
      function box(sel) {
        const el = document.querySelector(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return {
          y: Math.round(r.top + window.scrollY),
          h: Math.round(r.height),
          padTop: cs.paddingTop, padBottom: cs.paddingBottom,
          marginTop: cs.marginTop, marginBottom: cs.marginBottom,
          inlineTransform: el.style.transform || null,
        };
      }
      JSON.stringify({
        hero:    box('.hero-section'),
        cube:    box('.video-grid'),
        intro:   box('.intro-container'),
        aiBuilds:       box('#ai-builds'),
        aiBuildsHead:   box('#ai-builds .secondary-heading'),
        aiBuildsSub:    box('#ai-builds .section-subtitle'),
        aiBuildsGrid:   box('.ai-builds-grid'),
        firstBuildCard: box('#ai-builds .collection-item'),
        designWork:     box('#selected-project'),
        designWorkHead: box('#selected-project .secondary-heading'),
      }, null, 2);
    `,
  });
  console.log('--- MOBILE MEASUREMENTS ---');
  console.log(result.value);

  // Scroll to AI Builds top (just past hero)
  const m = JSON.parse(result.value);
  if (m.aiBuilds) {
    await client.Runtime.evaluate({ expression: `window.scrollTo(0, ${m.aiBuilds.y - 80})` });
    await new Promise((r) => setTimeout(r, 800));
    await shoot(client, 'mobile-aibuilds-top');
  }
  // Scroll to where cards are visible
  if (m.aiBuildsGrid) {
    await client.Runtime.evaluate({ expression: `window.scrollTo(0, ${m.aiBuildsGrid.y - 100})` });
    await new Promise((r) => setTimeout(r, 800));
    await shoot(client, 'mobile-aibuilds-cards');
  }
  // Hero (cube centering check)
  await client.Runtime.evaluate({ expression: 'window.scrollTo(0, 0)' });
  await new Promise((r) => setTimeout(r, 800));
  await shoot(client, 'mobile-hero');

  await client.close();
  await browser.Target.closeTarget({ targetId });
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });

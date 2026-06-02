const CDP = require('chrome-remote-interface');
const fs = require('fs');
(async () => {
  const url = process.argv[2];
  const scrollTo = process.argv[3] || 'body';   // CSS selector to scroll into view
  const out = process.argv[4] || 'shot.png';
  const ws = (await (await fetch('http://localhost:9222/json/version')).json()).webSocketDebuggerUrl;
  const browser = await CDP({ target: ws });
  const { targetId } = await browser.Target.createTarget({ url: 'about:blank' });
  const client = await CDP({ port: 9222, target: targetId });
  const { Page, Emulation, Runtime } = client;
  await Page.enable();
  await Emulation.setDeviceMetricsOverride({ width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  const loaded = new Promise((r) => Page.loadEventFired(() => r()));
  await Page.navigate({ url });
  await Promise.race([loaded, new Promise((r) => setTimeout(r, 12000))]);
  await new Promise((r) => setTimeout(r, 1200));
  if (scrollTo !== 'body') {
    await Runtime.evaluate({
      expression: `(() => { const el = document.querySelector(${JSON.stringify(scrollTo)}); if (el) el.scrollIntoView({block: 'start'}); })()`,
    });
    await new Promise((r) => setTimeout(r, 1800));
  }
  // Force-reveal anything Webflow IX2 left at fractional opacity (animation hasn't fired yet).
  // Screenshot-only; does not affect the live site.
  await Runtime.evaluate({
    expression: `
      document.querySelectorAll('[style*="opacity"]').forEach(el => {
        const o = parseFloat(el.style.opacity || getComputedStyle(el).opacity);
        if (o >= 0 && o < 1) { el.style.opacity = '1'; el.style.transform = 'none'; }
      });
    `,
  });
  await new Promise((r) => setTimeout(r, 200));
  const { data } = await Page.captureScreenshot({ format: 'png' });
  fs.writeFileSync(out, Buffer.from(data, 'base64'));
  console.log('wrote', out);
  await client.close();
  await browser.Target.closeTarget({ targetId });
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });

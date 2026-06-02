// Mobile-viewport screenshot (375x812 — iPhone X). Args: <url> <out>
const CDP = require('chrome-remote-interface');
const fs = require('fs');
(async () => {
  const url = process.argv[2];
  const out = process.argv[3] || 'shot-mobile.png';
  const ws = (await (await fetch('http://localhost:9222/json/version')).json()).webSocketDebuggerUrl;
  const browser = await CDP({ target: ws });
  const { targetId } = await browser.Target.createTarget({ url: 'about:blank' });
  const client = await CDP({ port: 9222, target: targetId });
  const { Page, Emulation } = client;
  await Page.enable();
  await Emulation.setDeviceMetricsOverride({
    width: 390, height: 844, deviceScaleFactor: 2, mobile: true,
  });
  await Emulation.setUserAgentOverride({
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
  });
  const loaded = new Promise((r) => Page.loadEventFired(() => r()));
  await Page.navigate({ url });
  await Promise.race([loaded, new Promise((r) => setTimeout(r, 12000))]);
  await new Promise((r) => setTimeout(r, 1200));
  const { data } = await Page.captureScreenshot({ format: 'png' });
  fs.writeFileSync(out, Buffer.from(data, 'base64'));
  console.log('wrote', out);
  await client.close();
  await browser.Target.closeTarget({ targetId });
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });

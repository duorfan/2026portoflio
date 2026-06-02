const CDP = require('chrome-remote-interface');
const fs = require('fs');
(async () => {
  const ws = (await (await fetch('http://localhost:9222/json/version')).json()).webSocketDebuggerUrl;
  const browser = await CDP({ target: ws });
  const { targetId } = await browser.Target.createTarget({ url: 'about:blank' });
  const client = await CDP({ port: 9222, target: targetId });
  const { Page, Emulation, Runtime } = client;
  await Page.enable();
  await Emulation.setDeviceMetricsOverride({ width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  const loaded = new Promise((r) => Page.loadEventFired(() => r()));
  await Page.navigate({ url: process.argv[2] || 'http://localhost:5173/' });
  await Promise.race([loaded, new Promise((r) => setTimeout(r, 12000))]);
  await new Promise((r) => setTimeout(r, 1500));
  // Resize the layout viewport to capture full page
  const { cssContentSize } = await Page.getLayoutMetrics();
  await Emulation.setDeviceMetricsOverride({
    width: 1440, height: Math.ceil(cssContentSize.height), deviceScaleFactor: 1, mobile: false,
  });
  await new Promise((r) => setTimeout(r, 500));
  const { data } = await Page.captureScreenshot({ format: 'png', captureBeyondViewport: true });
  const out = process.argv[3] || 'shot-full.png';
  fs.writeFileSync(out, Buffer.from(data, 'base64'));
  console.log('wrote', out, 'height=', Math.ceil(cssContentSize.height));
  await client.close();
  await browser.Target.closeTarget({ targetId });
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });

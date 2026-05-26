// Capture a full-page screenshot of the rebuilt site for visual verification.
const CDP = require('chrome-remote-interface');
const fs = require('fs');

async function shoot(url, outPath) {
  const verRes = await fetch('http://localhost:9222/json/version');
  const browserWs = (await verRes.json()).webSocketDebuggerUrl;
  const browser = await CDP({ target: browserWs });
  const { targetId } = await browser.Target.createTarget({ url: 'about:blank' });
  const client = await CDP({ port: 9222, target: targetId });
  const { Page, Emulation } = client;
  try {
    await Page.enable();
    await Emulation.setDeviceMetricsOverride({
      width: 1440, height: 900, deviceScaleFactor: 1, mobile: false,
    });
    const loaded = new Promise((r) => Page.loadEventFired(() => r()));
    await Page.navigate({ url });
    await Promise.race([loaded, new Promise((r) => setTimeout(r, 12000))]);
    await new Promise((r) => setTimeout(r, 1500));
    const { data } = await Page.captureScreenshot({ format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(outPath, Buffer.from(data, 'base64'));
    console.log(`Wrote ${outPath} (${fs.statSync(outPath).size}b)`);
  } finally {
    await client.close();
    await browser.Target.closeTarget({ targetId });
    await browser.close();
  }
}

(async () => {
  await shoot('http://localhost:5173/', __dirname + '/screenshot-home-local.png');
  await shoot('https://www.duorfan.com/', __dirname + '/screenshot-home-live.png');
})().catch((e) => { console.error(e); process.exit(1); });

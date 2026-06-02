// Capture mobile and desktop scroll states for the navbar/filter UX verification.
// Args: none (uses fixed URL + scroll positions, writes into diagnostics/screenshots).
const CDP = require('chrome-remote-interface');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'diagnostics', 'screenshots');
fs.mkdirSync(OUT, { recursive: true });

async function shoot(client, scrollY, out, mobile) {
  await client.Emulation.setDeviceMetricsOverride({
    width: mobile ? 390 : 1440,
    height: mobile ? 844 : 900,
    deviceScaleFactor: mobile ? 2 : 1,
    mobile,
  });
  const loaded = new Promise((r) => client.Page.loadEventFired(() => r()));
  await client.Page.navigate({ url: 'http://localhost:5173/' });
  await Promise.race([loaded, new Promise((r) => setTimeout(r, 10000))]);
  await new Promise((r) => setTimeout(r, 1500));
  await client.Runtime.evaluate({ expression: `window.scrollTo(0, ${scrollY})` });
  await new Promise((r) => setTimeout(r, 900));
  const { data } = await client.Page.captureScreenshot({ format: 'png' });
  fs.writeFileSync(out, Buffer.from(data, 'base64'));
  console.log('wrote', out);
}

(async () => {
  const ws = (await (await fetch('http://localhost:9222/json/version')).json()).webSocketDebuggerUrl;
  const browser = await CDP({ target: ws });
  const { targetId } = await browser.Target.createTarget({ url: 'about:blank' });
  const client = await CDP({ port: 9222, target: targetId });
  await client.Page.enable();
  await client.Runtime.enable();
  await shoot(client, 0,    path.join(OUT, 'mobile-top-v2.png'),     true);
  await shoot(client, 850,  path.join(OUT, 'mobile-pinned-v2.png'),  true);
  await shoot(client, 1300, path.join(OUT, 'desktop-pinned-v2.png'), false);
  // Bonus: mid-scroll where navbar is solid-but-visible (just past hero, filter not yet pinned)
  await shoot(client, 400,  path.join(OUT, 'mobile-mid-v2.png'),     true);
  await client.close();
  await browser.Target.closeTarget({ targetId });
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });

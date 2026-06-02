// Capture mobile FAB states: closed, open, after-apply.
const CDP = require('chrome-remote-interface');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'diagnostics', 'screenshots');

async function shoot(client, label) {
  const { data } = await client.Page.captureScreenshot({ format: 'png' });
  fs.writeFileSync(path.join(OUT, `fab-${label}.png`), Buffer.from(data, 'base64'));
  console.log('wrote', `fab-${label}.png`);
}

(async () => {
  const ws = (await (await fetch('http://localhost:9222/json/version')).json()).webSocketDebuggerUrl;
  const browser = await CDP({ target: ws });
  const { targetId } = await browser.Target.createTarget({ url: 'about:blank' });
  const client = await CDP({ port: 9222, target: targetId });
  await client.Page.enable();
  await client.Runtime.enable();
  await client.Emulation.setDeviceMetricsOverride({
    width: 390, height: 844, deviceScaleFactor: 2, mobile: true,
  });
  const loaded = new Promise((r) => client.Page.loadEventFired(() => r()));
  await client.Page.navigate({ url: 'http://localhost:5173/' });
  await Promise.race([loaded, new Promise((r) => setTimeout(r, 12000))]);
  await new Promise((r) => setTimeout(r, 1500));

  // FAB visible at hero
  await shoot(client, '1-closed-hero');

  // Scroll down so we're in project area; FAB still visible
  await client.Runtime.evaluate({ expression: 'window.scrollTo(0, 800)' });
  await new Promise((r) => setTimeout(r, 700));
  await shoot(client, '2-closed-scrolled');

  // Open the sheet
  await client.Runtime.evaluate({ expression: 'document.querySelector(".filter-fab").click()' });
  await new Promise((r) => setTimeout(r, 600));
  await shoot(client, '3-sheet-open');

  // Tap an "AI Build" chip in the sheet
  await client.Runtime.evaluate({
    expression: 'document.querySelector(".filter-sheet .sheet-chip[data-filter=\\"ai-build\\"]").click()',
  });
  await new Promise((r) => setTimeout(r, 600));
  await shoot(client, '4-after-apply');

  await client.close();
  await browser.Target.closeTarget({ targetId });
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });

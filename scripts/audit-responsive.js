// Responsive audit: capture each section of the landing page at multiple widths,
// plus dump layout-overflow / horizontal-scroll signals at each viewport.
const CDP = require('chrome-remote-interface');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'diagnostics', 'screenshots');
fs.mkdirSync(OUT, { recursive: true });

const WIDTHS = [
  { w: 360,  h: 780,  m: true,  label: '360' },
  { w: 414,  h: 896,  m: true,  label: '414' },
  { w: 768,  h: 1024, m: true,  label: '768' },
  { w: 1024, h: 768,  m: false, label: '1024' },
  { w: 1440, h: 900,  m: false, label: '1440' },
];

const SECTIONS = [
  { sel: '.hero-section',           label: 'hero',   pad: 0 },
  { sel: '#ai-builds',              label: 'builds', pad: 80 },
  { sel: '#selected-project',       label: 'design', pad: 80 },
  { sel: '#ai-films',               label: 'films',  pad: 80 },
  { sel: '.section-about-snapshot', label: 'about',  pad: 80 },
];

async function shoot(client, label) {
  const { data } = await client.Page.captureScreenshot({ format: 'png' });
  fs.writeFileSync(path.join(OUT, 'r-' + label + '.png'), Buffer.from(data, 'base64'));
}

async function setSize(client, w, h, mobile) {
  await client.Emulation.setDeviceMetricsOverride({
    width: w, height: h, deviceScaleFactor: mobile ? 2 : 1, mobile,
  });
}

const PROBE_EXPR = `
  (function () {
    const doc = document.documentElement;
    const horizOverflow = doc.scrollWidth > doc.clientWidth ? doc.scrollWidth - doc.clientWidth : 0;
    const sections = ['.hero-section', '#ai-builds', '#selected-project', '#ai-films', '.section-about-snapshot'];
    const data = sections.map(function (sel) {
      const el = document.querySelector(sel);
      if (!el) return { sel: sel, missing: true };
      const r = el.getBoundingClientRect();
      return {
        sel: sel,
        x: Math.round(r.left), w: Math.round(r.width),
        y: Math.round(r.top + window.scrollY), h: Math.round(r.height),
        overflowRight: Math.round(r.right) > doc.clientWidth ? Math.round(r.right) - doc.clientWidth : 0,
      };
    });
    const cards = {
      aiBuilds: document.querySelectorAll('#ai-builds .collection-item .div-block-10'),
      design:   document.querySelectorAll('#selected-project .collection-item .div-block-10'),
    };
    const cardMeta = {};
    for (const k of Object.keys(cards)) {
      const list = cards[k];
      if (list.length === 0) { cardMeta[k] = null; continue; }
      const first = list[0].getBoundingClientRect();
      cardMeta[k] = { n: list.length, w: Math.round(first.width), h: Math.round(first.height) };
    }
    return JSON.stringify({ width: window.innerWidth, horizOverflow: horizOverflow, sections: data, cards: cardMeta }, null, 2);
  })()
`;

(async () => {
  const ws = (await (await fetch('http://localhost:9222/json/version')).json()).webSocketDebuggerUrl;
  const browser = await CDP({ target: ws });
  const { targetId } = await browser.Target.createTarget({ url: 'about:blank' });
  const client = await CDP({ port: 9222, target: targetId });
  await client.Page.enable();
  await client.Runtime.enable();

  const issues = [];

  for (const v of WIDTHS) {
    await setSize(client, v.w, v.h, v.m);
    const loaded = new Promise((r) => client.Page.loadEventFired(() => r()));
    await client.Page.navigate({ url: 'http://localhost:5173/' });
    await Promise.race([loaded, new Promise((r) => setTimeout(r, 12000))]);
    await new Promise((r) => setTimeout(r, 1500));

    const { result } = await client.Runtime.evaluate({ expression: PROBE_EXPR, returnByValue: true });
    const meta = JSON.parse(result.value);
    if (meta.horizOverflow > 0) {
      issues.push('[' + v.label + 'px] horizontal overflow: +' + meta.horizOverflow + 'px past viewport');
    }
    for (const s of meta.sections) {
      if (s.overflowRight > 0) {
        issues.push('[' + v.label + 'px] ' + s.sel + ' overflows right by ' + s.overflowRight + 'px');
      }
    }
    console.log('\n=== ' + v.label + 'px ===');
    console.log('overflow: +' + meta.horizOverflow + 'px | cards: ai-builds=' +
      JSON.stringify(meta.cards.aiBuilds) + ' design=' + JSON.stringify(meta.cards.design));

    await client.Runtime.evaluate({ expression: 'window.scrollTo(0, 0)' });
    await new Promise((r) => setTimeout(r, 500));
    await shoot(client, v.label + '-hero');

    for (const s of SECTIONS.slice(1)) {
      const sec = meta.sections.find((x) => x.sel === s.sel);
      if (!sec || sec.missing) continue;
      await client.Runtime.evaluate({ expression: 'window.scrollTo(0, ' + Math.max(0, sec.y - s.pad) + ')' });
      await new Promise((r) => setTimeout(r, 500));
      await shoot(client, v.label + '-' + s.label);
    }
  }

  console.log('\n=== ISSUES SUMMARY ===');
  if (issues.length === 0) console.log('No overflow issues detected.');
  else for (const i of issues) console.log('  ' + i);

  await client.close();
  await browser.Target.closeTarget({ targetId });
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });

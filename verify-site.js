// Load the rebuilt local site via CDP and report any failed requests or console errors.
// Verifies the home page + each linked sub-page.

const CDP = require('chrome-remote-interface');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:5173';
const PAGES = [
  '/',
  '/about-me',
  '/more-projects-gallery',
  '/mornova',
  '/scalesocial',
  '/projects/schego',
  '/projects/cyco',
  '/projects/ver-coaching',
  '/projects/capybara-ai',
  '/projects/self-coded-website',
];

async function getBrowserWsUrl() {
  const res = await fetch('http://localhost:9222/json/version');
  const j = await res.json();
  return j.webSocketDebuggerUrl;
}

function classifyFailure(url) {
  // Things we knowingly leave pointing at the CDN; not a "real" failure.
  if (url.includes('-transcode.webm')) return 'expected-webm-fallback';
  if (url.match(/-p-\d{3,4}\./)) return 'expected-srcset-variant';
  if (url.includes('//fonts.gstatic.com/')) return 'expected-google-font';
  if (url.includes('//fonts.googleapis.com/')) return 'expected-google-font-css';
  if (url.includes('//cdn.prod.website-files.com/')) return 'expected-cdn-fallback';
  if (url.includes('//d3e54v103j8qbb.cloudfront.net/')) return 'expected-webflow-script';
  if (url.includes('//api.open-meteo.com/')) return 'expected-runtime-api';
  return 'UNEXPECTED';
}

async function checkPage(pagePath) {
  const browserWs = await getBrowserWsUrl();
  const browser = await CDP({ target: browserWs });
  const { targetId } = await browser.Target.createTarget({ url: 'about:blank' });
  const client = await CDP({ port: 9222, target: targetId });
  const { Network, Page, Runtime } = client;

  const failures = [];   // {url, errorText}
  const consoleErrors = [];
  const okStatuses = new Map();
  const badStatuses = [];

  try {
    await Network.enable();
    await Page.enable();
    await Runtime.enable();

    Network.responseReceived(({ response }) => {
      const code = response.status;
      okStatuses.set(code, (okStatuses.get(code) || 0) + 1);
      if (code >= 400) badStatuses.push({ url: response.url, status: code });
    });
    Network.loadingFailed(({ errorText, blockedReason, type, requestId }) => {
      // We don't have the URL handy here — capture what we can.
      failures.push({ errorText: errorText || blockedReason, type });
    });
    Runtime.consoleAPICalled(({ type, args }) => {
      if (type === 'error') {
        const msg = args.map((a) => a.value || a.description || '').join(' ');
        consoleErrors.push(msg);
      }
    });

    const loaded = new Promise((r) => Page.loadEventFired(() => r()));
    await Page.navigate({ url: BASE + pagePath });
    await Promise.race([loaded, new Promise((r) => setTimeout(r, 15000))]);
    await new Promise((r) => setTimeout(r, 1500));

    const title = await Runtime.evaluate({ expression: 'document.title', returnByValue: true });

    return {
      path: pagePath,
      title: title.result.value,
      ok: okStatuses,
      badStatuses,
      failures,
      consoleErrors,
    };
  } finally {
    await client.close();
    await browser.Target.closeTarget({ targetId });
    await browser.close();
  }
}

(async () => {
  // We also want to track requests against the real CDN — if the *origin* of a failed
  // request is the local server, that's a real bug. If it's a CDN we expected to skip,
  // that's fine.
  const report = [];
  for (const p of PAGES) {
    console.log(`\n→ ${p}`);
    try {
      const r = await checkPage(p);
      report.push(r);
      const localFails = r.badStatuses.filter((b) => b.url.startsWith(BASE));
      const cdnFails = r.badStatuses.filter((b) => !b.url.startsWith(BASE));
      const localFailUrls = localFails.map((b) => `${b.status} ${b.url}`);
      console.log(`  title: ${r.title}`);
      console.log(`  status: ${[...r.ok.entries()].map(([s,c]) => `${s}×${c}`).join(' ')}`);
      console.log(`  LOCAL failures: ${localFails.length}`);
      for (const u of localFailUrls.slice(0, 5)) console.log(`    ${u}`);
      console.log(`  network failures (expected/CDN): ${r.failures.length}`);
      console.log(`  console errors: ${r.consoleErrors.length}`);
      if (r.consoleErrors.length) {
        for (const m of r.consoleErrors.slice(0, 3)) console.log(`    ! ${m.slice(0, 200)}`);
      }
    } catch (e) {
      console.log(`  FAIL: ${e.message}`);
      report.push({ path: p, error: e.message });
    }
  }

  fs.writeFileSync(path.join(__dirname, 'verify-report.json'), JSON.stringify(report, null, 2));
  console.log('\nWrote verify-report.json');
})().catch((e) => { console.error('FATAL', e); process.exit(1); });

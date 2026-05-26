// Crawl www.duorfan.com via Chrome DevTools Protocol.
// Connects to a Chrome instance running with --remote-debugging-port=9222.
// For each reachable page on the origin: captures the rendered HTML, the full
// network response body for every resource (CSS/JS/images/fonts/etc), and
// writes everything to ./captured/ preserving URL paths.

const CDP = require('chrome-remote-interface');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const ORIGIN = 'https://www.duorfan.com';
const ORIGIN_HOST = new URL(ORIGIN).host;
const OUT_DIR = path.join(__dirname, 'captured');
const MAX_PAGES = 50;
const NAV_TIMEOUT_MS = 25000;
const QUIET_MS = 3000;

function sanitizeFilename(name) {
  return name.replace(/[^a-zA-Z0-9._\-\/]/g, '_');
}

function urlToLocalPath(rawUrl) {
  let u;
  try { u = new URL(rawUrl); } catch { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  const hostDir = sanitizeFilename(u.host);
  let p = u.pathname;
  if (p.endsWith('/') || p === '') p = p + 'index.html';
  const base = path.basename(p);
  if (!base.includes('.')) p = path.posix.join(p, 'index.html');
  if (u.search) {
    const ext = path.extname(p);
    const stem = p.slice(0, p.length - ext.length);
    const qHash = Buffer.from(u.search).toString('base64url').slice(0, 8);
    p = `${stem}__q${qHash}${ext}`;
  }
  return path.join(OUT_DIR, hostDir, sanitizeFilename(p));
}

function ensureDirFor(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

async function capturePage(browser, targetUrl, queue, visited) {
  console.log(`\n[capture] ${targetUrl}`);
  // Create a fresh target (tab) for this page
  const { targetId } = await browser.Target.createTarget({ url: 'about:blank' });
  const client = await CDP({ port: 9222, target: targetId });
  const { Network, Page, Runtime, DOM } = client;
  const resources = new Map(); // requestId -> response info

  try {
    await Network.enable();
    await Page.enable();
    await Runtime.enable();
    await Network.setCacheDisabled({ cacheDisabled: true });

    Network.responseReceived(({ requestId, response, type }) => {
      resources.set(requestId, { url: response.url, mimeType: response.mimeType, status: response.status, type });
    });
    let lastEventAt = Date.now();
    const bumpQuiet = () => { lastEventAt = Date.now(); };
    Network.requestWillBeSent(bumpQuiet);
    Network.responseReceived(bumpQuiet);
    Network.loadingFinished(bumpQuiet);
    Network.loadingFailed(bumpQuiet);

    const loaded = new Promise((resolve) => Page.loadEventFired(() => resolve()));
    await Page.navigate({ url: targetUrl });
    await Promise.race([loaded, new Promise((r) => setTimeout(r, NAV_TIMEOUT_MS))]);
    // Wait for network quiescence
    const quietDeadline = Date.now() + 12000;
    while (Date.now() < quietDeadline && (Date.now() - lastEventAt) < QUIET_MS) {
      await new Promise((r) => setTimeout(r, 200));
    }
    // Small extra delay to let JS settle
    await new Promise((r) => setTimeout(r, 500));

    // Capture rendered HTML for the document
    const { root } = await DOM.getDocument({ depth: -1, pierce: true });
    const { outerHTML } = await DOM.getOuterHTML({ nodeId: root.nodeId });
    const docPath = urlToLocalPath(targetUrl);
    if (docPath) {
      ensureDirFor(docPath);
      fs.writeFileSync(docPath, outerHTML, 'utf8');
      console.log(`  doc  → ${path.relative(OUT_DIR, docPath)} (${outerHTML.length}b)`);
    }

    // Save every captured response body
    let savedCount = 0;
    const urlManifest = {};
    for (const [requestId, info] of resources.entries()) {
      const local = urlToLocalPath(info.url);
      if (!local) continue;
      if (local === docPath) {
        urlManifest[info.url] = path.relative(OUT_DIR, local);
        continue;
      }
      try {
        if (!fs.existsSync(local)) {
          const { body, base64Encoded } = await Network.getResponseBody({ requestId });
          ensureDirFor(local);
          fs.writeFileSync(local, Buffer.from(body, base64Encoded ? 'base64' : 'utf8'));
          savedCount++;
        }
        urlManifest[info.url] = path.relative(OUT_DIR, local);
      } catch (e) {
        // Some responses are not retrievable (redirects, preflight, etc.)
      }
    }
    // Merge into global manifest
    const manifestPath = path.join(OUT_DIR, '_url-manifest.json');
    let global = {};
    if (fs.existsSync(manifestPath)) {
      try { global = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); } catch {}
    }
    Object.assign(global, urlManifest);
    fs.writeFileSync(manifestPath, JSON.stringify(global, null, 2));
    console.log(`  saved ${savedCount} resources (of ${resources.size} responses)`);

    // Discover same-origin links to crawl next
    const { result } = await Runtime.evaluate({
      expression: `Array.from(document.querySelectorAll('a[href]')).map(a => a.href)`,
      returnByValue: true,
    });
    const links = Array.isArray(result.value) ? result.value : [];
    let added = 0;
    for (const href of links) {
      try {
        const u = new URL(href);
        if (u.host !== ORIGIN_HOST) continue;
        u.hash = '';
        const norm = u.toString();
        if (!visited.has(norm) && !queue.includes(norm)) {
          queue.push(norm);
          added++;
        }
      } catch {}
    }
    console.log(`  links: ${links.length} on page, +${added} new`);

    return { ok: true, resources: resources.size, saved: savedCount, links: links.length };
  } finally {
    try { await client.close(); } catch {}
    try { await browser.Target.closeTarget({ targetId }); } catch {}
  }
}

async function getBrowserWsUrl() {
  const res = await fetch('http://localhost:9222/json/version');
  if (!res.ok) throw new Error(`/json/version returned ${res.status}`);
  const j = await res.json();
  if (!j.webSocketDebuggerUrl) throw new Error('No webSocketDebuggerUrl in /json/version');
  return j.webSocketDebuggerUrl;
}

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  // Browser-level connection so we can create/close targets per page.
  const browserWs = await getBrowserWsUrl();
  console.log(`[cdp] browser ws: ${browserWs}`);
  const browser = await CDP({ target: browserWs });

  const summary = { start: ORIGIN, pages: [], failures: [] };
  const queue = [ORIGIN + '/'];
  const visited = new Set();

  try {
    while (queue.length && visited.size < MAX_PAGES) {
      const next = queue.shift();
      if (visited.has(next)) continue;
      visited.add(next);
      try {
        const res = await capturePage(browser, next, queue, visited);
        summary.pages.push({ url: next, ...res });
      } catch (e) {
        console.error(`  FAIL ${next}: ${e.message}`);
        summary.failures.push({ url: next, error: e.message });
      }
    }
  } finally {
    try { await browser.close(); } catch {}
  }

  fs.writeFileSync(path.join(OUT_DIR, '_crawl-summary.json'), JSON.stringify(summary, null, 2));
  console.log(`\nDone. ${summary.pages.length} pages, ${summary.failures.length} failures.`);
})().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});

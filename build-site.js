// Build a runnable local copy of duorfan.com from the CDP-captured ./captured tree.
//
// Layout produced under ./site:
//   /index.html, /about-me/index.html, /projects/<slug>/index.html, ...     (the page docs)
//   /_assets/<host>/<path>                                                  (all third-party assets)
//
// URL rewriting strategy: use the URL→file manifest written by cdp-crawl.js for exact-string
// substitution. Manifest keys are real URLs that the browser actually requested, so we don't have
// to guess about encoding. URLs not in the manifest (e.g., responsive `-p-500.png` srcset variants
// the browser didn't pick during capture) are left as-is so the browser can still try the network.

const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const ROOT = __dirname;
const CAPTURED = path.join(ROOT, 'captured');
const SITE = path.join(ROOT, 'site');
const PRIMARY_HOST = 'www.duorfan.com';

function sanitizeFilename(name) {
  return name.replace(/[^a-zA-Z0-9._\-\/]/g, '_');
}

function siteRootedPathFor(rawUrl) {
  let u;
  try { u = new URL(rawUrl); } catch { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  if (u.host === PRIMARY_HOST) {
    let p = u.pathname;
    if (p.endsWith('/') || p === '') p = p + 'index.html';
    const base = path.basename(p);
    if (!base.includes('.')) p = path.posix.join(p, 'index.html');
    return p;
  }
  const hostDir = sanitizeFilename(u.host);
  let p = u.pathname;
  const base = path.basename(p);
  if (!base.includes('.')) p = path.posix.join(p, 'index.html');
  if (u.search) {
    const ext = path.extname(p);
    const stem = p.slice(0, p.length - ext.length);
    const qHash = Buffer.from(u.search).toString('base64url').slice(0, 8);
    p = `${stem}__q${qHash}${ext}`;
  }
  return '/_assets/' + hostDir + sanitizeFilename(p);
}

function ensureDirFor(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function stageCapturedFiles() {
  const stats = { primaryPages: 0, assets: 0 };
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (entry.isFile()) {
        if (entry.name.startsWith('_crawl-summary') || entry.name.startsWith('_url-manifest')) continue;
        const rel = path.relative(CAPTURED, full);
        const firstSlash = rel.indexOf(path.sep);
        if (firstSlash < 0) continue;
        const host = rel.slice(0, firstSlash);
        const subPath = rel.slice(firstSlash + 1).split(path.sep).join('/');
        let destRooted;
        if (host === PRIMARY_HOST) {
          destRooted = '/' + subPath;
          stats.primaryPages++;
        } else {
          destRooted = '/_assets/' + host + '/' + subPath;
          stats.assets++;
        }
        const dest = path.join(SITE, destRooted.replace(/^\//, ''));
        ensureDirFor(dest);
        fs.copyFileSync(full, dest);
      }
    }
  }
  walk(CAPTURED);
  return stats;
}

function buildUrlToLocalMap() {
  const manifest = JSON.parse(fs.readFileSync(path.join(CAPTURED, '_url-manifest.json'), 'utf8'));
  const map = new Map();
  for (const url of Object.keys(manifest)) {
    const local = siteRootedPathFor(url);
    if (!local) continue;
    map.set(url, local);
  }
  return map;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Replace exact-match URLs in text. URLs are sorted longest-first so query-string variants
// don't get clobbered by their base.
function rewriteTextWithManifest(text, urlMap) {
  let replacements = 0;
  const urls = [...urlMap.keys()].sort((a, b) => b.length - a.length);
  for (const url of urls) {
    if (text.indexOf(url) === -1) continue;
    const local = urlMap.get(url);
    const re = new RegExp(escapeRegex(url), 'g');
    const before = text.length;
    text = text.replace(re, local);
    replacements += Math.round((before - text.length) / Math.max(1, url.length - local.length)) || 1;
  }
  return { text, replacements };
}

// Strip srcset/sizes from <img> tags. Browsers prefer srcset candidates; if a chosen candidate
// fails (e.g., we don't have a `-p-500.png` variant) Chrome will *not* fall back to `src`. We
// drop these attributes so only the captured `src` is used.
function stripResponsiveAttrs(html) {
  // Match <img ...> and remove srcset="..." sizes="..." attributes (any quote style).
  return html.replace(/<img\b[^>]*>/gi, (tag) => {
    return tag
      .replace(/\s+srcset\s*=\s*"[^"]*"/gi, '')
      .replace(/\s+srcset\s*=\s*'[^']*'/gi, '')
      .replace(/\s+sizes\s*=\s*"[^"]*"/gi, '')
      .replace(/\s+sizes\s*=\s*'[^']*'/gi, '');
  });
}

(function main() {
  if (!fs.existsSync(CAPTURED)) {
    console.error('No ./captured directory found. Run cdp-crawl.js first.');
    process.exit(1);
  }
  fs.rmSync(SITE, { recursive: true, force: true });
  fs.mkdirSync(SITE, { recursive: true });

  console.log('[stage] copying captured files into ./site ...');
  const stats = stageCapturedFiles();
  console.log(`  primary pages: ${stats.primaryPages}, assets: ${stats.assets}`);

  const urlMap = buildUrlToLocalMap();
  console.log(`[manifest] ${urlMap.size} known URLs`);

  function walkAndRewrite(dir, exts, transform) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walkAndRewrite(full, exts, transform); continue; }
      if (entry.isFile() && exts.some((e) => full.endsWith(e))) {
        let src = fs.readFileSync(full, 'utf8');
        src = transform(src, full);
        fs.writeFileSync(full, src, 'utf8');
      }
    }
  }

  let totalHtmlReplacements = 0;
  console.log('[rewrite] HTML ...');
  walkAndRewrite(SITE, ['.html'], (src, filePath) => {
    src = stripResponsiveAttrs(src);
    const { text, replacements } = rewriteTextWithManifest(src, urlMap);
    totalHtmlReplacements += replacements;
    // HTML living under /_assets/<host>/... was captured from that subdomain and may use
    // root-absolute paths (e.g. /assets/foo.js) that originally resolved against the
    // subdomain root. Re-anchor those to /_assets/<host>/ so they resolve under our server.
    const rel = path.relative(SITE, filePath).split(path.sep).join('/');
    if (rel.startsWith('_assets/')) {
      const host = rel.split('/')[1];
      const prefix = `/_assets/${host}`;
      return text.replace(/(\s(?:src|href)\s*=\s*["'])\/(?!_assets\/|https?:)([^"']+["'])/gi,
        (m, lead, rest) => `${lead}${prefix}/${rest}`);
    }
    return text;
  });
  console.log(`  ~${totalHtmlReplacements} URL replacements`);

  let totalCssReplacements = 0;
  console.log('[rewrite] CSS ...');
  walkAndRewrite(SITE, ['.css'], (src) => {
    const { text, replacements } = rewriteTextWithManifest(src, urlMap);
    totalCssReplacements += replacements;
    return text;
  });
  console.log(`  ~${totalCssReplacements} URL replacements`);

  console.log('[customize] applying local landing-page tweaks ...');
  applyLandingPageCustomizations(path.join(SITE, 'index.html'));

  console.log('Done. Local site at:', SITE);
})();

// Hand-authored tweaks to the landing page, kept in the build so they survive `npm run rebuild`.
//   1. Guard the inline name-wrapper script against double-wrapping. The captured DOM already
//      includes the wrapper (CDP saw it post-render), so without the guard the script wraps it
//      again on each load and a second ⓘ appears.
//   2. Restyle the "Discover Projects" CTA with a brand-dark fill, white arrow, and a hover
//      lift to the brand-blue accent.
function applyLandingPageCustomizations(landingPath) {
  if (!fs.existsSync(landingPath)) return;
  let html = fs.readFileSync(landingPath, 'utf8');

  const guardBefore = `if (heading && heading.textContent.includes('Duorfan')) {
      heading.innerHTML = heading.innerHTML.replace(`;
  const guardAfter = `if (heading && heading.textContent.includes('Duorfan')) {
      if (!heading.querySelector('.name-wrapper')) {
        heading.innerHTML = heading.innerHTML.replace(`;
  if (html.includes(guardBefore) && !html.includes(guardAfter)) {
    html = html.replace(guardBefore, guardAfter);
    // Close the new `if` block. The original `.replace(...);` call ends with `);` on the line
    // after the wrapper string — wrap it with a matching `}`.
    html = html.replace(
      `'<span class="name-wrapper">Duorfan<span class="hint-icon">ⓘ</span><span class="pronunciation-tooltip">🚪 door + 🪭 fan</span></span>'\n      );`,
      `'<span class="name-wrapper">Duorfan<span class="hint-icon">ⓘ</span><span class="pronunciation-tooltip">🚪 door + 🪭 fan</span></span>'\n        );\n      }`
    );
  }

  const buttonCss = `
  /* Discover Projects CTA — brand-aligned fill with hover */
  .link-block-8 {
    background-color: var(--dark-brown) !important;
    border-color: var(--dark-brown) !important;
    box-shadow: 0 4px 14px rgba(73, 67, 62, 0.18);
    transition: background-color .2s ease, transform .15s ease, box-shadow .2s ease;
  }
  .link-block-8 .buttontext {
    color: var(--beige) !important;
  }
  .link-block-8 .image-20 {
    filter: brightness(0) invert(1);
  }
  .link-block-8:hover {
    background-color: var(--brandcolor) !important;
    border-color: var(--brandcolor) !important;
    transform: translateY(-2px);
    box-shadow: 0 8px 20px rgba(73, 67, 62, 0.22);
  }
  .link-block-8:hover .buttontext {
    color: var(--dark-brown) !important;
  }
  .link-block-8:hover .image-20 {
    filter: none;
  }
`;
  // Inject before the first </style> that follows the pronunciation-tooltip rules.
  const styleAnchor = `@media (max-width: 768px) {
    .pronunciation-tooltip {
      bottom: calc(100% + 8px);
      font-size: 16px;
    }
  }
</style>`;
  if (html.includes(styleAnchor) && !html.includes('Discover Projects CTA')) {
    html = html.replace(styleAnchor, styleAnchor.replace('</style>', buttonCss + '</style>'));
  }

  fs.writeFileSync(landingPath, html, 'utf8');
}

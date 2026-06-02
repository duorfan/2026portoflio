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
const SITE_CUSTOM_DIR = path.join(ROOT, 'site-customizations');
const LOCAL_ASSETS_DIR = path.join(SITE, '_assets', 'local');

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

// =====================================================================
// Customization helpers — each is idempotent (no-op if marker present).
// =====================================================================

function copyOverrideAssets() {
  fs.mkdirSync(LOCAL_ASSETS_DIR, { recursive: true });
  // Copy every file at the root of site-customizations/ into site/_assets/local/.
  // Excludes files that have dedicated page-level handling (chat-itp.html). This makes the
  // dir a drop-in spot for new media (images, videos, fonts) without touching build-site.js.
  const SKIP = new Set(['chat-itp.html']);
  for (const entry of fs.readdirSync(SITE_CUSTOM_DIR, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    if (SKIP.has(entry.name)) continue;
    if (entry.name.startsWith('.')) continue;
    fs.copyFileSync(
      path.join(SITE_CUSTOM_DIR, entry.name),
      path.join(LOCAL_ASSETS_DIR, entry.name)
    );
  }
}

function copyChatItpPage() {
  const src = path.join(SITE_CUSTOM_DIR, 'chat-itp.html');
  if (!fs.existsSync(src)) return;
  const dest = path.join(SITE, 'projects', 'chat-itp', 'index.html');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

// Inject <link> and <script> for local overrides into every page's <head>.
// Also strips the inline <style> and <script> blocks the captured home page
// shipped, since their contents now live in local-overrides.{css,js}.
function injectLocalAssets(html, rel) {
  const linkTag  = '<link rel="stylesheet" href="/_assets/local/local-overrides.css?v=2">';
  const scriptTag = '<script src="/_assets/local/local-overrides.js?v=2" defer></script>';
  if (!html.includes(linkTag)) {
    html = html.replace('</head>', `  ${linkTag}\n  ${scriptTag}\n</head>`);
  }
  // For the home page only: drop the inline <style>/<script> that the captured DOM still
  // carries — their content is now in the overrides files. Strip from </body> backwards.
  if (rel === 'index.html') {
    html = html.replace(/<style>\s*\.name-wrapper[\s\S]*?<\/script>\s*<\/body>/, '</body>');
  }
  return html;
}

// Footer patches — strip ask, bump year, warm up the closing line.
// Captured Webflow text is:  "@ 2026 DuorfanFAN | Made with Love 🤍"
// Replaced with a warmer line + a Claude Code attribution mark (links to
// https://claude.com/code). Idempotent: the marker class guards re-application.
const FOOTER_NEW_LINE =
  'Hand-crafted with 🤍 by Duorfan, ' +
  'co-built with <a href="https://claude.com/code" target="_blank" rel="noopener" class="claude-code-link">' +
    '<svg class="claude-code-icon" viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">' +
      '<path d="M12 2 L13.6 9.3 L20.8 11 L13.6 12.7 L12 20 L10.4 12.7 L3.2 11 L10.4 9.3 Z"/>' +
      '<path d="M19 3 L19.55 5.45 L22 6 L19.55 6.55 L19 9 L18.45 6.55 L16 6 L18.45 5.45 Z" opacity="0.8"/>' +
    '</svg>' +
    'Claude Code</a> · ' +
  '© 2026';

function applyFooterAsk(html) {
  // 1) Strip the availability ask if a previous build injected it.
  html = html.replace(/<div class="footer-ask">[\s\S]*?<\/div>/g, '');
  // 2) Bump copyright year (still useful if a fresh capture lands here).
  html = html.replace(/@ 2025 DuorfanFAN/g, '@ 2026 DuorfanFAN');
  // 3) Replace the closing line with the warmer Claude Code attribution.
  //    Matches both the captured plain text and any prior rewritten variant
  //    (so re-runs don't double the line).
  html = html.replace(/@ 20\d\d DuorfanFAN \| Made with Love 🤍/g, FOOTER_NEW_LINE);
  // 4) Refresh social links (email + instagram). Note the &amp; in attribute values.
  html = html.replace(
    /to=nf2111@nyu\.edu/g,
    'to=duorfan@gmail.com'
  );
  html = html.replace(
    /https:\/\/www\.instagram\.com\/duorfantasy\/\?next=%2F/g,
    'https://www.instagram.com/duor.fun'
  );
  return html;
}

// Single source of truth for the "Take a look at my other projects~" carousel that
// lives at the bottom of each project case-study page. Order: AI Builds first (lead with
// the new identity), then design work.
const PROJECT_REGISTRY = [
  { slug: '/mornova',                 title: 'Mornova',       img: '/_assets/cdn.prod.website-files.com/643754b8d27d2714812a10b5/692fe937530f1ae410a0f92c_Mornova_20Final_20Pre.jpg',
    primary: { label: 'AI Build', color: 'chip-ai' }, secondary: ['Product Design', 'Live demo'] },
  { slug: '/scalesocial',             title: 'Scale Social',  img: '/_assets/cdn.prod.website-files.com/643754b8d27d2714812a10b5/6938a001e188d69d339049f8_hero_20ss.avif',
    primary: { label: 'AI Build', color: 'chip-ai' }, secondary: ['UX Research', 'Client work'] },
  { slug: '/projects/chat-itp',       title: 'ChatITP',       img: null,
    primary: { label: 'AI Build', color: 'chip-ai' }, secondary: ['Early Exploration'] },
  { slug: '/projects/schego',         title: 'ScheGo',        img: '/_assets/cdn.prod.website-files.com/647bb48e77bb5a186dd60dca/672cfebe5305e5054d35f460_hero_20schego.png',
    primary: { label: 'Product Design', color: 'chip-design' }, secondary: ['UX Research', 'Case study'] },
  { slug: '/projects/cyco',           title: 'CYCO',          img: '/_assets/cdn.prod.website-files.com/647bb48e77bb5a186dd60dca/66b694e24c6801c451aa6070_hero6.png',
    primary: { label: 'Product Design', color: 'chip-design' }, secondary: ['UX Research', 'Case study'] },
  { slug: '/projects/ver-coaching',   title: 'Ver Coaching',  img: '/_assets/cdn.prod.website-files.com/647bb48e77bb5a186dd60dca/68b12cc8aa1a940e1cb096c9_hero_20ver.png',
    primary: { label: 'Product Design', color: 'chip-design' }, secondary: ['UX Research', 'Case study'] },
  { slug: '/projects/capybara-ai',    title: 'Capybara.AI',   img: '/_assets/cdn.prod.website-files.com/647bb48e77bb5a186dd60dca/65e5384042a5e623f87a6638_01_201-p-2000.webp',
    primary: { label: 'Web Design', color: 'chip-design' }, secondary: ['Front-End', 'Graphic Design'] },
  { slug: '/projects/self-coded-website', title: 'Web Roots', img: '/_assets/cdn.prod.website-files.com/647bb48e77bb5a186dd60dca/6484f32de6dda9d4b94d1c80_hero5.webp',
    primary: { label: 'Web Design', color: 'chip-design' }, secondary: ['Front-End', 'Graphic Design'] },
];

function renderCarouselCard(p) {
  const cover = p.img
    ? `<img src="${p.img}" loading="lazy" alt="" class="image-7">`
    : `<div class="image-7 chatitp-swatch" aria-hidden="true">💬</div>`;
  const chips = [
    `<span class="chip chip-primary ${p.primary.color}">${p.primary.label}</span>`,
    ...p.secondary.map(s => `<span class="chip chip-secondary">${s}</span>`),
  ].join('');
  return `<div role="listitem" class="w-dyn-item"><a href="${p.slug}" class="link-block-2 w-inline-block">${cover}<h3 class="summary-title">${p.title}</h3><div class="chip-row carousel-chip-row">${chips}</div></a></div>`;
}

// For a given project page, rewrite the "Take a look at my other projects~" carousel:
// regenerates from PROJECT_REGISTRY with the current slug filtered out and modern chip styling.
function rebuildOtherProjectsCarousel(html, currentSlug) {
  // Locate <div role="list" class="other-projects w-dyn-items">...</div>
  const startMarker = '<div role="list" class="other-projects w-dyn-items">';
  const start = html.indexOf(startMarker);
  if (start === -1) return html;
  // Find the matching closing </div>. The captured Webflow markup is one long line, but the
  // list immediately ends with </div></div></div> (close list / close list-wrapper / close
  // container-3). We use a non-greedy scan looking for the boundary sentinel.
  const after = html.indexOf('</div></div></div>', start);
  if (after === -1) return html;
  const listEnd = after; // position of the role-list's own closing </div>

  const others = PROJECT_REGISTRY.filter(p => p.slug !== currentSlug);
  const newInner = others.map(renderCarouselCard).join('');
  return html.slice(0, start + startMarker.length) + newInner + html.slice(listEnd);
}

// Inside #selected-project, replace every <div class="tag">A | B | C</div> with
// <div class="chip-row design-chip-row">[A][B][C]</div>. Keeps the original element's
// attributes (data-w-id, inline style) so the Webflow scroll animations still target it.
function chipifyDesignTags(html) {
  const start = html.indexOf('<article id="selected-project"');
  if (start === -1) return html;
  const end = html.indexOf('</article>', start);
  if (end === -1) return html;
  const before = html.slice(0, start);
  const middle = html.slice(start, end);
  const after = html.slice(end);

  // First-tag → chip-primary (with a discipline color hint), rest → chip-secondary.
  const PRIMARY_COLOR = {
    'UX&UI Design':              'chip-design',
    'UX & UI Design':            'chip-design',
    'UI/UX Design':              'chip-design',
    'AI Conversation Design':    'chip-ai',
    'Web Design':                'chip-design',
  };

  const transformed = middle.replace(
    /(<div\b[^>]*?)\sclass="tag"([^>]*>)([^<]+)(<\/div>)/g,
    (_m, lead, trail, text, close) => {
      const parts = text
        .replace(/&amp;/g, '&')
        .split('|')
        .map(s => s.trim())
        .filter(Boolean);
      if (!parts.length) return _m;
      const chips = parts.map((p, i) => {
        if (i === 0) {
          const colorClass = PRIMARY_COLOR[p] || '';
          return `<span class="chip chip-primary ${colorClass}">${p}</span>`;
        }
        return `<span class="chip chip-secondary">${p}</span>`;
      }).join('');
      // Replace the .tag class entirely; keep inline style + data-w-id so animations still fire.
      return `${lead} class="chip-row design-chip-row"${trail}${chips}${close}`;
    }
  );

  return before + transformed + after;
}

// ----- Home page (the big surgery) -----------------------------------
function applyHomePagePatches(html) {
  // 1) Hero copy
  const oldHero1 = '<p class="summary-info intro">Designing digital and physical experiences</p><p class="summary-info intro">that make technology feel more human!</p>';
  const newHero1 = '<p class="summary-info intro">I design and build AI-powered products —</p><p class="summary-info intro">and the experiences around them.</p>';
  if (html.includes(oldHero1)) html = html.replace(oldHero1, newHero1);

  // 2) Rename "Selected Projects" → "Selected Design Work"
  html = html.replace(
    '<h1 class="secondary-heading">Selected Projects</h1>',
    '<h1 class="secondary-heading">Selected Design Work</h1>'
  );

  // 3) Add data-tags to each existing Design-Work card (by unique href)
  const designTagMap = {
    '/projects/schego':            'product-design ux-research',
    '/projects/cyco':              'product-design ux-research',
    '/projects/ver-coaching':      'product-design ux-research',
    '/projects/capybara-ai':       'product-design front-end',
    '/projects/self-coded-website':'front-end product-design',
  };
  for (const [href, tags] of Object.entries(designTagMap)) {
    const finder = `class="collection-item w-dyn-item"><a href="${href}"`;
    const insert = `class="collection-item w-dyn-item" data-tags="${tags}"><a href="${href}"`;
    if (html.includes(finder) && !html.includes(insert)) {
      html = html.replace(finder, insert);
    }
  }

  // 4) Wrap the Design Work cards container so the filter can hide it cleanly
  html = html.replace(
    '<article id="selected-project" class="section-selected">',
    '<article id="selected-project" class="section-selected" data-filterable-section>'
  );

  // 4b) Retarget the "Discover Projects" CTA. Original points to #selected-project, but with
  //     the new IA AI Builds is now the first project section.
  html = html.replace(
    /href="#selected-project"(\s+class="link-block-8)/,
    'href="#ai-builds"$1'
  );

  // 4c) Convert plain pipe-separated tags inside design cards into chip pills so they match
  //     the AI Builds chip vocabulary. Operates only inside #selected-project (so AI Films
  //     overlay text isn't touched).
  html = chipifyDesignTags(html);

  // 5) Build and INSERT the AI Builds section BEFORE article#selected-project
  if (!html.includes('id="ai-builds"')) {
    html = html.replace(
      '<article id="selected-project"',
      AI_BUILDS_SECTION + '<article id="selected-project"'
    );
  }

  // 6) Replace the two "container-builder" blocks (Mornova + Scale Social) — they're absorbed
  //    into AI Builds above. Match by their unique heading text.
  html = removeContainerBuilderBlock(html, 'Recently, I’ve also become a builder...');
  html = removeContainerBuilderBlock(html, 'Recently, I&rsquo;ve also become a builder...');
  html = removeContainerBuilderBlock(html, 'Recently, I&#x27;ve also become a builder...');
  html = removeContainerBuilderBlock(html, "Recently, I've also become a builder...");
  html = removeContainerBuilderBlock(html, 'I also did a AI UGC case study');

  // 7) Insert AI Films section AS A SIBLING after #selected-project, before the more-projects link.
  //    The captured HTML has the more-link container *inside* article#selected-project, so we
  //    must close that article first (inserting a fresh `</article>`) and then later strip the
  //    now-orphaned trailing `</article>` from the same article (step 9).
  if (!html.includes('id="ai-films"')) {
    const anchor = '<div class="w-layout-blockcontainer container w-container"><a href="/more-projects-gallery"';
    if (html.includes(anchor)) {
      html = html.replace(anchor, '</article>' + AI_FILMS_SECTION + anchor);
    }
  }

  // 8) Insert About snapshot BEFORE the footer
  if (!html.includes('class="about-snapshot"')) {
    html = html.replace('<section class="footer">', ABOUT_SNAPSHOT + '<section class="footer">');
  }

  // 9) Strip the orphaned `</article>` that originally closed #selected-project from the bottom
  //    of the more-link container, since we already closed that article up at step 7. Without
  //    this, AI Films and the more-link end up nested inside #selected-project.
  html = html.replace(
    '</div></article><section class="section-about-snapshot"',
    '</div><section class="section-about-snapshot"'
  );

  // 10) Append the ChatITP card as the last card in Selected Design Work.
  if (!html.match(/href="\/projects\/chat-itp"[^>]*class="link-block/)) {
    const anchor = '</div></aside></div></article><article id="ai-films"';
    if (html.includes(anchor)) {
      html = html.replace(anchor, CHAT_ITP_DESIGN_CARD + anchor);
    }
  }

  return html;
}

function removeContainerBuilderBlock(html, headingNeedle) {
  // Match a <div class="w-layout-blockcontainer container-builder ..."> ... </div>
  // whose inner HTML contains the heading needle. We need balanced div matching; do it by
  // scanning forward and counting div depth.
  const startRe = /<div\s+class="w-layout-blockcontainer container-builder w-container">/g;
  let m;
  while ((m = startRe.exec(html)) !== null) {
    const start = m.index;
    // Find matching close by scanning
    let i = m.index + m[0].length;
    let depth = 1;
    while (i < html.length && depth > 0) {
      const open = html.indexOf('<div', i);
      const close = html.indexOf('</div>', i);
      if (close < 0) break;
      if (open >= 0 && open < close) { depth++; i = open + 4; }
      else { depth--; i = close + 6; }
    }
    if (depth !== 0) continue;
    const block = html.slice(start, i);
    if (block.includes(headingNeedle)) {
      html = html.slice(0, start) + html.slice(i);
      startRe.lastIndex = start; // re-scan from same position
    }
  }
  return html;
}

// ----- About page ----------------------------------------------------
function applyAboutPatches(html) {
  // 1) Self-description — update from "product designer" to the new hybrid identity.
  html = html.replace(
    'A product designer who still tears up at Minions',
    'An AI product designer & builder who still tears up at Minions'
  );

  // 2) Duke is done — graduated, not studying. Restructures the sentence so the new role
  //    can be tacked on naturally.
  const oldEdu = 'I’m studying <a href="https://masters.pratt.duke.edu/design-technology-innovation/" target="_blank" class="link-6"><span class="text-span-18">Design &amp; Technology Innovation</span></a> at <strong>Duke</strong>, after earning my <strong>BFA</strong> in <a href="https://tisch.nyu.edu/itp" target="_blank" class="link-2"><span class="text-span-19">Interactive Media Arts</span></a> from <strong>NYU Tisch</strong> (with a minor in the Business of Entertainment, Media, and Technology).';
  const newEdu = 'I just graduated with a Master’s in <a href="https://masters.pratt.duke.edu/design-technology-innovation/" target="_blank" class="link-6"><span class="text-span-18">Design &amp; Technology Innovation</span></a> from <strong>Duke</strong>, after earning my <strong>BFA</strong> in <a href="https://tisch.nyu.edu/itp" target="_blank" class="link-2"><span class="text-span-19">Interactive Media Arts</span></a> from <strong>NYU Tisch</strong> (with a minor in the Business of Entertainment, Media, and Technology). Next up: I’m joining <strong>Scale Social</strong> as a <strong>Product &amp; Tech Specialist</strong> — or, as I like to call it, an <strong>AI Product Designer &amp; Builder</strong>.';
  if (html.includes(oldEdu)) html = html.replace(oldEdu, newEdu);

  // 3) Dual-identity paragraph (replaces the old "tech companies and startups" line)
  const oldBio = "I’ve worked with several <strong>tech companies</strong> and <strong>startups</strong>, designing digital and physical experiences that make technology feel more human.";
  const newBio = 'I split my time between two modes: <strong>designing</strong> thoughtful product experiences across web, mobile, and physical interfaces — and <strong>building</strong> AI-powered products end-to-end, from research to shipped prototype. Recent builds include <strong>Mornova</strong> (an AI morning assistant), <strong>Scale Social</strong> (an AI UGC platform), and AI short films made in <strong>Runway</strong>.';
  if (html.includes(oldBio)) html = html.replace(oldBio, newBio);

  // 4) "How I work with AI" — replaces the old "exploring AI tools" line
  const oldAi = "Lately, I’ve been exploring AI tools, from <strong>Runway</strong> (where I still have 90,000 credits left, oops) to <strong>Vibe Coding</strong>, trying to see how creative intuition meets machine logic.";
  const newAi = '<strong>How I work with AI.</strong> AI is a tool, not the product. I use it to compress research, prototype faster, and ship features that would have taken a team. My builds favor calm UX and clear user value over flashy model demos.';
  if (html.includes(oldAi)) html = html.replace(oldAi, newAi);

  return html;
}

// ----- Mornova page --------------------------------------------------
function applyMornovaPatches(html) {
  if (html.includes('class="live-demo-pill"')) return html;
  // Wrap the existing phone-mockup iframe area with a live-demo header.
  const wrapAnchor = '<div class="mornova-phone-wrap">';
  if (html.includes(wrapAnchor)) {
    const pill = '<div class="live-demo-wrap" id="mornova-demo"><span class="live-demo-pill">Live demo</span></div>';
    html = html.replace(wrapAnchor, pill + wrapAnchor);
  }
  return html;
}

// ----- More gallery — tag the 21 cards + mark its section filterable ---
// Per-title tag map for the More-page filter taxonomy (games / av / physical /
// graphic / ai / ui). Cards can carry multiple tags. Keys are the exact card
// titles as they appear in <h1 class="secondary-heading project-title">.
const MORE_PAGE_TAGS = {
  'Depersonalization':         ['av'],
  'Appear':                    ['physical'],
  'Upload':                    ['av', 'games'],
  'Welcome to Hogwarts':       ['games', 'ai'],
  'Printed Fate':              ['physical', 'ai'],
  'NYU Free T-shirt':          ['ui'],
  'Alter Ego':                 ['games'],
  'Flappy Heart':              ['games', 'physical'],
  'Cinderella has BIG feet?':  ['graphic'],
  'Unreal Engine Micro Movie': ['av'],
  'Balance Station':           ['physical'],
  'Space We Call Home':        ['av', 'ai'],
  'Garbage Ninja':             ['games', 'physical'],
  'Information Design':        ['ui'],
  'Typography':                ['graphic'],
  'Yearbook Design':           ['graphic'],
  'Stage Costume':             ['physical'],
  'Yaoud Medicine':            ['ui'],
  'Jewelery Organizer':        ['physical'],
  'Happy Christmas':           ['physical'],
  '3050':                      ['av', 'physical'],
};

// Split a More-page tag line like
//   "Audiovisual Live Performance: TouchDesigner + MUSE 2 + JavaScript (p5.js)"
// into chip spans. First chunk (before the colon) becomes a primary chip; the
// rest split on + | , become secondary stack-chips.
function splitMoreTagToChips(text) {
  // HTML-decode common entities Webflow uses.
  const decoded = text
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .trim();
  let primary = null;
  let rest = decoded;
  // If there's a colon early on, treat what's before as a category label.
  const colonIdx = decoded.indexOf(':');
  if (colonIdx > 0 && colonIdx < 40) {
    primary = decoded.slice(0, colonIdx).trim();
    rest = decoded.slice(colonIdx + 1).trim();
  }
  const tools = rest.split(/\s*[+|,]\s*/).map((s) => s.trim()).filter(Boolean);
  const escape = (s) => s.replace(/[<>&"]/g, (c) => ({ '<':'&lt;', '>':'&gt;', '&':'&amp;', '"':'&quot;' }[c]));
  const chips = [];
  if (primary) chips.push(`<span class="more-chip-primary">${escape(primary)}</span>`);
  for (const t of tools) chips.push(`<span class="more-chip">${escape(t)}</span>`);
  return chips.join('');
}

function applyMorePagePatches(html) {
  // Tag the cards section so the filter's section-empty machinery can hide its heading.
  html = html.replace(
    /<section\s+class="section-selected black-bg"(?![^>]*data-filterable-section)/,
    '<section class="section-selected black-bg" data-filterable-section'
  );

  // Walk each card and (a) write data-tags from the title map, (b) replace the
  // long plain-text tag with chip markup.
  return html.replace(
    /(<div\s+[^>]*class="collection-item-2 w-dyn-item"[^>]*)(>[\s\S]*?<h1[^>]*class="secondary-heading project-title"[^>]*>)([^<]+)(<\/h1>[\s\S]*?<p\s+[^>]*class="tag scroll-right"[^>]*>)([^<]+)(<\/p>)/g,
    (full, openDiv, midPre, title, midPost, tagText, end) => {
      // Use the explicit title map; default to 'physical' if title is somehow missing.
      const cleanTitle = title.replace(/&amp;/g, '&').trim();
      const tags = (MORE_PAGE_TAGS[cleanTitle] || ['physical']).join(' ');
      const newOpen = openDiv.includes('data-tags=')
        ? openDiv
        : `${openDiv} data-tags="${tags}"`;
      const chipsHtml = splitMoreTagToChips(tagText);
      return `${newOpen}${midPre}${title}${midPost}${chipsHtml}${end}`;
    }
  );
}

// =====================================================================
// New section markup (kept as constants for readability).
// =====================================================================

const AI_BUILDS_SECTION = `<article id="ai-builds" class="section-selected" data-filterable-section>
  <div class="container w-container">
    <h1 class="secondary-heading">AI Builds</h1>
    <p class="section-subtitle">Products I designed and shipped end-to-end.</p>
    <aside class="collection-list-wrapper-5 w-dyn-list">
      <div role="list" class="collection-list-4 w-dyn-items">
        <div role="listitem" class="collection-item w-dyn-item" data-tags="ai-build product-design"><a href="/mornova" class="link-block w-inline-block"><div class="div-block-10"><img alt="" loading="lazy" src="/_assets/cdn.prod.website-files.com/643754b8d27d2714812a10b5/692fe937530f1ae410a0f92c_Mornova_20Final_20Pre.jpg" class="cover-img profile-img"><h2 class="secondary-heading project-title">Mornova</h2>
          <div class="chip-row"><span class="chip chip-primary chip-ai">AI Build</span><span class="chip chip-secondary">Product Design</span><span class="chip chip-secondary chip-live">Live demo</span></div>
          <div class="stack-row"><span class="stack-chip">Claude</span><span class="stack-chip">Webflow</span><span class="stack-chip">Hardware</span></div>
          <p class="transparent-subtitle">An AI morning assistant. Blends weather, calendar, and ambient lighting to wake me up with warm gradients and voice prompts.</p>
          <p class="outcome-line">Daily-use personal product · functional prototype</p>
        </div></a></div>
        <div role="listitem" class="collection-item w-dyn-item" data-tags="ai-build ux-research"><a href="/scalesocial" class="link-block w-inline-block"><div class="div-block-10"><img alt="" loading="lazy" src="/_assets/cdn.prod.website-files.com/643754b8d27d2714812a10b5/6938a001e188d69d339049f8_hero_20ss.avif" class="cover-img profile-img"><h2 class="secondary-heading project-title">Scale Social <span style="font-size:0.6em; vertical-align: middle;">🔒</span></h2>
          <div class="chip-row"><span class="chip chip-primary chip-ai">AI Build</span><span class="chip chip-secondary">UX Research</span><span class="chip chip-locked">Request access</span></div>
          <div class="stack-row"><span class="stack-chip">Figma</span><span class="stack-chip">AI tooling</span><span class="stack-chip">Prototype</span></div>
          <p class="transparent-subtitle">UX research and prototype work for an AI UGC platform — exploring control models that keep brand content authentic while adopting automation.</p>
          <p class="outcome-line">Pitched and adopted by client team</p>
        </div></a></div>
      </div>
    </aside>
  </div>
</article>`;

const AI_FILMS_SECTION = `<article id="ai-films" class="section-ai-films" data-filterable-section>
  <div class="container w-container" style="padding-bottom: 30px;">
    <h1 class="secondary-heading">AI Films</h1>
    <p class="section-subtitle">Generative video experiments.</p>
    <div class="ai-films-grid">
      <a href="/more-projects-gallery#filter=ai-film" class="ai-film-card collection-item" data-tags="ai-film">
        <div style="background: linear-gradient(135deg, #1d3557 0%, #6b4e71 50%, #d4583b 100%); width:100%; height:100%; min-height:220px;"></div>
        <div class="ai-film-overlay">
          <h3>Space We Call Home</h3>
          <div class="ai-film-meta">Runway + Midjourney + Adobe Premiere</div>
        </div>
      </a>
      <div class="ai-film-card placeholder collection-item" data-tags="ai-film">
        New film coming →
      </div>
    </div>
  </div>
</article>`;

const CHAT_ITP_DESIGN_CARD = `<div role="listitem" class="collection-item w-dyn-item chatitp-design-card" data-tags="ai-build product-design"><a href="/projects/chat-itp" class="link-block w-inline-block"><div class="div-block-10" style="border-color: hsla(218, 45%, 80%, 1);"><div class="cover-img profile-img" style="background: linear-gradient(135deg, #C9D9EF 0%, #E8D5C4 100%); width: 100%; height: 380px; display: flex; align-items: center; justify-content: center; font-family: 'Playfair Display', serif; font-size: 56px; color: var(--dark-brown); opacity: 1;">💬</div><h2 class="secondary-heading project-title" style="opacity: 1;">ChatITP</h2><div class="tag" style="opacity: 1;">AI Conversation Design | OpenAI API | Early Exploration</div><p class="transparent-subtitle" style="opacity: 1;">An early experiment in conversational interfaces — exploring how natural-language prompts could replace traditional UI controls.</p></div></a></div>`;

const ABOUT_SNAPSHOT = `<section class="section-about-snapshot">
  <div class="about-snapshot">
    <img src="/_assets/local/duorfan-profile-pic.jpg" alt="Duorfan">
    <div class="about-snapshot-text">
      <h3>Hi, I'm Duorfan.</h3>
      <p>Half product designer, half AI builder. I design experiences that feel calm and human, and ship the AI products that power them. Recent work spans morning assistants, AI UGC platforms, generative films, and a lot of small experiments.</p>
      <a href="/about-me" class="about-link">Read my story →</a>
    </div>
  </div>
</section>`;

// =====================================================================
// Main IIFE — runs after all helper functions and section constants
// have been declared above, so no TDZ issues.
// =====================================================================
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

  console.log('[customize] copying override assets ...');
  copyOverrideAssets();
  copyChatItpPage();

  console.log('[customize] injecting overrides + applying per-page patches ...');
  walkAndRewrite(SITE, ['.html'], (src, filePath) => {
    let html = src;
    const rel = path.relative(SITE, filePath).split(path.sep).join('/');
    html = injectLocalAssets(html, rel);
    html = applyFooterAsk(html);
    if (rel === 'index.html')                            html = applyHomePagePatches(html);
    else if (rel === 'about-me/index.html')              html = applyAboutPatches(html);
    else if (rel === 'mornova/index.html')               html = applyMornovaPatches(html);
    else if (rel === 'more-projects-gallery/index.html') html = applyMorePagePatches(html);
    // Project case-study pages: rebuild the bottom "other projects" carousel from PROJECT_REGISTRY.
    const projectSlugMatch = rel.match(/^projects\/([a-z0-9-]+)\/index\.html$/);
    if (projectSlugMatch) {
      const slug = '/projects/' + projectSlugMatch[1];
      html = rebuildOtherProjectsCarousel(html, slug);
    }
    return html;
  });

  console.log('Done. Local site at:', SITE);
})();

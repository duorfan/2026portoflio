// Tiny static file server for the rebuilt site/. No deps — runs on Node's stdlib.
//
//   node server.js            (defaults to http://localhost:5173)
//   PORT=8080 node server.js  (override port)
//
// Behavior:
//   - Serves files from ./site
//   - GET /foo → /foo/index.html if it's a directory
//   - GET /foo → /foo.html if that file exists (Webflow-style clean URLs)
//   - Otherwise 404

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const ROOT = path.join(__dirname, 'site');
const PORT = process.env.PORT ? Number(process.env.PORT) : 5173;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.mjs':  'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.mp4':  'video/mp4',
  '.webm': 'video/webm',
  '.woff':  'font/woff',
  '.woff2': 'font/woff2',
  '.ttf':   'font/ttf',
  '.otf':   'font/otf',
};

function safeResolve(requestPath) {
  const decoded = decodeURIComponent(requestPath.split('?')[0]);
  const joined = path.join(ROOT, decoded);
  const normalized = path.resolve(joined);
  if (!normalized.startsWith(path.resolve(ROOT))) return null;
  return normalized;
}

// The Mornova iframe is a Vite bundle whose minified JS hardcodes "/assets/<hash>" image
// URLs. We can't rewrite those reliably, so we map any unresolved /assets/* request to the
// equivalent file under /_assets/mornova.duorfan.com/assets/*.
const SUBAPP_ASSETS_FALLBACK = path.join(ROOT, '_assets', 'mornova.duorfan.com', 'assets');

function tryPaths(p) {
  if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) {
    const idx = path.join(p, 'index.html');
    if (fs.existsSync(idx)) return idx;
  }
  const withIndex = path.join(p, 'index.html');
  if (fs.existsSync(withIndex)) return withIndex;
  if (fs.existsSync(p + '.html')) return p + '.html';
  // Fallback: /assets/<anything> → /_assets/mornova.duorfan.com/assets/<anything>
  const assetsPrefix = path.join(ROOT, 'assets') + path.sep;
  if (p.startsWith(assetsPrefix)) {
    const rest = p.slice(assetsPrefix.length);
    const alt = path.join(SUBAPP_ASSETS_FALLBACK, rest);
    if (fs.existsSync(alt) && fs.statSync(alt).isFile()) return alt;
  }
  return null;
}

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url);
  const requested = parsed.pathname || '/';
  const candidate = safeResolve(requested);
  if (!candidate) {
    res.writeHead(400); res.end('Bad request'); return;
  }
  const file = tryPaths(candidate);
  if (!file) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`404 Not Found: ${requested}`);
    return;
  }
  const ext = path.extname(file).toLowerCase();
  const mime = MIME[ext] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-cache' });
  fs.createReadStream(file).pipe(res);
});

server.listen(PORT, () => {
  console.log(`Serving ./site on http://localhost:${PORT}`);
  console.log('Press Ctrl+C to stop.');
});

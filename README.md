# Duorfan portfolio — local rebuild

A local, runnable copy of [www.duorfan.com](https://www.duorfan.com) reconstructed entirely
from a Chrome DevTools Protocol (CDP) crawl. The original site is a Webflow build; this
project preserves the rendered HTML, stylesheets, scripts, images, videos, and fonts
exactly as the browser saw them.

## What's in here

| path | purpose |
| --- | --- |
| `cdp-crawl.js` | Crawls duorfan.com via CDP. Visits every same-origin page reachable from `/`, captures the rendered HTML and every network response body, writes everything under `captured/`, and saves a URL→file manifest. |
| `build-site.js` | Stages the captured tree into `site/`, rewriting absolute URLs (for assets we actually captured) to local paths. Uses the manifest for exact-string replacement. |
| `server.js` | Zero-dependency static server. Serves `site/` on `http://localhost:5173`. |
| `captured/` | Raw output of the CDP crawl. Mirrors original URL paths per host (e.g. `captured/cdn.prod.website-files.com/...`). |
| `site/` | The runnable local site. Pages at `/`, `/about-me`, `/projects/<slug>`, etc. All third-party assets under `/_assets/<host>/...`. |

## Run it

```bash
npm install
npm start
```

Then open <http://localhost:5173>.

## Re-capture from the live site

This is only needed if you want a fresh snapshot. Requires Chrome running with the
DevTools Protocol enabled on port 9222:

```bash
# Launch Chrome with CDP (use a separate profile dir so it doesn't fight your main Chrome)
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 \
  --user-data-dir=/tmp/chrome-cdp

# Then in this repo:
npm run rebuild   # crawls → builds → site/ is ready
npm start
```

## Pages captured

Reachable from the home-page link graph:

- `/`                              — Home / selected projects
- `/about-me`                      — About
- `/more-projects-gallery`         — More work
- `/mornova`                       — Mornova AI case study
- `/scalesocial`                   — Scale Social AI case study
- `/projects/schego`               — ScheGo
- `/projects/cyco`                 — CYCO
- `/projects/ver-coaching`         — Ver Coaching
- `/projects/capybara-ai`          — Capybara.AI
- `/projects/self-coded-website`   — Web Roots

## Notes

- Responsive `srcset` and `sizes` attributes are stripped during the build, because the
  browser would otherwise prefer a `-p-500.png`-style variant we didn't capture. Only the
  primary `src` image (which we *did* capture) is used.
- `.webm` `<source>` siblings are left pointing at the CDN. Browsers fall back to the
  local `.mp4` automatically when the `.webm` request fails.
- External links (LinkedIn, Instagram, Drive, etc.) are intentionally left untouched.

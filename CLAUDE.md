# Project context for Claude (read me first)

A local rebuild of www.duorfan.com captured from the live Webflow site via CDP,
then reshaped into an "AI product designer & builder" portfolio. The site is
**deployed to Vercel from this repo's `main` branch** — Vercel serves the
committed `site/` folder directly (no Vercel build step).

## How the build works

```
captured/               raw CDP snapshot (host-mirrored)
   │
   ▼
build-site.js           stages captured/ into site/, rewrites URLs to local
   │                    paths, then runs per-page patches (applyHomePagePatches,
   │                    applyAboutPatches, applyMornovaPatches,
   │                    applyMorePagePatches, rebuildOtherProjectsCarousel,
   │                    applyFooterAsk, applyLandingPageCustomizations)
   ▼
site/                   deployable static output (TRACKED in git; Vercel serves it)
```

Hand-authored content lives in `site-customizations/`:
- `local-overrides.css` — all visual overrides (chip filters, FAB, sections, etc.)
- `local-overrides.js` — runtime behavior (FAB + sheet, filter chips, scroll UI,
  Scale Social password gate, name-wrapper guard)
- `chat-itp.html` — full HTML for the new ChatITP project page
- `duorfan-profile-pic.jpg` (and any other media) — copied to `/_assets/local/`

`copyOverrideAssets()` in build-site.js copies every file at the root of
`site-customizations/` to `site/_assets/local/`, so dropping a new image there
is zero-config.

## Daily loop

```bash
npm install              # one-time
npm run build            # stages captured → site, applies patches
npm start                # serves site/ on http://localhost:5173

# screenshots / verification
npm run verify           # CDP-walks all 11 pages, reports 404s + console errors
npm run probe            # clicks every filter chip on /, reports visible cards
npm run shoot <url> <selector> <out>   # scroll-into-view screenshot helper
```

## Commit + push workflow

- **Never auto-commit.** Leave changes staged/unstaged; the user triggers commits.
  (This is also in the user's global CLAUDE.md.)
- When asked to commit: stage relevant files only (skip `.claude/settings.local.json`
  and anything in `captured/`), write a descriptive multi-paragraph message, push
  to `main`. Vercel picks it up automatically and redeploys in ~1 minute.
- The project's `main` history is shaped by direct pushes — there is no
  long-lived PR workflow. Bypass PR creation unless the user explicitly asks.

## Gitignore gotchas

- `site/` is **NOT gitignored** — Vercel needs it tracked to deploy
- `captured/` is gitignored *but* the original 116 files are already tracked
  (legacy from the initial commit). Don't try to untrack — too noisy.
- `diagnostics/` (screenshots + verify-report) is gitignored — regenerated on demand
- `.claude/settings.local.json` is gitignored and untracked — don't commit it

## Quirks worth remembering

### Webflow IX2 vs my CSS
Many design cards carry `data-w-id` attributes that drive Webflow's IX2
animation runtime. IX2 sets inline `style="transform: ..."` and `opacity: 0.09`
on these elements. Three patterns recur:
1. **Inline scale on hover** — IX2 sets `scale3d(1.05, 1.05, 1)` on
   `.div-block-10` when hovered. Override with `transform: translateY(-4px)
   !important` on `:hover` AND `transform: none !important` on base state (so
   the inline scale doesn't echo on mouseleave).
2. **Pre-render opacity 0.09** — IX2 starts elements at opacity 0.09 and
   animates to 1 on scroll-into-view. If you change the class (e.g. via
   `chipifyDesignTags`), IX2 no longer recognizes the element and it stays at
   opacity 0.09. Force `opacity: 1 !important` to defeat.
3. **`!important` in shorthand must be at the END** —
   `transition: a, b !important, c` is invalid CSS and the whole declaration
   gets dropped. Always: `transition: a, b, c !important`.

### Filter system
Two page-specific filter taxonomies live in `local-overrides.js`:
- `FILTER_DEFS_LANDING` — ai-build / ai-film / product-design / ux-research /
  front-end / creative-tech (landing's professional-work axis)
- `FILTER_DEFS_MORE` — games / av / physical / graphic / ai / ui (More gallery's
  creative-work axis)

Selection: `const IS_MORE_PAGE = /\/more-projects-gallery/.test(location.pathname)`.

Mobile uses a FAB + bottom sheet on landing only. More gallery uses an inline
non-sticky filter (21 finite cards don't need always-on access).

Card data-tags are written by `applyHomePagePatches` (`designTagMap`) and
`applyMorePagePatches` (`MORE_PAGE_TAGS`). When adding a new project, update
both the mapping AND the relevant filter CSS rule
(`html[data-filter="X"] .collection-item-2:not([data-tags~="X"]) { display: none }`).

### Responsive
Belt-and-suspenders against Webflow's narrow-mobile bugs:
- `html, body { overflow-x: hidden }`
- `.navbar-2, .nav-container.w-container, .w-nav-overlay { max-width: 100vw }`
- All project cards: `min-width: 0` on grid items, `min-width: 0 !important;
  max-width: 100% !important` on thumbnail images (defeats the Webflow
  `.profile-img { min-width: 100% }` rule)

### Section structure on home
After build, the home page has top-level articles:
- `<article id="ai-builds">` — Mornova + Scale Social
- `<article id="selected-project">` — design work + ChatITP at end
- `<article id="ai-films">` — Space We Call Home + placeholder
- `<section class="section-about-snapshot">` — bio + photo
- `<section class="footer">` — social links + Claude Code attribution

`applyHomePagePatches` does some careful surgery to keep these as siblings (the
original captured HTML nested the More-projects link inside `#selected-project`).
If you see "AI Films" rendering inside Selected Design Work, the article-close
patch broke.

## Idempotency rule

Every patch in `build-site.js` MUST be idempotent. Re-running `npm run build`
should produce identical output. Standard guard: `if (html.includes(MARKER)
&& !html.includes(REPLACED_MARKER))` or `if (!html.includes(NEW_CLASS))`.

## When in doubt

- Read the CSS section headers in `site-customizations/local-overrides.css` —
  they're numbered (1, 2, 3a, 3b…) and describe what each block does
- Read the comment block above each function in `build-site.js`
- For visual regressions: `npm run shoot <url> <selector> <out>` then read the PNG

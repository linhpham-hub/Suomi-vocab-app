# CLAUDE.md — Suomen Sanasto (Finnish vocabulary app)

Context for any future Claude (or human) session working in this repo.

## What this is

A static, no-build, no-backend web app for studying Finnish A1.2 vocabulary
(flashcards / quiz / write, FI↔EN). Built for Chloe as a personal study tool,
deployed like her other custom apps (Next.js property tracker) but simpler:
plain HTML/CSS/JS since there's no shared data or multi-user need here.

Full details: see `README.md` in this folder.

## Tech choices (and why)

- **No framework, no build step.** Just `index.html` + `css/style.css` +
  `js/app.js` + `js/srs.js`. Chosen deliberately (see decisions below) —
  don't introduce React/Next.js/a bundler unless Chloe explicitly asks for it.
- **No backend/database.** Vocabulary is a static `data/vocab.json` file,
  regenerated from the course's Word-doc glossaries via
  `scripts/build_vocab.py`. Progress is `localStorage` only, per-device.
- **PWA via a hand-written `sw.js`.** Cache-first, precaches every asset by
  literal path. Because there's no bundler there are no hashed filenames, so
  this is simpler and more reliable than a generated service worker would be.
  **If you add/rename/remove any file the app loads, update `PRECACHE_URLS`
  in `sw.js` and bump `CACHE_NAME`**, or offline mode will serve stale files.

## Key decisions made when this was built (2026-09-22)

Asked Chloe explicitly and she chose:
- Static data files over a database (easier to keep offline, no backend to run)
- Local-only progress over cross-device sync (no login needed)
- "I build it, you deploy" over Claude driving her GitHub/Vercel accounts

Design: pastel/warm minimalist per her stated taste, **no green anywhere**
(including status colors — "correct" uses warm gold/amber, not green, "wrong"
uses a dusty rose/red). Keep this if you touch the CSS or add emoji/icons —
watch out especially for default-colored emoji like ✅ which render green.

## Working in this repo

- Everything is hand-editable directly — no `npm install` needed to run or
  edit it. To preview: `python3 -m http.server 8000` from this folder.
- The npm/pip package registries were **not reachable** from the sandbox this
  was originally built in (org network policy blocked registry.npmjs.org and
  pypi.org), which is why this is vanilla JS rather than the originally
  discussed Next.js stack. If registries are reachable in a future session
  and Chloe wants to migrate to a framework, that's a rebuild, not a port —
  ask her first, since the current app already meets the brief.
- Tested with Playwright (Chromium) during development: all three study
  modes, the stats page, and full offline reload (service worker) were
  verified working end-to-end. There's no committed test suite — if you
  change core logic (`js/app.js`, `js/srs.js`), it's worth re-verifying
  manually (or with a quick Playwright script) rather than assuming it works.
- To add a new chapter's vocabulary: drop the new
  `Glossary chapter N.docx` into the course's glossary folder and re-run
  `scripts/build_vocab.py` (see README). Don't hand-edit `data/vocab.json`
  for bulk additions — regenerate it so it stays in sync with the source docs.

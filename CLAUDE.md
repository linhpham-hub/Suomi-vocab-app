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
  `js/app.js` + `js/srs.js` (+ `js/sync.js`, `js/dashboard.js`, `js/config.js` —
  see "Friend sharing" below). Chosen deliberately (see decisions below) —
  don't introduce React/Next.js/a bundler unless Chloe explicitly asks for it.
- **No required backend/database.** Vocabulary is a static `data/vocab.json`
  file, regenerated from the course's Word-doc glossaries plus
  `data/hints.json` via `scripts/build_vocab.py`. Study progress is
  `localStorage` only, per-device. Supabase is used only for the *optional*
  friend-progress dashboard (below) — the app is fully functional with zero
  backend if that isn't set up.
- **PWA via a hand-written `sw.js`.** Cache-first, precaches every asset by
  literal path. Because there's no bundler there are no hashed filenames, so
  this is simpler and more reliable than a generated service worker would be.
  **If you add/rename/remove any file the app loads, update `PRECACHE_URLS`
  in `sw.js` and bump `CACHE_NAME`**, or offline mode will serve stale files.
  The fetch handler explicitly skips cross-origin requests (`url.origin !==
  self.location.origin`) so it never caches/serves stale Supabase responses —
  keep that check if you rewrite the fetch handler.

## Key decisions made when this was built (2026-09-22)

Asked Chloe explicitly and she chose:
- Static data files over a database (easier to keep offline, no backend to run)
- Local-only progress over cross-device sync (no login needed)
- "I build it, you deploy" over Claude driving her GitHub/Vercel accounts

**Color scheme (updated 2026-09-23):** Chloe gave an explicit 10-color
palette to use throughout: `35858E 7DA78C C2D099 E6EEC9 091413 285A48 408A71
B0E4CC DCCCAC FFF8EC`. This **replaces and overrides** the original "no green
anywhere" design note from the initial build — several of these are green
shades and that's now correct and intentional. All theming lives in CSS
custom properties in `:root` (light) and a `@media (prefers-color-scheme:
dark)` block (dark) in `css/style.css`, using only these ten colors. If you
touch the CSS, stay within this palette rather than reintroducing arbitrary
colors or reverting to "no green."

## Friend sharing (added 2026-09-23, all optional)

Chloe wanted to share the app with friends without making them register
(no email/OTP), while still being able to see everyone's progress herself.
After discussion she chose: friends get a one-time, skippable name prompt
(no password), their progress syncs silently to Supabase in the background,
and she views it on a hidden `/dashboard.html` page gated by a passphrase.
She was explicitly told and accepted the trade-off that this passphrase is
not real security (the anon key is public, visible in the site's own JS) —
fine for a small friend group and low-stakes data (word-mastery counts only).
Full setup steps (Supabase project + SQL + config) are in `README.md` →
"Sharing this with friends" — **not yet done by Chloe as of this writing**;
`js/config.js` ships with placeholder values and everything no-ops safely
until she fills it in.

- `js/sync.js` — generates/stores a per-device UUID + player name in
  localStorage, shows the name-prompt modal (`#name-modal` in `index.html`)
  on first run, and POSTs a progress snapshot to Supabase's PostgREST API
  (upsert on `device_id`) after each quiz session. `syncIsConfigured()` gates
  all of this — it no-ops entirely until real values are in `js/config.js`.
- `dashboard.html` + `js/dashboard.js` — standalone page, deliberately **not
  linked from `index.html`'s nav** (findable only if you know the URL) and
  marked `noindex, nofollow`. Passphrase check is a plain client-side string
  compare against `APP_CONFIG.DASHBOARD_PASSPHRASE`; unlock state persists
  only for the browser tab (`sessionStorage`). Reads all rows from the
  `progress` table and renders one card per friend, reusing the same
  `.chapter-stat` bar styles as the main stats page.
- If you change what's stored per-device (e.g. add a new stat), update the
  snapshot shape in `buildProgressSnapshot()` (`js/sync.js`), the Supabase
  table schema (README SQL), and `renderFriendCard()` (`js/dashboard.js`)
  together — they all assume the same row shape.

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
  modes, the Browse Glossary page, the stats page, full offline reload
  (service worker), the name-prompt modal, safe no-op sync when Supabase
  isn't configured, and the dashboard's passphrase gate were all verified
  working end-to-end. There's no committed test suite — if you change core
  logic (`js/app.js`, `js/srs.js`, `js/sync.js`), it's worth re-verifying
  manually (or with a quick Playwright script) rather than assuming it works.
- To add a new chapter's vocabulary: drop the new
  `Glossary chapter N.docx` into the course's glossary folder, add a
  contextual hint per new word to `data/hints.json`, and re-run
  `scripts/build_vocab.py` (see README). Don't hand-edit `data/vocab.json`
  for bulk additions — regenerate it so it stays in sync with the source docs.
- **Hints** (`data/hints.json`, keyed by word id) are contextual clues ("What
  you use to pay — cash"), not first-letter reveals — keep new hints in that
  style. `build_vocab.py` merges them into `vocab.json` at build time and
  warns about any word missing one.
- **Praise/feedback messages** for correct answers and quiz summaries are
  randomized from arrays in `js/app.js` (`PRAISE`, `SUMMARY_PRAISE_*`) for
  variety (emoticons like `^o^`, `:)`, `*strong*`) — add to these arrays
  rather than hardcoding a single message if asked for more variety.

# Suomen Sanasto — Finnish A1.2 Vocabulary App

A flashcard / quiz / writing-practice app for the vocabulary from the Metropolia
Finnish A1.2 course. Plain HTML/CSS/JS — no framework, no build step, no
backend — so there's nothing to install to run or edit it, and it works fully
offline once loaded (installable as a PWA on your phone or laptop).

## What it does

- **312 words** pulled from the course glossaries (Chapters 1–2, 3, 4, 5)
- **Flashcards** — flip to reveal the answer, self-grade "Still learning" / "Got it"
- **Quiz** — multiple choice, 4 options per question
- **Write** — type the translation; accepts reasonable variants (e.g. "call" for
  "to call", ignores optional "(around)" hints, accepts "/"-separated alternatives)
- Pick a **direction**: FI → EN, EN → FI, or Mixed
- Filter by **chapter**, or study everything at once
- **Review due** uses simple spaced repetition (a 6-box Leitner system) so words
  you keep getting right show up less often, and ones you miss come back sooner
- **Progress** is saved on-device only (`localStorage`) — private, no login, but
  it won't follow you to a different phone/laptop
- **Browse Glossary** — every word from every chapter on one page, for a quick
  scan or lookup (not a study mode, just a reference list)
- **Hints** in Write mode are contextual clues ("What you use to pay — cash"),
  not spoilers like "starts with R"
- Installable as a **PWA**: "Add to Home Screen" on phone, or install icon in
  Chrome/Edge on desktop. Once installed it keeps working with no internet.
- **Optional: share progress with friends.** Friends can use their own copy of
  the app fully offline with no setup. If you want a private dashboard to see
  everyone's progress, see "Sharing this with friends" below — it's opt-in and
  the app works completely fine without it.

## Project structure

```
vocab-app/
├── index.html            # single-page app shell + all view templates
├── dashboard.html        # hidden, passphrase-gated owner dashboard (optional feature)
├── manifest.webmanifest  # PWA metadata
├── sw.js                 # offline service worker (cache-first)
├── css/style.css
├── js/
│   ├── app.js            # all app logic & rendering
│   ├── srs.js            # spaced-repetition + localStorage progress
│   ├── sync.js           # name prompt + optional silent progress sync
│   ├── dashboard.js       # dashboard.html logic
│   └── config.js         # Supabase URL/key + dashboard passphrase (fill in to enable sharing)
├── data/
│   ├── vocab.json         # the word list (generated, see below)
│   └── hints.json         # contextual hint text per word, merged into vocab.json on build
├── icons/                 # app icons
└── scripts/build_vocab.py # regenerates data/vocab.json from the glossary .docx files + hints.json
```

## Adding new chapters later

The course glossaries live in
`Glossaries/word lists and games/Glossary chapter N.docx` (two-column FIN/ENG
Word tables). When a new chapter's glossary doc is added there, regenerate the
word list instead of editing JSON by hand:

```bash
pip install python-docx   # one-time, only needed to run this script
python3 scripts/build_vocab.py "/path/to/Glossaries/word lists and games" --out data/vocab.json
```

It picks up any file matching `Glossary chapter*.docx` automatically — no code
changes needed for new chapters. Commit the updated `data/vocab.json` and
redeploy (see below).

New words won't have a hint yet — the build script prints a warning listing
any word ids missing one. Add a short contextual clue for each (a sentence
describing what the word means or when you'd use it — not the first letter
or a direct translation) to `data/hints.json`, keyed by the word's numeric id,
then re-run the build script.

## Try it locally

No install needed — any static file server works, e.g.:

```bash
cd vocab-app
python3 -m http.server 8000
# open http://localhost:8000
```

(Opening `index.html` directly by double-clicking won't work for the `fetch()`
of `data/vocab.json` — a local server, or a real deployment, is needed.)

## Sharing this with friends (optional)

By default, friends can just install the same deployed app and study with it —
progress stays on their own device, nothing to set up, no accounts. If you
also want a **private dashboard** to see everyone's progress, this needs a
free Supabase project (a hosted database with a simple web API). Skip this
whole section if you don't want that — the app works completely normally
without it.

**How it works:** the first time someone opens the app, they're asked for a
name (or they can skip it — no password, nothing required). After each study
session, their progress is quietly sent to your Supabase project in the
background. You view everyone's progress on a hidden page, `/dashboard.html`,
protected by a passphrase you choose.

**Security note, read before turning this on:** the passphrase on
`/dashboard.html` only hides the page from someone casually browsing your
site — it is not real login security. The same public key that lets the
dashboard read the data also lives in the app's own JavaScript files (visible
to anyone who opens dev tools), so someone sufficiently determined could
technically query the data directly, bypassing the passphrase entirely. This
is an accepted trade-off for a small friend group sharing low-stakes data
(word-mastery counts — nothing personal or sensitive). Don't use this pattern
for anything more sensitive than that.

### Setup steps

1. **Create a free Supabase project** at [supabase.com](https://supabase.com) →
   New Project. Pick any name/password/region (the password is just for the
   project's own database console — you won't need it day to day).

2. **Create the `progress` table.** In the Supabase dashboard, go to the
   **SQL Editor** → New query, paste this, and run it:

   ```sql
   create table if not exists progress (
     device_id text primary key,
     name text not null default 'Friend',
     chapters jsonb not null default '{}'::jsonb,
     total_mastered int not null default 0,
     total_learning int not null default 0,
     total_words int not null default 0,
     last_active timestamptz not null default now(),
     updated_at timestamptz not null default now()
   );

   alter table progress enable row level security;

   create policy "anon can upsert their own row"
     on progress for insert to anon with check (true);

   create policy "anon can update any row"
     on progress for update to anon using (true) with check (true);

   create policy "anon can read all rows"
     on progress for select to anon using (true);
   ```

   This makes a table with one row per device, and opens it up so the app's
   public "anon" key can write a friend's own progress and read everyone's —
   there's no per-user login, so these permissive policies are what make the
   "no registration" sharing model work. This is the same trade-off described
   in the security note above.

3. **Get your API keys.** In Supabase: Project Settings → API. Copy the
   **Project URL** and the **`anon` `public`** key (not the `service_role`
   key — never put that one in client-side code).

4. **Fill in `js/config.js`** in this folder:

   ```js
   window.APP_CONFIG = {
     SUPABASE_URL: "https://xxxxx.supabase.co",   // your Project URL
     SUPABASE_ANON_KEY: "eyJ...",                  // your anon public key
     DASHBOARD_PASSPHRASE: "pick-something-only-you-know",
   };
   ```

5. **Commit and redeploy** (`git add . && git commit -m "Enable friend sharing" && git push`).
   Once deployed, open `https://<your-app>.vercel.app/dashboard.html`, enter
   your passphrase, and you'll see every friend who has studied since, listed
   by name with their per-chapter progress.

Until you fill in real values, `js/config.js` ships with placeholder text
(`YOUR_SUPABASE_URL_HERE`) and the app quietly skips syncing — nothing breaks,
nothing is sent anywhere, and the dashboard just shows "sync isn't set up yet."

## Deploy — GitHub + Vercel (same pattern as the property tracker app)

1. **Create the GitHub repo**
   - Go to github.com → New repository (e.g. `finnish-vocab-app`), keep it empty (no README/license).
   - In this `vocab-app` folder:
     ```bash
     git init
     git add .
     git commit -m "Initial commit: Finnish A1.2 vocabulary app"
     git branch -M main
     git remote add origin https://github.com/<your-username>/finnish-vocab-app.git
     git push -u origin main
     ```

2. **Deploy on Vercel**
   - Go to vercel.com → Add New → Project → Import the GitHub repo you just pushed.
   - Framework preset: choose **"Other"** (it's a static site — no build command, no output directory needed).
   - Click **Deploy**. You'll get a URL like `https://finnish-vocab-app.vercel.app`.

3. **Install it on your phone**
   - Open the Vercel URL on your phone in Chrome/Safari.
   - Chrome (Android): menu → "Add to Home screen". Safari (iOS): Share → "Add to Home Screen".
   - Once added, it opens full-screen like a native app and works with no signal/wifi.

4. **Updating later** (new chapter, tweak, fix): just `git add . && git commit -m "..." && git push` —
   Vercel redeploys automatically on every push to `main`.

No environment variables, no database, no sign-in — it's a static site, so this
is the entire setup.

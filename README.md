# Suomen Sanasto — Finnish A1.2 Vocabulary App

A study app for the Metropolia Finnish A1.2 course: vocabulary practice,
dialogues, numbers, shopping phrases and oral-test prep, with pronunciation.
Plain HTML/CSS/JS, so there's no framework and no build step. It works fully
offline once loaded (installable as a PWA). Online extras (friend dashboard,
device sync, feedback) are optional and use a free Supabase project.

## What it does

Five tabs along the bottom:

- **📚 Study**: pick chapters (✓ shows what's included; **All** / **None**
  shortcuts), direction (FI → EN, EN → FI, Mixed) and **words per session**
  (10 / 15 / 25 / 50 / All). Then:
  - **🎯 Focus words**: only the words you got wrong (or half right) last time
  - **🃏 Flashcards**: flip and self-grade
  - **🎲 Quiz**: multiple choice
  - **⌨️ Write**: type the answer. Accepts variants ("call" for "to call",
    either side of "/", optional "(around)"). Missing the dots (a for ä) gives
    **+0.5**. There are ä/ö buttons for keyboards without them, and 💡 hints
    are contextual clues, not the first letter.
- **📖 Words**: every glossary word with search (Finnish or English, works
  without typing the dots), chapter + level filters, 🔊 pronunciation, and the
  teacher's Wordwall games.
- **💬 Talk**: 5 short practice dialogues (chapters 1–3) where every glossary
  word is underlined (tap for meaning + sound, ▶ Play all). Also numbers in
  standard vs spoken Finnish, a price trainer, a listening game and shopping
  phrases.
- **🎤 Oral test**: the teacher's 26 basic questions with spoken forms and
  example answers, a random-5 practice run, ⭐ for hard ones, and a box to
  write (and hear) your own answer.
- **📊 Progress**: how "Mastered" works, bars per chapter, and every word
  grouped by level (🎯 Needs focus / 🌱 Getting there / 🔥 Almost / 🏆 Mastered /
  ⚪ Not started). Also device sync, voice settings and feedback.

**Levels:** each right answer moves a word up one step; 5 right in a row =
Mastered. A wrong answer resets it. Half right (missing dots, or used a hint)
= +0.5 point and the word stays where it is.

**Pronunciation** uses the device's built-in Finnish voice (free, no key).
Android (Google) and iPhone (Satu) have one. On Windows, add it under
Settings → Time & language → Speech → Add voices → Finnish.

Progress is saved on the device. Optionally, learners can tick **"Save my
progress to all my devices"** and use a name + 4-digit PIN to open the same
progress on any phone or browser (see setup below). It's installable as a
**PWA** and works offline.

## Project structure

```
vocab-app/
├── index.html            # page shell, tab bar and all view templates
├── dashboard.html        # hidden, passphrase-gated owner dashboard
├── sw.js                 # offline service worker (network first, cache fallback)
├── css/style.css
├── js/
│   ├── config.js         # Supabase URL/key, Microsoft Form link
│   ├── ui.js             # shared helpers (🔊 buttons, chapter chips, toasts, word popover)
│   ├── speech.js         # pronunciation (Web Speech API)
│   ├── srs.js            # word levels / spaced repetition, saved in localStorage
│   ├── sync.js           # dashboard snapshot + name/PIN device sync
│   ├── feedback.js       # feedback form
│   ├── app.js            # data loading, tabs, Study tab and study sessions
│   ├── words.js | talk.js | oral.js | progress.js   # the other tabs
│   └── dashboard.js      # dashboard.html logic
├── data/
│   ├── vocab.json         # glossary words (generated, see below)
│   ├── hints.json         # contextual hints per word id, merged into vocab.json
│   ├── conversations.json # practice dialogues ([word] / [form](glossary word) markup)
│   ├── phrases.json       # shopping phrases (standard + spoken)
│   ├── oral.json          # oral test questions + example answers
│   └── links.json         # teacher's Wordwall links
├── supabase/setup.sql     # all database setup (run once in Supabase)
└── scripts/build_vocab.py # regenerates data/vocab.json from the glossary .docx files
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
changes needed for new chapters. Trailing verb-type numbers in the glossary
("soittaa 1") are removed from the word and kept as a small "vt 1" note. Commit the updated `data/vocab.json` and
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

## Sharing this with friends, device sync and feedback (optional)

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
site. It is not real login security. The public key that lets the dashboard
read the **progress summaries** is in the app's own JavaScript, so a
determined person could read those counts directly. That's an accepted
trade-off for low-stakes data (word-mastery counts only). The **accounts**
(full progress + hashed PIN) and **feedback** (may contain emails) tables are
different: they can't be read with the public key at all, only through
database functions that check the PIN or passphrase on the server.

### Setup steps

1. **Create a free Supabase project** at [supabase.com](https://supabase.com) →
   New Project (already done for this app).

2. **Run the database setup.** Open `supabase/setup.sql`, change
   `YOUR_DASHBOARD_PASSPHRASE` to a **new** passphrase (it's checked on the
   server and never goes in the app's public files), then paste the whole file into Supabase → **SQL Editor** → New query → **Run**.
   It's safe to run again later; it only adds what's missing. It creates:
   - `progress`: one summary row per learner for your dashboard
   - `accounts` + `account_pull` / `account_push`: "save to all my devices".
     The table can't be read directly; the functions check the name + PIN.
     PINs are stored hashed, and 10 wrong PINs lock that name for 15 minutes.
   - `feedback` + `list_feedback`: anyone can send feedback, but only the
     dashboard (with the passphrase) can read it, since it may contain emails.
   - `app_secrets` + `dashboard_check`: your dashboard passphrase, checked on
     the server.

3. **Fill in `js/config.js`**: Project URL and the `anon` `public` key (never
   the `service_role` key). Leave `DASHBOARD_PASSPHRASE` empty: the
   passphrase lives in the database now.

4. **Feedback with a Microsoft Form (optional).** Create a form at
   [forms.office.com](https://forms.office.com), turn on "Get email
   notification of each response", copy its share link and paste it into
   `FEEDBACK_FORM_URL` in `js/config.js`. The Feedback button then opens the
   form, and all answers are kept in Excel (Responses → Open in Excel).
   Without a link, the app's built-in feedback box saves to the dashboard.

5. **Commit and push.** Open `https://<your-app>.vercel.app/dashboard.html`
   and enter your passphrase to see everyone's progress and feedback. **📋 Copy
   all emails** and **✉️ Email everyone (BCC)** are there for telling friends
   about an update. The app also shows a "What's new" card to returning users
   after each update (edit `WHATS_NEW` / `APP_VERSION` in `js/app.js`).

Anything left as a placeholder in `js/config.js` is simply skipped: nothing
breaks and nothing is sent anywhere.

**PIN note:** the 4-digit PIN is light protection for low-stakes study data,
not bank-grade security. It's also remembered on each linked device so sync
happens automatically. Tell friends not to reuse a real PIN.

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

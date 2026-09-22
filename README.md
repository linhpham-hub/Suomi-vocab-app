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
- Installable as a **PWA**: "Add to Home Screen" on phone, or install icon in
  Chrome/Edge on desktop. Once installed it keeps working with no internet.

## Project structure

```
vocab-app/
├── index.html            # single-page app shell + all view templates
├── manifest.webmanifest  # PWA metadata
├── sw.js                 # offline service worker (cache-first)
├── css/style.css
├── js/
│   ├── app.js            # all app logic & rendering
│   └── srs.js            # spaced-repetition + localStorage progress
├── data/vocab.json        # the word list (generated, see below)
├── icons/                 # app icons
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
changes needed for new chapters. Commit the updated `data/vocab.json` and
redeploy (see below).

## Try it locally

No install needed — any static file server works, e.g.:

```bash
cd vocab-app
python3 -m http.server 8000
# open http://localhost:8000
```

(Opening `index.html` directly by double-clicking won't work for the `fetch()`
of `data/vocab.json` — a local server, or a real deployment, is needed.)

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

// Suomen Sanasto -- main app logic. No build step, no framework: plain DOM + templates.

const PREFS_KEY = "finVocabPrefs.v1";
const SESSION_LENGTH = 15; // words per flashcard/quiz/write session

const state = {
  words: [],
  chapters: [],
  selectedChapters: new Set(),
  direction: "fi-en", // 'fi-en' | 'en-fi' | 'mixed'
  view: "home",
};

const app = document.getElementById("app");

function tpl(id) {
  return document.getElementById(id).content.cloneNode(true);
}

function loadPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function savePrefs() {
  localStorage.setItem(
    PREFS_KEY,
    JSON.stringify({
      selectedChapters: [...state.selectedChapters],
      direction: state.direction,
    })
  );
}

async function init() {
  const res = await fetch("data/vocab.json");
  const data = await res.json();
  state.words = data.words;
  state.chapters = data.chapters;

  const prefs = loadPrefs();
  if (prefs && prefs.selectedChapters && prefs.selectedChapters.length) {
    state.selectedChapters = new Set(
      prefs.selectedChapters.filter((c) => state.chapters.includes(c))
    );
  }
  if (!state.selectedChapters.size) {
    state.selectedChapters = new Set(state.chapters);
  }
  if (prefs && prefs.direction) state.direction = prefs.direction;

  renderHome();
  registerServiceWorker();
}

function activeWordPool() {
  return state.words.filter((w) => state.selectedChapters.has(w.chapter));
}

function pickDirectionFor(word) {
  if (state.direction === "mixed") {
    return Math.random() < 0.5 ? "fi-en" : "en-fi";
  }
  return state.direction;
}

function promptAndAnswer(word, dir) {
  return dir === "fi-en" ? { prompt: word.fi, answer: word.en } : { prompt: word.en, answer: word.fi };
}

// ---------- HOME ----------

function renderHome() {
  state.view = "home";
  app.innerHTML = "";
  app.appendChild(tpl("tpl-home"));

  const chapterRow = app.querySelector('[data-role="chapters"]');
  state.chapters.forEach((chapter) => {
    const btn = document.createElement("button");
    btn.className = "chip";
    btn.textContent = chapter;
    btn.dataset.chapter = chapter;
    if (state.selectedChapters.has(chapter)) btn.classList.add("chip--active");
    btn.addEventListener("click", () => {
      if (state.selectedChapters.has(chapter)) {
        if (state.selectedChapters.size > 1) state.selectedChapters.delete(chapter);
      } else {
        state.selectedChapters.add(chapter);
      }
      savePrefs();
      renderHome();
    });
    chapterRow.appendChild(btn);
  });

  const allBtn = document.createElement("button");
  allBtn.className = "chip chip--all";
  const allSelected = state.selectedChapters.size === state.chapters.length;
  allBtn.textContent = allSelected ? "All ✓" : "All";
  allBtn.addEventListener("click", () => {
    state.selectedChapters = new Set(state.chapters);
    savePrefs();
    renderHome();
  });
  chapterRow.prepend(allBtn);

  const dirSeg = app.querySelector('[data-role="direction"]');
  dirSeg.querySelectorAll(".segmented-btn").forEach((btn) => {
    if (btn.dataset.value === state.direction) btn.classList.add("segmented-btn--active");
    btn.addEventListener("click", () => {
      state.direction = btn.dataset.value;
      savePrefs();
      renderHome();
    });
  });

  const pool = activeWordPool();
  const ids = pool.map((w) => w.id);
  const stats = SRS.statsForIds(ids);
  const due = SRS.dueCount(ids);

  const summary = app.querySelector('[data-role="stats-summary"]');
  summary.innerHTML = `
    <div class="stats-row">
      <div class="stat"><span class="stat-num">${stats.total}</span><span class="stat-label">words</span></div>
      <div class="stat"><span class="stat-num">${stats.new}</span><span class="stat-label">new</span></div>
      <div class="stat"><span class="stat-num">${stats.learning}</span><span class="stat-label">learning</span></div>
      <div class="stat"><span class="stat-num">${stats.mastered}</span><span class="stat-label">mastered</span></div>
    </div>
  `;

  const dueLabel = app.querySelector('[data-role="due-count"]');
  dueLabel.textContent = due > 0 ? `${due} due now` : "All caught up";

  app.querySelectorAll(".mode-btn").forEach((btn) => {
    btn.addEventListener("click", () => startSession(btn.dataset.mode));
  });

  app.querySelector('[data-role="stats-link"]').addEventListener("click", renderStats);
}

// ---------- SESSION SETUP ----------

function buildQueue(mode) {
  const pool = activeWordPool();
  if (!pool.length) return [];

  let candidates;
  if (mode === "review") {
    candidates = pool.filter((w) => SRS.isDue(w.id));
    if (!candidates.length) candidates = [...pool]; // nothing due -> just study the set
  } else {
    candidates = [...pool];
  }

  shuffle(candidates);

  // Prioritise due/new words first, then fill with the rest, capped to SESSION_LENGTH.
  candidates.sort((a, b) => {
    const aDue = SRS.isDue(a.id) ? 0 : 1;
    const bDue = SRS.isDue(b.id) ? 0 : 1;
    return aDue - bDue;
  });

  return candidates.slice(0, Math.min(SESSION_LENGTH, candidates.length));
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function startSession(mode) {
  const queue = buildQueue(mode);
  if (!queue.length) {
    renderHome();
    return;
  }
  const session = {
    mode: mode === "review" ? "flashcards" : mode, // review reuses flashcard UI
    queue,
    index: 0,
    score: 0,
    missed: [],
  };
  renderSession(session);
}

// ---------- SESSION SHELL ----------

function renderSession(session) {
  state.view = "session";
  app.innerHTML = "";
  app.appendChild(tpl("tpl-session"));
  app.querySelector('[data-role="exit"]').addEventListener("click", renderHome);
  updateSessionChrome(session);

  const body = app.querySelector('[data-role="body"]');
  if (session.mode === "flashcards") renderFlashcard(session, body);
  else if (session.mode === "quiz") renderQuiz(session, body);
  else if (session.mode === "write") renderWrite(session, body);
}

function updateSessionChrome(session) {
  const pct = Math.round((session.index / session.queue.length) * 100);
  const fill = app.querySelector('[data-role="progress-fill"]');
  if (fill) fill.style.width = pct + "%";
  const label = app.querySelector('[data-role="progress-label"]');
  if (label) label.textContent = `${session.index + 1} / ${session.queue.length}`;
  const score = app.querySelector('[data-role="score"]');
  if (score && session.mode !== "flashcards") score.textContent = `${session.score}✓`;
}

function advance(session) {
  session.index += 1;
  if (session.index >= session.queue.length) {
    renderSummary(session);
    return;
  }
  const body = app.querySelector('[data-role="body"]');
  updateSessionChrome(session);
  if (session.mode === "flashcards") renderFlashcard(session, body);
  else if (session.mode === "quiz") renderQuiz(session, body);
  else if (session.mode === "write") renderWrite(session, body);
}

// ---------- FLASHCARDS ----------

function renderFlashcard(session, body) {
  const word = session.queue[session.index];
  const dir = pickDirectionFor(word);
  const { prompt, answer } = promptAndAnswer(word, dir);

  body.innerHTML = "";
  body.appendChild(tpl("tpl-flashcard"));

  body.querySelector('[data-role="chapter"]').textContent = word.chapter;
  body.querySelector('[data-role="chapter-back"]').textContent = word.chapter;
  body.querySelector('[data-role="front"]').textContent = prompt;
  body.querySelector('[data-role="back"]').textContent = answer;

  const card = body.querySelector('[data-role="flashcard"]');
  const gradeRow = body.querySelector('[data-role="grade-row"]');
  let flipped = false;

  card.addEventListener("click", () => {
    flipped = !flipped;
    card.classList.toggle("flashcard--flipped", flipped);
    if (flipped) gradeRow.hidden = false;
  });

  gradeRow.querySelectorAll(".grade-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const good = btn.dataset.grade === "good";
      SRS.grade(word.id, good);
      if (good) session.score += 1;
      else session.missed.push(word);
      advance(session);
    });
  });
}

// ---------- QUIZ ----------

function buildDistractors(word, dir, count) {
  const pool = state.words.filter((w) => w.id !== word.id);
  const sameChapter = pool.filter((w) => w.chapter === word.chapter);
  const source = sameChapter.length >= count ? sameChapter : pool;
  const shuffled = shuffle([...source]);
  const picks = [];
  const seen = new Set();
  const correctAnswer = (dir === "fi-en" ? word.en : word.fi).trim().toLowerCase();
  for (const w of shuffled) {
    const val = dir === "fi-en" ? w.en : w.fi;
    const key = val.trim().toLowerCase();
    if (key === correctAnswer || seen.has(key)) continue;
    seen.add(key);
    picks.push(val);
    if (picks.length >= count) break;
  }
  return picks;
}

function renderQuiz(session, body) {
  const word = session.queue[session.index];
  const dir = pickDirectionFor(word);
  const { prompt, answer } = promptAndAnswer(word, dir);

  body.innerHTML = "";
  body.appendChild(tpl("tpl-quiz"));
  body.querySelector('[data-role="chapter"]').textContent = word.chapter;
  body.querySelector('[data-role="prompt"]').textContent = prompt;

  const distractors = buildDistractors(word, dir, 3);
  const options = shuffle([answer, ...distractors]);

  const grid = body.querySelector('[data-role="options"]');
  const nextBtn = body.querySelector('[data-role="next"]');
  let answered = false;

  options.forEach((opt) => {
    const btn = document.createElement("button");
    btn.className = "option-btn";
    btn.textContent = opt;
    btn.addEventListener("click", () => {
      if (answered) return;
      answered = true;
      const correct = normalizeLoose(opt) === normalizeLoose(answer);
      grid.querySelectorAll(".option-btn").forEach((b) => {
        b.disabled = true;
        if (normalizeLoose(b.textContent) === normalizeLoose(answer)) b.classList.add("option-btn--correct");
      });
      if (!correct) btn.classList.add("option-btn--wrong");
      SRS.grade(word.id, correct);
      if (correct) session.score += 1;
      else session.missed.push(word);
      nextBtn.hidden = false;
      nextBtn.focus();
    });
    grid.appendChild(btn);
  });

  nextBtn.addEventListener("click", () => advance(session));
}

// ---------- WRITE ----------

function stripParens(s) {
  // Drop parenthetical asides entirely: "(around) here" -> "here"
  return s.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
}

function flattenParens(s) {
  // Keep the words but drop the parens themselves: "(around) here" -> "around here"
  return s.replace(/[()]/g, "").replace(/\s+/g, " ").trim();
}

function normalizeLoose(s) {
  return s
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[!?.,;:]+$/g, "")
    .trim()
    .replace(/\s+/g, " ");
}

function acceptableAnswers(raw, { stripLeadTo = false, stripArticles = false } = {}) {
  const variants = new Set();
  const parts = raw.split("/").map((p) => p.trim());
  for (const part of parts) {
    for (const withParens of [part, stripParens(part), flattenParens(part)]) {
      const sub = withParens
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean);
      for (const s of [withParens, ...sub]) {
        if (!s) continue;
        let norm = normalizeLoose(s);
        if (norm) variants.add(norm);
        if (stripLeadTo && norm.startsWith("to ")) variants.add(norm.slice(3).trim());
        if (stripArticles) {
          for (const art of ["a ", "an ", "the "]) {
            if (norm.startsWith(art)) variants.add(norm.slice(art.length).trim());
          }
        }
      }
    }
  }
  return variants;
}

function checkWriteAnswer(userInput, correctRaw, dir) {
  const isEnglishAnswer = dir === "fi-en"; // answer field is English
  const opts = isEnglishAnswer
    ? { stripLeadTo: true, stripArticles: true }
    : {};
  const accepted = acceptableAnswers(correctRaw, opts);
  return accepted.has(normalizeLoose(userInput));
}

function renderWrite(session, body) {
  const word = session.queue[session.index];
  const dir = pickDirectionFor(word);
  const { prompt, answer } = promptAndAnswer(word, dir);

  body.innerHTML = "";
  body.appendChild(tpl("tpl-write"));
  body.querySelector('[data-role="chapter"]').textContent = word.chapter;
  body.querySelector('[data-role="prompt"]').textContent = prompt;

  const form = body.querySelector('[data-role="form"]');
  const input = body.querySelector('[data-role="input"]');
  const feedback = body.querySelector('[data-role="feedback"]');
  const nextBtn = body.querySelector('[data-role="next"]');
  const hintBtn = body.querySelector('[data-role="hint"]');
  input.focus();

  let answered = false;
  let hintUsed = false;

  hintBtn.addEventListener("click", () => {
    hintUsed = true;
    const firstLetter = answer.replace(/^\(/, "").trim()[0] || "?";
    hintBtn.textContent = `Starts with "${firstLetter}"`;
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (answered) return;
    answered = true;
    const correct = checkWriteAnswer(input.value, answer, dir) && !hintUsed;
    const lenientCorrect = checkWriteAnswer(input.value, answer, dir);

    input.disabled = true;
    feedback.hidden = false;
    if (lenientCorrect) {
      feedback.className = "write-feedback write-feedback--correct";
      feedback.textContent = hintUsed ? `Correct (with hint) — ${answer}` : "Correct!";
    } else {
      feedback.className = "write-feedback write-feedback--wrong";
      feedback.textContent = `Correct answer: ${answer}`;
    }

    SRS.grade(word.id, correct);
    if (correct) session.score += 1;
    else session.missed.push(word);

    form.querySelector('[data-role="check"]').hidden = true;
    hintBtn.hidden = true;
    nextBtn.hidden = false;
    nextBtn.focus();
  });

  nextBtn.addEventListener("click", () => advance(session));
}

// ---------- SUMMARY ----------

function renderSummary(session) {
  state.view = "summary";
  app.innerHTML = "";
  app.appendChild(tpl("tpl-summary"));

  const total = session.queue.length;
  const headline = app.querySelector('[data-role="headline"]');
  const detail = app.querySelector('[data-role="detail"]');

  if (session.mode === "flashcards") {
    headline.textContent = "Session complete";
    detail.textContent = `${session.score} / ${total} marked as known.`;
  } else {
    headline.textContent = `${session.score} / ${total} correct`;
    const pct = Math.round((session.score / total) * 100);
    detail.textContent = pct >= 80 ? "Nice work! 🎉" : "Keep practising — you'll get there.";
  }

  app.querySelector('[data-role="home"]').addEventListener("click", renderHome);
  app.querySelector('[data-role="again"]').addEventListener("click", () => {
    const mode = session.mode;
    startSession(mode);
  });
}

// ---------- STATS ----------

function renderStats() {
  state.view = "stats";
  app.innerHTML = "";
  app.appendChild(tpl("tpl-stats"));
  app.querySelector('[data-role="exit"]').addEventListener("click", renderHome);
  app.querySelector('[data-role="reset"]').addEventListener("click", () => {
    if (confirm("Reset all progress? This can't be undone.")) {
      SRS.resetAll();
      renderStats();
    }
  });

  const body = app.querySelector('[data-role="body"]');
  body.innerHTML = "";

  state.chapters.forEach((chapter) => {
    const ids = state.words.filter((w) => w.chapter === chapter).map((w) => w.id);
    const stats = SRS.statsForIds(ids);
    const masteredPct = stats.total ? Math.round((stats.mastered / stats.total) * 100) : 0;
    const learningPct = stats.total ? Math.round((stats.learning / stats.total) * 100) : 0;

    const row = document.createElement("div");
    row.className = "chapter-stat";
    row.innerHTML = `
      <div class="chapter-stat-head">
        <span>${chapter}</span>
        <span class="chapter-stat-count">${stats.mastered + stats.learning}/${stats.total}</span>
      </div>
      <div class="chapter-stat-bar">
        <div class="chapter-stat-fill chapter-stat-fill--mastered" style="width:${masteredPct}%"></div>
        <div class="chapter-stat-fill chapter-stat-fill--learning" style="width:${learningPct}%; margin-left:${masteredPct}%"></div>
      </div>
    `;
    body.appendChild(row);
  });

  const legend = document.createElement("div");
  legend.className = "chapter-stat-legend";
  legend.innerHTML = `
    <span><i class="legend-dot legend-dot--mastered"></i>Mastered</span>
    <span><i class="legend-dot legend-dot--learning"></i>Learning</span>
    <span><i class="legend-dot legend-dot--new"></i>New</span>
  `;
  body.appendChild(legend);
}

// ---------- SERVICE WORKER ----------

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  // Register right away rather than waiting for window's "load" event --
  // by the time this runs (after the initial vocab fetch) the document has
  // already finished loading, so a "load" listener here would never fire.
  navigator.serviceWorker.register("sw.js").catch((err) => {
    console.warn("Service worker registration failed:", err);
  });
}

init();

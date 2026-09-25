// Suomen Sanasto -- main app: data loading, tab navigation, the Study tab and
// the study sessions (Focus / Flashcards / Quiz / Write). Other tabs live in
// words.js, talk.js, oral.js and progress.js. Plain DOM, no build step.

const APP_VERSION = "2026-09-26";
const WHATS_NEW = [
  "☁️ Save your progress on all your devices with your name + a 4-digit PIN",
  "✍️ Study tab to practise all the glossaries",
  "📖 Words tab is useful to search words in either Finnish or English",
  "💬 Talk tab: dialogues, numbers (standard + spoken) and shopping phrases",
  "🎤 Oral test tab: all 26 questions, random-5 practice, space for your own answers",
];

const PREFS_KEY = "finVocabPrefs.v1";
const SEEN_VERSION_KEY = "finVocabSeenVersion.v1";
const SESSION_SIZES = [10, 15, 25, 50, 0]; // 0 = all words in the selection

const PRAISE = [
  "Correct! :)", "Nice! (^_^)", "Yes! ✅", "Great job! 🎉", "Keep it up! 💪",
  "You got it! 🙌", "Awesome! ✨", "Well done! (๑˃̵ᴗ˂̵)و", "Perfect! 👏", "Way to go! 🌟",
  "Superb! (づ｡◕‿‿◕｡)づ", "Nailed it! 🔥", "Good job! (^o^)/", "Excellent! 🥳", "Congratulations! ^o^",
];
const SUMMARY_PRAISE_PERFECT = ["Perfect score! ٩(◕‿◕)۶", "Flawless! 🏆", "100%?! Amazing! 🥳", "Wow, nailed every one! ✨"];
const SUMMARY_PRAISE_GOOD = ["Nice work! 🎉", "Great session! (^o^)/", "Keep it up! 💪", "You're on a roll! 🔥", "Solid work! 👏"];
const SUMMARY_PRAISE_KEEP_GOING = [
  "Keep practising, you'll get there. 🌱", "Good effort, every rep counts! 💪",
  "Getting there. Try again? 🙂", "Practice makes progress. 🌱",
];

function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function randomPraise() {
  return randomFrom(PRAISE);
}

const state = {
  words: [],
  chapters: [],
  byId: new Map(),
  conversations: [],
  phrases: [],
  oral: [],
  links: { glossary: [], prices: [], oral: [] },
  selectedChapters: new Set(),
  direction: "fi-en", // 'fi-en' | 'en-fi' | 'mixed'
  sessionSize: 15,
  view: "study",
};

const app = document.getElementById("app");
const tabbar = document.getElementById("tabbar");

function tpl(id) {
  return document.getElementById(id).content.cloneNode(true);
}

function loadPrefs() {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY)) || null;
  } catch {
    return null;
  }
}

function savePrefs() {
  try {
    const prev = loadPrefs() || {};
    localStorage.setItem(
      PREFS_KEY,
      JSON.stringify({
        ...prev,
        selectedChapters: [...state.selectedChapters],
        chaptersTouched: true,
        direction: state.direction,
        sessionSize: state.sessionSize,
      })
    );
  } catch {}
}

async function loadJson(path, fallback) {
  try {
    const res = await fetch(path);
    if (!res.ok) throw new Error(res.status);
    return await res.json();
  } catch (e) {
    console.warn("Could not load", path, e);
    return fallback;
  }
}

async function init() {
  const [vocab, conv, phrases, oral, links] = await Promise.all([
    loadJson("data/vocab.json", { chapters: [], words: [] }),
    loadJson("data/conversations.json", { conversations: [] }),
    loadJson("data/phrases.json", { shopping: [] }),
    loadJson("data/oral.json", { questions: [] }),
    loadJson("data/links.json", { glossary: [], prices: [], oral: [] }),
  ]);
  state.words = vocab.words;
  state.chapters = vocab.chapters;
  state.byId = new Map(vocab.words.map((w) => [w.id, w]));
  state.conversations = conv.conversations || [];
  state.phrases = phrases.shopping || [];
  state.oral = oral.questions || [];
  state.links = { glossary: [], prices: [], oral: [], ...links };

  const prefs = loadPrefs();
  if (prefs && Array.isArray(prefs.selectedChapters)) {
    state.selectedChapters = new Set(prefs.selectedChapters.filter((c) => state.chapters.includes(c)));
    // Older versions never stored an empty selection; treat that as "all".
    if (!state.selectedChapters.size && !prefs.chaptersTouched) state.selectedChapters = new Set(state.chapters);
  } else {
    state.selectedChapters = new Set(state.chapters);
  }
  if (prefs && prefs.direction) state.direction = prefs.direction;
  if (prefs && SESSION_SIZES.includes(prefs.sessionSize)) state.sessionSize = prefs.sessionSize;

  window.addEventListener("hashchange", route);
  route();
  registerServiceWorker();
  maybeShowNamePrompt();

  // Linked devices: quietly pull progress made elsewhere, then refresh the view.
  if (getAccount()) {
    syncAccount().then((r) => {
      if (r.ok && r.merged && state.view !== "session") showTab(state.view);
    });
  }
}

// ---------- Tabs ----------

const TABS = [
  { id: "study", icon: "📚", label: "Study", render: () => renderStudy() },
  { id: "words", icon: "📖", label: "Words", render: () => renderWords() },
  { id: "talk", icon: "💬", label: "Talk", render: () => renderTalk() },
  { id: "oral", icon: "🎤", label: "Oral test", render: () => renderOral() },
  { id: "progress", icon: "📊", label: "Progress", render: () => renderProgress() },
];

function currentTabId() {
  const m = location.hash.match(/^#\/([\w-]+)/);
  return m && TABS.some((t) => t.id === m[1]) ? m[1] : "study";
}

function route() {
  showTab(currentTabId());
}

function go(tabId) {
  if (currentTabId() === tabId && location.hash) showTab(tabId);
  else location.hash = "#/" + tabId;
}

function showTab(id) {
  const tab = TABS.find((t) => t.id === id) || TABS[0];
  Speech.stop();
  closeWordPopover();
  state.view = tab.id;
  document.body.dataset.tab = tab.id; // each tab has its own colour (css/style.css)
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", getComputedStyle(document.body).getPropertyValue("--bg").trim() || "#E6EEC9");
  app.innerHTML = "";
  tabbar.hidden = false;
  document.body.classList.add("has-tabbar");
  try {
    tab.render();
  } catch (e) {
    console.error(e);
    app.innerHTML = `<div class="card"><p>Something went wrong showing this page. Try reloading.</p></div>`;
  }
  renderTabBar(tab.id);
  window.scrollTo(0, 0);
}

function renderTabBar(activeId) {
  tabbar.innerHTML = "";
  TABS.forEach((t) => {
    tabbar.appendChild(
      el("a", {
        href: "#/" + t.id,
        class: `tab tab--${t.id}` + (t.id === activeId ? " tab--active" : ""),
        "aria-current": t.id === activeId ? "page" : false,
        html: `<span class="tab-icon" aria-hidden="true">${t.icon}</span><span class="tab-label">${t.label}</span>`,
      })
    );
  });
}

// ---------- Study tab ----------

function activeWordPool() {
  return state.words.filter((w) => state.selectedChapters.has(w.chapter));
}

// Focus words = the ones that need work: got wrong last time (streak 0) or
// only half right (missing dots / used a hint). Most-missed first.
function isFocusWord(w) {
  const lv = SRS.level(w.id);
  return lv === "focus" || (lv !== "mastered" && lv !== "new" && SRS.get(w.id).lastResult === "half");
}

function focusPool() {
  return activeWordPool()
    .filter(isFocusWord)
    .sort((a, b) => SRS.get(b.id).wrong - SRS.get(a.id).wrong || SRS.get(a.id).box - SRS.get(b.id).box);
}

function renderStudy() {
  app.appendChild(tpl("tpl-study"));

  // Greeting with the learner's name (tap to change).
  const greet = app.querySelector('[data-role="greeting"]');
  const name = displayName();
  const acct = getAccount();
  greet.innerHTML = "";
  greet.appendChild(el("span", { text: name ? `Hei, ${name}! 👋` : "Hei! 👋" }));
  greet.appendChild(
    el("button", {
      type: "button",
      class: "name-edit-btn",
      text: name ? (acct ? "☁️ edit" : "✏️ edit") : "Set your name",
      onclick: () => openNameModal({ editing: true }),
    })
  );

  renderWhatsNew(app.querySelector('[data-role="whats-new"]'));

  chapterChips(app.querySelector('[data-role="chapters"]'), state.chapters, state.selectedChapters, (next) => {
    state.selectedChapters = next;
    savePrefs();
    showTab("study");
  });

  app.querySelectorAll('[data-role="direction"] .segmented-btn').forEach((btn) => {
    btn.classList.toggle("segmented-btn--active", btn.dataset.value === state.direction);
    btn.addEventListener("click", () => {
      state.direction = btn.dataset.value;
      savePrefs();
      showTab("study");
    });
  });

  const sizeRow = app.querySelector('[data-role="session-size"]');
  SESSION_SIZES.forEach((n) => {
    sizeRow.appendChild(
      el("button", {
        type: "button",
        class: "segmented-btn" + (state.sessionSize === n ? " segmented-btn--active" : ""),
        text: n ? String(n) : "All",
        onclick: () => {
          state.sessionSize = n;
          savePrefs();
          showTab("study");
        },
      })
    );
  });

  const pool = activeWordPool();
  const stats = SRS.statsForIds(pool.map((w) => w.id));
  const summary = app.querySelector('[data-role="stats-summary"]');
  if (!pool.length) {
    summary.innerHTML = `<p class="empty-selection-note">Pick at least one chapter above to start studying.</p>`;
  } else {
    summary.innerHTML = `
      <div class="stats-row">
        <div class="stat"><span class="stat-num">${stats.total}</span><span class="stat-label">words</span></div>
        <div class="stat"><span class="stat-num">${stats.new}</span><span class="stat-label">new</span></div>
        <div class="stat"><span class="stat-num">${stats.learning}</span><span class="stat-label">learning</span></div>
        <div class="stat"><span class="stat-num">${stats.mastered}</span><span class="stat-label">mastered</span></div>
      </div>`;
  }

  const focusCount = focusPool().length;
  const sizeLabel = state.sessionSize ? `${Math.min(state.sessionSize, pool.length)} words` : `all ${pool.length} words`;
  const descs = {
    focus: !pool.length ? "Pick a chapter" : focusCount ? `${focusCount} weak word${focusCount === 1 ? "" : "s"} · quiz` : "No weak words yet 🎉",
    flashcards: `${sizeLabel} · flip & self-grade`,
    quiz: `${sizeLabel} · multiple choice`,
    write: `${sizeLabel} · type the answer`,
  };

  app.querySelectorAll(".mode-btn").forEach((btn) => {
    const mode = btn.dataset.mode;
    btn.querySelector(".mode-desc").textContent = descs[mode];
    const disabled = !pool.length || (mode === "focus" && !focusCount);
    btn.disabled = disabled;
    btn.addEventListener("click", () => {
      if (!disabled) startSession(mode);
    });
  });

  app.querySelector('[data-role="words-link"]').addEventListener("click", () => go("words"));
  const fb = app.querySelector('[data-role="feedback-cta"]');
  fb.addEventListener("click", openFeedback);
}

function renderWhatsNew(box) {
  let seen = null;
  try { seen = localStorage.getItem(SEEN_VERSION_KEY); } catch {}
  const returning = !!(getPlayerName() || Object.keys(SRS.exportAll()).length);
  if (seen === APP_VERSION || !returning) {
    if (!returning) try { localStorage.setItem(SEEN_VERSION_KEY, APP_VERSION); } catch {}
    box.remove();
    return;
  }
  box.hidden = false;
  box.innerHTML = "";
  box.appendChild(el("h2", { class: "panel-title", text: "✨ What's new" }));
  box.appendChild(el("ul", { class: "whats-new-list" }, WHATS_NEW.map((t) => el("li", { text: t }))));
  box.appendChild(
    el("button", {
      type: "button",
      class: "ghost-btn whats-new-ok",
      text: "Got it",
      onclick: () => {
        try { localStorage.setItem(SEEN_VERSION_KEY, APP_VERSION); } catch {}
        box.remove();
      },
    })
  );
}

// ---------- Name + device-link prompt ----------

function maybeShowNamePrompt() {
  if (getPlayerName()) return;
  openNameModal({ editing: false });
}

function openNameModal({ editing }) {
  const modal = document.getElementById("name-modal");
  const input = document.getElementById("name-input");
  const linkRow = document.getElementById("link-row");
  const linkBox = document.getElementById("link-check");
  const pinWrap = document.getElementById("pin-wrap");
  const pinInput = document.getElementById("pin-input");
  const err = document.getElementById("name-error");
  const submitBtn = document.getElementById("name-submit");
  const skipBtn = document.getElementById("name-skip");
  const title = document.getElementById("name-title");
  const acct = getAccount();

  title.textContent = editing ? "Your name" : "Welcome! 👋";
  input.value = displayName();
  err.hidden = true;
  pinInput.value = "";
  linkRow.hidden = !syncIsConfigured() || !!acct;
  linkBox.checked = false;
  pinWrap.hidden = true;
  skipBtn.textContent = editing ? "Cancel" : "Skip";
  submitBtn.textContent = editing ? "Save" : "Start studying";
  submitBtn.disabled = false;
  modal.hidden = false;
  input.focus();

  linkBox.onchange = () => {
    pinWrap.hidden = !linkBox.checked;
    if (linkBox.checked) pinInput.focus();
  };
  pinInput.oninput = () => (pinInput.value = pinInput.value.replace(/\D/g, "").slice(0, 4));

  const close = () => {
    modal.hidden = true;
    if (state.view !== "session") showTab(state.view);
  };

  skipBtn.onclick = () => {
    if (!editing && !getPlayerName()) setPlayerName("Friend");
    close();
  };

  const submit = async () => {
    const name = input.value.trim().slice(0, 30);
    err.hidden = true;
    if (linkBox.checked) {
      if (!name) {
        err.hidden = false;
        err.textContent = "Type a name to save your progress under.";
        return;
      }
      submitBtn.disabled = true;
      submitBtn.textContent = "Connecting…";
      const r = await linkAccount(name, pinInput.value);
      submitBtn.disabled = false;
      submitBtn.textContent = editing ? "Save" : "Start studying";
      if (!r.ok) {
        err.hidden = false;
        err.textContent = r.message;
        return;
      }
      toast(r.created ? "☁️ Saved! Use the same name + PIN on your other devices." : `☁️ Welcome back! Progress loaded${r.merged ? ` (${r.merged} words updated)` : ""}.`, 4500);
    } else {
      setPlayerName(name || "Friend");
      if (acct) syncAccount();
    }
    close();
  };
  submitBtn.onclick = submit;
  input.onkeydown = (e) => { if (e.key === "Enter") submit(); };
  pinInput.onkeydown = (e) => { if (e.key === "Enter") submit(); };
}

// ---------- Session setup ----------

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function buildQueue(mode) {
  const size = state.sessionSize || Infinity;
  if (mode === "focus") {
    return shuffle(focusPool().slice(0, size));
  }
  const candidates = shuffle([...activeWordPool()]);
  // Words that are due (never seen, or scheduled for review) come first.
  candidates.sort((a, b) => (SRS.isDue(a.id) ? 0 : 1) - (SRS.isDue(b.id) ? 0 : 1));
  return candidates.slice(0, Math.min(size, candidates.length));
}

function startSession(mode, customQueue) {
  const queue = customQueue || buildQueue(mode);
  if (!queue.length) {
    showTab("study");
    return;
  }
  renderSession({
    kind: mode,
    mode: mode === "focus" ? "quiz" : mode,
    queue,
    index: 0,
    score: 0,
    missed: [],
    returnTab: state.view === "session" ? "study" : state.view,
  });
}

// ---------- Session shell ----------

function renderSession(session) {
  state.view = "session";
  Speech.stop();
  app.innerHTML = "";
  tabbar.hidden = true;
  document.body.classList.remove("has-tabbar");
  app.appendChild(tpl("tpl-session"));
  app.querySelector('[data-role="exit"]').addEventListener("click", () => go(session.returnTab || "study"));
  updateSessionChrome(session);
  renderCurrent(session);
  window.scrollTo(0, 0);
}

function renderCurrent(session) {
  const body = app.querySelector('[data-role="body"]');
  if (session.mode === "flashcards") renderFlashcard(session, body);
  else if (session.mode === "quiz") renderQuiz(session, body);
  else renderWrite(session, body);
}

function updateSessionChrome(session) {
  const pct = Math.round((session.index / session.queue.length) * 100);
  const fill = app.querySelector('[data-role="progress-fill"]');
  if (fill) fill.style.width = pct + "%";
  const label = app.querySelector('[data-role="progress-label"]');
  if (label) label.textContent = `${session.index + 1} / ${session.queue.length}${session.kind === "focus" ? " · 🎯 focus" : ""}`;
  const score = app.querySelector('[data-role="score"]');
  if (score && session.mode !== "flashcards") score.textContent = `${formatScore(session.score)}✓`;
}

function advance(session) {
  session.index += 1;
  if (session.index >= session.queue.length) {
    renderSummary(session);
    return;
  }
  updateSessionChrome(session);
  renderCurrent(session);
}

function pickDirectionFor() {
  if (state.direction === "mixed") return Math.random() < 0.5 ? "fi-en" : "en-fi";
  return state.direction;
}

function promptAndAnswer(word, dir) {
  return dir === "fi-en" ? { prompt: word.fi, answer: word.en } : { prompt: word.en, answer: word.fi };
}

function maybeAutoplay(text) {
  if (Speech.settings().autoplay) setTimeout(() => Speech.say(text), 150);
}

function recordResult(session, word, result) {
  SRS.grade(word.id, result);
  if (result === true) session.score += 1;
  else if (result === "half") {
    session.score += 0.5;
    session.missed.push(word);
  } else session.missed.push(word);
  updateSessionChrome(session);
}

// ---------- Flashcards ----------

function renderFlashcard(session, body) {
  const word = session.queue[session.index];
  const dir = pickDirectionFor();
  const { prompt, answer } = promptAndAnswer(word, dir);

  body.innerHTML = "";
  body.appendChild(tpl("tpl-flashcard"));
  body.querySelector('[data-role="chapter"]').textContent = word.chapter;
  body.querySelector('[data-role="chapter-back"]').textContent = word.chapter;
  body.querySelector('[data-role="front"]').textContent = prompt;
  body.querySelector('[data-role="back"]').textContent = answer;
  // 🔊 goes on whichever face shows the Finnish word.
  body.querySelector(dir === "fi-en" ? '[data-role="speak-front"]' : '[data-role="speak-back"]').appendChild(speakBtn(word.fi));
  if (dir === "fi-en") maybeAutoplay(word.fi);

  const card = body.querySelector('[data-role="flashcard"]');
  const gradeRow = body.querySelector('[data-role="grade-row"]');
  let flipped = false;

  const flip = () => {
    flipped = !flipped;
    card.classList.toggle("flashcard--flipped", flipped);
    if (flipped) {
      gradeRow.hidden = false;
      if (dir === "en-fi") maybeAutoplay(word.fi);
    }
  };
  card.addEventListener("click", flip);
  card.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); flip(); }
  });

  gradeRow.querySelectorAll(".grade-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      recordResult(session, word, btn.dataset.grade === "good");
      advance(session);
    });
  });
}

// ---------- Quiz ----------

function buildDistractors(word, dir, count) {
  const pool = state.words.filter((w) => w.id !== word.id);
  const sameChapter = pool.filter((w) => w.chapter === word.chapter);
  const source = sameChapter.length >= count ? sameChapter : pool;
  const picks = [];
  const seen = new Set();
  const correct = (dir === "fi-en" ? word.en : word.fi).trim().toLowerCase();
  const sameFi = normalizeLoose(word.fi);
  const sameEn = normalizeLoose(word.en);
  for (const w of shuffle([...source])) {
    // Skip glossary twins (same Finnish or same English in another chapter):
    // their meaning would also be a right answer.
    if (normalizeLoose(w.fi) === sameFi || normalizeLoose(w.en) === sameEn) continue;
    const val = dir === "fi-en" ? w.en : w.fi;
    const key = val.trim().toLowerCase();
    if (key === correct || seen.has(key)) continue;
    seen.add(key);
    picks.push(val);
    if (picks.length >= count) break;
  }
  return picks;
}

function renderQuiz(session, body) {
  const word = session.queue[session.index];
  const dir = pickDirectionFor();
  const { prompt, answer } = promptAndAnswer(word, dir);

  body.innerHTML = "";
  body.appendChild(tpl("tpl-quiz"));
  body.querySelector('[data-role="chapter"]').textContent = word.chapter;
  body.querySelector('[data-role="prompt"]').textContent = prompt;
  if (dir === "fi-en") {
    body.querySelector('[data-role="prompt-speak"]').appendChild(speakBtn(word.fi));
    maybeAutoplay(word.fi);
  }

  const options = shuffle([answer, ...buildDistractors(word, dir, 3)]);
  const grid = body.querySelector('[data-role="options"]');
  const nextBtn = body.querySelector('[data-role="next"]');
  const feedback = body.querySelector('[data-role="quiz-feedback"]');
  let answered = false;

  options.forEach((opt) => {
    const btn = el("button", { type: "button", class: "option-btn", text: opt });
    btn.addEventListener("click", () => {
      if (answered) return;
      answered = true;
      const correct = normalizeLoose(opt) === normalizeLoose(answer);
      grid.querySelectorAll(".option-btn").forEach((b) => {
        b.disabled = true;
        if (normalizeLoose(b.textContent) === normalizeLoose(answer)) b.classList.add("option-btn--correct");
      });
      if (!correct) btn.classList.add("option-btn--wrong");
      recordResult(session, word, correct);
      showFeedback(feedback, correct ? "correct" : "wrong", correct ? randomPraise() : `Correct answer: ${answer}`, word);
      nextBtn.hidden = false;
      nextBtn.focus();
    });
    grid.appendChild(btn);
  });

  nextBtn.addEventListener("click", () => advance(session));
}

function showFeedback(box, kind, text, word) {
  box.hidden = false;
  box.className = `write-feedback write-feedback--${kind === "half" ? "half" : kind}`;
  box.innerHTML = "";
  box.appendChild(el("span", { text }));
  box.appendChild(speakBtn(word.fi, { small: true }));
}

// ---------- Write ----------

function stripParens(s) {
  // "(around) here" -> "here"
  return s.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
}

function flattenParens(s) {
  // "(around) here" -> "around here"
  return s.replace(/[()]/g, "").replace(/\s+/g, " ").trim();
}

function normalizeLoose(s) {
  return String(s)
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[’`]/g, "'")
    .replace(/-{2,}/g, " ")
    .replace(/[!?.,;:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function acceptableAnswers(raw, { stripLeadTo = false, stripArticles = false } = {}) {
  const variants = new Set();
  const parts = raw.split("/").map((p) => p.trim());
  for (const part of parts) {
    for (const withParens of [part, stripParens(part), flattenParens(part)]) {
      const sub = withParens.split(",").map((p) => p.trim()).filter(Boolean);
      for (const s of [withParens, ...sub]) {
        const norm = normalizeLoose(s);
        if (!norm) continue;
        variants.add(norm);
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

function undot(s) {
  return s.replace(/ä/g, "a").replace(/ö/g, "o").replace(/å/g, "a");
}

// Returns "correct", "half" (right word, but the dots on ä/ö/å are missing
// or misplaced) or "wrong".
function checkWriteAnswer(userInput, correctRaw, dir) {
  const opts = dir === "fi-en" ? { stripLeadTo: true, stripArticles: true } : {};
  const accepted = acceptableAnswers(correctRaw, opts);
  const typed = normalizeLoose(userInput);
  if (!typed) return "wrong";
  if (accepted.has(typed)) return "correct";
  if (/[äöå]/i.test(correctRaw)) {
    const undotted = new Set([...accepted].map(undot));
    if (undotted.has(undot(typed))) return "half";
  }
  return "wrong";
}

function renderWrite(session, body) {
  const word = session.queue[session.index];
  const dir = pickDirectionFor();
  const { prompt, answer } = promptAndAnswer(word, dir);

  body.innerHTML = "";
  body.appendChild(tpl("tpl-write"));
  body.querySelector('[data-role="chapter"]').textContent = word.chapter;
  body.querySelector('[data-role="prompt"]').textContent = prompt;
  if (dir === "fi-en") {
    body.querySelector('[data-role="prompt-speak"]').appendChild(speakBtn(word.fi));
    maybeAutoplay(word.fi);
  }

  const form = body.querySelector('[data-role="form"]');
  const input = body.querySelector('[data-role="input"]');
  const feedback = body.querySelector('[data-role="feedback"]');
  const nextBtn = body.querySelector('[data-role="next"]');
  const hintBtn = body.querySelector('[data-role="hint"]');
  const hintText = body.querySelector('[data-role="hint-text"]');
  const letters = body.querySelector('[data-role="letters"]');
  input.placeholder = dir === "fi-en" ? "Type the English…" : "Type the Finnish…";
  letters.hidden = dir === "fi-en";
  input.focus();

  // ä / ö buttons for keyboards without Finnish letters.
  letters.querySelectorAll("button").forEach((b) => {
    b.addEventListener("click", () => {
      const start = input.selectionStart ?? input.value.length;
      const end = input.selectionEnd ?? input.value.length;
      input.value = input.value.slice(0, start) + b.textContent + input.value.slice(end);
      input.focus();
      input.setSelectionRange(start + 1, start + 1);
    });
  });

  let answered = false;
  let hintUsed = false;

  hintBtn.addEventListener("click", () => {
    hintUsed = true;
    hintText.textContent = word.hint
      ? "💡 " + word.hint
      : `💡 Starts with "${answer.replace(/^\(/, "").trim()[0] || "?"}"`;
    hintText.hidden = false;
    hintBtn.disabled = true;
    input.focus();
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (answered) return;
    answered = true;
    // Also accept the meaning of glossary twins: "tarkistaa" is "to check out"
    // in one chapter and "to check" in another; "that" is "tuo" or "että".
    const twins = state.words.filter((w) =>
      dir === "fi-en" ? normalizeLoose(w.fi) === normalizeLoose(word.fi) : normalizeLoose(w.en) === normalizeLoose(word.en)
    );
    const allAnswers = [...new Set(twins.map((w) => (dir === "fi-en" ? w.en : w.fi)))].join(" / ") || answer;
    let result = checkWriteAnswer(input.value, allAnswers, dir);
    input.disabled = true;

    if (result === "correct" && hintUsed) {
      showFeedback(feedback, "half", `Correct with a hint: +0.5 · ${answer}`, word);
      recordResult(session, word, "half");
    } else if (result === "correct") {
      showFeedback(feedback, "correct", randomPraise(), word);
      recordResult(session, word, true);
    } else if (result === "half") {
      showFeedback(feedback, "half", `Almost! Watch the dots: ${answer} (+0.5)`, word);
      recordResult(session, word, "half");
    } else {
      showFeedback(feedback, "wrong", `Correct answer: ${answer}`, word);
      recordResult(session, word, false);
    }
    if (dir === "en-fi") maybeAutoplay(word.fi);

    form.querySelector('[data-role="check"]').hidden = true;
    hintBtn.hidden = true;
    letters.hidden = true;
    nextBtn.hidden = false;
    nextBtn.focus();
  });

  nextBtn.addEventListener("click", () => advance(session));
}

// ---------- Summary ----------

function renderSummary(session) {
  state.view = "session";
  app.innerHTML = "";
  app.appendChild(tpl("tpl-summary"));

  // Best-effort, silent, never blocks the UI -- see js/sync.js.
  syncProgress(state.words, state.chapters);
  if (getAccount()) syncAccount();

  const total = session.queue.length;
  const headline = app.querySelector('[data-role="headline"]');
  const detail = app.querySelector('[data-role="detail"]');

  if (session.mode === "flashcards") {
    headline.textContent = "Session complete";
    detail.textContent = `${session.score} / ${total} marked as known.`;
  } else {
    headline.textContent = `${formatScore(session.score)} / ${total} correct`;
    const pct = (session.score / total) * 100;
    detail.textContent = randomFrom(pct === 100 ? SUMMARY_PRAISE_PERFECT : pct >= 80 ? SUMMARY_PRAISE_GOOD : SUMMARY_PRAISE_KEEP_GOING);
  }

  const missedBox = app.querySelector('[data-role="missed"]');
  const missed = [...new Map(session.missed.map((w) => [w.id, w])).values()];
  if (missed.length) {
    missedBox.hidden = false;
    missedBox.appendChild(el("h3", { class: "panel-title", text: `Practise again (${missed.length})` }));
    const list = el("div", { class: "glossary-list" });
    missed.forEach((w) => list.appendChild(wordRow(w)));
    missedBox.appendChild(list);
    missedBox.appendChild(
      el("button", {
        type: "button",
        class: "primary-btn missed-again",
        text: "🔁 Practise these words",
        onclick: () => startSession(session.kind === "focus" ? "focus" : session.mode, shuffle([...missed])),
      })
    );
  }

  app.querySelector('[data-role="home"]').addEventListener("click", () => go(session.returnTab || "study"));
  app.querySelector('[data-role="again"]').addEventListener("click", () => startSession(session.kind));
}

// One word as a row: Finnish, English, level dots and 🔊. Shared by several tabs.
function wordRow(w, { showChapter = false } = {}) {
  const lv = SRS.level(w.id);
  return el("div", { class: "glossary-row" }, [
    el("div", { class: "glossary-main" }, [
      el("span", { class: "glossary-fi" }, [
        w.fi,
        w.verbType ? el("span", { class: "verb-type", title: `Verb type ${w.verbType}`, text: `vt ${w.verbType}` }) : null,
      ]),
      el("span", { class: "glossary-en", text: w.en }),
      showChapter ? el("span", { class: "glossary-chapter-tag", text: w.chapter }) : null,
    ]),
    el("div", { class: "glossary-side" }, [
      el("span", { class: `level-dot level-dot--${lv}`, title: LEVEL_LABELS[lv] }),
      speakBtn(w.fi, { small: true }),
    ]),
  ]);
}

// ---------- Service worker ----------

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("sw.js").catch((err) => console.warn("SW registration failed", err));
}

init();

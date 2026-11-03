// Owner-only YKI practice page (yki.html). Not linked from the main app's tab
// bar. Same passphrase gate as the dashboard (dashboard_check in setup.sql);
// like the dashboard, the gate only hides the page from casual visitors —
// the files themselves are public. Content: data/yki.json (original tasks).
// Progress is stored only in this browser (localStorage, best effort).

const Y = { data: null, tab: "today", store: null };
const STORE_KEY = "finYki.v1";
const UNLOCK_KEY = "finVocabDashboardUnlocked.v1"; // shared with dashboard.html
const SKILLS = {
  reading: { icon: "📖", label: "Reading", fi: "Luetun ymmärtäminen" },
  listening: { icon: "🎧", label: "Listening", fi: "Kuullun ymmärtäminen" },
  writing: { icon: "✍️", label: "Writing", fi: "Kirjoittaminen" },
  speaking: { icon: "🎤", label: "Speaking", fi: "Puhuminen" },
};
const TABS = [
  ["today", "🏠 Today"],
  ["test", "🧪 Level test"],
  ["reading", "📖 Reading"],
  ["listening", "🎧 Listening"],
  ["writing", "✍️ Writing"],
  ["speaking", "🎤 Speaking"],
  ["plan", "🗓️ Plan & progress"],
];

// ---------- storage (best effort: the page works without it) ----------

function loadStore() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(STORE_KEY)); } catch {}
  return { history: [], checks: {}, levels: [], drafts: {}, ...(s || {}) };
}
function saveStore() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(Y.store)); } catch {}
}
function logResult(skill, id, score, total, extra = {}) {
  Y.store.history.push({ t: Date.now(), skill, id, score, total, ...extra });
  if (Y.store.history.length > 500) Y.store.history = Y.store.history.slice(-500);
  saveStore();
}

// ---------- helpers ----------

// Rough guide only: share of points → YKI basic-level grade.
function band(ratio) {
  if (ratio >= 0.75) return { grade: 2, label: "around grade 2 (A2)", cls: "g2" };
  if (ratio >= 0.45) return { grade: 1, label: "around grade 1 (A1)", cls: "g1" };
  return { grade: 0, label: "not yet grade 1", cls: "g0" };
}
const money = (g) => (g >= 2 ? "€2,000" : g === 1 ? "€1,000" : "€0");

function sample(arr, n) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, n);
}
function wordCount(s) { return (s.trim().match(/\S+/g) || []).length; }
function fmtDate(iso) {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}
function daysUntil(iso) {
  const a = new Date(); a.setHours(0, 0, 0, 0);
  const b = new Date(iso + "T00:00:00");
  return Math.round((b - a) / 86400000);
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast("Copied ✓ Paste it into your chat with Claude."); }
  catch { window.prompt("Copy this text:", text); }
}
function section(title, children, cls = "") {
  return el("section", { class: "card yki-card " + cls }, [title ? el("h2", { class: "panel-title", text: title }) : null, ...children]);
}

// Countdown timer (writing / speaking). Returns { node, stop }.
function timer(seconds, label) {
  let left = seconds, id = null;
  const out = el("span", { class: "yki-timer-num", text: fmt(left) });
  const btn = el("button", { type: "button", class: "ghost-btn yki-timer-btn", text: `⏱️ Start ${label}` });
  function fmt(s) { return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; }
  function stop() { clearInterval(id); id = null; }
  btn.addEventListener("click", () => {
    if (id) { stop(); btn.textContent = "▶ Continue"; return; }
    btn.textContent = "⏸ Pause";
    id = setInterval(() => {
      if (!out.isConnected) return stop();
      left = Math.max(0, left - 1);
      out.textContent = fmt(left);
      if (!left) { stop(); out.classList.add("yki-timer-num--done"); btn.textContent = "Time's up"; btn.disabled = true; toast("⏰ Time's up!"); }
    }, 1000);
  });
  return { node: el("div", { class: "yki-timer" }, [btn, out]), stop };
}

// ---------- multiple choice (reading + listening) ----------
// units: reading texts or listening clips, each with qs[]. Calls done(score, total).
function mcSession(box, kind, units, { done, maxPlays = 0, title = "" } = {}) {
  let ui = 0, score = 0, total = 0;
  const draw = () => {
    box.innerHTML = "";
    if (ui >= units.length) return done && done(score, total);
    const u = units[ui];
    const head = el("div", { class: "yki-unit-head" }, [
      el("span", { class: "yki-step", text: `${title ? title + " · " : ""}${ui + 1} / ${units.length}` }),
      el("strong", { text: u.title }),
      el("span", { class: "muted small", text: u.en }),
    ]);
    const parts = [head];
    if (kind === "reading") {
      parts.push(el("div", { class: "yki-text", text: u.text }));
    } else {
      let plays = 0;
      const info = el("span", { class: "muted small" });
      const play = el("button", { type: "button", class: "primary-btn yki-play", text: "▶ Play" });
      const upd = () => { info.textContent = maxPlays ? `Played ${plays} / ${maxPlays}` : plays ? `Played ${plays}×` : "Listen first, then answer. No text is shown."; };
      play.addEventListener("click", () => {
        if (maxPlays && plays >= maxPlays) return;
        plays++; upd();
        if (maxPlays && plays >= maxPlays) play.disabled = true;
        Speech.sayAll(u.lines);
      });
      upd();
      parts.push(el("div", { class: "yki-play-row" }, [play, info]));
    }
    const picks = new Array(u.qs.length).fill(-1);
    const qBoxes = u.qs.map((q, qi) => {
      const opts = q.opts.map((o, oi) => el("button", {
        type: "button", class: "option-btn yki-opt", text: o,
        onclick: () => {
          if (checked) return;
          picks[qi] = oi;
          opts.forEach((b, bi) => b.classList.toggle("yki-opt--picked", bi === oi));
          checkBtn.disabled = picks.includes(-1);
        },
      }));
      const why = el("p", { class: "yki-why small", hidden: true, text: q.why });
      return { node: el("div", { class: "yki-q" }, [el("p", { class: "yki-q-text", text: `${qi + 1}. ${q.q}` }), el("div", { class: "yki-opts" }, opts), why]), opts, why, q };
    });
    let checked = false;
    const tr = el("p", { class: "yki-tr small", hidden: true, text: "🇬🇧 " + u.tr });
    const extra = el("div", { class: "yki-after", hidden: true });
    if (kind === "listening") {
      extra.append(el("div", { class: "yki-text yki-script", text: u.lines.join("\n") }), speakBtn(u.lines.join(" "), { label: "Listen again" }));
    }
    const checkBtn = el("button", { type: "button", class: "primary-btn", text: "Check answers", disabled: true });
    const nextBtn = el("button", { type: "button", class: "primary-btn", text: ui + 1 < units.length ? "Next →" : "See result", hidden: true, onclick: () => { Speech.stop(); ui++; draw(); } });
    checkBtn.addEventListener("click", () => {
      checked = true;
      qBoxes.forEach((b, qi) => {
        total++;
        if (picks[qi] === b.q.a) score++;
        b.opts.forEach((o, oi) => {
          o.disabled = true;
          if (oi === b.q.a) o.classList.add("option-btn--correct");
          else if (oi === picks[qi]) o.classList.add("option-btn--wrong");
        });
        b.why.hidden = false;
      });
      tr.hidden = false; extra.hidden = false;
      checkBtn.hidden = true; nextBtn.hidden = false;
      logResult(kind, u.id, qBoxes.filter((b, qi) => picks[qi] === b.q.a).length, qBoxes.length);
    });
    box.append(...parts, ...qBoxes.map((b) => b.node), extra, tr, el("div", { class: "yki-actions" }, [checkBtn, nextBtn]));
  };
  draw();
}

function resultCard(skill, score, total, again) {
  const b = band(total ? score / total : 0);
  return section("", [
    el("h2", { class: "yki-result-title", text: `${SKILLS[skill].icon} ${score} / ${total} correct` }),
    el("p", { class: `yki-band yki-band--${b.cls}`, text: `Rough estimate: ${b.label}` }),
    el("div", { class: "yki-actions" }, [
      again ? el("button", { type: "button", class: "primary-btn", text: "↻ New set", onclick: again }) : null,
      el("button", { type: "button", class: "ghost-btn", text: "🏠 Today", onclick: () => go("today") }),
    ]),
  ]);
}

// ---------- writing ----------

function writingTask(box, w, { onDone, timed = 20 * 60, compact = false } = {}) {
  box.innerHTML = "";
  const area = el("textarea", { class: "yki-area", rows: 7, placeholder: "Kirjoita tähän… (type in Finnish)", spellcheck: "false" });
  area.value = Y.store.drafts[w.id] || "";
  const count = el("span", { class: "muted small" });
  const upd = () => { const n = wordCount(area.value); count.textContent = `${n} words · target ${w.words}`; count.classList.toggle("yki-ok", n >= w.min); };
  area.addEventListener("input", () => { upd(); Y.store.drafts[w.id] = area.value; saveStore(); });
  upd();
  const t = timer(timed, `${Math.round(timed / 60)} min`);
  const review = el("div", { class: "yki-review", hidden: true });
  const doneBtn = el("button", { type: "button", class: "primary-btn", text: "Done → self-check" });
  doneBtn.addEventListener("click", () => {
    if (!area.value.trim()) { toast("Write something first 🙂"); return; }
    t.stop(); doneBtn.hidden = true; review.hidden = false;
    const items = [...w.check, ...Y.data.genWriting];
    const boxes = items.map((txt) => el("input", { type: "checkbox" }));
    const save = el("button", { type: "button", class: "primary-btn", text: "Save self-check" });
    save.addEventListener("click", () => {
      const ticks = boxes.filter((b) => b.checked).length;
      const n = wordCount(area.value);
      logResult("writing", w.id, ticks, items.length, { words: n });
      save.disabled = true; save.textContent = "Saved ✓";
      const b = band(ticks / items.length);
      review.append(el("p", { class: `yki-band yki-band--${b.cls}`, text: `Self-check ${ticks}/${items.length}: ${b.label}. Self-checks are usually generous, so paste it into chat for a real mark.` }));
      onDone && onDone(ticks, items.length);
    });
    review.append(
      el("h3", { text: "1 · Compare with a model answer" }),
      el("div", { class: "yki-text yki-model" }, [w.model, speakBtn(w.model, { small: true, label: "Listen to the model" })]),
      el("h3", { text: "2 · Tick what your text does" }),
      el("div", { class: "yki-checks" }, items.map((txt, i) => el("label", { class: "check-row" }, [boxes[i], el("span", { text: txt })]))),
      el("div", { class: "yki-actions" }, [
        save,
        el("button", { type: "button", class: "ghost-btn", text: "📋 Copy for Claude", onclick: () => copyText(chatPrompt("writing", w, area.value)) }),
      ])
    );
  });
  box.append(
    el("div", { class: "yki-unit-head" }, [el("strong", { text: `${w.title}` }), el("span", { class: "muted small", text: w.en })]),
    el("p", { class: "yki-task", text: w.task }),
    el("p", { class: "yki-task-fi", text: w.fi }),
    compact ? null : el("details", { class: "yki-phrases" }, [el("summary", { text: "💡 Useful phrases" }), el("ul", {}, w.phrases.map((p) => el("li", { text: p })))]),
    t.node, area, count,
    el("div", { class: "yki-actions" }, [doneBtn]),
    review
  );
}

// ---------- speaking ----------

function recorder() {
  const wrap = el("div", { class: "yki-rec" });
  if (!(navigator.mediaDevices && window.MediaRecorder)) {
    wrap.append(el("p", { class: "muted small", text: "Recording isn't supported in this browser. Speak out loud anyway, or record with your phone's voice memo app." }));
    return wrap;
  }
  let rec = null, chunks = [], stream = null;
  const audio = el("audio", { controls: true, hidden: true, class: "yki-audio" });
  const btn = el("button", { type: "button", class: "ghost-btn", text: "⏺ Record myself" });
  btn.addEventListener("click", async () => {
    if (rec && rec.state === "recording") { rec.stop(); return; }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunks = [];
      rec = new MediaRecorder(stream);
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        audio.src = URL.createObjectURL(new Blob(chunks, { type: rec.mimeType || "audio/webm" }));
        audio.hidden = false;
        btn.textContent = "⏺ Record again";
      };
      rec.start();
      btn.textContent = "⏹ Stop recording";
    } catch {
      toast("Microphone not available. Allow it in the browser, or just speak out loud.");
    }
  });
  wrap.append(btn, audio, el("p", { class: "muted small", text: "The recording stays on this device only and disappears when you leave the page." }));
  return wrap;
}

function speakingTask(box, s, { onDone } = {}) {
  box.innerHTML = "";
  const t = timer(60, "1 min answer");
  const note = el("textarea", { class: "yki-area yki-area--small", rows: 3, placeholder: "Optional: type roughly what you said, so Claude can check it." });
  const review = el("div", { class: "yki-review", hidden: true });
  const doneBtn = el("button", { type: "button", class: "primary-btn", text: "Done → self-check" });
  doneBtn.addEventListener("click", () => {
    t.stop(); doneBtn.hidden = true; review.hidden = false;
    const items = Y.data.genSpeaking;
    const boxes = items.map(() => el("input", { type: "checkbox" }));
    const save = el("button", { type: "button", class: "primary-btn", text: "Save self-check" });
    save.addEventListener("click", () => {
      const ticks = boxes.filter((b) => b.checked).length;
      logResult("speaking", s.id, ticks, items.length);
      save.disabled = true; save.textContent = "Saved ✓";
      onDone && onDone(ticks, items.length);
    });
    review.append(
      el("h3", { text: "1 · Listen to a model answer" }),
      el("div", { class: "yki-text yki-model" }, [s.model, speakBtn(s.model, { small: true, label: "Listen to the model" })]),
      el("h3", { text: "2 · Tick what you did" }),
      el("div", { class: "yki-checks" }, items.map((txt, i) => el("label", { class: "check-row" }, [boxes[i], el("span", { text: txt })]))),
      el("div", { class: "yki-actions" }, [
        save,
        el("button", { type: "button", class: "ghost-btn", text: "📋 Copy for Claude", onclick: () => copyText(chatPrompt("speaking", s, note.value)) }),
      ])
    );
  });
  box.append(
    el("div", { class: "yki-unit-head" }, [el("strong", { class: "yki-prompt-fi" }, [s.fi, speakBtn(s.fi, { small: true })]), el("span", { class: "muted small", text: s.en })]),
    el("details", { class: "yki-phrases" }, [el("summary", { text: "💡 Words you can use" }), el("ul", {}, s.hints.map((p) => el("li", { text: p })))]),
    el("p", { class: "muted small", text: "Think for 30 seconds, then start the timer and speak for about a minute. Answer in full sentences." }),
    t.node, recorder(), note,
    el("div", { class: "yki-actions" }, [doneBtn]),
    review
  );
}

function chatPrompt(skill, task, text) {
  if (skill === "writing") {
    return `YKI practice: writing task "${task.title}" (${task.en}).\nTask: ${task.task}\nTarget: ${task.words} words.\n\nMy answer:\n${text.trim()}\n\nPlease mark it like a YKI basic-level teacher: estimate grade 1 or 2, correct my mistakes, and give me 2 tips.`;
  }
  return `YKI practice: speaking task "${task.fi}" (${task.en}).\n\nWhat I said (roughly):\n${(text || "").trim() || "(I didn't type it — please give me a model answer and tips instead.)"}\n\nPlease mark it like a YKI basic-level teacher: estimate grade 1 or 2, correct my mistakes, and give me 2 tips.`;
}

// ---------- tabs ----------

function renderToday(main) {
  const next = Y.data.dates.find((d) => daysUntil(d.date) >= 0);
  if (next) {
    const n = daysUntil(next.date);
    main.append(section("⏳ Next key date", [
      el("p", { class: "yki-count" }, [el("strong", { text: n === 0 ? "Today!" : `${n} days` }), ` · ${fmtDate(next.date)}`]),
      el("p", { text: (next.kind === "register" ? "📝 " : "🎓 ") + next.label }),
    ]));
  }
  const day = new Date().getDay(); // 0 Sun … 6 Sat
  const plans = {
    1: ["listening", "reading", "Listening + reading (30–40 min)"],
    3: ["listening", "reading", "Listening + reading (30–40 min)"],
    2: ["speaking", null, "After class: one speaking prompt (15 min)"],
    4: ["speaking", null, "After class: one speaking prompt (15 min)"],
    5: [null, null, "Light day: 15 min vocabulary in the main app"],
    6: ["writing", null, "Writing: one task + self-check (30–40 min)"],
    0: ["speaking", "speaking", "Speaking: two prompts, record yourself (30–40 min)"],
  };
  const [a, b, label] = plans[day];
  const box = el("div");
  const start = (skill) => {
    if (skill === "reading") return () => runPractice(box, "reading", 2);
    if (skill === "listening") return () => runPractice(box, "listening", 2);
    if (skill === "writing") return () => writingTask(box, pickUnseen("writing"));
    return () => speakingTask(box, pickUnseen("speaking"));
  };
  const btns = [a, b].filter(Boolean).filter((v, i, arr) => arr.indexOf(v) === i).map((s) =>
    el("button", { type: "button", class: "primary-btn", text: `${SKILLS[s].icon} Start ${SKILLS[s].label.toLowerCase()}`, onclick: start(s) }));
  main.append(section("📅 Today's session", [
    el("p", { text: label }),
    btns.length ? el("div", { class: "yki-actions" }, btns) : el("a", { class: "primary-btn yki-link-btn", href: "./#/study", text: "📚 Open vocabulary practice" }),
    box,
  ]));
  const lv = Y.store.levels[Y.store.levels.length - 1];
  main.append(section("🧪 Level test", [
    el("p", { text: lv ? `Last level test: ${new Date(lv.t).toLocaleDateString("en-GB")} → estimate ${money(lv.min)}.` : "You haven't done the level test yet. It takes about 30–40 minutes and shows your weakest skill." }),
    el("button", { type: "button", class: lv ? "ghost-btn" : "primary-btn", text: lv ? "Take it again" : "Start the level test", onclick: () => go("test") }),
  ]));
}

function pickUnseen(skill) {
  const done = new Set(Y.store.history.filter((h) => h.skill === skill).map((h) => h.id));
  const pool = Y.data[skill].filter((x) => !done.has(x.id));
  return sample(pool.length ? pool : Y.data[skill], 1)[0];
}

function runPractice(box, skill, n) {
  const done = new Set(Y.store.history.filter((h) => h.skill === skill).map((h) => h.id));
  const fresh = Y.data[skill].filter((u) => !done.has(u.id));
  const units = sample(fresh.length >= n ? fresh : Y.data[skill], n);
  mcSession(box, skill, units, {
    done: (s, t) => { box.innerHTML = ""; box.append(resultCard(skill, s, t, () => runPractice(box, skill, n))); },
  });
}

function renderMC(main, skill) {
  const box = el("div", { class: "card yki-card yki-practice" });
  const all = Y.data[skill];
  const seen = new Set(Y.store.history.filter((h) => h.skill === skill).map((h) => h.id));
  main.append(section(`${SKILLS[skill].icon} ${SKILLS[skill].label} · ${SKILLS[skill].fi}`, [
    el("p", { class: "small", text: skill === "reading"
      ? "Short everyday texts: notices, messages, ads. Read, answer, then check. The English translation appears after checking."
      : "Short clips read by your device's Finnish voice. In the real test you hear each clip about twice, so try to answer after two plays. The text appears after checking." }),
    el("p", { class: "muted small", text: `${seen.size} / ${all.length} done at least once.` }),
    el("div", { class: "yki-actions" }, [
      el("button", { type: "button", class: "primary-btn", text: "▶ Practice set (3)", onclick: () => runPractice(box, skill, 3) }),
    ]),
    el("details", { class: "yki-list" }, [el("summary", { text: "Pick one" }), el("div", { class: "chip-row" }, all.map((u) =>
      el("button", { type: "button", class: "chip" + (seen.has(u.id) ? " chip--done" : ""), text: u.title, onclick: () => mcSession(box, skill, [u], { done: (s, t) => { box.innerHTML = ""; box.append(resultCard(skill, s, t)); } }) })))]),
  ]));
  main.append(box);
}

function renderOpen(main, skill) {
  const box = el("div", { class: "card yki-card" });
  const all = Y.data[skill];
  const seen = new Set(Y.store.history.filter((h) => h.skill === skill).map((h) => h.id));
  const open = (x) => (skill === "writing" ? writingTask(box, x) : speakingTask(box, x));
  main.append(section(`${SKILLS[skill].icon} ${SKILLS[skill].label} · ${SKILLS[skill].fi}`, [
    el("p", { class: "small", text: skill === "writing"
      ? "Write on the computer like in the digital test. Then compare with a model answer, tick a checklist, and copy your text to Claude for a real mark if you want."
      : "Speak out loud, ideally recording yourself. Then listen to a model answer, tick a checklist, and copy what you said to Claude if you want feedback." }),
    el("p", { class: "muted small", text: `${seen.size} / ${all.length} done at least once.` }),
    el("div", { class: "chip-row" }, all.map((x) => el("button", { type: "button", class: "chip" + (seen.has(x.id) ? " chip--done" : ""), text: skill === "writing" ? x.title : x.fi, onclick: () => open(x) }))),
  ]));
  main.append(box);
  open(pickUnseen(skill));
}

// Level test: 2 reading texts + 2 listening clips + 1 writing + 2 speaking.
function renderTest(main) {
  const box = el("div", { class: "card yki-card" });
  main.append(box);
  const intro = () => {
    box.innerHTML = "";
    box.append(
      el("h2", { class: "panel-title", text: "🧪 Level test (about 30–40 min)" }),
      el("p", { text: "Four parts, like YKI: reading, listening, writing and speaking. At the end you get a rough grade for each skill and the scholarship amount it points to." }),
      el("ul", { class: "small" }, [
        el("li", { text: "📖 Reading: 3 short texts" }),
        el("li", { text: "🎧 Listening: 3 clips, max 2 plays each" }),
        el("li", { text: "✍️ Writing: 1 task, 15 minutes" }),
        el("li", { text: "🎤 Speaking: 2 prompts, about 1 minute each" }),
      ]),
      el("p", { class: "muted small", text: "Reading and listening are scored automatically. Writing and speaking use your own self-check, so they're less exact." }),
      el("button", { type: "button", class: "primary-btn", text: "Start", onclick: run })
    );
  };
  const res = {};
  function run() {
    mcSession(box, "reading", sample(Y.data.reading, 3), { title: "Part 1 · Reading", done: (s, t) => {
      res.reading = [s, t];
      mcSession(box, "listening", sample(Y.data.listening, 3), { title: "Part 2 · Listening", maxPlays: 2, done: (s2, t2) => {
        res.listening = [s2, t2];
        const w = sample(Y.data.writing, 1)[0];
        writingTask(box, w, { timed: 15 * 60, compact: true, onDone: (s3, t3) => {
          res.writing = [s3, t3];
          box.append(el("div", { class: "yki-actions" }, [el("button", { type: "button", class: "primary-btn", text: "Next: speaking →", onclick: speak })]));
        } });
        box.prepend(el("span", { class: "yki-step", text: "Part 3 · Writing" }));
      } });
    } });
  }
  function speak() {
    const [s1, s2] = sample(Y.data.speaking, 2);
    let sum = 0, tot = 0;
    speakingTask(box, s1, { onDone: (a, b) => {
      sum += a; tot += b;
      box.append(el("div", { class: "yki-actions" }, [el("button", { type: "button", class: "primary-btn", text: "Next prompt →", onclick: () => {
        speakingTask(box, s2, { onDone: (c, d) => {
          sum += c; tot += d; res.speaking = [sum, tot];
          box.append(el("div", { class: "yki-actions" }, [el("button", { type: "button", class: "primary-btn", text: "See my result →", onclick: finish })]));
        } });
        box.prepend(el("span", { class: "yki-step", text: "Part 4 · Speaking 2 / 2" }));
      } })]));
    } });
    box.prepend(el("span", { class: "yki-step", text: "Part 4 · Speaking 1 / 2" }));
  }
  function finish() {
    Speech.stop();
    const grades = Object.fromEntries(Object.entries(res).map(([k, [s, t]]) => [k, band(t ? s / t : 0)]));
    const min = Math.min(...Object.values(grades).map((g) => g.grade));
    const weakest = Object.entries(res).sort((a, b) => a[1][0] / a[1][1] - b[1][0] / b[1][1])[0][0];
    Y.store.levels.push({ t: Date.now(), res, min, weakest });
    saveStore();
    box.innerHTML = "";
    box.append(
      el("h2", { class: "panel-title", text: "🧪 Your result" }),
      el("div", { class: "yki-grid" }, Object.keys(SKILLS).map((k) => el("div", { class: `yki-skill yki-band--${grades[k].cls}` }, [
        el("span", { class: "yki-skill-name", text: `${SKILLS[k].icon} ${SKILLS[k].label}` }),
        el("strong", { text: `${res[k][0]} / ${res[k][1]}` }),
        el("span", { class: "small", text: grades[k].label }),
      ]))),
      el("p", { class: "yki-money" }, ["The scholarship needs the grade in ", el("strong", { text: "all four" }), ` skills, so this points to `, el("strong", { text: money(min) }), "."]),
      el("p", { text: `Weakest skill: ${SKILLS[weakest].icon} ${SKILLS[weakest].label}. Give it extra time this week.` }),
      el("p", { class: "muted small", text: "Rough guide only. Writing and speaking come from your own ticks, so copy a few answers to Claude for a real mark." }),
      el("div", { class: "yki-actions" }, [
        el("button", { type: "button", class: "primary-btn", text: `Practise ${SKILLS[weakest].label.toLowerCase()}`, onclick: () => go(weakest) }),
        el("button", { type: "button", class: "ghost-btn", text: "🏠 Today", onclick: () => go("today") }),
      ])
    );
  }
  intro();
}

function renderPlan(main) {
  main.append(section("🗓️ Key dates (basic level, Finnish, digital)", [
    el("ul", { class: "yki-dates" }, Y.data.dates.map((d) => {
      const n = daysUntil(d.date);
      return el("li", { class: n < 0 ? "yki-past" : "" }, [el("strong", { text: fmtDate(d.date) }), ` ${d.kind === "test" ? "🎓" : "📝"} ${d.label}`, n >= 0 ? el("span", { class: "muted small", text: ` · in ${n} days` }) : null]);
    })),
    el("p", { class: "muted small" }, ["Register on ", el("a", { href: "https://yki.opintopolku.fi", target: "_blank", rel: "noopener", text: "the YKI registration site" }), " on the first day: Helsinki seats fill fast. Basic level fee €165. Results come about 2 months after the test."]),
  ]));
  main.append(section("✅ Milestones", [
    el("div", { class: "yki-checks" }, Y.data.milestones.map((m) => {
      const cb = el("input", { type: "checkbox" });
      cb.checked = !!Y.store.checks[m.id];
      cb.addEventListener("change", () => { Y.store.checks[m.id] = cb.checked; saveStore(); });
      return el("label", { class: "check-row" }, [cb, el("span", {}, [m.text, el("span", { class: "muted small", text: ` · by ${fmtDate(m.by)}` })])]);
    })),
  ]));
  const rows = Object.keys(SKILLS).map((k) => {
    const h = Y.store.history.filter((x) => x.skill === k);
    const last = h.slice(-5);
    const s = last.reduce((a, x) => a + x.score, 0), t = last.reduce((a, x) => a + x.total, 0);
    const b = t ? band(s / t) : null;
    return el("div", { class: `yki-skill ${b ? "yki-band--" + b.cls : ""}` }, [
      el("span", { class: "yki-skill-name", text: `${SKILLS[k].icon} ${SKILLS[k].label}` }),
      el("strong", { text: t ? `${Math.round((s / t) * 100)}%` : "–" }),
      el("span", { class: "small", text: b ? b.label : "no practice yet" }),
      el("span", { class: "muted small", text: `${h.length} done` }),
    ]);
  });
  main.append(section("📈 Progress (last 5 sessions per skill)", [el("div", { class: "yki-grid" }, rows)]));
  if (Y.store.levels.length) {
    main.append(section("🧪 Level test history", [el("ul", { class: "yki-dates" }, Y.store.levels.slice().reverse().map((l) =>
      el("li", { text: `${new Date(l.t).toLocaleDateString("en-GB")}: ${Object.keys(SKILLS).map((k) => `${SKILLS[k].icon} ${l.res[k][0]}/${l.res[k][1]}`).join("  ")} → ${money(l.min)}` })))]));
  }
  main.append(section("", [
    el("p", { class: "muted small", text: "Progress is saved only in this browser on this device." }),
    el("button", { type: "button", class: "ghost-btn", text: "Reset YKI progress", onclick: () => {
      if (!window.confirm("Delete all YKI practice progress on this device?")) return;
      Y.store = loadStore(); Y.store.history = []; Y.store.checks = {}; Y.store.levels = []; Y.store.drafts = {}; saveStore(); go("plan");
    } }),
  ]));
}

// ---------- shell ----------

function go(tab) {
  Speech.stop();
  Y.tab = tab;
  try { history.replaceState(null, "", "#" + tab); } catch {}
  const nav = document.getElementById("yki-nav");
  nav.innerHTML = "";
  TABS.forEach(([id, label]) => nav.appendChild(el("button", { type: "button", class: "chip" + (id === tab ? " chip--active" : ""), text: label, onclick: () => go(id) })));
  const main = document.getElementById("yki-main");
  main.innerHTML = "";
  if (tab === "test") renderTest(main);
  else if (tab === "reading" || tab === "listening") renderMC(main, tab);
  else if (tab === "writing" || tab === "speaking") renderOpen(main, tab);
  else if (tab === "plan") renderPlan(main);
  else renderToday(main);
  window.scrollTo(0, 0);
}

async function start() {
  try {
    const res = await fetch("data/yki.json");
    Y.data = await res.json();
  } catch {
    document.getElementById("yki-main").append(el("p", { class: "card", text: "Couldn't load the practice tasks. Check your connection and reload." }));
    return;
  }
  Y.store = loadStore();
  const h = (location.hash || "").slice(1);
  go(TABS.some(([id]) => id === h) ? h : "today");
}

// ---------- passphrase gate (same check as dashboard.html) ----------

function configured() {
  const c = window.APP_CONFIG;
  return !!(c && c.SUPABASE_URL && c.SUPABASE_ANON_KEY && !c.SUPABASE_URL.startsWith("YOUR_SUPABASE_URL"));
}
async function checkPassphrase(pass) {
  const c = window.APP_CONFIG || {};
  if (configured()) {
    try {
      const res = await fetch(`${c.SUPABASE_URL}/rest/v1/rpc/dashboard_check`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: c.SUPABASE_ANON_KEY, Authorization: `Bearer ${c.SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ p_passphrase: pass }),
      });
      if (res.ok) return (await res.json()) === true;
    } catch (e) {
      console.warn("dashboard_check failed", e);
    }
  }
  return !!c.DASHBOARD_PASSPHRASE && pass === c.DASHBOARD_PASSPHRASE;
}
function unlock(pass) {
  try { sessionStorage.setItem(UNLOCK_KEY, pass); } catch {}
  document.getElementById("gate").hidden = true;
  document.getElementById("yki-content").hidden = false;
  start();
}
(function gate() {
  const input = document.getElementById("passphrase-input");
  const btn = document.getElementById("passphrase-submit");
  const err = document.getElementById("gate-error");
  const tryIt = async () => {
    btn.disabled = true;
    const ok = await checkPassphrase(input.value);
    btn.disabled = false;
    if (ok) { err.hidden = true; unlock(input.value); } else err.hidden = false;
  };
  btn.addEventListener("click", tryIt);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") tryIt(); });
  let saved = "";
  try { saved = sessionStorage.getItem(UNLOCK_KEY) || ""; } catch {}
  if (saved && saved !== "1") checkPassphrase(saved).then((ok) => (ok ? unlock(saved) : null));
  else input.focus();
})();

// Same service worker as the main app (needed so the YKI page can be
// installed as its own home-screen app and opens offline after one visit).
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

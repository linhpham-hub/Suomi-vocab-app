// Oral test tab: the teacher's list of basic questions. The teacher picks 5
// at random in the test, so there's a "random 5" drill, and learners can write
// and save their own answers (stored on this device).

const ORAL_KEY = "finVocabOral.v1"; // { answers: {id: text}, hard: {id: true} }
const oralState = { drill: null, showSpoken: true, showEnglish: true };

function loadOral() {
  try {
    return { answers: {}, hard: {}, ...(JSON.parse(localStorage.getItem(ORAL_KEY)) || {}) };
  } catch {
    return { answers: {}, hard: {} };
  }
}
function saveOral(data) {
  try { localStorage.setItem(ORAL_KEY, JSON.stringify(data)); } catch {}
}

function renderOral() {
  if (oralState.drill) return renderOralDrill();
  app.appendChild(tpl("tpl-oral"));
  const data = loadOral();
  const hardCount = Object.keys(data.hard).filter((k) => data.hard[k]).length;

  app.querySelector('[data-role="drill"]').addEventListener("click", () => startOralDrill());
  const hardBtn = app.querySelector('[data-role="drill-hard"]');
  hardBtn.hidden = !hardCount;
  hardBtn.textContent = `⭐ Practise my hard ones (${hardCount})`;
  hardBtn.addEventListener("click", () => startOralDrill(true));

  const spk = app.querySelector('[data-role="toggle-spoken"]');
  const eng = app.querySelector('[data-role="toggle-english"]');
  spk.checked = oralState.showSpoken;
  eng.checked = oralState.showEnglish;
  spk.addEventListener("change", () => { oralState.showSpoken = spk.checked; showTab("oral"); });
  eng.addEventListener("change", () => { oralState.showEnglish = eng.checked; showTab("oral"); });

  const list = app.querySelector('[data-role="questions"]');
  state.oral.forEach((q) => list.appendChild(oralCard(q, data)));

  const links = state.links.oral || [];
  const linkBox = app.querySelector('[data-role="oral-links"]');
  if (links.length) {
    links.forEach((l) => linkBox.appendChild(el("a", { href: l.url, target: "_blank", rel: "noopener", class: "game-link game-link--wide", text: "🎡 " + l.title })));
  } else linkBox.remove();
}

function oralCard(q, data, { drill = false } = {}) {
  const myAnswer = data.answers[q.id] || "";
  const answersBox = el("div", { class: "oral-answers", hidden: drill });
  q.answers.forEach((a) => {
    answersBox.appendChild(
      el("div", { class: "oral-answer" }, [
        el("span", { class: "oral-answer-fi" }, [a.fi, speakBtn(a.fi, { small: true })]),
        a.spoken && oralState.showSpoken
          ? el("span", { class: "oral-answer-spoken" }, [el("span", { class: "num-form-label", text: "spoken" }), a.spoken, speakBtn(a.spoken, { small: true })])
          : null,
      ])
    );
  });

  const ta = el("textarea", { class: "oral-mine", rows: "2", maxlength: "400", placeholder: "Write your own answer here (saved on this device)…" });
  ta.value = myAnswer;
  let t;
  ta.addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(() => {
      const d = loadOral();
      d.answers[q.id] = ta.value;
      saveOral(d);
    }, 300);
  });
  const mine = el("div", { class: "oral-mine-wrap", hidden: drill }, [
    el("label", { class: "field-label", text: "✍️ My answer" }),
    ta,
    el("button", { type: "button", class: "link-btn oral-mine-say", text: "🔊 Read my answer", onclick: () => ta.value.trim() && Speech.say(ta.value) }),
  ]);

  const isHard = !!data.hard[q.id];
  const star = el("button", {
    type: "button",
    class: "star-btn" + (isHard ? " star-btn--on" : ""),
    "aria-pressed": isHard ? "true" : "false",
    title: "Mark as hard: practise it more",
    text: isHard ? "⭐" : "☆",
    onclick: (e) => {
      e.stopPropagation();
      const d = loadOral();
      d.hard[q.id] = !d.hard[q.id];
      saveOral(d);
      star.textContent = d.hard[q.id] ? "⭐" : "☆";
      star.classList.toggle("star-btn--on", !!d.hard[q.id]);
      if (!drill && state.view === "oral") {
        const n = Object.values(d.hard).filter(Boolean).length;
        const hb = app.querySelector('[data-role="drill-hard"]');
        if (hb) { hb.hidden = !n; hb.textContent = `⭐ Practise my hard ones (${n})`; }
      }
    },
  });

  return el("article", { class: "card oral-card" }, [
    el("div", { class: "oral-q-head" }, [
      el("span", { class: "oral-num", text: String(q.id) }),
      el("div", { class: "oral-q" }, [
        el("div", { class: "oral-q-fi" }, [q.fi, speakBtn(q.fi, { small: true })]),
        q.spoken && oralState.showSpoken
          ? el("div", { class: "oral-q-spoken" }, [el("span", { class: "num-form-label", text: "spoken" }), q.spoken, speakBtn(q.spoken.split(" / ")[0], { small: true })])
          : null,
        oralState.showEnglish || drill ? el("div", { class: "oral-q-en", text: q.en, hidden: drill }) : null,
      ]),
      star,
    ]),
    el("div", { class: "oral-example-label field-label", text: "Example answer", hidden: drill }),
    answersBox,
    mine,
  ]);
}

// ---------- Random-5 drill ----------

function startOralDrill(onlyHard = false) {
  const data = loadOral();
  let pool = state.oral;
  if (onlyHard) pool = pool.filter((q) => data.hard[q.id]);
  const picks = shuffle([...pool]).slice(0, 5);
  if (!picks.length) return;
  oralState.drill = { picks, index: 0, onlyHard };
  showTab("oral");
}

function renderOralDrill() {
  const d = oralState.drill;
  const q = d.picks[d.index];
  const data = loadOral();

  const card = oralCard(q, data, { drill: true });
  const revealBtn = el("button", {
    type: "button",
    class: "primary-btn",
    text: "Show example + my answer",
    onclick: () => {
      card.querySelectorAll(".oral-answers, .oral-mine-wrap, .oral-example-label, .oral-q-en").forEach((n) => (n.hidden = false));
      revealBtn.hidden = true;
      nextBtn.hidden = false;
    },
  });
  const nextBtn = el("button", {
    type: "button",
    class: "primary-btn",
    hidden: true,
    text: d.index + 1 < d.picks.length ? "Next question →" : "Finish 🎉",
    onclick: () => {
      if (d.index + 1 < d.picks.length) {
        d.index++;
        showTab("oral");
      } else {
        oralState.drill = null;
        toast("Hyvää työtä! 5 questions done. ⭐ the hard ones to practise them again.", 4000);
        showTab("oral");
      }
    },
  });

  app.append(
    el("header", { class: "session-header" }, [
      el("button", { type: "button", class: "icon-btn", "aria-label": "Stop practice", text: "←", onclick: () => { oralState.drill = null; showTab("oral"); } }),
      el("div", { class: "session-progress" }, [
        el("div", { class: "session-progress-bar" }, [el("div", { class: "session-progress-fill", style: `width:${Math.round((d.index / d.picks.length) * 100)}%` })]),
        el("span", { class: "session-progress-label", text: `Question ${d.index + 1} / ${d.picks.length}${d.onlyHard ? " · ⭐ hard ones" : ""}` }),
      ]),
      el("span", { class: "icon-btn-spacer" }),
    ]),
    el("p", { class: "section-intro", html: "The teacher asks, you answer <strong>out loud</strong>. Listen with 🔊, answer, then check." }),
    card,
    revealBtn,
    nextBtn
  );
  setTimeout(() => Speech.say(q.fi), 250);
}

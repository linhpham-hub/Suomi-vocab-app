// Talk tab: practice dialogues (tap a glossary word to see its meaning and
// hear it); Numbers & € (numbers, prices, clock, shopping phrases); Time &
// weather (seasons, months, week, weather); Adjectives (opposites, colours);
// Questions (question words, common questions).
// Word lists for the last two live in data/topics.json.

const talkState = {
  section: "dialogues",
  openConv: null,
  showEnglish: false,
  numStyle: "both",
  sub: { numbers: "numbers", time: "calendar", adjectives: "opposites", questions: "words" },
};

const TALK_SUBS = {
  numbers: [["numbers", "🔢 Numbers"], ["prices", "🏷️ Prices"], ["clock", "🕒 Clock"], ["shopping", "🛒 Shopping"]],
  time: [["calendar", "🍂 Seasons & months"], ["week", "📅 Week & days"], ["weather", "🌦️ Weather"]],
  adjectives: [["opposites", "↔️ Opposites"], ["colours", "🎨 Colours"]],
  questions: [["words", "❓ Question words"], ["common", "💬 Common questions"]],
};

function openTalk(section, sub) {
  talkState.section = section;
  if (sub) talkState.sub[section] = sub;
  talkState.openConv = null;
  showTab("talk");
}

function renderTalk() {
  app.appendChild(tpl("tpl-talk"));
  if (talkState.section === "shopping") { talkState.section = "numbers"; talkState.sub.numbers = "shopping"; }
  const seg = app.querySelector('[data-role="talk-sections"]');
  seg.querySelectorAll(".segmented-btn").forEach((b) => {
    b.classList.toggle("segmented-btn--active", b.dataset.value === talkState.section);
    b.addEventListener("click", () => {
      Speech.stop();
      openTalk(b.dataset.value);
    });
  });

  // Second row of buttons inside a section.
  const subBox = app.querySelector('[data-role="talk-sub"]');
  const subs = TALK_SUBS[talkState.section];
  if (subs) {
    const sub = talkState.sub[talkState.section];
    subs.forEach(([v, label]) =>
      subBox.appendChild(
        el("button", {
          type: "button",
          class: "chip sub-tab" + (v === sub ? " chip--active" : ""),
          "data-value": v,
          text: label,
          onclick: () => { Speech.stop(); openTalk(talkState.section, v); },
        })
      )
    );
  } else {
    subBox.remove();
  }

  const body = app.querySelector('[data-role="talk-body"]');
  const sub = talkState.sub[talkState.section];
  if (talkState.section === "numbers") {
    if (sub === "prices") renderPrices(body);
    else if (sub === "clock") renderClock(body);
    else if (sub === "shopping") renderShopping(body);
    else renderNumbers(body);
  } else if (talkState.section === "time") {
    if (sub === "week") renderWeek(body);
    else if (sub === "weather") renderWeather(body);
    else renderCalendar(body);
  } else if (talkState.section === "adjectives") {
    if (sub === "colours") renderColours(body);
    else renderOpposites(body);
  } else if (talkState.section === "questions") {
    if (sub === "common") renderCommonQuestions(body);
    else renderQuestionWords(body);
  } else if (talkState.openConv) renderDialogue(body, state.conversations.find((c) => c.id === talkState.openConv));
  else renderDialogueList(body);
}

// ---------- Dialogues ----------

let lemmaIndex = null;
function lemmaKey(s) {
  return String(s)
    .toLowerCase()
    .replace(/-{2,}/g, "")
    .replace(/[!?.,…:;"]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
function findGlossaryWord(lemma) {
  if (!lemmaIndex) {
    lemmaIndex = new Map();
    state.words.forEach((w) => {
      [w.fi, ...w.fi.split("/")].forEach((form) => {
        const k = lemmaKey(form);
        if (k && !lemmaIndex.has(k)) lemmaIndex.set(k, w);
      });
    });
  }
  return lemmaIndex.get(lemmaKey(lemma)) || null;
}

// "[surface](lemma)" / "[word]" markup -> DOM with tappable glossary words.
function renderMarkedLine(text) {
  const frag = document.createDocumentFragment();
  const re = /\[([^\]]+)\](?:\(([^)]+)\))?/g;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
    const surface = m[1];
    const word = findGlossaryWord(m[2] || m[1]);
    if (word) {
      frag.appendChild(
        el("button", {
          type: "button",
          class: "gloss-word",
          text: surface,
          title: word.en,
          onclick: (e) => {
            e.stopPropagation();
            showWordPopover(word, surface);
          },
        })
      );
    } else {
      frag.appendChild(document.createTextNode(surface));
    }
    last = re.lastIndex;
  }
  if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
  return frag;
}

function plainLine(text) {
  return text.replace(/\[([^\]]+)\](?:\([^)]+\))?/g, "$1");
}

function renderDialogueList(body) {
  body.appendChild(
    el("p", {
      class: "section-intro",
      html: "Short dialogues using your glossary words. <strong>Underlined words</strong> are from the glossary: tap one to see what it means and hear it.",
    })
  );
  const byChapter = new Map();
  state.conversations.forEach((c) => {
    if (!byChapter.has(c.chapter)) byChapter.set(c.chapter, []);
    byChapter.get(c.chapter).push(c);
  });
  byChapter.forEach((convs, ch) => {
    body.appendChild(el("h3", { class: "glossary-chapter-heading", text: ch }));
    convs.forEach((c) => {
      const words = new Set();
      c.lines.forEach((l) => {
        for (const m of l.fi.matchAll(/\[([^\]]+)\](?:\(([^)]+)\))?/g)) {
          const w = findGlossaryWord(m[2] || m[1]);
          if (w) words.add(w.id);
        }
      });
      body.appendChild(
        el("button", {
          type: "button",
          class: "card list-card",
          onclick: () => {
            talkState.openConv = c.id;
            showTab("talk");
          },
        }, [
          el("span", { class: "list-card-title", text: c.title }),
          el("span", { class: "list-card-sub", text: c.subtitle }),
          el("span", { class: "list-card-meta", text: `${c.lines.length} lines · ${words.size} glossary words →` }),
        ])
      );
    });
  });
}

function renderDialogue(body, conv) {
  if (!conv) {
    talkState.openConv = null;
    renderDialogueList(body);
    return;
  }
  const header = el("div", { class: "dialogue-head" }, [
    el("button", {
      type: "button",
      class: "icon-btn",
      "aria-label": "Back to dialogues",
      text: "←",
      onclick: () => {
        Speech.stop();
        talkState.openConv = null;
        showTab("talk");
      },
    }),
    el("div", {}, [el("h2", { text: conv.title }), el("p", { class: "muted", text: conv.subtitle })]),
  ]);
  body.appendChild(header);

  const lineEls = [];
  const playBtn = el("button", { type: "button", class: "primary-btn", text: "▶ Play all" });
  const enToggle = el("button", {
    type: "button",
    class: "ghost-btn",
    text: talkState.showEnglish ? "Hide English" : "Show English",
    onclick: () => {
      talkState.showEnglish = !talkState.showEnglish;
      enToggle.textContent = talkState.showEnglish ? "Hide English" : "Show English";
      body.querySelectorAll(".dl-en").forEach((n) => (n.hidden = !talkState.showEnglish));
    },
  });
  let playing = false;
  playBtn.addEventListener("click", () => {
    if (playing) {
      Speech.stop();
      playing = false;
      playBtn.textContent = "▶ Play all";
      lineEls.forEach((n) => n.classList.remove("dl-line--active"));
      return;
    }
    playing = true;
    playBtn.textContent = "■ Stop";
    Speech.sayAll(conv.lines.map((l) => plainLine(l.fi)), (i) => {
      lineEls.forEach((n, j) => n.classList.toggle("dl-line--active", j === i));
      if (i >= 0) lineEls[i].scrollIntoView({ block: "nearest", behavior: "smooth" });
      if (i === -1) {
        playing = false;
        playBtn.textContent = "▶ Play all";
      }
    });
  });
  body.appendChild(el("div", { class: "dialogue-actions" }, [playBtn, enToggle]));

  const list = el("div", { class: "card dialogue" });
  conv.lines.forEach((l) => {
    const line = el("div", { class: "dl-line" }, [
      el("div", { class: "dl-who", text: l.who }),
      el("div", { class: "dl-text" }, [
        el("p", { class: "dl-fi" }, [renderMarkedLine(l.fi)]),
        el("p", { class: "dl-en", text: l.en, hidden: !talkState.showEnglish }),
      ]),
      speakBtn(plainLine(l.fi), { small: true, label: "Listen to line" }),
    ]);
    lineEls.push(line);
    list.appendChild(line);
  });
  body.appendChild(list);
}

// ---------- Numbers ----------

const UNITS_STD = ["nolla", "yksi", "kaksi", "kolme", "neljä", "viisi", "kuusi", "seitsemän", "kahdeksan", "yhdeksän"];
const UNITS_SPK = ["nolla", "yks", "kaks", "kolme", "neljä", "viis", "kuus", "seittemän", "kaheksan", "yheksän"];
const TENS_SPK = { 2: "kakskyt", 3: "kolkyt", 4: "nelkyt", 5: "viiskyt", 6: "kuuskyt", 7: "seiskyt", 8: "kaheksankyt", 9: "yheksänkyt" };

function numStandard(n) {
  if (n < 10) return UNITS_STD[n];
  if (n === 10) return "kymmenen";
  if (n < 20) return UNITS_STD[n - 10] + "toista";
  if (n < 100) {
    const t = Math.floor(n / 10), u = n % 10;
    return UNITS_STD[t] + "kymmentä" + (u ? UNITS_STD[u] : "");
  }
  if (n < 1000) {
    const h = Math.floor(n / 100), r = n % 100;
    return (h === 1 ? "sata" : UNITS_STD[h] + "sataa") + (r ? numStandard(r) : "");
  }
  if (n < 1000000) {
    const th = Math.floor(n / 1000), r = n % 1000;
    return (th === 1 ? "tuhat" : numStandard(th) + "tuhatta") + (r ? numStandard(r) : "");
  }
  if (n === 1000000) return "miljoona";
  return String(n);
}

function numSpoken(n) {
  if (n < 10) return UNITS_SPK[n];
  if (n === 10) return "kymmenen";
  if (n < 20) return UNITS_SPK[n - 10] + "toist";
  if (n < 100) {
    const t = Math.floor(n / 10), u = n % 10;
    return TENS_SPK[t] + (u ? UNITS_SPK[u] : "");
  }
  if (n < 1000) {
    const h = Math.floor(n / 100), r = n % 100;
    return (h === 1 ? "sata" : UNITS_SPK[h] + "sataa") + (r ? numSpoken(r) : "");
  }
  if (n < 1000000) {
    const th = Math.floor(n / 1000), r = n % 1000;
    return (th === 1 ? "tuhat" : numSpoken(th) + "tuhatta") + (r ? numSpoken(r) : "");
  }
  return numStandard(n);
}

function priceForms(euros, cents) {
  const e = euros, c = cents;
  const eurWord = e === 1 ? "euro" : "euroa";
  const centWord = c === 1 ? "sentti" : "senttiä";
  const full = [e ? `${numStandard(e)} ${eurWord}` : "", c ? `${numStandard(c)} ${centWord}` : ""].filter(Boolean).join(" ");
  const short = c && e ? `${numStandard(e)} ${numStandard(c)}` : full;
  const spoken = c && e ? `${numSpoken(e)} ${numSpoken(c)}` : e ? `${numSpoken(e)} ${e === 1 ? "euro" : "euroo"}` : `${numSpoken(c)} senttii`;
  const written = `${e},${String(c).padStart(2, "0")} €`;
  return { written, full, short, spoken };
}

function renderNumbers(body) {
  body.appendChild(
    el("p", {
      class: "section-intro",
      html: "<strong>Standard</strong> (kirjakieli) is what you read and write. <strong>Spoken</strong> (puhekieli) is what you hear in shops and on the street.",
    })
  );

  body.appendChild(listenGame());

  // Look up any number.
  const lookupOut = el("div", { class: "num-lookup-out" });
  const lookupIn = el("input", { type: "number", min: "0", max: "999999", inputmode: "numeric", class: "glossary-search", placeholder: "Type any number, e.g. 47" });
  const showLookup = () => {
    lookupOut.innerHTML = "";
    const n = parseInt(lookupIn.value, 10);
    if (isNaN(n) || n < 0 || n > 999999) return;
    lookupOut.appendChild(numRow(n));
  };
  lookupIn.addEventListener("input", showLookup);
  body.appendChild(el("section", { class: "card panel" }, [el("h2", { class: "panel-title", text: "🔎 Say any number" }), lookupIn, lookupOut]));

  // Reference table.
  const style = el("div", { class: "segmented" });
  [["both", "Both"], ["std", "Standard"], ["spk", "Spoken"]].forEach(([v, label]) =>
    style.appendChild(
      el("button", {
        type: "button",
        class: "segmented-btn" + (talkState.numStyle === v ? " segmented-btn--active" : ""),
        text: label,
        onclick: () => {
          talkState.numStyle = v;
          showTab("talk");
        },
      })
    )
  );
  const table = el("div", { class: "glossary-list num-table" });
  const nums = [...Array(32).keys(), 40, 50, 60, 70, 80, 90, 100, 101, 200, 300, 1000, 2000, 500000, 1000000];
  nums.forEach((n) => table.appendChild(numRow(n)));
  const details = el("details", { class: "card num-details" }, [
    el("summary", { html: "📋 <strong>Number table</strong> <span class='muted'>· 0–31, tens, 100, 1000, million</span>" }),
    el("div", { class: "num-section" }, [
      style,
      table,
      el("p", { class: "muted small", text: "Pattern: 20 = kaksikymmentä → kakskyt, and 21 = kaksikymmentäyksi → kakskytyks. Hundreds: 200 kaksisataa, thousands: 2000 kaksituhatta." }),
    ]),
  ]);
  if (talkState.tableOpen) details.open = true;
  details.addEventListener("toggle", () => (talkState.tableOpen = details.open));
  body.appendChild(details);

}

function renderPrices(body) {
  body.appendChild(
    el("p", { class: "section-intro", html: "Prices are said as <strong>euros + cents</strong>: 3,50 € = kolme euroa viisikymmentä senttiä, or short: kolme viisikymmentä." })
  );
  body.appendChild(priceTrainer());
  const links = state.links.prices || [];
  if (links.length) {
    body.appendChild(
      el("section", { class: "card panel" }, [
        el("h2", { class: "panel-title", text: "🎧 Teacher's listening practice (lesson 8)" }),
        el("div", { class: "link-list" }, links.map((l) => el("a", { href: l.url, target: "_blank", rel: "noopener", class: "game-link game-link--wide", text: l.title }))),
      ])
    );
  }
  body.appendChild(
    el("div", { class: "link-row" }, [
      el("button", { type: "button", class: "link-btn", text: "🛒 Shopping phrases →", onclick: () => openTalk("numbers", "shopping") }),
    ])
  );
}

function numRow(n) {
  const std = numStandard(n);
  const spk = numSpoken(n);
  const show = talkState.numStyle;
  const cells = [el("span", { class: "num-digit", text: n.toLocaleString("fi-FI") })];
  const pair = (label, text) =>
    el("span", { class: "num-form" }, [el("span", { class: "num-form-label", text: label }), el("span", { class: "num-form-text", text }), speakBtn(text, { small: true })]);
  const col = el("span", { class: "num-forms" });
  if (show !== "spk") col.appendChild(pair("standard", std));
  if (show !== "std" && (spk !== std || show === "spk")) col.appendChild(pair("spoken", spk));
  if (show === "both" && spk === std) col.appendChild(el("span", { class: "num-same muted small", text: "same when spoken" }));
  cells.push(col);
  return el("div", { class: "glossary-row num-row" }, cells);
}

function randomPrice() {
  const euros = Math.random() < 0.8 ? 1 + Math.floor(Math.random() * 30) : 30 + Math.floor(Math.random() * 70);
  const centsOptions = [0, 0, 10, 20, 30, 40, 50, 50, 60, 70, 80, 90, 95, 99, 25, 75];
  return [euros, centsOptions[Math.floor(Math.random() * centsOptions.length)]];
}

function priceTrainer() {
  const box = el("section", { class: "card panel price-trainer" });
  const draw = () => {
    const [e, c] = randomPrice();
    const f = priceForms(e, c);
    box.innerHTML = "";
    const tag = el("div", { class: "price-tag", text: f.written });
    const answers = el("div", { class: "price-answers", hidden: true }, [
      priceLine("Full", f.full),
      f.short !== f.full ? priceLine("Short", f.short) : null,
      priceLine("Spoken", f.spoken),
    ]);
    const reveal = el("button", {
      type: "button",
      class: "primary-btn",
      text: "Show how to say it",
      onclick: () => {
        answers.hidden = false;
        reveal.hidden = true;
      },
    });
    box.append(
      el("h2", { class: "panel-title", text: "🏷️ Mitä tämä maksaa? Say the price" }),
      el("div", { class: "price-row" }, [tag, el("button", { type: "button", class: "ghost-btn", text: "🔊 Hear it", onclick: () => Speech.say(f.spoken) })]),
      el("p", { class: "muted small", text: "Say it out loud first, then check." }),
      answers,
      el("div", { class: "price-actions" }, [reveal, el("button", { type: "button", class: "ghost-btn", text: "Next price →", onclick: draw })])
    );
  };
  draw();
  return box;
}

function priceLine(label, text) {
  return el("div", { class: "price-line" }, [el("span", { class: "num-form-label", text: label }), el("span", { class: "price-line-text", text }), speakBtn(text, { small: true })]);
}

function listenGame() {
  const box = el("section", { class: "card panel" });
  let score = 0, rounds = 0, mode = "spk";
  const draw = () => {
    const n = 1 + Math.floor(Math.random() * 100);
    const text = mode === "std" ? numStandard(n) : numSpoken(n);
    const opts = new Set([n]);
    while (opts.size < 4) {
      const d = Math.random() < 0.6 ? n + [-10, 10, -1, 1, 11, -11][Math.floor(Math.random() * 6)] : 1 + Math.floor(Math.random() * 100);
      if (d >= 0 && d <= 100) opts.add(d);
    }
    box.innerHTML = "";
    const modeSeg = el("div", { class: "segmented segmented--two" });
    [["spk", "Spoken"], ["std", "Standard"]].forEach(([v, l]) =>
      modeSeg.appendChild(el("button", { type: "button", class: "segmented-btn" + (mode === v ? " segmented-btn--active" : ""), text: l, onclick: () => { mode = v; draw(); } }))
    );
    const grid = el("div", { class: "listen-grid" });
    const fb = el("p", { class: "listen-fb", hidden: true });
    let done = false;
    shuffle([...opts]).forEach((o) => {
      grid.appendChild(
        el("button", {
          type: "button",
          class: "option-btn listen-opt",
          text: String(o),
          onclick: (e) => {
            if (done) return;
            done = true;
            rounds++;
            const ok = o === n;
            if (ok) score++;
            e.currentTarget.classList.add(ok ? "option-btn--correct" : "option-btn--wrong");
            grid.querySelectorAll(".listen-opt").forEach((b) => {
              b.disabled = true;
              if (b.textContent === String(n)) b.classList.add("option-btn--correct");
            });
            fb.hidden = false;
            fb.textContent = `${ok ? randomPraise() : "It was " + n}: “${text}”  ·  ${score}/${rounds}`;
            setTimeout(draw, ok ? 1400 : 2600);
          },
        })
      );
    });
    box.append(
      el("h2", { class: "panel-title", text: "🎧 Listen & pick the number" }),
      modeSeg,
      el("button", { type: "button", class: "primary-btn listen-play", text: "🔊 Play number", onclick: () => Speech.say(text, { rate: 0.85 }) }),
      grid,
      fb
    );
  };
  draw();
  return box;
}

// ---------- Shopping ----------

function renderShopping(body) {
  body.appendChild(el("p", { class: "section-intro", html: "Phrases for shops and cafés. The second line is the everyday <strong>spoken</strong> form." }));
  const list = el("div", { class: "glossary-list" });
  state.phrases.forEach((p) => {
    list.appendChild(
      el("div", { class: "glossary-row phrase-row" }, [
        el("div", { class: "glossary-main" }, [
          el("span", { class: "phrase-fi" }, [p.fi, speakBtn(p.fi, { small: true })]),
          p.spoken ? el("span", { class: "phrase-spoken" }, [el("span", { class: "num-form-label", text: "spoken" }), p.spoken, speakBtn(p.spoken, { small: true })]) : null,
          el("span", { class: "glossary-en", text: p.en }),
        ]),
      ])
    );
  });
  body.appendChild(list);

  const kiosk = state.conversations.find((c) => c.id === "jaatelokioski");
  body.appendChild(
    el("div", { class: "link-row" }, [
      kiosk ? el("button", { type: "button", class: "link-btn", text: "🍦 Practise the ice-cream kiosk dialogue →", onclick: () => { talkState.section = "dialogues"; talkState.openConv = kiosk.id; showTab("talk"); } }) : null,
      el("button", { type: "button", class: "link-btn", text: "🏷️ Practise saying prices →", onclick: () => openTalk("numbers", "prices") }),
    ])
  );
}

// ---------- Shared bits for the word-list sections ----------

function topics() {
  return state.topics || {};
}

// One row: Finnish 🔊, optional extra forms ("in: tammikuussa"), English.
function vocabRow(item, extras = []) {
  return el("div", { class: "glossary-row vocab-row" }, [
    el("div", { class: "glossary-main" }, [
      el("span", { class: "phrase-fi" }, [item.fi, speakBtn(item.fi, { small: true })]),
      ...extras
        .filter((x) => x && x.text)
        .map((x) => el("span", { class: "vocab-extra" }, [el("span", { class: "num-form-label", text: x.label }), x.text, speakBtn(x.text, { small: true })])),
      el("span", { class: "glossary-en", text: item.en }),
    ]),
  ]);
}

function phraseRow(p) {
  return el("div", { class: "glossary-row phrase-row" }, [
    el("div", { class: "glossary-main" }, [
      el("span", { class: "phrase-fi" }, [p.fi, speakBtn(p.fi, { small: true })]),
      p.spoken && p.spoken !== p.fi
        ? el("span", { class: "phrase-spoken" }, [el("span", { class: "num-form-label", text: "spoken" }), p.spoken, speakBtn(p.spoken, { small: true })])
        : null,
      el("span", { class: "glossary-en", text: p.en }),
    ]),
  ]);
}

function listCard(title, rows, note) {
  return el("section", { class: "card panel" }, [
    el("h2", { class: "panel-title", text: title }),
    note ? el("p", { class: "muted small", text: note }) : null,
    el("div", { class: "glossary-list topic-list" }, rows),
  ]);
}

// Small multiple-choice game: items = [{ prompt, answer, speak? }].
function miniQuiz(title, allItems, { intro = "" } = {}) {
  const box = el("section", { class: "card panel mini-quiz" });
  // One question per prompt ("It's windy" = Tuulee / On tuulista: ask once).
  const items = allItems.filter((q, i, arr) => arr.findIndex((o) => o.prompt === q.prompt) === i);
  const samePrompt = (a, b) => allItems.some((x) => x.prompt === a.prompt && normalizeLoose(x.answer) === normalizeLoose(b));
  let score = 0, rounds = 0, last = null;
  const draw = () => {
    let item;
    do { item = items[Math.floor(Math.random() * items.length)]; } while (items.length > 1 && item === last);
    last = item;
    // Wrong options never include another right answer for the same prompt.
    const wrong = shuffle(allItems.filter((i) => normalizeLoose(i.answer) !== normalizeLoose(item.answer) && !samePrompt(item, i.answer)).map((i) => i.answer));
    const opts = shuffle([item.answer, ...[...new Set(wrong)].slice(0, 3)]);
    box.innerHTML = "";
    const grid = el("div", { class: "listen-grid mini-quiz-grid" });
    const fb = el("p", { class: "listen-fb", hidden: true });
    let done = false;
    opts.forEach((o) =>
      grid.appendChild(
        el("button", {
          type: "button",
          class: "option-btn mini-opt",
          text: o,
          onclick: (e) => {
            if (done) return;
            done = true;
            rounds++;
            const ok = o === item.answer || samePrompt(item, o);
            if (ok) score++;
            e.currentTarget.classList.add(ok ? "option-btn--correct" : "option-btn--wrong");
            grid.querySelectorAll(".mini-opt").forEach((b) => {
              b.disabled = true;
              if (b.textContent === item.answer) b.classList.add("option-btn--correct");
            });
            Speech.say(item.speak || item.answer);
            fb.hidden = false;
            fb.textContent = `${ok ? randomPraise() : "Answer: " + item.answer}  ·  ${score}/${rounds}`;
            setTimeout(() => box.isConnected && draw(), ok ? 1500 : 2600);
          },
        })
      )
    );
    box.append(
      el("h2", { class: "panel-title", text: title }),
      intro ? el("p", { class: "muted small", text: intro }) : null,
      el("p", { class: "mini-quiz-prompt", text: item.prompt }),
      grid,
      fb
    );
  };
  draw();
  return box;
}

// ---------- Clock ----------

const CLOCK_YLI = { 5: ["viisi", "viis"], 10: ["kymmenen", "kymmenen"], 15: ["varttia", "vartti"], 20: ["kaksikymmentä", "kakskyt"], 25: ["kaksikymmentäviisi", "kakskytviis"] };
const CLOCK_VAILLE = { 35: ["kahtakymmentäviittä", "kakskytviis"], 40: ["kahtakymmentä", "kakskyt"], 45: ["varttia", "vartti"], 50: ["kymmentä", "kymmenen"], 55: ["viittä", "viis"] };

// Everyday, spoken and official (24-hour, timetables) ways to say a time.
function clockForms(h24, m) {
  const h12 = ((h24 + 11) % 12) + 1;
  const next = (h12 % 12) + 1;
  let everyday, spoken;
  if (m === 0) {
    everyday = `Kello on ${numStandard(h12)}.`;
    spoken = `Kello on ${numSpoken(h12)}.`;
  } else if (m === 30) {
    everyday = `Kello on puoli ${numStandard(next)}.`;
    spoken = `Kello on puol ${numSpoken(next)}.`;
  } else if (m < 30) {
    everyday = `Kello on ${CLOCK_YLI[m][0]} yli ${numStandard(h12)}.`;
    spoken = `Kello on ${CLOCK_YLI[m][1]} yli ${numSpoken(h12)}.`;
  } else {
    everyday = `Kello on ${CLOCK_VAILLE[m][0]} vaille ${numStandard(next)}.`;
    spoken = `Kello on ${CLOCK_VAILLE[m][1]} vaille ${numSpoken(next)}.`;
  }
  const official = `kello ${numStandard(h24)}${m ? " " + numStandard(m) : ""}`;
  const digital = `${h24}.${String(m).padStart(2, "0")}`;
  return { everyday, spoken, official, digital };
}

function clockFace(h24, m) {
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 100 100");
  svg.setAttribute("class", "clock-face");
  svg.setAttribute("aria-hidden", "true");
  const add = (tag, attrs) => {
    const n = document.createElementNS(NS, tag);
    Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v));
    svg.appendChild(n);
  };
  add("circle", { cx: 50, cy: 50, r: 46, class: "clock-rim" });
  for (let i = 0; i < 12; i++) {
    const a = (i * 30 * Math.PI) / 180;
    const r1 = i % 3 === 0 ? 36 : 39;
    add("line", { x1: 50 + r1 * Math.sin(a), y1: 50 - r1 * Math.cos(a), x2: 50 + 42 * Math.sin(a), y2: 50 - 42 * Math.cos(a), class: "clock-tick" });
  }
  const hand = (deg, len, cls) => {
    const a = (deg * Math.PI) / 180;
    add("line", { x1: 50, y1: 50, x2: 50 + len * Math.sin(a), y2: 50 - len * Math.cos(a), class: cls });
  };
  hand(((h24 % 12) + m / 60) * 30, 22, "clock-hour");
  hand(m * 6, 33, "clock-min");
  add("circle", { cx: 50, cy: 50, r: 3, class: "clock-pin" });
  return svg;
}

function clockTrainer() {
  const box = el("section", { class: "card panel price-trainer clock-trainer" });
  const draw = () => {
    const h24 = 6 + Math.floor(Math.random() * 18);
    const m = 5 * Math.floor(Math.random() * 12);
    const f = clockForms(h24, m);
    box.innerHTML = "";
    const answers = el("div", { class: "price-answers", hidden: true }, [
      priceLine("Everyday", f.everyday),
      priceLine("Spoken", f.spoken),
      priceLine("Official", f.official),
    ]);
    const reveal = el("button", { type: "button", class: "primary-btn", text: "Show how to say it", onclick: () => { answers.hidden = false; reveal.hidden = true; } });
    box.append(
      el("h2", { class: "panel-title", text: "🕒 Paljonko kello on? Say the time" }),
      el("div", { class: "clock-row" }, [
        clockFace(h24, m),
        el("div", { class: "clock-digital" }, [el("span", { class: "price-tag", text: f.digital }), el("button", { type: "button", class: "ghost-btn", text: "🔊 Hear it", onclick: () => Speech.say(f.everyday) })]),
      ]),
      el("p", { class: "muted small", text: "Say it out loud first, then check." }),
      answers,
      el("div", { class: "price-actions" }, [reveal, el("button", { type: "button", class: "ghost-btn", text: "Next time →", onclick: draw })])
    );
  };
  draw();
  return box;
}

function renderClock(body) {
  body.appendChild(
    el("p", { class: "section-intro", html: "<strong>yli</strong> = past, <strong>vaille</strong> = to, <strong>vartti</strong> = a quarter. Careful: <strong>puoli neljä</strong> is 3.30 (half <em>to</em> four)!" })
  );
  body.appendChild(clockTrainer());
  const examples = [[15, 0], [15, 5], [15, 10], [15, 15], [15, 20], [15, 30], [15, 40], [15, 45], [15, 50], [15, 55]];
  const rows = examples.map(([h, m]) => {
    const f = clockForms(h, m);
    return el("div", { class: "glossary-row clock-ex" }, [
      el("span", { class: "num-digit", text: `${(h % 12) || 12}.${String(m).padStart(2, "0")}` }),
      el("span", { class: "num-forms" }, [
        el("span", { class: "num-form" }, [el("span", { class: "num-form-text", text: f.everyday }), speakBtn(f.everyday, { small: true })]),
        f.spoken !== f.everyday
          ? el("span", { class: "num-form" }, [el("span", { class: "num-form-label", text: "spoken" }), el("span", { class: "num-form-text", text: f.spoken }), speakBtn(f.spoken, { small: true })])
          : null,
      ]),
    ]);
  });
  body.appendChild(listCard("📋 How it works", rows));
  const off = [[7, 15], [12, 0], [15, 30], [21, 45]].map(([h, m]) => {
    const f = clockForms(h, m);
    return vocabRow({ fi: f.official, en: `klo ${f.digital}` });
  });
  body.appendChild(listCard("🚆 Official time (timetables, TV, appointments)", off, "Uses the 24-hour clock: hours, then minutes."));
  body.appendChild(listCard("💬 Phrases", (topics().clockPhrases || []).map(phraseRow)));
}

// ---------- Time & weather ----------

function renderCalendar(body) {
  const t = topics();
  body.appendChild(el("p", { class: "section-intro", html: "To say <strong>in</strong> a month or season, change the ending: <strong>syyskuu → syyskuussa</strong> (in September), <strong>talvi → talvella</strong> (in winter)." }));
  body.appendChild(listCard("🍂 Vuodenajat · Seasons", (t.seasons || []).map((s) => vocabRow({ fi: s.fi, en: `${s.en} · ${s.months}` }, [{ label: "in", text: s.when }]))));
  body.appendChild(listCard("🗓️ Kuukaudet · Months", (t.months || []).map((m) => vocabRow(m, [{ label: "in", text: m.when }])), "Months are written with a small letter in Finnish."));
  body.appendChild(
    miniQuiz("🎲 Quiz: months & seasons", [...(t.months || []), ...(t.seasons || [])].map((x) => ({ prompt: x.en, answer: x.fi })), { intro: "Pick the Finnish word." })
  );
  body.appendChild(listCard("💬 Phrases", (t.calendarPhrases || []).map(phraseRow)));
  const games = state.links.calendar || [];
  if (games.length) {
    body.appendChild(
      el("section", { class: "card panel" }, [
        el("h2", { class: "panel-title", text: "🎮 Teacher's links (lesson 10)" }),
        el("div", { class: "link-list" }, games.map((l) => el("a", { href: l.url, target: "_blank", rel: "noopener", class: "game-link game-link--wide", text: l.title }))),
      ])
    );
  }
}

function renderWeek(body) {
  const t = topics();
  body.appendChild(el("p", { class: "section-intro", html: "<strong>maanantaina</strong> = on Monday (once), <strong>maanantaisin</strong> = on Mondays (every week)." }));
  body.appendChild(listCard("📅 Viikonpäivät · Days of the week", (t.weekdays || []).map((d) => vocabRow(d, [{ label: "on", text: d.when }, { label: "every", text: d.every }]))));
  body.appendChild(listCard("🌅 Parts of the day", (t.dayparts || []).map((d) => vocabRow(d, [{ label: "in / at", text: d.when }]))));
  body.appendChild(listCard("⏳ Time words", (t.timewords || []).map((d) => vocabRow(d))));
  body.appendChild(
    miniQuiz("🎲 Quiz: week & days", [...(t.weekdays || []), ...(t.dayparts || []), ...(t.timewords || [])].map((x) => ({ prompt: x.en, answer: x.fi })), { intro: "Pick the Finnish word." })
  );
  body.appendChild(listCard("💬 Phrases", (t.weekPhrases || []).map(phraseRow)));
}

function renderWeather(body) {
  const t = topics();
  const games = (state.links.weather || []);
  body.appendChild(el("p", { class: "section-intro", html: "<strong>Millainen sää on?</strong> What's the weather like? Most answers start with <strong>On …</strong> (It is …)." }));
  body.appendChild(listCard("🌦️ Sää · Weather", (t.weather || []).map(phraseRow)));
  body.appendChild(listCard("🌡️ Temperature", (t.temperature || []).map(phraseRow), "lämmintä = above zero, pakkasta = below zero."));
  body.appendChild(listCard("📖 Weather words", (t.weatherWords || []).map((w) => vocabRow(w))));
  body.appendChild(
    miniQuiz("🎲 Quiz: weather", [...(t.weather || []), ...(t.weatherWords || [])].map((x) => ({ prompt: x.en, answer: x.fi })), { intro: "Pick the Finnish." })
  );
  if (games.length) {
    body.appendChild(
      el("section", { class: "card panel" }, [
        el("h2", { class: "panel-title", text: "🎮 Teacher's weather games (lesson 10)" }),
        el("div", { class: "link-list" }, games.map((l) => el("a", { href: l.url, target: "_blank", rel: "noopener", class: "game-link game-link--wide", text: l.title }))),
      ])
    );
  }
}

// ---------- Adjectives ----------

function renderOpposites(body) {
  const t = topics();
  const core = t.adjectivePairs || [];
  const more = t.adjectiveMore || [];
  const pairs = [...core, ...more];
  body.appendChild(el("p", { class: "section-intro", html: "<strong>Millainen?</strong> = What kind of? What … like? Learn adjectives in pairs of opposites." }));
  const pairRow = ([a, b]) =>
    el("div", { class: "glossary-row adj-pair" }, [
      el("div", { class: "adj-side" }, [el("span", { class: "phrase-fi" }, [a.fi, speakBtn(a.fi, { small: true })]), el("span", { class: "glossary-en", text: a.en })]),
      el("span", { class: "adj-vs", text: "↔" }),
      el("div", { class: "adj-side" }, [el("span", { class: "phrase-fi" }, [b.fi, speakBtn(b.fi, { small: true })]), el("span", { class: "glossary-en", text: b.en })]),
    ]);
  body.appendChild(listCard("↔️ Must-know opposites", core.map(pairRow), "From the course book (kappale 3, s. 60) + nopea/hidas, paljon/vähän."));
  if (more.length) body.appendChild(listCard("➕ More adjectives", more.map(pairRow)));
  const all = core.flat();
  const meaning = [...new Map(all.map((x) => [x.fi + x.en, x])).values()].map((x) => ({ prompt: x.en, answer: x.fi }));
  const opposite = core.flatMap(([a, b]) => [{ prompt: `${a.fi} ↔ ?`, answer: b.fi }, { prompt: `${b.fi} ↔ ?`, answer: a.fi }])
    .filter((q, i, arr) => arr.findIndex((o) => o.prompt === q.prompt) === i); // "vanha" has two opposites: ask once
  body.appendChild(miniQuiz("🎲 Quiz: what's the opposite?", opposite, { intro: "Must-know pairs. Pick the opposite." }));
  body.appendChild(miniQuiz("🎲 Quiz: meaning", [...meaning, ...more.flat().map((x) => ({ prompt: x.en, answer: x.fi }))], { intro: "Pick the Finnish word." }));
  body.appendChild(listCard("💬 Phrases", (t.adjectivePhrases || []).map(phraseRow)));
}

function renderColours(body) {
  const t = topics();
  body.appendChild(el("p", { class: "section-intro", html: "<strong>Minkä värinen?</strong> = What colour?" }));
  const rows = (t.colours || []).map((c) =>
    el("div", { class: "glossary-row vocab-row colour-row" }, [
      el("span", { class: "colour-swatch", style: `background:${c.hex}` }),
      el("div", { class: "glossary-main" }, [el("span", { class: "phrase-fi" }, [c.fi, speakBtn(c.fi, { small: true })]), el("span", { class: "glossary-en", text: c.en })]),
    ])
  );
  body.appendChild(listCard("🎨 Värit · Colours", rows));
  body.appendChild(miniQuiz("🎲 Quiz: colours", (t.colours || []).map((c) => ({ prompt: c.en, answer: c.fi })), { intro: "Pick the Finnish word." }));
  body.appendChild(listCard("💬 Phrases", (t.colourPhrases || []).map(phraseRow)));
}


// ---------- Questions ----------

// A question (written + spoken form, 🔊) with an example answer underneath.
function qaRow(q) {
  const fi = q.q || q.fi, spoken = q.qs || q.spoken;
  return el("div", { class: "glossary-row phrase-row qa-row" }, [
    el("div", { class: "glossary-main" }, [
      el("span", { class: "phrase-fi" }, [fi, speakBtn(fi, { small: true })]),
      spoken && spoken !== fi
        ? el("span", { class: "phrase-spoken" }, [el("span", { class: "num-form-label", text: "spoken" }), spoken, speakBtn(spoken, { small: true })])
        : null,
      el("span", { class: "glossary-en", text: q.qen || q.en }),
      q.a
        ? el("span", { class: "qa-answer" }, [el("span", { class: "num-form-label", text: "answer" }), q.a, speakBtn(q.a, { small: true }), el("span", { class: "muted small qa-answer-en", text: q.aen })])
        : null,
    ]),
  ]);
}

function renderQuestionWords(body) {
  const t = topics();
  const words = t.questionWords || [];
  body.appendChild(el("p", { class: "section-intro", html: "Who? What? Where? When? How? Each question word has an example question and answer. Tap 🔊 to listen." }));
  const rows = words.map((w) =>
    el("div", { class: "glossary-row qword-row" }, [
      el("div", { class: "qword-head" }, [
        el("span", { class: "phrase-fi qword-fi" }, [w.fi, speakBtn(w.fi.replace(/\?/g, ""), { small: true })]),
        el("span", { class: "glossary-en", text: w.en }),
      ]),
      qaRow(w),
      w.note ? el("p", { class: "muted small", text: "💡 " + w.note }) : null,
    ])
  );
  body.appendChild(listCard("❓ Kysymyssanat · Question words", rows));
  body.appendChild(miniQuiz("🎲 Quiz: question words", words.map((w) => ({ prompt: w.en, answer: w.fi })), { intro: "Pick the Finnish question word." }));
  body.appendChild(miniQuiz("🎲 Quiz: ask the question", words.map((w) => ({ prompt: w.qen, answer: w.q })), { intro: "Pick the Finnish question." }));
}

function renderCommonQuestions(body) {
  const t = topics();
  body.appendChild(el("p", { class: "section-intro", html: "Everyday questions with a sample answer. Yes/no questions add <strong>-ko / -kö</strong> to the verb: <em>Puhut → Puhutko?</em>" }));
  (t.commonQuestions || []).forEach((g) => body.appendChild(listCard(g.title, g.items.map(qaRow))));
  const yn = t.yesNoQuestions || [];
  if (yn.length) body.appendChild(listCard("✅ Yes / no questions", yn.map(qaRow), "Answer with the verb: Puhutko? → Puhun (yes) / En puhu (no). No need for “kyllä”."));
  const all = [...(t.commonQuestions || []).flatMap((g) => g.items), ...yn];
  body.appendChild(miniQuiz("🎲 Quiz: ask in Finnish", all.map((q) => ({ prompt: q.en, answer: q.fi })), { intro: "Pick the Finnish question." }));
}

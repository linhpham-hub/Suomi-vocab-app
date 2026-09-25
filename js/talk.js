// Talk tab: practice dialogues (tap a glossary word to see its meaning and
// hear it), numbers in standard and spoken Finnish, prices, shopping phrases.

const talkState = { section: "dialogues", openConv: null, showEnglish: false, numStyle: "both" };

function renderTalk() {
  app.appendChild(tpl("tpl-talk"));
  const seg = app.querySelector('[data-role="talk-sections"]');
  seg.querySelectorAll(".segmented-btn").forEach((b) => {
    b.classList.toggle("segmented-btn--active", b.dataset.value === talkState.section);
    b.addEventListener("click", () => {
      Speech.stop();
      talkState.section = b.dataset.value;
      talkState.openConv = null;
      showTab("talk");
    });
  });
  const body = app.querySelector('[data-role="talk-body"]');
  if (talkState.section === "numbers") renderNumbers(body);
  else if (talkState.section === "shopping") renderShopping(body);
  else if (talkState.openConv) renderDialogue(body, state.conversations.find((c) => c.id === talkState.openConv));
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

  // Price trainer + listening game first: the most useful practice.
  body.appendChild(priceTrainer());
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

  const links = state.links.prices || [];
  if (links.length) {
    body.appendChild(
      el("section", { class: "card panel" }, [
        el("h2", { class: "panel-title", text: "🎧 Teacher's listening practice (lesson 8)" }),
        el("div", { class: "link-list" }, links.map((l) => el("a", { href: l.url, target: "_blank", rel: "noopener", class: "game-link game-link--wide", text: l.title }))),
      ])
    );
  }
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
      el("button", { type: "button", class: "link-btn", text: "🏷️ Practise saying prices →", onclick: () => { talkState.section = "numbers"; showTab("talk"); } }),
    ])
  );
}

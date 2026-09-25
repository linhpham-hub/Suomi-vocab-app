// Words tab: the full glossary with search + chapter filter, pronunciation,
// each word's level, and the teacher's Wordwall practice games.

const wordsState = { chapters: null, query: "", level: "all" };

const LEVEL_FILTERS = [
  ["all", "All levels"],
  ["focus", "🎯 Needs focus"],
  ["growing", "🌱 Getting there"],
  ["almost", "🔥 Almost"],
  ["mastered", "🏆 Mastered"],
  ["new", "⚪ Not started"],
];

function renderWords() {
  if (!wordsState.chapters) wordsState.chapters = new Set(state.chapters);
  app.appendChild(tpl("tpl-words"));

  const search = app.querySelector('[data-role="search"]');
  const clear = app.querySelector('[data-role="search-clear"]');
  search.value = wordsState.query;
  clear.hidden = !wordsState.query;
  search.addEventListener("input", () => {
    wordsState.query = search.value;
    clear.hidden = !search.value;
    renderWordList();
  });
  clear.addEventListener("click", () => {
    wordsState.query = "";
    search.value = "";
    clear.hidden = true;
    search.focus();
    renderWordList();
  });

  const chipBox = app.querySelector('[data-role="chapters"]');
  const drawChips = () =>
    chapterChips(chipBox, state.chapters, wordsState.chapters, (next) => {
      wordsState.chapters = next;
      drawChips();
      renderWordList();
    });
  drawChips();

  const levelSel = app.querySelector('[data-role="level"]');
  LEVEL_FILTERS.forEach(([v, label]) => levelSel.appendChild(el("option", { value: v, text: label })));
  levelSel.value = wordsState.level;
  levelSel.addEventListener("change", () => {
    wordsState.level = levelSel.value;
    renderWordList();
  });

  renderTeacherGames(app.querySelector('[data-role="games"]'));
  renderWordList();
}

function wordMatches(w, q) {
  if (!q) return true;
  const hay = (w.fi + " " + w.en).toLowerCase();
  // Let people search without typing the dots: "aiti" finds "äiti".
  return hay.includes(q) || undot(hay).includes(undot(q));
}

function renderWordList() {
  const body = app.querySelector('[data-role="list"]');
  const countBox = app.querySelector('[data-role="count"]');
  if (!body) return;
  body.innerHTML = "";
  const q = wordsState.query.trim().toLowerCase();
  let shown = 0;

  state.chapters
    .filter((ch) => wordsState.chapters.has(ch))
    .forEach((ch) => {
      const words = state.words.filter(
        (w) => w.chapter === ch && wordMatches(w, q) && (wordsState.level === "all" || SRS.level(w.id) === wordsState.level)
      );
      if (!words.length) return;
      shown += words.length;
      const list = el("div", { class: "glossary-list" });
      words.forEach((w) => list.appendChild(wordRow(w)));
      body.appendChild(
        el("section", { class: "glossary-chapter" }, [
          el("h3", { class: "glossary-chapter-heading", text: `${ch} · ${words.length} word${words.length === 1 ? "" : "s"}` }),
          list,
        ])
      );
    });

  countBox.textContent = wordsState.chapters.size
    ? `${shown} word${shown === 1 ? "" : "s"} shown`
    : "No chapter selected";

  if (!shown) {
    body.appendChild(
      el("p", {
        class: "empty-selection-note",
        text: !wordsState.chapters.size
          ? "Pick a chapter above (or tap All)."
          : q
          ? `No words match “${wordsState.query}”. Try another spelling or chapter.`
          : "No words at this level yet.",
      })
    );
  }
}

function renderTeacherGames(box) {
  const groups = state.links.glossary || [];
  if (!groups.length) {
    box.remove();
    return;
  }
  const details = el("details", { class: "card games-card" }, [
    el("summary", { html: "🎮 <strong>Teacher's Wordwall games</strong> <span class='muted'>· opens wordwall.net</span>" }),
  ]);
  groups.forEach((g) => {
    const sec = el("div", { class: "games-chapter" }, [el("h4", { text: g.chapter })]);
    g.parts.forEach((p) => {
      sec.appendChild(
        el("div", { class: "games-part" }, [
          el("span", { class: "games-part-name", text: p.name }),
          el(
            "div",
            { class: "games-links" },
            p.games.map((gm) => el("a", { href: gm.url, target: "_blank", rel: "noopener", class: "game-link", text: gm.type }))
          ),
        ])
      );
    });
    details.appendChild(sec);
  });
  box.replaceWith(details);
}

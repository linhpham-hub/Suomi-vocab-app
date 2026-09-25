// Small shared UI helpers used by every tab.

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s == null ? "" : String(s);
  return div.innerHTML;
}

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k === "html") node.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else if (v === true) node.setAttribute(k, "");
    else if (v !== false && v != null) node.setAttribute(k, v);
  }
  (Array.isArray(children) ? children : [children]).forEach((c) => {
    if (c == null || c === false) return;
    node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  });
  return node;
}

// 🔊 button that reads `text` in Finnish. Never triggers the parent's click
// (so tapping it on a flashcard doesn't flip the card).
function speakBtn(text, { label = "Listen", small = false } = {}) {
  return el("button", {
    type: "button",
    class: "speak-btn" + (small ? " speak-btn--small" : ""),
    "aria-label": `${label}: ${text}`,
    title: "Listen",
    text: "🔊",
    onclick: (e) => {
      e.stopPropagation();
      e.preventDefault();
      Speech.say(text);
    },
  });
}

let toastTimer = null;
function toast(message, ms = 2800) {
  let box = document.getElementById("toast");
  if (!box) {
    box = el("div", { id: "toast", class: "toast", role: "status" });
    document.body.appendChild(box);
  }
  box.textContent = message;
  box.classList.add("toast--show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => box.classList.remove("toast--show"), ms);
}

// Chapter filter row: "All" and "None" shortcuts plus one chip per chapter.
// Selected chips show a ✓ so it's always clear what's included.
function chapterChips(container, chapters, selected, onChange) {
  container.innerHTML = "";
  const allOn = selected.size === chapters.length;
  const noneOn = selected.size === 0;

  const mk = (label, active, extraClass, handler) =>
    el("button", {
      type: "button",
      class: `chip ${extraClass || ""} ${active ? "chip--active" : ""}`,
      "aria-pressed": active ? "true" : "false",
      html: `${active ? '<span class="chip-check">✓</span>' : ""}${escapeHtml(label)}`,
      onclick: handler,
    });

  container.appendChild(mk("All", allOn, "chip--all", () => onChange(new Set(chapters))));
  container.appendChild(mk("None", noneOn, "chip--none", () => onChange(new Set())));
  container.appendChild(el("span", { class: "chip-divider", "aria-hidden": "true" }));
  chapters.forEach((ch) => {
    const on = selected.has(ch);
    container.appendChild(
      mk(ch, on, "", () => {
        const next = new Set(selected);
        on ? next.delete(ch) : next.add(ch);
        onChange(next);
      })
    );
  });
}

// Word popover: meaning + pronunciation for a glossary word (used in dialogues).
function showWordPopover(word, surface) {
  closeWordPopover();
  const t = document.getElementById("toast");
  if (t) t.classList.remove("toast--show");
  const lv = SRS.level(word.id);
  const card = el("div", { class: "word-pop-card", role: "dialog", "aria-label": word.fi }, [
    el("div", { class: "word-pop-head" }, [
      el("div", {}, [
        el("div", { class: "word-pop-fi", text: word.fi }),
        surface && surface.toLowerCase() !== word.fi.toLowerCase()
          ? el("div", { class: "word-pop-surface", text: `in the text: “${surface}”` })
          : null,
      ]),
      speakBtn(word.fi),
    ]),
    el("div", { class: "word-pop-en", text: word.en }),
    el("div", { class: "word-pop-meta" }, [
      el("span", { class: `level-pill level-pill--${lv}`, text: LEVEL_LABELS[lv] }),
      el("span", { text: word.chapter }),
    ]),
    el("button", { type: "button", class: "ghost-btn word-pop-close", text: "Close", onclick: closeWordPopover }),
  ]);
  const overlay = el("div", { id: "word-pop", class: "word-pop", onclick: (e) => { if (e.target === overlay) closeWordPopover(); } }, [card]);
  document.body.appendChild(overlay);
  Speech.say(word.fi);
}

function closeWordPopover() {
  const o = document.getElementById("word-pop");
  if (o) o.remove();
}

const LEVEL_LABELS = {
  new: "Not started",
  focus: "Needs focus",
  growing: "Getting there",
  almost: "Almost mastered",
  mastered: "Mastered 🏆",
};

// Five dots showing how many times in a row the word was right (0-5).
function streakDots(id) {
  const box = SRS.get(id).box;
  const wrap = el("span", { class: "streak-dots", title: `${box}/5 right in a row` });
  for (let i = 0; i < SRS.MAX_BOX; i++) wrap.appendChild(el("i", { class: i < box ? "on" : "" }));
  return wrap;
}

function formatScore(n) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

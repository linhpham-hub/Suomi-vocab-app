// Progress tab: how the levels work, progress per chapter, every word grouped
// by level (what to focus on), device sync, voice settings and feedback.

const progressState = { bucket: "learning", sub: "all" };

// Same three groups (and the same counts) as the Study tab summary:
// new + learning + mastered = all words in the selected chapters.
const MAIN_BUCKETS = [
  { id: "new", icon: "⚪", label: "New", note: "You haven't practised these yet." },
  { id: "learning", icon: "📘", label: "Learning", note: "Practised, not mastered yet. Pick a level below to narrow it down." },
  { id: "mastered", icon: "🏆", label: "Mastered", note: "5 right in a row. They still come back now and then, so you don't forget." },
];
// "Learning" split into its three levels.
const BUCKETS = [
  { id: "focus", icon: "🎯", label: "Needs focus", note: "You got these wrong last time. Practise these first." },
  { id: "growing", icon: "🌱", label: "Getting there", note: "1–2 right in a row." },
  { id: "almost", icon: "🔥", label: "Almost", note: "3–4 right in a row. One or two more and they're mastered!" },
];
const LEVEL_ORDER = { focus: 0, growing: 1, almost: 2 };

function renderProgress() {
  app.appendChild(tpl("tpl-progress"));

  // Chapter bars.
  const bars = app.querySelector('[data-role="chapter-bars"]');
  state.chapters.forEach((chapter) => {
    const ids = state.words.filter((w) => w.chapter === chapter).map((w) => w.id);
    const s = SRS.statsForIds(ids);
    const mPct = s.total ? (s.mastered / s.total) * 100 : 0;
    const lPct = s.total ? (s.learning / s.total) * 100 : 0;
    bars.appendChild(
      el("div", { class: "chapter-stat" }, [
        el("div", { class: "chapter-stat-head" }, [
          el("span", { text: chapter }),
          el("span", { class: "chapter-stat-count", text: `${s.mastered} mastered · ${s.learning} learning · ${s.total} words` }),
        ]),
        el("div", { class: "chapter-stat-bar" }, [
          el("div", { class: "chapter-stat-fill chapter-stat-fill--mastered", style: `width:${mPct}%` }),
          el("div", { class: "chapter-stat-fill chapter-stat-fill--learning", style: `width:${lPct}%; margin-left:${mPct}%` }),
        ]),
      ])
    );
  });

  // Chapter filter: shared with the Study tab, so both show the same numbers.
  chapterChips(app.querySelector('[data-role="chapters"]'), state.chapters, state.selectedChapters, (next) => {
    state.selectedChapters = next;
    savePrefs();
    showTab("progress");
  });

  // Word lists: New / Learning / Mastered, Learning split by level.
  const pool = activeWordPool();
  const byLevel = { new: [], focus: [], growing: [], almost: [], mastered: [] };
  pool.forEach((w) => byLevel[SRS.level(w.id)].push(w));
  const main = {
    new: byLevel.new,
    learning: [...byLevel.focus, ...byLevel.growing, ...byLevel.almost],
    mastered: byLevel.mastered,
  };

  const tabs = app.querySelector('[data-role="buckets"]');
  tabs.appendChild(el("div", { class: "bucket-total" }, [el("span", { class: "bucket-count", text: String(pool.length) }), el("span", { class: "bucket-label", text: "words" })]));
  MAIN_BUCKETS.forEach((b) => {
    tabs.appendChild(
      el("button", {
        type: "button",
        class: `bucket-btn bucket-btn--${b.id}` + (progressState.bucket === b.id ? " bucket-btn--active" : ""),
        onclick: () => { progressState.bucket = b.id; progressState.sub = "all"; showTab("progress"); },
      }, [el("span", { class: "bucket-count", text: String(main[b.id].length) }), el("span", { class: "bucket-label", text: `${b.icon} ${b.label}` })])
    );
  });

  // Level chips under Learning: All · 🎯 · 🌱 · 🔥 (they add up to Learning).
  const subs = app.querySelector('[data-role="subs"]');
  if (progressState.bucket === "learning") {
    [{ id: "all", icon: "", label: "All learning" }, ...BUCKETS].forEach((b) => {
      const n = b.id === "all" ? main.learning.length : byLevel[b.id].length;
      subs.appendChild(
        el("button", {
          type: "button",
          class: "chip sub-chip" + (progressState.sub === b.id ? " chip--active" : ""),
          text: `${b.icon ? b.icon + " " : ""}${b.label} ${n}`,
          onclick: () => { progressState.sub = b.id; showTab("progress"); },
        })
      );
    });
  } else {
    subs.remove();
  }

  const bucket = progressState.bucket === "learning" && progressState.sub !== "all"
    ? BUCKETS.find((b) => b.id === progressState.sub)
    : MAIN_BUCKETS.find((b) => b.id === progressState.bucket);
  const listBox = app.querySelector('[data-role="bucket-list"]');
  listBox.appendChild(el("p", { class: "muted small bucket-note", text: bucket.note }));
  let words = bucket.id === "learning" ? main.learning : bucket.id in main ? main[bucket.id] : byLevel[bucket.id];
  // Inside a chapter: weakest first when showing all learning words.
  const chapterIdx = new Map(state.chapters.map((c, i) => [c, i]));
  words = [...words].sort((a, b) => chapterIdx.get(a.chapter) - chapterIdx.get(b.chapter) || (LEVEL_ORDER[SRS.level(a.id)] ?? 0) - (LEVEL_ORDER[SRS.level(b.id)] ?? 0));
  if (bucket.id === "focus" && words.length) {
    listBox.appendChild(
      el("button", {
        type: "button",
        class: "primary-btn bucket-practise",
        text: `🎯 Practise ${Math.min(words.length, state.sessionSize || words.length)} focus words`,
        onclick: () => {
          const size = state.sessionSize || words.length;
          startSession("focus", shuffle([...words]).slice(0, size));
        },
      })
    );
  }
  if (!words.length) {
    listBox.appendChild(el("p", { class: "empty-selection-note", text: bucket.id === "focus" ? "Nothing to focus on right now 🎉" : "No words here yet." }));
  } else {
    let lastChapter = null;
    let list = null;
    words.forEach((w) => {
      if (w.chapter !== lastChapter) {
        lastChapter = w.chapter;
        listBox.appendChild(el("h3", { class: "glossary-chapter-heading", text: w.chapter }));
        list = el("div", { class: "glossary-list" });
        listBox.appendChild(list);
      }
      const row = wordRow(w);
      row.querySelector(".glossary-side").prepend(streakDots(w.id));
      list.appendChild(row);
    });
  }

  renderSyncCard(app.querySelector('[data-role="sync"]'));
  renderVoiceCard(app.querySelector('[data-role="voice"]'));

  const fbBtn = app.querySelector('[data-role="feedback"]');
  if (feedbackFormUrl()) fbBtn.textContent = "Open feedback form ↗";
  fbBtn.addEventListener("click", openFeedback);
  app.querySelector('[data-role="reset"]').addEventListener("click", () => {
    if (confirm("Reset all your word progress on this device? This can't be undone.")) {
      SRS.resetAll();
      if (getAccount()) toast("Reset on this device. Your saved online progress will merge back on the next sync. Unlink first if you want a clean start.", 6000);
      showTab("progress");
    }
  });
}

function renderSyncCard(box) {
  box.innerHTML = "";
  box.appendChild(el("h2", { class: "panel-title", text: "☁️ Save to all my devices" }));
  if (!syncIsConfigured()) {
    box.appendChild(el("p", { class: "muted small", text: "Online sync isn't set up for this app yet. Your progress is saved on this device." }));
    return;
  }
  const acct = getAccount();
  if (acct) {
    const when = acct.lastSync ? new Date(acct.lastSync).toLocaleString() : "not yet";
    const status = el("p", { class: "small", html: `Linked as <strong>${escapeHtml(acct.username)}</strong>. Last synced: ${escapeHtml(when)}.` });
    const syncBtn = el("button", {
      type: "button",
      class: "ghost-btn",
      text: "🔄 Sync now",
      onclick: async () => {
        syncBtn.disabled = true;
        syncBtn.textContent = "Syncing…";
        const r = await syncAccount();
        toast(r.ok ? `Synced ✓${r.merged ? ` (${r.merged} words updated)` : ""}` : "Couldn't sync. Check your internet.");
        showTab("progress");
      },
    });
    const unlink = el("button", {
      type: "button",
      class: "link-btn",
      text: "Unlink this device",
      onclick: () => {
        if (confirm("Stop syncing this device? Your progress stays here and online; you can link again with the same name + PIN.")) {
          unlinkAccount();
          showTab("progress");
        }
      },
    });
    box.append(status, el("p", { class: "muted small", text: "On another phone or browser: open the app, tap your name on the Study tab (or here), tick “Save to all my devices” and use the same name + PIN." }), el("div", { class: "row-actions" }, [syncBtn, unlink]));
  } else {
    box.append(
      el("p", { class: "small", text: "Right now your progress is only on this device. Link it with your name + a 4-digit PIN and open the same progress on any phone or browser." }),
      el("button", { type: "button", class: "primary-btn", text: "Set up name + PIN", onclick: () => { openNameModal({ editing: true }); const cb = document.getElementById("link-check"); cb.checked = true; cb.onchange(); } })
    );
  }
}

function renderVoiceCard(box) {
  const s = Speech.settings();
  box.innerHTML = "";
  box.appendChild(el("h2", { class: "panel-title", text: "🔊 Voice" }));
  const status = !Speech.supported()
    ? "This browser can't read text aloud. Try Chrome, Edge or Safari."
    : Speech.hasFinnishVoice()
    ? "Finnish voice found ✓"
    : "No Finnish voice on this device yet, so the pronunciation may sound off. Windows: Settings → Time & language → Speech → Add voices → Finnish. Android: Settings → Text-to-speech → Google → install Finnish. iPhone: it's built in (Satu).";
  box.appendChild(el("p", { class: "small", text: status }));

  // Choose between voices when the device has more than one Finnish voice.
  const voices = Speech.finnishVoices();
  if (voices.length > 1) {
    const cur = Speech.currentVoice();
    const sel = el("select", { class: "select voice-select" });
    voices.forEach((v) => {
      const tag = Speech.isOnlineVoice(v) ? "online · best sound, needs internet" : "on this device · instant";
      const o = el("option", { value: v.voiceURI, text: `${v.name.replace(/^Microsoft\s+/, "").replace(/\s*-\s*Finnish.*$/i, "")} (${tag})` });
      if (cur && cur.voiceURI === v.voiceURI) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener("change", () => {
      Speech.saveSettings({ voiceURI: sel.value });
      Speech.say("Hei! Mitä kuuluu?");
    });
    box.append(el("label", { class: "field-label", text: "Voice" }), sel,
      el("p", { class: "muted small", text: "If 🔊 feels slow, pick an “on this device” voice: it starts instantly, even offline." }));
  }

  const speed = el("div", { class: "segmented" });
  [[0.65, "🐢 Slow"], [0.9, "Normal"], [1.1, "Fast"]].forEach(([r, l]) =>
    speed.appendChild(el("button", { type: "button", class: "segmented-btn" + (Math.abs(s.rate - r) < 0.01 ? " segmented-btn--active" : ""), text: l, onclick: () => { Speech.saveSettings({ rate: r }); Speech.say("Hei! Mitä kuuluu?"); renderVoiceCard(box); } }))
  );
  const auto = el("input", { type: "checkbox" });
  auto.checked = !!s.autoplay;
  auto.addEventListener("change", () => Speech.saveSettings({ autoplay: auto.checked }));
  box.append(
    el("label", { class: "field-label", text: "Speed" }),
    speed,
    el("label", { class: "check-row" }, [auto, el("span", { text: "Read Finnish words aloud automatically in study sessions" })]),
    el("button", { type: "button", class: "ghost-btn", text: "▶ Test: “Hei! Mitä kuuluu?”", onclick: () => Speech.say("Hei! Mitä kuuluu?") })
  );
}

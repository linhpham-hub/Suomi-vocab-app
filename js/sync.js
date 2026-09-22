// Optional "share with friends" layer: a one-time name prompt, a stable
// per-install device id, and a silent best-effort progress sync.
//
// This entire file is designed to no-op cleanly when js/config.js still has
// its placeholder values -- studying always works fully offline regardless
// of whether this is set up. See README.md for setup steps.

const DEVICE_ID_KEY = "finVocabDeviceId.v1";
const PLAYER_NAME_KEY = "finVocabPlayerName.v1";

function syncIsConfigured() {
  const c = window.APP_CONFIG;
  return !!(c && c.SUPABASE_URL && c.SUPABASE_ANON_KEY && !c.SUPABASE_URL.startsWith("YOUR_SUPABASE_URL"));
}

function getDeviceId() {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = (crypto.randomUUID ? crypto.randomUUID() : "id-" + Date.now() + "-" + Math.random().toString(36).slice(2));
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

function getPlayerName() {
  return localStorage.getItem(PLAYER_NAME_KEY);
}

function setPlayerName(name) {
  localStorage.setItem(PLAYER_NAME_KEY, name);
}

// Shows a one-time "what's your name?" prompt if we don't have one yet.
// Never blocks studying -- there's always a Skip option.
function maybeShowNamePrompt() {
  if (getPlayerName()) return;

  const modal = document.getElementById("name-modal");
  if (!modal) return;

  const input = document.getElementById("name-input");
  const submitBtn = document.getElementById("name-submit");
  const skipBtn = document.getElementById("name-skip");

  modal.hidden = false;
  input.focus();

  const finish = (name) => {
    setPlayerName(name && name.trim() ? name.trim().slice(0, 30) : "Friend");
    modal.hidden = true;
  };

  submitBtn.addEventListener("click", () => finish(input.value));
  skipBtn.addEventListener("click", () => finish(""));
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") finish(input.value);
  });
}

// Builds a snapshot of current progress across every chapter.
function buildProgressSnapshot(allWords, chapterList) {
  const chapters = {};
  chapterList.forEach((chapter) => {
    const ids = allWords.filter((w) => w.chapter === chapter).map((w) => w.id);
    chapters[chapter] = SRS.statsForIds(ids);
  });
  const allIds = allWords.map((w) => w.id);
  const totals = SRS.statsForIds(allIds);

  return {
    device_id: getDeviceId(),
    name: getPlayerName() || "Friend",
    chapters,
    total_mastered: totals.mastered,
    total_learning: totals.learning,
    total_words: totals.total,
    last_active: new Date().toISOString(),
  };
}

// Fire-and-forget: pushes a progress snapshot to Supabase. Never throws,
// never blocks the UI, and does nothing at all if sync isn't configured or
// the device is offline.
async function syncProgress(allWords, chapterList) {
  if (!syncIsConfigured()) return;
  try {
    const snapshot = buildProgressSnapshot(allWords, chapterList);
    const c = window.APP_CONFIG;
    await fetch(`${c.SUPABASE_URL}/rest/v1/progress?on_conflict=device_id`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: c.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${c.SUPABASE_ANON_KEY}`,
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify([snapshot]),
    });
  } catch (e) {
    // Offline, or Supabase not reachable -- studying never depends on this.
    console.warn("Progress sync skipped:", e);
  }
}

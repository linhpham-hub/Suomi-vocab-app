// Optional online features, all backed by the Supabase project in js/config.js:
//   1. Owner dashboard snapshot: after each study session a small summary
//      (name + counts per chapter) is sent so Chloe's /dashboard.html can show it.
//   2. "Save to all my devices": username + 4-digit PIN. The full progress is
//      stored in Supabase through two database functions (account_pull /
//      account_push) that check the PIN server-side; the PIN is stored hashed.
// Everything here fails silently -- studying never depends on the network.

const DEVICE_ID_KEY = "finVocabDeviceId.v1";
const PLAYER_NAME_KEY = "finVocabPlayerName.v1";
const ACCOUNT_KEY = "finVocabAccount.v1";

function syncIsConfigured() {
  const c = window.APP_CONFIG;
  return !!(c && c.SUPABASE_URL && c.SUPABASE_ANON_KEY && !c.SUPABASE_URL.startsWith("YOUR_SUPABASE_URL"));
}

function supabaseHeaders(extra = {}) {
  const c = window.APP_CONFIG;
  return {
    "Content-Type": "application/json",
    apikey: c.SUPABASE_ANON_KEY,
    Authorization: `Bearer ${c.SUPABASE_ANON_KEY}`,
    ...extra,
  };
}

function getDeviceId() {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID() : "id-" + Date.now() + "-" + Math.random().toString(36).slice(2);
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
function displayName() {
  const n = getPlayerName();
  return n && n !== "Friend" ? n : "";
}

// ---------- Account (cross-device) ----------

function getAccount() {
  try {
    return JSON.parse(localStorage.getItem(ACCOUNT_KEY)) || null;
  } catch {
    return null;
  }
}
function setAccount(acct) {
  if (acct) localStorage.setItem(ACCOUNT_KEY, JSON.stringify(acct));
  else localStorage.removeItem(ACCOUNT_KEY);
}

async function rpc(fn, args) {
  const c = window.APP_CONFIG;
  const res = await fetch(`${c.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: supabaseHeaders(),
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Server said ${res.status}${txt ? ": " + txt.slice(0, 160) : ""}`);
  }
  return res.json();
}

const ACCOUNT_MESSAGES = {
  wrong_pin: "That name is already used with a different PIN. Check your PIN, or pick another name.",
  locked: "Too many wrong PINs. Please wait 15 minutes and try again.",
  invalid: "Use a name and a 4-digit PIN (numbers only).",
};

// Link this device: loads progress saved under this name (if any), merges it
// with what's on this device, and saves the result back.
// Returns { ok, created, merged, message }.
async function linkAccount(name, pin) {
  if (!syncIsConfigured()) return { ok: false, message: "Online sync isn't set up for this app yet." };
  const username = String(name || "").trim();
  if (!username || !/^\d{4}$/.test(pin)) return { ok: false, message: ACCOUNT_MESSAGES.invalid };

  try {
    const pulled = await rpc("account_pull", { p_username: username, p_pin: pin });
    if (pulled.status === "wrong_pin" || pulled.status === "locked" || pulled.status === "invalid") {
      return { ok: false, message: ACCOUNT_MESSAGES[pulled.status] };
    }
    let merged = 0;
    let created = pulled.status === "not_found";
    if (pulled.status === "ok") merged = SRS.mergeIn(pulled.srs || {});
    const shownName = (pulled.status === "ok" && pulled.display_name) || username;
    setPlayerName(shownName);

    const pushed = await rpc("account_push", {
      p_username: username,
      p_pin: pin,
      p_display_name: shownName,
      p_srs: SRS.exportAll(),
    });
    if (pushed.status !== "ok" && pushed.status !== "created") {
      return { ok: false, message: ACCOUNT_MESSAGES[pushed.status] || "Couldn't save. Please try again." };
    }
    setAccount({ username, pin, lastSync: new Date().toISOString() });
    return { ok: true, created, merged };
  } catch (e) {
    console.warn("linkAccount failed", e);
    return { ok: false, message: "Couldn't reach the server. Check your internet and try again." };
  }
}

// Pull + merge + push for an already-linked device. Silent on failure.
async function syncAccount() {
  const acct = getAccount();
  if (!acct || !syncIsConfigured()) return { ok: false };
  try {
    const pulled = await rpc("account_pull", { p_username: acct.username, p_pin: acct.pin });
    if (pulled.status !== "ok" && pulled.status !== "not_found") return { ok: false, status: pulled.status };
    const merged = pulled.status === "ok" ? SRS.mergeIn(pulled.srs || {}) : 0;
    await rpc("account_push", {
      p_username: acct.username,
      p_pin: acct.pin,
      p_display_name: displayName() || acct.username,
      p_srs: SRS.exportAll(),
    });
    setAccount({ ...acct, lastSync: new Date().toISOString() });
    return { ok: true, merged };
  } catch (e) {
    console.warn("Account sync skipped:", e);
    return { ok: false };
  }
}

function unlinkAccount() {
  setAccount(null);
}

// ---------- Owner dashboard snapshot ----------

function buildProgressSnapshot(allWords, chapterList) {
  const chapters = {};
  chapterList.forEach((chapter) => {
    const ids = allWords.filter((w) => w.chapter === chapter).map((w) => w.id);
    chapters[chapter] = SRS.statsForIds(ids);
  });
  const totals = SRS.statsForIds(allWords.map((w) => w.id));
  const acct = getAccount();
  return {
    // One row per person when linked (all their devices), otherwise per device.
    device_id: acct ? "acct:" + acct.username.toLowerCase() : getDeviceId(),
    name: displayName() || "Friend",
    chapters,
    total_mastered: totals.mastered,
    total_learning: totals.learning,
    total_words: totals.total,
    last_active: new Date().toISOString(),
  };
}

async function syncProgress(allWords, chapterList) {
  if (!syncIsConfigured()) return;
  try {
    const c = window.APP_CONFIG;
    await fetch(`${c.SUPABASE_URL}/rest/v1/progress?on_conflict=device_id`, {
      method: "POST",
      headers: supabaseHeaders({ Prefer: "resolution=merge-duplicates,return=minimal" }),
      body: JSON.stringify([buildProgressSnapshot(allWords, chapterList)]),
    });
  } catch (e) {
    console.warn("Progress sync skipped:", e);
  }
}

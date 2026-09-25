// Owner-only dashboard: reads every synced friend's progress from Supabase.
//
// Security note (also in README): the passphrase gate below only hides this
// page from casual browsing. It is NOT real authentication -- the same
// public anon key that lets this page read the data is present in the
// site's own JavaScript, so it isn't a secret. That's an accepted trade-off
// for a small friend group with low-stakes data (word-mastery counts only).

const UNLOCK_KEY = "finVocabDashboardUnlocked.v1";

const gate = document.getElementById("gate");
const gateError = document.getElementById("gate-error");
const passInput = document.getElementById("passphrase-input");
const passSubmit = document.getElementById("passphrase-submit");
const content = document.getElementById("dashboard-content");
const statusBox = document.getElementById("dashboard-status");
const list = document.getElementById("dashboard-list");
const refreshBtn = document.getElementById("refresh-btn");

function configured() {
  const c = window.APP_CONFIG;
  return !!(c && c.SUPABASE_URL && c.SUPABASE_ANON_KEY && !c.SUPABASE_URL.startsWith("YOUR_SUPABASE_URL"));
}

let passphrase = sessionStorage.getItem(UNLOCK_KEY) || "";

function unlock(pass) {
  passphrase = pass;
  gate.hidden = true;
  content.hidden = false;
  sessionStorage.setItem(UNLOCK_KEY, pass);
  loadDashboard();
}

// The passphrase is checked on the server (dashboard_check in setup.sql).
// Falls back to the old browser-only check only if that function doesn't
// exist yet AND a DASHBOARD_PASSPHRASE is set in js/config.js.
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

async function tryUnlock() {
  const pass = passInput.value;
  passSubmit.disabled = true;
  const ok = await checkPassphrase(pass);
  passSubmit.disabled = false;
  if (!ok) {
    gateError.hidden = false;
    return;
  }
  gateError.hidden = true;
  unlock(pass);
}

// ---------- Feedback ----------
// Feedback rows can include friends' email addresses, so they are NOT
// readable with the public key directly: the list_feedback() database
// function returns them only when given the dashboard passphrase (stored in
// the app_secrets table, see README).

const fbStatus = document.getElementById("feedback-status");
const fbList = document.getElementById("feedback-list");
const copyBtn = document.getElementById("copy-emails");
const emailAll = document.getElementById("email-all");
let feedbackEmails = [];

copyBtn.addEventListener("click", async () => {
  if (!feedbackEmails.length) {
    toast("No emails yet.");
    return;
  }
  try {
    await navigator.clipboard.writeText(feedbackEmails.join(", "));
    toast(`Copied ${feedbackEmails.length} email${feedbackEmails.length === 1 ? "" : "s"} ✓`);
  } catch {
    prompt("Copy these emails:", feedbackEmails.join(", "));
  }
});

async function loadFeedback() {
  fbList.innerHTML = "";
  fbStatus.hidden = true;
  feedbackEmails = [];
  emailAll.hidden = true;
  if (!configured()) return;
  const c = window.APP_CONFIG;
  try {
    const res = await fetch(`${c.SUPABASE_URL}/rest/v1/rpc/list_feedback`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: c.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${c.SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ p_passphrase: passphrase }),
    });
    if (res.status === 404) throw new Error("the feedback table isn't set up yet (run the new SQL in README → Feedback)");
    if (!res.ok) throw new Error(`Supabase returned ${res.status}. Check the passphrase in app_secrets matches js/config.js`);
    const rows = await res.json();
    if (!rows.length) {
      fbStatus.hidden = false;
      fbStatus.textContent = "No feedback yet.";
      return;
    }
    feedbackEmails = [...new Set(rows.map((r) => (r.email || "").trim()).filter(Boolean))];
    if (feedbackEmails.length) {
      emailAll.hidden = false;
      emailAll.href = `mailto:?bcc=${encodeURIComponent(feedbackEmails.join(","))}&subject=${encodeURIComponent("Suomen Sanasto has been updated!")}`;
    }
    rows.forEach((r) => {
      const card = document.createElement("div");
      card.className = "card feedback-item";
      const faces = ["", "😞", "😕", "🙂", "😊", "🤩"];
      card.innerHTML = `
        <div class="feedback-item-head">
          <strong>${escapeHtml(r.name || "Anonymous")}${r.rating ? " " + faces[r.rating] : ""}</strong>
          <span class="muted">${escapeHtml(relativeTime(r.created_at))}</span>
        </div>
        <p>${escapeHtml(r.message)}</p>
        ${r.email ? `<p class="muted small">✉️ <a href="mailto:${encodeURIComponent(r.email)}">${escapeHtml(r.email)}</a></p>` : ""}
      `;
      fbList.appendChild(card);
    });
  } catch (e) {
    fbStatus.hidden = false;
    fbStatus.textContent = `Couldn't load feedback: ${e.message}.`;
  }
}


passSubmit.addEventListener("click", tryUnlock);
passInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") tryUnlock();
});
refreshBtn.addEventListener("click", loadDashboard);

function relativeTime(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function showStatus(message) {
  statusBox.hidden = false;
  statusBox.textContent = message;
}

async function loadDashboard() {
  list.innerHTML = "";
  statusBox.hidden = true;
  loadFeedback();

  if (!configured()) {
    showStatus(
      "Sync isn't set up yet -- fill in SUPABASE_URL and SUPABASE_ANON_KEY in js/config.js (see README.md)."
    );
    return;
  }

  const c = window.APP_CONFIG;
  try {
    const res = await fetch(`${c.SUPABASE_URL}/rest/v1/progress?select=*&order=last_active.desc`, {
      headers: {
        apikey: c.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${c.SUPABASE_ANON_KEY}`,
      },
    });
    if (!res.ok) throw new Error(`Supabase returned ${res.status}`);
    const rows = await res.json();

    if (!rows.length) {
      showStatus("No progress synced yet -- once a friend finishes a study session, they'll show up here.");
      return;
    }

    rows.forEach((row) => list.appendChild(renderFriendCard(row)));
  } catch (e) {
    showStatus(`Couldn't load progress: ${e.message}`);
  }
}

function renderFriendCard(row) {
  const card = document.createElement("div");
  card.className = "card dashboard-friend-card";

  const chapters = row.chapters || {};
  const chapterRows = Object.keys(chapters)
    .map((chapter) => {
      const s = chapters[chapter];
      return `
        <div class="chapter-stat">
          <div class="chapter-stat-head">
            <span>${escapeHtml(chapter)}</span>
            <span class="chapter-stat-count">${s.mastered}/${s.total} mastered</span>
          </div>
          <div class="chapter-stat-bar">
            <div class="chapter-stat-fill chapter-stat-fill--mastered" style="width:${pct(s.mastered, s.total)}%"></div>
            <div class="chapter-stat-fill chapter-stat-fill--learning" style="width:${pct(s.learning, s.total)}%; margin-left:${pct(s.mastered, s.total)}%"></div>
          </div>
        </div>
      `;
    })
    .join("");

  card.innerHTML = `
    <div class="dashboard-friend-head">
      <strong>${escapeHtml(row.name || "Friend")}</strong>
      <span class="dashboard-friend-total">${row.total_mastered}/${row.total_words} mastered</span>
    </div>
    <p class="dashboard-friend-active">Last active: ${relativeTime(row.last_active)}</p>
    <div class="dashboard-friend-chapters">${chapterRows}</div>
  `;
  return card;
}

function pct(n, total) {
  return total ? Math.round((n / total) * 100) : 0;
}


// Skip the gate if already unlocked earlier this tab session.
if (passphrase && passphrase !== "1") {
  checkPassphrase(passphrase).then((ok) => (ok ? unlock(passphrase) : sessionStorage.removeItem(UNLOCK_KEY)));
} else {
  passInput.focus();
}

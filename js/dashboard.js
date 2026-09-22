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

function unlock() {
  gate.hidden = true;
  content.hidden = false;
  sessionStorage.setItem(UNLOCK_KEY, "1");
  loadDashboard();
}

function tryUnlock() {
  const c = window.APP_CONFIG;
  if (!c || passInput.value !== c.DASHBOARD_PASSPHRASE) {
    gateError.hidden = false;
    return;
  }
  gateError.hidden = true;
  unlock();
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

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

// Skip the gate if already unlocked earlier this tab session.
if (sessionStorage.getItem(UNLOCK_KEY) === "1") {
  unlock();
} else {
  passInput.focus();
}

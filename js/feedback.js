// Feedback. Two options, chosen in js/config.js:
//   - FEEDBACK_FORM_URL set -> the Feedback button opens that Microsoft Form
//     (email notification per response, answers collected in Excel).
//   - otherwise -> a built-in feedback box that saves to the Supabase
//     "feedback" table, listed on the owner's /dashboard.html.
// Friends can leave an email to hear about updates, or stay anonymous.

function feedbackFormUrl() {
  const u = ((window.APP_CONFIG || {}).FEEDBACK_FORM_URL || "").trim();
  return /^https:\/\//.test(u) ? u : "";
}

function openFeedback() {
  const url = feedbackFormUrl();
  if (url) window.open(url, "_blank", "noopener");
  else openFeedbackModal();
}

async function sendFeedback({ name, email, message, rating }) {
  const c = window.APP_CONFIG || {};
  const payload = {
    name: name || "Anonymous",
    email: email || null,
    message,
    rating: rating || null,
    app_version: typeof APP_VERSION !== "undefined" ? APP_VERSION : "",
  };
  const jobs = [];

  if (syncIsConfigured()) {
    jobs.push(
      fetch(`${c.SUPABASE_URL}/rest/v1/feedback`, {
        method: "POST",
        headers: supabaseHeaders({ Prefer: "return=minimal" }),
        body: JSON.stringify(payload),
      }).then((r) => {
        if (!r.ok) throw new Error("Supabase " + r.status);
      })
    );
  }

  if (!jobs.length) throw new Error("not configured");
  const results = await Promise.allSettled(jobs);
  if (!results.some((r) => r.status === "fulfilled")) throw new Error("all failed");
}

function openFeedbackModal() {
  const existing = document.getElementById("feedback-modal");
  if (existing) existing.remove();

  let rating = 0;
  const nameInput = el("input", { type: "text", maxlength: "40", placeholder: "Your name", value: displayName() || "" });
  const emailInput = el("input", { type: "email", maxlength: "120", placeholder: "you@example.com (optional)" });
  const msg = el("textarea", { rows: "5", maxlength: "2000", placeholder: "What should be better? Any bugs? Ideas?" });
  const anon = el("input", { type: "checkbox", id: "fb-anon" });
  const idFields = el("div", { class: "fb-id-fields" }, [
    el("label", { class: "field-label", text: "Name" }), nameInput,
    el("label", { class: "field-label", text: "Email: get a note when there's an update" }), emailInput,
  ]);
  anon.addEventListener("change", () => (idFields.hidden = anon.checked));

  const stars = el("div", { class: "fb-rating", role: "radiogroup", "aria-label": "Rating" });
  const faces = ["😞", "😕", "🙂", "😊", "🤩"];
  faces.forEach((f, i) => {
    stars.appendChild(
      el("button", {
        type: "button",
        class: "fb-face",
        "aria-label": `${i + 1} of 5`,
        text: f,
        onclick: () => {
          rating = i + 1;
          stars.querySelectorAll(".fb-face").forEach((b, j) => b.classList.toggle("fb-face--on", j === i));
        },
      })
    );
  });

  const status = el("p", { class: "fb-status", hidden: true });
  const sendBtn = el("button", { type: "submit", class: "primary-btn", text: "Send feedback" });
  const cancel = el("button", { type: "button", class: "ghost-btn", text: "Cancel", onclick: () => overlay.remove() });

  const form = el("form", { class: "modal-card modal-card--left" }, [
    el("h2", { text: "Send feedback 💬" }),
    el("p", { text: "Tell LinhPham what you think: bugs, ideas, anything." }),
    el("label", { class: "field-label", text: "How do you like the app?" }), stars,
    el("label", { class: "field-label", text: "Your message" }), msg,
    el("label", { class: "check-row" }, [anon, el("span", { text: "Send anonymously" })]),
    idFields,
    status,
    el("div", { class: "modal-actions" }, [cancel, sendBtn]),
  ]);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const message = msg.value.trim();
    if (!message) {
      status.hidden = false;
      status.textContent = "Please write a message first.";
      msg.focus();
      return;
    }
    const email = anon.checked ? "" : emailInput.value.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      status.hidden = false;
      status.textContent = "That email doesn't look right. Fix it, or leave it empty.";
      return;
    }
    sendBtn.disabled = true;
    sendBtn.textContent = "Sending…";
    try {
      await sendFeedback({
        name: anon.checked ? "" : nameInput.value.trim(),
        email,
        message,
        rating,
      });
      overlay.remove();
      toast("Thank you! Kiitos! 💚");
    } catch (err) {
      sendBtn.disabled = false;
      sendBtn.textContent = "Send feedback";
      status.hidden = false;
      status.textContent = err.message === "not configured"
        ? "Feedback isn't set up for this app yet."
        : "Couldn't send. Check your internet and try again.";
    }
  });

  const overlay = el("div", { id: "feedback-modal", class: "modal-overlay" }, [form]);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
  msg.focus();
}

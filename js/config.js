// Online features are optional -- see README.md ("Sharing this with friends",
// "Save to all my devices" and "Feedback") for the exact setup steps.
// Anything left as a placeholder is simply skipped: studying works exactly
// the same, fully offline, nothing breaks.
window.APP_CONFIG = {
  SUPABASE_URL: "https://cbganyxlmpvmzmouhsyl.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNiZ2FueXhsbXB2bXptb3Voc3lsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwOTM3NDIsImV4cCI6MjEwNTY2OTc0Mn0.GvFFQS7Whd8uBNBabmQ6ySLEpnnj1La28vFKL5wTvLk", // the "anon public" key from Project Settings -> API

  // Leave this EMPTY. The dashboard passphrase now lives only in the
  // database (supabase/setup.sql -> app_secrets) and is checked on the
  // server, because this file is public. Only fill it in if you haven't run
  // setup.sql yet and need the old, browser-only check as a stopgap.
  DASHBOARD_PASSPHRASE: "",

  // Feedback: paste the share link of your Microsoft Form here, e.g.
  // "https://forms.office.com/r/AbCdEf1234". The Feedback button then opens
  // that form (you get an email per response, answers go into Excel).
  // Leave empty to use the built-in feedback box (shown on your dashboard).
  FEEDBACK_FORM_URL: "https://forms.cloud.microsoft/r/dNsFMJ9xpr",
};

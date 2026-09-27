// Pronunciation via the browser's built-in text-to-speech (Web Speech API).
// Free, no API key, works offline once the device has a Finnish voice.
// Voice quality depends on the device: Android (Google) and iPhone (Satu)
// ship Finnish voices; on Windows it needs the Finnish speech pack.

const Speech = (() => {
  const SETTINGS_KEY = "finVocabSpeech.v1";
  let voice = null;
  let warned = false;
  let playId = 0; // bumps on stop() so a running "Play all" chain ends

  function supported() {
    return typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
  }

  function finnishVoices() {
    if (!supported()) return [];
    return (window.speechSynthesis.getVoices() || []).filter((v) => /^fi([-_]|$)/i.test(v.lang));
  }

  // The learner can pick a voice in Progress → Voice (saved as voiceURI).
  // Otherwise prefer natural-sounding voices. Note: "Online" voices (e.g.
  // Edge's "Microsoft Noora Online (Natural)") stream from the internet, so
  // they sound better but can start a moment later on a slow connection.
  function pickVoice() {
    if (!supported()) return;
    const fi = finnishVoices();
    const chosen = settings().voiceURI;
    voice = (chosen && fi.find((v) => v.voiceURI === chosen)) || fi.find((v) => /google|natural|online/i.test(v.name)) || fi[0] || null;
  }

  function currentVoice() {
    return voice;
  }

  function isOnlineVoice(v) {
    return !!v && (v.localService === false || /online/i.test(v.name));
  }

  if (supported()) {
    pickVoice();
    window.speechSynthesis.addEventListener?.("voiceschanged", pickVoice);
  }

  function settings() {
    try {
      return { rate: 0.9, autoplay: false, ...(JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}) };
    } catch {
      return { rate: 0.9, autoplay: false };
    }
  }

  function saveSettings(s) {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...settings(), ...s })); } catch {}
    if ("voiceURI" in s) pickVoice();
  }

  // Glossary entries contain helper notation that shouldn't be read aloud.
  function clean(text) {
    return String(text)
      .replace(/-{2,}/g, " ")
      .replace(/\s*\/\s*/g, ", ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function hasFinnishVoice() {
    return !!voice;
  }

  function say(text, opts = {}) {
    if (!opts.keepChain) playId++;
    if (!supported()) {
      if (typeof toast === "function") toast("This browser can't read text aloud.");
      return;
    }
    const synth = window.speechSynthesis;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(clean(text));
    u.lang = "fi-FI";
    if (voice) u.voice = voice;
    u.rate = opts.rate || settings().rate;
    if (opts.onend) u.onend = opts.onend;
    synth.speak(u);
    if (!voice && !warned && typeof toast === "function") {
      warned = true;
      toast("No Finnish voice found on this device, so it may sound off. See Progress → Voice for help.", 6000);
    }
  }

  // Read several lines one after another (used by "Play all" in dialogues).
  function sayAll(texts, onLine) {
    const myId = ++playId;
    let i = 0;
    const next = () => {
      if (myId !== playId) return; // stopped, or something else started talking
      if (i >= texts.length) { onLine && onLine(-1); return; }
      onLine && onLine(i);
      const t = texts[i++];
      say(t, { keepChain: true, onend: () => setTimeout(next, 350) });
    };
    next();
  }

  function stop() {
    playId++;
    if (supported()) window.speechSynthesis.cancel();
  }

  return { supported, hasFinnishVoice, say, sayAll, stop, settings, saveSettings, finnishVoices, currentVoice, isOnlineVoice };
})();

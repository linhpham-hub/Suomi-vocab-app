// Lightweight Leitner-style spaced repetition + local progress storage.
// Everything lives in localStorage under one key, works offline. If the
// learner links their devices (js/sync.js), the same data is also saved to
// Supabase and merged per word (newest record wins).

const SRS = (() => {
  const STORAGE_KEY = "finVocabProgress.v1";

  // Box -> days until next review. Box 0 = brand new / just missed.
  const BOX_INTERVALS_DAYS = [0, 1, 3, 7, 16, 30];
  const MAX_BOX = BOX_INTERVALS_DAYS.length - 1;

  const listeners = [];

  function loadAll() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      return JSON.parse(raw) || {};
    } catch (e) {
      console.warn("SRS: could not read progress, starting fresh.", e);
      return {};
    }
  }

  function saveAll(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn("SRS: could not save progress.", e);
    }
  }

  let cache = loadAll();

  function emptyRecord() {
    return { box: 0, due: 0, seen: 0, correct: 0, wrong: 0, lastResult: null, u: 0 };
  }

  function get(id) {
    return { ...emptyRecord(), ...(cache[id] || {}) };
  }

  function isDue(id, now = Date.now()) {
    const rec = cache[id];
    if (!rec) return true; // never studied = due
    return rec.due <= now;
  }

  // result: true (correct), false (wrong) or "half" (almost -- e.g. right
  // word but missing the dots on ä/ö). "half" keeps the streak where it is:
  // no step up, no reset.
  function grade(id, result) {
    const rec = get(id);
    rec.seen += 1;
    rec.u = Date.now();
    if (result === true) {
      rec.correct += 1;
      rec.box = Math.min(MAX_BOX, rec.box + 1);
    } else if (result === "half") {
      rec.correct += 0.5;
    } else {
      rec.wrong += 1;
      rec.box = 0;
    }
    rec.lastResult = result;
    rec.due = result === "half" ? Date.now() : Date.now() + BOX_INTERVALS_DAYS[rec.box] * 86400000;

    cache[id] = rec;
    saveAll(cache);
    listeners.forEach((fn) => {
      try { fn(id, rec); } catch (e) { console.warn(e); }
    });
    return rec;
  }

  // Learner-facing level for one word:
  //   new       never studied
  //   focus     studied, but the streak is at 0 (last answer was wrong)
  //   growing   1-2 right in a row
  //   almost    3-4 right in a row
  //   mastered  5 right in a row
  function level(id) {
    const rec = cache[id];
    if (!rec || !rec.seen) return "new";
    if (rec.box >= MAX_BOX) return "mastered";
    if (rec.box >= 3) return "almost";
    if (rec.box >= 1) return "growing";
    return "focus";
  }

  function statsForIds(ids) {
    let newCount = 0, learning = 0, mastered = 0;
    for (const id of ids) {
      const lv = level(id);
      if (lv === "new") newCount++;
      else if (lv === "mastered") mastered++;
      else learning++;
    }
    return { total: ids.length, new: newCount, learning, mastered };
  }

  function dueCount(ids, now = Date.now()) {
    let n = 0;
    for (const id of ids) if (isDue(id, now)) n++;
    return n;
  }

  function resetAll() {
    cache = {};
    saveAll(cache);
  }

  function exportAll() {
    return JSON.parse(JSON.stringify(cache));
  }

  // Merge progress from another device: for each word keep whichever record
  // was updated most recently (falls back to "studied more times").
  function mergeIn(remote) {
    if (!remote || typeof remote !== "object") return 0;
    let changed = 0;
    for (const [id, r] of Object.entries(remote)) {
      if (!r || typeof r !== "object") continue;
      const l = cache[id];
      const rNewer = !l || (r.u || 0) > (l.u || 0) || (!(r.u || l.u) && (r.seen || 0) > (l.seen || 0));
      if (rNewer) {
        cache[id] = { ...emptyRecord(), ...r };
        changed++;
      }
    }
    if (changed) saveAll(cache);
    return changed;
  }

  function onChange(fn) {
    listeners.push(fn);
  }

  return { get, isDue, grade, level, statsForIds, dueCount, resetAll, exportAll, mergeIn, onChange, MAX_BOX };
})();

// Lightweight Leitner-style spaced repetition + local progress storage.
// Everything lives in localStorage under one key -- no backend, works offline.

const SRS = (() => {
  const STORAGE_KEY = "finVocabProgress.v1";

  // Box -> days until next review. Box 0 = brand new / just missed.
  const BOX_INTERVALS_DAYS = [0, 1, 3, 7, 16, 30];
  const MAX_BOX = BOX_INTERVALS_DAYS.length - 1;

  function loadAll() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      return JSON.parse(raw);
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

  function get(id) {
    return (
      cache[id] || {
        box: 0,
        due: 0, // epoch ms; 0 == due now
        seen: 0,
        correct: 0,
        lastResult: null,
      }
    );
  }

  function isDue(id, now = Date.now()) {
    const rec = cache[id];
    if (!rec) return true; // never studied = due
    return rec.due <= now;
  }

  function grade(id, correct) {
    const rec = { ...get(id) };
    rec.seen += 1;
    if (correct) rec.correct += 1;
    rec.lastResult = correct;

    if (correct) {
      rec.box = Math.min(MAX_BOX, rec.box + 1);
    } else {
      rec.box = 0;
    }

    const days = BOX_INTERVALS_DAYS[rec.box];
    rec.due = Date.now() + days * 24 * 60 * 60 * 1000;

    cache[id] = rec;
    saveAll(cache);
    return rec;
  }

  function statsForIds(ids) {
    let newCount = 0,
      learning = 0,
      mastered = 0;
    for (const id of ids) {
      const rec = cache[id];
      if (!rec || rec.seen === 0) newCount++;
      else if (rec.box >= MAX_BOX) mastered++;
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

  return { get, isDue, grade, statsForIds, dueCount, resetAll, MAX_BOX };
})();

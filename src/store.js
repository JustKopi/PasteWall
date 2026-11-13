// Rejtvények tárolása a tanár böngészőjében (localStorage).
const KEY = 'pastewall.puzzles.v1';

export function listPuzzles() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
}
export function getPuzzle(id) {
  return listPuzzles().find((p) => p.id === id) || null;
}
export function savePuzzle(doc) {
  const all = listPuzzles().filter((p) => p.id !== doc.id);
  all.unshift({ ...doc, updatedAt: Date.now() });
  localStorage.setItem(KEY, JSON.stringify(all));
  return doc;
}
export function deletePuzzle(id) {
  localStorage.setItem(KEY, JSON.stringify(listPuzzles().filter((p) => p.id !== id)));
}
export function newId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

// Minijátékok (tevékenységek) tárolása.
const AKEY = 'pastewall.activities.v1';
export function listActivities() {
  try { return JSON.parse(localStorage.getItem(AKEY) || '[]'); } catch { return []; }
}
export function getActivity(id) {
  return listActivities().find((a) => a.id === id) || null;
}
export function saveActivity(doc) {
  const all = listActivities().filter((a) => a.id !== doc.id);
  all.unshift({ ...doc, updatedAt: Date.now() });
  try {
    localStorage.setItem(AKEY, JSON.stringify(all));
  } catch {
    throw new Error('Megtelt a böngésző tárhelye (túl sok vagy túl nagy kép). Törölj régi játékokat, vagy használj kevesebb képet.');
  }
  return doc;
}
export function deleteActivity(id) {
  localStorage.setItem(AKEY, JSON.stringify(listActivities().filter((a) => a.id !== id)));
}

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
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function newRoomCode() {
  let s = '';
  const buf = crypto.getRandomValues(new Uint32Array(6));
  for (const n of buf) s += CODE_CHARS[n % CODE_CHARS.length];
  return s;
}

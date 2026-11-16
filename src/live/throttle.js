/** Gépelés-továbbítás ritkítása (ms): 100 diáknál is kezelhető forgalom. */
export const TYPING_MS = 400;

/**
 * Ritkító: legfeljebb `ms`-onként egyszer hívja `fn`-t, mindig a legutolsó argumentumokkal
 * (a végén maradt hívás is lefut, így a legfrissebb állapot mindig kimegy).
 * @template {any[]} A
 * @param {(...args: A) => void} fn
 * @param {number} ms
 */
export function throttle(fn, ms) {
  let last = -Infinity; // az első hívás azonnal kimegy
  let timer = null;
  let args = null;
  const run = () => {
    timer = null;
    last = Date.now();
    const a = args;
    args = null;
    fn(...a);
  };
  /** @param {A} a */
  const t = (...a) => {
    args = a;
    if (timer) return;
    const wait = last + ms - Date.now();
    if (wait <= 0) run();
    else timer = setTimeout(run, wait);
  };
  /** A függőben lévő hívás eldobása. */
  t.cancel = () => { clearTimeout(timer); timer = null; args = null; };
  return t;
}

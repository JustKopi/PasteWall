import { toast } from './dom.js';

/**
 * Csatlakozási értesítések összevonása: sok egyszerre belépő diáknál
 * egyetlen értesítés jelenik meg („Anna, Bence és még 12 diák csatlakozott”).
 * @param {() => number} count  az aktuális létszám
 */
export function joinNotifier(count, waitMs = 1200) {
  let names = [];
  let timer = null;
  const flush = () => {
    timer = null;
    if (!names.length) return;
    const shown = names.slice(0, 2).join(', ');
    const rest = names.length - 2;
    const who = names.length === 1 ? names[0] : rest > 0 ? `${shown} és még ${rest} diák` : names.join(' és ');
    toast(`👋 ${who} csatlakozott (${count()} fő)`, 'ok');
    names = [];
  };
  return {
    add(name) {
      names.push(name);
      if (!timer) timer = setTimeout(flush, waitMs);
    },
    dispose() { clearTimeout(timer); timer = null; names = []; },
  };
}

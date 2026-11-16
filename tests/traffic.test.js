import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { throttle } from '../src/live/throttle.js';
import { HostGame } from '../src/live/game.js';
import { generateCrossword, parseEntries } from '../src/crossword/generator.js';

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(0); });
afterEach(() => { vi.useRealTimers(); });

describe('throttle', () => {
  it('sok hívásból ritkán küld, és a legutolsó érték mindig kimegy', () => {
    const calls = [];
    const t = throttle((x) => calls.push(x), 400);
    for (let i = 1; i <= 10; i++) { t(i); vi.advanceTimersByTime(50); } // 10 leütés 500 ms alatt
    vi.advanceTimersByTime(1000);
    expect(calls.length).toBeLessThanOrEqual(3);
    expect(calls.at(-1)).toBe(10);
  });

  it('cancel eldobja a függő hívást', () => {
    const calls = [];
    const t = throttle((x) => calls.push(x), 400);
    t(1); t(2); t.cancel();
    vi.advanceTimersByTime(1000);
    expect(calls).toEqual([1]);
  });
});

describe('állapotküldés összevonása', () => {
  it('100 belépés után csak néhány állapotüzenet megy ki', () => {
    const sent = [];
    const entries = parseEntries('Pest - város\nKerek - kör\nTavasz - évszak\nŐsz - évszak\nFöld - bolygó\nIgen - nem ellentéte\nAlma - gyümölcs\nHold - éjjel\nToll - írószer\nFüzet - jegyzet');
    const { puzzle } = generateCrossword({ solutions: ['PETŐFI'], entries, seed: 5 });
    const g = new HostGame({ puzzle, title: 'T', mode: 'coop', coalesceMs: 250 }, (t, p) => sent.push([t, p]));
    for (let i = 0; i < 100; i++) { g.handle('hello', { id: `p${i}`, name: `Diák ${i}` }); vi.advanceTimersByTime(5); }
    vi.advanceTimersByTime(300);
    const states = sent.filter(([t]) => t === 'state');
    expect(states.length).toBeLessThanOrEqual(3);
    expect(states.at(-1)[1].players).toHaveLength(100);
    g.dispose();
  });
});

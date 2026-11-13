import { describe, it, expect } from 'vitest';
import { generateFreeform, cellMap } from '../src/crossword/freeform.js';
import { publicView, parseEntries } from '../src/crossword/generator.js';
import fs from 'fs';

const words = parseEntries(`Duna - folyó
Kurzor - villogó jel
Budapest - főváros
Balaton - tó
Tábla - tanár ír rá
Fájl - dokumentum
Bájt - 8 bit
Jelszó - titkos
Kábel - vezeték
Sakk - táblajáték
Mentés - Ctrl+S
Alma - gyümölcs
Monitor - kijelző
Internet - hálózat
Oroszlán - állatok királya
Mikrofon - hang
Ikon - kis kép
Kréta - írunk vele
Program - utasítások
Hangya - rovar`);

function validate(pz) {
  const grid = new Map();
  for (const e of pz.rows) {
    const [dr, dc] = e.dir === 'across' ? [0, 1] : [1, 0];
    for (let i = 0; i < e.length; i++) {
      const k = `${e.r + dr * i},${e.c + dc * i}`;
      if (grid.has(k)) expect(grid.get(k)).toBe(e.tokens[i]); // a keresztezés betűi egyeznek
      grid.set(k, e.tokens[i]);
      expect(e.r + dr * i).toBeLessThan(pz.height);
      expect(e.c + dc * i).toBeLessThan(pz.width);
    }
    // a szó előtt és után üres mező
    expect(grid.has(`${e.r - dr},${e.c - dc}`) && pz.rows.some((o) => o !== e && o.dir === e.dir && o.r === e.r - dr && o.c === e.c - dc)).toBe(false);
  }
  // minden mezőt legfeljebb 2 szó fed, és egymásba ütköző párhuzamos szavak nincsenek
  for (const [, list] of cellMap(pz)) expect(list.length).toBeLessThanOrEqual(2);
  return grid;
}

describe('generateFreeform', () => {
  it('vegyes irányú, összefüggő, számozott rejtvényt rak ki', () => {
    const res = generateFreeform({ entries: words, seed: 11, maxWords: 14 });
    expect(res.ok).toBe(true);
    const pz = res.puzzle;
    expect(pz.rows.length).toBeGreaterThanOrEqual(10);
    expect(pz.rows.some((r) => r.dir === 'across')).toBe(true);
    expect(pz.rows.some((r) => r.dir === 'down')).toBe(true);
    validate(pz);
    // a számozás 1-től folyamatos
    const nums = [...new Set(pz.rows.map((r) => r.num))].sort((a, b) => a - b);
    expect(nums[0]).toBe(1);
    expect(nums[nums.length - 1]).toBe(nums.length);
  });

  it('a megfejtés betűi különböző, helyes mezőkön vannak', () => {
    const res = generateFreeform({ entries: words, solution: 'Tudás', seed: 5 });
    expect(res.ok, JSON.stringify(res.problems)).toBe(true);
    const grid = validate(res.puzzle);
    const band = res.puzzle.bands[0];
    expect(band.cells).toHaveLength(5);
    expect(new Set(band.cells.map((x) => `${x.r},${x.c}`)).size).toBe(5);
    band.cells.forEach((x, i) => expect(grid.get(`${x.r},${x.c}`)).toBe(band.tokens[i]));
  });

  it('jelzi, ha a megfejtéshez hiányzik betű', () => {
    const res = generateFreeform({ entries: words.slice(0, 4), solution: 'XYZ', attempts: 5 });
    expect(res.ok).toBe(false);
    expect(res.problems[0]).toMatch(/„X”/);
  });

  it('a nyilvános nézetben nincs megoldás', () => {
    const res = generateFreeform({ entries: words, solution: 'Tudás', seed: 2 });
    const pub = JSON.stringify(publicView(res.puzzle));
    expect(pub).not.toMatch(/tokens|answer|BUDAPEST|Tudás/);
  });
});

describe('megfejtés egy összefüggő sorban', () => {
  const big = parseEntries(fs.readFileSync(new URL('../rejtvenyek/nagy-tudasproba.txt', import.meta.url), 'utf8'));
  it('a megfejtés betűi egymás után, egy sorban/oszlopban, és mindegyiket keresztezi egy szó', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const res = generateFreeform({ entries: big, solution: 'Okos vagy', solutionMode: 'line', maxWords: 30, seed });
      expect(res.ok, JSON.stringify(res.problems)).toBe(true);
      const band = res.puzzle.bands[0];
      expect(band.line).toBe(true);
      const cells = band.cells;
      const sameRow = cells.every((x) => x.r === cells[0].r);
      const sameCol = cells.every((x) => x.c === cells[0].c);
      expect(sameRow || sameCol).toBe(true);
      cells.forEach((x, i) => {
        if (i) expect(sameRow ? x.c - cells[i - 1].c : x.r - cells[i - 1].r).toBe(1); // egymás után
      });
      const map = cellMap(res.puzzle);
      const grid = validate(res.puzzle);
      cells.forEach((x, i) => {
        expect(map.has(`${x.r},${x.c}`)).toBe(true); // minden betűjét keresztezi egy szó
        expect(grid.get(`${x.r},${x.c}`)).toBe(band.tokens[i]);
      });
      // a megfejtés nem szerepel kérdésként
      expect(res.puzzle.rows.some((r) => r.answer === 'Okos vagy')).toBe(false);
    }
  });
  it('jelzi, ha egy betűhöz nincs keresztező szó', () => {
    const res = generateFreeform({ entries: words.slice(0, 5), solution: 'QQQ', solutionMode: 'line', attempts: 5 });
    expect(res.ok).toBe(false);
    expect(res.problems[0]).toMatch(/keresztezni/);
  });
});

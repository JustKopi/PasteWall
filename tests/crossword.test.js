import { describe, it, expect } from 'vitest';
import { tokenize } from '../src/crossword/hu.js';
import { generateCrossword, parseEntries, publicView } from '../src/crossword/generator.js';

describe('tokenize', () => {
  it('kettős betűk egy cellában', () => {
    expect(tokenize('Szegény')).toEqual(['SZ', 'E', 'G', 'É', 'NY']);
    expect(tokenize('gyöngy')).toEqual(['GY', 'Ö', 'N', 'GY']);
    expect(tokenize('nyúl')).toEqual(['NY', 'Ú', 'L']);
    expect(tokenize('dzsungel')).toEqual(['DZS', 'U', 'N', 'G', 'E', 'L']);
    expect(tokenize('asszony')).toEqual(['A', 'SZ', 'SZ', 'O', 'NY']);
    expect(tokenize('hosszú')).toEqual(['H', 'O', 'SZ', 'SZ', 'Ú']);
  });
  it('kézi szétválasztás és kikapcsolás', () => {
    expect(tokenize('ház|szám')).toEqual(['H', 'Á', 'Z', 'SZ', 'Á', 'M']);
    expect(tokenize('Szép', { digraphs: false })).toEqual(['S', 'Z', 'É', 'P']);
    expect(tokenize('Arany János')).toEqual(['A', 'R', 'A', 'NY', 'J', 'Á', 'N', 'O', 'S']);
  });
});

const words = parseEntries(`
Pest - Budával egyesült város
Kerek - Ilyen a kör
Tavasz - Évszak a tél után
Ősz - Hullanak a levelek
Föld - Bolygónk
Igen - A nem ellentéte
Alma - Piros gyümölcs
Csiga - Házát hordja a hátán
Hold - Éjjel világít az égen
Duna - Magyarország leghosszabb folyója
Tisza - Szőke folyó
Balaton - A magyar tenger
Kréta - Táblára írunk vele
Iskola - Ide járnak a diákok
Toll - Írószer
Füzet - Ebbe jegyzetelünk
`);

function check(puzzle) {
  for (const b of puzzle.bands) {
    for (let i = 0; i < b.length; i++) {
      const r = b.rowStart + i;
      const row = puzzle.rows[r];
      expect(b.col).toBeGreaterThanOrEqual(row.start);
      expect(row.tokens[b.col - row.start]).toBe(b.tokens[i]);
    }
  }
  const used = puzzle.rows.map((r) => r.answer);
  expect(new Set(used).size).toBe(used.length);
  for (const r of puzzle.rows) {
    expect(r.start).toBeGreaterThanOrEqual(0);
    expect(r.start + r.length).toBeLessThanOrEqual(puzzle.width);
  }
}

describe('generateCrossword', () => {
  it('egy fő sáv: PETŐFI', () => {
    const res = generateCrossword({ solutions: ['Petőfi'], entries: words, seed: 1 });
    expect(res.ok, JSON.stringify(res.problems)).toBe(true);
    expect(res.puzzle.height).toBe(6);
    check(res.puzzle);
  });
  it('két fő sáv', () => {
    const many = parseEntries(`
alma
körte
barack
szilva
málna
eper
cseresznye
banán
narancs
citrom
dinnye
ananász
mandarin
datolya
füge
kivi
mangó
papaja
ribizli
egres
áfonya
szeder
paradicsom
paprika
uborka
retek
saláta
káposzta
karfiol
brokkoli
spenót
sárgarépa
petrezselyem
zeller
hagyma
fokhagyma
krumpli
tök
cukkini
padlizsán
`);
    const res = generateCrossword({ solutions: ['KERT', 'ALMA'], entries: many, seed: 3 });
    expect(res.ok, JSON.stringify(res.problems)).toBe(true);
    expect(res.puzzle.bands).toHaveLength(2);
    check(res.puzzle);
    const par = generateCrossword({ solutions: ['KAR', 'ARA'], entries: many, seed: 3, layout: 'parallel' });
    expect(par.ok, JSON.stringify(par.problems)).toBe(true);
    expect(par.puzzle.layout).toBe('parallel');
    expect(par.puzzle.bands[1].col).toBeGreaterThan(par.puzzle.bands[0].col);
    check(par.puzzle);
    const st = generateCrossword({ solutions: ['KERT', 'ALMA'], entries: many, seed: 3, layout: 'stacked' });
    expect(st.ok).toBe(true);
    expect(st.puzzle.height).toBe(8);
    expect(st.puzzle.bands[1].rowStart).toBe(4);
    check(st.puzzle);
  });
  it('hiányzó betű jelzése', () => {
    const res = generateCrossword({ solutions: ['XXX'], entries: words });
    expect(res.ok).toBe(false);
    expect(res.problems[0]).toMatch(/„X”/);
  });
  it('kevés szó jelzése', () => {
    const res = generateCrossword({ solutions: ['Balatonfüred'], entries: words.slice(0, 3) });
    expect(res.ok).toBe(false);
    expect(res.problems[0]).toMatch(/legalább/);
  });
  it('a nyilvános nézetben nincs megoldás', () => {
    const res = generateCrossword({ solutions: ['Petőfi'], entries: words, seed: 2 });
    const pub = JSON.stringify(publicView(res.puzzle));
    expect(pub).not.toMatch(/tokens|answer|PETŐFI|Petőfi/);
  });
});

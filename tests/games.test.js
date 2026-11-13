import { describe, it, expect } from 'vitest';
import { parsePairs, parseTrueFalse, parseGroups, parseMcq, validate, parseContent, buildWordsearch, buildMaze, normalizeAnswer, maxScore, prepareRound } from '../src/games/content.js';
import { MiniHost, splitAssets } from '../src/live/minihost.js';

describe('tartalom-feldolgozás', () => {
  it('párok, igaz/hamis, csoportok, feleletválasztós', () => {
    expect(parsePairs('Budapest - főváros\nDuna: folyó')).toEqual([{ a: 'Budapest', b: 'főváros' }, { a: 'Duna', b: 'folyó' }]);
    expect(parseTrueFalse('A Föld kerek - igaz\nA bálna hal - HAMIS\nvalami')).toEqual([
      { text: 'A Föld kerek', value: true }, { text: 'A bálna hal', value: false }, { text: 'valami', value: null }]);
    expect(parseGroups('Emlős: bálna, kutya\nMadár: sas')).toEqual([{ name: 'Emlős', items: ['bálna', 'kutya'] }, { name: 'Madár', items: ['sas'] }]);
    expect(parseMcq('Főváros? | Budapest | Pécs | Győr')).toEqual([{ q: 'Főváros?', correct: 'Budapest', wrong: ['Pécs', 'Győr'] }]);
  });
  it('hibajelzések', () => {
    expect(validate('truefalse', parseContent('truefalse', { text: 'x\ny - igaz' }))[0]).toMatch(/igaz vagy hamis/);
    expect(validate('sorting', parseContent('groups', { text: 'A: x' }))[0]).toMatch(/2 csoport/);
    expect(validate('maze', parseContent('mcq', { text: 'Kérdés | jó' }))[0]).toMatch(/rossz/);
    expect(validate('type', parseContent('pairs', { text: 'Budapest - főváros\nDuna - folyó' }))).toEqual([]);
  });
  it('válasz normalizálás', () => {
    expect(normalizeAnswer('  budapest! ')).toBe('BUDAPEST');
    expect(normalizeAnswer('Arany  János')).toBe('ARANY JÁNOS');
  });
});

describe('szókereső', () => {
  it('minden szó benne van a rácsban a megadott helyen', () => {
    const words = ['Budapest', 'Duna', 'Tisza', 'Balaton', 'Kékes', 'Mátra', 'Szeged', 'Pécs'];
    const ws = buildWordsearch(words, 3);
    expect(ws).not.toBeNull();
    expect(ws.words).toHaveLength(words.length);
    for (const w of ws.words) {
      const got = Array.from({ length: w.len }, (_, i) => ws.grid[w.r + w.dr * i][w.c + w.dc * i]).join('');
      expect(got).toBe(w.letters);
    }
    expect(ws.grid.flat().every((x) => x && x.length === 1)).toBe(true);
  });
});

describe('labirintus', () => {
  it('a kezdőpontból minden válaszmező elérhető', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const m = buildMaze(seed);
      const seen = new Set([`${m.start.r},${m.start.c}`]);
      const q = [m.start];
      while (q.length) {
        const { r, c } = q.shift();
        for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const k = `${r + dr},${c + dc}`;
          if (m.cells[r + dr]?.[c + dc] === 0 && !seen.has(k)) { seen.add(k); q.push({ r: r + dr, c: c + dc }); }
        }
      }
      for (const z of m.zones) expect(seen.has(`${z.r},${z.c}`)).toBe(true);
    }
  });
});

describe('MiniHost', () => {
  const content = prepareRound('type', parseContent('pairs', { text: 'Budapest - főváros\nDuna - folyó\nTisza - folyó 2' }), 1);
  function setup() {
    const sent = [];
    const g = new MiniHost({ activity: { id: 'x', game: 'type', title: 'T', content } }, (t, p) => sent.push([t, p]));
    g.handle('hello', { id: 'a', name: 'Anna' });
    g.handle('hello', { id: 'b', name: 'Bence' });
    return { g, sent };
  }
  const last = (sent, t) => [...sent].reverse().find(([x]) => x === t)?.[1];
  it('csatlakozáskor tartalmat küld, és a pontot a maximumra korlátozza', () => {
    const { g, sent } = setup();
    expect(last(sent, 'content').content.pairs).toHaveLength(3);
    g.start();
    g.handle('progress', { id: 'a', score: 9999, correct: 3, total: 3 });
    expect(g.players.get('a').score).toBe(maxScore('type', content));
  });
  it('ha mindenki végzett, vége a játéknak; új játék megtartja a játékosokat', () => {
    const { g, sent } = setup();
    g.start();
    g.handle('progress', { id: 'a', score: 20, correct: 2, total: 3, done: true });
    expect(g.status).toBe('playing');
    g.handle('progress', { id: 'b', score: 10, correct: 1, total: 3, done: true });
    expect(g.status).toBe('ended');
    expect(g.results()[0].name).toBe('Anna');
    g.load({ id: 'y', game: 'truefalse', title: 'Új', content: { statements: [{ text: 'x', value: true }] } });
    const st = last(sent, 'state');
    expect(st.round).toBe(2);
    expect(st.status).toBe('lobby');
    expect(st.players.map((p) => p.score)).toEqual([0, 0]);
  });
  it('időkorlát lejártakor vége', () => {
    const sent = [];
    const g = new MiniHost({ activity: { id: 'x', game: 'type', title: 'T', content, timeLimit: 30 } }, (t, p) => sent.push([t, p]));
    let t = 1000;
    g.now = () => t;
    g.start();
    t += 31000;
    g.tick();
    expect(g.status).toBe('ended');
  });
  it('a képeket külön üzenetben küldi', () => {
    const { content: c, assets } = splitAssets({ questions: [{ image: 'data:image/jpeg;base64,AAA', q: 'x' }] });
    expect(c.questions[0].image).toBe('asset:0');
    expect(assets['asset:0']).toMatch(/^data:image/);
  });
});

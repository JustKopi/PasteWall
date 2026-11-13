import { describe, it, expect } from 'vitest';
import { parsePairs, parseTrueFalse, parseGroups, parseMcq, validate, parseContent, buildWordsearch, buildMaze, normalizeAnswer, maxScore, prepareRound } from '../src/games/content.js';
import { MiniHost, splitAssets } from '../src/live/minihost.js';
import { createSession } from '../src/games/server.js';

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


// ---------------------------------------------------------------- szerveroldali játékvezetés
const pairsText = 'Budapest - Magyarország fővárosa\nDuna - Budapesten átfolyó folyó\nTisza - A szőke folyó\nKékes - Legmagasabb csúcs';
const C = {
  pairs: parseContent('pairs', { text: pairsText }),
  tf: parseContent('truefalse', { text: 'A Föld kerek - igaz\nA bálna hal - hamis\nEgy hét 7 nap - igaz' }),
  groups: parseContent('groups', { text: 'Emlős: bálna, kutya\nMadár: sas, veréb' }),
  sent: parseContent('sentences', { text: 'A Duna Budapesten folyik.\nA bálna emlős.' }),
  mcq: parseContent('mcq', { text: 'Főváros? | Budapest | Pécs | Győr\n2+3? | 5 | 6' }),
};
const answers = C.pairs.pairs.map((p) => p.a.toUpperCase());
const leaks = (view) => JSON.stringify(view);

describe('szerveroldali játékvezetés: a válasz nem kerül ki, a pontot a tanári gép számolja', () => {
  it('Írd be: a nézetben nincs válasz; tökéletes játék = max pont', () => {
    const s = createSession('type', C.pairs, 1);
    let v = s.start(0).view;
    const byPrompt = Object.fromEntries(C.pairs.pairs.map((p) => [p.b, p.a]));
    while (v) {
      expect(leaks(v)).not.toMatch(new RegExp(byPrompt[v.prompt]));
      v = s.act('answer', { text: byPrompt[v.prompt].toLowerCase() + '!' }).view;
    }
    expect(s.s).toMatchObject({ score: 40, correct: 4, done: true });
    expect(s.act('answer', { text: 'x' })).toEqual({ done: true }); // vége után nem lehet pontot szerezni
  });

  it('Igaz/hamis: a késői válasz nem ér pontot (a tanári gép méri az időt)', () => {
    const s = createSession('truefalse', C.tf, 2);
    const truth = Object.fromEntries(C.tf.statements.map((x) => [x.text, x.value]));
    let v = s.start(0).view;
    expect(leaks(v)).not.toMatch(/value|true|false/);
    let r = s.act('answer', { value: truth[v.text] }, 1000);
    expect(r.ok).toBe(true);
    r = s.act('answer', { value: truth[r.view.text] }, 1000 + 60000);
    expect(r).toMatchObject({ ok: false, late: true });
  });

  it('Párkereső: a párosítás titkos, és nem lehet ugyanazt a párt kétszer beváltani', () => {
    const s = createSession('memory', C.pairs, 3);
    const { tiles } = s.start(0).view;
    expect(leaks(tiles)).not.toMatch(/"k"/);
    const pairOf = (t) => C.pairs.pairs.findIndex((p) => p.a === t.text || p.b === t.text);
    const a = tiles[0];
    const b = tiles.find((t) => t !== a && pairOf(t) === pairOf(a));
    expect(s.act('flip2', { a: a.id, b: b.id }).ok).toBe(true);
    expect(s.act('flip2', { a: a.id, b: b.id }).error).toBe(true);
    expect(s.s.score).toBe(10);
  });

  it('Akasztófa: a rejtett betűk nem kerülnek ki', () => {
    const s = createSession('hangman', C.pairs, 4);
    const v = s.start(0).view;
    expect(v.pattern.every((x) => x === null)).toBe(true);
    const word = C.pairs.pairs.find((p) => p.b === v.clue).a.toUpperCase();
    for (const L of new Set(word)) s.act('letter', { letter: L });
    expect(s.s.correct).toBe(1);
    expect(s.act('next').view).toBeTruthy();
  });

  it('Szókereső: a szavak helye titkos; csak a pontos kijelölés ér pontot', () => {
    const content = prepareRound('wordsearch', C.pairs, 5);
    const s = createSession('wordsearch', content, 5);
    const v = s.start(0).view;
    expect(leaks(v)).not.toMatch(/"dr"|"dc"|"r":/);
    const w = content.wordsearch.words[0];
    expect(s.act('select', { r1: 0, c1: 0, r2: 0, c2: 0 }).ok).toBe(false);
    const r = s.act('select', { r1: w.r + w.dr * (w.len - 1), c1: w.c + w.dc * (w.len - 1), r2: w.r, c2: w.c }); // visszafelé is jó
    expect(r.ok).toBe(true);
    expect(s.act('select', { r1: w.r, c1: w.c, r2: w.r + w.dr * (w.len - 1), c2: w.c + w.dc * (w.len - 1) }).ok).toBe(false); // kétszer nem
  });

  it('Csoportosító, szómágnes, labirintus, pár vagy nem', () => {
    const so = createSession('sorting', C.groups, 6);
    let v = so.start(0).view;
    const groupOf = (t) => C.groups.groups.findIndex((g) => g.items.includes(t));
    while (v) v = so.act('answer', { group: groupOf(v.item) }).view;
    expect(so.s.score).toBe(40);

    const mg = createSession('magnets', C.sent, 7);
    v = mg.start(0).view;
    while (v) {
      const target = C.sent.sentences.find((x) => x.split(' ').length === v.words.length && v.words.every((w) => x.split(' ').includes(w.w))).split(' ');
      const used = new Set();
      const ids = target.map((w) => { const x = v.words.find((y) => y.w === w && !used.has(y.id)); used.add(x.id); return x.id; });
      v = mg.act('submit', { ids }).view;
    }
    expect(mg.s.score).toBe(20);

    const mz = createSession('maze', C.mcq, 8);
    v = mz.start(0).view;
    expect(leaks(v)).not.toMatch(/"ok"/);
    while (v) {
      const right = C.mcq.questions.find((q) => q.q === v.q).correct;
      v = mz.act('zone', { k: v.options.indexOf(right) }).view;
    }
    expect(mz.s.score).toBe(20);
    expect(mz.act('zone', { k: 0 })).toEqual({ done: true });

    const pn = createSession('pairornot', C.pairs, 9);
    v = pn.start(0).view;
    while (v) {
      const match = C.pairs.pairs.some((p) => p.a === v.a && p.b === v.b);
      v = pn.act('answer', { match }).view;
    }
    expect(pn.s.score).toBe(80);
  });

  it('Képrejtő: a pontot a tanári gép órája alapján számolja, a válaszlehetőségek csak jelzés után', () => {
    const content = { questions: [{ q: 'Mi ez?', correct: 'Elefánt', wrong: ['Ló', 'Zebra'], image: 'asset:0' }] };
    const s = createSession('imagequiz', content, 10);
    const v = s.start(1000).view;
    expect(leaks(v)).not.toMatch(/Elefánt|Ló|Zebra/);
    const { options } = s.act('buzz', {}, 1000 + 650 * 23); // szinte minden felfedve
    const r = s.act('choose', { k: options.indexOf('Elefánt') }, 99999999);
    expect(r.ok).toBe(true);
    expect(r.pts).toBe(10); // nem kapja meg a korai bónuszt, akármikor küldi a választ
  });

  it('Ábracímkéző: a helyes párosítás titkos', () => {
    const content = { image: 'asset:0', labels: [{ text: 'virág', x: 10, y: 10 }, { text: 'gyökér', x: 50, y: 90 }] };
    const s = createSession('diagram', content, 11);
    const v = s.start(0).view;
    const pinFor = (text) => v.pins.find((p) => content.labels.find((l) => l.text === text).y === p.y).id;
    const assign = Object.fromEntries(v.labels.map((l) => [pinFor(l.text), l.id]));
    expect(s.act('submit', { assign }).results).toEqual({ 0: true, 1: true });
    expect(s.s.score).toBe(20);
  });
});

describe('MiniHost', () => {
  function setup() {
    const sent = [];
    const priv = [];
    const g = new MiniHost({ activity: { id: 'x', game: 'type', title: 'T', content: prepareRound('type', C.pairs, 1) } },
      (t, p) => sent.push([t, p]), (id, t, p) => priv.push([id, t, p]));
    g.handle('hello', { id: 'a', name: 'Anna' });
    g.handle('hello', { id: 'b', name: 'Bence' });
    return { g, sent, priv };
  }
  it('a nyilvános üzenetekben soha nincs benne a válasz', () => {
    const { g, sent } = setup();
    g.start();
    g.handle('mg', { id: 'a', rid: 1, op: 'start' });
    for (const [, p] of sent) for (const a of answers) expect(JSON.stringify(p).toUpperCase()).not.toContain(a);
  });
  it('a kérdést és az eredményt csak az adott diák kapja; ismételt kérés nem számít kétszer', () => {
    const { g, priv } = setup();
    g.start();
    g.handle('mg', { id: 'a', rid: 1, op: 'start' });
    const [to, t, p] = priv.at(-1);
    expect([to, t]).toEqual(['a', 'mgr']);
    const right = C.pairs.pairs.find((x) => x.b === p.view.prompt).a;
    g.handle('mg', { id: 'a', rid: 2, op: 'answer', payload: { text: right } });
    g.handle('mg', { id: 'a', rid: 2, op: 'answer', payload: { text: right } }); // újraküldés
    expect(g.players.get('a').score).toBe(10);
  });
  it('ha mindenki végzett, vége; új játék megtartja a játékosokat', () => {
    const { g, sent } = setup();
    g.start();
    for (const id of ['a', 'b']) {
      g.handle('mg', { id, rid: 1, op: 'start' });
      for (let k = 0; k < 4; k++) g.handle('mg', { id, rid: 2 + k, op: 'skip' });
    }
    expect(g.status).toBe('ended');
    g.load({ id: 'y', game: 'truefalse', title: 'Új', content: C.tf });
    const st = [...sent].reverse().find(([x]) => x === 'state')[1];
    expect(st.round).toBe(2);
    expect(st.players.map((p) => p.score)).toEqual([0, 0]);
  });
  it('a képeket külön üzenetben küldi', () => {
    const { content: c, assets } = splitAssets({ questions: [{ image: 'data:image/jpeg;base64,AAA', q: 'x' }] });
    expect(c.questions[0].image).toBe('asset:0');
    expect(assets['asset:0']).toMatch(/^data:image/);
  });
});

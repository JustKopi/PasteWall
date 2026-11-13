// Minijáték-tartalmak feldolgozása és ellenőrzése, valamint a körhöz szükséges előkészítés.

import { GAMES } from './registry.js';

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(arr, rnd = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const lines = (text) => String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

/** „VÁLASZ - kérdés” sorok. */
export function parsePairs(text) {
  return lines(text).map((l) => {
    const m = l.match(/^(.+?)\s*(?:\t|;| - | – |:)\s*(.+)$/);
    return m ? { a: m[1].trim(), b: m[2].trim() } : { a: l, b: '' };
  });
}

/** „állítás - igaz/hamis” sorok. */
export function parseTrueFalse(text) {
  return lines(text).map((l) => {
    const m = l.match(/^(.+?)\s*(?:-|–|\||;)\s*(igaz|hamis|i|h|true|false|✔|✘)\s*$/i);
    if (!m) return { text: l, value: null };
    const v = m[2].toLowerCase();
    return { text: m[1].trim(), value: ['igaz', 'i', 'true', '✔'].includes(v) };
  });
}

/** „Csoport: elem, elem” sorok. */
export function parseGroups(text) {
  return lines(text).map((l) => {
    const [name, rest = ''] = l.split(/:(.*)/s);
    return { name: name.trim(), items: rest.split(/[,;]/).map((x) => x.trim()).filter(Boolean) };
  }).filter((g) => g.name);
}

export function parseSentences(text) {
  return lines(text);
}

/** „kérdés | HELYES | rossz | rossz” sorok. */
export function parseMcq(text) {
  return lines(text).map((l) => {
    const parts = l.split('|').map((x) => x.trim()).filter(Boolean);
    return { q: parts[0] || '', correct: parts[1] || '', wrong: parts.slice(2, 5) };
  });
}

/** A szerkesztőben tárolt nyers tartalomból a játék tartalma. */
export function parseContent(format, raw) {
  switch (format) {
    case 'pairs': return { pairs: parsePairs(raw.text) };
    case 'truefalse': return { statements: parseTrueFalse(raw.text) };
    case 'groups': return { groups: parseGroups(raw.text) };
    case 'sentences': return { sentences: parseSentences(raw.text) };
    case 'mcq': return { questions: parseMcq(raw.text) };
    case 'imagequiz': return { questions: (raw.items || []).map((it) => ({ image: it.image || null, ...parseMcq(it.text || '')[0] || { q: '', correct: '', wrong: [] } })) };
    case 'diagram': return { image: raw.image || null, labels: (raw.labels || []).filter((l) => l.text && l.x != null) };
    default: return {};
  }
}

/** Hibák listája (üres, ha minden rendben). */
export function validate(game, content) {
  const p = [];
  const fmt = GAMES[game]?.format;
  if (fmt === 'pairs') {
    const ok = content.pairs.filter((x) => x.a);
    if (ok.length < 2) p.push('Adj meg legalább 2 sort.');
    if (['memory', 'pairornot', 'type', 'hangman', 'spell'].includes(game) && ok.some((x) => !x.b)) p.push('Minden sorhoz kell kérdés vagy pár is („VÁLASZ - kérdés”).');
    if (game === 'wordsearch' && ok.some((x) => normalizeLetters(x.a).length > 14)) p.push('A szókeresőben legfeljebb 14 betűs szavak legyenek.');
    if (game === 'pairornot' && ok.length < 3) p.push('A „Pár vagy nem pár?” játékhoz legalább 3 sor kell.');
  }
  if (fmt === 'truefalse') {
    if (content.statements.length < 2) p.push('Adj meg legalább 2 állítást.');
    const bad = content.statements.filter((s) => s.value == null);
    if (bad.length) p.push(`Ezeknél nem derül ki, igaz vagy hamis: ${bad.slice(0, 3).map((s) => `„${s.text}”`).join(', ')}. Írd a végére: „- igaz” vagy „- hamis”.`);
  }
  if (fmt === 'groups') {
    if (content.groups.length < 2) p.push('Legalább 2 csoport kell.');
    if (content.groups.length > 4) p.push('Legfeljebb 4 csoport lehet.');
    if (content.groups.some((g) => !g.items.length)) p.push('Minden csoportban legyen legalább egy elem.');
  }
  if (fmt === 'sentences') {
    if (!content.sentences.length) p.push('Adj meg legalább egy mondatot.');
    if (content.sentences.some((s) => s.split(/\s+/).length < 2)) p.push('Minden mondat legalább 2 szóból álljon.');
  }
  if (fmt === 'mcq' || fmt === 'imagequiz') {
    if (!content.questions.length) p.push('Adj meg legalább egy kérdést.');
    if (content.questions.some((q) => !q.q || !q.correct || !q.wrong.length)) p.push('Minden kérdéshez kell: kérdés | HELYES | legalább egy rossz válasz.');
    if (fmt === 'imagequiz' && content.questions.some((q) => !q.image)) p.push('Minden kérdéshez tölts fel képet.');
    if (fmt === 'mcq' && content.questions.some((q) => q.wrong.length > 3)) p.push('Legfeljebb 4 válasz lehet.');
  }
  if (fmt === 'diagram') {
    if (!content.image) p.push('Tölts fel egy képet.');
    if (content.labels.length < 2) p.push('Helyezz el legalább 2 címkét a képen.');
  }
  return p;
}

// ---------- válaszok összevetése ----------
export function normalizeAnswer(s) {
  return String(s || '').toLocaleUpperCase('hu-HU').replace(/[.,!?;:"„”'()–-]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Csak betűk (szókeresőhöz, betűrakóhoz, akasztófához). */
export function normalizeLetters(s) {
  return [...String(s || '').toLocaleUpperCase('hu-HU')].filter((ch) => /\p{L}/u.test(ch));
}

// ---------- szókereső-rács ----------
const DIRS_EASY = [[0, 1], [1, 0], [1, 1], [-1, 1]];
const FILL = 'AAÁBCDEEÉFGGHIÍJKLLMNNOÓÖŐPRRSSTTUÚÜŰVZ';

export function buildWordsearch(words, seed = 1) {
  const rnd = mulberry32(seed);
  const list = words.map((w) => ({ display: w, letters: normalizeLetters(w) })).filter((w) => w.letters.length >= 2);
  const longest = Math.max(...list.map((w) => w.letters.length));
  const total = list.reduce((n, w) => n + w.letters.length, 0);
  let size = Math.max(longest, Math.ceil(Math.sqrt(total * 2.2)), 8);
  for (let tries = 0; tries < 40; tries++) {
    const grid = Array.from({ length: size }, () => Array(size).fill(''));
    const placed = [];
    let fail = false;
    for (const w of shuffle(list, rnd).sort((a, b) => b.letters.length - a.letters.length)) {
      let ok = false;
      for (let k = 0; k < 200 && !ok; k++) {
        const [dr, dc] = DIRS_EASY[Math.floor(rnd() * DIRS_EASY.length)];
        const L = w.letters.length;
        const r = Math.floor(rnd() * size);
        const c = Math.floor(rnd() * size);
        const r2 = r + dr * (L - 1);
        const c2 = c + dc * (L - 1);
        if (r2 < 0 || r2 >= size || c2 < 0 || c2 >= size) continue;
        let fits = true;
        for (let i = 0; i < L && fits; i++) {
          const g = grid[r + dr * i][c + dc * i];
          if (g && g !== w.letters[i]) fits = false;
        }
        if (!fits) continue;
        for (let i = 0; i < L; i++) grid[r + dr * i][c + dc * i] = w.letters[i];
        placed.push({ word: w.display, letters: w.letters.join(''), r, c, dr, dc, len: L });
        ok = true;
      }
      if (!ok) { fail = true; break; }
    }
    if (!fail) {
      for (const row of grid) for (let c = 0; c < size; c++) if (!row[c]) row[c] = FILL[Math.floor(rnd() * FILL.length)];
      return { size, grid, words: placed };
    }
    if (tries % 4 === 3 && size < 16) size++;
  }
  return null;
}

// ---------- labirintus ----------
/** Nyílt pálya falakkal; a négy sarokban egy-egy válaszmező. 0 = út, 1 = fal. */
export function buildMaze(seed = 1, w = 15, h = 11) {
  const rnd = mulberry32(seed);
  const cells = Array.from({ length: h }, (_, r) => Array.from({ length: w }, (_, c) => (r === 0 || c === 0 || r === h - 1 || c === w - 1 ? 1 : 0)));
  for (let r = 2; r < h - 2; r += 2) for (let c = 2; c < w - 2; c += 2) cells[r][c] = 1; // oszlopok
  for (let k = 0; k < Math.floor(w * h * 0.06); k++) {
    const r = 2 + Math.floor(rnd() * (h - 4));
    const c = 2 + Math.floor(rnd() * (w - 4));
    if ((r + c) % 2 === 1) cells[r][c] = 1;
  }
  const zones = [
    { r: 1, c: 1 }, { r: 1, c: w - 3 }, { r: h - 3, c: 1 }, { r: h - 3, c: w - 3 },
  ].map((z) => ({ ...z, w: 2, h: 2 }));
  for (const z of zones) for (let r = z.r; r < z.r + 2; r++) for (let c = z.c; c < z.c + 2; c++) cells[r][c] = 0;
  const start = { r: Math.floor(h / 2), c: Math.floor(w / 2) };
  cells[start.r][start.c] = 0;
  // összefüggőség biztosítása: a középről nem elérhető útcellákat megnyitjuk
  const seen = new Set();
  const q = [start];
  seen.add(`${start.r},${start.c}`);
  while (q.length) {
    const { r, c } = q.shift();
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const rr = r + dr; const cc = c + dc;
      if (cells[rr]?.[cc] === 0 && !seen.has(`${rr},${cc}`)) { seen.add(`${rr},${cc}`); q.push({ r: rr, c: cc }); }
    }
  }
  for (let r = 1; r < h - 1; r++) for (let c = 1; c < w - 1; c++) if (cells[r][c] === 0 && !seen.has(`${r},${c}`)) cells[r][c] = 1;
  return { w, h, cells, zones, start };
}

/** A körhöz (szobához) előkészített tartalom: ezt kapják a diákok. */
export function prepareRound(game, content, seed) {
  const out = { game, seed, ...content };
  if (game === 'wordsearch') {
    out.wordsearch = buildWordsearch(content.pairs.map((p) => p.a), seed);
  }
  return out;
}

/** Elérhető maximális pontszám (a host ennél többet nem fogad el). */
export function maxScore(game, content) {
  const per = 10;
  switch (game) {
    case 'truefalse': return content.statements.length * per;
    case 'sorting': return content.groups.reduce((n, g) => n + g.items.length, 0) * per;
    case 'magnets': return content.sentences.length * per;
    case 'maze': return content.questions.length * per;
    case 'imagequiz': return content.questions.length * 20;
    case 'diagram': return content.labels.length * per;
    case 'pairornot': return content.pairs.length * 2 * per;
    default: return (content.pairs?.length || 0) * per;
  }
}

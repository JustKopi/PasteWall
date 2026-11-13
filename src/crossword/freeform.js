// Vegyes irányú (klasszikus) keresztrejtvény-generátor.
// A szavak vízszintesen és függőlegesen keresztezik egymást, a kezdőmezők számot kapnak.
// Opcionális megfejtés: a rácsból kiválasztott, sorszámozott mezők betűi adják ki.

import { tokenize } from './hu.js';

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const key = (r, c) => `${r},${c}`;
const D = { across: [0, 1], down: [1, 0] };

class Board {
  constructor() {
    this.cells = new Map(); // "r,c" -> {t, across:bool, down:bool}
    this.words = [];
    this.minR = 0; this.maxR = 0; this.minC = 0; this.maxC = 0;
  }

  get(r, c) { return this.cells.get(key(r, c)); }

  /** Elhelyezhető-e a szó; ha igen, a keresztezések számát adja, különben -1. */
  fits(tokens, r, c, dir, lineKeys = null) {
    const [dr, dc] = D[dir];
    const [pr, pc] = [dc, dr]; // merőleges irány
    if (this.get(r - dr, c - dc) || this.get(r + dr * tokens.length, c + dc * tokens.length)) return -1;
    // a megfejtés-sort keresztező szavak futhatnak egymás mellett (mint a sávos rejtvényben)
    let crossesLine = false;
    if (lineKeys) for (let i = 0; i < tokens.length; i++) if (lineKeys.has(key(r + dr * i, c + dc * i))) crossesLine = true;
    let crosses = 0;
    for (let i = 0; i < tokens.length; i++) {
      const rr = r + dr * i;
      const cc = c + dc * i;
      const cell = this.get(rr, cc);
      if (cell) {
        if (cell.t !== tokens[i] || cell[dir]) return -1;
        crosses++;
      } else if (!crossesLine && (this.get(rr + pr, cc + pc) || this.get(rr - pr, cc - pc))) {
        return -1; // ne érjen hozzá oldalról más szóhoz
      }
    }
    return crosses;
  }

  place(word, tokens, r, c, dir) {
    const [dr, dc] = D[dir];
    for (let i = 0; i < tokens.length; i++) {
      const rr = r + dr * i;
      const cc = c + dc * i;
      const k = key(rr, cc);
      const cell = this.cells.get(k) || { t: tokens[i], across: false, down: false };
      cell[dir] = true;
      this.cells.set(k, cell);
      this.minR = Math.min(this.minR, rr); this.maxR = Math.max(this.maxR, rr);
      this.minC = Math.min(this.minC, cc); this.maxC = Math.max(this.maxC, cc);
    }
    this.words.push({ ...word, tokens, r, c, dir });
  }

  bboxWith(tokens, r, c, dir) {
    const [dr, dc] = D[dir];
    const r2 = r + dr * (tokens.length - 1);
    const c2 = c + dc * (tokens.length - 1);
    const h = Math.max(this.maxR, r2) - Math.min(this.minR, r) + 1;
    const w = Math.max(this.maxC, c2) - Math.min(this.minC, c) + 1;
    return { h, w };
  }
}

/** A legjobb elhelyezés egy szóra (vagy null). */
function bestPlacement(b, w, rnd, lineKeys, wantKey) {
  let best = null;
  for (const [k, cell] of b.cells) {
    if (wantKey && k !== wantKey) continue;
    const [cr, cc] = k.split(',').map(Number);
    for (let i = 0; i < w.tokens.length; i++) {
      if (w.tokens[i] !== cell.t) continue;
      for (const dir of ['across', 'down']) {
        if (cell[dir]) continue;
        const [dr, dc] = D[dir];
        const r = cr - dr * i;
        const c = cc - dc * i;
        const crosses = b.fits(w.tokens, r, c, dir, lineKeys);
        if (crosses < 1) continue;
        const { h, w: wd } = b.bboxWith(w.tokens, r, c, dir);
        // több kereszteződés és négyzetesebb, kisebb rács a jobb; a megfejtés-sort középen keresztezze
        const centered = wantKey ? -Math.abs(i - (w.tokens.length - 1) / 2) * 1.5 : 0;
        const score = crosses * 12 - h * wd * 0.08 - Math.abs(h - wd) * 0.6 + centered + rnd() * 2;
        if (!best || score > best.score) best = { score, r, c, dir };
      }
    }
  }
  return best;
}

function buildOnce(words, rnd, maxWords, line = null) {
  const b = new Board();
  // hosszabb szavak előre, kis véletlennel
  const order = words
    .map((w) => ({ w, k: w.tokens.length + rnd() * 2.5 }))
    .sort((a, z) => z.k - a.k)
    .map((x) => x.w);
  let pending = order;
  let lineKeys = null;
  if (line) {
    // 1) a megfejtés egy összefüggő sorban; 2) minden betűjét keresztezi egy szó
    const dir = rnd() < 0.5 ? 'across' : 'down';
    b.place({ solutionLine: true }, line, 0, 0, dir);
    b.lineDir = dir;
    lineKeys = new Set(line.map((_, i) => (dir === 'across' ? key(0, i) : key(i, 0))));
    const left = [...pending];
    const slots = [...lineKeys].sort(() => rnd() - 0.5);
    for (const k of slots) {
      let pick = null;
      for (const w of left) {
        const pl = bestPlacement(b, w, rnd, lineKeys, k);
        if (pl && (!pick || pl.score > pick.pl.score)) pick = { w, pl };
      }
      if (!pick) continue;
      b.place(pick.w, pick.w.tokens, pick.pl.r, pick.pl.c, pick.pl.dir);
      left.splice(left.indexOf(pick.w), 1);
    }
    b.lineKeys = lineKeys;
    pending = left;
    maxWords += 1; // a megfejtés-sor nem számít bele
  } else {
    const first = pending.shift();
    b.place(first, first.tokens, 0, 0, rnd() < 0.5 ? 'across' : 'down');
  }
  // több kör: a korábban be nem fért szavak később, több kereszteződési lehetőséggel befér(het)nek
  for (let pass = 0; pass < 3 && b.words.length < maxWords; pass++) {
    const skipped = [];
    for (const w of pending) {
      if (b.words.length >= maxWords) { skipped.push(w); continue; }
      const best = bestPlacement(b, w, rnd, null, null);
      if (best) b.place(w, w.tokens, best.r, best.c, best.dir);
      else skipped.push(w);
    }
    pending = skipped;
  }
  return b;
}

/** A megfejtés betűihez különböző mezők keresése, a rácson szétszórva. */
function pickSolutionCells(board, solTokens, rnd) {
  const byToken = new Map();
  for (const [k, cell] of board.cells) {
    if (!byToken.has(cell.t)) byToken.set(cell.t, []);
    byToken.get(cell.t).push(k);
  }
  const used = new Set();
  const out = [];
  for (const t of solTokens) {
    const opts = (byToken.get(t) || []).filter((k) => !used.has(k));
    if (!opts.length) return { ok: false, missing: t };
    const k = opts[Math.floor(rnd() * opts.length)];
    used.add(k);
    const [r, c] = k.split(',').map(Number);
    out.push({ r, c });
  }
  return { ok: true, cells: out };
}

/**
 * @param {object} input
 * @param {{answer:string, clue:string}[]} input.entries
 * @param {string} [input.solution]  opcionális megfejtés
 * @param {boolean} [input.digraphs=true]
 * @param {number} [input.maxWords=16]
 * @param {number} [input.seed]
 * @param {number} [input.attempts=60]
 * @param {'scattered'|'line'} [input.solutionMode='scattered']  a megfejtés szétszórva vagy egy összefüggő sorban
 */
export function generateFreeform(input) {
  const lineMode = input.solutionMode === 'line';
  const digraphs = input.digraphs !== false;
  const seed = input.seed ?? Math.floor(Math.random() * 2 ** 31);
  const rnd = mulberry32(seed);
  const maxWords = Math.max(2, input.maxWords ?? 16);
  const attempts = input.attempts ?? 60;

  const seen = new Set();
  const words = [];
  for (const [i, raw] of (input.entries || []).entries()) {
    const tokens = tokenize(raw.answer, { digraphs });
    const k = tokens.join('·');
    if (tokens.length < 2 || seen.has(k)) continue;
    seen.add(k);
    words.push({ src: i, answer: raw.answer.trim(), clue: (raw.clue || '').trim(), tokens });
  }
  if (words.length < 2) return { ok: false, problems: ['Adj meg legalább 2 szót (legalább 2 betűseket).'] };

  const solText = String(input.solution || '').trim();
  const solTokens = solText ? tokenize(solText, { digraphs }) : [];

  let best = null;
  let missingLetter = null;
  let bestUncovered = null;
  for (let a = 0; a < attempts; a++) {
    if (lineMode && solTokens.length) {
      const b = buildOnce(words, rnd, maxWords, solTokens);
      const other = b.lineDir === 'across' ? 'down' : 'across';
      const uncovered = [...b.lineKeys].filter((k) => !b.cells.get(k)[other]);
      if (uncovered.length) {
        if (!bestUncovered || uncovered.length < bestUncovered.n) {
          bestUncovered = { n: uncovered.length, letters: uncovered.map((k) => b.cells.get(k).t) };
        }
        continue;
      }
      const cells = [...b.lineKeys].map((k) => { const [r, c] = k.split(',').map(Number); return { r, c }; });
      b.words = b.words.filter((w) => !w.solutionLine);
      const h = b.maxR - b.minR + 1;
      const w = b.maxC - b.minC + 1;
      const score = b.words.length * 100 + (b.cells.size / (h * w)) * 40 - Math.abs(h - w) * 2;
      if (!best || score > best.score) best = { score, b, sol: { ok: true, cells }, line: true };
      continue;
    }
    const b = buildOnce(words, rnd, maxWords);
    let sol = null;
    if (solTokens.length) {
      sol = pickSolutionCells(b, solTokens, rnd);
      if (!sol.ok) { missingLetter = sol.missing; continue; }
    }
    const h = b.maxR - b.minR + 1;
    const w = b.maxC - b.minC + 1;
    const fill = b.cells.size / (h * w);
    const score = b.words.length * 100 + fill * 40 - Math.abs(h - w) * 2;
    if (!best || score > best.score) best = { score, b, sol };
  }

  if (!best && lineMode && solTokens.length) {
    return {
      ok: false,
      problems: [
        `A megfejtés sorának nem minden betűjét sikerült szóval keresztezni (pl. ezeket: ${[...new Set(bestUncovered?.letters || [])].map((t) => `„${t}”`).join(', ')}).`,
        'Adj meg több szót, amelyekben ezek a betűk szerepelnek, vagy válaszd a szétszórt megfejtést.',
      ],
    };
  }
  if (!best) {
    return {
      ok: false,
      problems: [
        `A megfejtéshez nincs elég betű a rácsban (pl. hiányzik: „${missingLetter}”).`,
        'Adj meg több szót, vagy rövidebb megfejtést.',
      ],
    };
  }

  const { b, sol } = best;
  const r0 = b.minR;
  const c0 = b.minC;
  const height = b.maxR - r0 + 1;
  const width = b.maxC - c0 + 1;

  // számozás: balról jobbra, fentről lefelé; egy mező egy számot kap
  const starts = new Map();
  for (const w of b.words) starts.set(key(w.r - r0, w.c - c0), true);
  const nums = new Map();
  let n = 0;
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) if (starts.has(key(r, c))) nums.set(key(r, c), ++n);
  }

  const entries = b.words
    .map((w) => ({
      dir: w.dir,
      num: nums.get(key(w.r - r0, w.c - c0)),
      r: w.r - r0,
      c: w.c - c0,
      tokens: w.tokens,
      answer: w.answer,
      clue: w.clue,
      length: w.tokens.length,
      entry: w.src,
    }))
    .sort((x, y) => (x.dir === y.dir ? x.num - y.num : x.dir === 'across' ? -1 : 1))
    .map((e, i) => ({ ...e, row: i }));

  const used = new Set(entries.map((e) => e.entry));
  return {
    ok: true,
    seed,
    puzzle: {
      type: 'free',
      width,
      height,
      digraphs,
      rows: entries,
      bands: solTokens.length
        ? [{ text: solText, tokens: solTokens, length: solTokens.length, line: Boolean(best.line), cells: sol.cells.map(({ r, c }) => ({ r: r - r0, c: c - c0 })) }]
        : [],
      unused: words.filter((w) => !used.has(w.src)).map((w) => w.answer),
    },
  };
}

/** Az egyes mezőket lefedő bejegyzések (sor-index + betű-index) listája. */
export function cellMap(pub) {
  const m = new Map();
  for (const e of pub.rows) {
    const [dr, dc] = D[e.dir];
    for (let i = 0; i < e.length; i++) {
      const k = key(e.r + dr * i, e.c + dc * i);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push({ row: e.row, i });
    }
  }
  return m;
}

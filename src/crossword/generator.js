// Újság-stílusú keresztrejtvény generátor "megfejtés-sávokkal".
//
// Minden sor egy vízszintes szó. A sorokat úgy toljuk el, hogy a kiemelt
// függőleges oszlop(ok)ban (fő sáv) fentről lefelé kiolvasható legyen a megfejtés.
// Több sáv esetén minden sornak minden sávban a megfelelő betűt kell adnia,
// a sávok közti távolságot a generátor választja meg.

import { tokenize } from './hu.js';

const MAX_GAP = 6;
const NODE_LIMIT = 25000;

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

function shuffle(arr, rnd) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Az összes lehetséges sáv-eltolás (az első sáv 0-n). */
function offsetCombos(bandCount) {
  if (bandCount <= 1) return [[0]];
  let combos = [[0]];
  for (let k = 1; k < bandCount; k++) {
    const next = [];
    for (const c of combos) {
      for (let g = 1; g <= MAX_GAP; g++) next.push([...c, c[c.length - 1] + g]);
    }
    combos = next;
  }
  // Szűkebb sávtávolságok előre: kompaktabb rejtvény.
  return combos.sort((a, b) => a[a.length - 1] - b[b.length - 1]);
}

function buildCandidates(bands, words, offsets, height) {
  const cands = [];
  for (let r = 0; r < height; r++) {
    const list = [];
    for (let e = 0; e < words.length; e++) {
      const w = words[e];
      for (let p = 0; p < w.length; p++) {
        let ok = true;
        for (let k = 0; k < bands.length && ok; k++) {
          if (r >= bands[k].length) continue;
          const q = p + offsets[k];
          if (q >= w.length || w[q] !== bands[k][r]) ok = false;
        }
        if (ok) list.push({ e, p });
      }
    }
    cands.push(list);
  }
  return cands;
}

/** Sorok -> különböző szavak hozzárendelése visszalépéses kereséssel (MRV). */
function assign(cands, rnd) {
  const height = cands.length;
  const shuffled = cands.map((l) => shuffle(l, rnd));
  const chosen = new Array(height).fill(null);
  const used = new Set();
  let nodes = 0;

  function pickRow() {
    let best = -1;
    let bestCount = Infinity;
    for (let r = 0; r < height; r++) {
      if (chosen[r]) continue;
      let c = 0;
      for (const x of shuffled[r]) if (!used.has(x.e)) c++;
      if (c < bestCount) { bestCount = c; best = r; }
    }
    return best;
  }

  function rec() {
    if (++nodes > NODE_LIMIT) return false;
    const r = pickRow();
    if (r === -1) return true;
    for (const x of shuffled[r]) {
      if (used.has(x.e)) continue;
      used.add(x.e);
      chosen[r] = x;
      if (rec()) return true;
      used.delete(x.e);
      chosen[r] = null;
    }
    return false;
  }

  return rec() ? chosen : null;
}

function layoutWidth(chosen, words) {
  let minL = Infinity;
  let maxR = -Infinity;
  for (const { e, p } of chosen) {
    minL = Math.min(minL, -p);
    maxR = Math.max(maxR, words[e].length - p);
  }
  return { minL, width: maxR - minL };
}

/**
 * @param {object} input
 * @param {string[]} input.solutions  Megfejtés(ek), sávonként egy.
 * @param {{answer:string, clue:string}[]} input.entries  Szavak és meghatározások.
 * @param {boolean} [input.digraphs=true]  Kettős betűk egy cellában.
 * @param {number} [input.seed]
 * @param {number} [input.attempts=40]
 * @param {'auto'|'parallel'|'stacked'} [input.layout='auto']
 *   parallel: a sávok egymás mellett, ugyanazokban a sorokban (nehezebb, sok szó kell);
 *   stacked: a sávok egymás alatt folytatódnak (mindig könnyen kirakható);
 *   auto: párhuzamosat próbál, ha nem megy, egymás alá rakja.
 */
export function generateCrossword(input) {
  const layout = input.layout || 'auto';
  if (layout !== 'stacked' && (input.solutions || []).filter((s) => String(s || '').trim()).length > 1) {
    const res = generateCore({ ...input, layout: 'parallel' });
    if (res.ok || layout === 'parallel') return res;
  }
  return generateCore({ ...input, layout: 'stacked' });
}

function generateCore(input) {
  const stacked = input.layout === 'stacked';
  const digraphs = input.digraphs !== false;
  const seed = input.seed ?? Math.floor(Math.random() * 2 ** 31);
  const attempts = input.attempts ?? 40;
  const rnd = mulberry32(seed);

  const solutionTexts = (input.solutions || []).map((s) => String(s || '').trim()).filter(Boolean);
  if (!solutionTexts.length) return { ok: false, problems: ['Adj meg legalább egy megfejtést (fő sávot).'] };
  if (solutionTexts.length > 4) return { ok: false, problems: ['Legfeljebb 4 fő sáv adható meg.'] };
  const bandTokens = solutionTexts.map((s) => tokenize(s, { digraphs }));
  if (bandTokens.some((b) => b.length < 2)) return { ok: false, problems: ['Minden megfejtés legalább 2 betű legyen.'] };
  // Egymás alatti sávoknál a kirakás szempontjából egyetlen hosszú sávként kezeljük.
  const bands = stacked ? [bandTokens.flat()] : bandTokens;

  // Szavak: tisztítás, duplikátumok kiszűrése.
  const seen = new Set();
  const entries = [];
  for (const [i, raw] of (input.entries || []).entries()) {
    const tokens = tokenize(raw.answer, { digraphs });
    const key = tokens.join('·');
    if (tokens.length < 2 || seen.has(key)) continue;
    seen.add(key);
    entries.push({ src: i, answer: raw.answer.trim(), clue: (raw.clue || '').trim(), tokens });
  }
  const words = entries.map((x) => x.tokens);
  const height = Math.max(...bands.map((b) => b.length));

  if (words.length < height) {
    return {
      ok: false,
      problems: [`A megfejtés ${height} soros, de csak ${words.length} használható szó van. Adj meg legalább ${height - words.length} szót még.`],
    };
  }

  let best = null;
  let bestDiag = null;

  for (const offsets of offsetCombos(bands.length)) {
    const cands = buildCandidates(bands, words, offsets, height);
    const emptyRows = cands.map((l, r) => (l.length ? -1 : r)).filter((r) => r >= 0);
    if (emptyRows.length) {
      if (!bestDiag || emptyRows.length < bestDiag.emptyRows.length) bestDiag = { offsets, emptyRows, cands };
      continue;
    }
    for (let a = 0; a < attempts; a++) {
      const chosen = assign(cands, rnd);
      if (!chosen) break; // determinisztikusan nem oldható meg ezzel az eltolással
      const { minL, width } = layoutWidth(chosen, words);
      const score = width * 10 + offsets[offsets.length - 1];
      if (!best || score < best.score) best = { score, chosen, minL, width, offsets };
    }
    if (best && bands.length > 1) break; // az első működő (legszűkebb) sávtávolság elég
    if (!best && !bestDiag) bestDiag = { offsets, emptyRows: [], cands };
  }

  if (!best) return { ok: false, problems: diagnose(bands, bestDiag, solutionTexts, stacked) };

  const bandCol0 = -best.minL;
  const rows = best.chosen.map(({ e, p }, r) => ({
    row: r,
    entry: entries[e].src,
    answer: entries[e].answer,
    clue: entries[e].clue,
    tokens: words[e],
    start: bandCol0 - p,
    length: words[e].length,
  }));
  const usedSrc = new Set(rows.map((r) => r.entry));
  return {
    ok: true,
    seed,
    puzzle: {
      width: best.width,
      height,
      digraphs,
      layout: stacked && bandTokens.length > 1 ? 'stacked' : 'parallel',
      bands: bandTokens.map((b, k) => ({
        col: bandCol0 + (stacked ? 0 : best.offsets[k]),
        rowStart: stacked ? bandTokens.slice(0, k).reduce((n, x) => n + x.length, 0) : 0,
        length: b.length,
        text: solutionTexts[k],
        tokens: b,
      })),
      rows,
      unused: entries.filter((x) => !usedSrc.has(x.src)).map((x) => x.answer),
    },
  };
}

function diagnose(bands, diag, texts, stacked) {
  const problems = [];
  if (diag && diag.emptyRows.length) {
    for (const r of diag.emptyRows) {
      const letters = bands.map((b) => b[r]).filter(Boolean);
      if (bands.length === 1) {
        problems.push(`${r + 1}. sor: nincs olyan szó, amelyben szerepel a(z) „${letters[0]}” betű.`);
      } else {
        problems.push(`${r + 1}. sor: nincs olyan szó, amely a sávoknak megfelelően tartalmazza: ${letters.map((l) => `„${l}”`).join(', ')}.`);
      }
    }
    if (stacked && texts.length > 1) problems.push('A sávokat egymás alá raktam, mert egymás mellé nem fértek ki.');
    if (bands.length > 1) problems.push('Tipp: több sávnál hosszabb szavak és több szó kell, vagy próbáld kevesebb sávval.');
    return problems;
  }
  // Van jelölt minden sorra, de nincs elég különböző szó.
  const need = new Map();
  for (const b of bands) for (const t of b) need.set(t, (need.get(t) || 0) + 1);
  problems.push('Nem sikerült minden sorhoz különböző szót találni. Adj meg több szót, főleg ezekkel a betűkkel: ' +
    [...need.entries()].sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t} (${n}×)`).join(', ') + '.');
  if (texts.join('').length > 20) problems.push('Hosszú megfejtésnél sok szó kell — érdemes legalább másfélszer annyi szót megadni, mint ahány sor van.');
  return problems;
}

/** Diák-oldali (megoldás nélküli) nézet: csak a forma és a meghatározások. */
export function publicView(puzzle) {
  if (puzzle.type === 'free') {
    return {
      type: 'free',
      width: puzzle.width,
      height: puzzle.height,
      digraphs: puzzle.digraphs,
      bands: puzzle.bands.map((b) => ({ length: b.length, cells: b.cells })),
      rows: puzzle.rows.map((r) => ({ row: r.row, clue: r.clue, dir: r.dir, num: r.num, r: r.r, c: r.c, length: r.length })),
    };
  }
  return {
    width: puzzle.width,
    height: puzzle.height,
    digraphs: puzzle.digraphs,
    layout: puzzle.layout,
    bands: puzzle.bands.map((b) => ({ col: b.col, rowStart: b.rowStart, length: b.length })),
    rows: puzzle.rows.map((r) => ({ row: r.row, clue: r.clue, start: r.start, length: r.length })),
  };
}

/** Bemásolt szöveg feldolgozása: soronként "VÁLASZ - meghatározás" (vagy ; tab : elválasztó). */
export function parseEntries(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const m = line.match(/^(.+?)\s*(?:\t|;| - | – |:)\s*(.*)$/);
      return m ? { answer: m[1].trim(), clue: m[2].trim() } : { answer: line, clue: '' };
    });
}

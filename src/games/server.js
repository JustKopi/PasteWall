// Minijátékok szerveroldali (tanári gépen futó) logikája.
// Minden diáknak saját "session"-je van; a diák csak az aktuális kérdés nézetét kapja meg,
// a helyes válaszokat soha. A választ itt ellenőrizzük, a pontot és az időt is itt számoljuk.

import { shuffle, mulberry32, normalizeAnswer, normalizeLetters } from './content.js';

const PER = 10;

function base(total) {
  return { score: 0, correct: 0, wrong: 0, total, done: false };
}

/**
 * @param {string} game
 * @param {any} content  teljes (titkos) tartalom
 * @param {number} seed  játékosonként más
 */
export function createSession(game, content, seed) {
  const rnd = mulberry32(seed);
  const make = SESSIONS[game];
  if (!make) throw new Error(`Ismeretlen játék: ${game}`);
  return make(content, rnd);
}

const SESSIONS = {
  // ---------------------------------------------------------------- Írd be a választ
  type(content, rnd) {
    const items = shuffle(content.pairs.filter((p) => p.a && p.b), rnd);
    const s = base(items.length);
    let i = 0;
    const view = () => (i < items.length ? { i, total: items.length, prompt: items[i].b } : null);
    return {
      s,
      start: () => ({ view: view() }),
      act(op, p) {
        if (s.done || i >= items.length) return { done: true };
        if (op !== 'answer' && op !== 'skip') return { error: true };
        const ok = op === 'answer' && normalizeAnswer(p?.text) === normalizeAnswer(items[i].a);
        const correct = items[i].a;
        if (ok) { s.score += PER; s.correct++; } else s.wrong++;
        i++;
        if (i >= items.length) s.done = true;
        return { ok, correct: ok ? undefined : correct, view: view(), done: s.done };
      },
    };
  },

  // ---------------------------------------------------------------- Igaz vagy hamis
  truefalse(content, rnd) {
    const items = shuffle(content.statements.filter((x) => x.value != null), rnd);
    const s = base(items.length);
    let i = 0;
    let shownAt = 0;
    const secs = () => Math.max(3, 7 - i * 0.35);
    const view = (now) => { shownAt = now; return i < items.length ? { i, total: items.length, text: items[i].text, secs: secs() } : null; };
    return {
      s,
      start: (now) => ({ view: view(now) }),
      act(op, p, now) {
        if (s.done || i >= items.length) return { done: true };
        if (op !== 'answer') return { error: true };
        const late = now - shownAt > secs() * 1000 + 1500; // a tanári gép méri az időt
        const ok = !late && p?.value === items[i].value;
        if (ok) { s.score += PER; s.correct++; } else s.wrong++;
        i++;
        if (i >= items.length) s.done = true;
        return { ok, late, view: view(now), done: s.done };
      },
    };
  },

  // ---------------------------------------------------------------- Párkereső
  memory(content, rnd) {
    const pairs = shuffle(content.pairs.filter((p) => p.a && p.b), rnd).slice(0, 12);
    const tiles = shuffle(pairs.flatMap((p, k) => [{ k, text: p.a }, { k, text: p.b }]), rnd);
    const matched = new Set();
    const s = base(pairs.length);
    return {
      s,
      start: () => ({ view: { tiles: tiles.map((t, id) => ({ id, text: t.text })) } }),
      act(op, p) {
        if (s.done) return { done: true };
        if (op !== 'flip2') return { error: true };
        const a = Number(p?.a);
        const b = Number(p?.b);
        if (!(a >= 0 && a < tiles.length && b >= 0 && b < tiles.length) || a === b || matched.has(a) || matched.has(b)) return { error: true };
        const ok = tiles[a].k === tiles[b].k;
        if (ok) { matched.add(a); matched.add(b); s.score += PER; s.correct++; } else s.wrong++;
        if (matched.size === tiles.length) s.done = true;
        return { ok, done: s.done };
      },
    };
  },

  // ---------------------------------------------------------------- Pár vagy nem pár?
  pairornot(content, rnd) {
    const pairs = content.pairs.filter((p) => p.a && p.b);
    const rounds = shuffle(pairs.flatMap((p, k) => {
      const others = pairs.filter((_, j) => j !== k);
      const fake = others[Math.floor(rnd() * others.length)];
      return [{ a: p.a, b: p.b, match: true }, { a: p.a, b: fake.b, match: false }];
    }), rnd);
    const s = base(rounds.length);
    let i = 0;
    const view = () => (i < rounds.length ? { i, total: rounds.length, a: rounds[i].a, b: rounds[i].b } : null);
    return {
      s,
      start: () => ({ view: view() }),
      act(op, p) {
        if (s.done || i >= rounds.length) return { done: true };
        if (op !== 'answer') return { error: true };
        const ok = Boolean(p?.match) === rounds[i].match;
        if (ok) { s.score += PER; s.correct++; } else s.wrong++;
        i++;
        if (i >= rounds.length) s.done = true;
        return { ok, view: view(), done: s.done };
      },
    };
  },

  // ---------------------------------------------------------------- Akasztófa
  hangman(content, rnd) {
    const words = shuffle(content.pairs.filter((p) => p.a), rnd);
    const LIVES = 7;
    const s = base(words.length);
    let i = 0;
    let guessed = new Set();
    let lives = LIVES;
    let outcome = null;
    const chars = () => [...words[i].a.toLocaleUpperCase('hu-HU')];
    const view = () => {
      if (i >= words.length) return null;
      const cs = chars();
      return {
        i, total: words.length, clue: words[i].b || '', lives, maxLives: LIVES, guessed: [...guessed],
        pattern: cs.map((ch) => (/\p{L}/u.test(ch) ? (guessed.has(ch) || outcome ? ch : null) : ch)),
        outcome,
      };
    };
    return {
      s,
      start: () => ({ view: view() }),
      act(op, p) {
        if (s.done || i >= words.length) return { done: true };
        if (op === 'next') {
          if (!outcome) return { error: true };
          i++; guessed = new Set(); lives = LIVES; outcome = null;
          if (i >= words.length) s.done = true;
          return { view: view(), done: s.done };
        }
        if (op !== 'letter' || outcome) return { error: true };
        const L = String(p?.letter || '').toLocaleUpperCase('hu-HU').slice(0, 1);
        if (!/\p{L}/u.test(L) || guessed.has(L)) return { view: view() };
        guessed.add(L);
        const cs = chars();
        if (!cs.includes(L)) lives--;
        if (cs.every((ch) => !/\p{L}/u.test(ch) || guessed.has(ch))) { outcome = 'won'; s.score += PER; s.correct++; }
        else if (lives <= 0) { outcome = 'lost'; s.wrong++; }
        return { hit: cs.includes(L), view: view() };
      },
    };
  },

  // ---------------------------------------------------------------- Betűrakó
  spell(content, rnd) {
    const words = shuffle(content.pairs.filter((p) => p.a), rnd);
    const s = base(words.length);
    let i = 0;
    const view = () => {
      if (i >= words.length) return null;
      const cs = [...words[i].a.toLocaleUpperCase('hu-HU')];
      return {
        i, total: words.length, clue: words[i].b || '',
        slots: cs.map((ch) => (/\p{L}/u.test(ch) ? 1 : ch)),
        tiles: shuffle(cs.filter((ch) => /\p{L}/u.test(ch)), rnd),
      };
    };
    return {
      s,
      start: () => ({ view: view() }),
      act(op, p) {
        if (s.done || i >= words.length) return { done: true };
        if (op === 'skip') { s.wrong++; i++; if (i >= words.length) s.done = true; return { ok: false, view: view(), done: s.done }; }
        if (op !== 'submit') return { error: true };
        const letters = normalizeLetters(words[i].a).join('');
        const got = (Array.isArray(p?.letters) ? p.letters : []).join('').toLocaleUpperCase('hu-HU');
        const ok = got === letters;
        if (!ok) return { ok: false };
        s.score += PER; s.correct++; i++;
        if (i >= words.length) s.done = true;
        return { ok: true, view: view(), done: s.done };
      },
    };
  },

  // ---------------------------------------------------------------- Szókereső
  wordsearch(content) {
    const ws = content.wordsearch;
    const found = new Set();
    const s = base(ws.words.length);
    const view = () => ({ size: ws.size, grid: ws.grid, words: ws.words.map((w, k) => ({ word: w.word, found: found.has(k) })) });
    return {
      s,
      start: () => ({ view: view() }),
      act(op, p) {
        if (s.done) return { done: true };
        if (op !== 'select') return { error: true };
        const [r1, c1, r2, c2] = [p?.r1, p?.c1, p?.r2, p?.c2].map(Number);
        const k = ws.words.findIndex((w, j) => {
          if (found.has(j)) return false;
          const er = w.r + w.dr * (w.len - 1);
          const ec = w.c + w.dc * (w.len - 1);
          return (w.r === r1 && w.c === c1 && er === r2 && ec === c2) || (w.r === r2 && w.c === c2 && er === r1 && ec === c1);
        });
        if (k === -1) return { ok: false };
        found.add(k);
        s.score += PER; s.correct++;
        if (found.size === ws.words.length) s.done = true;
        const w = ws.words[k];
        return { ok: true, k, cells: Array.from({ length: w.len }, (_, n) => [w.r + w.dr * n, w.c + w.dc * n]), done: s.done };
      },
    };
  },

  // ---------------------------------------------------------------- Villámcsoportosító
  sorting(content, rnd) {
    const groups = content.groups;
    const items = shuffle(groups.flatMap((g, k) => g.items.map((text) => ({ text, k }))), rnd);
    const s = base(items.length);
    let i = 0;
    const view = () => (i < items.length ? { i, total: items.length, item: items[i].text, groups: groups.map((g) => g.name) } : null);
    return {
      s,
      start: () => ({ view: view() }),
      act(op, p) {
        if (s.done || i >= items.length) return { done: true };
        if (op !== 'answer') return { error: true };
        const ok = Number(p?.group) === items[i].k;
        if (ok) { s.score += PER; s.correct++; } else s.wrong++;
        i++;
        if (i >= items.length) s.done = true;
        return { ok, view: view(), done: s.done };
      },
    };
  },

  // ---------------------------------------------------------------- Szómágnes
  magnets(content, rnd) {
    const sentences = shuffle(content.sentences, rnd);
    const s = base(sentences.length);
    let i = 0;
    let words = [];
    const view = () => {
      if (i >= sentences.length) return null;
      words = sentences[i].split(/\s+/).filter(Boolean);
      let order = shuffle(words.map((w, id) => ({ id, w })), rnd);
      for (let n = 0; n < 5 && words.length > 1 && order.every((x, k) => x.id === k); n++) order = shuffle(order, rnd);
      return { i, total: sentences.length, words: order };
    };
    return {
      s,
      start: () => ({ view: view() }),
      act(op, p) {
        if (s.done || i >= sentences.length) return { done: true };
        if (op === 'skip') { s.wrong++; i++; if (i >= sentences.length) s.done = true; return { ok: false, view: view(), done: s.done }; }
        if (op !== 'submit') return { error: true };
        const ids = Array.isArray(p?.ids) ? p.ids.map(Number) : [];
        // azonos szavak felcserélése is jó: a szavakat hasonlítjuk, nem az azonosítókat
        const ok = ids.length === words.length && ids.map((id) => words[id]).join(' ') === words.join(' ');
        if (!ok) return { ok: false };
        s.score += PER; s.correct++; i++;
        if (i >= sentences.length) s.done = true;
        return { ok: true, view: view(), done: s.done };
      },
    };
  },

  // ---------------------------------------------------------------- Labirintus
  maze(content, rnd) {
    const qs = shuffle(content.questions.filter((q) => q.q && q.correct), rnd);
    const s = base(qs.length);
    let i = 0;
    let lives = 3;
    let opts = [];
    const view = () => {
      if (i >= qs.length || lives <= 0) return null;
      opts = shuffle([{ text: qs[i].correct, ok: true }, ...qs[i].wrong.map((w) => ({ text: w, ok: false }))], rnd).slice(0, 4);
      return { i, total: qs.length, q: qs[i].q, options: opts.map((o) => o.text), lives };
    };
    const finish = () => { if (i >= qs.length || lives <= 0) s.done = true; };
    return {
      s,
      start: () => ({ view: view() }),
      act(op, p) {
        if (s.done) return { done: true };
        if (op === 'hit') { lives--; finish(); return { lives, done: s.done, view: s.done ? null : undefined }; }
        if (op !== 'zone') return { error: true };
        const k = Number(p?.k);
        if (!(k >= 0 && k < opts.length)) return { error: true };
        const ok = opts[k].ok;
        if (ok) { s.score += PER; s.correct++; } else { s.wrong++; lives--; }
        i++;
        finish();
        return { ok, lives, view: s.done ? null : view(), done: s.done };
      },
    };
  },

  // ---------------------------------------------------------------- Képrejtő kvíz
  imagequiz(content, rnd) {
    const qs = shuffle(content.questions.filter((q) => q.q && q.correct), rnd);
    const CELLS = 24;
    const MS = 650;
    const s = base(qs.length);
    let i = 0;
    let shownAt = 0;
    let buzzAt = null;
    let opts = [];
    const view = (now) => {
      shownAt = now; buzzAt = null;
      if (i >= qs.length) return null;
      opts = shuffle([{ text: qs[i].correct, ok: true }, ...qs[i].wrong.map((w) => ({ text: w, ok: false }))], rnd);
      return { i, total: qs.length, q: qs[i].q, image: qs[i].image, cells: CELLS, ms: MS, order: shuffle(Array.from({ length: CELLS }, (_, k) => k), rnd) };
    };
    return {
      s,
      start: (now) => ({ view: view(now) }),
      act(op, p, now) {
        if (s.done || i >= qs.length) return { done: true };
        if (op === 'buzz') { if (buzzAt == null) buzzAt = now; return { options: opts.map((o) => o.text) }; }
        if (op !== 'choose') return { error: true };
        if (buzzAt == null) buzzAt = now;
        const k = Number(p?.k);
        if (!(k >= 0 && k < opts.length)) return { error: true };
        // a még takart mezők számát a tanári gép órája alapján számoljuk
        const left = Math.max(0, CELLS - 1 - Math.floor((buzzAt - shownAt) / MS));
        const ok = opts[k].ok;
        const pts = ok ? PER + Math.round((PER * left) / CELLS) : 0;
        if (ok) { s.score += pts; s.correct++; } else s.wrong++;
        const correct = opts.findIndex((o) => o.ok);
        i++;
        if (i >= qs.length) s.done = true;
        return { ok, pts, correct, view: view(now), done: s.done };
      },
    };
  },

  // ---------------------------------------------------------------- Ábracímkéző
  diagram(content, rnd) {
    const labels = content.labels;
    const pinIds = shuffle(labels.map((_, k) => k), rnd); // pin azonosító -> címke index
    const labelIds = shuffle(labels.map((_, k) => k), rnd);
    const s = base(labels.length);
    return {
      s,
      start: () => ({
        view: {
          image: content.image,
          pins: pinIds.map((li, id) => ({ id, x: labels[li].x, y: labels[li].y })),
          labels: labelIds.map((li, id) => ({ id, text: labels[li].text })),
        },
      }),
      act(op, p) {
        if (s.done) return { done: true };
        if (op !== 'submit') return { error: true };
        const assign = p?.assign && typeof p.assign === 'object' ? p.assign : {};
        const results = {};
        let ok = 0;
        pinIds.forEach((li, pin) => {
          const lab = Number(assign[pin]);
          const good = lab >= 0 && lab < labelIds.length && labelIds[lab] === li;
          results[pin] = good;
          if (good) ok++;
        });
        s.score = ok * PER; s.correct = ok; s.wrong = labels.length - ok; s.done = true;
        return { results, done: true };
      },
    };
  },
};

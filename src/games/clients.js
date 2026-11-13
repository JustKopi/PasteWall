// A minijátékok diák-oldali megvalósítása. Mindegyik: start(el, content, api) -> destroy()
// api.report({score, correct, wrong, total, done}) jelzi az előrehaladást a tanárnak.

import { h, fill } from '../ui/dom.js';
import { shuffle, mulberry32, normalizeAnswer, normalizeLetters, buildMaze } from './content.js';

const PER = 10;

function tracker(api, total) {
  const s = { score: 0, correct: 0, wrong: 0, total, done: false };
  const send = () => api.report({ ...s });
  return {
    s,
    ok(points = PER) { s.score += points; s.correct++; send(); },
    bad() { s.wrong++; send(); },
    finish() { if (!s.done) { s.done = true; send(); api.finished?.(s); } },
    send,
  };
}

function header(text, sub) {
  return h('div', { class: 'mg-head' }, h('div', { class: 'mg-prompt' }, text), sub ? h('div', { class: 'mg-sub muted' }, sub) : null);
}

function flash(el, ok) {
  el.classList.remove('mg-ok', 'mg-bad');
  void el.offsetWidth;
  el.classList.add(ok ? 'mg-ok' : 'mg-bad');
}

// ---------------------------------------------------------------- Írd be a választ
function typeGame(el, content, api) {
  const items = shuffle(content.pairs.filter((p) => p.a && p.b));
  const t = tracker(api, items.length);
  let i = 0;
  const input = h('input', { class: 'input big', autocomplete: 'off', spellcheck: false, placeholder: 'Válasz…' });
  const feedback = h('div', { class: 'mg-feedback' });
  const box = h('div', { class: 'card mg-card' });
  const form = h('form', { class: 'ans-row', onsubmit: (e) => { e.preventDefault(); check(); } }, input, h('button', { class: 'btn primary', type: 'submit' }, 'OK'));
  let locked = false;
  function show() {
    if (i >= items.length) { t.finish(); return; }
    fill(box, h('div', { class: 'mg-count muted' }, `${i + 1} / ${items.length}`), header(items[i].b), form, feedback, h('button', { class: 'btn ghost small', onclick: skip }, 'Kihagyom'));
    input.value = '';
    feedback.textContent = '';
    locked = false;
    input.focus();
  }
  function next(delay) { setTimeout(() => { i++; show(); }, delay); }
  function check() {
    if (locked || !input.value.trim()) return;
    locked = true;
    const ok = normalizeAnswer(input.value) === normalizeAnswer(items[i].a);
    if (ok) { t.ok(); feedback.textContent = '✔ Helyes!'; feedback.className = 'mg-feedback ok'; next(600); }
    else { t.bad(); feedback.textContent = `✘ A helyes válasz: ${items[i].a}`; feedback.className = 'mg-feedback bad'; next(1600); }
    flash(box, ok);
  }
  function skip() { if (locked) return; locked = true; t.bad(); feedback.textContent = `A helyes válasz: ${items[i].a}`; feedback.className = 'mg-feedback bad'; next(1400); }
  fill(el, box);
  show();
  return () => {};
}

// ---------------------------------------------------------------- Igaz vagy hamis
function trueFalseGame(el, content, api) {
  const items = shuffle(content.statements.filter((s) => s.value != null));
  const t = tracker(api, items.length);
  let i = 0;
  let timer = null;
  let answered = false;
  const bar = h('div', { class: 'mg-timebar' }, h('span'));
  const card = h('div', { class: 'card mg-card mg-tf' });
  const onKey = (e) => { if (e.key === 'ArrowLeft') answer(true); if (e.key === 'ArrowRight') answer(false); };
  document.addEventListener('keydown', onKey);
  function show() {
    clearTimeout(timer);
    if (i >= items.length) { t.finish(); return; }
    answered = false;
    const secs = Math.max(3, 7 - i * 0.35);
    fill(card, h('div', { class: 'mg-count muted' }, `${i + 1} / ${items.length}`), h('div', { class: 'mg-statement fly' }, items[i].text), bar,
      h('div', { class: 'mg-tf-btns' },
        h('button', { class: 'btn big tf-true', onclick: () => answer(true) }, '✔ Igaz'),
        h('button', { class: 'btn big tf-false', onclick: () => answer(false) }, '✘ Hamis')));
    const span = bar.firstChild;
    span.style.transition = 'none';
    span.style.width = '100%';
    requestAnimationFrame(() => requestAnimationFrame(() => { span.style.transition = `width ${secs}s linear`; span.style.width = '0%'; }));
    timer = setTimeout(() => answer(null), secs * 1000);
  }
  function answer(v) {
    if (answered || i >= items.length) return;
    answered = true;
    clearTimeout(timer);
    const ok = v === items[i].value;
    if (ok) t.ok(); else t.bad();
    flash(card, ok);
    i++;
    setTimeout(show, ok ? 350 : 800);
  }
  fill(el, card);
  show();
  return () => { clearTimeout(timer); document.removeEventListener('keydown', onKey); };
}

// ---------------------------------------------------------------- Párkereső
function memoryGame(el, content, api) {
  const pairs = shuffle(content.pairs.filter((p) => p.a && p.b)).slice(0, 12);
  const t = tracker(api, pairs.length);
  const tiles = shuffle(pairs.flatMap((p, k) => [{ k, text: p.a }, { k, text: p.b }]));
  let open = [];
  let busy = false;
  let found = 0;
  const grid = h('div', { class: 'mg-memory', style: { '--cols': tiles.length > 16 ? 6 : tiles.length > 12 ? 5 : 4 } });
  tiles.forEach((tile) => {
    tile.el = h('button', { class: 'mg-tile', onclick: () => flip(tile) }, h('span', { class: 'front' }, tile.text), h('span', { class: 'back' }, '?'));
    grid.append(tile.el);
  });
  function flip(tile) {
    if (busy || tile.done || open.includes(tile)) return;
    tile.el.classList.add('open');
    open.push(tile);
    if (open.length < 2) return;
    const [x, y] = open;
    if (x.k === y.k) {
      x.done = y.done = true;
      x.el.classList.add('matched'); y.el.classList.add('matched');
      open = [];
      t.ok();
      if (++found === pairs.length) setTimeout(() => t.finish(), 500);
    } else {
      busy = true;
      t.bad();
      setTimeout(() => { x.el.classList.remove('open'); y.el.classList.remove('open'); open = []; busy = false; }, 900);
    }
  }
  fill(el, h('div', { class: 'card mg-card' }, header('Keresd meg a párokat!', 'Fordíts fel két lapot — ha összetartoznak, a tiéd.'), grid));
  return () => {};
}

// ---------------------------------------------------------------- Pár vagy nem pár?
function pairOrNotGame(el, content, api, seed) {
  const rnd = mulberry32(seed + 7);
  const pairs = content.pairs.filter((p) => p.a && p.b);
  const rounds = shuffle(pairs.flatMap((p, k) => {
    const others = pairs.filter((_, j) => j !== k);
    const fake = others[Math.floor(rnd() * others.length)];
    return [{ a: p.a, b: p.b, match: true }, { a: p.a, b: fake.b, match: false }];
  }), rnd);
  const t = tracker(api, rounds.length);
  let i = 0;
  let locked = false;
  const card = h('div', { class: 'card mg-card' });
  const onKey = (e) => { if (e.key === 'ArrowLeft') answer(true); if (e.key === 'ArrowRight') answer(false); };
  document.addEventListener('keydown', onKey);
  function show() {
    if (i >= rounds.length) { t.finish(); return; }
    locked = false;
    const r = rounds[i];
    fill(card, h('div', { class: 'mg-count muted' }, `${i + 1} / ${rounds.length}`),
      h('div', { class: 'mg-pair' }, h('div', { class: 'mg-pcard' }, r.a), h('div', { class: 'mg-pcard alt' }, r.b)),
      h('div', { class: 'mg-tf-btns' },
        h('button', { class: 'btn big tf-true', onclick: () => answer(true) }, '✔ Pár'),
        h('button', { class: 'btn big tf-false', onclick: () => answer(false) }, '✘ Nem pár')));
  }
  function answer(v) {
    if (locked || i >= rounds.length) return;
    locked = true;
    const ok = v === rounds[i].match;
    if (ok) t.ok(); else t.bad();
    flash(card, ok);
    i++;
    setTimeout(show, ok ? 300 : 800);
  }
  fill(el, card);
  show();
  return () => document.removeEventListener('keydown', onKey);
}

// ---------------------------------------------------------------- Akasztófa
const ABC = 'AÁBCDEÉFGHIÍJKLMNOÓÖŐPQRSTUÚÜŰVWXYZ'.split('');
function hangmanGame(el, content, api) {
  const words = shuffle(content.pairs.filter((p) => p.a));
  const t = tracker(api, words.length);
  const LIVES = 7;
  let i = 0;
  let guessed;
  let lives;
  const card = h('div', { class: 'card mg-card' });
  const onKey = (e) => { const L = e.key.toLocaleUpperCase('hu-HU'); if (ABC.includes(L)) guess(L); };
  document.addEventListener('keydown', onKey);
  function wordChars() { return [...words[i].a.toLocaleUpperCase('hu-HU')]; }
  function show() {
    if (i >= words.length) { t.finish(); return; }
    const chars = wordChars();
    const solved = chars.every((ch) => !/\p{L}/u.test(ch) || guessed.has(ch));
    const lost = lives <= 0;
    fill(card,
      h('div', { class: 'mg-count muted' }, `${i + 1} / ${words.length}`),
      header(words[i].b || 'Találd ki a szót!'),
      h('div', { class: 'mg-hang' }, hangmanSvg(LIVES - lives), h('div', { class: 'mg-lives' }, '❤️'.repeat(Math.max(0, lives)) + '🤍'.repeat(LIVES - Math.max(0, lives)))),
      h('div', { class: 'mg-word' }, chars.map((ch) => (/\p{L}/u.test(ch)
        ? h('span', { class: `mg-letter ${guessed.has(ch) ? 'shown' : lost ? 'missed' : ''}` }, guessed.has(ch) || lost ? ch : '')
        : h('span', { class: 'mg-gap' }, ch === ' ' ? '' : ch)))),
      h('div', { class: 'mg-keys' }, ABC.map((L) => h('button', {
        class: `mg-key ${guessed.has(L) ? (chars.includes(L) ? 'hit' : 'miss') : ''}`,
        disabled: guessed.has(L) || solved || lost,
        onclick: () => guess(L),
      }, L))));
  }
  function guess(L) {
    if (i >= words.length || guessed.has(L) || lives <= 0) return;
    guessed.add(L);
    const chars = wordChars();
    if (!chars.includes(L)) lives--;
    const solved = chars.every((ch) => !/\p{L}/u.test(ch) || guessed.has(ch));
    show();
    if (solved) { t.ok(); flash(card, true); setTimeout(nextWord, 900); }
    else if (lives <= 0) { t.bad(); flash(card, false); setTimeout(nextWord, 1800); }
  }
  function nextWord() { i++; guessed = new Set(); lives = LIVES; show(); }
  guessed = new Set();
  lives = LIVES;
  fill(el, card);
  show();
  return () => document.removeEventListener('keydown', onKey);
}

function hangmanSvg(n) {
  const parts = [
    '<line x1="10" y1="95" x2="70" y2="95"/>', '<line x1="25" y1="95" x2="25" y2="8"/>', '<line x1="25" y1="8" x2="62" y2="8"/>',
    '<line x1="62" y1="8" x2="62" y2="20"/><circle cx="62" cy="28" r="8"/>', '<line x1="62" y1="36" x2="62" y2="62"/>',
    '<line x1="62" y1="44" x2="50" y2="54"/><line x1="62" y1="44" x2="74" y2="54"/>', '<line x1="62" y1="62" x2="52" y2="80"/><line x1="62" y1="62" x2="72" y2="80"/>',
  ];
  return h('div', { class: 'mg-gallows', html: `<svg viewBox="0 0 90 100" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round">${parts.slice(0, n).join('')}</svg>` });
}

// ---------------------------------------------------------------- Betűrakó
function spellGame(el, content, api) {
  const words = shuffle(content.pairs.filter((p) => p.a));
  const t = tracker(api, words.length);
  let i = 0;
  let slots;
  let tiles;
  const card = h('div', { class: 'card mg-card' });
  const onKey = (e) => {
    const L = e.key.toLocaleUpperCase('hu-HU');
    if (e.key === 'Backspace') { const last = [...slots].reverse().find((s) => s.tile); if (last) unplace(last); return; }
    const tile = tiles?.find((x) => !x.used && x.ch === L);
    if (tile) place(tile);
  };
  document.addEventListener('keydown', onKey);
  function setup() {
    if (i >= words.length) { t.finish(); return; }
    const chars = [...words[i].a.toLocaleUpperCase('hu-HU')];
    slots = chars.map((ch) => ({ ch, letter: /\p{L}/u.test(ch), tile: null }));
    tiles = shuffle(slots.filter((s) => s.letter).map((s, k) => ({ id: k, ch: s.ch, used: false })));
    render();
  }
  function render() {
    fill(card,
      h('div', { class: 'mg-count muted' }, `${i + 1} / ${words.length}`),
      header(words[i].b || 'Rakd ki a szót!'),
      h('div', { class: 'mg-word' }, slots.map((s) => (s.letter
        ? h('button', { class: `mg-letter slot ${s.tile ? 'shown' : ''}`, onclick: () => s.tile && unplace(s) }, s.tile ? s.tile.ch : '')
        : h('span', { class: 'mg-gap' }, s.ch === ' ' ? '' : s.ch)))),
      h('div', { class: 'mg-tiles' }, tiles.map((x) => h('button', { class: 'mg-key big', disabled: x.used, onclick: () => place(x) }, x.ch))),
      h('button', { class: 'btn ghost small', onclick: () => { t.bad(); i++; setup(); } }, 'Kihagyom'));
  }
  function place(tile) {
    const s = slots.find((x) => x.letter && !x.tile);
    if (!s) return;
    s.tile = tile; tile.used = true;
    render();
    if (slots.every((x) => !x.letter || x.tile)) {
      const ok = slots.every((x) => !x.letter || x.tile.ch === x.ch);
      flash(card, ok);
      if (ok) { t.ok(); setTimeout(() => { i++; setup(); }, 700); }
    }
  }
  function unplace(s) { s.tile.used = false; s.tile = null; render(); }
  fill(el, card);
  setup();
  return () => document.removeEventListener('keydown', onKey);
}

// ---------------------------------------------------------------- Szókereső
function wordsearchGame(el, content, api) {
  const ws = content.wordsearch;
  const t = tracker(api, ws.words.length);
  const found = new Set();
  let start = null;
  const cells = [];
  const gridEl = h('div', { class: 'mg-ws', style: { '--n': ws.size } });
  const listEl = h('div', { class: 'mg-ws-list' });
  ws.grid.forEach((row, r) => row.forEach((ch, c) => {
    const cell = h('div', { class: 'mg-ws-cell', 'data-r': r, 'data-c': c }, ch);
    cells.push(cell);
    gridEl.append(cell);
  }));
  const at = (r, c) => cells[r * ws.size + c];
  function renderList() {
    fill(listEl, ws.words.map((w, k) => h('span', { class: `chip-word ${found.has(k) ? 'found' : ''}` }, w.word)));
  }
  function line(a, b) {
    const dr = Math.sign(b.r - a.r);
    const dc = Math.sign(b.c - a.c);
    const n = Math.max(Math.abs(b.r - a.r), Math.abs(b.c - a.c)) + 1;
    if (!(a.r === b.r || a.c === b.c || Math.abs(b.r - a.r) === Math.abs(b.c - a.c))) return null;
    return Array.from({ length: n }, (_, i) => ({ r: a.r + dr * i, c: a.c + dc * i }));
  }
  function tryWord(a, b) {
    const ln = line(a, b);
    if (!ln) return false;
    const str = ln.map((p) => ws.grid[p.r][p.c]).join('');
    const k = ws.words.findIndex((w, j) => !found.has(j) && (w.letters === str || w.letters === [...str].reverse().join('')));
    if (k === -1) return false;
    found.add(k);
    const hue = (k * 47) % 360;
    ln.forEach((p) => { const e = at(p.r, p.c); e.classList.add('found'); e.style.setProperty('--h', hue); });
    t.ok();
    renderList();
    if (found.size === ws.words.length) setTimeout(() => t.finish(), 500);
    return true;
  }
  function cellFrom(e) {
    const x = e.clientX ?? e.touches?.[0]?.clientX;
    const y = e.clientY ?? e.touches?.[0]?.clientY;
    const target = document.elementFromPoint(x, y);
    if (!target?.classList.contains('mg-ws-cell')) return null;
    return { r: Number(target.dataset.r), c: Number(target.dataset.c) };
  }
  function clearSel() { cells.forEach((c) => c.classList.remove('sel')); }
  function showSel(a, b) {
    clearSel();
    const ln = b ? line(a, b) : [a];
    (ln || [a]).forEach((p) => at(p.r, p.c).classList.add('sel'));
  }
  let dragging = false;
  gridEl.addEventListener('pointerdown', (e) => {
    const p = cellFrom(e);
    if (!p) return;
    e.preventDefault();
    if (start && !dragging) {
      // második koppintás: vég
      const ok = tryWord(start, p);
      if (!ok && !(p.r === start.r && p.c === start.c)) { gridEl.classList.remove('mg-bad'); void gridEl.offsetWidth; gridEl.classList.add('mg-bad'); }
      start = null; clearSel();
      return;
    }
    start = p; dragging = true; showSel(p);
  });
  gridEl.addEventListener('pointermove', (e) => { if (!dragging || !start) return; const p = cellFrom(e); if (p) showSel(start, p); });
  const up = (e) => {
    if (!dragging) return;
    dragging = false;
    const p = cellFrom(e);
    if (p && start && (p.r !== start.r || p.c !== start.c)) { const ok = tryWord(start, p); if (!ok) { gridEl.classList.remove('mg-bad'); void gridEl.offsetWidth; gridEl.classList.add('mg-bad'); } start = null; clearSel(); }
    // ha ugyanott engedte fel: koppintás mód, várjuk a második koppintást
  };
  window.addEventListener('pointerup', up);
  renderList();
  fill(el, h('div', { class: 'card mg-card' }, header('Keresd meg a szavakat!', 'Húzd végig az ujjad/egeret a szón, vagy koppints az első és az utolsó betűjére.'), gridEl, listEl));
  return () => window.removeEventListener('pointerup', up);
}

// ---------------------------------------------------------------- Villámcsoportosító
function sortingGame(el, content, api) {
  const groups = content.groups;
  const items = shuffle(groups.flatMap((g, k) => g.items.map((text) => ({ text, k }))));
  const t = tracker(api, items.length);
  let i = 0;
  let locked = false;
  const card = h('div', { class: 'card mg-card' });
  const onKey = (e) => { const n = Number(e.key); if (n >= 1 && n <= groups.length) pick(n - 1); };
  document.addEventListener('keydown', onKey);
  function show() {
    if (i >= items.length) { t.finish(); return; }
    locked = false;
    fill(card, h('div', { class: 'mg-count muted' }, `${i + 1} / ${items.length}`),
      h('div', { class: 'mg-item fly' }, items[i].text),
      h('div', { class: 'mg-groups', style: { '--n': groups.length } }, groups.map((g, k) => h('button', { class: `mg-group g${k}`, onclick: () => pick(k) }, h('span', { class: 'muted small' }, `${k + 1}`), ' ', g.name))));
  }
  function pick(k) {
    if (locked || i >= items.length) return;
    locked = true;
    const ok = items[i].k === k;
    if (ok) t.ok(); else t.bad();
    flash(card, ok);
    i++;
    setTimeout(show, ok ? 250 : 700);
  }
  fill(el, card);
  show();
  return () => document.removeEventListener('keydown', onKey);
}

// ---------------------------------------------------------------- Szómágnes
function magnetsGame(el, content, api) {
  const sentences = shuffle(content.sentences);
  const t = tracker(api, sentences.length);
  let i = 0;
  let words;
  let built;
  const card = h('div', { class: 'card mg-card' });
  function setup() {
    if (i >= sentences.length) { t.finish(); return; }
    const parts = sentences[i].split(/\s+/).filter(Boolean);
    words = parts.map((w, k) => ({ id: k, w }));
    let sh = shuffle(words);
    for (let n = 0; n < 5 && sh.every((x, k) => x.id === k) && sh.length > 1; n++) sh = shuffle(words);
    words.shuffled = sh;
    built = [];
    render();
  }
  function render() {
    fill(card,
      h('div', { class: 'mg-count muted' }, `${i + 1} / ${sentences.length}`),
      header('Rakd sorba a szavakat!', 'Koppints a szavakra a helyes sorrendben. A rossz helyen lévőt koppintással visszateheted.'),
      h('div', { class: 'mg-sentence' }, built.length ? built.map((x) => h('button', { class: 'mg-magnet in', onclick: () => { built = built.filter((y) => y !== x); render(); } }, x.w)) : h('span', { class: 'muted' }, '…')),
      h('div', { class: 'mg-tiles' }, words.shuffled.map((x) => h('button', { class: 'mg-magnet', disabled: built.includes(x), onclick: () => add(x) }, x.w))),
      h('button', { class: 'btn ghost small', onclick: () => { t.bad(); i++; setup(); } }, 'Kihagyom'));
  }
  function add(x) {
    built.push(x);
    render();
    if (built.length === words.length) {
      const ok = built.map((y) => y.w).join(' ') === words.map((y) => y.w).join(' ');
      flash(card, ok);
      if (ok) { t.ok(); setTimeout(() => { i++; setup(); }, 800); }
    }
  }
  fill(el, card);
  setup();
  return () => {};
}

// ---------------------------------------------------------------- Labirintus
function mazeGame(el, content, api, seed) {
  const qs = shuffle(content.questions.filter((q) => q.q && q.correct));
  const t = tracker(api, qs.length);
  const maze = buildMaze(seed);
  const ZCOL = ['#ffc914', '#17bebb', '#f25f9a', '#7e5bef'];
  let qi = 0;
  let lives = 3;
  let player;
  let enemies;
  let options;
  let over = false;
  let invuln = 0;
  const canvas = h('canvas', { class: 'mg-maze' });
  const qEl = h('div', { class: 'mg-prompt' });
  const legend = h('div', { class: 'mg-legend' });
  const livesEl = h('div', { class: 'mg-lives' });
  const ctx = canvas.getContext('2d');
  const pad = h('div', { class: 'mg-dpad' },
    h('button', { class: 'up', onclick: () => move(-1, 0) }, '▲'), h('button', { class: 'left', onclick: () => move(0, -1) }, '◀'),
    h('button', { class: 'right', onclick: () => move(0, 1) }, '▶'), h('button', { class: 'down', onclick: () => move(1, 0) }, '▼'));
  function resetPositions() {
    player = { ...maze.start };
    const free = [];
    for (let r = 1; r < maze.h - 1; r++) for (let c = 1; c < maze.w - 1; c++) {
      if (maze.cells[r][c] === 0 && Math.abs(r - player.r) + Math.abs(c - player.c) > 5 && !zoneAt(r, c)) free.push({ r, c });
    }
    const n = Math.min(2 + Math.floor(qi / 3), 4);
    enemies = shuffle(free).slice(0, n);
    invuln = Date.now() + 1200;
  }
  function zoneAt(r, c) { return maze.zones.findIndex((z) => r >= z.r && r < z.r + z.h && c >= z.c && c < z.c + z.w); }
  function setupQuestion() {
    if (qi >= qs.length || lives <= 0) { over = true; t.finish(); draw(); return; }
    const q = qs[qi];
    options = shuffle([{ text: q.correct, ok: true }, ...q.wrong.map((w) => ({ text: w, ok: false }))]).slice(0, 4);
    qEl.textContent = q.q;
    fill(legend, options.map((o, k) => h('span', { class: 'mg-opt', style: { '--c': ZCOL[k] } }, o.text)));
    resetPositions();
    draw();
  }
  function renderLives() { livesEl.textContent = `${'❤️'.repeat(Math.max(0, lives))}${'🤍'.repeat(3 - Math.max(0, lives))}  ·  ${qi + 1 <= qs.length ? qi + 1 : qs.length} / ${qs.length}`; }
  function move(dr, dc) {
    if (over) return;
    const r = player.r + dr;
    const c = player.c + dc;
    if (maze.cells[r]?.[c] !== 0) return;
    player = { r, c };
    const z = zoneAt(r, c);
    if (z >= 0 && options[z]) {
      if (options[z].ok) { t.ok(); flash(canvas, true); } else { t.bad(); lives--; flash(canvas, false); }
      qi++;
      renderLives();
      setupQuestion();
      return;
    }
    checkHit();
    draw();
  }
  function checkHit() {
    if (Date.now() < invuln) return;
    if (enemies.some((e) => e.r === player.r && e.c === player.c)) {
      lives--;
      flash(canvas, false);
      renderLives();
      if (lives <= 0) { t.bad(); over = true; t.finish(); draw(); return; }
      resetPositions();
    }
  }
  const tick = setInterval(() => {
    if (over || !enemies) return;
    for (const e of enemies) {
      const opts = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dr, dc]) => maze.cells[e.r + dr]?.[e.c + dc] === 0 && zoneAt(e.r + dr, e.c + dc) < 0);
      if (!opts.length) continue;
      let pickd;
      if (Math.random() < 0.6) {
        pickd = opts.sort((a, b) => (Math.abs(e.r + a[0] - player.r) + Math.abs(e.c + a[1] - player.c)) - (Math.abs(e.r + b[0] - player.r) + Math.abs(e.c + b[1] - player.c)))[0];
      } else pickd = opts[Math.floor(Math.random() * opts.length)];
      e.r += pickd[0]; e.c += pickd[1];
    }
    checkHit();
    draw();
  }, 480);
  const onKey = (e) => {
    const m = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1], w: [-1, 0], s: [1, 0], a: [0, -1], d: [0, 1] }[e.key];
    if (m) { e.preventDefault(); move(...m); }
  };
  document.addEventListener('keydown', onKey);
  // húzás (swipe) telefonon
  let sw = null;
  canvas.addEventListener('touchstart', (e) => { sw = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }, { passive: true });
  canvas.addEventListener('touchend', (e) => {
    if (!sw) return;
    const dx = e.changedTouches[0].clientX - sw.x;
    const dy = e.changedTouches[0].clientY - sw.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) > 20) { if (Math.abs(dx) > Math.abs(dy)) move(0, Math.sign(dx)); else move(Math.sign(dy), 0); }
    sw = null;
  });
  function draw() {
    const cs = Math.floor(Math.min((el.clientWidth || 360) - 8, 720) / maze.w);
    canvas.width = cs * maze.w;
    canvas.height = cs * maze.h;
    ctx.fillStyle = '#fffdf7';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    maze.zones.forEach((z, k) => {
      if (!options?.[k]) return;
      ctx.fillStyle = `${ZCOL[k]}99`;
      ctx.fillRect(z.c * cs, z.r * cs, z.w * cs, z.h * cs);
      ctx.fillStyle = '#2b2d42';
      ctx.font = `bold ${Math.max(9, cs * 0.42)}px system-ui`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const txt = options[k].text.length > 10 ? `${options[k].text.slice(0, 9)}…` : options[k].text;
      ctx.fillText(txt, (z.c + 1) * cs, (z.r + 1) * cs);
    });
    for (let r = 0; r < maze.h; r++) for (let c = 0; c < maze.w; c++) {
      if (maze.cells[r][c] === 1) { ctx.fillStyle = '#2b2d42'; ctx.fillRect(c * cs, r * cs, cs, cs); }
    }
    const dot = (p, color, rr = 0.38) => { ctx.fillStyle = color; ctx.beginPath(); ctx.arc((p.c + 0.5) * cs, (p.r + 0.5) * cs, cs * rr, 0, Math.PI * 2); ctx.fill(); };
    enemies?.forEach((e) => dot(e, '#e4572e'));
    if (player) dot(player, Date.now() < invuln ? '#76b04188' : api.color || '#17bebb', 0.42);
    if (over) {
      ctx.fillStyle = '#2b2d42cc';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${cs}px system-ui`;
      ctx.textAlign = 'center';
      ctx.fillText(lives > 0 ? 'Kész! 🎉' : 'Elfogytak az életek', canvas.width / 2, canvas.height / 2);
    }
  }
  renderLives();
  fill(el, h('div', { class: 'card mg-card' }, qEl, legend, livesEl, canvas, pad, h('div', { class: 'muted small' }, 'Mozgás: nyilak / WASD, telefonon húzás vagy a gombok. Fuss a helyes válasz színes mezőjébe!')));
  setupQuestion();
  const onResize = () => draw();
  window.addEventListener('resize', onResize);
  return () => { clearInterval(tick); document.removeEventListener('keydown', onKey); window.removeEventListener('resize', onResize); };
}

// ---------------------------------------------------------------- Képrejtő kvíz
function imageQuizGame(el, content, api) {
  const qs = shuffle(content.questions.filter((q) => q.q && q.correct));
  const t = tracker(api, qs.length);
  const COLS = 6;
  const ROWS = 4;
  let i = 0;
  let timer = null;
  let covered;
  let buzzed;
  const card = h('div', { class: 'card mg-card' });
  function show() {
    clearInterval(timer);
    if (i >= qs.length) { t.finish(); return; }
    const q = qs[i];
    covered = shuffle(Array.from({ length: COLS * ROWS }, (_, k) => k));
    buzzed = false;
    const cover = h('div', { class: 'mg-cover', style: { '--cols': COLS, '--rows': ROWS } }, Array.from({ length: COLS * ROWS }, (_, k) => h('div', { 'data-k': k })));
    const opts = h('div', { class: 'mg-options' });
    const buzz = h('button', { class: 'btn primary big', onclick: () => doBuzz() }, '✋ Tudom!');
    const src = api.asset(q.image);
    fill(card, h('div', { class: 'mg-count muted' }, `${i + 1} / ${qs.length}`), header(q.q),
      h('div', { class: 'mg-img' }, src ? h('img', { src, alt: '' }) : h('div', { class: 'muted' }, 'Kép betöltése…'), cover), buzz, opts);
    function reveal() {
      const k = covered.pop();
      cover.querySelector(`[data-k="${k}"]`)?.classList.add('off');
      if (!covered.length) { clearInterval(timer); if (!buzzed) doBuzz(); }
    }
    reveal();
    timer = setInterval(reveal, 650);
    function doBuzz() {
      if (buzzed) return;
      buzzed = true;
      clearInterval(timer);
      buzz.hidden = true;
      const left = covered.length;
      const list = shuffle([{ text: q.correct, ok: true }, ...q.wrong.map((w) => ({ text: w, ok: false }))]);
      fill(opts, list.map((o) => h('button', {
        class: 'btn big mg-opt-btn',
        onclick: () => {
          const pts = o.ok ? PER + Math.round((PER * left) / (COLS * ROWS)) : 0;
          if (o.ok) t.ok(pts); else t.bad();
          cover.querySelectorAll('div').forEach((d) => d.classList.add('off'));
          opts.querySelectorAll('button').forEach((b) => { b.disabled = true; });
          flash(card, o.ok);
          i++;
          setTimeout(show, o.ok ? 900 : 1500);
        },
      }, o.text)));
    }
  }
  fill(el, card);
  show();
  return () => clearInterval(timer);
}

// ---------------------------------------------------------------- Ábracímkéző
function diagramGame(el, content, api) {
  const labels = content.labels;
  const t = tracker(api, labels.length);
  const assigned = new Map(); // pin index -> label index
  let selected = null;
  let checked = false;
  const order = shuffle(labels.map((_, k) => k));
  const card = h('div', { class: 'card mg-card' });
  function render() {
    const used = new Set(assigned.values());
    const src = api.asset(content.image);
    fill(card,
      header('Tedd a címkéket a helyükre!', 'Koppints egy címkére, majd a képen a jelölésre.'),
      h('div', { class: 'mg-diagram' }, src ? h('img', { src, alt: '' }) : h('div', { class: 'muted' }, 'Kép betöltése…'),
        labels.map((l, k) => {
          const li = assigned.get(k);
          const state = checked ? (li === k ? 'ok' : 'bad') : '';
          return h('button', {
            class: `mg-pin ${li != null ? 'filled' : ''} ${state}`,
            style: { left: `${l.x}%`, top: `${l.y}%` },
            onclick: () => pinClick(k),
          }, li != null ? labels[li].text : '?');
        })),
      h('div', { class: 'mg-tiles' }, order.map((k) => h('button', {
        class: `mg-magnet ${selected === k ? 'sel' : ''}`, disabled: used.has(k) || checked, onclick: () => { selected = selected === k ? null : k; render(); },
      }, labels[k].text))),
      !checked && assigned.size === labels.length ? h('button', { class: 'btn primary big', onclick: check }, 'Ellenőrzés') : null);
  }
  function pinClick(k) {
    if (checked) return;
    if (assigned.has(k) && selected == null) { assigned.delete(k); render(); return; }
    if (selected == null) return;
    for (const [pk, lv] of assigned) if (lv === selected) assigned.delete(pk);
    assigned.set(k, selected);
    selected = null;
    render();
  }
  function check() {
    checked = true;
    let ok = 0;
    for (const [pk, lv] of assigned) { if (pk === lv) ok++; }
    t.s.score = ok * PER; t.s.correct = ok; t.s.wrong = labels.length - ok;
    render();
    t.finish();
  }
  fill(el, card);
  render();
  return () => {};
}

export const CLIENTS = {
  type: typeGame,
  truefalse: trueFalseGame,
  memory: memoryGame,
  pairornot: pairOrNotGame,
  hangman: hangmanGame,
  spell: spellGame,
  wordsearch: wordsearchGame,
  sorting: sortingGame,
  magnets: magnetsGame,
  maze: mazeGame,
  imagequiz: imageQuizGame,
  diagram: diagramGame,
};

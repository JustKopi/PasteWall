// A minijátékok diák-oldali felülete. A helyes válaszokat a diák gépe NEM ismeri:
// minden lépésnél a tanári gépet kérdezi (api.act), ami titkosítva válaszol.
// start(el, api) -> destroy();  api: { start(), act(op, payload), asset(key), color, seed, finished(s) }

import { h, fill } from '../ui/dom.js';
import { buildMaze, shuffle } from './content.js';

function flash(el, ok) {
  el.classList.remove('mg-ok', 'mg-bad');
  void el.offsetWidth;
  el.classList.add(ok ? 'mg-ok' : 'mg-bad');
}
const header = (text, sub) => h('div', { class: 'mg-head' }, h('div', { class: 'mg-prompt' }, text), sub ? h('div', { class: 'mg-sub muted' }, sub) : null);
const count = (v) => h('div', { class: 'mg-count muted' }, `${v.i + 1} / ${v.total}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const isImg = (s) => typeof s === 'string' && s.startsWith('data:image/');

/** Közös keret: induló nézet lekérése, kész jelzés. */
function runner(el, api, onView) {
  let alive = true;
  const card = h('div', { class: 'card mg-card' }, h('p', { class: 'muted' }, 'Betöltés…'));
  fill(el, card);
  const done = (r) => { if (alive && r?.done) api.finished?.({ score: r.score, correct: r.correct, wrong: r.wrong }); return r?.done; };
  api.start().then((r) => { if (!alive) return; if (done(r) || !r?.view) return; onView(r.view, card); });
  return { card, done, alive: () => alive, stop: () => { alive = false; } };
}

// ---------------------------------------------------------------- Írd be a választ
function typeGame(el, api) {
  const input = h('input', { class: 'input big', autocomplete: 'off', spellcheck: false, placeholder: 'Válasz…' });
  const feedback = h('div', { class: 'mg-feedback' });
  let busy = false;
  const R = runner(el, api, show);
  function show(v) {
    const form = h('form', { class: 'ans-row', onsubmit: (e) => { e.preventDefault(); send('answer'); } }, input, h('button', { class: 'btn primary', type: 'submit' }, 'OK'));
    fill(R.card, count(v), header(v.prompt), form, feedback, h('button', { class: 'btn ghost small', onclick: () => send('skip') }, 'Kihagyom'));
    input.value = ''; feedback.textContent = ''; busy = false;
    input.focus();
  }
  async function send(op) {
    if (busy || (op === 'answer' && !input.value.trim())) return;
    busy = true;
    const r = await api.act(op, { text: input.value });
    if (!R.alive()) return;
    feedback.textContent = r.ok ? '✔ Helyes!' : `✘ A helyes válasz: ${r.correct ?? '—'}`;
    feedback.className = `mg-feedback ${r.ok ? 'ok' : 'bad'}`;
    flash(R.card, r.ok);
    await wait(r.ok ? 600 : 1600);
    if (!R.done(r) && r.view) show(r.view);
  }
  return () => R.stop();
}

// ---------------------------------------------------------------- Igaz vagy hamis
function trueFalseGame(el, api) {
  let timer = null;
  let answered = true;
  const bar = h('div', { class: 'mg-timebar' }, h('span'));
  const R = runner(el, api, show);
  const onKey = (e) => {
    if (['ArrowLeft', 'a', 'A', 'i', 'I'].includes(e.key)) answer(true);
    if (['ArrowRight', 'd', 'D', 'h', 'H'].includes(e.key)) answer(false);
  };
  document.addEventListener('keydown', onKey);
  function show(v) {
    answered = false;
    fill(R.card, count(v), h('div', { class: 'mg-statement fly' }, v.text), bar,
      h('div', { class: 'mg-tf-btns' },
        h('button', { class: 'btn big tf-true', onclick: () => answer(true) }, '✔ Igaz'),
        h('button', { class: 'btn big tf-false', onclick: () => answer(false) }, '✘ Hamis')));
    const span = bar.firstChild;
    span.style.transition = 'none'; span.style.width = '100%';
    requestAnimationFrame(() => requestAnimationFrame(() => { span.style.transition = `width ${v.secs}s linear`; span.style.width = '0%'; }));
    clearTimeout(timer);
    timer = setTimeout(() => answer(null), v.secs * 1000);
  }
  async function answer(value) {
    if (answered) return;
    answered = true;
    clearTimeout(timer);
    const r = await api.act('answer', { value });
    if (!R.alive()) return;
    flash(R.card, r.ok);
    await wait(r.ok ? 350 : 800);
    if (!R.done(r) && r.view) show(r.view);
  }
  return () => { R.stop(); clearTimeout(timer); document.removeEventListener('keydown', onKey); };
}

// ---------------------------------------------------------------- Párkereső
function memoryGame(el, api) {
  let open = [];
  let busy = false;
  const R = runner(el, api, (v) => {
    const grid = h('div', { class: 'mg-memory', style: { '--cols': v.tiles.length > 16 ? 6 : v.tiles.length > 12 ? 5 : 4 } });
    const tiles = v.tiles.map((t) => {
      const tile = { id: t.id, el: h('button', { class: 'mg-tile', onclick: () => flip(tile) }, h('span', { class: 'front' }, t.text), h('span', { class: 'back' }, '?')) };
      grid.append(tile.el);
      return tile;
    });
    fill(R.card, header('Keresd meg a párokat!', 'Fordíts fel két lapot — ha összetartoznak, a tiéd.'), grid);
    return tiles;
  });
  async function flip(tile) {
    if (busy || tile.done || open.includes(tile)) return;
    tile.el.classList.add('open');
    open.push(tile);
    if (open.length < 2) return;
    busy = true;
    const [x, y] = open;
    const r = await api.act('flip2', { a: x.id, b: y.id });
    if (!R.alive()) return;
    if (r.ok) { x.done = y.done = true; x.el.classList.add('matched'); y.el.classList.add('matched'); open = []; busy = false; }
    else { await wait(800); x.el.classList.remove('open'); y.el.classList.remove('open'); open = []; busy = false; }
    if (R.done(r)) return;
  }
  return () => R.stop();
}

// ---------------------------------------------------------------- Pár vagy nem pár?
function pairOrNotGame(el, api) {
  let locked = true;
  const R = runner(el, api, show);
  const onKey = (e) => {
    if (['ArrowLeft', 'a', 'A'].includes(e.key)) answer(true);
    if (['ArrowRight', 'd', 'D'].includes(e.key)) answer(false);
  };
  document.addEventListener('keydown', onKey);
  function show(v) {
    locked = false;
    fill(R.card, count(v),
      h('div', { class: 'mg-pair' }, h('div', { class: 'mg-pcard' }, v.a), h('div', { class: 'mg-pcard alt' }, v.b)),
      h('div', { class: 'mg-tf-btns' },
        h('button', { class: 'btn big tf-true', onclick: () => answer(true) }, '✔ Pár'),
        h('button', { class: 'btn big tf-false', onclick: () => answer(false) }, '✘ Nem pár')));
  }
  async function answer(match) {
    if (locked) return;
    locked = true;
    const r = await api.act('answer', { match });
    if (!R.alive()) return;
    flash(R.card, r.ok);
    await wait(r.ok ? 300 : 800);
    if (!R.done(r) && r.view) show(r.view);
  }
  return () => { R.stop(); document.removeEventListener('keydown', onKey); };
}

// ---------------------------------------------------------------- Akasztófa
const ABC = 'AÁBCDEÉFGHIÍJKLMNOÓÖŐPQRSTUÚÜŰVWXYZ'.split('');
function hangmanGame(el, api) {
  let cur = null;
  let busy = false;
  const R = runner(el, api, show);
  const onKey = (e) => { const L = e.key.toLocaleUpperCase('hu-HU'); if (ABC.includes(L)) guess(L); };
  document.addEventListener('keydown', onKey);
  function show(v) {
    cur = v;
    const fin = Boolean(v.outcome);
    fill(R.card, count(v), header(v.clue || 'Találd ki a szót!'),
      h('div', { class: 'mg-hang' }, hangmanSvg(v.maxLives - v.lives), h('div', { class: 'mg-lives' }, '❤️'.repeat(Math.max(0, v.lives)) + '🤍'.repeat(v.maxLives - Math.max(0, v.lives)))),
      h('div', { class: 'mg-word' }, v.pattern.map((ch, k) => (ch === null || /\p{L}/u.test(ch || '')
        ? h('span', { class: `mg-letter ${ch && !(v.outcome === 'lost' && !v.guessed.includes(ch)) ? 'shown' : ''} ${v.outcome === 'lost' && ch && !v.guessed.includes(ch) ? 'missed' : ''}`, 'data-k': k }, ch || '')
        : h('span', { class: 'mg-gap' }, ch === ' ' ? '' : ch)))),
      h('div', { class: 'mg-keys' }, ABC.map((L) => h('button', {
        class: `mg-key ${v.guessed.includes(L) ? (v.pattern.includes(L) ? 'hit' : 'miss') : ''}`,
        disabled: v.guessed.includes(L) || fin,
        onclick: () => guess(L),
      }, L))));
  }
  async function guess(L) {
    if (busy || !cur || cur.outcome || cur.guessed.includes(L)) return;
    busy = true;
    const r = await api.act('letter', { letter: L });
    busy = false;
    if (!R.alive() || !r.view) return;
    show(r.view);
    if (r.view.outcome) {
      flash(R.card, r.view.outcome === 'won');
      await wait(r.view.outcome === 'won' ? 900 : 1800);
      const n = await api.act('next');
      if (!R.alive()) return;
      if (!R.done(n) && n.view) show(n.view);
    }
  }
  return () => { R.stop(); document.removeEventListener('keydown', onKey); };
}

function hangmanSvg(n) {
  const parts = [
    '<line x1="10" y1="95" x2="70" y2="95"/>', '<line x1="25" y1="95" x2="25" y2="8"/>', '<line x1="25" y1="8" x2="62" y2="8"/>',
    '<line x1="62" y1="8" x2="62" y2="20"/><circle cx="62" cy="28" r="8"/>', '<line x1="62" y1="36" x2="62" y2="62"/>',
    '<line x1="62" y1="44" x2="50" y2="54"/><line x1="62" y1="44" x2="74" y2="54"/>', '<line x1="62" y1="62" x2="52" y2="80"/><line x1="62" y1="62" x2="72" y2="80"/>',
  ];
  return h('div', { class: 'mg-gallows', html: `<svg viewBox="0 0 90 100" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round">${parts.slice(0, Math.max(0, n)).join('')}</svg>` });
}

// ---------------------------------------------------------------- Betűrakó
function spellGame(el, api) {
  let v = null;
  let slots = [];
  let tiles = [];
  let busy = false;
  const R = runner(el, api, setup);
  const onKey = (e) => {
    if (!v) return;
    if (e.key === 'Backspace') { const last = [...slots].reverse().find((s) => s.tile); if (last) unplace(last); return; }
    const L = e.key.toLocaleUpperCase('hu-HU');
    const tile = tiles.find((x) => !x.used && x.ch === L);
    if (tile) place(tile);
  };
  document.addEventListener('keydown', onKey);
  function setup(view) {
    v = view;
    slots = v.slots.map((x) => ({ letter: x === 1, ch: x === 1 ? null : x, tile: null }));
    tiles = v.tiles.map((ch, id) => ({ id, ch, used: false }));
    render();
  }
  function render() {
    fill(R.card, count(v), header(v.clue || 'Rakd ki a szót!'),
      h('div', { class: 'mg-word' }, slots.map((s) => (s.letter
        ? h('button', { class: `mg-letter slot ${s.tile ? 'shown' : ''}`, onclick: () => s.tile && unplace(s) }, s.tile ? s.tile.ch : '')
        : h('span', { class: 'mg-gap' }, s.ch === ' ' ? '' : s.ch)))),
      h('div', { class: 'mg-tiles' }, tiles.map((x) => h('button', { class: 'mg-key big', disabled: x.used, onclick: () => place(x) }, x.ch))),
      h('button', { class: 'btn ghost small', onclick: () => skip() }, 'Kihagyom'));
  }
  async function place(tile) {
    const s = slots.find((x) => x.letter && !x.tile);
    if (!s || busy) return;
    s.tile = tile; tile.used = true;
    render();
    if (slots.every((x) => !x.letter || x.tile)) {
      busy = true;
      const r = await api.act('submit', { letters: slots.filter((x) => x.letter).map((x) => x.tile.ch) });
      busy = false;
      if (!R.alive()) return;
      flash(R.card, r.ok);
      if (r.ok) { await wait(700); if (!R.done(r) && r.view) setup(r.view); }
    }
  }
  function unplace(s) { s.tile.used = false; s.tile = null; render(); }
  async function skip() {
    if (busy) return;
    busy = true;
    const r = await api.act('skip');
    busy = false;
    if (R.alive() && !R.done(r) && r.view) setup(r.view);
  }
  return () => { R.stop(); document.removeEventListener('keydown', onKey); };
}

// ---------------------------------------------------------------- Szókereső
function wordsearchGame(el, api) {
  let cells = [];
  let size = 0;
  let words = [];
  let start = null;
  let dragging = false;
  const gridEl = h('div', { class: 'mg-ws' });
  const listEl = h('div', { class: 'mg-ws-list' });
  const at = (r, c) => cells[r * size + c];
  const R = runner(el, api, (v) => {
    size = v.size;
    words = v.words;
    gridEl.style.setProperty('--n', size);
    cells = [];
    fill(gridEl);
    v.grid.forEach((row, r) => row.forEach((ch, c) => { const cell = h('div', { class: 'mg-ws-cell', 'data-r': r, 'data-c': c }, ch); cells.push(cell); gridEl.append(cell); }));
    renderList();
    fill(R.card, header('Keresd meg a szavakat!', 'Húzd végig az ujjad/egeret a szón, vagy koppints az első és az utolsó betűjére.'), gridEl, listEl);
  });
  function renderList() { fill(listEl, words.map((w) => h('span', { class: `chip-word ${w.found ? 'found' : ''}` }, w.word))); }
  function line(a, b) {
    if (!(a.r === b.r || a.c === b.c || Math.abs(b.r - a.r) === Math.abs(b.c - a.c))) return null;
    const dr = Math.sign(b.r - a.r);
    const dc = Math.sign(b.c - a.c);
    const n = Math.max(Math.abs(b.r - a.r), Math.abs(b.c - a.c)) + 1;
    return Array.from({ length: n }, (_, i) => ({ r: a.r + dr * i, c: a.c + dc * i }));
  }
  async function tryWord(a, b) {
    if (!line(a, b)) { flash(gridEl, false); return; }
    const r = await api.act('select', { r1: a.r, c1: a.c, r2: b.r, c2: b.c });
    if (!R.alive()) return;
    if (!r.ok) { flash(gridEl, false); return; }
    words[r.k].found = true;
    const hue = (r.k * 47) % 360;
    r.cells.forEach(([rr, cc]) => { const e = at(rr, cc); e.classList.add('found'); e.style.setProperty('--h', hue); });
    renderList();
    R.done(r);
  }
  function cellFrom(e) {
    const t = document.elementFromPoint(e.clientX, e.clientY);
    return t?.classList.contains('mg-ws-cell') ? { r: Number(t.dataset.r), c: Number(t.dataset.c) } : null;
  }
  const clearSel = () => cells.forEach((c) => c.classList.remove('sel'));
  const showSel = (a, b) => { clearSel(); (b ? line(a, b) || [a] : [a]).forEach((p) => at(p.r, p.c).classList.add('sel')); };
  gridEl.addEventListener('pointerdown', (e) => {
    const p = cellFrom(e);
    if (!p) return;
    e.preventDefault();
    if (start && !dragging) {
      if (p.r !== start.r || p.c !== start.c) tryWord(start, p);
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
    if (p && start && (p.r !== start.r || p.c !== start.c)) { tryWord(start, p); start = null; clearSel(); }
  };
  window.addEventListener('pointerup', up);
  return () => { R.stop(); window.removeEventListener('pointerup', up); };
}

// ---------------------------------------------------------------- Villámcsoportosító
function sortingGame(el, api) {
  let locked = true;
  let n = 0;
  const R = runner(el, api, show);
  const onKey = (e) => { const k = Number(e.key); if (k >= 1 && k <= n) pick(k - 1); };
  document.addEventListener('keydown', onKey);
  function show(v) {
    locked = false;
    n = v.groups.length;
    fill(R.card, count(v), h('div', { class: 'mg-item fly' }, v.item),
      h('div', { class: 'mg-groups', style: { '--n': n } }, v.groups.map((g, k) => h('button', { class: `mg-group g${k}`, onclick: () => pick(k) }, h('span', { class: 'muted small' }, `${k + 1}`), ' ', g))));
  }
  async function pick(k) {
    if (locked) return;
    locked = true;
    const r = await api.act('answer', { group: k });
    if (!R.alive()) return;
    flash(R.card, r.ok);
    await wait(r.ok ? 250 : 700);
    if (!R.done(r) && r.view) show(r.view);
  }
  return () => { R.stop(); document.removeEventListener('keydown', onKey); };
}

// ---------------------------------------------------------------- Szómágnes
function magnetsGame(el, api) {
  let v = null;
  let built = [];
  let busy = false;
  const R = runner(el, api, setup);
  function setup(view) { v = view; built = []; render(); }
  function render() {
    fill(R.card, count(v), header('Rakd sorba a szavakat!', 'Koppints a szavakra a helyes sorrendben. A rossz helyen lévőt koppintással visszateheted.'),
      h('div', { class: 'mg-sentence' }, built.length ? built.map((x) => h('button', { class: 'mg-magnet in', onclick: () => { built = built.filter((y) => y !== x); render(); } }, x.w)) : h('span', { class: 'muted' }, '…')),
      h('div', { class: 'mg-tiles' }, v.words.map((x) => h('button', { class: 'mg-magnet', disabled: built.includes(x), onclick: () => add(x) }, x.w))),
      h('button', { class: 'btn ghost small', onclick: skip }, 'Kihagyom'));
  }
  async function add(x) {
    if (busy) return;
    built.push(x);
    render();
    if (built.length === v.words.length) {
      busy = true;
      const r = await api.act('submit', { ids: built.map((y) => y.id) });
      busy = false;
      if (!R.alive()) return;
      flash(R.card, r.ok);
      if (r.ok) { await wait(800); if (!R.done(r) && r.view) setup(r.view); }
    }
  }
  async function skip() {
    if (busy) return;
    busy = true;
    const r = await api.act('skip');
    busy = false;
    if (R.alive() && !R.done(r) && r.view) setup(r.view);
  }
  return () => R.stop();
}

// ---------------------------------------------------------------- Labirintus
const KEYMAP = {
  arrowup: [-1, 0], arrowdown: [1, 0], arrowleft: [0, -1], arrowright: [0, 1],
  w: [-1, 0], s: [1, 0], a: [0, -1], d: [0, 1],
};
function mazeGame(el, api) {
  const maze = buildMaze(api.seed || 1);
  const ZCOL = ['#ffc914', '#17bebb', '#f25f9a', '#7e5bef'];
  let v = null;
  let player = { ...maze.start };
  let enemies = [];
  let over = false;
  let busy = false;
  let invuln = 0;
  const held = new Map(); // lenyomva tartott irány-gombok -> utolsó lépés ideje
  const canvas = h('canvas', { class: 'mg-maze', tabindex: 0 });
  const qEl = h('div', { class: 'mg-prompt' });
  const legend = h('div', { class: 'mg-legend' });
  const livesEl = h('div', { class: 'mg-lives' });
  const ctx = canvas.getContext('2d');
  const pad = h('div', { class: 'mg-dpad' },
    h('button', { class: 'up', onpointerdown: () => move(-1, 0) }, '▲'), h('button', { class: 'left', onpointerdown: () => move(0, -1) }, '◀'),
    h('button', { class: 'right', onpointerdown: () => move(0, 1) }, '▶'), h('button', { class: 'down', onpointerdown: () => move(1, 0) }, '▼'));
  const zoneAt = (r, c) => maze.zones.findIndex((z) => r >= z.r && r < z.r + z.h && c >= z.c && c < z.c + z.w);

  function resetPositions() {
    player = { ...maze.start };
    const free = [];
    for (let r = 1; r < maze.h - 1; r++) for (let c = 1; c < maze.w - 1; c++) {
      if (maze.cells[r][c] === 0 && Math.abs(r - player.r) + Math.abs(c - player.c) > 5 && zoneAt(r, c) < 0) free.push({ r, c });
    }
    enemies = shuffle(free).slice(0, Math.min(2 + Math.floor((v?.i || 0) / 3), 4));
    invuln = Date.now() + 1200;
  }
  function setView(view) {
    v = view;
    if (!v) { over = true; draw(); return; }
    qEl.textContent = v.q;
    fill(legend, v.options.map((o, k) => h('span', { class: 'mg-opt', style: { '--c': ZCOL[k] } }, o)));
    livesEl.textContent = `${'❤️'.repeat(Math.max(0, v.lives))}${'🤍'.repeat(3 - Math.max(0, v.lives))}  ·  ${v.i + 1} / ${v.total}`;
    resetPositions();
    draw();
  }
  const R = runner(el, api, (view) => {
    fill(R.card, qEl, legend, livesEl, canvas, pad, h('div', { class: 'muted small' }, 'Mozgás: W A S D vagy nyilak (nyomva tartva folyamatos), telefonon húzás vagy a gombok. Fuss a helyes válasz színes mezőjébe!'));
    setView(view);
    canvas.focus({ preventScroll: true });
  });

  async function move(dr, dc) {
    if (over || busy || !v) return;
    const r = player.r + dr;
    const c = player.c + dc;
    if (maze.cells[r]?.[c] !== 0) return;
    player = { r, c };
    const z = zoneAt(r, c);
    if (z >= 0 && v.options[z] !== undefined) {
      busy = true;
      const res = await api.act('zone', { k: z });
      busy = false;
      if (!R.alive()) return;
      flash(canvas, res.ok);
      if (R.done(res)) { over = true; draw(); return; }
      if (res.view) setView(res.view);
      return;
    }
    checkHit();
    draw();
  }
  async function checkHit() {
    if (Date.now() < invuln || busy) return;
    if (enemies.some((e) => e.r === player.r && e.c === player.c)) {
      invuln = Date.now() + 1500;
      flash(canvas, false);
      busy = true;
      const res = await api.act('hit');
      busy = false;
      if (!R.alive()) return;
      if (v) { v.lives = res.lives; livesEl.textContent = `${'❤️'.repeat(Math.max(0, v.lives))}${'🤍'.repeat(3 - Math.max(0, v.lives))}  ·  ${v.i + 1} / ${v.total}`; }
      if (R.done(res)) { over = true; draw(); return; }
      resetPositions();
      draw();
    }
  }
  const enemyTick = setInterval(() => {
    if (over || !v || busy) return;
    for (const e of enemies) {
      const opts = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dr, dc]) => maze.cells[e.r + dr]?.[e.c + dc] === 0 && zoneAt(e.r + dr, e.c + dc) < 0);
      if (!opts.length) continue;
      const pickd = Math.random() < 0.6
        ? opts.sort((a, b) => (Math.abs(e.r + a[0] - player.r) + Math.abs(e.c + a[1] - player.c)) - (Math.abs(e.r + b[0] - player.r) + Math.abs(e.c + b[1] - player.c)))[0]
        : opts[Math.floor(Math.random() * opts.length)];
      e.r += pickd[0]; e.c += pickd[1];
    }
    checkHit();
    draw();
  }, 480);

  // billentyűzet: WASD és nyilak, kis- és nagybetűvel (Caps Lock), nyomva tartva ismétel
  const keyOf = (e) => (e.code && /^Key[WASD]$/.test(e.code) ? e.code.slice(3).toLowerCase() : String(e.key || '').toLowerCase());
  const onDown = (e) => {
    if (e.target?.tagName === 'INPUT' || e.target?.tagName === 'TEXTAREA') return;
    const k = keyOf(e);
    const m = KEYMAP[k];
    if (!m) return;
    e.preventDefault();
    if (!held.has(k)) { held.set(k, Date.now()); move(...m); }
  };
  const onUp = (e) => held.delete(keyOf(e));
  const onBlur = () => held.clear();
  const repeat = setInterval(() => {
    const now = Date.now();
    for (const [k, t] of held) if (now - t >= 140) { held.set(k, now); move(...KEYMAP[k]); }
  }, 30);
  document.addEventListener('keydown', onDown);
  document.addEventListener('keyup', onUp);
  window.addEventListener('blur', onBlur);

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
      if (!v || v.options[k] === undefined) return;
      ctx.fillStyle = `${ZCOL[k]}99`;
      ctx.fillRect(z.c * cs, z.r * cs, z.w * cs, z.h * cs);
      ctx.fillStyle = '#2b2d42';
      ctx.font = `bold ${Math.max(9, cs * 0.42)}px system-ui`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const t = v.options[k];
      ctx.fillText(t.length > 10 ? `${t.slice(0, 9)}…` : t, (z.c + 1) * cs, (z.r + 1) * cs);
    });
    for (let r = 0; r < maze.h; r++) for (let c = 0; c < maze.w; c++) {
      if (maze.cells[r][c] === 1) { ctx.fillStyle = '#2b2d42'; ctx.fillRect(c * cs, r * cs, cs, cs); }
    }
    const dot = (p, color, rr = 0.38) => { ctx.fillStyle = color; ctx.beginPath(); ctx.arc((p.c + 0.5) * cs, (p.r + 0.5) * cs, cs * rr, 0, Math.PI * 2); ctx.fill(); };
    enemies.forEach((e) => dot(e, '#e4572e'));
    dot(player, Date.now() < invuln ? '#76b04188' : api.color || '#17bebb', 0.42);
    if (over) {
      ctx.fillStyle = '#2b2d42cc';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${cs}px system-ui`;
      ctx.textAlign = 'center';
      ctx.fillText('Vége! 🎉', canvas.width / 2, canvas.height / 2);
    }
  }
  const onResize = () => draw();
  window.addEventListener('resize', onResize);
  return () => {
    R.stop(); clearInterval(enemyTick); clearInterval(repeat);
    document.removeEventListener('keydown', onDown); document.removeEventListener('keyup', onUp);
    window.removeEventListener('blur', onBlur); window.removeEventListener('resize', onResize);
  };
}

// ---------------------------------------------------------------- Képrejtő kvíz
function imageQuizGame(el, api) {
  let timer = null;
  const R = runner(el, api, show);
  function show(v) {
    clearInterval(timer);
    let buzzed = false;
    let idx = 0;
    const cover = h('div', { class: 'mg-cover', style: { '--cols': 6, '--rows': 4 } }, Array.from({ length: v.cells }, (_, k) => h('div', { 'data-k': k })));
    const opts = h('div', { class: 'mg-options' });
    const buzz = h('button', { class: 'btn primary big', onclick: () => doBuzz() }, '✋ Tudom!');
    const src = api.asset(v.image);
    fill(R.card, count(v), header(v.q),
      h('div', { class: 'mg-img' }, isImg(src) ? h('img', { src, alt: '' }) : h('div', { class: 'muted' }, 'Kép betöltése…'), cover), buzz, opts);
    const reveal = () => {
      const k = v.order[idx++];
      cover.querySelector(`[data-k="${k}"]`)?.classList.add('off');
      if (idx >= v.cells) { clearInterval(timer); if (!buzzed) doBuzz(); }
    };
    reveal();
    timer = setInterval(reveal, v.ms);
    async function doBuzz() {
      if (buzzed) return;
      buzzed = true;
      clearInterval(timer);
      buzz.hidden = true;
      const r = await api.act('buzz');
      if (!R.alive()) return;
      fill(opts, (r.options || []).map((text, k) => h('button', {
        class: 'btn big mg-opt-btn',
        onclick: async () => {
          opts.querySelectorAll('button').forEach((b) => { b.disabled = true; });
          const res = await api.act('choose', { k });
          if (!R.alive()) return;
          cover.querySelectorAll('div').forEach((d) => d.classList.add('off'));
          opts.children[res.correct]?.classList.add('right');
          flash(R.card, res.ok);
          await wait(res.ok ? 900 : 1500);
          if (!R.done(res) && res.view) show(res.view);
        },
      }, text)));
    }
  }
  return () => { R.stop(); clearInterval(timer); };
}

// ---------------------------------------------------------------- Ábracímkéző
function diagramGame(el, api) {
  let v = null;
  const assigned = new Map(); // pin id -> label id
  let selected = null;
  let results = null;
  const R = runner(el, api, (view) => { v = view; render(); });
  function render() {
    const used = new Set(assigned.values());
    const src = api.asset(v.image);
    const text = (lid) => v.labels.find((l) => l.id === lid)?.text;
    fill(R.card, header('Tedd a címkéket a helyükre!', 'Koppints egy címkére, majd a képen a jelölésre.'),
      h('div', { class: 'mg-diagram' }, isImg(src) ? h('img', { src, alt: '' }) : h('div', { class: 'muted' }, 'Kép betöltése…'),
        v.pins.map((p) => {
          const lid = assigned.get(p.id);
          const st = results ? (results[p.id] ? 'ok' : 'bad') : '';
          return h('button', { class: `mg-pin ${lid != null ? 'filled' : ''} ${st}`, style: { left: `${p.x}%`, top: `${p.y}%` }, onclick: () => pinClick(p.id) }, lid != null ? text(lid) : '?');
        })),
      h('div', { class: 'mg-tiles' }, v.labels.map((l) => h('button', {
        class: `mg-magnet ${selected === l.id ? 'sel' : ''}`, disabled: used.has(l.id) || Boolean(results), onclick: () => { selected = selected === l.id ? null : l.id; render(); },
      }, l.text))),
      !results && assigned.size === v.pins.length ? h('button', { class: 'btn primary big', onclick: check }, 'Ellenőrzés') : null);
  }
  function pinClick(pid) {
    if (results) return;
    if (assigned.has(pid) && selected == null) { assigned.delete(pid); render(); return; }
    if (selected == null) return;
    for (const [k, lid] of assigned) if (lid === selected) assigned.delete(k);
    assigned.set(pid, selected);
    selected = null;
    render();
  }
  async function check() {
    const r = await api.act('submit', { assign: Object.fromEntries(assigned) });
    if (!R.alive()) return;
    results = r.results || {};
    render();
    R.done(r);
  }
  return () => R.stop();
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

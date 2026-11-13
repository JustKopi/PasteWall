import { h, fill, toast } from './dom.js';
import { makeGridView, renderClues, knownBandLetter } from './grid.js';
import { AnswerController } from './answer.js';
import { tokenize } from '../crossword/hu.js';
import { openRoom } from '../live/transport.js';
import { MODES, POINTS } from '../live/game.js';

function playerId(code) {
  const k = `pastewall.player.${code}`;
  // fülönként külön játékos (újratöltés után is ugyanaz marad)
  let id = sessionStorage.getItem(k);
  if (!id) { id = `p-${crypto.getRandomValues(new Uint32Array(2)).join('')}`; sessionStorage.setItem(k, id); }
  return id;
}

export function joinPage(root, presetCode = '') {
  const code = h('input', { class: 'input big code-input', placeholder: 'KÓD', maxlength: 6, value: presetCode, autocapitalize: 'characters' });
  const name = h('input', { class: 'input big', placeholder: 'A neved', maxlength: 24, value: localStorage.getItem('pastewall.name') || '' });
  const go = (e) => {
    e?.preventDefault();
    const c = code.value.trim().toUpperCase();
    const n = name.value.trim();
    if (c.length !== 6) { toast('A kód 6 karakter.', 'warn'); return; }
    if (!n) { toast('Írd be a neved!', 'warn'); return; }
    localStorage.setItem('pastewall.name', n);
    sessionStorage.setItem(`pastewall.joined.${c}`, '1');
    const target = `#/play/${c}`;
    // QR-kódból érkezve már ezen a címen vagyunk: ilyenkor nincs hashchange, kézzel kell továbblépni.
    if (location.hash === target) window.dispatchEvent(new HashChangeEvent('hashchange'));
    else location.hash = target;
  };
  fill(root, h('div', { class: 'page narrow' }, h('form', { class: 'card join', onsubmit: go },
    h('h2', {}, 'Belépés a játékba'),
    code, name,
    h('button', { class: 'btn primary big', type: 'submit' }, 'Belépek'),
    h('a', { href: '#/', class: 'muted' }, '← Kezdőlap'),
  )));
  (presetCode ? name : code).focus();
}

export function playPage(root, code) {
  const name = localStorage.getItem('pastewall.name');
  if (!name || !sessionStorage.getItem(`pastewall.joined.${code}`)) { joinPage(root, code); return; }

  const me = { id: playerId(code), name, role: 'player' };
  let st = null;
  let room = null;
  let round = null;
  const mine = new Map(); // verseny: saját megoldott sorok (row -> tokens)
  const myBands = new Set();
  const myBandTokens = new Map(); // verseny: a saját eltalált megfejtés betűi
  const ghosts = new Map();
  let votedFor = null;
  let turnEndsLocal = null;
  let lastTurnKey = null;
  let gridView = null;
  let lastGuess = null;
  let lastSolution = null; // verseny módban a saját helyes válasz betűi kellenek

  const shared = () => st && st.mode !== 'race';
  const myTurn = () => st?.mode === 'turns' && st.turn?.playerId === me.id;
  const canAnswer = () => st?.status === 'playing' && !st.revealed && (st.mode !== 'turns' || myTurn());
  const canGuessSolution = () => st?.status === 'playing' && !st.revealed; // a megfejtést bárki tippelheti, bármikor
  const isSolved = (r) => (shared() ? Boolean(st.solved[r]) : mine.has(r));
  const pname = (id) => st?.players.find((p) => p.id === id)?.name || '?';
  const pcolor = (id) => st?.players.find((p) => p.id === id)?.color || '#999';

  const answers = new AnswerController({
    getPub: () => st?.puzzle,
    canAnswer,
    onSubmit: (row, tokens) => { lastGuess = { row, tokens }; room?.send('guess', { id: me.id, row, tokens }); },
    onTyping: (row, tokens) => { if (shared()) room?.send('typing', { id: me.id, row, tokens: tokens.some(Boolean) ? tokens : [] }); },
    onChange: () => renderGrid(),
  });

  const status = h('span', { class: 'conn' }, 'Kapcsolódás…');
  const head = h('div', { class: 'play-head' });
  const lobby = h('div', { class: 'card lobby' });
  const turnBox = h('div', { class: 'turn-box' });
  const gridBox = h('div', { class: 'grid-box' });
  const legend = h('div', { class: 'band-legend' });

  const solBand = h('select', { class: 'input' });
  const solInput = h('input', { class: 'input', placeholder: 'Szerintem a megfejtés…', autocomplete: 'off' });
  const solForm = h('form', { class: 'solution card', onsubmit: (e) => { e.preventDefault(); submitSolution(); } },
    h('strong', {}, `Megfejtés tipp (+${POINTS.solution} pont, korán +${POINTS.solutionBonus})`),
    h('div', { class: 'ans-row' }, solBand, solInput, h('button', { class: 'btn', type: 'submit' }, 'Tippelek')),
    h('div', { class: 'muted small' }, 'Bárki tippelhet, csak a leggyorsabb kap pontot. Ha még a betűk fele sem látszik, jár a bónusz.'));
  const cluesBox = h('div', { class: 'card clues-card' });
  const boardBox = h('div', { class: 'card mini-board' });
  const main = h('div', { class: 'play-main' },
    h('div', { class: 'play-left' }, turnBox, gridBox),
    h('div', { class: 'play-side' }, answers.el, solForm, cluesBox, boardBox));

  fill(root, h('div', { class: 'page play' }, head, lobby, main));

  function submitSolution() {
    if (!canGuessSolution() || !solInput.value.trim()) return;
    lastSolution = tokenize(solInput.value, { digraphs: st.puzzle.digraphs !== false });
    room?.send('solution', { id: me.id, band: Number(solBand.value), text: solInput.value });
  }

  function onResult(p) {
    if (p.kind === 'timeout' && p.id === me.id) { toast('Lejárt az idő!', 'warn'); return; }
    if (p.id !== me.id) {
      if (p.kind === 'solution' && p.correct && !p.late) toast(`🏆 ${pname(p.id)} megfejtette!`, 'ok');
      else if (st?.mode === 'turns' && p.kind === 'row') toast(`${pname(p.id)}: ${p.correct ? 'helyes ✔' : 'nem talált ✘'}`, p.correct ? 'ok' : 'info');
      return;
    }
    if (p.kind === 'row') {
      if (p.correct) {
        if (lastGuess?.row === p.row) mine.set(p.row, lastGuess.tokens);
        toast(`Helyes! +${POINTS.row} pont`, 'ok');
      } else {
        toast('Sajnos nem ez a megoldás.', 'bad');
      }
      answers.result(p.row, p.correct);
    } else if (p.kind === 'solution') {
      if (p.late) toast(p.correct ? `Jó volt, de ${pname(p.by)} gyorsabb volt!` : 'Nem ez a megfejtés.', 'info');
      else if (p.correct) {
        myBands.add(p.band);
        myBandTokens.set(p.band, lastSolution);
        solInput.value = '';
        toast(`Eltaláltad a megfejtést! +${POINTS.solution + (p.bonus ? POINTS.solutionBonus : 0)} pont${p.bonus ? ' (korai bónusz!)' : ''}`, 'ok');
      } else toast('Nem ez a megfejtés.', 'bad');
    }
    render();
  }

  function renderGrid() {
    if (!st || st.status === 'lobby') return;
    const pz = st.puzzle;
    if (!gridView) {
      gridView = makeGridView(pz, { onRow: (r, i) => { if (canAnswer() && !isSolved(r)) answers.select(r, i); } });
      fill(gridBox, h('div', { class: 'card grid-card' }, gridView.el, legend));
    }
    const now = Date.now();
    for (const [id, g] of ghosts) if (now - g.at > 5000 || isSolved(g.row)) ghosts.delete(id);
    gridView.setClickable(canAnswer());
    gridView.update(
      (r, i) => {
        if (st.revealAll && !(shared() && st.solved[r]) && !mine.has(r)) return { text: st.revealAll[r][i], cls: 'revealed' };
        if (shared() && st.solved[r]) return { text: st.solved[r].tokens[i], cls: 'solved', color: st.solved[r].by ? pcolor(st.solved[r].by) : null };
        if (mine.has(r)) return { text: mine.get(r)[i], cls: 'solved', color: pcolor(me.id) };
        const d = answers.cellInfo(r, i);
        if (d) return d;
        const bl = knownBandLetter(pz, st.bands.map((b, k) => b.tokens || (myBands.has(k) && myBandTokens.get(k)) || null), r, i);
        if (bl) return { text: bl, cls: 'band-known' };
        for (const [id, g] of ghosts) if (g.row === r && g.tokens[i]) return { text: g.tokens[i], cls: 'ghost', color: pcolor(id) };
        return null;
      },
      (r) => {
        const g = [...ghosts.entries()].find(([, x]) => x.row === r);
        const won = (shared() && st.solved[r]?.by) || mine.has(r);
        const cls = r === answers.selected ? 'selected' : won ? 'done' : isSolved(r) || st.revealAll ? 'revealed-row' : '';
        if (shared() && st.solved[r]?.by) return { cls, tag: { name: pname(st.solved[r].by), color: pcolor(st.solved[r].by) } };
        if (g) return { cls, tag: { name: `${pname(g[0])} gépel…`, color: pcolor(g[0]) } };
        return { cls };
      },
    );
    const legendKey = JSON.stringify(st.bands.map((b) => b.tokens));
    if (legend.dataset.key !== legendKey) {
      legend.dataset.key = legendKey;
      fill(legend, pz.bands.map((b, k) => h('span', {},
        h('span', { class: `band-dot band-${k}` }),
        st.bands[k].tokens ? ` ${st.bands[k].tokens.join('')}` : ` ${k + 1}. megfejtés (${b.length} betű${pz.type === 'free' ? (b.line ? ', a kiemelt sorban' : ', a sorszámozott, kiemelt mezőkből') : ''})`)));
    }
  }

  function newRound() {
    // új rejtvény ugyanabban a szobában: minden helyi állapot törlődik
    gridView = null;
    fill(gridBox);
    legend.dataset.key = '';
    mine.clear();
    myBands.clear();
    myBandTokens.clear();
    ghosts.clear();
    answers.reset();
    lastTurnKey = null;
    solInput.value = '';
    solBand.replaceChildren();
  }

  function render() {
    if (!st) {
      lobby.hidden = false;
      main.hidden = true;
      fill(lobby, h('h2', {}, 'Csatlakozás…'), h('p', { class: 'muted' }, `Szoba: ${code}. Ha sokáig nem történik semmi, ellenőrizd a kódot, vagy szólj a tanárnak.`));
      return;
    }
    const meP = st.players.find((p) => p.id === me.id);
    fill(head,
      h('div', {}, h('strong', {}, st.title), h('span', { class: 'muted' }, ` · ${MODES[st.mode].label}`)),
      h('div', { class: 'me' }, h('span', { class: 'dot', style: { background: meP?.color || '#999' } }), ` ${me.name} · `, h('strong', {}, `${meP?.score ?? 0} pont`), ' ', status),
    );

    lobby.hidden = st.status !== 'lobby' && st.status !== 'ended';
    main.hidden = st.status === 'lobby';
    if (st.status === 'lobby') {
      fill(lobby, h('h2', {}, st.round > 1 ? 'Jön a következő rejtvény! 🎉' : 'Bent vagy! 🎉'), h('p', {}, 'Várjuk, hogy a tanár elindítsa a játékot.'), h('p', { class: 'muted' }, MODES[st.mode].desc),
        h('div', { class: 'chips' }, st.players.filter((p) => p.online).map((p) => h('span', { class: 'chip', style: { background: p.color } }, p.name))));
    } else if (st.status === 'ended') {
      const rank = [...st.players].sort((a, b) => b.score - a.score).findIndex((p) => p.id === me.id) + 1;
      fill(lobby, h('h2', {}, 'Vége a játéknak!'), h('p', { class: 'big-num' }, `${meP?.score ?? 0} pont`), rank ? h('p', {}, `${rank}. helyezés ${st.players.length} játékosból`) : null,
        h('p', { class: 'muted' }, 'Maradj itt — ha a tanár új rejtvényt indít, automatikusan átkerülsz.'));
    }

    // körös mód
    turnBox.hidden = st.mode !== 'turns' || st.status !== 'playing' || st.revealed;
    if (!turnBox.hidden) {
      const key = `${st.turn?.n}`;
      if (key !== lastTurnKey) { votedFor = null; lastTurnKey = key; if (!myTurn()) answers.deselect(); }
      turnEndsLocal = st.turn?.remainingMs != null ? Date.now() + st.turn.remainingMs : null;
      if (!st.turn) fill(turnBox, h('div', { class: 'turn-banner' }, 'Várakozás…'));
      else if (myTurn()) {
        fill(turnBox, h('div', { class: 'turn-banner me', style: { '--who': pcolor(me.id) } }, '🎯 Te jössz! Kattints egy mezőre, és gépeld be a választ.', h('span', { class: 'timer' })));
      } else {
        fill(turnBox,
          h('div', { class: 'turn-banner', style: { '--who': pcolor(st.turn.playerId) } }, 'Most ', h('strong', {}, pname(st.turn.playerId)), ' jön', h('span', { class: 'timer' })),
          h('div', { class: 'vote' }, h('span', {}, `Szerinted eltalálja? (+${POINTS.vote} pont, ha igazad lesz)`),
            h('button', { class: `btn ${votedFor === true ? 'primary' : ''}`, onclick: () => { votedFor = true; room?.send('vote', { id: me.id, up: true }); render(); } }, '👍 Igen'),
            h('button', { class: `btn ${votedFor === false ? 'primary' : ''}`, onclick: () => { votedFor = false; room?.send('vote', { id: me.id, up: false }); render(); } }, '👎 Nem')),
        );
      }
      updateTimer();
    }

    if (answers.selected != null && (isSolved(answers.selected) || !canAnswer())) answers.deselect();
    renderGrid();

    answers.el.hidden = st.status !== 'playing' || !canAnswer();
    answers.render();

    solForm.hidden = !canGuessSolution() || !st.puzzle.bands.length || st.bands.every((b, k) => b.tokens || myBands.has(k));
    if (solBand.options.length !== st.puzzle.bands.length) {
      fill(solBand, st.puzzle.bands.map((b, k) => h('option', { value: k }, st.puzzle.bands.length > 1 ? `${k + 1}. sáv (${b.length})` : `${b.length} betű`)));
    }
    solBand.hidden = st.puzzle.bands.length <= 1;

    fill(cluesBox, h('h3', {}, 'Meghatározások'), h('div', { class: 'clues-scroll' }, renderClues(st.puzzle, {
      cls: (r) => ((shared() && st.solved[r]?.by) || mine.has(r) ? 'done' : r === answers.selected ? 'selected' : isSolved(r) || st.revealAll ? 'revealed' : ''),
      onRow: canAnswer() ? (r) => { if (!isSolved(r)) answers.select(r); } : null,
    })));

    const players = [...st.players].sort((a, b) => b.score - a.score);
    fill(boardBox, h('h3', {}, 'Állás'), h('ol', { class: 'players' }, players.slice(0, 10).map((p) => h('li', { class: `${p.online ? '' : 'offline'} ${p.id === me.id ? 'me' : ''}` },
      h('span', { class: 'dot', style: { background: p.color } }), h('span', { class: 'pname' }, p.name, p.finishedAt ? ' 🏁' : ''),
      st.mode === 'race' ? h('span', { class: 'bar' }, h('span', { style: { width: `${(100 * p.progress) / st.puzzle.rows.length}%`, background: p.color } })) : null,
      h('span', { class: 'score' }, p.score)))));
  }

  function updateTimer() {
    const el = turnBox.querySelector('.timer');
    if (!el) return;
    el.textContent = turnEndsLocal ? ` · ${Math.max(0, Math.ceil((turnEndsLocal - Date.now()) / 1000))} mp` : '';
  }
  const timer = setInterval(() => { updateTimer(); if (ghosts.size) renderGrid(); }, 1000);

  let helloTimer = null;
  const hello = () => room?.send('hello', { id: me.id, name: me.name });

  openRoom(code, me, {
    onMessage: (t, p) => {
      if (t === 'state') {
        if (st && !st.revealed && p.revealed && p.status === 'playing') toast('💡 A tanár felfedte a megoldást.', 'info');
        const first = !st;
        if (round != null && p.round !== round) { newRound(); toast('🧩 Új rejtvény érkezett!', 'ok'); }
        round = p.round;
        st = p;
        if (first) clearInterval(helloTimer);
        if (!st.players.some((x) => x.id === me.id)) hello();
        render();
      } else if (t === 'result') onResult(p);
      else if (t === 'typing' && p?.id !== me.id && shared()) {
        if (p.tokens?.some(Boolean)) ghosts.set(p.id, { row: p.row, tokens: p.tokens, at: Date.now() }); else ghosts.delete(p.id);
        renderGrid();
      } else if (t === 'kick' && p?.id === me.id) {
        room?.close();
        sessionStorage.removeItem(`pastewall.joined.${code}`);
        fill(root, h('div', { class: 'page narrow' }, h('div', { class: 'card' }, h('h2', {}, 'A tanár kiléptetett a játékból.'), h('a', { class: 'btn', href: '#/join' }, 'Újra belépés'))));
      }
    },
    onPresence: () => {},
    onStatus: (s) => {
      status.textContent = s === 'SUBSCRIBED' ? '●' : '● újracsatlakozás…';
      status.className = `conn ${s === 'SUBSCRIBED' ? 'ok' : 'bad'}`;
      if (s === 'SUBSCRIBED') hello();
    },
  }).then((r) => {
    room = r;
    hello();
    helloTimer = setInterval(() => { if (!st) hello(); }, 2500);
  }).catch((e) => toast(e.message, 'bad'));

  const onVis = () => { if (document.visibilityState === 'visible') hello(); };
  document.addEventListener('visibilitychange', onVis);

  render();
  return () => { answers.destroy(); clearInterval(timer); clearInterval(helloTimer); document.removeEventListener('visibilitychange', onVis); room?.close(); };
}

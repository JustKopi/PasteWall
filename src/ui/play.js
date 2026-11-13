import { h, fill, toast } from './dom.js';
import { makeGridView, renderClues, entryLabel } from './grid.js';
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
  let selected = null;
  const mine = new Map(); // verseny: saját megoldott sorok (row -> tokens)
  const drafts = new Map();
  const myBands = new Set();
  const ghosts = new Map();
  let votedFor = null;
  let pendingRow = null;
  let turnEndsLocal = null;
  let lastTurnKey = null;

  const status = h('span', { class: 'conn' }, 'Kapcsolódás…');
  const head = h('div', { class: 'play-head' });
  const gridBox = h('div', { class: 'grid-box' });
  const turnBox = h('div', { class: 'turn-box' });

  // --- válasz panel (nem rajzoljuk újra, hogy a billentyűzet ne zárjon be) ---
  const ansLabel = h('div', { class: 'ans-label' });
  const ansInput = h('input', { class: 'input big', autocomplete: 'off', autocapitalize: 'characters', spellcheck: false, placeholder: 'Válasz…' });
  const ansCount = h('span', { class: 'muted' });
  const ansBtn = h('button', { class: 'btn primary', type: 'submit' }, 'Beküldés');
  const ansForm = h('form', { class: 'answer card', onsubmit: (e) => { e.preventDefault(); submit(); } },
    ansLabel, h('div', { class: 'ans-row' }, ansInput, ansBtn), ansCount);

  const solBand = h('select', { class: 'input' });
  const solInput = h('input', { class: 'input', placeholder: 'Szerintem a megfejtés…', autocomplete: 'off' });
  const solForm = h('form', { class: 'solution card', onsubmit: (e) => { e.preventDefault(); submitSolution(); } },
    h('strong', {}, `Megfejtés tipp (+${POINTS.solution} pont)`),
    h('div', { class: 'ans-row' }, solBand, solInput, h('button', { class: 'btn', type: 'submit' }, 'Tippelek')));

  const cluesBox = h('div', { class: 'card clues-card' });
  const boardBox = h('div', { class: 'card mini-board' });
  const lobby = h('div', { class: 'card lobby' });

  fill(root, h('div', { class: 'page play' }, head, lobby, turnBox, gridBox, ansForm, solForm, cluesBox, boardBox));

  const tokensOf = (text) => tokenize(text, { digraphs: st?.puzzle.digraphs !== false });
  const shared = () => st && st.mode !== 'race';
  const myTurn = () => st?.mode === 'turns' && st.turn?.playerId === me.id;
  const canAnswer = () => st?.status === 'playing' && !st.revealed && (st.mode !== 'turns' || myTurn());
  const isSolved = (r) => (shared() ? Boolean(st.solved[r]) : mine.has(r));
  const pname = (id) => st?.players.find((p) => p.id === id)?.name || '?';
  const pcolor = (id) => st?.players.find((p) => p.id === id)?.color || '#999';

  function select(r) {
    if (!st || st.status !== 'playing' || isSolved(r)) return;
    if (selected != null) drafts.set(selected, ansInput.value);
    selected = r;
    ansInput.value = drafts.get(r) || '';
    render();
    ansInput.focus();
  }

  let typingTimer = null;
  function sendTyping() {
    if (!shared() || !canAnswer() || selected == null) return;
    clearTimeout(typingTimer);
    const row = selected;
    typingTimer = setTimeout(() => {
      const r = st?.puzzle.rows[row];
      if (!r || selected !== row) return;
      room?.send('typing', { id: me.id, row, tokens: tokensOf(ansInput.value).slice(0, r.length) });
    }, 120);
  }
  ansInput.addEventListener('input', () => { renderGrid_(); updateCount(); sendTyping(); });

  function updateCount() {
    if (selected == null || !st) { ansCount.textContent = ''; return; }
    const n = tokensOf(ansInput.value).length;
    const need = st.puzzle.rows[selected].length;
    ansCount.textContent = `${n}/${need} betű${n > need ? ' — túl hosszú' : ''}`;
    ansCount.className = n === need ? 'ok' : 'muted';
  }

  function submit() {
    if (selected == null || !canAnswer()) return;
    const tokens = tokensOf(ansInput.value);
    if (tokens.length !== st.puzzle.rows[selected].length) { toast(`${st.puzzle.rows[selected].length} betűs szó kell.`, 'warn'); return; }
    pendingRow = { row: selected, tokens };
    room?.send('guess', { id: me.id, row: selected, tokens });
    ansBtn.disabled = true;
  }

  function submitSolution() {
    if (!canAnswer() || !solInput.value.trim()) return;
    room?.send('solution', { id: me.id, band: Number(solBand.value), text: solInput.value });
  }

  function onResult(p) {
    if (p.kind === 'timeout' && p.id === me.id) { toast('Lejárt az idő!', 'warn'); return; }
    if (p.id !== me.id) {
      if (st?.mode === 'turns' && p.kind !== 'timeout') toast(`${pname(p.id)}: ${p.correct ? 'helyes ✔' : 'nem talált ✘'}`, p.correct ? 'ok' : 'info');
      return;
    }
    ansBtn.disabled = false;
    if (p.kind === 'row') {
      if (p.correct) {
        if (pendingRow?.row === p.row) mine.set(p.row, pendingRow.tokens);
        drafts.delete(p.row);
        if (selected === p.row) { selected = null; ansInput.value = ''; }
        toast(`Helyes! +${POINTS.row} pont`, 'ok');
      } else {
        toast('Sajnos nem ez a megoldás.', 'bad');
        ansForm.classList.remove('shake'); void ansForm.offsetWidth; ansForm.classList.add('shake');
      }
      pendingRow = null;
      room?.send('typing', { id: me.id, row: p.row, tokens: [] });
    } else if (p.kind === 'solution') {
      if (p.correct) { myBands.add(p.band); toast(`Eltaláltad a megfejtést! +${POINTS.solution} pont`, 'ok'); solInput.value = ''; }
      else toast('Nem ez a megfejtés.', 'bad');
    }
    render();
  }

  let gridView = null;
  const legend = h('div', { class: 'band-legend' });

  function renderGrid_() {
    if (!st) return;
    const pz = st.puzzle;
    if (!gridView) {
      gridView = makeGridView(pz, { onRow: (r) => { if (canAnswer()) select(r); } });
      fill(gridBox, h('div', { class: 'card grid-card' }, gridView.el, legend));
    }
    const draftTokens = selected != null ? tokensOf(ansInput.value) : [];
    const now = Date.now();
    for (const [id, g] of ghosts) if (now - g.at > 5000 || isSolved(g.row)) ghosts.delete(id);
    gridView.setClickable(canAnswer());
    gridView.update(
      (r, i) => {
        if (st.revealAll && !(shared() && st.solved[r]) && !mine.has(r)) return { text: st.revealAll[r][i], cls: 'revealed' };
        if (shared() && st.solved[r]) return { text: st.solved[r].tokens[i], cls: 'solved', color: st.solved[r].by ? pcolor(st.solved[r].by) : null };
        if (mine.has(r)) return { text: mine.get(r)[i], cls: 'solved', color: pcolor(me.id) };
        if (r === selected && draftTokens[i]) return { text: draftTokens[i], cls: 'draft' };
        for (const [id, g] of ghosts) if (g.row === r && g.tokens[i]) return { text: g.tokens[i], cls: 'ghost', color: pcolor(id) };
        return null;
      },
      (r) => {
        const g = [...ghosts.entries()].find(([, x]) => x.row === r);
        const won = (shared() && st.solved[r]?.by) || mine.has(r);
        const cls = r === selected ? 'selected' : won ? 'done' : isSolved(r) || st.revealAll ? 'revealed-row' : '';
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
        st.bands[k].tokens ? ` ${st.bands[k].tokens.join('')}` : ` ${k + 1}. megfejtés (${b.length} betű${pz.type === 'free' ? ', a sorszámozott, kiemelt mezőkből' : ''})`)));
    }
  }

  function render() {
    if (!st) {
      lobby.hidden = false;
      fill(lobby, h('h2', {}, 'Csatlakozás…'), h('p', { class: 'muted' }, `Szoba: ${code}. Ha sokáig nem történik semmi, ellenőrizd a kódot, vagy szólj a tanárnak.`));
      [ansForm, solForm, cluesBox, boardBox, turnBox].forEach((x) => { x.hidden = true; });
      return;
    }
    const meP = st.players.find((p) => p.id === me.id);
    fill(head, 
      h('div', {}, h('strong', {}, st.title), h('span', { class: 'muted' }, ` · ${MODES[st.mode].label}`)),
      h('div', { class: 'me' }, h('span', { class: 'dot', style: { background: meP?.color || '#999' } }), ` ${me.name} · `, h('strong', {}, `${meP?.score ?? 0} pont`), ' ', status),
    );

    lobby.hidden = st.status !== 'lobby' && st.status !== 'ended';
    if (st.status === 'lobby') {
      fill(lobby, h('h2', {}, 'Bent vagy! 🎉'), h('p', {}, 'Várjuk, hogy a tanár elindítsa a játékot.'), h('p', { class: 'muted' }, MODES[st.mode].desc),
        h('div', { class: 'chips' }, st.players.filter((p) => p.online).map((p) => h('span', { class: 'chip', style: { background: p.color } }, p.name))));
    } else if (st.status === 'ended') {
      const rank = [...st.players].sort((a, b) => b.score - a.score).findIndex((p) => p.id === me.id) + 1;
      fill(lobby, h('h2', {}, 'Vége a játéknak!'), h('p', { class: 'big-num' }, `${meP?.score ?? 0} pont`), rank ? h('p', {}, `${rank}. helyezés ${st.players.length} játékosból`) : null);
    }

    // körös mód
    turnBox.hidden = st.mode !== 'turns' || st.status !== 'playing';
    if (!turnBox.hidden) {
      const key = `${st.turn?.n}`;
      if (key !== lastTurnKey) { votedFor = null; lastTurnKey = key; if (!myTurn()) { selected = null; ansInput.value = ''; } }
      if (st.turn?.remainingMs != null) turnEndsLocal = Date.now() + st.turn.remainingMs; else turnEndsLocal = null;
      if (!st.turn) fill(turnBox, h('div', { class: 'turn-banner' }, 'Várakozás…'));
      else if (myTurn()) {
        fill(turnBox, h('div', { class: 'turn-banner me', style: { '--who': pcolor(me.id) } }, '🎯 Te jössz! Válassz egy sort, és írd be a választ.', h('span', { class: 'timer' })));
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

    if (selected != null && (isSolved(selected) || !canAnswer())) { selected = null; ansInput.value = ''; }
    renderGrid_();
    gridBox.hidden = st.status === 'lobby';

    ansForm.hidden = st.status !== 'playing' || !canAnswer();
    if (selected == null) {
      fill(ansLabel, h('span', { class: 'muted' }, 'Koppints egy sorra vagy meghatározásra a válaszhoz.'));
      ansInput.disabled = true; ansBtn.disabled = true;
    } else {
      const r = st.puzzle.rows[selected];
      fill(ansLabel, h('strong', {}, entryLabel(st.puzzle, selected)), r.clue || '', h('span', { class: 'muted' }, ` (${r.length} betű)`));
      ansInput.disabled = false; ansBtn.disabled = pendingRow != null;
    }
    updateCount();

    solForm.hidden = st.status !== 'playing' || !canAnswer() || st.bands.every((b, k) => b.tokens || myBands.has(k));
    const opts = st.puzzle.bands.map((b, k) => h('option', { value: k }, st.puzzle.bands.length > 1 ? `${k + 1}. sáv (${b.length})` : `${b.length} betű`));
    if (solBand.options.length !== opts.length) fill(solBand, ...opts);
    solBand.hidden = st.puzzle.bands.length === 1;

    cluesBox.hidden = st.status === 'lobby';
    fill(cluesBox, h('h3', {}, 'Meghatározások'), renderClues(st.puzzle, {
      cls: (r) => ((shared() && st.solved[r]?.by) || mine.has(r) ? 'done' : r === selected ? 'selected' : isSolved(r) || st.revealAll ? 'revealed' : ''),
      onRow: canAnswer() ? select : null,
    }));

    boardBox.hidden = st.status === 'lobby';
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
  const timer = setInterval(() => { updateTimer(); if (ghosts.size) renderGrid_(); }, 1000);

  let helloTimer = null;
  const hello = () => room?.send('hello', { id: me.id, name: me.name });

  openRoom(code, me, {
    onMessage: (t, p) => {
      if (t === 'state') {
        if (st && !st.revealed && p.revealed && p.status === 'playing') toast('💡 A tanár felfedte a megoldást.', 'info');
        const first = !st;
        st = p;
        if (first) clearInterval(helloTimer);
        if (!st.players.some((x) => x.id === me.id)) hello();
        render();
      } else if (t === 'result') onResult(p);
      else if (t === 'typing' && p?.id !== me.id && shared()) {
        if (p.tokens?.length) ghosts.set(p.id, { row: p.row, tokens: p.tokens, at: Date.now() }); else ghosts.delete(p.id);
        renderGrid_();
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
  return () => { clearTimeout(typingTimer); clearInterval(timer); clearInterval(helloTimer); document.removeEventListener('visibilitychange', onVis); room?.close(); };
}

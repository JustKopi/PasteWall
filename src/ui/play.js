import { h, fill, toast } from './dom.js';
import { makeGridView, renderClues, knownBandLetter, zoomBar, entryLabel } from './grid.js';
import { AnswerController } from './answer.js';
import { tokenize } from '../crossword/hu.js';
import { openPlayerRoom } from '../live/secureroom.js';
import { miniClient } from './miniplay.js';
import { MODES, POINTS, BOOSTS } from '../live/game.js';
import { throttle, TYPING_MS } from '../live/throttle.js';
import { isBadName, BAD_NAME_MESSAGE } from '../live/names.js';

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
  const nameError = h('div', { class: 'name-error', role: 'alert', hidden: true }, BAD_NAME_MESSAGE);
  const checkName = () => {
    const bad = isBadName(name.value);
    nameError.hidden = !bad;
    name.classList.toggle('bad', bad);
    return !bad;
  };
  name.addEventListener('input', checkName);
  const go = (e) => {
    e?.preventDefault();
    const c = code.value.trim().toUpperCase();
    const n = name.value.trim();
    if (c.length !== 6) { toast('A kód 6 karakter.', 'warn'); return; }
    if (!n) { toast('Írd be a neved!', 'warn'); return; }
    if (!checkName()) { name.focus(); name.select(); return; }
    localStorage.setItem('pastewall.name', n);
    sessionStorage.setItem(`pastewall.joined.${c}`, '1');
    const target = `#/play/${c}`;
    // QR-kódból érkezve már ezen a címen vagyunk: ilyenkor nincs hashchange, kézzel kell továbblépni.
    if (location.hash === target) window.dispatchEvent(new HashChangeEvent('hashchange'));
    else location.hash = target;
  };
  fill(root, h('div', { class: 'page narrow' }, h('form', { class: 'card join', onsubmit: go },
    h('h2', {}, 'Belépés a játékba'),
    code, name, nameError,
    h('button', { class: 'btn primary big', type: 'submit' }, 'Belépek'),
    h('a', { href: '#/', class: 'muted' }, '← Kezdőlap'),
  )));
  checkName();
  (presetCode ? name : code).focus();
}

/** Keresztrejtvény a diák eszközén. A szobakapcsolatot a playPage kezeli (ctx). */
function crosswordClient(root, ctx) {
  const { me, code } = ctx;
  let st = null;
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
  let boostReq = null; // folyamatban lévő boost-kérés (elveszett válasz esetén újraküldjük)
  let pollVote = null; // a saját szavazatom (sor), amíg a szavazás tart

  const shared = () => st && st.mode !== 'race';
  const myTurn = () => st?.mode === 'turns' && st.turn?.playerId === me.id;
  const canAnswer = () => st?.status === 'playing' && !st.revealed && (st.mode !== 'turns' || myTurn());
  const canGuessSolution = () => st?.status === 'playing' && !st.revealed; // a megfejtést bárki tippelheti, bármikor
  const isSolved = (r) => (shared() ? Boolean(st.solved[r]) : mine.has(r) || Boolean(st.shown?.[r]));
  const pname = (id) => st?.players.find((p) => p.id === id)?.name || '?';
  const pcolor = (id) => st?.players.find((p) => p.id === id)?.color || '#999';

  const sendTyping = throttle((row, tokens) => ctx.send('typing', { id: me.id, row, tokens }), TYPING_MS);
  const applyTyping = (p) => {
    if (!p || p.id === me.id) return;
    if (Array.isArray(p.tokens) && p.tokens.some(Boolean)) ghosts.set(p.id, { row: p.row, tokens: p.tokens, at: Date.now() });
    else ghosts.delete(p.id);
  };
  const answers = new AnswerController({
    getPub: () => st?.puzzle,
    canAnswer,
    onSubmit: (row, tokens) => { sendTyping.cancel(); lastGuess = { row, tokens, at: Date.now(), tries: 0 }; ctx.send('guess', { id: me.id, row, tokens }); },
    onTyping: (row, tokens) => { if (shared()) sendTyping(row, tokens.some(Boolean) ? tokens : []); },
    onChange: () => renderGrid(),
  });

  const status = ctx.status;
  const head = h('div', { class: 'play-head' });
  const lobby = h('div', { class: 'card lobby' });
  const turnBox = h('div', { class: 'turn-box' });
  const gridBox = h('div', { class: 'grid-box' });
  const gridCard = h('div', { class: 'card grid-card' });
  const zoom = zoomBar(gridCard, 'play');
  const boostBox = h('div', { class: 'card boost-card' });
  const pollBox = h('div', { class: 'card poll-card' });
  const legend = h('div', { class: 'band-legend' });

  const solBand = h('select', { class: 'input' });
  const solInput = h('input', { class: 'input', placeholder: 'Szerintem a megfejtés…', autocomplete: 'off' });
  const solForm = h('form', { class: 'solution card', onsubmit: (e) => { e.preventDefault(); submitSolution(); } },
    h('strong', {}, `Megfejtés tipp (+${POINTS.solution} pont, korán +${POINTS.solutionBonus})`),
    h('div', { class: 'ans-row' }, solBand, solInput, h('button', { class: 'btn', type: 'submit' }, 'Tippelek')),
    h('div', { class: 'muted small' }, 'Bárki tippelhet, csak a leggyorsabb kap pontot. Ha még a betűk fele sem látszik, jár a bónusz.'));
  const cluesScroll = h('div', { class: 'clues-scroll' });
  const cluesBox = h('div', { class: 'card clues-card' }, h('h3', {}, 'Meghatározások'), cluesScroll);
  const boardBox = h('div', { class: 'card mini-board' });
  const main = h('div', { class: 'play-main' },
    h('div', { class: 'play-left' }, turnBox, gridBox),
    h('div', { class: 'play-side' }, answers.el, boostBox, pollBox, solForm, cluesBox, boardBox));

  fill(root, h('div', { class: 'page play' }, head, lobby, main));

  function submitSolution() {
    if (!canGuessSolution() || !solInput.value.trim()) return;
    lastSolution = tokenize(solInput.value, { digraphs: st.puzzle.digraphs !== false });
    ctx.send('solution', { id: me.id, band: Number(solBand.value), text: solInput.value });
  }

  function requestBoost(kind) {
    if (boostReq || st?.status !== 'playing' || st.revealed) return;
    let row = null;
    let i = null;
    if (kind !== 'double') {
      row = answers.selected;
      if (row == null || !canAnswer()) { toast('Előbb jelölj ki egy kérdést: koppints egy mezőre vagy meghatározásra.', 'warn'); return; }
      if (kind === 'cell') {
        i = answers.cursor;
        if (answers.isLocked(i)) { toast('Ezt a betűt már tudod — állj egy másik mezőre.', 'warn'); return; }
      }
    }
    boostReq = { kind, row, i, req: `${me.id}-${Date.now()}`, at: Date.now(), tries: 0 };
    ctx.send('boost', { id: me.id, kind, row, i, req: boostReq.req });
    render();
  }

  function onBoost(p) {
    if (!p || !boostReq || p.req !== boostReq.req) return;
    const req = boostReq;
    boostReq = null;
    if (!p.ok) { toast(p.reason || 'Most nem sikerült.', 'warn'); render(); return; }
    if (p.kind === 'double') toast('✖️2 Dupla pont aktív: a következő helyes kérdésed kétszer annyit ér!', 'ok');
    else {
      answers.addHints(p.row, Array.isArray(p.letters) ? p.letters : []);
      if (answers.selected !== req.row && canAnswer() && !isSolved(p.row)) answers.select(p.row, null, false);
      toast(`⚡ ${BOOSTS[p.kind]?.label}: megkaptad a betű${p.letters?.length > 1 ? 'ket' : 't'}!`, 'ok');
    }
    render();
  }

  function renderBoosts(meP) {
    const left = meP?.boostsLeft || {};
    const kinds = Object.keys(left);
    boostBox.hidden = st.status !== 'playing' || st.revealed || !kinds.length;
    if (boostBox.hidden) return;
    const pts = st.rowPoints && answers.selected != null ? st.rowPoints[answers.selected] : null;
    fill(boostBox,
      h('strong', {}, '⚡ Boostok'),
      meP.double ? h('span', { class: 'muted small' }, ' · ✖️2 aktív a következő helyes válaszodra') : null,
      h('div', { class: 'boosts' }, kinds.map((k) => {
        const b = BOOSTS[k];
        const needRow = k !== 'double';
        const off = !left[k] || Boolean(boostReq) || (needRow && !canAnswer()) || (k === 'double' && meP.double);
        return h('button', {
          class: `btn small ${k === 'double' && meP.double ? 'boost-on' : ''}`,
          type: 'button',
          title: b.desc,
          disabled: off,
          onclick: () => requestBoost(k),
        }, b.icon, ' ', b.label, h('span', { class: 'n' }, left[k]));
      })),
      h('div', { class: 'muted small' }, boostReq ? 'Kérés elküldve…'
        : 'A betűs boostok a kijelölt kérdésre (az „Egy mező” a kurzor helyére) vonatkoznak.'),
      pts != null ? h('div', { class: 'small' }, `Ez a kérdés most ${pts} pontot ér${meP.double ? ` (dupla: ${pts * 2})` : ''}.`) : null);
  }

  function renderPoll() {
    pollBox.hidden = !st.poll || st.status !== 'playing' || st.revealed;
    if (pollBox.hidden) { pollVote = null; return; }
    if (pollVote != null && isSolved(pollVote)) pollVote = null;
    const open = st.puzzle.rows.map((_, r) => r).filter((r) => !isSolved(r));
    const key = JSON.stringify([open, pollVote]); // a más szavazatai miatt nem építjük újra (lenyitva maradhat)
    if (pollBox.dataset.key === key) return; // ne rajzoljuk újra feleslegesen (a választó lenyitva maradhat)
    pollBox.dataset.key = key;
    const sel = h('select', { class: 'input' },
      h('option', { value: -1 }, '— válassz kérdést —'),
      open.map((r) => h('option', { value: r, selected: r === pollVote },
        `${entryLabel(st.puzzle, r)}${st.puzzle.rows[r].clue || ''}`)));
    sel.addEventListener('change', () => {
      const r = Number(sel.value);
      pollVote = r === -1 ? null : r;
      ctx.send('pollVote', { id: me.id, row: r });
      render();
    });
    fill(pollBox,
      h('strong', {}, '🗳 Szavazás: melyik kérdést fedje fel a tanár?'),
      h('div', { class: 'ans-row' }, sel),
      h('div', { class: 'muted small' }, pollVote != null ? 'Leadtad a szavazatod — bármikor átszavazhatsz. A tanár dönt.' : 'Válaszd ki, melyikben kérnél segítséget.'));
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
        if (!p.repeat || answers.pending === p.row) toast(`Helyes! +${p.points ?? POINTS.row} pont${p.doubled ? ' (✖️2 dupla!)' : ''}`, 'ok');
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
      fill(gridCard, zoom, gridView.el, legend);
      fill(gridBox, gridCard);
    }
    const now = Date.now();
    for (const [id, g] of ghosts) if (now - g.at > 5000 || isSolved(g.row)) ghosts.delete(id);
    gridView.setClickable(canAnswer());
    gridView.update(
      (r, i) => {
        if (st.revealAll && !(shared() && st.solved[r]) && !mine.has(r)) return { text: st.revealAll[r][i], cls: 'revealed' };
        if (shared() && st.solved[r]) return { text: st.solved[r].tokens[i], cls: 'solved', color: st.solved[r].by ? pcolor(st.solved[r].by) : null };
        if (mine.has(r)) return { text: mine.get(r)[i], cls: 'solved', color: pcolor(me.id) };
        if (!shared() && st.shown?.[r]) return { text: st.shown[r][i], cls: 'revealed' };
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
    boostReq = null;
    pollVote = null;
    pollBox.dataset.key = '';
    cluesScroll.dataset.key = '';
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
            h('button', { class: `btn ${votedFor === true ? 'primary' : ''}`, onclick: () => { votedFor = true; ctx.send('vote', { id: me.id, up: true }); render(); } }, '👍 Igen'),
            h('button', { class: `btn ${votedFor === false ? 'primary' : ''}`, onclick: () => { votedFor = false; ctx.send('vote', { id: me.id, up: false }); render(); } }, '👎 Nem')),
        );
      }
      updateTimer();
    }

    if (answers.pending != null && isSolved(answers.pending)) answers.pending = null; // közben más megfejtette
    if (answers.selected != null && (isSolved(answers.selected) || !canAnswer())) answers.deselect();
    renderGrid();

    answers.el.hidden = st.status !== 'playing' || !canAnswer();
    answers.render();
    renderBoosts(meP);
    renderPoll();

    solForm.hidden = !canGuessSolution() || !st.puzzle.bands.length || st.bands.every((b, k) => b.tokens || myBands.has(k));
    if (solBand.options.length !== st.puzzle.bands.length) {
      fill(solBand, st.puzzle.bands.map((b, k) => h('option', { value: k }, st.puzzle.bands.length > 1 ? `${k + 1}. sáv (${b.length})` : `${b.length} betű`)));
    }
    solBand.hidden = st.puzzle.bands.length <= 1;

    // A listát csak akkor építjük újra, ha a saját nézetünkben tényleg változott valami.
    // (Korábban minden állapotüzenetnél — pl. ha egy másik diák megfejtett egy sort — újraépült,
    // és a görgetés visszaugrott: telefonon úgy tűnt, mintha mindenkinek "odaugrana".)
    const clueCls = (r) => ((shared() && st.solved[r]?.by) || mine.has(r) ? 'done' : r === answers.selected ? 'selected' : isSolved(r) || st.revealAll ? 'revealed' : '');
    const clickable = canAnswer();
    const clueKey = JSON.stringify([round, clickable, st.puzzle.rows.map((_, r) => clueCls(r))]);
    if (cluesScroll.dataset.key !== clueKey) {
      cluesScroll.dataset.key = clueKey;
      const top = cluesScroll.scrollTop;
      fill(cluesScroll, renderClues(st.puzzle, {
        cls: clueCls,
        onRow: clickable ? (r) => { if (!isSolved(r)) answers.select(r); } : null,
      }));
      cluesScroll.scrollTop = top;
    }

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
  const timer = setInterval(() => {
    updateTimer();
    if (ghosts.size) renderGrid();
    // ha 3 mp-en belül nem jött visszaigazolás, újraküldjük (a tanár felismeri az ismétlést)
    if (lastGuess && answers.pending === lastGuess.row && Date.now() - lastGuess.at > 3000 && lastGuess.tries < 3) {
      lastGuess.at = Date.now(); lastGuess.tries++;
      ctx.send('guess', { id: me.id, row: lastGuess.row, tokens: lastGuess.tokens });
    }
    if (boostReq && Date.now() - boostReq.at > 3000) {
      if (boostReq.tries < 3) {
        boostReq.at = Date.now(); boostReq.tries++;
        ctx.send('boost', { id: me.id, kind: boostReq.kind, row: boostReq.row, i: boostReq.i, req: boostReq.req });
      } else { boostReq = null; toast('Nem jött válasz a tanári géptől — próbáld újra.', 'warn'); render(); }
    }
    if (lastGuess && answers.pending === lastGuess.row && lastGuess.tries >= 3 && Date.now() - lastGuess.at > 3000) {
      answers.result(lastGuess.row, false); lastGuess = null; toast('Nem jött válasz a tanári géptől — próbáld újra.', 'warn');
    }
  }, 1000);

  render();
  return {
    onMessage(t, p) {
      if (t === 'state') {
        if (st && !st.revealed && p.revealed && p.status === 'playing') toast('💡 A tanár felfedte a megoldást.', 'info');
        if (round != null && p.round !== round) { newRound(); toast('🧩 Új rejtvény érkezett!', 'ok'); }
        round = p.round;
        st = p;
        if (!st.players.some((x) => x.id === me.id)) ctx.hello();
        render();
      } else if (t === 'result') onResult(p);
      else if (t === 'boost') onBoost(p);
      else if (t === 'typing' && shared()) { applyTyping(p); renderGrid(); } // régebbi tanári kliens
      else if (t === 'typingBatch' && shared() && Array.isArray(p?.items)) { p.items.forEach(applyTyping); renderGrid(); }
    },
    destroy() { sendTyping.cancel(); answers.destroy(); clearInterval(timer); },
  };
}

/**
 * Diák oldal: egy szobakapcsolat, benne a tanár által épp futtatott játék
 * (keresztrejtvény vagy minijáték). Játékváltáskor a kapcsolat megmarad.
 */
export function playPage(root, code) {
  const name = localStorage.getItem('pastewall.name');
  if (!name || isBadName(name) || !sessionStorage.getItem(`pastewall.joined.${code}`)) { joinPage(root, code); return undefined; }

  const me = { id: playerId(code), name, role: 'player' };
  let room = null;
  let gotState = false;
  let current = null; // { kind, client }
  const status = h('span', { class: 'conn' }, 'Kapcsolódás…');
  const hello = () => room?.send('hello', { id: me.id, name: me.name });
  const ctx = { me, code, status, send: (t, p) => room?.send(t, p), hello };

  fill(root, h('div', { class: 'page narrow' }, h('div', { class: 'card lobby' }, h('h2', {}, 'Csatlakozás…'),
    h('p', { class: 'muted' }, `Szoba: ${code}. Ha sokáig nem történik semmi, ellenőrizd a kódot, vagy szólj a tanárnak.`))));

  function clientFor(kind) {
    if (current?.kind === kind) return current.client;
    current?.client.destroy();
    const client = kind === 'mini' ? miniClient(root, ctx) : crosswordClient(root, ctx);
    current = { kind, client };
    return client;
  }

  let helloTimer = null;
  openPlayerRoom(code, me, {
    onMessage: (t, p) => {
      if (t === 'kick' && p?.id === me.id) {
        room?.close();
        current?.client.destroy();
        current = null;
        sessionStorage.removeItem(`pastewall.joined.${code}`);
        fill(root, h('div', { class: 'page narrow' }, h('div', { class: 'card' }, h('h2', {}, 'A tanár kiléptetett a játékból.'), h('a', { class: 'btn', href: '#/join' }, 'Újra belépés'))));
        return;
      }
      if (t === 'state') {
        if (!gotState) { gotState = true; clearInterval(helloTimer); }
        clientFor(p.kind === 'mini' ? 'mini' : 'crossword').onMessage(t, p);
        return;
      }
      current?.client.onMessage(t, p);
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
    helloTimer = setInterval(() => { if (!gotState) hello(); }, 2500);
  }).catch((e) => toast(e.message, 'bad'));

  const onVis = () => { if (document.visibilityState === 'visible') hello(); };
  document.addEventListener('visibilitychange', onVis);

  return () => { current?.client.destroy(); clearInterval(helloTimer); document.removeEventListener('visibilitychange', onVis); room?.close(); };
}

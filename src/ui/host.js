import QRCode from 'qrcode';
import { h, fill, toast, download } from './dom.js';
import { GridView, renderClues } from './grid.js';
import { getPuzzle } from '../store.js';
import { HostGame, MODES, POINTS } from '../live/game.js';
import { openRoom } from '../live/transport.js';
import { isOnline } from '../config.js';
import { tokenize } from '../crossword/hu.js';

export function hostPage(root, code) {
  const cfg = JSON.parse(sessionStorage.getItem(`pastewall.host.${code}`) || 'null');
  const doc = cfg && getPuzzle(cfg.puzzleId);
  if (!doc) {
    fill(root, h('div', { class: 'page' }, h('div', { class: 'card' },
      h('h2', {}, 'Ez a szoba nem ezen a gépen fut'),
      h('p', {}, 'A játékot a tanári gépen, a rejtvény szerkesztőjéből lehet elindítani.'),
      h('a', { class: 'btn', href: '#/' }, 'Kezdőlap'))));
    return;
  }

  const pz = doc.puzzle;
  const hostId = `host-${code}`;
  const teacherId = `teacher-${code}`; // a tanár, ha ő is játszik
  const ghosts = new Map(); // playerId -> {row,tokens,at}
  let room = null;
  let lastPresence = new Set();
  let teacherPlays = false;
  let selectedRow = null;
  let teacherDraft = '';

  const game = new HostGame(
    { puzzle: pz, title: doc.title, mode: cfg.mode, turnSeconds: cfg.turnSeconds },
    (t, p) => room?.send(t, p),
    () => render(),
  );

  // ---------- fejléc + QR ----------
  const joinUrl = `${location.origin}${location.pathname}#/play/${code}`;
  const qr = h('img', { class: 'qr clickable', alt: 'QR-kód a belépéshez', title: 'Kattints a teljes képernyőhöz', onclick: () => showQrFull() });
  QRCode.toDataURL(joinUrl, { margin: 1, width: 220 }).then((u) => { qr.src = u; });

  function showQrFull() {
    const big = h('img', { class: 'qr-big-img', alt: 'QR-kód' });
    QRCode.toDataURL(joinUrl, { margin: 1, width: 900 }).then((u) => { big.src = u; });
    const close = () => {
      document.removeEventListener('keydown', onKey);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      overlay.remove();
    };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    const overlay = h('div', { class: 'qr-overlay', onclick: close },
      h('div', { class: 'qr-big' },
        big,
        h('div', { class: 'qr-side' },
          h('div', { class: 'muted' }, 'Olvasd be a telefonoddal, vagy írd be a kódot:'),
          h('div', { class: 'room-code huge' }, code),
          h('div', { class: 'join-line' }, joinUrl.replace(/^https?:\/\//, '').replace(/#.*$/, '')),
          h('div', { class: 'muted small' }, 'Bezárás: kattintás vagy Esc'),
        ),
      ),
    );
    document.addEventListener('keydown', onKey);
    document.body.append(overlay);
    overlay.requestFullscreen?.().catch(() => {});
  }

  const status = h('span', { class: 'conn' }, 'Kapcsolódás…');

  // ---------- állandó elrendezés (nem rajzoljuk újra, így nem ugrál) ----------
  const controlsBox = h('div', { class: 'controls' });
  const turnBox = h('div');
  const endedBox = h('div');
  const gridView = new GridView(pz, { onRow: (r) => onRowClick(r) });
  const legendBox = h('div', { class: 'band-legend' });
  const cluesBox = h('div');
  const boardBox = h('div', { class: 'board' });

  // tanári válaszpanel
  const ansLabel = h('div', { class: 'ans-label' });
  const ansInput = h('input', { class: 'input big', autocomplete: 'off', spellcheck: false, placeholder: 'Válasz…' });
  const ansCount = h('span', { class: 'muted' });
  const ansForm = h('form', { class: 'answer teacher-answer', onsubmit: (e) => { e.preventDefault(); teacherSubmit(); } },
    ansLabel, h('div', { class: 'ans-row' }, ansInput, h('button', { class: 'btn primary', type: 'submit' }, 'Beküldés')), ansCount);
  const solInput = h('input', { class: 'input', placeholder: 'Megfejtés tipp…', autocomplete: 'off' });
  const solBand = h('select', { class: 'input', hidden: pz.bands.length === 1 },
    pz.bands.map((b, k) => h('option', { value: k }, `${k + 1}. sáv`)));
  const solForm = h('form', { class: 'ans-row', onsubmit: (e) => { e.preventDefault(); teacherSolution(); } },
    solBand, solInput, h('button', { class: 'btn', type: 'submit' }, 'Tippelek'));
  const teacherPanel = h('div', { class: 'card teacher-panel' }, h('h3', {}, '🎮 Te is játszol'), ansForm, solForm);

  fill(root,
    h('div', { class: 'page host' },
      h('header', { class: 'host-head' },
        h('div', {},
          h('div', { class: 'muted' }, `${doc.title} · ${MODES[cfg.mode].label}`),
          h('div', { class: 'join-line' }, 'Belépés: ', h('strong', {}, joinUrl.replace(/^https?:\/\//, '')), ' · kód: '),
          h('div', { class: 'room-code' }, code),
          status,
        ),
        h('div', { class: 'qr-wrap' }, qr, h('button', { class: 'btn ghost small', onclick: showQrFull }, '⛶ Teljes képernyő')),
      ),
      controlsBox,
      turnBox,
      endedBox,
      h('div', { class: 'host-grid' },
        h('div', { class: 'card grid-card' }, gridView.el, legendBox, cluesBox),
        h('div', { class: 'side' }, teacherPanel, boardBox),
      ),
    ),
  );

  const playerName = (id) => game.players.get(id)?.name || '?';
  const playerColor = (id) => game.players.get(id)?.color || '#999';
  const tokensOf = (text) => tokenize(text, { digraphs: pz.digraphs !== false });
  const teacherCanAnswer = () => teacherPlays && game.status === 'playing' && (cfg.mode !== 'turns' || game.turn?.playerId === teacherId);

  // ---------- tanár mint játékos ----------
  function withTeacher(ids) {
    const s = new Set(ids);
    s.delete(hostId);
    if (teacherPlays) s.add(teacherId);
    return s;
  }

  function toggleTeacher() {
    teacherPlays = !teacherPlays;
    if (teacherPlays) {
      game.handle('hello', { id: teacherId, name: 'Tanár' });
    } else {
      selectedRow = null;
      game.players.delete(teacherId);
      if (game.turn?.playerId === teacherId) game.nextTurn(); else game.broadcast();
    }
    game.setPresence(withTeacher(lastPresence));
    render();
  }

  function onRowClick(r) {
    if (game.mode === 'race' && !teacherPlays) return;
    if (game.solved[r]) return;
    selectedRow = selectedRow === r ? null : r;
    teacherDraft = '';
    ansInput.value = '';
    render();
    if (selectedRow != null && teacherCanAnswer()) ansInput.focus();
  }

  let typingTimer = null;
  ansInput.addEventListener('input', () => {
    teacherDraft = ansInput.value;
    updateCount();
    renderGrid();
    clearTimeout(typingTimer);
    const row = selectedRow;
    typingTimer = setTimeout(() => {
      if (row == null || row !== selectedRow || !teacherCanAnswer()) return;
      room?.send('typing', { id: teacherId, row, tokens: tokensOf(ansInput.value).slice(0, pz.rows[row].length) });
    }, 120);
  });

  function updateCount() {
    if (selectedRow == null) { ansCount.textContent = ''; return; }
    const n = tokensOf(ansInput.value).length;
    const need = pz.rows[selectedRow].length;
    ansCount.textContent = `${n}/${need} betű`;
    ansCount.className = n === need ? 'ok' : 'muted';
  }

  function teacherSubmit() {
    if (selectedRow == null || !teacherCanAnswer()) return;
    const row = selectedRow;
    const tokens = tokensOf(ansInput.value);
    if (tokens.length !== pz.rows[row].length) { toast(`${pz.rows[row].length} betűs szó kell.`, 'warn'); return; }
    const correct = game.checkRow(row, tokens);
    room?.send('typing', { id: teacherId, row, tokens: [] });
    selectedRow = null;
    teacherDraft = '';
    ansInput.value = '';
    game.handle('guess', { id: teacherId, row, tokens });
    toast(correct ? `Helyes! +${POINTS.row} pont` : 'Nem ez a megoldás.', correct ? 'ok' : 'bad');
  }

  function teacherSolution() {
    if (!teacherCanAnswer() || !solInput.value.trim()) return;
    const band = Number(solBand.value);
    const before = game.players.get(teacherId)?.score ?? 0;
    game.handle('solution', { id: teacherId, band, text: solInput.value });
    const ok = (game.players.get(teacherId)?.score ?? 0) > before;
    toast(ok ? `Eltaláltad a megfejtést! +${POINTS.solution} pont` : 'Nem ez a megfejtés.', ok ? 'ok' : 'bad');
    if (ok) solInput.value = '';
  }

  // ---------- kirajzolás ----------
  function renderGrid() {
    const st = game.publicState();
    const now = Date.now();
    for (const [id, g] of ghosts) if (now - g.at > 5000 || st.solved[g.row]) ghosts.delete(id);
    const draft = selectedRow != null && teacherPlays ? tokensOf(teacherDraft) : [];
    gridView.setClickable(game.mode !== 'race' || teacherPlays);
    gridView.update(
      (r, i) => {
        if (st.revealAll) return { text: st.revealAll[r][i], cls: st.solved[r] ? 'solved' : 'revealed' };
        if (st.solved[r]) return { text: st.solved[r].tokens[i], cls: 'solved', color: st.solved[r].by ? playerColor(st.solved[r].by) : null };
        if (r === selectedRow && draft[i]) return { text: draft[i], cls: 'draft' };
        for (const [id, g] of ghosts) if (g.row === r && g.tokens[i]) return { text: g.tokens[i], cls: 'ghost', color: playerColor(id) };
        return null;
      },
      (r) => {
        const cls = r === selectedRow ? 'selected' : st.solved[r] ? 'done' : '';
        if (st.solved[r]?.by) return { cls, tag: { name: playerName(st.solved[r].by), color: playerColor(st.solved[r].by) } };
        const g = [...ghosts.entries()].find(([, x]) => x.row === r);
        if (g) return { cls, tag: { name: `${playerName(g[0])} gépel…`, color: playerColor(g[0]) } };
        return { cls };
      },
    );
  }

  function render() {
    const st = game.publicState();
    if (selectedRow != null && st.solved[selectedRow]) { selectedRow = null; ansInput.value = ''; teacherDraft = ''; }

    fill(controlsBox,
      st.status === 'lobby' ? h('button', { class: 'btn primary big', onclick: () => game.start(), disabled: !game.players.size }, '▶ Indítás') : null,
      st.status === 'playing' && cfg.mode === 'turns' ? h('button', { class: 'btn', onclick: () => game.nextTurn() }, '⏭ Következő játékos') : null,
      st.status === 'playing' && cfg.mode !== 'race' && selectedRow != null && !st.solved[selectedRow]
        ? h('button', { class: 'btn', onclick: () => { const r = selectedRow; selectedRow = null; game.revealRow(r); } }, `👁 ${selectedRow + 1}. sor felfedése`) : null,
      st.status !== 'ended' && cfg.mode !== 'race'
        ? h('button', { class: `btn ${teacherPlays ? 'primary' : ''}`, onclick: toggleTeacher }, teacherPlays ? '🎮 Kilépek a játékból' : '🎮 Én is játszom') : null,
      st.status === 'playing' ? h('button', { class: 'btn danger', onclick: () => { if (confirm('Biztosan befejezed a játékot?')) game.end(); } }, '■ Játék vége') : null,
      st.status === 'ended' ? h('button', { class: 'btn primary', onclick: () => download(`${doc.title} - eredmények.csv`, game.resultsCsv(), 'text/csv') }, '⬇ Eredmények (Excel/CSV)') : null,
      h('a', { class: 'btn ghost', href: `#/edit/${doc.id}` }, 'Szerkesztő'),
    );

    fill(turnBox, st.turn
      ? h('div', { class: `turn-banner ${st.turn.playerId === teacherId ? 'me' : ''}`, style: { '--who': playerColor(st.turn.playerId) } },
        st.turn.playerId === teacherId ? '🎯 Te jössz! ' : ['Most ', h('strong', {}, playerName(st.turn.playerId)), ' jön'],
        st.turn.remainingMs != null ? h('span', { class: 'timer' }, ` · ${Math.ceil(st.turn.remainingMs / 1000)} mp`) : null)
      : null);

    fill(endedBox, st.status === 'ended' ? h('div', { class: 'ended' }, '🎉 Vége a játéknak!') : null);

    renderGrid();

    const legendKey = JSON.stringify([st.bands, st.status]);
    if (legendBox.dataset.key !== legendKey) {
      legendBox.dataset.key = legendKey;
      fill(legendBox, pz.bands.map((b, k) => h('span', {},
        h('span', { class: `band-dot band-${k}` }),
        st.bands[k].solvedBy ? ` Megfejtette: ${playerName(st.bands[k].solvedBy)} — ${b.text}` : st.status === 'ended' ? ` ${b.text}` : ` ${k + 1}. megfejtés: ${b.length} betű`)));
    }
    fill(cluesBox, renderClues(pz, {
      cls: (r) => (st.solved[r] ? 'done' : r === selectedRow ? 'selected' : ''),
      onRow: game.mode !== 'race' || teacherPlays ? onRowClick : null,
    }));

    // tanári panel
    teacherPanel.hidden = !teacherPlays || st.status !== 'playing';
    const can = teacherCanAnswer();
    ansInput.disabled = !can || selectedRow == null;
    if (!can) fill(ansLabel, h('span', { class: 'muted' }, cfg.mode === 'turns' ? 'Várd meg a köröd.' : ''));
    else if (selectedRow == null) fill(ansLabel, h('span', { class: 'muted' }, 'Kattints egy sorra vagy meghatározásra a válaszhoz.'));
    else fill(ansLabel, h('strong', {}, `${selectedRow + 1}. `), pz.rows[selectedRow].clue || '', h('span', { class: 'muted' }, ` (${pz.rows[selectedRow].length} betű)`));
    updateCount();
    solForm.hidden = !can || st.bands.every((b) => b.solvedBy);

    const players = [...st.players].sort((a, b) => b.score - a.score);
    fill(boardBox,
      h('h3', {}, `Játékosok (${players.filter((p) => p.online).length})`),
      players.length ? null : h('p', { class: 'muted' }, 'Még senki nem lépett be. Mutasd meg a kódot vagy a QR-kódot!'),
      h('ol', { class: 'players' }, players.map((p) => h('li', { class: p.online ? '' : 'offline' },
        h('span', { class: 'dot', style: { background: p.color } }),
        h('span', { class: 'pname' }, p.name, p.finishedAt ? ' 🏁' : ''),
        cfg.mode === 'race' ? h('span', { class: 'bar' }, h('span', { style: { width: `${(100 * p.progress) / pz.rows.length}%`, background: p.color } })) : null,
        h('span', { class: 'score' }, p.score),
        st.status !== 'ended' && p.id !== teacherId ? h('button', { class: 'kick', title: 'Kiléptetés', onclick: () => { if (confirm(`${p.name} kiléptetése?`)) game.kick(p.id); } }, '✕') : null,
      ))),
    );
  }

  const tick = setInterval(() => {
    game.tick();
    if (game.mode === 'turns' && game.status === 'playing') {
      const el = turnBox.querySelector('.timer');
      if (el && game.turn?.endsAt) el.textContent = ` · ${Math.max(0, Math.ceil((game.turn.endsAt - Date.now()) / 1000))} mp`;
    }
    if (ghosts.size) renderGrid();
  }, 1000);

  openRoom(code, { id: hostId, name: 'Tanár', role: 'host' }, {
    onMessage: (t, p) => {
      if (t === 'typing') {
        if (p?.id && p.id !== teacherId && game.players.has(p.id) && cfg.mode !== 'race') {
          if (p.tokens?.length) ghosts.set(p.id, { row: p.row, tokens: p.tokens, at: Date.now() });
          else ghosts.delete(p.id);
          renderGrid();
        }
        return;
      }
      if (t === 'result' || t === 'state' || t === 'kick' || t === 'votes') return; // saját üzenetek
      if (p?.id === teacherId) return; // senki nem adhatja ki magát a tanárnak
      game.handle(t, p);
      if (t === 'guess' || t === 'solution') ghosts.delete(p?.id);
    },
    onPresence: (ids) => { lastPresence = ids; game.setPresence(withTeacher(ids)); },
    onStatus: (s) => {
      if (s === 'SUBSCRIBED') {
        status.textContent = isOnline() ? '● Élő kapcsolat' : '● Demó mód (csak ezen a gépen)';
        status.className = 'conn ok';
        game.broadcast();
      } else {
        status.textContent = '● Kapcsolat megszakadt, újracsatlakozás…';
        status.className = 'conn bad';
      }
    },
  }).then((r) => { room = r; game.broadcast(); }).catch((e) => toast(e.message, 'bad'));

  const warn = (e) => { if (game.status === 'playing') { e.preventDefault(); e.returnValue = ''; } };
  window.addEventListener('beforeunload', warn);

  render();
  return () => {
    clearInterval(tick);
    clearTimeout(typingTimer);
    window.removeEventListener('beforeunload', warn);
    document.querySelector('.qr-overlay')?.remove();
    room?.close();
  };
}

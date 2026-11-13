import QRCode from 'qrcode';
import { h, fill, toast, download } from './dom.js';
import { makeGridView, renderClues } from './grid.js';
import { AnswerController } from './answer.js';
import { getPuzzle, listPuzzles } from '../store.js';
import { HostGame, MODES, POINTS } from '../live/game.js';
import { openRoom } from '../live/transport.js';
import { isOnline } from '../config.js';

export function hostPage(root, code) {
  const cfgKey = `pastewall.host.${code}`;
  const cfg = JSON.parse(sessionStorage.getItem(cfgKey) || 'null');
  let doc = cfg && getPuzzle(cfg.puzzleId);
  if (!doc) {
    fill(root, h('div', { class: 'page' }, h('div', { class: 'card' },
      h('h2', {}, 'Ez a szoba nem ezen a gépen fut'),
      h('p', {}, 'A játékot a tanári gépen, a rejtvény szerkesztőjéből lehet elindítani.'),
      h('a', { class: 'btn', href: '#/' }, 'Kezdőlap'))));
    return;
  }

  let pz = doc.puzzle;
  const hostId = `host-${code}`;
  const teacherId = `teacher-${code}`; // a tanár, ha ő is játszik
  const ghosts = new Map(); // playerId -> {row,tokens,at}
  let room = null;
  let lastPresence = new Set();
  let teacherPlays = false;

  const game = new HostGame(
    { puzzle: pz, title: doc.title, mode: cfg.mode, turnSeconds: cfg.turnSeconds },
    (t, p) => room?.send(t, p),
    () => render(),
  );
  const mode = () => game.mode;

  // ---------- fejléc + QR ----------
  const joinUrl = `${location.origin}${location.pathname}#/play/${code}`;
  const qr = h('img', { class: 'qr clickable', alt: 'QR-kód a belépéshez', title: 'Kattints a teljes képernyőhöz', onclick: () => showQrFull() });
  QRCode.toDataURL(joinUrl, { margin: 1, width: 220 }).then((u) => { qr.src = u; });
  let qrCount = null;

  function renderQrCount() {
    if (!qrCount) return;
    const online = [...game.players.values()].filter((p) => p.online && p.id !== teacherId);
    fill(qrCount,
      h('div', { class: 'qr-count-num' }, `👥 ${online.length}`, h('span', {}, ' játékos bent')),
      h('div', { class: 'chips' }, online.slice(-40).map((p) => h('span', { class: 'chip', style: { background: p.color } }, p.name))));
  }

  function showQrFull() {
    const big = h('img', { class: 'qr-big-img', alt: 'QR-kód' });
    QRCode.toDataURL(joinUrl, { margin: 1, width: 900 }).then((u) => { big.src = u; });
    const close = () => {
      document.removeEventListener('keydown', onKey);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      overlay.remove();
      qrCount = null;
    };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    const overlay = h('div', { class: 'qr-overlay', onclick: close },
      h('div', { class: 'qr-big' },
        big,
        h('div', { class: 'qr-side' },
          h('div', { class: 'muted' }, 'Olvasd be a telefonoddal, vagy írd be a kódot:'),
          h('div', { class: 'room-code huge' }, code),
          h('div', { class: 'join-line' }, joinUrl.replace(/^https?:\/\//, '').replace(/#.*$/, '')),
          (qrCount = h('div', { class: 'qr-count' })),
          h('div', { class: 'muted small' }, 'Bezárás: kattintás vagy Esc'),
        ),
      ),
    );
    document.addEventListener('keydown', onKey);
    document.body.append(overlay);
    renderQrCount();
    overlay.requestFullscreen?.().catch(() => {});
  }

  const status = h('span', { class: 'conn' }, 'Kapcsolódás…');
  const titleLine = h('div', { class: 'muted' });

  // ---------- állandó elrendezés (nem rajzoljuk újra, így nem ugrál) ----------
  const controlsBox = h('div', { class: 'controls' });
  const turnBox = h('div');
  const endedBox = h('div');
  const gridHolder = h('div');
  const legendBox = h('div', { class: 'band-legend' });
  const cluesBox = h('div', { class: 'clues-scroll' });
  const boardBox = h('div', { class: 'board' });
  let gridView = null;

  const teacherCanAnswer = () => teacherPlays && game.status === 'playing' && !game.revealed && (mode() !== 'turns' || game.turn?.playerId === teacherId);
  const answers = new AnswerController({
    getPub: () => pz,
    canAnswer: teacherCanAnswer,
    onSubmit: (row, tokens) => {
      const correct = game.checkRow(row, tokens);
      game.handle('guess', { id: teacherId, row, tokens });
      toast(correct ? `Helyes! +${POINTS.row} pont` : 'Nem ez a megoldás.', correct ? 'ok' : 'bad');
      answers.result(row, correct);
    },
    onTyping: (row, tokens) => room?.send('typing', { id: teacherId, row, tokens: tokens.some(Boolean) ? tokens : [] }),
    onChange: () => renderGrid(),
  });
  const solInput = h('input', { class: 'input', placeholder: 'Megfejtés tipp…', autocomplete: 'off' });
  const solBand = h('select', { class: 'input' });
  const solForm = h('form', { class: 'ans-row', onsubmit: (e) => { e.preventDefault(); teacherSolution(); } },
    solBand, solInput, h('button', { class: 'btn', type: 'submit' }, 'Tippelek'));
  const teacherPanel = h('div', { class: 'card teacher-panel' }, h('h3', {}, '🎮 Te is játszol'), answers.el, solForm);

  function buildGrid() {
    gridView = makeGridView(pz, { onRow: (r, i) => onRowClick(r, i) });
    fill(gridHolder, gridView.el);
    legendBox.dataset.key = '';
    fill(solBand, pz.bands.map((b, k) => h('option', { value: k }, `${k + 1}. sáv`)));
    solBand.hidden = pz.bands.length <= 1;
  }
  buildGrid();

  fill(root,
    h('div', { class: 'page host' },
      h('header', { class: 'host-head' },
        h('div', {},
          titleLine,
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
        h('div', { class: 'card grid-card' }, gridHolder, legendBox),
        h('div', { class: 'side' },
          teacherPanel,
          h('div', { class: 'card clues-card' }, h('h3', {}, 'Meghatározások'), cluesBox),
          boardBox),
      ),
    ),
  );

  const playerName = (id) => game.players.get(id)?.name || '?';
  const playerColor = (id) => game.players.get(id)?.color || '#999';
  let revealPick = null; // tanár által kijelölt sor a felfedéshez (ha nem játszik)

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
      answers.deselect();
      game.players.delete(teacherId);
      if (game.turn?.playerId === teacherId) game.nextTurn(); else game.broadcast();
    }
    game.setPresence(withTeacher(lastPresence));
    render();
  }

  function onRowClick(r, i) {
    if (game.solved[r] || game.revealed) return;
    if (teacherCanAnswer()) { revealPick = r; answers.select(r, i); render(); return; }
    if (mode() === 'race') return;
    revealPick = revealPick === r ? null : r;
    render();
  }

  function teacherSolution() {
    if (!teacherPlays || game.status !== 'playing' || game.revealed || !solInput.value.trim()) return;
    const before = game.players.get(teacherId)?.score ?? 0;
    game.handle('solution', { id: teacherId, band: Number(solBand.value), text: solInput.value });
    const gained = (game.players.get(teacherId)?.score ?? 0) - before;
    toast(gained ? `Eltaláltad a megfejtést! +${gained} pont` : 'Nem ez a megfejtés (vagy valaki gyorsabb volt).', gained ? 'ok' : 'bad');
    if (gained) solInput.value = '';
  }

  // ---------- új rejtvény ugyanabban a szobában ----------
  function newPuzzleDialog() {
    const all = listPuzzles().filter((p) => p.puzzle);
    let picked = all.find((p) => p.id !== doc.id)?.id || all[0]?.id;
    const modeSel = h('select', { class: 'input' }, Object.entries(MODES).map(([k, m]) => h('option', { value: k, selected: k === mode() }, m.label)));
    const close = () => back.remove();
    const back = h('div', { class: 'modal-back', onclick: (e) => { if (e.target === back) close(); } },
      h('div', { class: 'modal' },
        h('h2', {}, '🧩 Új rejtvény ebben a szobában'),
        h('p', { class: 'muted' }, 'A bent lévők maradnak és átkerülnek az új rejtvényre, új diákok is csatlakozhatnak. A pontok nullázódnak (az előző eredményt előbb töltsd le, ha kell).'),
        all.length ? h('div', { class: 'pick-list' }, all.map((p) => h('label', { class: 'pick-item' },
          h('input', { type: 'radio', name: 'pick', value: p.id, checked: p.id === picked, onchange: () => { picked = p.id; } }),
          h('div', {}, h('strong', {}, p.title), h('div', { class: 'muted small' }, `${p.puzzle.type === 'free' ? 'vegyes irányú' : 'megfejtés-sávos'} · ${p.puzzle.rows.length} kérdés${p.id === doc.id ? ' · (a mostani)' : ''}`)),
        ))) : h('p', {}, 'Nincs mentett rejtvény. Előbb készíts egyet a szerkesztőben.'),
        h('label', { class: 'row-label' }, 'Játékmód: ', modeSel),
        h('div', { class: 'actions' },
          h('button', {
            class: 'btn primary',
            disabled: !all.length,
            onclick: () => {
              const next = getPuzzle(picked);
              if (!next) return;
              doc = next;
              pz = next.puzzle;
              sessionStorage.setItem(cfgKey, JSON.stringify({ ...cfg, puzzleId: next.id, mode: modeSel.value }));
              ghosts.clear();
              answers.reset();
              revealPick = null;
              buildGrid();
              game.loadPuzzle({ puzzle: pz, title: next.title, mode: modeSel.value });
              if (teacherPlays) game.setPresence(withTeacher(lastPresence));
              close();
              toast('Új rejtvény betöltve — indítsd el, ha mindenki kész!', 'ok');
            },
          }, 'Betöltés'),
          h('button', { class: 'btn ghost', onclick: close }, 'Mégse'),
          h('a', { class: 'btn ghost', href: '#/edit', target: '_blank', rel: 'noopener' }, '+ Új rejtvény készítése (új lapon)'),
        ),
      ));
    document.body.append(back);
  }

  // ---------- kirajzolás ----------
  function renderGrid() {
    const st = game.publicState();
    const now = Date.now();
    for (const [id, g] of ghosts) if (now - g.at > 5000 || st.solved[g.row]) ghosts.delete(id);
    gridView.setClickable(mode() !== 'race' || teacherCanAnswer());
    const sel = answers.selected ?? revealPick;
    gridView.update(
      (r, i) => {
        if (st.revealAll && !st.solved[r]) return { text: st.revealAll[r][i], cls: 'revealed' };
        if (st.solved[r]) return { text: st.solved[r].tokens[i], cls: 'solved', color: st.solved[r].by ? playerColor(st.solved[r].by) : null };
        const d = answers.cellInfo(r, i);
        if (d) return d;
        for (const [id, g] of ghosts) if (g.row === r && g.tokens[i]) return { text: g.tokens[i], cls: 'ghost', color: playerColor(id) };
        return null;
      },
      (r) => {
        const cls = r === sel ? 'selected' : st.solved[r]?.by ? 'done' : st.solved[r] || st.revealAll ? 'revealed-row' : '';
        if (st.solved[r]?.by) return { cls, tag: { name: playerName(st.solved[r].by), color: playerColor(st.solved[r].by) } };
        const g = [...ghosts.entries()].find(([, x]) => x.row === r);
        if (g) return { cls, tag: { name: `${playerName(g[0])} gépel…`, color: playerColor(g[0]) } };
        return { cls };
      },
    );
  }

  function render() {
    renderQrCount();
    const st = game.publicState();
    if (revealPick != null && st.solved[revealPick]) revealPick = null;
    titleLine.textContent = `${doc.title} · ${MODES[mode()].label}${st.round > 1 ? ` · ${st.round}. rejtvény` : ''}`;
    const entryName = (r) => (pz.type === 'free' ? `${pz.rows[r].num}. ${pz.rows[r].dir === 'across' ? 'vízszintes' : 'függőleges'}` : `${r + 1}. sor`);

    fill(controlsBox,
      st.status === 'lobby' ? h('button', { class: 'btn primary big', onclick: () => game.start(), disabled: !game.players.size }, '▶ Indítás') : null,
      st.status === 'playing' && mode() === 'turns' && !st.revealed ? h('button', { class: 'btn', onclick: () => game.nextTurn() }, '⏭ Következő játékos') : null,
      st.status === 'playing' && mode() !== 'race' && revealPick != null && !st.solved[revealPick] && !st.revealed
        ? h('button', { class: 'btn', onclick: () => { const r = revealPick; revealPick = null; answers.deselect(); game.revealRow(r); } }, `👁 ${entryName(revealPick)} felfedése`) : null,
      st.status === 'playing' && !st.revealed
        ? h('button', {
          class: 'btn',
          title: 'A meg nem fejtett sorokat és a megfejtést mindenkinél kitölti',
          onclick: () => { if (confirm('Kitöltöd a meg nem fejtett sorokat a megoldással? Utána már nem lehet pontot szerezni.')) { revealPick = null; answers.deselect(); game.revealSolution(); } },
        }, '💡 Megoldás') : null,
      st.status !== 'ended' && !st.revealed && mode() !== 'race'
        ? h('button', { class: `btn ${teacherPlays ? 'primary' : ''}`, onclick: toggleTeacher }, teacherPlays ? '🎮 Kilépek a játékból' : '🎮 Én is játszom') : null,
      st.status === 'playing' ? h('button', { class: 'btn danger', onclick: () => { if (confirm('Biztosan befejezed a játékot?')) game.end(); } }, '■ Játék vége') : null,
      st.status === 'ended' ? h('button', { class: 'btn', onclick: () => download(`${doc.title} - eredmények.csv`, game.resultsCsv(), 'text/csv') }, '⬇ Eredmények (Excel/CSV)') : null,
      st.status !== 'playing' || st.revealed ? h('button', { class: `btn ${st.status === 'ended' ? 'primary' : ''}`, onclick: newPuzzleDialog }, '🧩 Új rejtvény (a bent lévőkkel)') : null,
      h('a', { class: 'btn ghost', href: `#/edit/${doc.id}` }, 'Szerkesztő'),
    );

    fill(turnBox, st.turn && !st.revealed
      ? h('div', { class: `turn-banner ${st.turn.playerId === teacherId ? 'me' : ''}`, style: { '--who': playerColor(st.turn.playerId) } },
        st.turn.playerId === teacherId ? '🎯 Te jössz! ' : ['Most ', h('strong', {}, playerName(st.turn.playerId)), ' jön'],
        st.turn.remainingMs != null ? h('span', { class: 'timer' }, ` · ${Math.ceil(st.turn.remainingMs / 1000)} mp`) : null)
      : null);

    fill(endedBox, st.status === 'ended' ? h('div', { class: 'ended' }, '🎉 Vége a játéknak!', h('span', { class: 'muted small' }, ' Indíthatsz új rejtvényt a bent lévőkkel.'))
      : st.revealed ? h('div', { class: 'ended' }, '💡 Itt a megoldás!', h('span', { class: 'muted small' }, ' Az eredményekhez nyomd meg a „Játék vége” gombot.'))
        : st.status === 'lobby' && st.round > 1 ? h('div', { class: 'ended' }, `🧩 ${st.round}. rejtvény betöltve`, h('span', { class: 'muted small' }, ' Ha mindenki kész, nyomd meg az Indítás gombot.')) : null);

    renderGrid();

    const legendKey = JSON.stringify([st.bands, st.status, st.revealed, st.round]);
    if (legendBox.dataset.key !== legendKey) {
      legendBox.dataset.key = legendKey;
      fill(legendBox, pz.bands.map((b, k) => h('span', {},
        h('span', { class: `band-dot band-${k}` }),
        st.bands[k].solvedBy ? ` Megfejtette: ${playerName(st.bands[k].solvedBy)} — ${b.text}`
          : st.status === 'ended' || st.revealed ? ` Megfejtés: ${b.text}`
            : ` ${k + 1}. megfejtés: ${b.length} betű${pz.type === 'free' ? ' (a sorszámozott, kiemelt mezőkből)' : ''}`)));
    }
    fill(cluesBox, renderClues(pz, {
      cls: (r) => (st.solved[r]?.by ? 'done' : r === (answers.selected ?? revealPick) ? 'selected' : st.solved[r] || st.revealAll ? 'revealed' : ''),
      onRow: mode() !== 'race' || teacherCanAnswer() ? (r) => onRowClick(r, null) : null,
    }));

    // tanári panel
    teacherPanel.hidden = !teacherPlays || st.status !== 'playing' || st.revealed;
    if (answers.selected != null && (st.solved[answers.selected] || !teacherCanAnswer())) answers.deselect();
    answers.render();
    solForm.hidden = !pz.bands.length || st.bands.every((b) => b.solvedBy);

    const players = [...st.players].sort((a, b) => b.score - a.score);
    fill(boardBox,
      h('h3', {}, `Játékosok (${players.filter((p) => p.online).length})`),
      players.length ? null : h('p', { class: 'muted' }, 'Még senki nem lépett be. Mutasd meg a kódot vagy a QR-kódot!'),
      h('ol', { class: 'players' }, players.map((p) => h('li', { class: p.online ? '' : 'offline' },
        h('span', { class: 'dot', style: { background: p.color } }),
        h('span', { class: 'pname' }, p.name, p.finishedAt ? ' 🏁' : ''),
        mode() === 'race' ? h('span', { class: 'bar' }, h('span', { style: { width: `${(100 * p.progress) / pz.rows.length}%`, background: p.color } })) : null,
        h('span', { class: 'score' }, p.score),
        st.status !== 'ended' && p.id !== teacherId ? h('button', { class: 'kick', title: 'Kiléptetés', onclick: () => { if (confirm(`${p.name} kiléptetése?`)) game.kick(p.id); } }, '✕') : null,
      ))),
    );
  }

  const tick = setInterval(() => {
    game.tick();
    if (mode() === 'turns' && game.status === 'playing') {
      const el = turnBox.querySelector('.timer');
      if (el && game.turn?.endsAt) el.textContent = ` · ${Math.max(0, Math.ceil((game.turn.endsAt - Date.now()) / 1000))} mp`;
    }
    if (ghosts.size) renderGrid();
  }, 1000);

  openRoom(code, { id: hostId, name: 'Tanár', role: 'host' }, {
    onMessage: (t, p) => {
      if (t === 'typing') {
        if (p?.id && p.id !== teacherId && game.players.has(p.id) && mode() !== 'race') {
          if (p.tokens?.some(Boolean)) ghosts.set(p.id, { row: p.row, tokens: p.tokens, at: Date.now() });
          else ghosts.delete(p.id);
          renderGrid();
        }
        return;
      }
      if (t === 'result' || t === 'state' || t === 'kick' || t === 'votes') return; // saját üzenetek
      if (p?.id === teacherId) return; // senki nem adhatja ki magát a tanárnak
      const isNew = t === 'hello' && p?.id && !game.players.has(p.id);
      const solvedBefore = Object.keys(game.bandSolvedBy).length;
      game.handle(t, p);
      if (isNew && game.players.has(p.id)) toast(`👋 ${game.players.get(p.id).name} csatlakozott (${[...game.players.keys()].filter((id) => id !== teacherId).length} fő)`, 'ok');
      if (t === 'solution' && Object.keys(game.bandSolvedBy).length > solvedBefore) toast(`🏆 ${playerName(p.id)} megfejtette!`, 'ok');
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

  const warn = (e) => { if (game.status === 'playing' || game.players.size) { e.preventDefault(); e.returnValue = ''; } };
  window.addEventListener('beforeunload', warn);

  render();
  return () => {
    clearInterval(tick);
    answers.destroy();
    window.removeEventListener('beforeunload', warn);
    document.querySelector('.qr-overlay')?.remove();
    document.querySelector('.modal-back')?.remove();
    room?.close();
  };
}

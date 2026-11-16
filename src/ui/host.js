import QRCode from 'qrcode';
import { h, fill, toast, download } from './dom.js';
import { makeGridView, renderClues, knownBandLetter, zoomBar } from './grid.js';
import { AnswerController } from './answer.js';
import { getPuzzle } from '../store.js';
import { newGameDialog, switchRoomGame } from './newgame.js';
import { HostGame, MODES, POINTS } from '../live/game.js';
import { openHostRoom, hasHostKeys } from '../live/secureroom.js';
import { isOnline } from '../config.js';
import { TYPING_MS } from '../live/throttle.js';
import { joinNotifier } from './joins.js';
import { gameOptionsUI } from './gameopts.js';

export function hostPage(root, code) {
  const cfgKey = `pastewall.host.${code}`;
  const cfg = JSON.parse(sessionStorage.getItem(cfgKey) || 'null');
  let doc = cfg && getPuzzle(cfg.puzzleId);
  if (!doc || !hasHostKeys(code)) {
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
  // Gépelés-továbbítás: nem egyenként, hanem TYPING_MS-onként egy összesített (aláírt) üzenetben.
  const typingOut = new Map(); // playerId -> {id,row,tokens}
  let typingTimer = null;
  const flushTyping = () => {
    typingTimer = null;
    if (!typingOut.size) return;
    room?.send('typingBatch', { items: [...typingOut.values()] });
    typingOut.clear();
  };
  const queueTyping = (id, row, tokens) => {
    typingOut.set(id, { id, row, tokens });
    if (!typingTimer) typingTimer = setTimeout(flushTyping, TYPING_MS);
  };
  // a rács újrarajzolása képkockánként legfeljebb egyszer (sok egyidejű gépelésnél)
  const joins = joinNotifier(() => [...game.players.keys()].filter((id) => id !== teacherId).length);
  let gridFrame = 0;
  const renderGridSoon = () => { if (!gridFrame) gridFrame = requestAnimationFrame(() => { gridFrame = 0; renderGrid(); }); };
  let room = null;
  let lastPresence = new Set();
  let teacherPlays = false;
  let locked = false;

  const game = new HostGame(
    {
      puzzle: pz, title: doc.title, mode: cfg.mode, turnSeconds: cfg.turnSeconds, coalesceMs: 250,
      scoring: cfg.scoring, boosts: cfg.boosts, sendTo: (id, t, p) => room?.sendTo(id, t, p),
    },
    (t, p) => room?.send(t, p),
    () => render(),
  );
  if (cfg.players) game.seedPlayers(cfg.players); // másik játékból érkeztek
  if (cfg.round) game.round = cfg.round;
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
  const pollBox = h('div');
  const gridCard = h('div', { class: 'card grid-card' });
  const zoom = zoomBar(gridCard, 'host');
  const boardBox = h('div', { class: 'board' });
  let gridView = null;

  const teacherCanAnswer = () => teacherPlays && game.status === 'playing' && !game.revealed && (mode() !== 'turns' || game.turn?.playerId === teacherId);
  const answers = new AnswerController({
    getPub: () => pz,
    canAnswer: teacherCanAnswer,
    onSubmit: (row, tokens) => {
      const correct = game.checkRow(row, tokens);
      const before = game.players.get(teacherId)?.score ?? 0;
      game.handle('guess', { id: teacherId, row, tokens });
      const gained = (game.players.get(teacherId)?.score ?? 0) - before;
      toast(correct ? `Helyes! +${gained || POINTS.row} pont` : 'Nem ez a megoldás.', correct ? 'ok' : 'bad');
      answers.result(row, correct);
    },
    onTyping: (row, tokens) => queueTyping(teacherId, row, tokens.some(Boolean) ? tokens : []),
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
        (fill(gridCard, zoom, gridHolder, legendBox), gridCard),
        h('div', { class: 'side' },
          pollBox,
          teacherPanel,
          h('div', { class: 'card clues-card' }, h('h3', {}, 'Meghatározások'), cluesBox),
          boardBox),
      ),
    ),
  );

  const playerName = (id) => game.players.get(id)?.name || '?';
  const playerColor = (id) => game.players.get(id)?.color || '#999';
  let revealPick = null; // tanár által kijelölt sor a felfedéshez (ha nem játszik)
  const isOpen = (r) => game.isOpenRow(r) && !game.revealed;

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
    if (!isOpen(r)) return;
    if (teacherCanAnswer()) { revealPick = r; answers.select(r, i); render(); return; }
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

  // ---------- élő beállítások (játék közben is) ----------
  function settingsDialog() {
    const opts = gameOptionsUI({ scoring: game.scoring, boosts: game.boosts });
    const turnSel = h('select', { class: 'input' },
      [30, 60, 90, 120, 0].map((s) => h('option', { value: s, selected: s === (game.turnSeconds || 0) }, s ? `${s} mp / kör` : 'nincs időkorlát')));
    const close = () => back.remove();
    const back = h('div', { class: 'modal-back', onclick: (e) => { if (e.target === back) close(); } },
      h('div', { class: 'modal' },
        h('h2', {}, '⚙ Beállítások'),
        h('p', { class: 'muted' }, 'Játék közben is módosítható; azonnal érvényes mindenkinél. Egy boost kikapcsolásával a diákok gombja eltűnik, visszakapcsolva az eddigi felhasználások megmaradnak.'),
        opts.el,
        mode() === 'turns' ? h('label', { class: 'row-label' }, 'Körös játék ideje: ', turnSel) : null,
        h('p', { class: 'muted small' }, 'A játékmódot új rejtvénynél lehet váltani („🎮 Új játék”).'),
        h('div', { class: 'actions' },
          h('button', {
            class: 'btn primary',
            onclick: () => {
              const v = opts.value();
              game.updateOptions({ ...v, turnSeconds: mode() === 'turns' ? Number(turnSel.value) : undefined });
              const cur = JSON.parse(sessionStorage.getItem(cfgKey) || '{}');
              sessionStorage.setItem(cfgKey, JSON.stringify({ ...cur, ...v, turnSeconds: game.turnSeconds }));
              close();
              toast('Beállítások mentve.', 'ok');
            },
          }, 'Mentés'),
          h('button', { class: 'btn ghost', onclick: close }, 'Mégse'))));
    document.body.append(back);
  }

  // ---------- új rejtvény ugyanabban a szobában ----------
  function newPuzzleDialog() {
    newGameDialog({
      currentId: doc.id,
      mode: mode(),
      options: { scoring: game.scoring, boosts: game.boosts },
      onPick: (pick) => {
        if (pick.kind !== 'crossword') {
          // másik típusú játék: a tanári oldal átvált, a bent lévők átkerülnek
          const players = [...game.players.values()].filter((p) => p.id !== teacherId).map(({ id, name, color, joinedAt }) => ({ id, name, color, joinedAt }));
          switchRoomGame(code, pick, players, (game.round || 1) + 1);
          return;
        }
        const next = getPuzzle(pick.id);
        if (!next) return;
        doc = next;
        pz = next.puzzle;
        sessionStorage.setItem(cfgKey, JSON.stringify({ ...cfg, kind: 'crossword', puzzleId: next.id, mode: pick.mode, scoring: pick.scoring, boosts: pick.boosts, players: undefined }));
        ghosts.clear();
        answers.reset();
        revealPick = null;
        buildGrid();
        game.loadPuzzle({ puzzle: pz, title: next.title, mode: pick.mode, scoring: pick.scoring, boosts: pick.boosts });
        if (teacherPlays) game.setPresence(withTeacher(lastPresence));
        toast('Új rejtvény betöltve — indítsd el, ha mindenki kész!', 'ok');
      },
    });
  }

  // ---------- kirajzolás ----------
  function renderGrid() {
    const st = game.publicState();
    const now = Date.now();
    for (const [id, g] of ghosts) if (now - g.at > 5000 || st.solved[g.row]) ghosts.delete(id);
    gridView.setClickable(st.status === 'playing' && !st.revealed);
    const sel = answers.selected ?? revealPick;
    gridView.update(
      (r, i) => {
        if (st.revealAll && !st.solved[r]) return { text: st.revealAll[r][i], cls: 'revealed' };
        if (st.solved[r]) return { text: st.solved[r].tokens[i], cls: 'solved', color: st.solved[r].by ? playerColor(st.solved[r].by) : null };
        if (st.shown[r]) return { text: st.shown[r][i], cls: 'revealed' };
        const d = answers.cellInfo(r, i);
        if (d) return d;
        const bl = knownBandLetter(pz, st.bands.map((b) => b.tokens), r, i);
        if (bl) return { text: bl, cls: 'band-known' };
        for (const [id, g] of ghosts) if (g.row === r && g.tokens[i]) return { text: g.tokens[i], cls: 'ghost', color: playerColor(id) };
        return null;
      },
      (r) => {
        const cls = r === sel ? 'selected' : st.solved[r]?.by ? 'done' : st.solved[r] || st.shown[r] || st.revealAll ? 'revealed-row' : '';
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
    if (revealPick != null && !isOpen(revealPick)) revealPick = null;
    titleLine.textContent = `${doc.title} · ${MODES[mode()].label}${st.round > 1 ? ` · ${st.round}. rejtvény` : ''}`;
    const entryName = (r) => (pz.type === 'free' ? `${pz.rows[r].num}. ${pz.rows[r].dir === 'across' ? 'vízszintes' : 'függőleges'}` : `${r + 1}. sor`);

    fill(controlsBox,
      st.status === 'lobby' ? h('button', { class: 'btn primary big', onclick: () => game.start(), disabled: !game.players.size }, '▶ Indítás') : null,
      st.status === 'playing' && mode() === 'turns' && !st.revealed ? h('button', { class: 'btn', onclick: () => game.nextTurn() }, '⏭ Következő játékos') : null,
      st.status === 'playing' && revealPick != null && isOpen(revealPick)
        ? h('button', { class: 'btn primary', onclick: () => { const r = revealPick; revealPick = null; answers.deselect(); game.revealRow(r); } }, `👁 ${entryName(revealPick)} felfedése`)
        : null,
      st.status === 'playing' && !st.revealed
        ? h('button', { class: `btn ${st.poll ? 'primary' : ''}`, title: 'A diákok megszavazhatják, melyik kérdést fednéd fel (csak irányadó)', onclick: () => (st.poll ? game.stopPoll() : game.startPoll()) }, st.poll ? '🗳 Szavazás lezárása' : '🗳 Szavazás: mit fedjek fel?') : null,
      st.status === 'playing' && !st.revealed
        ? h('button', {
          class: 'btn',
          title: 'A meg nem fejtett sorokat és a megfejtést mindenkinél kitölti',
          onclick: () => { if (confirm('Kitöltöd a meg nem fejtett sorokat a megoldással? Utána már nem lehet pontot szerezni.')) { revealPick = null; answers.deselect(); game.revealSolution(); } },
        }, '💡 Megoldás') : null,
      st.status !== 'ended' && !st.revealed && mode() !== 'race'
        ? h('button', { class: `btn ${teacherPlays ? 'primary' : ''}`, onclick: toggleTeacher }, teacherPlays ? '🎮 Kilépek a játékból' : '🎮 Én is játszom') : null,
      h('button', { class: `btn ${locked ? 'primary' : ''}`, title: 'Lezárt szobába új diák nem léphet be (a bent lévők újracsatlakozhatnak)', onclick: () => { locked = !locked; room?.setLocked(locked); render(); } }, locked ? '🔒 Lezárva' : '🔓 Szoba lezárása'),
      st.status === 'playing' ? h('button', { class: 'btn danger', onclick: () => { if (confirm('Biztosan befejezed a játékot?')) game.end(); } }, '■ Játék vége') : null,
      st.status === 'ended' ? h('button', { class: 'btn', onclick: () => download(`${doc.title} - eredmények.csv`, game.resultsCsv(), 'text/csv') }, '⬇ Eredmények (Excel/CSV)') : null,
      st.status !== 'playing' || st.revealed ? h('button', { class: `btn ${st.status === 'ended' ? 'primary' : ''}`, onclick: newPuzzleDialog }, '🎮 Új játék (a bent lévőkkel)') : null,
      st.status !== 'ended' ? h('button', { class: 'btn', title: 'Boostok, lépcsős pontozás, körös idő — játék közben is', onclick: settingsDialog }, '⚙ Beállítások') : null,
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
            : ` ${k + 1}. megfejtés: ${b.length} betű${pz.type === 'free' ? (b.line ? ' (a kiemelt sorban)' : ' (a sorszámozott, kiemelt mezőkből)') : ''}`)));
    }
    // a lista csak akkor épül újra, ha tényleg változott (különben görgetés közben visszaugrana)
    const clueCls = (r) => (st.solved[r]?.by ? 'done' : r === (answers.selected ?? revealPick) ? 'selected' : st.solved[r] || st.shown[r] || st.revealAll ? 'revealed' : '');
    const clueKey = JSON.stringify([st.round, pz.rows.map((_, r) => clueCls(r))]);
    if (cluesBox.dataset.key !== clueKey) {
      cluesBox.dataset.key = clueKey;
      const top = cluesBox.scrollTop;
      fill(cluesBox, renderClues(pz, { cls: clueCls, onRow: (r) => onRowClick(r, null) }));
      cluesBox.scrollTop = top;
    }

    // szavazás állása
    if (st.poll) {
      const counts = Object.entries(st.poll.counts).map(([r, n]) => [Number(r), n]).sort((a, b) => b[1] - a[1]);
      const total = counts.reduce((s, [, n]) => s + n, 0);
      const max = counts[0]?.[1] || 1;
      fill(pollBox, h('div', { class: 'card poll-card' },
        h('h3', {}, `🗳 Szavazás — ${total} szavazat`),
        h('div', { class: 'muted small' }, 'A diákok azt jelölik, melyik kérdést fednéd fel. Csak irányadó: te döntesz (👁 = felfedés).'),
        counts.length ? h('ol', { class: 'poll-list' }, counts.map(([r, n]) => h('li', {},
          h('span', { class: 'pl', title: pz.rows[r].clue || '' }, `${entryName(r)}: ${pz.rows[r].clue || ''}`),
          h('span', { class: 'pbar' }, h('span', { style: { width: `${(100 * n) / max}%` } })),
          h('strong', {}, n),
          h('button', { class: 'btn small', title: 'Felfedés mindenkinek', onclick: () => game.revealRow(r) }, '👁'))))
          : h('p', { class: 'muted' }, 'Még nincs szavazat.')));
    } else fill(pollBox);

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

  openHostRoom(code, {
    onBlocked: (name) => toast(`🔒 ${name || 'Valaki'} be akart lépni, de a szoba le van zárva.`, 'warn'),
    onMessage: (t, p) => {
      if (t === 'typing') {
        if (p?.id && p.id !== teacherId && game.players.has(p.id) && mode() !== 'race' && game.status === 'playing') {
          const row = Number(p.row);
          if (!(row >= 0 && row < pz.rows.length)) return;
          const tokens = (Array.isArray(p.tokens) ? p.tokens : []).slice(0, pz.rows[row].length).map((x) => String(x || '').slice(0, 3));
          if (tokens.some(Boolean)) ghosts.set(p.id, { row, tokens, at: Date.now() });
          else ghosts.delete(p.id);
          renderGridSoon();
          queueTyping(p.id, row, tokens); // a tanár továbbítja (aláírva, összesítve) a többieknek
        }
        return;
      }
      if (t === 'result' || t === 'state' || t === 'kick' || t === 'votes') return; // saját üzenetek
      if (p?.id === teacherId) return; // senki nem adhatja ki magát a tanárnak
      const isNew = t === 'hello' && p?.id && !game.players.has(p.id);
      const solvedBefore = Object.keys(game.bandSolvedBy).length;
      game.handle(t, p);
      if (isNew && game.players.has(p.id)) joins.add(game.players.get(p.id).name);
      if (t === 'solution' && Object.keys(game.bandSolvedBy).length > solvedBefore) toast(`🏆 ${playerName(p.id)} megfejtette!`, 'ok');
      if (t === 'guess' || t === 'solution') { ghosts.delete(p?.id); typingOut.delete(p?.id); }
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

  // szívverés: az állapotot időnként újraküldjük, így egy elveszett üzenet magától helyreáll
  const heartbeat = setInterval(() => { if (room) game.broadcast(); }, 4000);
  const warn = (e) => { if (game.status === 'playing' || game.players.size) { e.preventDefault(); e.returnValue = ''; } };
  window.addEventListener('beforeunload', warn);

  render();
  return () => {
    clearInterval(tick);
    clearInterval(heartbeat);
    clearTimeout(typingTimer);
    cancelAnimationFrame(gridFrame);
    game.dispose();
    joins.dispose();
    answers.destroy();
    window.removeEventListener('beforeunload', warn);
    document.querySelector('.qr-overlay')?.remove();
    document.querySelector('.modal-back')?.remove();
    room?.close();
  };
}

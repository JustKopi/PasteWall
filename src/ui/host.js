import QRCode from 'qrcode';
import { h, fill, toast, download } from './dom.js';
import { renderGrid, renderClues } from './grid.js';
import { getPuzzle } from '../store.js';
import { HostGame, MODES } from '../live/game.js';
import { openRoom } from '../live/transport.js';
import { isOnline } from '../config.js';

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

  const hostId = `host-${code}`;
  const ghosts = new Map(); // playerId -> {row,tokens,at}
  let room = null;
  const game = new HostGame(
    { puzzle: doc.puzzle, title: doc.title, mode: cfg.mode, turnSeconds: cfg.turnSeconds },
    (t, p) => room?.send(t, p),
    () => render(),
  );
  const joinUrl = `${location.origin}${location.pathname}#/play/${code}`;
  const qr = h('img', { class: 'qr', alt: 'QR-kód a belépéshez' });
  QRCode.toDataURL(joinUrl, { margin: 1, width: 220 }).then((u) => { qr.src = u; });

  const status = h('span', { class: 'conn' }, 'Kapcsolódás…');
  const body = h('div', { class: 'host-body' });
  let selectedRow = null;

  fill(root, 
    h('div', { class: 'page host' },
      h('header', { class: 'host-head' },
        h('div', {},
          h('div', { class: 'muted' }, `${doc.title} · ${MODES[cfg.mode].label}`),
          h('div', { class: 'join-line' }, 'Belépés: ', h('strong', {}, joinUrl.replace(/^https?:\/\//, '')), ' · kód: '),
          h('div', { class: 'room-code' }, code),
          status,
        ),
        qr,
      ),
      body,
    ),
  );

  function playerName(id) { return game.players.get(id)?.name || '?'; }
  function playerColor(id) { return game.players.get(id)?.color || '#999'; }

  function render() {
    const st = game.publicState();
    const pz = doc.puzzle;
    const now = Date.now();
    for (const [id, g] of ghosts) if (now - g.at > 5000 || st.solved[g.row]) ghosts.delete(id);

    const controls = h('div', { class: 'controls' },
      st.status === 'lobby' ? h('button', { class: 'btn primary big', onclick: () => game.start(), disabled: !game.players.size }, '▶ Indítás') : null,
      st.status === 'playing' && cfg.mode === 'turns' ? h('button', { class: 'btn', onclick: () => game.nextTurn() }, '⏭ Következő játékos') : null,
      st.status === 'playing' && cfg.mode !== 'race' && selectedRow != null && !st.solved[selectedRow]
        ? h('button', { class: 'btn', onclick: () => { game.revealRow(selectedRow); selectedRow = null; } }, `👁 ${selectedRow + 1}. sor felfedése`) : null,
      st.status === 'playing' ? h('button', { class: 'btn danger', onclick: () => { if (confirm('Biztosan befejezed a játékot?')) game.end(); } }, '■ Játék vége') : null,
      st.status === 'ended' ? h('button', { class: 'btn primary', onclick: () => download(`${doc.title} - eredmények.csv`, game.resultsCsv(), 'text/csv') }, '⬇ Eredmények (Excel/CSV)') : null,
      h('a', { class: 'btn ghost', href: `#/edit/${doc.id}` }, 'Szerkesztő'),
    );

    const turnBanner = st.turn
      ? h('div', { class: 'turn-banner', style: { '--who': playerColor(st.turn.playerId) } },
        'Most ', h('strong', {}, playerName(st.turn.playerId)), ' jön',
        st.turn.remainingMs != null ? h('span', { class: 'timer' }, ` · ${Math.ceil(st.turn.remainingMs / 1000)} mp`) : null)
      : null;

    // Rács: verseny módban csak a forma látszik (és a végén a megoldás).
    const grid = renderGrid(pz, {
      cell: (r, c) => {
        const i = c - pz.rows[r].start;
        if (st.revealAll) return { text: st.revealAll[r][i], cls: st.solved[r] ? 'solved' : 'revealed' };
        if (st.solved[r]) return { text: st.solved[r].tokens[i], cls: 'solved', color: st.solved[r].by ? playerColor(st.solved[r].by) : null };
        for (const [id, g] of ghosts) {
          if (g.row === r && g.tokens[i]) return { text: g.tokens[i], cls: 'ghost', color: playerColor(id) };
        }
        return null;
      },
      row: (r) => {
        const g = [...ghosts.entries()].find(([, x]) => x.row === r);
        if (st.solved[r]?.by) return { cls: 'done', tag: { name: playerName(st.solved[r].by), color: playerColor(st.solved[r].by) } };
        if (g) return { cls: r === selectedRow ? 'selected' : '', tag: { name: `${playerName(g[0])} gépel…`, color: playerColor(g[0]) } };
        return { cls: r === selectedRow ? 'selected' : '' };
      },
      onRow: cfg.mode !== 'race' ? (r) => { selectedRow = selectedRow === r ? null : r; render(); } : null,
    });

    const bandInfo = h('div', { class: 'band-legend' }, pz.bands.map((b, k) => h('span', {},
      h('span', { class: `band-dot band-${k}` }),
      st.bands[k].solvedBy ? ` Megfejtette: ${playerName(st.bands[k].solvedBy)} — ${b.text}` : st.status === 'ended' ? ` ${b.text}` : ` ${k + 1}. megfejtés: ${b.length} betű`)));

    const players = [...st.players].sort((a, b) => b.score - a.score);
    const board = h('div', { class: 'board' },
      h('h3', {}, `Játékosok (${players.filter((p) => p.online).length})`),
      players.length ? null : h('p', { class: 'muted' }, 'Még senki nem lépett be. Mutasd meg a kódot vagy a QR-kódot!'),
      h('ol', { class: 'players' }, players.map((p) => h('li', { class: p.online ? '' : 'offline' },
        h('span', { class: 'dot', style: { background: p.color } }),
        h('span', { class: 'pname' }, p.name, p.finishedAt ? ' 🏁' : ''),
        cfg.mode === 'race' ? h('span', { class: 'bar' }, h('span', { style: { width: `${(100 * p.progress) / pz.rows.length}%`, background: p.color } })) : null,
        h('span', { class: 'score' }, p.score),
        st.status !== 'ended' ? h('button', { class: 'kick', title: 'Kiléptetés', onclick: () => { if (confirm(`${p.name} kiléptetése?`)) game.kick(p.id); } }, '✕') : null,
      ))),
    );

    fill(body, 
      controls,
      turnBanner,
      st.status === 'ended' ? h('div', { class: 'ended' }, '🎉 Vége a játéknak!') : null,
      h('div', { class: 'host-grid' },
        h('div', { class: 'card grid-card' }, grid, bandInfo, renderClues(pz, {
          cls: (r) => (st.solved[r] ? 'done' : ''),
        })),
        board,
      ),
    );
  }

  const tick = setInterval(() => {
    game.tick();
    if (game.mode === 'turns' && game.status === 'playing') render();
  }, 1000);

  openRoom(code, { id: hostId, name: 'Tanár', role: 'host' }, {
    onMessage: (t, p) => {
      if (t === 'typing') {
        if (p?.id && game.players.has(p.id) && cfg.mode !== 'race') {
          if (p.tokens?.length) ghosts.set(p.id, { row: p.row, tokens: p.tokens, at: Date.now() });
          else ghosts.delete(p.id);
          render();
        }
        return;
      }
      if (t === 'result' || t === 'state' || t === 'kick' || t === 'votes') return; // saját üzenetek
      game.handle(t, p);
      if (t === 'guess' || t === 'solution') ghosts.delete(p?.id);
    },
    onPresence: (ids) => { ids.delete(hostId); game.setPresence(ids); },
    onStatus: (s) => {
      if (s === 'SUBSCRIBED') {
        status.textContent = isOnline() ? '● Élő kapcsolat' : '● Demó mód (csak ezen a gépen)';
        status.className = 'conn ok';
        game.broadcast();
      } else if (s !== 'SUBSCRIBED') {
        status.textContent = '● Kapcsolat megszakadt, újracsatlakozás…';
        status.className = 'conn bad';
      }
    },
  }).then((r) => { room = r; game.broadcast(); }).catch((e) => toast(e.message, 'bad'));

  const warn = (e) => { if (game.status === 'playing') { e.preventDefault(); e.returnValue = ''; } };
  window.addEventListener('beforeunload', warn);

  render();
  return () => { clearInterval(tick); window.removeEventListener('beforeunload', warn); room?.close(); };
}

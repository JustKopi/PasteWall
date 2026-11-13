// Minijáték tanári oldala: szoba, indítás, élő ranglista, időzítő, eredmények, játékváltás.
import { h, fill, toast, download } from './dom.js';
import { createRoomHead } from './roomhead.js';
import { newGameDialog, switchRoomGame } from './newgame.js';
import { getActivity } from '../store.js';
import { MiniHost } from '../live/minihost.js';
import { openHostRoom, hasHostKeys } from '../live/secureroom.js';
import { isOnline } from '../config.js';
import { GAMES } from '../games/registry.js';
import { parseContent, prepareRound } from '../games/content.js';

/** Egy mentett tevékenységből a szobában játszható forma. */
export function activityForRoom(doc) {
  const g = GAMES[doc.game];
  const content = prepareRound(doc.game, parseContent(g.format, doc.raw || {}), Math.floor(Math.random() * 1e9));
  return { id: doc.id, game: doc.game, title: doc.title, content, timeLimit: doc.timeLimit || 0 };
}

export function miniHostPage(root, code) {
  const cfgKey = `pastewall.host.${code}`;
  const cfg = JSON.parse(sessionStorage.getItem(cfgKey) || 'null');
  let doc = cfg && getActivity(cfg.activityId);
  if (!doc || !hasHostKeys(code)) {
    fill(root, h('div', { class: 'page' }, h('div', { class: 'card' },
      h('h2', {}, 'Ez a szoba nem ezen a gépen fut'),
      h('p', {}, 'A játékot a tanári gépen, a játék szerkesztőjéből lehet elindítani.'),
      h('a', { class: 'btn', href: '#/' }, 'Kezdőlap'))));
    return undefined;
  }
  const hostId = `host-${code}`;
  let room = null;

  let locked = false;
  const game = new MiniHost({ activity: activityForRoom(doc), round: cfg.round || 1 }, (t, p) => room?.send(t, p), (id, t, p) => room?.sendTo(id, t, p), () => render());
  if (cfg.players) game.seedPlayers(cfg.players);

  const head = createRoomHead(code, () => [...game.players.values()]);
  const controls = h('div', { class: 'controls' });
  const banner = h('div');
  const boardEl = h('div', { class: 'card mg-board' });

  fill(root, h('div', { class: 'page host mini-host' }, head.el, controls, banner, boardEl));

  function render() {
    head.renderCount();
    const st = game.publicState();
    const g = GAMES[st.game];
    head.titleLine.textContent = `${g.icon} ${doc.title} · ${g.name}${st.round > 1 ? ` · ${st.round}. játék` : ''}`;
    fill(controls,
      st.status === 'lobby' ? h('button', { class: 'btn primary big', disabled: !game.players.size, onclick: () => game.start() }, '▶ Indítás') : null,
      h('button', { class: `btn ${locked ? 'primary' : ''}`, title: 'Lezárt szobába új diák nem léphet be (a bent lévők újracsatlakozhatnak)', onclick: () => { locked = !locked; room?.setLocked(locked); render(); } }, locked ? '🔒 Lezárva' : '🔓 Szoba lezárása'),
      st.status === 'playing' ? h('button', { class: 'btn danger', onclick: () => { if (confirm('Biztosan befejezed?')) game.end(); } }, '■ Játék vége') : null,
      st.status === 'ended' ? h('button', { class: 'btn', onclick: () => download(`${doc.title} - eredmények.csv`, game.resultsCsv(), 'text/csv') }, '⬇ Eredmények (Excel/CSV)') : null,
      st.status !== 'playing' ? h('button', { class: `btn ${st.status === 'ended' ? 'primary' : ''}`, onclick: pickNext }, '🎮 Új játék (a bent lévőkkel)') : null,
      h('a', { class: 'btn ghost', href: `#/game/${doc.game}/${doc.id}` }, 'Szerkesztő'));

    const done = st.players.filter((p) => p.done).length;
    fill(banner,
      st.status === 'lobby' ? h('div', { class: 'ended' }, `${g.icon} ${g.name}`, h('span', { class: 'muted small' }, ` — ${g.desc} Ha mindenki bent van, nyomd meg az Indítás gombot.`)) : null,
      st.status === 'playing' ? h('div', { class: 'turn-banner' }, '⏱ Folyik a játék · ', h('strong', {}, `${done}/${st.players.length}`), ' végzett',
        st.remainingMs != null ? h('span', { class: 'timer' }, ` · hátra: ${fmt(st.remainingMs)}`) : null) : null,
      st.status === 'ended' ? h('div', { class: 'ended' }, '🎉 Vége a játéknak!') : null);

    const sorted = [...st.players].sort((a, b) => b.score - a.score || (a.finishedAt ?? Infinity) - (b.finishedAt ?? Infinity));
    fill(boardEl,
      st.status === 'ended' && sorted.length ? h('div', { class: 'podium' }, sorted.slice(0, 3).map((p, i) => h('div', { class: `pod p${i + 1}` },
        h('div', { class: 'pod-medal' }, ['🥇', '🥈', '🥉'][i]), h('div', { class: 'pod-name', style: { color: p.color } }, p.name), h('div', { class: 'pod-score' }, `${p.score} pont`)))) : null,
      h('h3', {}, `Játékosok (${st.players.filter((p) => p.online).length})`),
      sorted.length ? null : h('p', { class: 'muted' }, 'Még senki nem lépett be. Mutasd meg a kódot vagy a QR-kódot!'),
      h('ol', { class: 'players big' }, sorted.map((p) => h('li', { class: p.online ? '' : 'offline' },
        h('span', { class: 'dot', style: { background: p.color } }),
        h('span', { class: 'pname' }, p.name, p.done ? ' 🏁' : ''),
        h('span', { class: 'bar' }, h('span', { style: { width: `${st.max ? (100 * p.score) / st.max : 0}%`, background: p.color } })),
        h('span', { class: 'muted small' }, st.status !== 'lobby' ? `${p.correct}✔ ${p.wrong}✘` : ''),
        h('span', { class: 'score' }, p.score),
        st.status !== 'ended' ? h('button', { class: 'kick', title: 'Kiléptetés', onclick: () => { if (confirm(`${p.name} kiléptetése?`)) game.kick(p.id); } }, '✕') : null))));
  }

  const fmt = (ms) => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

  function pickNext() {
    newGameDialog({
      currentId: doc.id,
      onPick: (pick) => {
        const players = [...game.players.values()].map(({ id, name, color, joinedAt }) => ({ id, name, color, joinedAt }));
        if (pick.kind === 'mini') {
          const next = getActivity(pick.id);
          if (!next) return;
          doc = next;
          sessionStorage.setItem(cfgKey, JSON.stringify({ kind: 'mini', activityId: next.id }));
          game.load(activityForRoom(next));
          toast('Új játék betöltve — indítsd el, ha mindenki kész!', 'ok');
        } else {
          switchRoomGame(code, pick, players, game.round + 1);
        }
      },
    });
  }

  const tick = setInterval(() => {
    game.tick();
    if (game.status === 'playing' && game.endsAt) {
      const el = banner.querySelector('.timer');
      if (el) el.textContent = ` · hátra: ${fmt(game.endsAt - Date.now())}`;
    }
  }, 1000);

  openHostRoom(code, {
    onBlocked: (name) => toast(`🔒 ${name || 'Valaki'} be akart lépni, de a szoba le van zárva.`, 'warn'),
    onMessage: (t, p) => {
      const isNew = t === 'hello' && p?.id && !game.players.has(p.id);
      game.handle(t, p);
      if (isNew && game.players.has(p.id)) toast(`👋 ${game.players.get(p.id).name} csatlakozott (${game.players.size} fő)`, 'ok');
    },
    onPresence: (ids) => { ids.delete(hostId); game.setPresence(ids); },
    onStatus: (s) => {
      head.status.textContent = s === 'SUBSCRIBED' ? (isOnline() ? '● Élő kapcsolat' : '● Demó mód (csak ezen a gépen)') : '● Kapcsolat megszakadt, újracsatlakozás…';
      head.status.className = `conn ${s === 'SUBSCRIBED' ? 'ok' : 'bad'}`;
      if (s === 'SUBSCRIBED') { game.broadcast(); game.sendContent(); }
    },
  }).then((r) => { room = r; game.broadcast(); game.sendContent(); }).catch((e) => toast(e.message, 'bad'));

  // szívverés: az állapotot időnként újraküldjük, így egy elveszett üzenet magától helyreáll
  const heartbeat = setInterval(() => { if (room) game.broadcast(); }, 4000);
  const warn = (e) => { if (game.status === 'playing' || game.players.size) { e.preventDefault(); e.returnValue = ''; } };
  window.addEventListener('beforeunload', warn);
  render();
  return () => { clearInterval(tick); clearInterval(heartbeat); head.destroy(); document.querySelector('.modal-back')?.remove(); window.removeEventListener('beforeunload', warn); room?.close(); };
}

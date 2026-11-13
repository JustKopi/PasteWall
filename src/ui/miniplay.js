// Minijáték a diák eszközén: tartalom fogadása, a játék indítása, élő állás.
import { h, fill, toast } from './dom.js';
import { GAMES } from '../games/registry.js';
import { CLIENTS } from '../games/clients.js';

export function miniClient(root, ctx) {
  const { me } = ctx;
  let st = null;
  let content = null;
  let contentRound = null;
  const assets = new Map();
  let needKeys = [];
  let destroyGame = null;
  let startedRound = null;
  let myDone = false;
  let lastNeed = 0;

  const head = h('div', { class: 'play-head' });
  const lobby = h('div', { class: 'card lobby' });
  const area = h('div', { class: 'mg-area' });
  const board = h('div', { class: 'card mini-board' });
  fill(root, h('div', { class: 'page play mini' }, head, lobby, area, board));

  const myScore = () => st?.players.find((p) => p.id === me.id)?.score ?? 0;

  function requestContent() {
    if (Date.now() - lastNeed < 2000) return;
    lastNeed = Date.now();
    ctx.send('needContent', { id: me.id });
  }
  let lastAssetReq = 0;
  function requestAssets() {
    const missing = needKeys.filter((k) => !assets.has(k));
    if (!missing.length || Date.now() - lastAssetReq < 3000) return;
    lastAssetReq = Date.now();
    ctx.send('needAssets', { id: me.id, keys: missing });
  }
  const needTimer = setInterval(() => {
    if (!st) return;
    if (!content || contentRound !== st.round) requestContent();
    else requestAssets();
  }, 2500);

  function stopGame() { destroyGame?.(); destroyGame = null; }

  function ready() {
    return content && contentRound === st.round && needKeys.every((k) => assets.has(k));
  }

  function maybeStart() {
    if (!st || st.status !== 'playing' || myDone || startedRound === st.round || !ready()) return;
    startedRound = st.round;
    const start = CLIENTS[st.game];
    if (!start) { fill(area, h('div', { class: 'card' }, 'Ismeretlen játék.')); return; }
    const color = st.players.find((p) => p.id === me.id)?.color;
    destroyGame = start(area, content, {
      color,
      asset: (k) => (typeof k === 'string' && k.startsWith('asset:') ? assets.get(k) : k),
      report: (s) => ctx.send('progress', { id: me.id, ...s }),
      finished: (s) => {
        myDone = true;
        setTimeout(() => {
          stopGame();
          fill(area, h('div', { class: 'card lobby' }, h('h2', {}, 'Kész! 🎉'), h('p', { class: 'big-num' }, `${s.score} pont`),
            h('p', { class: 'muted' }, `${s.correct} helyes, ${s.wrong} hibás. Várjuk a többieket…`)));
        }, 900);
      },
    }, content.seed || 1);
  }

  function render() {
    if (!st) return;
    const g = GAMES[st.game] || { name: st.game, icon: '🎮' };
    const meP = st.players.find((p) => p.id === me.id);
    fill(head,
      h('div', {}, h('strong', {}, `${g.icon} ${st.title}`), h('span', { class: 'muted' }, ` · ${g.name}`)),
      h('div', { class: 'me' }, h('span', { class: 'dot', style: { background: meP?.color || '#999' } }), ` ${me.name} · `, h('strong', {}, `${myScore()} pont`), ' ', ctx.status));
    lobby.hidden = st.status === 'playing';
    if (st.status === 'lobby') {
      fill(lobby, h('h2', {}, st.round > 1 ? 'Jön a következő játék! 🎉' : 'Bent vagy! 🎉'), h('p', {}, `${g.icon} ${g.name}`), h('p', { class: 'muted' }, g.desc),
        h('p', {}, 'Várjuk, hogy a tanár elindítsa.'),
        h('div', { class: 'chips' }, st.players.filter((p) => p.online).map((p) => h('span', { class: 'chip', style: { background: p.color } }, p.name))));
      fill(area);
    } else if (st.status === 'ended') {
      stopGame();
      const sorted = [...st.players].sort((a, b) => b.score - a.score);
      const rank = sorted.findIndex((p) => p.id === me.id) + 1;
      fill(lobby, h('h2', {}, 'Vége a játéknak!'), h('p', { class: 'big-num' }, `${myScore()} pont`), rank ? h('p', {}, `${rank}. helyezés ${sorted.length} játékosból`) : null,
        h('p', { class: 'muted' }, 'Maradj itt — ha a tanár új játékot indít, automatikusan átkerülsz.'));
      fill(area);
    } else if (!ready()) {
      fill(area, h('div', { class: 'card lobby' }, h('p', {}, 'A játék betöltése…')));
      requestContent();
    }
    const players = [...st.players].sort((a, b) => b.score - a.score);
    fill(board, h('h3', {}, 'Állás'), h('ol', { class: 'players' }, players.slice(0, 10).map((p) => h('li', { class: `${p.online ? '' : 'offline'} ${p.id === me.id ? 'me' : ''}` },
      h('span', { class: 'dot', style: { background: p.color } }), h('span', { class: 'pname' }, p.name, p.done ? ' 🏁' : ''),
      h('span', { class: 'bar' }, h('span', { style: { width: `${st.max ? (100 * p.score) / st.max : 0}%`, background: p.color } })),
      h('span', { class: 'score' }, p.score)))));
    maybeStart();
  }

  return {
    onMessage(t, p) {
      if (t === 'state') {
        if (st && p.round !== st.round) {
          stopGame(); myDone = false; startedRound = null; content = null; assets.clear(); needKeys = [];
          toast('🎮 Új játék érkezett!', 'ok');
        }
        st = p;
        if (!st.players.some((x) => x.id === me.id)) ctx.hello();
        render();
      } else if (t === 'content' && st && p.round === st.round) {
        if (contentRound !== p.round) { content = p.content; contentRound = p.round; needKeys = p.assetKeys || []; setTimeout(requestAssets, 1200 + Math.random() * 1500); }
        render();
      } else if (t === 'asset' && st && p.round === st.round) {
        if (!assets.has(p.key)) { assets.set(p.key, p.data); render(); }
      }
    },
    destroy() { stopGame(); clearInterval(needTimer); },
  };
}

// "Új játék ebben a szobában" párbeszéd: keresztrejtvények és minijátékok közül.
import { h } from './dom.js';
import { listPuzzles, listActivities } from '../store.js';
import { GAMES } from '../games/registry.js';
import { MODES } from '../live/game.js';

/**
 * @param {{currentId?:string, mode?:string, onPick:(pick:{kind:'crossword'|'mini', id:string, mode?:string})=>void}} o
 */
export function newGameDialog(o) {
  const items = [
    ...listPuzzles().filter((p) => p.puzzle).map((p) => ({ kind: 'crossword', id: p.id, title: p.title, sub: `🧩 Keresztrejtvény · ${p.puzzle.type === 'free' ? 'vegyes irányú' : 'megfejtés-sávos'} · ${p.puzzle.rows.length} kérdés` })),
    ...listActivities().map((a) => ({ kind: 'mini', id: a.id, title: a.title, sub: `${GAMES[a.game]?.icon || '🎮'} ${GAMES[a.game]?.name || a.game}` })),
  ];
  let picked = items.find((x) => x.id !== o.currentId) || items[0];
  const modeSel = h('select', { class: 'input' }, Object.entries(MODES).map(([k, m]) => h('option', { value: k, selected: k === (o.mode || 'coop') }, m.label)));
  const modeRow = h('label', { class: 'row-label' }, 'Keresztrejtvénynél a játékmód: ', modeSel);
  const syncMode = () => { modeRow.hidden = picked?.kind !== 'crossword'; };
  const close = () => back.remove();
  const back = h('div', { class: 'modal-back', onclick: (e) => { if (e.target === back) close(); } },
    h('div', { class: 'modal' },
      h('h2', {}, '🎮 Új játék ebben a szobában'),
      h('p', { class: 'muted' }, 'A bent lévők maradnak és átkerülnek, új diákok is csatlakozhatnak ugyanazzal a kóddal. A pontok nullázódnak — az előző eredményt előbb töltsd le, ha kell.'),
      items.length ? h('div', { class: 'pick-list' }, items.map((x) => h('label', { class: 'pick-item' },
        h('input', { type: 'radio', name: 'pick', checked: x === picked, onchange: () => { picked = x; syncMode(); } }),
        h('div', {}, h('strong', {}, x.title), h('div', { class: 'muted small' }, x.sub, x.id === o.currentId ? ' · (a mostani)' : ''))))) : h('p', {}, 'Nincs mentett játék. Előbb készíts egyet.'),
      modeRow,
      h('div', { class: 'actions' },
        h('button', { class: 'btn primary', disabled: !items.length, onclick: () => { close(); o.onPick({ kind: picked.kind, id: picked.id, mode: modeSel.value }); } }, 'Betöltés'),
        h('button', { class: 'btn ghost', onclick: close }, 'Mégse'),
        h('a', { class: 'btn ghost', href: '#/', target: '_blank', rel: 'noopener' }, '+ Új játék készítése (új lapon)'),
      )));
  syncMode();
  document.body.append(back);
}

/** Átváltás egy másik típusú játékra ugyanabban a szobában (a tanári oldal újraindul, a diákok maradnak). */
export function switchRoomGame(code, pick, players, round) {
  const cfg = pick.kind === 'mini'
    ? { kind: 'mini', activityId: pick.id, players, round }
    : { kind: 'crossword', puzzleId: pick.id, mode: pick.mode || 'coop', turnSeconds: 60, players, round };
  sessionStorage.setItem(`pastewall.host.${code}`, JSON.stringify(cfg));
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

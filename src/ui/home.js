import { h, fill } from './dom.js';
import { listPuzzles, deletePuzzle, listActivities, deleteActivity } from '../store.js';
import { GAMES } from '../games/registry.js';

export function homePage(root) {
  const code = h('input', { class: 'input big code-input', placeholder: 'KÓD', maxlength: 6, autocapitalize: 'characters' });
  const list = h('div', { class: 'saved' });

  function renderList() {
    const items = [
      ...listPuzzles().map((p) => ({ title: p.title, href: `#/edit/${p.id}`, icon: '🧩', sub: `Keresztrejtvény · ${p.puzzle?.rows?.length ?? '?'} kérdés`, at: p.updatedAt, del: () => deletePuzzle(p.id) })),
      ...listActivities().map((a) => ({ title: a.title, href: `#/game/${a.game}/${a.id}`, icon: GAMES[a.game]?.icon || '🎮', sub: GAMES[a.game]?.name || a.game, at: a.updatedAt, del: () => deleteActivity(a.id) })),
    ].sort((a, b) => b.at - a.at);
    fill(list,
      items.length ? null : h('p', { class: 'muted' }, 'Még nincs mentett játékod.'),
      ...items.map((x) => h('div', { class: 'saved-item' },
        h('a', { href: x.href }, `${x.icon} `, h('strong', {}, x.title), h('span', { class: 'muted' }, ` · ${x.sub} · ${new Date(x.at).toLocaleDateString('hu-HU')}`)),
        h('button', { class: 'btn ghost small', title: 'Törlés', onclick: () => { if (confirm(`Törlöd: ${x.title}?`)) { x.del(); renderList(); } } }, '🗑'))));
  }
  renderList();

  const tiles = [
    { href: '#/edit', icon: '🧩', name: 'Keresztrejtvény', desc: 'Megfejtés-sávos vagy vegyes irányú, közös, körös vagy verseny módban.' },
    ...Object.entries(GAMES).map(([k, g]) => ({ href: `#/game/${k}`, icon: g.icon, name: g.name, desc: g.desc })),
  ];

  fill(root, h('div', { class: 'page home' },
    h('section', { class: 'hero' },
      h('h1', {}, 'Paste', h('span', {}, 'Wall')),
      h('p', {}, 'Interaktív, élő osztálytermi játékok — a diákok a saját telefonjukról játszanak, a kivetítőn élő ranglista.'),
    ),
    h('div', { class: 'cols' },
      h('section', { class: 'card note teacher' },
        h('h2', {}, '👩‍🏫 Tanároknak'),
        h('p', { class: 'muted' }, 'Válassz játékot az alábbi listából, vagy nyiss meg egy mentettet:'),
        h('h3', {}, 'Mentett játékaim'),
        list,
      ),
      h('form', {
        class: 'card note student',
        onsubmit: (e) => { e.preventDefault(); location.hash = `#/join/${code.value.trim().toUpperCase()}`; },
      },
        h('h2', {}, '🎒 Diákoknak'),
        h('p', {}, 'Írd be a tanár által mutatott kódot:'),
        code,
        h('button', { class: 'btn primary big', type: 'submit' }, 'Tovább'),
      ),
    ),
    h('h2', { class: 'section-title' }, '✨ Új játék készítése'),
    h('div', { class: 'game-tiles' }, tiles.map((t) => h('a', { class: 'game-tile', href: t.href },
      h('div', { class: 'gt-icon' }, t.icon), h('div', {}, h('strong', {}, t.name), h('div', { class: 'muted small' }, t.desc))))),
  ));
}

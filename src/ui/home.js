import { h, fill } from './dom.js';
import { listPuzzles, deletePuzzle } from '../store.js';

export function homePage(root) {
  const code = h('input', { class: 'input big code-input', placeholder: 'KÓD', maxlength: 6, autocapitalize: 'characters' });
  const list = h('div', { class: 'saved' });

  function renderList() {
    const all = listPuzzles();
    fill(list, 
      all.length ? null : h('p', { class: 'muted' }, 'Még nincs mentett rejtvényed.'),
      ...all.map((p) => h('div', { class: 'saved-item' },
        h('a', { href: `#/edit/${p.id}` }, h('strong', {}, p.title), h('span', { class: 'muted' }, ` · ${p.puzzle?.height ?? '?'} sor · ${new Date(p.updatedAt).toLocaleDateString('hu-HU')}`)),
        h('button', { class: 'btn ghost small', title: 'Törlés', onclick: () => { if (confirm(`Törlöd: ${p.title}?`)) { deletePuzzle(p.id); renderList(); } } }, '🗑'),
      )),
    );
  }
  renderList();

  fill(root, h('div', { class: 'page home' },
    h('section', { class: 'hero' },
      h('h1', {}, 'Paste', h('span', {}, 'Wall')),
      h('p', {}, 'Interaktív, élő osztálytermi játékok — elsőként újság-stílusú keresztrejtvény megfejtés-sávval.'),
    ),
    h('div', { class: 'cols' },
      h('section', { class: 'card note teacher' },
        h('h2', {}, '👩‍🏫 Tanároknak'),
        h('a', { class: 'btn primary big', href: '#/edit' }, '+ Új keresztrejtvény'),
        h('h3', {}, 'Mentett rejtvényeim'),
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
  ));
}

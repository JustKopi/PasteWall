// Minijáték-szerkesztő: tartalom, időkorlát, kipróbálás, szoba indítása.
import { h, fill, toast } from './dom.js';
import { GAMES, FORMATS } from '../games/registry.js';
import { parseContent, validate, prepareRound } from '../games/content.js';
import { CLIENTS } from '../games/clients.js';
import { createSession } from '../games/server.js';
import { getActivity, saveActivity, newId } from '../store.js';
import { createRoom } from '../live/secureroom.js';
import { pickImage, compressImage } from './image.js';
import { emojiImage, DIAGRAMS } from './testimages.js';
import { TOPICS, testActivity, testImageQuiz } from '../games/bank.js';

const SAMPLES = {
  pairs: `Budapest - Magyarország fővárosa
Balaton - Közép-Európa legnagyobb tava
Duna - Budapesten átfolyó nagy folyó
Kékes - Magyarország legmagasabb hegycsúcsa
Debrecen - A cívisváros
Egér - A számítógép mutatóeszköze
Monitor - Képet megjelenítő kimeneti eszköz
Jelszó - Titkos karaktersor a belépéshez`,
  truefalse: `A Föld a Nap körül kering - igaz
A bálna hal - hamis
Egy hétben 7 nap van - igaz
A Duna Budapesten folyik át - igaz
A monitor beviteli eszköz - hamis
A pingvin madár - igaz
A Hold saját fényével világít - hamis
Egy évben 12 hónap van - igaz`,
  groups: `Emlős: bálna, kutya, denevér, ló
Madár: sas, pingvin, veréb, strucc
Hal: ponty, cápa, harcsa, csuka`,
  sentences: `A Duna Budapesten folyik át.
A bálna a tengerben élő emlős.
A Föld a Nap körül kering.
Az egér a számítógép mutatóeszköze.`,
  mcq: `Mi Magyarország fővárosa? | Budapest | Debrecen | Szeged | Pécs
Melyik a legnagyobb bolygó? | Jupiter | Mars | Föld | Vénusz
Hány lába van a póknak? | 8 | 6 | 10 | 4
Melyik beviteli eszköz? | Billentyűzet | Monitor | Nyomtató | Hangszóró
Ki írta a Toldit? | Arany János | Petőfi Sándor | Jókai Mór`,
};

export function gameEditorPage(root, game, id) {
  const existing = id ? getActivity(id) : null;
  const doc = existing || { id: newId(), game, title: '', raw: { text: '' }, timeLimit: 0 };
  if (!GAMES[doc.game]) { location.hash = '#/'; return undefined; }
  let preview = null;

  const title = h('input', { class: 'input big', placeholder: 'A játék címe', value: doc.title });
  const timeSel = h('select', { class: 'input' }, [0, 60, 120, 180, 300, 600].map((s) => h('option', { value: s, selected: s === (doc.timeLimit || 0) }, s ? `${s / 60} perc` : 'nincs időkorlát')));
  const typeSel = h('select', { class: 'input', onchange: () => { doc.game = typeSel.value; renderHead(); } });
  const headBox = h('div');
  const contentBox = h('div');
  const problemsBox = h('div');

  function fmt() { return GAMES[doc.game].format; }

  function renderHead() {
    const g = GAMES[doc.game];
    const same = Object.entries(GAMES).filter(([, x]) => x.format === g.format);
    fill(typeSel, same.map(([k, x]) => h('option', { value: k, selected: k === doc.game }, `${x.icon} ${x.name}`)));
    typeSel.disabled = same.length < 2;
    fill(headBox, h('h2', {}, `${g.icon} ${g.name}`), h('p', { class: 'muted' }, g.desc),
      same.length > 1 ? h('label', { class: 'row-label' }, 'Ugyanezzel a tartalommal más játék is: ', typeSel) : null);
  }

  // ---- tesztadat-generátor (beépített kérdésbank) ----
  let topic = 'mix';
  function testBar() {
    const f = fmt();
    const withTopic = !['imagequiz', 'diagram'].includes(f);
    const sel = h('select', { class: 'input', onchange: () => { topic = sel.value; } }, Object.entries(TOPICS).map(([k, v]) => h('option', { value: k, selected: k === topic }, v)));
    return h('div', { class: 'test-bar' },
      h('button', { class: 'btn small', title: 'Véletlenszerű tartalom a beépített kérdésbankból (1–8. osztály + informatika)', onclick: fillTest }, '🎲 Tesztadatok'),
      withTopic ? h('label', { class: 'row-label small' }, 'Téma: ', sel) : h('span', { class: 'muted small' }, f === 'diagram' ? 'rajzolt ábrák közül' : 'rajzolt képekkel'));
  }
  function fillTest() {
    const f = fmt();
    if (f === 'imagequiz') {
      doc.raw.items = testImageQuiz(8).map((q, k) => ({ image: emojiImage(q.emoji, k), text: q.text }));
      title.value = 'Képrejtő – teszt';
    } else if (f === 'diagram') {
      const d = DIAGRAMS[Math.floor(Math.random() * DIAGRAMS.length)]();
      doc.raw.image = d.image; doc.raw.labels = d.labels; title.value = d.title;
    } else {
      const t = testActivity(doc.game, f, topic);
      doc.raw.text = t.raw.text; title.value = t.title;
    }
    renderContent();
    toast('Tesztadatok betöltve — nyomd meg a 🧪 Kipróbálom gombot!', 'ok');
  }

  // ---- tartalom-szerkesztők ----
  function renderContent() {
    const f = fmt();
    const F = FORMATS[f];
    if (['pairs', 'truefalse', 'groups', 'sentences', 'mcq'].includes(f)) {
      const ta = h('textarea', { class: 'input entries', rows: 14, placeholder: F.placeholder, oninput: () => { doc.raw.text = ta.value; } });
      ta.value = doc.raw.text || '';
      fill(contentBox, testBar(), h('h3', {}, F.label), h('p', { class: 'muted small' }, F.help), ta,
        h('button', { class: 'btn ghost small', onclick: () => { ta.value = SAMPLES[f]; doc.raw.text = ta.value; if (!title.value) title.value = 'Próbajáték'; } }, 'Példa betöltése'));
    } else if (f === 'imagequiz') {
      doc.raw.items = doc.raw.items || [];
      const list = h('div', { class: 'iq-list' });
      const draw = () => fill(list, doc.raw.items.map((it, k) => h('div', { class: 'iq-item' },
        h('button', { class: 'iq-thumb', title: 'Kép feltöltése', onclick: async () => { const f2 = await pickImage(); if (f2) { it.image = await compressImage(f2); draw(); } } },
          it.image ? h('img', { src: it.image, alt: '' }) : '📷 Kép'),
        h('input', { class: 'input', value: it.text || '', placeholder: 'Kérdés | HELYES | rossz | rossz', oninput: (e) => { it.text = e.target.value; } }),
        h('button', { class: 'btn ghost small', onclick: () => { doc.raw.items.splice(k, 1); draw(); } }, '✕'))));
      draw();
      fill(contentBox, testBar(), h('h3', {}, F.label), h('p', { class: 'muted small' }, F.help), list,
        h('div', { class: 'actions' },
          h('button', { class: 'btn small', onclick: () => { doc.raw.items.push({ image: null, text: '' }); draw(); } }, '+ Kérdés'),
          h('button', { class: 'btn ghost small', onclick: () => {
            doc.raw.items = [
              { image: emojiImage('🐘', 0), text: 'Melyik állat ez? | Elefánt | Víziló | Orrszarvú | Bálna' },
              { image: emojiImage('🦒', 1), text: 'Melyik állat ez? | Zsiráf | Zebra | Teve | Ló' },
              { image: emojiImage('🖥️', 4), text: 'Mi ez az eszköz? | Monitor | Nyomtató | Egér | Hangszóró' },
              { image: emojiImage('🌋', 3), text: 'Mi látható a képen? | Vulkán | Hegy | Domb | Sziget' },
            ];
            if (!title.value) title.value = 'Képrejtő próba';
            draw();
          } }, 'Példa betöltése')));
    } else if (f === 'diagram') {
      doc.raw.labels = doc.raw.labels || [];
      const wrap = h('div', { class: 'dg-edit' });
      const draw = () => {
        fill(wrap, doc.raw.image
          ? h('div', { class: 'mg-diagram edit', onclick: (e) => {
            if (e.target.closest('.mg-pin')) return;
            const r = e.currentTarget.getBoundingClientRect();
            const text = prompt('A címke szövege ennél a pontnál:');
            if (!text?.trim()) return;
            doc.raw.labels.push({ text: text.trim(), x: Math.round(((e.clientX - r.left) / r.width) * 1000) / 10, y: Math.round(((e.clientY - r.top) / r.height) * 1000) / 10 });
            draw();
          } }, h('img', { src: doc.raw.image, alt: '' }), doc.raw.labels.map((l, k) => h('button', { class: 'mg-pin filled', style: { left: `${l.x}%`, top: `${l.y}%` }, title: 'Törlés', onclick: () => { if (confirm(`Törlöd: ${l.text}?`)) { doc.raw.labels.splice(k, 1); draw(); } } }, l.text)))
          : h('div', { class: 'placeholder' }, 'Tölts fel egy képet (pl. térkép, ábra, a növény részei).'));
      };
      draw();
      fill(contentBox, testBar(), h('h3', {}, F.label), h('p', { class: 'muted small' }, F.help, ' Egy címkére kattintva törölheted.'), wrap,
        h('div', { class: 'actions' },
          h('button', { class: 'btn small', onclick: async () => { const f2 = await pickImage(); if (f2) { doc.raw.image = await compressImage(f2, 900); draw(); } } }, '📷 Kép feltöltése'),
          h('button', { class: 'btn ghost small', onclick: () => {
            doc.raw.image = DIAGRAMS[0]().image;
            doc.raw.labels = [{ text: 'virág', x: 50, y: 24 }, { text: 'levél', x: 60.4, y: 52.4 }, { text: 'szár', x: 50, y: 45 }, { text: 'gyökér', x: 50, y: 88 }];
            if (!title.value) title.value = 'A növény részei';
            draw();
          } }, 'Példa betöltése')));
    }
  }

  function collect() {
    doc.title = title.value.trim() || `${GAMES[doc.game].name}`;
    doc.timeLimit = Number(timeSel.value);
    const content = parseContent(fmt(), doc.raw);
    const problems = validate(doc.game, content);
    fill(problemsBox, problems.length ? h('div', { class: 'problems' }, h('strong', {}, 'Javítsd ezeket:'), h('ul', {}, problems.map((p) => h('li', {}, p)))) : null);
    return problems.length ? null : content;
  }

  function save(quiet) {
    if (!collect()) return false;
    try { saveActivity(doc); } catch (e) { toast(e.message, 'bad'); return false; }
    if (!quiet) toast('Elmentve.', 'ok');
    if (location.hash !== `#/game/${doc.game}/${doc.id}`) history.replaceState(null, '', `#/game/${doc.game}/${doc.id}`);
    return true;
  }

  function tryIt() {
    const content = collect();
    if (!content) return;
    const round = prepareRound(doc.game, content, Math.floor(Math.random() * 1e9));
    const area = h('div', { class: 'mg-area' });
    const close = () => { preview?.(); preview = null; back.remove(); };
    const back = h('div', { class: 'modal-back' }, h('div', { class: 'modal wide' },
      h('div', { class: 'actions', style: { marginTop: 0, justifyContent: 'space-between' } }, h('strong', {}, `🧪 Kipróbálás: ${GAMES[doc.game].name}`), h('button', { class: 'btn small', onclick: close }, 'Bezárás')),
      area));
    document.body.append(back);
    // a "tanári" játékvezető itt helyben fut, ugyanúgy, mint élő játékban
    const sess = createSession(doc.game, round, Math.floor(Math.random() * 1e9));
    let current = sess.start(Date.now()).view;
    const wrap = (r) => ({ ...r, score: sess.s.score, correct: sess.s.correct, wrong: sess.s.wrong });
    preview = CLIENTS[doc.game](area, {
      color: '#17bebb',
      seed: round.seed,
      asset: (k) => k,
      start: async () => wrap({ view: current, done: sess.s.done }),
      act: async (op, payload) => { const r = sess.act(op, payload, Date.now()) || {}; if (r.view !== undefined) current = r.view; return wrap(r); },
      finished: (s) => toast(`Kész: ${s.score} pont (${s.correct} helyes, ${s.wrong} hibás)`, 'ok'),
    });
  }

  async function startLive() {
    if (!save(true)) return;
    const code = await createRoom();
    sessionStorage.setItem(`pastewall.host.${code}`, JSON.stringify({ kind: 'mini', activityId: doc.id }));
    location.hash = `#/host/${code}`;
  }

  renderHead();
  renderContent();
  fill(root, h('div', { class: 'page editor' },
    h('div', { class: 'crumbs' }, h('a', { href: '#/' }, '← Vissza'), ' · Minijáték'),
    h('div', { class: 'cols' },
      h('section', { class: 'card' }, headBox, title, contentBox),
      h('section', { class: 'card' },
        h('h3', {}, 'Beállítások'),
        h('label', { class: 'row-label' }, 'Időkorlát: ', timeSel),
        problemsBox,
        h('div', { class: 'actions' },
          h('button', { class: 'btn', onclick: tryIt }, '🧪 Kipróbálom'),
          h('button', { class: 'btn', onclick: () => save(false) }, 'Mentés')),
        h('div', { class: 'live-box' },
          h('h3', {}, 'Élő játék indítása'),
          h('p', { class: 'muted' }, 'Mindenki a saját telefonján játszik, a kivetítőn élő ranglista látszik. A szobában utána más játékra is válthatsz a bent lévőkkel.'),
          h('button', { class: 'btn primary big', onclick: startLive }, '▶ Szoba megnyitása'))))));
  return () => { preview?.(); document.querySelector('.modal-back')?.remove(); };
}

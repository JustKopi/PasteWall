// Minijáték-szerkesztő: tartalom, időkorlát, kipróbálás, szoba indítása.
import { h, fill, toast } from './dom.js';
import { GAMES, FORMATS } from '../games/registry.js';
import { parseContent, validate, prepareRound } from '../games/content.js';
import { CLIENTS } from '../games/clients.js';
import { getActivity, saveActivity, newId, newRoomCode } from '../store.js';
import { pickImage, compressImage } from './image.js';

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

/** Egyszerű rajzolt példakép emojival (képes kvízhez), hogy fájl nélkül is kipróbálható legyen. */
function emojiImage(emoji, bg) {
  const c = document.createElement('canvas');
  c.width = 480; c.height = 320;
  const x = c.getContext('2d');
  x.fillStyle = bg; x.fillRect(0, 0, 480, 320);
  x.font = '200px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(emoji, 240, 175);
  return c.toDataURL('image/jpeg', 0.8);
}

/** Rajzolt példaábra: növény részei (ábracímkézőhöz). */
function plantImage() {
  const c = document.createElement('canvas');
  c.width = 480; c.height = 420;
  const x = c.getContext('2d');
  x.fillStyle = '#eaf6ff'; x.fillRect(0, 0, 480, 300);
  x.fillStyle = '#8b5a2b'; x.fillRect(0, 300, 480, 120);
  x.strokeStyle = '#5a3a1a'; x.lineWidth = 4;
  x.beginPath(); x.moveTo(240, 300); x.lineTo(200, 400); x.moveTo(240, 300); x.lineTo(285, 405); x.moveTo(240, 300); x.lineTo(240, 410); x.stroke();
  x.strokeStyle = '#2e8b2e'; x.lineWidth = 10; x.beginPath(); x.moveTo(240, 300); x.lineTo(240, 120); x.stroke();
  x.fillStyle = '#3bb273';
  x.beginPath(); x.ellipse(290, 220, 50, 20, -0.5, 0, Math.PI * 2); x.fill();
  x.beginPath(); x.ellipse(190, 250, 50, 20, 0.5, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#f25f9a';
  for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; x.beginPath(); x.ellipse(240 + Math.cos(a) * 32, 100 + Math.sin(a) * 32, 22, 14, a, 0, Math.PI * 2); x.fill(); }
  x.fillStyle = '#ffc914'; x.beginPath(); x.arc(240, 100, 20, 0, Math.PI * 2); x.fill();
  return c.toDataURL('image/jpeg', 0.85);
}

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

  // ---- tartalom-szerkesztők ----
  function renderContent() {
    const f = fmt();
    const F = FORMATS[f];
    if (['pairs', 'truefalse', 'groups', 'sentences', 'mcq'].includes(f)) {
      const ta = h('textarea', { class: 'input entries', rows: 14, placeholder: F.placeholder, oninput: () => { doc.raw.text = ta.value; } });
      ta.value = doc.raw.text || '';
      fill(contentBox, h('h3', {}, F.label), h('p', { class: 'muted small' }, F.help), ta,
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
      fill(contentBox, h('h3', {}, F.label), h('p', { class: 'muted small' }, F.help), list,
        h('div', { class: 'actions' },
          h('button', { class: 'btn small', onclick: () => { doc.raw.items.push({ image: null, text: '' }); draw(); } }, '+ Kérdés'),
          h('button', { class: 'btn ghost small', onclick: () => {
            doc.raw.items = [
              { image: emojiImage('🐘', '#dff3ff'), text: 'Melyik állat ez? | Elefánt | Víziló | Orrszarvú | Bálna' },
              { image: emojiImage('🦒', '#fff3c4'), text: 'Melyik állat ez? | Zsiráf | Zebra | Teve | Ló' },
              { image: emojiImage('🖥️', '#eef'), text: 'Mi ez az eszköz? | Monitor | Nyomtató | Egér | Hangszóró' },
              { image: emojiImage('🌋', '#ffe4dc'), text: 'Mi látható a képen? | Vulkán | Hegy | Domb | Sziget' },
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
      fill(contentBox, h('h3', {}, F.label), h('p', { class: 'muted small' }, F.help, ' Egy címkére kattintva törölheted.'), wrap,
        h('div', { class: 'actions' },
          h('button', { class: 'btn small', onclick: async () => { const f2 = await pickImage(); if (f2) { doc.raw.image = await compressImage(f2, 900); draw(); } } }, '📷 Kép feltöltése'),
          h('button', { class: 'btn ghost small', onclick: () => {
            doc.raw.image = plantImage();
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
    preview = CLIENTS[doc.game](area, round, {
      color: '#17bebb',
      asset: (k) => k,
      report: () => {},
      finished: (s) => toast(`Kész: ${s.score} pont (${s.correct} helyes, ${s.wrong} hibás)`, 'ok'),
    }, round.seed);
  }

  function startLive() {
    if (!save(true)) return;
    const code = newRoomCode();
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

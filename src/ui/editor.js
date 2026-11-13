import { h, fill, toast } from './dom.js';
import { makeGridView, renderClues } from './grid.js';
import { generateCrossword, parseEntries } from '../crossword/generator.js';
import { generateFreeform } from '../crossword/freeform.js';
import { getPuzzle, savePuzzle, newId, newRoomCode } from '../store.js';
import { MODES } from '../live/game.js';

const SAMPLE = {
  title: 'Petőfi Sándor élete',
  solutions: ['SEGESVÁR'],
  entries: `Szendrey Júlia - Petőfi felesége
Kiskőrös - Petőfi szülővárosa
Egressy Gábor - Színész, Petőfi barátja
Nemzeti dal - Március 15-én elszavalt vers
Alföld - Petőfi kedvelt tája
Bem apó - Lengyel tábornok, akinek Petőfi segédtisztje volt
Arany János - Költőbarát, a Toldi szerzője
János vitéz - Elbeszélő költemény Iluskáról
Pilvax - Pesti kávéház, a márciusi ifjak törzshelye
Szeptember végén - Vers a Koltón töltött mézesheteken
Irányi Dániel - Márciusi ifjú
Felhők - Petőfi versciklusa
Vasvári Pál - Márciusi ifjú, történész
Tigris és hiéna - Petőfi drámája
Erdélyi hadsereg - Bem seregének neve`,
};

export function editorPage(root, id) {
  const existing = id ? getPuzzle(id) : null;
  const doc = existing || { id: newId(), type: 'band', title: '', solutions: [''], entriesText: '', digraphs: true, layout: 'auto', maxWords: 16, seed: null, puzzle: null };
  doc.type = doc.type || 'band';
  let result = doc.puzzle ? { ok: true, puzzle: doc.puzzle, seed: doc.seed } : null;

  const title = h('input', { class: 'input big', placeholder: 'A rejtvény címe (pl. Petőfi élete)', value: doc.title });
  const bandsBox = h('div', { class: 'bands' });
  const layoutSel = h('select', { class: 'input' },
    h('option', { value: 'auto' }, 'Automatikus elrendezés'),
    h('option', { value: 'parallel' }, 'Sávok egymás mellett (több szó kell)'),
    h('option', { value: 'stacked' }, 'Sávok egymás alatt'),
  );
  layoutSel.value = doc.layout || 'auto';
  const entries = h('textarea', {
    class: 'input entries',
    rows: 14,
    placeholder: 'Soronként egy szó és a meghatározása, pl.\nKiskőrös - Petőfi szülővárosa\nArany János - A Toldi szerzője',
  });
  entries.value = doc.entriesText;
  const digraphs = h('input', { type: 'checkbox', checked: doc.digraphs !== false });
  const out = h('div', { class: 'preview' });
  const typeHelp = h('p', { class: 'muted' });
  const maxWordsSel = h('select', { class: 'input' },
    [8, 12, 16, 20, 25, 30, 40, 50].map((n) => h('option', { value: n, selected: n === (doc.maxWords || 16) }, `legfeljebb ${n} szó`)));
  const freeOpts = h('label', { class: 'row-label' }, 'Méret: ', maxWordsSel);
  const typeBtns = h('div', { class: 'type-switch' });

  function typeUI() {
    const free = doc.type === 'free';
    fill(typeBtns,
      h('button', { class: `btn ${free ? '' : 'primary'}`, onclick: () => setType('band') }, '▤ Megfejtés-sávos'),
      h('button', { class: `btn ${free ? 'primary' : ''}`, onclick: () => setType('free') }, '✚ Vegyes irányú'));
    typeHelp.textContent = free
      ? 'A szavak vízszintesen és függőlegesen keresztezik egymást, a mezők számozottak. A megfejtés nem kötelező: ha megadod, a betűi sorszámozott, kiemelt mezőkbe kerülnek.'
      : 'A kiemelt függőleges sáv(ok)ban fentről lefelé olvasható ki — mint az újságban.';
    layoutSel.hidden = free;
    freeOpts.hidden = !free;
    bandInputs();
  }
  function setType(t) {
    if (doc.type === t) return;
    doc.type = t;
    if (t === 'free') doc.solutions = [doc.solutions[0] || ''];
    result = null;
    doc.puzzle = null;
    typeUI();
    showResult();
  }
  const count = h('span', { class: 'muted' });

  function bandInputs() {
    fill(bandsBox, 
      ...doc.solutions.map((s, i) => h('div', { class: 'band-input' },
        h('span', { class: `band-dot band-${i}` }),
        h('input', {
          class: 'input',
          value: s,
          placeholder: doc.type === 'free' ? 'Megfejtés (nem kötelező)' : i === 0 ? 'Megfejtés (fő sáv), pl. SEGESVÁR' : `${i + 1}. sáv megfejtése`,
          oninput: (e) => { doc.solutions[i] = e.target.value; },
        }),
        doc.solutions.length > 1 ? h('button', { class: 'btn ghost small', title: 'Sáv törlése', onclick: () => { doc.solutions.splice(i, 1); bandInputs(); } }, '✕') : null,
      )),
      doc.solutions.length < 4 && doc.type !== 'free' ? h('button', { class: 'btn ghost small', onclick: () => { doc.solutions.push(''); bandInputs(); } }, '+ Újabb fő sáv') : null,
    );
  }

  function updateCount() {
    const n = parseEntries(entries.value).length;
    count.textContent = `${n} szó`;
  }
  entries.addEventListener('input', updateCount);

  function collect() {
    doc.title = title.value.trim() || 'Névtelen rejtvény';
    doc.entriesText = entries.value;
    doc.digraphs = digraphs.checked;
    doc.layout = layoutSel.value;
    doc.maxWords = Number(maxWordsSel.value);
  }

  function generate(newSeed) {
    collect();
    const seed = newSeed ? undefined : doc.seed ?? undefined;
    result = doc.type === 'free'
      ? generateFreeform({ solution: doc.solutions[0], entries: parseEntries(doc.entriesText), digraphs: doc.digraphs, maxWords: doc.maxWords, seed })
      : generateCrossword({ solutions: doc.solutions, entries: parseEntries(doc.entriesText), digraphs: doc.digraphs, layout: doc.layout, seed });
    if (result.ok) {
      doc.seed = result.seed;
      doc.puzzle = result.puzzle;
    } else {
      doc.puzzle = null;
    }
    showResult();
  }

  function showResult() {
    fill(out);
    if (!result) {
      out.append(h('div', { class: 'placeholder' }, 'Írd be a megfejtést és a szavakat, majd nyomd meg a „Rejtvény generálása” gombot.'));
      return;
    }
    if (!result.ok) {
      out.append(h('div', { class: 'problems' }, h('strong', {}, 'Még nem sikerült kirakni:'), h('ul', {}, result.problems.map((p) => h('li', {}, p)))));
      return;
    }
    const pz = result.puzzle;
    out.append(
      h('div', { class: 'preview-head' },
        h('strong', {}, 'Előnézet (megoldással)'),
        pz.layout === 'stacked' && pz.bands.length > 1 ? h('span', { class: 'pill' }, 'a sávok egymás alatt') : null,
      ),
      previewGrid(pz),
      h('div', { class: 'band-legend' }, pz.bands.map((b, k) => h('span', {}, h('span', { class: `band-dot band-${k}` }), ` ${b.text}`))),
      renderClues(pz),
      pz.unused.length ? h('p', { class: 'muted' }, `Nem került bele (${pz.unused.length}): ${pz.unused.join(', ')}`) : null,
    );
  }

  function previewGrid(pz) {
    const v = makeGridView(pz);
    v.update((r, i) => ({ text: pz.rows[r].tokens[i] }), () => null);
    return v.el;
  }

  function save(quiet) {
    collect();
    if (!doc.puzzle) { toast('Előbb generáld le a rejtvényt.', 'warn'); return false; }
    savePuzzle(doc);
    if (!quiet) toast('Elmentve.', 'ok');
    if (location.hash !== `#/edit/${doc.id}`) history.replaceState(null, '', `#/edit/${doc.id}`);
    return true;
  }

  const modeSel = h('div', { class: 'modes' },
    Object.entries(MODES).map(([k, m], i) => h('label', { class: 'mode' },
      h('input', { type: 'radio', name: 'mode', value: k, checked: i === 0 }),
      h('div', {}, h('strong', {}, m.label), h('div', { class: 'muted' }, m.desc)),
    )),
  );
  const turnSel = h('select', { class: 'input' },
    [30, 60, 90, 0].map((s) => h('option', { value: s, selected: s === 60 }, s ? `${s} mp / kör` : 'nincs időkorlát')),
  );

  function startLive() {
    if (!save(true)) return;
    const mode = modeSel.querySelector('input:checked').value;
    const code = newRoomCode();
    sessionStorage.setItem(`pastewall.host.${code}`, JSON.stringify({ puzzleId: doc.id, mode, turnSeconds: Number(turnSel.value) }));
    location.hash = `#/host/${code}`;
  }

  typeUI();
  updateCount();
  showResult();

  fill(root, 
    h('div', { class: 'page editor' },
      h('div', { class: 'crumbs' }, h('a', { href: '#/' }, '← Vissza'), ' · Keresztrejtvény'),
      h('div', { class: 'cols' },
        h('section', { class: 'card' },
          title,
          h('h3', {}, 'Rejtvény típusa'),
          typeBtns,
          h('h3', {}, 'Megfejtés'),
          typeHelp,
          bandsBox,
          layoutSel,
          freeOpts,
          h('h3', {}, 'Szavak és meghatározások ', count),
          entries,
          h('label', { class: 'check' }, digraphs, ' Kettős betűk (CS, SZ, GY, NY, ZS, DZS…) egy cellában'),
          h('p', { class: 'muted small' }, 'Tipp: összetett szónál a „|” jellel választhatod szét a betűket, pl. HÁZ|SZÁM.'),
          h('div', { class: 'actions' },
            h('button', { class: 'btn primary', onclick: () => generate(false) }, 'Rejtvény generálása'),
            h('button', { class: 'btn', onclick: () => generate(true) }, '🔀 Újrakeverés'),
            h('button', { class: 'btn', onclick: () => save(false) }, 'Mentés'),
            !doc.entriesText ? h('button', {
              class: 'btn ghost',
              onclick: () => {
                title.value = SAMPLE.title;
                doc.solutions = [...SAMPLE.solutions];
                entries.value = SAMPLE.entries;
                bandInputs();
                updateCount();
                generate(true);
              },
            }, 'Példa betöltése') : null,
          ),
        ),
        h('section', { class: 'card' },
          out,
          h('div', { class: 'live-box' },
            h('h3', {}, 'Élő játék indítása'),
            modeSel,
            h('label', { class: 'row-label' }, 'Körös játéknál: ', turnSel),
            h('button', { class: 'btn primary big', onclick: startLive }, '▶ Szoba megnyitása'),
          ),
        ),
      ),
    ),
  );
}

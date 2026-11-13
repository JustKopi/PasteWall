// A minijátékok listája. Mindegyik "verseny" elven működik: minden diák a saját példányát játssza,
// a tanári kivetítőn élő ranglista. A tartalom formátuma (format) határozza meg a szerkesztőt.

export const GAMES = {
  type: {
    name: 'Írd be a választ', icon: '⌨️', format: 'pairs',
    desc: 'Minden kérdésre be kell gépelni a helyes választ.',
  },
  truefalse: {
    name: 'Igaz vagy hamis', icon: '✔️', format: 'truefalse',
    desc: 'Egyre gyorsabban érkező állítások: igaz vagy hamis?',
  },
  memory: {
    name: 'Párkereső', icon: '🃏', format: 'pairs',
    desc: 'Fordíts fel két lapot: ha összetartoznak, megtaláltad a párt.',
  },
  pairornot: {
    name: 'Pár vagy nem pár?', icon: '🔀', format: 'pairs',
    desc: 'Két kártya: összetartoznak vagy nem?',
  },
  hangman: {
    name: 'Akasztófa', icon: '🪢', format: 'pairs',
    desc: 'Találd ki a szót betűnként, mielőtt elfogynak az életeid.',
  },
  spell: {
    name: 'Betűrakó', icon: '🔤', format: 'pairs',
    desc: 'Rakd sorba az összekevert betűket, hogy kijöjjön a válasz.',
  },
  wordsearch: {
    name: 'Szókereső', icon: '🔍', format: 'pairs',
    desc: 'Keresd meg a betűrácsba rejtett szavakat.',
  },
  sorting: {
    name: 'Villámcsoportosító', icon: '🗂️', format: 'groups',
    desc: 'Minden elemet tegyél a megfelelő csoportba, minél gyorsabban.',
  },
  magnets: {
    name: 'Szómágnes', icon: '🧲', format: 'sentences',
    desc: 'Rakd sorba a szavakat, hogy helyes mondat legyen belőlük.',
  },
  maze: {
    name: 'Labirintus', icon: '🌀', format: 'mcq',
    desc: 'Fuss a helyes válasz mezőjébe, és kerüld el az üldözőket!',
  },
  imagequiz: {
    name: 'Képrejtő kvíz', icon: '🖼️', format: 'imagequiz',
    desc: 'A kép lassan előbukkan — minél hamarabb tippelsz jól, annál több a pont.',
  },
  diagram: {
    name: 'Ábracímkéző', icon: '📍', format: 'diagram',
    desc: 'Húzd vagy koppintsd a címkéket a helyükre a képen.',
  },
};

export const FORMATS = {
  pairs: {
    label: 'Kifejezések és párjaik',
    help: 'Soronként: VÁLASZ - kérdés/meghatározás/pár. Pl. „Budapest - Magyarország fővárosa”.',
    placeholder: 'Budapest - Magyarország fővárosa\nBalaton - Közép-Európa legnagyobb tava\nDuna - Budapesten átfolyó folyó',
  },
  truefalse: {
    label: 'Állítások',
    help: 'Soronként egy állítás, a végén „- igaz” vagy „- hamis”.',
    placeholder: 'A Föld a Nap körül kering - igaz\nA bálna hal - hamis\nEgy hétben 7 nap van - igaz',
  },
  groups: {
    label: 'Csoportok és elemeik',
    help: 'Soronként egy csoport: CSOPORT: elem, elem, elem.',
    placeholder: 'Emlős: bálna, kutya, denevér\nMadár: sas, pingvin, veréb\nHal: ponty, cápa, harcsa',
  },
  sentences: {
    label: 'Mondatok',
    help: 'Soronként egy mondat. A játékban a szavai összekeverve jelennek meg.',
    placeholder: 'A Duna Budapesten folyik át.\nA bálna emlős állat.',
  },
  mcq: {
    label: 'Kérdések válaszlehetőségekkel',
    help: 'Soronként: kérdés | HELYES válasz | rossz | rossz | rossz (2–4 válasz).',
    placeholder: 'Mi Magyarország fővárosa? | Budapest | Debrecen | Szeged | Pécs\n2 + 3 = ? | 5 | 6 | 4',
  },
  imagequiz: {
    label: 'Képes kérdések',
    help: 'Minden kérdéshez tölts fel egy képet, és add meg: kérdés | HELYES | rossz | rossz | rossz.',
  },
  diagram: {
    label: 'Kép és címkék',
    help: 'Tölts fel egy képet, aztán kattints a képre a címkék helyének megadásához.',
  },
};

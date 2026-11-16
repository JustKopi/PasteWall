// Patch note-ok idővonala. Új kiadásnál a lista ELEJÉRE kerül egy új bejegyzés
// (a legfrissebb van felül), a régiek maradnak, így visszakövethető minden változás.
// Verziószám: A-x.y.z = alpha x.y.z.

export const PATCH_NOTES = [
  {
    version: 'A-0.1.1',
    date: '2026-11-16',
    title: 'Boostok, lépcsős pontozás, szavazás',
    items: [
      'Javítva: telefonon, verseny módban nem ugrik vissza a meghatározások listája, ha egy másik diák megfejt egy kérdést.',
      'Új: a rejtvény a mérettől függetlenül nagyítható (−/+ gombok, Ctrl+görgő, telefonon két ujjas csippentés).',
      'Új: lépcsős pontozás verseny módban: az első megfejtő kapja a legtöbb pontot, minden további X-szel kevesebbet, legalább 10-et.',
      'Új: boostok a diákoknak: dupla pont, első + utolsó betű, pár betű, egy mező betűje. A tanár kapcsolja be, és megadja, hányszor használhatók.',
      'Új: a tanár verseny módban is felfedhet egy-egy kérdést (rákattint, majd „Felfedés”).',
      'Új: szavazás: a diákok jelezhetik, melyik kérdést fedje fel a tanár (csak irányadó).',
      'Új: „⚙ Beállítások” a tanári oldalon: boostok, pontozás és körös idő játék közben is állíthatók.',
    ],
  },
];

export const VERSION = PATCH_NOTES[0].version;

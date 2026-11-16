// Játékosnév-szűrő: trágár, sértő és egyéb nem odaillő nevek tiltása, a szokásos trükkökkel együtt
// (ékezetek, nagybetűk, számokkal írt betűk: f4sz, betűismétlés: kurrrva, elválasztók: f.a.s.z,
// szétírt betűk: f a s z, csillag: f*sz, w/v/u, q/k, cirill hasonmás betűk).
//
// Két lista van:
//  - SUBSTR: szórészként is tilos (pl. „lófasz”, „kurvaanyád”). Csak olyan szó kerülhet ide,
//    ami ártatlan nevekben nem fordul elő.
//  - WORD: csak önálló szóként tilos, mert részként gyakori nevekben is szerepel
//    (pl. „szar” → Szarka, Szarvas, Császár; „anyad” → Kányádi; „pocs” → Pócsik).

const SUBSTR = [
  // magyar
  'fasz', 'kurva', 'kurvany', 'picsa', 'geci', 'ribanc', 'basz', 'kocsog', 'segg', 'hulye', 'nyomorek', 'idiota',
  'debil', 'csicska', 'buzeran', 'pedofil', 'szopj', 'szopas', 'szopo', 'szarhazi', 'szaros', 'szarfej', 'kibasz',
  'faszfej', 'faszkalap', 'hugyos', 'fosos', 'kurafi', 'lotyo', 'cigo', 'hitler', 'fasiszta', 'retard',
  'majmok', 'seggfej', 'pisis', 'fingos', 'punci', 'tokmag', 'tokfej', 'gyokér', 'gyoker', 'barom', 'bunko',
  // angol
  'fuck', 'shit', 'bitch', 'cunt', 'pussy', 'whore', 'slut', 'porn', 'penis', 'vagina', 'nigger', 'nigga', 'asshole',
  'bastard', 'motherf', 'dickhead', 'wanker', 'boobs', 'horny',
];
const WORD = [
  'szar', 'fos', 'anyad', 'anyadat', 'pocs', 'pina', 'buzi', 'buzik', 'szop', 'szopd', 'kaki', 'kaka', 'pisi', 'fing',
  'hugy', 'naci', 'nazi', 'majom', 'pedo', 'nyomi', 'ass', 'dick', 'cock', 'sex', 'sexy', 'tits', 'fag', 'rape',
  'admin', 'tanar', 'tanarno', 'tanarur', 'teacher', 'moderator',
];

const LEET = { 0: 'o', 1: 'i', 2: 'z', 3: 'e', 4: 'a', 5: 's', 6: 'g', 7: 't', 8: 'b', 9: 'g', '@': 'a', $: 's', '€': 'e', '!': 'i', '|': 'i', '¡': 'i', '£': 'l', '+': 't' };
// cirill és görög hasonmás betűk
const LOOKALIKE = { а: 'a', е: 'e', о: 'o', р: 'p', с: 'c', у: 'y', х: 'x', к: 'k', м: 'm', т: 't', н: 'h', в: 'b', і: 'i', ј: 'j', ѕ: 's', α: 'a', ο: 'o', ν: 'v', ρ: 'p', τ: 't', κ: 'k', ι: 'i' };
const WILDCARD = '?';

/** Egy szó (token) egységes alakja: kisbetű, ékezet nélkül, számok betűvé, ismétlések összevonva. */
function normToken(s, alt) {
  let out = '';
  for (const raw of s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')) {
    let ch = LOOKALIKE[raw] ?? LEET[raw] ?? raw;
    if (ch === '*' || ch === '#') ch = WILDCARD; // f*sz: a csillag bármelyik betű lehet
    if (alt) ch = { w: 'u', v: 'u', q: 'k', y: 'i', x: 'k' }[ch] ?? ch; // kurwa = kurva, fvck = fuck
    if (/[a-z]/.test(ch) || ch === WILDCARD) out += ch;
  }
  return out.replace(/([a-z])\1+/g, '$1'); // kurrrva -> kurva, segg -> seg (a listát is így alakítjuk)
}

/** A név szavai; az egybetűs szavak sorozatát összevonja (f a s z -> fasz). */
function tokens(name, alt) {
  const parts = name.normalize('NFKC').replace(/[​-‏⁠﻿]/g, '').split(/[\s_\-.,;:/\\]+/)
    .map((p) => normToken(p, alt)).filter(Boolean);
  const out = [];
  let run = '';
  for (const p of parts) {
    if (p.length === 1) { run += p; continue; }
    if (run) { out.push(run); run = ''; }
    out.push(p);
  }
  if (run) out.push(run);
  // „f.a.s.z” egyetlen szóként is: az elválasztók nélküli teljes alak, ha csupa rövid darabból áll
  if (parts.length > 1 && parts.every((p) => p.length <= 2)) out.push(parts.join(''));
  return out;
}

const matchAt = (hay, needle, i) => {
  for (let k = 0; k < needle.length; k++) {
    const c = hay[i + k];
    if (c !== needle[k] && c !== WILDCARD) return false;
  }
  return true;
};
const contains = (hay, needle) => {
  for (let i = 0; i + needle.length <= hay.length; i++) if (matchAt(hay, needle, i)) return true;
  return false;
};
const equals = (hay, needle) => hay.length === needle.length && matchAt(hay, needle, 0);

const LISTS = [false, true].map((alt) => ({
  alt,
  substr: [...new Set(SUBSTR.map((w) => normToken(w, alt)))],
  word: [...new Set(WORD.map((w) => normToken(w, alt)))],
}));

/** Igaz, ha a név nem használható (trágár, sértő vagy fenntartott). */
export function isBadName(name) {
  const s = String(name || '');
  if (!s.trim()) return false;
  for (const { alt, substr, word } of LISTS) {
    for (const t of tokens(s, alt)) {
      // a csupa csillagból álló vagy túl sok helyettesítőt tartalmazó szó ne egyezzen mindennel
      if ([...t].filter((c) => c === WILDCARD).length * 2 > t.length) continue;
      if (word.some((w) => equals(t, w))) return true;
      if (substr.some((w) => w.length >= 4 && contains(t, w))) return true;
      if (substr.some((w) => w.length < 4 && equals(t, w))) return true;
    }
  }
  return false;
}

/** A tanári gép ezzel tisztítja a beérkező nevet (a diák kliense megkerülhető). */
export function safeName(name) {
  const clean = String(name || '').trim().slice(0, 24);
  if (!clean || isBadName(clean)) return 'Névtelen';
  return clean;
}

export const BAD_NAME_MESSAGE = 'Ilyen nevet nem használhatsz!';

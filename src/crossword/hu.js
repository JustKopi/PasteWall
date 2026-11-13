// Magyar betűkezelés keresztrejtvényhez.
// Kettős/hármas betűk (CS, SZ, GY, NY, ZS, LY, TY, DZ, DZS) egy cellát foglalnak,
// ahogy a magyar rejtvényekben szokás. A "|" jel kézzel szétválaszt (pl. HÁZ|SZÁM).

const DIGRAPHS = ['DZS', 'CS', 'DZ', 'GY', 'LY', 'NY', 'SZ', 'TY', 'ZS'];

/** Nagybetűsít, a betűkön és a "|" jelen kívül mindent eldob. */
export function normalize(text) {
  return String(text ?? '')
    .toLocaleUpperCase('hu-HU')
    .replace(/[^\p{L}|]/gu, '');
}

/**
 * Szót cellákra bont.
 * @param {string} text
 * @param {{digraphs?: boolean}} [opts]
 * @returns {string[]}
 */
export function tokenize(text, opts = {}) {
  const digraphs = opts.digraphs !== false;
  const s = normalize(text);
  const out = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === '|') { i++; continue; }
    if (digraphs) {
      // Hosszú kettős mássalhangzó: SSZ -> SZ SZ, CCS -> CS CS, DDZS -> DZS DZS
      const long = DIGRAPHS.find((d) => s.startsWith(d[0] + d, i));
      if (long) { out.push(long, long); i += long.length + 1; continue; }
      const d = DIGRAPHS.find((dg) => s.startsWith(dg, i));
      if (d) { out.push(d); i += d.length; continue; }
    }
    out.push(ch);
    i++;
  }
  return out;
}

/** Bemenet összevetése: kis/nagybetű és ékezet-írásmód egységesítve. */
export function sameTokens(a, b) {
  if (a.length !== b.length) return false;
  return a.every((t, i) => t === b[i]);
}

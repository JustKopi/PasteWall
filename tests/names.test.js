import { describe, it, expect } from 'vitest';
import { isBadName, safeName } from '../src/live/names.js';

describe('névszűrő', () => {
  it('tiltja a trágár neveket minden szokásos változatban', () => {
    for (const n of ['fasz', 'FASZ', 'Fász', 'f4sz', 'f@sz', 'faaaasz', 'f.a.s.z', 'f a s z', 'f_a_s_z', 'f*sz', 'lófasz', 'Kis Lófasz',
      'kurva', 'kurwa', 'KURRRVA', 'kurv4', 'k u r v a', 'picsa', 'p1csa', 'geci', 'g3ci', 'ribanc', 'baszki', 'Kocsög', 'seggfej',
      'szar', 'Sz4r', 'anyád', 'any4d', 'buzi', 'b u z i', 'hülye', 'Hulye Peti', 'fuck', 'fvck', 'f**k', 'FUUUCK', 'sh1t',
      'b1tch', 'pussy', 'nigga', 'Hitler', 'h1tler', 'tanár', 'Tanár Úr', 'fаsz' /* cirill а */]) {
      expect(isBadName(n), n).toBe(true);
    }
  });

  it('nem tiltja a normál neveket', () => {
    for (const n of ['Kovács Anna', 'Szarka Bence', 'Szarvas Dóri', 'Császár Lili', 'Kányádi Máté', 'Pócsik Zoli', 'Csaba Szép',
      'Ignácia', 'Kakas Péter', 'Buzinkay Ádám', 'Peti2', 'Ana', 'Bo Li', 'Grape', 'Essex', 'Kiss Ákos', 'Segesvári Emma',
      'Hunyadi Mátyás', 'Alex', 'Sebestyén', 'Basa Lili', 'Fosztó', 'Debreczeni Kata', 'Nagy-Kovács Réka']) {
      expect(isBadName(n), n).toBe(false);
    }
  });

  it('safeName a tanári oldalon kicseréli a tiltott nevet', () => {
    expect(safeName('  f4sz ')).toBe('Névtelen');
    expect(safeName(' Anna ')).toBe('Anna');
  });
});

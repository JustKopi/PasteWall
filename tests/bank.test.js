import { describe, it, expect } from 'vitest';
import { PAIRS, STATEMENTS, GROUP_SETS, SENTENCES, EMOJI, SOLUTIONS, TOPICS, testActivity, testImageQuiz, testCrossword } from '../src/games/bank.js';
import { GAMES } from '../src/games/registry.js';
import { parseContent, validate, prepareRound } from '../src/games/content.js';
import { createSession } from '../src/games/server.js';
import { generateCrossword } from '../src/crossword/generator.js';
import { generateFreeform } from '../src/crossword/freeform.js';

const norm = (s) => s.toLocaleUpperCase('hu-HU').replace(/[^\p{L}]/gu, '');

describe('kérdésbank', () => {
  it('bőséges és hibátlan', () => {
    expect(PAIRS.length).toBeGreaterThanOrEqual(250);
    expect(STATEMENTS.length).toBeGreaterThanOrEqual(90);
    expect(GROUP_SETS.length).toBeGreaterThanOrEqual(10);
    expect(SENTENCES.length).toBeGreaterThanOrEqual(40);
    expect(EMOJI.length).toBeGreaterThanOrEqual(50);
    const seen = new Set();
    const leaks = [];
    for (const p of PAIRS) {
      expect(p.a && p.b, JSON.stringify(p)).toBeTruthy();
      expect(seen.has(norm(p.a)), `duplikált válasz: ${p.a}`).toBe(false);
      seen.add(norm(p.a));
      if (p.b.split(/[\s,.;:()„”-]+/).some((w) => norm(w) === norm(p.a) || (norm(p.a).length > 3 && norm(w).startsWith(norm(p.a))))) leaks.push(`${p.a} - ${p.b}`);
    }
    expect(leaks, 'a meghatározás elárulja a választ').toEqual([]);
    expect(STATEMENTS.every((s) => typeof s.value === 'boolean' && s.text)).toBe(true);
    for (const t of Object.keys(TOPICS).filter((k) => k !== 'mix')) expect(PAIRS.filter((p) => p.topic === t).length, t).toBeGreaterThanOrEqual(15);
  });

  it('minden játékhoz, minden témában érvényes, végigjátszható tesztadatot ad', () => {
    for (const [game, g] of Object.entries(GAMES)) {
      if (['imagequiz', 'diagram'].includes(g.format)) continue;
      for (const topic of Object.keys(TOPICS)) {
        for (let k = 0; k < 3; k++) {
          const t = testActivity(game, g.format, topic);
          const content = parseContent(g.format, t.raw);
          expect(validate(game, content), `${game}/${topic}`).toEqual([]);
          const round = prepareRound(game, content, k + 1);
          expect(round.wordsearch === null, `${game}/${topic} szókereső rács`).toBe(false);
          const sess = createSession(game, round, k + 7);
          expect(sess.start(0).view, `${game}/${topic}`).toBeTruthy();
        }
      }
    }
  });

  it('képes kvíz: a helyes válasz és 3 rossz, ugyanabból a kategóriából', () => {
    for (const q of testImageQuiz(20)) {
      const parts = q.text.split(' | ');
      expect(parts.length).toBe(5);
      expect(new Set(parts.slice(1)).size).toBe(4);
    }
  });

  it('tesztrejtvény: minden témában kirakható (sávos és vegyes irányú is)', () => {
    for (const topic of Object.keys(TOPICS)) {
      let bandOk = false;
      let freeOk = false;
      for (let a = 0; a < 30 && !(bandOk && freeOk); a++) {
        const t = testCrossword(topic);
        t.entries = t.entries.map((p) => ({ answer: p.a, clue: p.b }));
        if (!bandOk) bandOk = generateCrossword({ solutions: [t.solution], entries: t.entries, attempts: 15 }).ok;
        if (!freeOk) freeOk = generateFreeform({ solution: t.solution, entries: t.entries, maxWords: 25, attempts: 20 }).ok;
      }
      expect(bandOk, `sávos: ${topic}`).toBe(true);
      expect(freeOk, `vegyes: ${topic}`).toBe(true);
    }
    expect(SOLUTIONS.length).toBeGreaterThanOrEqual(25);
  });
});

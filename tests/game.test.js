import { describe, it, expect, beforeEach } from 'vitest';
import { HostGame, POINTS } from '../src/live/game.js';
import { generateCrossword, parseEntries } from '../src/crossword/generator.js';

const entries = parseEntries('Pest - város\nKerek - kör\nTavasz - évszak\nŐsz - évszak\nFöld - bolygó\nIgen - nem ellentéte\nAlma - gyümölcs\nHold - éjjel\nToll - írószer\nFüzet - jegyzet');
const puzzle = generateCrossword({ solutions: ['PETŐFI'], entries, seed: 5 }).puzzle;

function setup(mode) {
  const sent = [];
  const g = new HostGame({ puzzle, title: 'T', mode, turnSeconds: 30 }, (t, p) => sent.push([t, p]));
  let t = 1000;
  g.now = () => t;
  g.handle('hello', { id: 'a', name: 'Anna' });
  t += 10;
  g.handle('hello', { id: 'b', name: 'Bence' });
  g.start();
  return { g, sent, advance: (ms) => { t += ms; } };
}
const last = (sent, type) => [...sent].reverse().find(([t]) => t === type)?.[1];

describe('HostGame', () => {
  it('közös mód: helyes sor pontot ér és mindenki látja', () => {
    const { g, sent } = setup('coop');
    g.handle('guess', { id: 'a', row: 0, tokens: ['x'] });
    expect(last(sent, 'result')).toMatchObject({ correct: false });
    g.handle('guess', { id: 'b', row: 0, tokens: puzzle.rows[0].tokens.map((t) => t.toLowerCase()) });
    const st = last(sent, 'state');
    expect(st.solved[0].by).toBe('b');
    expect(st.solved[0].tokens).toEqual(puzzle.rows[0].tokens);
    expect(st.players.find((p) => p.id === 'b').score).toBe(POINTS.row);
    // a megoldás többi része nem szivárog ki
    expect(st.solved[1]).toBeUndefined();
    expect(st.revealAll).toBeNull();
  });

  it('verseny mód: a megoldott sorok betűit nem küldi ki', () => {
    const { g, sent } = setup('race');
    g.handle('guess', { id: 'a', row: 1, tokens: puzzle.rows[1].tokens });
    const st = last(sent, 'state');
    expect(st.solved).toEqual({});
    expect(st.players.find((p) => p.id === 'a').progress).toBe(1);
    expect(JSON.stringify(st)).not.toContain(puzzle.rows[1].answer.toUpperCase());
  });

  it('körös mód: csak a soros válaszolhat, tippek pontot érnek, időtúllépés továbblép', () => {
    const { g, sent, advance } = setup('turns');
    expect(g.turn.playerId).toBe('a');
    g.handle('guess', { id: 'b', row: 0, tokens: puzzle.rows[0].tokens });
    expect(g.solved[0]).toBeUndefined();
    g.handle('vote', { id: 'b', up: true });
    g.handle('guess', { id: 'a', row: 0, tokens: puzzle.rows[0].tokens });
    expect(g.players.get('a').score).toBe(POINTS.row);
    expect(g.players.get('b').score).toBe(POINTS.vote);
    expect(g.turn.playerId).toBe('b');
    advance(31000);
    g.tick();
    expect(g.turn.playerId).toBe('a');
    expect(last(sent, 'result')).toMatchObject({ kind: 'timeout', id: 'b' });
  });

  it('megfejtés tippelése és kilépő soros játékos', () => {
    const { g } = setup('turns');
    g.handle('solution', { id: 'a', band: 0, text: 'petőfi' });
    expect(g.players.get('a').score).toBe(POINTS.solution + POINTS.solutionBonus);
    expect(g.bandSolvedBy[0]).toBe('a');
    expect(g.turn.playerId).toBe('b');
    g.setPresence(new Set(['a']));
    expect(g.turn.playerId).toBe('a');
  });

  it('eredmények CSV', () => {
    const { g } = setup('coop');
    g.handle('guess', { id: 'a', row: 2, tokens: puzzle.rows[2].tokens });
    g.end();
    const csv = g.resultsCsv();
    expect(csv.split('\r\n')[1]).toContain('"Anna"');
    expect(g.publicState().revealAll).toHaveLength(puzzle.rows.length);
  });
});

describe('megoldás felfedése', () => {
  it('kitölti a hiányzó sorokat, de a megfejtett sorok gazdája megmarad, és utána nem lehet pontot szerezni', () => {
    const { g, sent } = setup('coop');
    g.handle('guess', { id: 'a', row: 0, tokens: puzzle.rows[0].tokens });
    g.revealSolution();
    const st = last(sent, 'state');
    expect(st.revealed).toBe(true);
    expect(st.revealAll).toHaveLength(puzzle.rows.length);
    expect(st.solved[0].by).toBe('a');
    expect(st.solved[1]).toBeUndefined();
    expect(st.bands[0].tokens).toEqual(puzzle.bands[0].tokens);
    g.handle('guess', { id: 'b', row: 1, tokens: puzzle.rows[1].tokens });
    g.handle('solution', { id: 'b', band: 0, text: 'petőfi' });
    expect(g.players.get('b').score).toBe(0);
  });
  it('verseny módban is mindenkinek megmutatja', () => {
    const { g, sent } = setup('race');
    g.revealSolution();
    const st = last(sent, 'state');
    expect(st.revealAll).toHaveLength(puzzle.rows.length);
    expect(st.bands[0].tokens).toEqual(puzzle.bands[0].tokens);
  });
});

describe('megfejtés: leggyorsabb nyer, bónusz ha a fele hiányzik', () => {
  it('bónusz +10, ha legalább a betűk fele hiányzik; a késői tipp nem ér pontot', () => {
    const { g, sent } = setup('coop');
    g.handle('solution', { id: 'a', band: 0, text: 'PETŐFI' });
    expect(g.players.get('a').score).toBe(POINTS.solution + POINTS.solutionBonus);
    expect(last(sent, 'result')).toMatchObject({ correct: true, bonus: true });
    g.handle('solution', { id: 'b', band: 0, text: 'PETŐFI' });
    expect(g.players.get('b').score).toBe(0);
    expect(last(sent, 'result')).toMatchObject({ id: 'b', late: true, by: 'a' });
  });
  it('ha több mint a fele látszik, sima pontozás', () => {
    const { g } = setup('coop');
    for (const r of [0, 1, 2, 3]) g.handle('guess', { id: 'b', row: r, tokens: puzzle.rows[r].tokens });
    g.handle('solution', { id: 'a', band: 0, text: 'PETŐFI' });
    expect(g.players.get('a').score).toBe(POINTS.solution);
  });
  it('körös módban bárki tippelhet, de csak a soros játékos tippje léptet', () => {
    const { g } = setup('turns');
    expect(g.turn.playerId).toBe('a');
    g.handle('solution', { id: 'b', band: 0, text: 'petőfi' });
    expect(g.players.get('b').score).toBe(POINTS.solution + POINTS.solutionBonus);
    expect(g.turn.playerId).toBe('a');
  });
});

describe('új rejtvény ugyanabban a szobában', () => {
  it('a játékosok maradnak, a pontok és a megoldások nullázódnak', () => {
    const { g, sent } = setup('coop');
    g.handle('guess', { id: 'a', row: 0, tokens: puzzle.rows[0].tokens });
    g.end();
    g.loadPuzzle({ puzzle, title: 'Második', mode: 'race' });
    const st = last(sent, 'state');
    expect(st.round).toBe(2);
    expect(st.status).toBe('lobby');
    expect(st.title).toBe('Második');
    expect(st.mode).toBe('race');
    expect(st.players.map((p) => p.score)).toEqual([0, 0]);
    expect(st.solved).toEqual({});
    g.handle('hello', { id: 'c', name: 'Cili' });
    expect(g.players.size).toBe(3);
  });
});

import { describe, it, expect } from 'vitest';
import { HostGame, POINTS, LADDER_MIN } from '../src/live/game.js';
import { generateCrossword, parseEntries } from '../src/crossword/generator.js';

const entries = parseEntries('Pest - város\nKerek - kör\nTavasz - évszak\nŐsz - évszak\nFöld - bolygó\nIgen - nem ellentéte\nAlma - gyümölcs\nHold - éjjel\nToll - írószer\nFüzet - jegyzet');
const puzzle = generateCrossword({ solutions: ['PETŐFI'], entries, seed: 5 }).puzzle;

function setup(mode, opts = {}, ids = ['a', 'b', 'c', 'd']) {
  const sent = [];
  const priv = [];
  const g = new HostGame({ puzzle, title: 'T', mode, ...opts, sendTo: (id, t, p) => priv.push([id, t, p]) }, (t, p) => sent.push([t, p]));
  ids.forEach((id) => g.handle('hello', { id, name: id }));
  g.start();
  return { g, sent, priv };
}
const last = (sent, type) => [...sent].reverse().find(([t]) => t === type)?.[1];
const ok = (g, id, row) => g.handle('guess', { id, row, tokens: puzzle.rows[row].tokens });

describe('lépcsős pontozás', () => {
  it('az első kapja a legtöbbet, utána step-pel kevesebb, legalább 10', () => {
    const { g } = setup('race', { scoring: { ladder: true, top: 30, step: 15 } });
    ['a', 'b', 'c', 'd'].forEach((id) => ok(g, id, 0));
    expect(['a', 'b', 'c', 'd'].map((id) => g.players.get(id).score)).toEqual([30, 15, LADDER_MIN, LADDER_MIN]);
  });
  it('kikapcsolva a régi fix pont marad', () => {
    const { g } = setup('race');
    ok(g, 'a', 0); ok(g, 'b', 0);
    expect(g.players.get('b').score).toBe(POINTS.row);
  });
});

describe('boostok', () => {
  it('a betűk csak a kérőnek mennek, és elfogynak', () => {
    const { g, sent, priv } = setup('race', { boosts: { ends: 1, cell: 1, some: 1 } });
    const row = puzzle.rows.findIndex((r) => r.tokens.length >= 4);
    const toks = puzzle.rows[row].tokens;
    g.handle('boost', { id: 'a', kind: 'ends', row, req: 'r1' });
    const [to, t, p] = priv.at(-1);
    expect([to, t, p.ok]).toEqual(['a', 'boost', true]);
    expect(p.letters).toEqual([[0, toks[0]], [toks.length - 1, toks.at(-1)]]);
    expect(JSON.stringify(sent.filter(([x]) => x !== 'state'))).not.toContain('letters');
    g.handle('boost', { id: 'a', kind: 'ends', row, req: 'r1' }); // ismétlés: ugyanaz a válasz, nem fogy
    expect(priv.at(-1)[2]).toEqual(p);
    g.handle('boost', { id: 'a', kind: 'ends', row, req: 'r2' });
    expect(priv.at(-1)[2]).toMatchObject({ ok: false });
    g.handle('boost', { id: 'a', kind: 'cell', row, i: 1, req: 'r3' });
    expect(priv.at(-1)[2].letters).toEqual([[1, toks[1]]]);
    g.handle('boost', { id: 'a', kind: 'some', row, req: 'r4' });
    expect(priv.at(-1)[2].letters.length).toBeGreaterThan(0);
    expect(priv.at(-1)[2].letters.length).toBeLessThan(toks.length);
    g.handle('boost', { id: 'b', kind: 'double', req: 'x' });
    expect(priv.at(-1)[2]).toMatchObject({ ok: false }); // nincs bekapcsolva
  });
  it('dupla pont a következő helyes sorra', () => {
    const { g } = setup('coop', { boosts: { double: 1 } });
    g.handle('boost', { id: 'a', kind: 'double', req: 'd' });
    ok(g, 'a', 0); ok(g, 'a', 1);
    expect(g.players.get('a').score).toBe(POINTS.row * 3);
  });
  it('élőben ki- és bekapcsolható', () => {
    const { g, sent, priv } = setup('race');
    g.updateOptions({ boosts: { cell: 2 } });
    expect(last(sent, 'state').players[0].boostsLeft).toEqual({ cell: 2 });
    g.handle('boost', { id: 'a', kind: 'cell', row: 0, i: 0, req: '1' });
    expect(priv.at(-1)[2].ok).toBe(true);
    g.updateOptions({ boosts: { cell: 0 } });
    g.handle('boost', { id: 'a', kind: 'cell', row: 0, i: 1, req: '2' });
    expect(priv.at(-1)[2].ok).toBe(false);
  });
});

describe('felfedés verseny módban és szavazás', () => {
  it('a felfedett sor mindenkinek látszik, és már nem ér pontot', () => {
    const { g, sent } = setup('race');
    ok(g, 'a', 0);
    g.revealRow(0);
    expect(last(sent, 'state').shown[0]).toEqual(puzzle.rows[0].tokens);
    ok(g, 'b', 0);
    expect(g.players.get('b').score).toBe(0);
  });
  it('a szavazás csak számol, nem fed fel', () => {
    const { g, sent } = setup('coop');
    g.startPoll();
    g.handle('pollVote', { id: 'a', row: 2 });
    g.handle('pollVote', { id: 'b', row: 2 });
    g.handle('pollVote', { id: 'c', row: 3 });
    g.broadcast();
    expect(last(sent, 'state').poll.counts).toEqual({ 2: 2, 3: 1 });
    expect(g.solved[2]).toBeUndefined();
    g.revealRow(2);
    expect(last(sent, 'state').poll.counts).toEqual({ 3: 1 });
    g.stopPoll();
    expect(last(sent, 'state').poll).toBeNull();
  });
});

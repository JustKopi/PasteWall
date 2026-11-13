// A játék "agya": a tanár gépén fut, csak ő ismeri a megoldást.
// A diákok tippjeit ellenőrzi, pontoz, és mindenkinek kiküldi az aktuális állapotot.

import { publicView } from '../crossword/generator.js';
import { tokenize, sameTokens } from '../crossword/hu.js';

export const MODES = {
  coop: { label: 'Közös megoldás', desc: 'Mindenki ugyanazt a rejtvényt tölti, élőben látjátok egymás gépelését.' },
  turns: { label: 'Körös játék', desc: 'Sorban jöttök, a soros diák válaszol, a többiek élőben nézik és tippelnek.' },
  race: { label: 'Verseny', desc: 'Mindenki a saját rejtvényét tölti, élő ranglistával.' },
};

const COLORS = ['#e4572e', '#17bebb', '#ffc914', '#76b041', '#7e5bef', '#f25f9a', '#2e86ab', '#f18f01', '#3bb273', '#c1121f', '#5f0f40', '#0b6e4f'];

export const POINTS = { row: 10, solution: 25, solutionBonus: 10, vote: 2 };

export class HostGame {
  /**
   * @param {{puzzle:any, title:string, mode:keyof MODES, turnSeconds?:number}} opts
   * @param {(type:string, payload:any)=>void} send
   * @param {()=>void} [onChange]
   */
  constructor(opts, send, onChange = () => {}) {
    this.puzzle = opts.puzzle;
    this.title = opts.title;
    this.mode = opts.mode;
    this.turnSeconds = opts.turnSeconds ?? 60;
    this.send = send;
    this.onChange = onChange;
    this.status = 'lobby';
    this.players = new Map(); // id -> {id,name,color,score,online,joinedAt,solvedRows:Set,solvedBands:Set,finishedAt}
    this.solved = {}; // közös/körös: row -> {by}
    this.bandSolvedBy = {}; // band -> playerId
    this.turn = null; // {playerId, endsAt, votes: Map}
    this.log = [];
    this.startedAt = null;
    this.endedAt = null;
    this.revealed = false; // a tanár felfedte a teljes megoldást
    this.now = () => Date.now();
  }

  // ---- állapot ----
  publicState() {
    const shared = this.mode !== 'race';
    return {
      round: this.round || 1,
      title: this.title,
      mode: this.mode,
      status: this.status,
      puzzle: publicView(this.puzzle),
      players: [...this.players.values()].map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        score: p.score,
        online: p.online,
        progress: this.mode === 'race' ? p.solvedRows.size : undefined,
        finishedAt: p.finishedAt,
      })),
      // Közös módban a megoldott sorok betűi mindenkinek járnak; versenyben senkinek.
      solved: shared
        ? Object.fromEntries(Object.entries(this.solved).map(([r, s]) => [r, { by: s.by, tokens: this.puzzle.rows[r].tokens }]))
        : {},
      bands: this.puzzle.bands.map((b, k) => ({
        solvedBy: this.bandSolvedBy[k] ?? null,
        tokens: (shared && this.bandSolvedBy[k]) || this.status === 'ended' || this.revealed ? b.tokens : null,
      })),
      revealed: this.revealed,
      revealAll: this.status === 'ended' || this.revealed ? this.puzzle.rows.map((r) => r.tokens) : null,
      turn: this.turn
        ? { n: this.turn.n, playerId: this.turn.playerId, remainingMs: this.turn.endsAt ? Math.max(0, this.turn.endsAt - this.now()) : null }
        : null,
      startedAt: this.startedAt,
      endedAt: this.endedAt,
    };
  }

  broadcast() {
    this.send('state', this.publicState());
    this.onChange();
  }

  // ---- bejövő üzenetek ----
  handle(type, p) {
    if (!p || typeof p !== 'object') return;
    switch (type) {
      case 'hello': return this.onHello(p);
      case 'guess': return this.onGuess(p);
      case 'solution': return this.onSolution(p);
      case 'vote': return this.onVote(p);
      default:
    }
  }

  onHello({ id, name }) {
    if (!id) return;
    const clean = String(name || '').trim().slice(0, 24) || 'Névtelen';
    let pl = this.players.get(id);
    if (!pl) {
      pl = {
        id,
        name: clean,
        color: COLORS[this.players.size % COLORS.length],
        score: 0,
        online: true,
        joinedAt: this.now(),
        solvedRows: new Set(),
        solvedBands: new Set(),
        finishedAt: null,
      };
      this.players.set(id, pl);
    } else {
      pl.online = true;
    }
    this.broadcast();
  }

  setPresence(ids) {
    let changed = false;
    for (const pl of this.players.values()) {
      const on = ids.has(pl.id);
      if (pl.online !== on) { pl.online = on; changed = true; }
    }
    if (changed) {
      if (this.mode === 'turns' && this.status === 'playing' && this.turn && !this.players.get(this.turn.playerId)?.online) {
        this.nextTurn();
      } else {
        this.broadcast();
      }
    }
  }

  kick(id) {
    this.players.delete(id);
    this.send('kick', { id });
    if (this.turn?.playerId === id) this.nextTurn();
    else this.broadcast();
  }

  checkRow(row, guess) {
    const r = this.puzzle.rows[row];
    if (!r || !Array.isArray(guess)) return false;
    const norm = guess.map((t) => String(t || '').toLocaleUpperCase('hu-HU'));
    return sameTokens(norm, r.tokens);
  }

  onGuess({ id, row, tokens }) {
    const pl = this.players.get(id);
    if (!pl || this.status !== 'playing' || this.revealed) return;
    row = Number(row);
    if (!(row >= 0 && row < this.puzzle.rows.length)) return;

    if (this.mode === 'turns' && this.turn?.playerId !== id) return;
    const already = this.mode === 'race' ? pl.solvedRows.has(row) : Boolean(this.solved[row]);
    if (already) return;

    const correct = this.checkRow(row, tokens);
    this.log.push({ at: this.now(), id, row, correct });
    this.send('result', { id, row, correct, kind: 'row' });

    if (correct) {
      pl.score += POINTS.row;
      pl.solvedRows.add(row);
      if (this.mode !== 'race') this.solved[row] = { by: id };
    }

    if (this.mode === 'turns') {
      this.scoreVotes(correct);
      this.nextTurn();
      return;
    }
    if (this.mode === 'race' && pl.solvedRows.size === this.puzzle.rows.length && !pl.finishedAt) {
      pl.finishedAt = this.now();
    }
    this.broadcast();
  }

  onSolution({ id, band, text }) {
    const pl = this.players.get(id);
    if (!pl || this.status !== 'playing' || this.revealed) return;
    band = Number(band);
    const b = this.puzzle.bands[band];
    if (!b) return;
    const correct = sameTokens(tokenize(text, { digraphs: this.puzzle.digraphs }), b.tokens);
    const done = this.mode === 'race' ? pl.solvedBands.has(band) : this.bandSolvedBy[band];
    if (done) {
      // valaki gyorsabb volt: csak az elsőt fogadjuk el
      this.send('result', { id, band, correct, kind: 'solution', late: true, by: this.bandSolvedBy[band] ?? null });
      return;
    }
    // bónusz, ha a megfejtés betűinek legalább fele még nem látszik a rácsban
    const missing = this.missingBandLetters(band, pl);
    const bonus = correct && missing * 2 >= b.length;
    this.send('result', { id, band, correct, kind: 'solution', bonus });
    if (correct) {
      pl.score += POINTS.solution + (bonus ? POINTS.solutionBonus : 0);
      pl.solvedBands.add(band);
      if (this.mode !== 'race') this.bandSolvedBy[band] = id;
    }
    if (this.mode === 'turns' && this.turn?.playerId === id) {
      this.scoreVotes(correct);
      this.nextTurn();
      return;
    }
    this.broadcast();
  }

  /** A megfejtés egyes mezőit lefedő sorok (bejegyzések) indexei. */
  bandCellRows(band) {
    const b = this.puzzle.bands[band];
    if (this.puzzle.type === 'free') {
      return b.cells.map(({ r, c }) => this.puzzle.rows
        .filter((e) => (e.dir === 'across' ? e.r === r && c >= e.c && c < e.c + e.length : e.c === c && r >= e.r && r < e.r + e.length))
        .map((e) => e.row));
    }
    return b.tokens.map((_, i) => [b.rowStart + i]);
  }

  /** Hány betűje nem látszik még a megfejtésnek (közös módban a közös rácson, versenyben a játékosén). */
  missingBandLetters(band, pl) {
    const known = (row) => (this.mode === 'race' ? pl.solvedRows.has(row) : Boolean(this.solved[row]));
    return this.bandCellRows(band).filter((rows) => !rows.some(known)).length;
  }

  /** Új rejtvény ugyanabban a szobában: a játékosok maradnak, a pontok nullázódnak. */
  loadPuzzle({ puzzle, title, mode, turnSeconds }) {
    this.puzzle = puzzle;
    this.title = title;
    if (mode) this.mode = mode;
    if (turnSeconds != null) this.turnSeconds = turnSeconds;
    this.round = (this.round || 1) + 1;
    this.status = 'lobby';
    this.solved = {};
    this.bandSolvedBy = {};
    this.turn = null;
    this.revealed = false;
    this.startedAt = null;
    this.endedAt = null;
    this.log = [];
    for (const pl of this.players.values()) {
      pl.score = 0;
      pl.solvedRows = new Set();
      pl.solvedBands = new Set();
      pl.finishedAt = null;
    }
    this.broadcast();
  }

  onVote({ id, up }) {
    if (this.mode !== 'turns' || !this.turn || id === this.turn.playerId) return;
    if (!this.players.has(id)) return;
    this.turn.votes.set(id, Boolean(up));
    this.send('votes', { count: this.turn.votes.size });
  }

  scoreVotes(correct) {
    if (!this.turn) return;
    for (const [vid, up] of this.turn.votes) {
      const v = this.players.get(vid);
      if (v && up === correct) v.score += POINTS.vote;
    }
  }

  // ---- tanári vezérlés ----
  start() {
    if (this.status === 'playing') return;
    this.status = 'playing';
    this.startedAt = this.now();
    if (this.mode === 'turns') this.nextTurn(true);
    else this.broadcast();
  }

  order() {
    return [...this.players.values()].filter((p) => p.online).sort((a, b) => a.joinedAt - b.joinedAt);
  }

  nextTurn(first = false) {
    if (this.mode !== 'turns' || this.status !== 'playing') { this.broadcast(); return; }
    const order = this.order();
    if (!order.length) { this.turn = null; this.broadcast(); return; }
    let idx = 0;
    if (!first && this.turn) {
      const cur = order.findIndex((p) => p.id === this.turn.playerId);
      idx = cur === -1 ? 0 : (cur + 1) % order.length;
      if (cur === -1) {
        // a soros játékos kilépett: a csatlakozási sorrendben következő jön
        const prev = this.players.get(this.turn.playerId);
        const after = order.findIndex((p) => prev && p.joinedAt > prev.joinedAt);
        idx = after === -1 ? 0 : after;
      }
    }
    this.turnNo = (this.turnNo || 0) + 1;
    this.turn = {
      n: this.turnNo,
      playerId: order[idx].id,
      endsAt: this.turnSeconds ? this.now() + this.turnSeconds * 1000 : null,
      votes: new Map(),
    };
    this.broadcast();
  }

  /** Időkorlát ellenőrzése: a tanári oldal hívja másodpercenként. */
  tick() {
    if (this.mode === 'turns' && this.status === 'playing' && this.turn?.endsAt && this.now() >= this.turn.endsAt) {
      this.send('result', { id: this.turn.playerId, correct: false, kind: 'timeout' });
      this.nextTurn();
    }
  }

  revealRow(row) {
    if (this.mode === 'race' || this.solved[row]) return;
    this.solved[row] = { by: null };
    this.broadcast();
  }

  /** A teljes megoldás felfedése: a meg nem fejtett sorok és a megfejtés(ek) kitöltése mindenkinél. */
  revealSolution() {
    if (this.revealed) return;
    this.revealed = true;
    this.turn = null;
    this.broadcast();
  }

  end() {
    this.status = 'ended';
    this.endedAt = this.now();
    this.turn = null;
    this.broadcast();
  }

  results() {
    return [...this.players.values()]
      .map((p) => ({
        name: p.name,
        score: p.score,
        rows: p.solvedRows.size,
        total: this.puzzle.rows.length,
        bands: p.solvedBands.size,
        finishedAt: p.finishedAt,
      }))
      .sort((a, b) => b.score - a.score || (a.finishedAt ?? Infinity) - (b.finishedAt ?? Infinity));
  }

  resultsCsv() {
    const head = ['Helyezés', 'Név', 'Pont', 'Megoldott sorok', 'Összes sor', 'Megfejtés'];
    const lines = this.results().map((r, i) => [i + 1, r.name, r.score, r.rows, r.total, r.bands ? 'igen' : 'nem']);
    return [head, ...lines].map((l) => l.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(';')).join('\r\n');
  }
}

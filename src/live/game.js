// A játék "agya": a tanár gépén fut, csak ő ismeri a megoldást.
// A diákok tippjeit ellenőrzi, pontoz, és mindenkinek kiküldi az aktuális állapotot.

import { publicView } from '../crossword/generator.js';
import { tokenize, sameTokens } from '../crossword/hu.js';
import { safeName } from './names.js';

export const MODES = {
  coop: { label: 'Közös megoldás', desc: 'Mindenki ugyanazt a rejtvényt tölti, élőben látjátok egymás gépelését.' },
  turns: { label: 'Körös játék', desc: 'Sorban jöttök, a soros diák válaszol, a többiek élőben nézik és tippelnek.' },
  race: { label: 'Verseny', desc: 'Mindenki a saját rejtvényét tölti, élő ranglistával.' },
};

export const COLORS = ['#e4572e', '#17bebb', '#ffc914', '#76b041', '#7e5bef', '#f25f9a', '#2e86ab', '#f18f01', '#3bb273', '#c1121f', '#5f0f40', '#0b6e4f'];

export const POINTS = { row: 10, solution: 25, solutionBonus: 10, vote: 2 };

/** Lépcsős pontozás (verseny mód): az első megfejtő `top` pontot kap, minden további `step`-pel kevesebbet, de legalább LADDER_MIN-t. */
export const LADDER_MIN = 10;
export const DEFAULT_SCORING = { ladder: false, top: 50, step: 5 };

/** A tanár által bekapcsolható boostok. A beállított szám: hányszor használhatja egy diák. */
export const BOOSTS = {
  double: { icon: '✖️2', label: 'Dupla pont', desc: 'A következő helyesen megfejtett kérdésed kétszeres pontot ér.' },
  ends: { icon: '↔️', label: 'Első + utolsó betű', desc: 'A kijelölt kérdésnél megkapod az első és az utolsó betűt.' },
  some: { icon: '🔡', label: 'Pár betű', desc: 'A kijelölt kérdésnél a szó hosszától függően néhány betűt (kb. minden negyediket).' },
  cell: { icon: '🔍', label: 'Egy mező', desc: 'A kijelölt mező (ahol a kurzor áll) helyes betűjét.' },
};

/** Beállítások tisztítása (a tárolt cfg-ből bármi érkezhet). */
export function cleanOptions(o = {}) {
  const sc = o.scoring || {};
  const num = (v, d, lo, hi) => { const n = Math.round(Number(v)); return v != null && Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
  const boosts = {};
  for (const k of Object.keys(BOOSTS)) boosts[k] = num(o.boosts?.[k], 0, 0, 9);
  return {
    scoring: { ladder: Boolean(sc.ladder), top: num(sc.top, DEFAULT_SCORING.top, LADDER_MIN, 1000), step: num(sc.step, DEFAULT_SCORING.step, 0, 1000) },
    boosts,
  };
}

/** Hány betűt ad a "pár betű" boost egy adott hosszú szónál. */
export const someCount = (len) => Math.max(1, Math.min(len - 1, Math.round(len / 4)));

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
    // csak egy diáknak szóló (titkosított) üzenet; tesztben a közös csatornára megy
    this.sendTo = opts.sendTo || ((id, t, p) => send(t, { ...p, id }));
    this.setOptions(opts);
    this.onChange = onChange;
    // >0: a gyakori (belépés, jelenlét, válasz) állapotküldéseket ennyi ms-onként összevonjuk
    this.coalesceMs = opts.coalesceMs ?? 0;
    this.bTimer = null;
    this.status = 'lobby';
    this.players = new Map(); // id -> {id,name,color,score,online,joinedAt,solvedRows:Set,solvedBands:Set,finishedAt}
    this.solved = {}; // közös/körös: row -> {by}
    this.bandSolvedBy = {}; // band -> playerId
    this.turn = null; // {playerId, endsAt, votes: Map}
    this.log = [];
    this.startedAt = null;
    this.endedAt = null;
    this.revealed = false; // a tanár felfedte a teljes megoldást
    this.shown = new Set(); // verseny: a tanár által mindenkinek felfedett sorok
    this.rowSolvers = {}; // row -> hányan fejtették meg eddig (lépcsős pontozás)
    this.poll = null; // { votes: Map(playerId -> row) } — szavazás: melyik kérdést fedje fel a tanár
    this.now = () => Date.now();
  }

  setOptions(o) {
    const c = cleanOptions(o);
    this.scoring = c.scoring;
    this.boosts = c.boosts;
  }

  /** Élő módosítás a tanártól (játék közben is): pontozás, boostok, körös idő. */
  updateOptions({ scoring, boosts, turnSeconds }) {
    this.setOptions({ scoring: scoring || this.scoring, boosts: boosts || this.boosts });
    if (turnSeconds != null) {
      this.turnSeconds = Number(turnSeconds) || 0;
      if (this.turn) this.turn.endsAt = this.turnSeconds ? this.now() + this.turnSeconds * 1000 : null;
    }
    this.broadcast();
  }

  /** Ennyi pont jár a sorért a következő megfejtőnek. */
  rowPoints(row) {
    if (this.mode !== 'race' || !this.scoring.ladder) return POINTS.row;
    const before = this.rowSolvers[row] || 0;
    return Math.max(LADDER_MIN, this.scoring.top - this.scoring.step * before);
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
        boostsLeft: this.boostsLeft(p),
        double: p.doubleArmed || undefined,
      })),
      scoring: this.scoring,
      boosts: this.boosts,
      // verseny: a tanár által felfedett sorok mindenkinek (pont már nem jár értük)
      shown: Object.fromEntries([...this.shown].map((r) => [r, this.puzzle.rows[r].tokens])),
      rowPoints: this.mode === 'race' && this.scoring.ladder ? this.puzzle.rows.map((_, r) => this.rowPoints(r)) : null,
      poll: this.poll ? { counts: this.pollCounts() } : null,
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
    clearTimeout(this.bTimer);
    this.bTimer = null;
    this.send('state', this.publicState());
    this.onChange();
  }

  /** Gyakori változásoknál: több esemény egyetlen állapotüzenetben (100 diáknál is kezelhető forgalom). */
  broadcastSoon() {
    if (!this.coalesceMs) { this.broadcast(); return; }
    if (this.bTimer) return;
    this.bTimer = setTimeout(() => { this.bTimer = null; this.broadcast(); }, this.coalesceMs);
  }

  dispose() {
    clearTimeout(this.bTimer);
    this.bTimer = null;
  }

  // ---- bejövő üzenetek ----
  handle(type, p) {
    if (!p || typeof p !== 'object') return;
    switch (type) {
      case 'hello': return this.onHello(p);
      case 'guess': return this.onGuess(p);
      case 'solution': return this.onSolution(p);
      case 'vote': return this.onVote(p);
      case 'boost': return this.onBoost(p);
      case 'pollVote': return this.onPollVote(p);
      default:
    }
  }

  onHello({ id, name }) {
    if (!id) return;
    const clean = safeName(name); // a diák kliense megkerülhető: itt is szűrünk
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
      this.resetPlayerRound(pl);
      this.players.set(id, pl);
    } else {
      pl.online = true;
    }
    this.broadcastSoon();
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
        this.broadcastSoon();
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
    if (this.mode === 'race' && this.shown.has(row) && !pl.solvedRows.has(row)) return; // felfedett sor: már nem jár érte pont
    const already = this.mode === 'race' ? pl.solvedRows.has(row) : Boolean(this.solved[row]);
    if (already) {
      // elveszett visszaigazolás miatti újraküldés: újra megerősítjük, pont nélkül
      if (pl.solvedRows.has(row) && this.checkRow(row, tokens)) this.send('result', { id, row, correct: true, kind: 'row', repeat: true });
      return;
    }

    const correct = this.checkRow(row, tokens);
    this.log.push({ at: this.now(), id, row, correct });
    let points = 0;
    let doubled = false;
    if (correct) {
      points = this.rowPoints(row);
      if (pl.doubleArmed) { points *= 2; pl.doubleArmed = false; doubled = true; }
      this.rowSolvers[row] = (this.rowSolvers[row] || 0) + 1;
    }
    this.send('result', { id, row, correct, kind: 'row', points, doubled });

    if (correct) {
      pl.score += points;
      pl.solvedRows.add(row);
      if (this.mode !== 'race') this.solved[row] = { by: id };
    }

    if (this.mode === 'turns') {
      this.scoreVotes(correct);
      this.nextTurn();
      return;
    }
    if (this.mode === 'race' && !pl.finishedAt && this.puzzle.rows.every((_, r) => pl.solvedRows.has(r) || this.shown.has(r))) {
      pl.finishedAt = this.now();
    }
    this.broadcastSoon();
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
    this.broadcastSoon();
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

  /** Másik játékból átvett játékosok (szobán belüli játékváltás). */
  seedPlayers(list) {
    for (const p of list || []) {
      if (!p?.id || this.players.has(p.id)) continue;
      this.players.set(p.id, {
        id: p.id, name: p.name, color: p.color || COLORS[this.players.size % COLORS.length], score: 0, online: true,
        joinedAt: p.joinedAt || this.now(), solvedRows: new Set(), solvedBands: new Set(), finishedAt: null,
      });
      this.resetPlayerRound(this.players.get(p.id));
    }
  }

  /** Új rejtvény ugyanabban a szobában: a játékosok maradnak, a pontok nullázódnak. */
  loadPuzzle({ puzzle, title, mode, turnSeconds, scoring, boosts }) {
    this.puzzle = puzzle;
    this.title = title;
    if (mode) this.mode = mode;
    if (scoring || boosts) this.setOptions({ scoring: scoring || this.scoring, boosts: boosts || this.boosts });
    if (turnSeconds != null) this.turnSeconds = turnSeconds;
    this.round = (this.round || 1) + 1;
    this.status = 'lobby';
    this.solved = {};
    this.bandSolvedBy = {};
    this.turn = null;
    this.revealed = false;
    this.shown = new Set();
    this.rowSolvers = {};
    this.poll = null;
    this.startedAt = null;
    this.endedAt = null;
    this.log = [];
    for (const pl of this.players.values()) {
      pl.score = 0;
      pl.solvedRows = new Set();
      pl.solvedBands = new Set();
      pl.finishedAt = null;
      this.resetPlayerRound(pl);
    }
    this.broadcast();
  }

  resetPlayerRound(pl) {
    pl.boostsUsed = {};
    pl.doubleArmed = false;
    pl.boostReplies = new Map(); // kérésazonosító -> válasz (elveszett válasz újraküldéséhez)
  }

  boostsLeft(pl) {
    const out = {};
    for (const [k, n] of Object.entries(this.boosts)) if (n > 0) out[k] = Math.max(0, n - (pl.boostsUsed?.[k] || 0));
    return out;
  }

  /** Boost kérése a diáktól. A kapott betűket csak ő látja (titkosított üzenetben). */
  onBoost({ id, kind, row, i, req }) {
    const pl = this.players.get(id);
    if (!pl || !Object.hasOwn(BOOSTS, kind)) return;
    req = String(req || '').slice(0, 40);
    if (req && pl.boostReplies.has(req)) { this.sendTo(id, 'boost', pl.boostReplies.get(req)); return; }
    const fail = (reason) => this.sendTo(id, 'boost', { ok: false, kind, req, reason });
    if (this.status !== 'playing' || this.revealed) return fail('Most nem használható.');
    if (!(this.boosts[kind] > 0)) return fail('Ezt a boostot a tanár nem kapcsolta be.');
    if ((pl.boostsUsed[kind] || 0) >= this.boosts[kind]) return fail('Ez a boost elfogyott.');

    let letters = [];
    if (kind === 'double') {
      if (pl.doubleArmed) return fail('A dupla pont már aktív.');
      pl.doubleArmed = true;
      row = null;
    } else {
      row = Number(row);
      const r = this.puzzle.rows[row];
      if (!r) return fail('Előbb jelölj ki egy kérdést.');
      const done = this.mode === 'race' ? pl.solvedRows.has(row) || this.shown.has(row) : Boolean(this.solved[row]);
      if (done) return fail('Ez a kérdés már meg van fejtve.');
      const len = r.tokens.length;
      let idx = [];
      if (kind === 'cell') {
        i = Number(i);
        if (!(i >= 0 && i < len)) return fail('Jelölj ki egy mezőt.');
        idx = [i];
      } else if (kind === 'ends') {
        if (len < 3) return fail('Ez a szó túl rövid ehhez.');
        idx = [0, len - 1];
      } else {
        if (len < 2) return fail('Ez a szó túl rövid ehhez.');
        const n = someCount(len);
        idx = [...new Set(Array.from({ length: n }, (_, k) => Math.min(len - 1, Math.floor(((k + 0.5) * len) / n))))];
      }
      letters = idx.map((x) => [x, r.tokens[x]]);
    }
    pl.boostsUsed[kind] = (pl.boostsUsed[kind] || 0) + 1;
    const reply = { ok: true, kind, req, row, letters };
    if (req) pl.boostReplies.set(req, reply);
    this.log.push({ at: this.now(), id, boost: kind, row });
    this.sendTo(id, 'boost', reply);
    this.broadcastSoon();
  }

  // ---- szavazás: melyik kérdést fedje fel a tanár (csak irányadó, nem fed fel magától) ----
  isOpenRow(row) {
    if (!this.puzzle.rows[row]) return false;
    return this.mode === 'race' ? !this.shown.has(row) : !this.solved[row];
  }

  startPoll() {
    if (this.status !== 'playing' || this.revealed) return;
    this.poll = { votes: new Map() };
    this.broadcast();
  }

  stopPoll() {
    this.poll = null;
    this.broadcast();
  }

  onPollVote({ id, row }) {
    if (!this.poll || !this.players.has(id)) return;
    row = Number(row);
    if (row === -1) this.poll.votes.delete(id);
    else if (this.isOpenRow(row)) this.poll.votes.set(id, row);
    else return;
    this.broadcastSoon();
  }

  pollCounts() {
    const c = {};
    if (!this.poll) return c;
    for (const r of this.poll.votes.values()) if (this.isOpenRow(r)) c[r] = (c[r] || 0) + 1;
    return c;
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

  /** Egy kérdés felfedése mindenkinek. Versenyben is: aki addig nem fejtette meg, már nem kap érte pontot. */
  revealRow(row) {
    row = Number(row);
    if (!this.puzzle.rows[row]) return;
    if (this.mode === 'race') {
      if (this.shown.has(row)) return;
      this.shown.add(row);
    } else {
      if (this.solved[row]) return;
      this.solved[row] = { by: null };
    }
    if (this.poll) for (const [vid, r] of this.poll.votes) if (r === row) this.poll.votes.delete(vid);
    this.broadcast();
  }

  /** A teljes megoldás felfedése: a meg nem fejtett sorok és a megfejtés(ek) kitöltése mindenkinél. */
  revealSolution() {
    if (this.revealed) return;
    this.revealed = true;
    this.turn = null;
    this.poll = null;
    this.broadcast();
  }

  end() {
    this.status = 'ended';
    this.endedAt = this.now();
    this.turn = null;
    this.poll = null;
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

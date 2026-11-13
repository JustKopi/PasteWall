// Minijátékok "agya" a tanári gépen: játékosok, időzítés, élő ranglista.
// A diákok a saját gépükön játszanak, és az előrehaladásukat (pont, helyes/rossz) küldik ide.

import { COLORS } from './game.js';
import { maxScore } from '../games/content.js';

/** A képeket (data URL) külön üzenetekben küldjük, a tartalomban csak kulcs marad. */
export function splitAssets(content) {
  const assets = {};
  let n = 0;
  const walk = (v) => {
    if (typeof v === 'string' && v.startsWith('data:image/')) { const k = `asset:${n++}`; assets[k] = v; return k; }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return { content: walk(content), assets };
}

export class MiniHost {
  /**
   * @param {{activity:{id:string, game:string, title:string, content:any, timeLimit?:number}}} opts
   */
  constructor(opts, send, onChange = () => {}) {
    this.send = send;
    this.onChange = onChange;
    this.players = new Map();
    this.round = opts.round || 1;
    this.now = () => Date.now();
    this.setActivity(opts.activity);
  }

  setActivity(activity) {
    this.activity = activity;
    const { content, assets } = splitAssets(activity.content);
    this.content = content;
    this.assets = assets;
    this.max = maxScore(activity.game, activity.content);
    this.status = 'lobby';
    this.startedAt = null;
    this.endedAt = null;
    this.endsAt = null;
    for (const p of this.players.values()) Object.assign(p, { score: 0, correct: 0, wrong: 0, total: 0, done: false, finishedAt: null });
  }

  seedPlayers(list) {
    for (const p of list || []) {
      if (!p?.id || this.players.has(p.id)) continue;
      this.players.set(p.id, { id: p.id, name: p.name, color: p.color || COLORS[this.players.size % COLORS.length], online: true, joinedAt: p.joinedAt || this.now(), score: 0, correct: 0, wrong: 0, total: 0, done: false, finishedAt: null });
    }
  }

  publicState() {
    return {
      kind: 'mini',
      round: this.round,
      game: this.activity.game,
      title: this.activity.title,
      status: this.status,
      max: this.max,
      remainingMs: this.endsAt ? Math.max(0, this.endsAt - this.now()) : null,
      players: [...this.players.values()].map((p) => ({
        id: p.id, name: p.name, color: p.color, online: p.online, score: p.score, correct: p.correct, wrong: p.wrong, total: p.total, done: p.done, finishedAt: p.finishedAt,
      })),
    };
  }

  broadcast() {
    this.send('state', this.publicState());
    this.onChange();
  }

  sendContent() {
    this.send('content', { round: this.round, content: this.content, assetKeys: Object.keys(this.assets) });
  }

  /** Képek küldése; ugyanazt a képet 3 mp-en belül nem küldjük újra (sok diák egyszerre kérheti). */
  sendAssets(keys = Object.keys(this.assets)) {
    this.assetSentAt = this.assetSentAt || new Map();
    const now = this.now();
    for (const key of keys) {
      if (!(key in this.assets)) continue;
      if (now - (this.assetSentAt.get(key) || 0) < 3000) continue;
      this.assetSentAt.set(key, now);
      this.send('asset', { round: this.round, key, data: this.assets[key] });
    }
  }

  handle(type, p) {
    if (!p || typeof p !== 'object') return;
    if (type === 'hello') return this.onHello(p);
    if (type === 'progress') return this.onProgress(p);
    if (type === 'needContent') { this.sendContent(); return undefined; }
    if (type === 'needAssets') { this.sendAssets(Array.isArray(p.keys) ? p.keys.slice(0, 50) : undefined); return undefined; }
    return undefined;
  }

  onHello({ id, name }) {
    if (!id) return;
    let pl = this.players.get(id);
    if (!pl) {
      pl = { id, name: String(name || '').trim().slice(0, 24) || 'Névtelen', color: COLORS[this.players.size % COLORS.length], online: true, joinedAt: this.now(), score: 0, correct: 0, wrong: 0, total: 0, done: false, finishedAt: null };
      this.players.set(id, pl);
    } else pl.online = true;
    this.broadcast();
    this.sendContent();
  }

  onProgress({ id, score, correct, wrong, total, done }) {
    const pl = this.players.get(id);
    if (!pl || this.status !== 'playing' || pl.done) return;
    pl.score = Math.max(0, Math.min(this.max, Math.round(Number(score) || 0)));
    pl.correct = Math.max(0, Number(correct) || 0);
    pl.wrong = Math.max(0, Number(wrong) || 0);
    pl.total = Math.max(0, Number(total) || 0);
    if (done) { pl.done = true; pl.finishedAt = this.now(); }
    this.broadcast();
    if ([...this.players.values()].filter((x) => x.online).every((x) => x.done)) this.end();
  }

  setPresence(ids) {
    let changed = false;
    for (const pl of this.players.values()) {
      const on = ids.has(pl.id);
      if (pl.online !== on) { pl.online = on; changed = true; }
    }
    if (changed) this.broadcast();
  }

  kick(id) {
    this.players.delete(id);
    this.send('kick', { id });
    this.broadcast();
  }

  start() {
    if (this.status === 'playing') return;
    this.status = 'playing';
    this.startedAt = this.now();
    this.endsAt = this.activity.timeLimit ? this.startedAt + this.activity.timeLimit * 1000 : null;
    this.sendContent();
    this.sendAssets();
    this.broadcast();
  }

  tick() {
    if (this.status === 'playing' && this.endsAt && this.now() >= this.endsAt) this.end();
  }

  end() {
    if (this.status === 'ended') return;
    this.status = 'ended';
    this.endedAt = this.now();
    this.endsAt = null;
    this.broadcast();
  }

  /** Új játék ugyanabban a szobában. */
  load(activity) {
    this.round += 1;
    this.assetSentAt = new Map();
    this.setActivity(activity);
    this.broadcast();
    this.sendContent();
  }

  results() {
    return [...this.players.values()]
      .map((p) => ({ name: p.name, score: p.score, correct: p.correct, wrong: p.wrong, time: p.finishedAt && this.startedAt ? Math.round((p.finishedAt - this.startedAt) / 1000) : null }))
      .sort((a, b) => b.score - a.score || (a.time ?? Infinity) - (b.time ?? Infinity));
  }

  resultsCsv() {
    const head = ['Helyezés', 'Név', 'Pont', 'Helyes', 'Hibás', 'Idő (mp)'];
    const rows = this.results().map((r, i) => [i + 1, r.name, r.score, r.correct, r.wrong, r.time ?? '']);
    return [head, ...rows].map((l) => l.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(';')).join('\r\n');
  }
}

// Minijátékok "agya" a tanári gépen. A helyes válaszok csak itt vannak meg:
// minden diáknak saját játékmenete (session) fut, a diák csak az aktuális kérdést kapja meg
// (titkosítva, csak neki), a választ itt ellenőrizzük, a pontot és az időt itt számoljuk.

import { COLORS } from './game.js';
import { createSession } from '../games/server.js';

/** A képeket (data URL) külön, nyilvános üzenetekben küldjük; a tartalomban csak kulcs marad. */
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

const newPlayer = (id, name, color, joinedAt) => ({
  id, name, color, online: true, joinedAt, score: 0, correct: 0, wrong: 0, total: 0, done: false, finishedAt: null,
});

export class MiniHost {
  /**
   * @param {{activity:{id:string, game:string, title:string, content:any, timeLimit?:number}, round?:number}} opts
   * @param {(t:string,p:any)=>void} send     mindenkinek (aláírt)
   * @param {(id:string,t:string,p:any)=>void} sendTo  egy diáknak (titkosított)
   */
  constructor(opts, send, sendTo, onChange = () => {}) {
    this.send = send;
    this.sendTo = sendTo || (() => {});
    this.onChange = onChange;
    this.players = new Map();
    this.round = opts.round || 1;
    this.now = () => Date.now();
    this.setActivity(opts.activity);
  }

  setActivity(activity) {
    this.activity = activity;
    const { content, assets } = splitAssets(activity.content);
    this.content = content; // titkos: soha nem küldjük ki egészben
    this.assets = assets;
    this.sessions = new Map();
    this.status = 'lobby';
    this.startedAt = null;
    this.endedAt = null;
    this.endsAt = null;
    this.assetSentAt = new Map();
    for (const p of this.players.values()) Object.assign(p, { score: 0, correct: 0, wrong: 0, total: 0, done: false, finishedAt: null });
  }

  seedPlayers(list) {
    for (const p of list || []) {
      if (!p?.id || this.players.has(p.id)) continue;
      this.players.set(p.id, newPlayer(p.id, p.name, p.color || COLORS[this.players.size % COLORS.length], p.joinedAt || this.now()));
    }
  }

  publicState() {
    return {
      kind: 'mini',
      round: this.round,
      game: this.activity.game,
      title: this.activity.title,
      status: this.status,
      seed: this.activity.content.seed || 1,
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

  /** Gyakori változásoknál (sok válasz) ritkítva küldjük az állapotot. */
  broadcastSoon() {
    if (this.bTimer) return;
    this.bTimer = setTimeout(() => { this.bTimer = null; this.broadcast(); }, 250);
  }

  sendContent() {
    this.send('content', { round: this.round, assetKeys: Object.keys(this.assets) });
  }

  sendAssets(keys = Object.keys(this.assets)) {
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
    if (type === 'hello') { this.onHello(p); return; }
    if (type === 'needContent') { this.sendContent(); return; }
    if (type === 'needAssets') { this.sendAssets(Array.isArray(p.keys) ? p.keys.slice(0, 50).map(String) : undefined); return; }
    if (type === 'mg') this.onAction(p);
  }

  onHello({ id, name }) {
    if (!id) return;
    let pl = this.players.get(id);
    if (!pl) {
      pl = newPlayer(id, String(name || '').trim().slice(0, 24) || 'Névtelen', COLORS[this.players.size % COLORS.length], this.now());
      this.players.set(id, pl);
    } else pl.online = true;
    this.broadcast();
    this.sendContent();
  }

  sessionFor(id) {
    let sess = this.sessions.get(id);
    if (!sess) {
      sess = createSession(this.activity.game, this.content, Math.floor(Math.random() * 2 ** 31));
      sess.current = sess.start(this.now()).view;
      this.sessions.set(id, sess);
    }
    return sess;
  }

  onAction({ id, rid, op, payload }) {
    const pl = this.players.get(id);
    if (!pl || this.status !== 'playing' || typeof op !== 'string') return;
    const sess = this.sessionFor(id);
    // ugyanaz a kérés újra (pl. elveszett a válasz): a korábbi választ küldjük, nem számoljuk kétszer
    if (rid != null && sess.lastRid === rid) { this.sendTo(id, 'mgr', sess.lastReply); return; }
    let reply;
    if (op === 'start') {
      reply = { view: sess.current, done: sess.s.done }; // újracsatlakozáskor ugyanott folytatja (az időzítés nem indul újra)
    } else {
      reply = sess.act(op, payload, this.now()) || {};
      if (reply.view !== undefined) sess.current = reply.view;
    }
    const st = sess.s;
    Object.assign(pl, { score: st.score, correct: st.correct, wrong: st.wrong, total: st.total });
    if (st.done && !pl.done) { pl.done = true; pl.finishedAt = this.now(); }
    sess.lastRid = rid;
    sess.lastReply = { rid, ...reply, score: st.score, correct: st.correct, wrong: st.wrong };
    this.sendTo(id, 'mgr', sess.lastReply);
    if (pl.done && [...this.players.values()].filter((x) => x.online).every((x) => x.done)) { this.end(); return; }
    this.broadcastSoon();
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
    this.sessions.delete(id);
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
    clearTimeout(this.bTimer);
    this.bTimer = null;
    this.status = 'ended';
    this.endedAt = this.now();
    this.endsAt = null;
    this.broadcast();
  }

  load(activity) {
    this.round += 1;
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

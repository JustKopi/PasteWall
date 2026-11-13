// Biztonságos szobakapcsolat a nyilvános csatorna fölött.
//  Tanár -> mindenki: aláírt üzenet (a szobakód a tanár kulcsaiból származik, így ellenőrizhető).
//  Tanár -> egy diák: aláírt ÉS csak neki titkosított üzenet.
//  Diák -> tanár: titkosított üzenet (más diák nem tudja elolvasni, és más nevében nem küldhető).
// Visszajátszás ellen: a tanár üzenetei időbélyeget, a diákéi sorszámot visznek.

import { openRoom } from './transport.js';
import {
  createHostKeys, loadHostKeys, sign, verify, codeFromKeys, sharedKey, encryptJson, decryptJson,
  createPlayerKeys, loadPrivateDh,
} from './secure.js';

/** Új szoba: tanári kulcsok + belőlük származó kód. */
export async function createRoom() {
  const { code, stored } = await createHostKeys();
  sessionStorage.setItem(`pastewall.hostkeys.${code}`, JSON.stringify(stored));
  return code;
}

export function hasHostKeys(code) {
  return Boolean(sessionStorage.getItem(`pastewall.hostkeys.${code}`));
}

/** Soros végrehajtás (az aszinkron aláírás/ellenőrzés ne keverje össze a sorrendet). */
function queue() {
  let p = Promise.resolve();
  return (fn) => { p = p.then(fn).catch((e) => console.warn('secure-room', e)); return p; };
}

// ======================================================================== tanár
export async function openHostRoom(code, handlers) {
  const stored = JSON.parse(sessionStorage.getItem(`pastewall.hostkeys.${code}`) || 'null');
  if (!stored) throw new Error('Ehhez a szobához nincsenek meg a tanári kulcsok ezen a gépen.');
  const keys = await loadHostKeys(stored);
  const bindKey = `pastewall.bind.${code}`;
  const bound = new Map(Object.entries(JSON.parse(sessionStorage.getItem(bindKey) || '{}'))); // id -> diák nyilvános kulcs
  const aes = new Map(); // id -> AES kulcs
  const lastSeq = new Map();
  const tsKey = `pastewall.hostts.${code}`;
  let lastTs = Number(sessionStorage.getItem(tsKey) || 0); // játékváltás után is folytatódik
  let locked = false;
  const out = queue();
  const inq = queue();
  let room = null;

  async function keyFor(id) {
    if (aes.has(id)) return aes.get(id);
    const pub = bound.get(id);
    if (!pub) return null;
    const k = await sharedKey(keys.dhKey, pub);
    aes.set(id, k);
    return k;
  }

  function wire(d) {
    return out(async () => {
      const text = JSON.stringify(d);
      const sig = await sign(keys.signKey, text);
      room?.send('H', { d: text, sig, k: { s: keys.signPub, d: keys.dhPub } });
    });
  }
  const nextTs = () => { lastTs = Math.max(Date.now(), lastTs + 1); sessionStorage.setItem(tsKey, String(lastTs)); return lastTs; };

  async function onWire(t, p) {
    if (t !== 'P' || !p || typeof p !== 'object') return;
    if (p.kind === 'hello') {
      const id = String(p.id || '').slice(0, 40);
      const pub = String(p.pub || '');
      if (!id || /^(host|teacher)-/.test(id) || pub.length < 80 || pub.length > 120) return; // fenntartott azonosítók
      const known = bound.get(id);
      if (known && known !== pub) return; // valaki más nevében próbál belépni
      if (!known) {
        if (locked) { handlers.onBlocked?.(String(p.name || '')); return; }
        bound.set(id, pub);
        sessionStorage.setItem(bindKey, JSON.stringify(Object.fromEntries(bound)));
      }
      handlers.onMessage('hello', { id, name: String(p.name || '').slice(0, 24) });
      return;
    }
    if (p.kind === 'enc') {
      const id = String(p.from || '');
      const key = await keyFor(id);
      if (!key) return;
      const msg = await decryptJson(key, p);
      if (!msg || typeof msg.t !== 'string' || !(msg.seq > (lastSeq.get(id) || 0))) return;
      lastSeq.set(id, msg.seq);
      // az azonosítót a titkosítás igazolja: a tartalomban lévő id-t felülírjuk
      handlers.onMessage(msg.t, { ...(msg.p && typeof msg.p === 'object' ? msg.p : {}), id });
    }
  }

  room = await openRoom(code, { id: `host-${code}`, name: 'Tanár', role: 'host' }, {
    onMessage: (t, p) => inq(() => onWire(t, p)),
    onPresence: handlers.onPresence,
    onStatus: handlers.onStatus,
  });

  return {
    /** Aláírt üzenet mindenkinek. */
    send: (t, p) => wire({ t, p, ts: nextTs() }),
    /** Aláírt és csak az adott diáknak titkosított üzenet. */
    sendTo: async (id, t, p) => {
      const key = await keyFor(id);
      if (!key) return;
      const box = await encryptJson(key, { t, p });
      wire({ t: 'enc', to: id, ...box, ts: nextTs() });
    },
    setLocked: (v) => { locked = Boolean(v); },
    isBound: (id) => bound.has(id),
    forget: (id) => { bound.delete(id); aes.delete(id); sessionStorage.setItem(bindKey, JSON.stringify(Object.fromEntries(bound))); },
    close: () => room?.close(),
  };
}

// ======================================================================== diák
export async function openPlayerRoom(code, me, handlers) {
  const kKey = `pastewall.pkeys.${code}`;
  let pk = JSON.parse(sessionStorage.getItem(kKey) || 'null');
  if (!pk) { pk = await createPlayerKeys(); sessionStorage.setItem(kKey, JSON.stringify(pk)); }
  const myPriv = await loadPrivateDh(pk.dhPriv);
  let host = null; // { s, d, aes }
  const trusted = new Map(); // signPub -> bool (a kódhoz tartozik-e)
  let lastTs = 0;
  let seqBase = Date.now() * 1000;
  const pending = [];
  const inq = queue();
  const out = queue();
  let room = null;

  async function trust(k) {
    if (!k?.s || !k?.d) return false;
    const id = `${k.s}|${k.d}`;
    if (!trusted.has(id)) trusted.set(id, (await codeFromKeys(k.s, k.d)) === code);
    return trusted.get(id);
  }

  async function onWire(t, p) {
    if (t !== 'H' || !p?.d || !p?.sig) return; // csak a tanár aláírt üzeneteit fogadjuk el
    if (!(await trust(p.k))) return;
    if (!(await verify(p.k.s, p.d, p.sig))) return;
    let d;
    try { d = JSON.parse(p.d); } catch { return; }
    if (!(d.ts > lastTs)) return; // régi (visszajátszott) üzenet
    lastTs = d.ts;
    if (!host || host.d !== p.k.d) {
      host = { s: p.k.s, d: p.k.d, aes: await sharedKey(myPriv, p.k.d) };
      while (pending.length) { const [tt, pp] = pending.shift(); send(tt, pp); }
    }
    if (d.t === 'enc') {
      if (d.to !== me.id) return;
      const msg = await decryptJson(host.aes, d);
      if (msg) handlers.onMessage(msg.t, msg.p);
      return;
    }
    handlers.onMessage(d.t, d.p);
  }

  function send(t, p) {
    if (t === 'hello') {
      room?.send('P', { kind: 'hello', id: me.id, name: me.name, pub: pk.dhPub });
      return;
    }
    if (!host) { if (pending.length < 50) pending.push([t, p]); return; }
    out(async () => {
      seqBase += 1;
      const box = await encryptJson(host.aes, { t, p, seq: seqBase });
      room?.send('P', { kind: 'enc', from: me.id, ...box });
    });
  }

  room = await openRoom(code, me, {
    onMessage: (t, p) => inq(() => onWire(t, p)),
    onPresence: handlers.onPresence || (() => {}),
    onStatus: handlers.onStatus,
  });
  return { send, close: () => room?.close() };
}

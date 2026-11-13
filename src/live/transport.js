// Valós idejű csatorna egy játékszobához.
// Ha van Supabase-beállítás, Supabase Realtime-ot használ (broadcast + presence),
// különben "demó módban" a böngésző BroadcastChannel-jét (ugyanazon gép több füle).

import { SUPABASE_URL, SUPABASE_KEY, isOnline } from '../config.js';

let supabasePromise = null;
function getSupabase() {
  if (!supabasePromise) {
    supabasePromise = import('@supabase/supabase-js').then(({ createClient }) =>
      createClient(SUPABASE_URL, SUPABASE_KEY, { realtime: { params: { eventsPerSecond: 20 } } }),
    );
  }
  return supabasePromise;
}

/**
 * @param {string} code  Szobakód
 * @param {{id:string, name:string, role:'host'|'player'}} me
 * @param {{onMessage:(type:string, payload:any)=>void, onPresence:(ids:Set<string>)=>void, onStatus?:(s:string)=>void}} handlers
 */
export async function openRoom(code, me, handlers) {
  return isOnline() ? openSupabase(code, me, handlers) : openLocal(code, me, handlers);
}

async function openSupabase(code, me, { onMessage, onPresence, onStatus }) {
  const sb = await getSupabase();
  const ch = sb.channel(`pastewall:${code}`, {
    config: { broadcast: { self: false, ack: false }, presence: { key: me.id } },
  });
  ch.on('broadcast', { event: 'msg' }, ({ payload }) => onMessage(payload.t, payload.p));
  ch.on('presence', { event: 'sync' }, () => onPresence(new Set(Object.keys(ch.presenceState()))));
  await new Promise((resolve, reject) => {
    ch.subscribe(async (status) => {
      onStatus?.(status);
      if (status === 'SUBSCRIBED') {
        await ch.track({ name: me.name, role: me.role });
        resolve();
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        reject(new Error('Nem sikerült csatlakozni a szobához.'));
      }
    });
  });
  return {
    send: (t, p) => ch.send({ type: 'broadcast', event: 'msg', payload: { t, p } }),
    close: () => sb.removeChannel(ch),
  };
}

function openLocal(code, me, { onMessage, onPresence, onStatus }) {
  const bc = new BroadcastChannel(`pastewall:${code}`);
  const seen = new Map([[me.id, Date.now()]]);
  const emitPresence = () => onPresence(new Set(seen.keys()));
  bc.onmessage = (ev) => {
    const { t, p, from } = ev.data || {};
    if (t === '__ping') {
      const isNew = !seen.has(from);
      seen.set(from, Date.now());
      if (isNew) emitPresence();
      return;
    }
    if (t === '__bye') { seen.delete(from); emitPresence(); return; }
    onMessage(t, p);
  };
  const ping = () => bc.postMessage({ t: '__ping', from: me.id });
  ping();
  const timer = setInterval(() => {
    ping();
    const now = Date.now();
    let changed = false;
    for (const [id, at] of seen) {
      if (id !== me.id && now - at > 5000) { seen.delete(id); changed = true; }
    }
    if (changed) emitPresence();
  }, 1500);
  const bye = () => bc.postMessage({ t: '__bye', from: me.id });
  window.addEventListener('pagehide', bye);
  onStatus?.('SUBSCRIBED');
  setTimeout(emitPresence, 0);
  return Promise.resolve({
    send: (t, p) => bc.postMessage({ t, p, from: me.id }),
    close: () => { bye(); clearInterval(timer); bc.close(); window.removeEventListener('pagehide', bye); },
  });
}

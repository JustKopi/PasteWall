// Kriptográfiai alapok (Web Crypto API, a böngészőbe építve):
// - a tanár ECDSA kulccsal aláírja minden üzenetét (a diák ellenőrzi),
// - a tanár és minden diák között ECDH-val közös titkos kulcs, AES-GCM titkosítás,
// - a szobakód a tanár nyilvános kulcsaiból származik, így hamis "tanár" nem adhatja ki magát.

const subtle = globalThis.crypto.subtle;
const enc = new TextEncoder();
const dec = new TextDecoder();
export const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 jel = 5 bit / karakter

const ECDSA = { name: 'ECDSA', namedCurve: 'P-256' };
const ECDH = { name: 'ECDH', namedCurve: 'P-256' };

export function b64(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
export function unb64(str) {
  const s = atob(str);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/** Nyilvános kulcsok -> 6 karakteres szobakód (30 bit az SHA-256 lenyomatból). */
export async function codeFromKeys(signPubB64, dhPubB64) {
  const data = enc.encode(`pastewall-v1|${signPubB64}|${dhPubB64}`);
  const h = new Uint8Array(await subtle.digest('SHA-256', data));
  let bits = 0;
  let acc = 0;
  let code = '';
  for (const byte of h) {
    acc = (acc << 8) | byte;
    bits += 8;
    while (bits >= 5 && code.length < 6) { bits -= 5; code += CODE_CHARS[(acc >> bits) & 31]; }
    if (code.length === 6) break;
  }
  return code;
}

// ------------------------------------------------------------------ tanári kulcsok
export async function createHostKeys() {
  const sign = await subtle.generateKey(ECDSA, true, ['sign', 'verify']);
  const dh = await subtle.generateKey(ECDH, true, ['deriveKey']);
  const signPub = b64(await subtle.exportKey('raw', sign.publicKey));
  const dhPub = b64(await subtle.exportKey('raw', dh.publicKey));
  const code = await codeFromKeys(signPub, dhPub);
  const stored = {
    signPriv: await subtle.exportKey('jwk', sign.privateKey),
    dhPriv: await subtle.exportKey('jwk', dh.privateKey),
    signPub,
    dhPub,
  };
  return { code, stored };
}

export async function loadHostKeys(stored) {
  return {
    signPub: stored.signPub,
    dhPub: stored.dhPub,
    signKey: await subtle.importKey('jwk', stored.signPriv, ECDSA, false, ['sign']),
    dhKey: await subtle.importKey('jwk', stored.dhPriv, ECDH, false, ['deriveKey']),
  };
}

export async function sign(key, text) {
  return b64(await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(text)));
}

const verifyKeys = new Map();
export async function verify(signPubB64, text, sigB64) {
  let key = verifyKeys.get(signPubB64);
  if (!key) {
    key = await subtle.importKey('raw', unb64(signPubB64), ECDSA, false, ['verify']);
    verifyKeys.set(signPubB64, key);
  }
  try {
    return await subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, unb64(sigB64), enc.encode(text));
  } catch {
    return false;
  }
}

// ------------------------------------------------------------------ diák kulcsok
export async function createPlayerKeys() {
  const dh = await subtle.generateKey(ECDH, true, ['deriveKey']);
  return {
    dhPub: b64(await subtle.exportKey('raw', dh.publicKey)),
    dhPriv: await subtle.exportKey('jwk', dh.privateKey),
  };
}
export async function loadPrivateDh(jwk) {
  return subtle.importKey('jwk', jwk, ECDH, false, ['deriveKey']);
}

/** Közös AES-GCM kulcs a saját privát és a másik fél nyilvános ECDH kulcsából. */
export async function sharedKey(myPrivDh, theirPubB64) {
  const pub = await subtle.importKey('raw', unb64(theirPubB64), ECDH, false, []);
  return subtle.deriveKey({ name: 'ECDH', public: pub }, myPrivDh, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function encryptJson(key, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj)));
  return { iv: b64(iv), ct: b64(ct) };
}

export async function decryptJson(key, { iv, ct }) {
  try {
    const pt = await subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, key, unb64(ct));
    return JSON.parse(dec.decode(pt));
  } catch {
    return null; // hamisított vagy más kulccsal titkosított üzenet
  }
}

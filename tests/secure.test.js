import { describe, it, expect } from 'vitest';
import {
  createHostKeys, loadHostKeys, sign, verify, codeFromKeys, createPlayerKeys, loadPrivateDh, sharedKey, encryptJson, decryptJson,
} from '../src/live/secure.js';

describe('biztonsági réteg', () => {
  it('a szobakód a tanári kulcsokból származik és ellenőrizhető', async () => {
    const { code, stored } = await createHostKeys();
    expect(code).toMatch(/^[A-Z2-9]{6}$/);
    expect(await codeFromKeys(stored.signPub, stored.dhPub)).toBe(code);
    const other = await createHostKeys();
    expect(await codeFromKeys(other.stored.signPub, other.stored.dhPub)).not.toBe(code); // (2^-30 eséllyel egyezhetne)
  });

  it('aláírás: hamisított vagy módosított üzenet elbukik', async () => {
    const { stored } = await createHostKeys();
    const keys = await loadHostKeys(stored);
    const text = JSON.stringify({ t: 'state', p: { status: 'playing' }, ts: 1 });
    const sig = await sign(keys.signKey, text);
    expect(await verify(stored.signPub, text, sig)).toBe(true);
    expect(await verify(stored.signPub, text.replace('playing', 'ended'), sig)).toBe(false);
    const attacker = await loadHostKeys((await createHostKeys()).stored);
    expect(await verify(stored.signPub, text, await sign(attacker.signKey, text))).toBe(false);
  });

  it('titkosítás: csak a tanár és az adott diák tudja olvasni', async () => {
    const { stored } = await createHostKeys();
    const host = await loadHostKeys(stored);
    const anna = await createPlayerKeys();
    const bence = await createPlayerKeys();
    const annaKey = await sharedKey(await loadPrivateDh(anna.dhPriv), stored.dhPub);
    const hostSideAnna = await sharedKey(host.dhKey, anna.dhPub);
    const box = await encryptJson(annaKey, { t: 'guess', p: { row: 1, tokens: ['A'] }, seq: 5 });
    expect(await decryptJson(hostSideAnna, box)).toEqual({ t: 'guess', p: { row: 1, tokens: ['A'] }, seq: 5 });
    // Bence (más kulccsal) nem tudja elolvasni, és nem tud Anna nevében üzenni
    const benceKey = await sharedKey(await loadPrivateDh(bence.dhPriv), stored.dhPub);
    expect(await decryptJson(benceKey, box)).toBeNull();
    const forged = await encryptJson(benceKey, { t: 'guess', p: {}, seq: 9 });
    expect(await decryptJson(hostSideAnna, forged)).toBeNull();
    // módosított titkosított szöveg is elbukik
    const tampered = { ...box, ct: box.ct.slice(0, -4) + (box.ct.endsWith('AAAA') ? 'BBBB' : 'AAAA') };
    expect(await decryptJson(hostSideAnna, tampered)).toBeNull();
  });
});

// Feltölthető csomag a kopidev.hu/pastewall/ almappához (Rackhost, Apache).
//
//   npm run build:kopidev   ->  pastewall-kopidev.zip  (benne: pastewall/...)
//
// A kopidev.hu gyökérbeli .htaccess-e szigorú CSP-t küld (csak a KopiDev saját Supabase-e,
// nincs blob:, nincs inline stílus). Az almappa saját .htaccess-e ezt CSAK erre a mappára
// cseréli le úgy, hogy a PasteWall élő kapcsolata működjön. Átirányítási szabályt szándékosan
// nem tartalmaz, így a gyökér szabályai (HTTPS, rejtett fájlok tiltása) érvényben maradnak.

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { deflateRawSync, crc32 } from 'node:zlib';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const dist = join(root, 'dist');
const out = join(root, 'pastewall-kopidev.zip');
const FOLDER = 'pastewall';

// --- 1. Supabase-cím az éles beállításokból
const envFile = ['.env.production.local', '.env.production'].map((f) => join(root, f)).find(existsSync);
const env = Object.fromEntries((envFile ? readFileSync(envFile, 'utf8') : '').split(/\r?\n/)
  .map((l) => l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/)).filter(Boolean).map((m) => [m[1], m[2]]));
const url = env.VITE_SUPABASE_URL;
if (!url || !env.VITE_SUPABASE_KEY) {
  console.error('Hiányzik a VITE_SUPABASE_URL / VITE_SUPABASE_KEY a .env.production fájlból: élő mód nélkül nincs értelme feltölteni.');
  process.exit(1);
}
const host = new URL(url).host;

// --- 2. build (relatív útvonalakkal: bármilyen almappában működik)
execSync('npx vite build', { cwd: root, stdio: 'inherit' });

// --- 3. az almappa .htaccess-e
const csp = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'", // a játékok elemenként állítanak stílust (szín, méret)
  "img-src 'self' data: blob:", // QR-kód, feltöltött és beépített képek
  "font-src 'self'",
  `connect-src 'self' https://${host} wss://${host}`, // élő játék (Supabase Realtime)
  "worker-src 'self' blob:",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  'upgrade-insecure-requests',
].join('; ');

writeFileSync(join(dist, '.htaccess'), `# PasteWall a kopidev.hu/${FOLDER}/ mappában. A scripts/kopidev.mjs generálja, ne kézzel szerkeszd.
# A gyökér .htaccess szabályai (HTTPS, átirányítások, tiltott fájlok) itt is érvényesek;
# ez a fájl csak a CSP-t bővíti a PasteWall élő kapcsolatához.
DirectoryIndex index.html
Options -Indexes

<IfModule mod_headers.c>
  Header always set Content-Security-Policy "${csp}"
  # a tanári gép a diákok kameráját nem kéri, de a képfeltöltés maradjon engedve
  Header always set Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()"
  <FilesMatch "\\.html$">
    Header set Cache-Control "no-cache"
  </FilesMatch>
  <FilesMatch "^pastewall-theme\\.js$">
    Header set Cache-Control "public, max-age=86400"
  </FilesMatch>
</IfModule>
`);

// --- 4. zip (perjeles útvonalakkal, a .htaccess-szel együtt)
function files(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}
const entries = files(dist).map((p) => ({ name: `${FOLDER}/${relative(dist, p).split(sep).join('/')}`, data: readFileSync(p) }));

const chunks = [];
const central = [];
let offset = 0;
const dosTime = (() => {
  const d = new Date();
  return { time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate() };
})();
for (const e of entries) {
  const name = Buffer.from(e.name, 'utf8');
  const packed = deflateRawSync(e.data, { level: 9 });
  const crc = crc32(e.data);
  const head = Buffer.alloc(30);
  head.writeUInt32LE(0x04034b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(0x0800, 6); head.writeUInt16LE(8, 8);
  head.writeUInt16LE(dosTime.time, 10); head.writeUInt16LE(dosTime.date, 12); head.writeUInt32LE(crc, 14);
  head.writeUInt32LE(packed.length, 18); head.writeUInt32LE(e.data.length, 22); head.writeUInt16LE(name.length, 26);
  chunks.push(head, name, packed);
  const c = Buffer.alloc(46);
  c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(8, 10);
  c.writeUInt16LE(dosTime.time, 12); c.writeUInt16LE(dosTime.date, 14); c.writeUInt32LE(crc, 16);
  c.writeUInt32LE(packed.length, 20); c.writeUInt32LE(e.data.length, 24); c.writeUInt16LE(name.length, 28);
  c.writeUInt32LE(offset, 42);
  central.push(c, name);
  offset += head.length + name.length + packed.length;
}
const cd = Buffer.concat(central);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
writeFileSync(out, Buffer.concat([...chunks, cd, end]));

console.log(`\nKész: ${relative(root, out)} (${entries.length} fájl, Supabase: ${host})`);
console.log(`Feltöltés: a kopidev.hu webgyökerébe bontsd ki, így lesz belőle a /${FOLDER}/ mappa.`);

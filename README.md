# PasteWall

Interaktív, élő osztálytermi játékok. Az első játék egy újság-stílusú keresztrejtvény
kiemelt megfejtés-sávval (egy vagy több fő sávval), amely magától rakja ki magát a megadott
szavakból.

## Játékmódok

| Mód | Leírás |
|---|---|
| **Közös megoldás** | Mindenki ugyanazt a rejtvényt tölti, élőben látszik, ki mit gépel. |
| **Körös játék** | Sorban jönnek a diákok, a többiek élőben nézik, és tippelhetnek (👍/👎), hogy eltalálja-e. |
| **Verseny** | Mindenki a saját rejtvényét tölti, élő ranglistával. |

A tanár gépe a játékvezető: csak ő ismeri a megoldást, a diákok eszközére nem kerül ki.
A pontozás: helyes sor +10, megfejtés +25, helyes tipp a körös módban +2 pont.
A játék végén az eredmények CSV-ként letölthetők, és Excelben megnyithatók.

## Fejlesztés

```bash
npm install
npm run dev     # helyi fejlesztői szerver
npm test        # tesztek (generátor + játéklogika)
npm run build   # éles build a dist/ mappába
```

Szerverbeállítás nélkül az oldal **demó módban** fut: a játék ugyanazon a gépen, több
böngészőfülön próbálható ki (egy fül a tanár, a többi a diákok).

## Élesítés Supabase-zel

1. Hozz létre egy Supabase-projektet (EU régió, pl. Frankfurt).
2. Másold ki a Project URL-t és a publishable (nyilvános) kulcsot.
3. Hozz létre egy `.env.local` fájlt:
   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_KEY=sb_publishable_...
   ```
4. `npm run build`, majd a `dist/` mappát töltsd fel bármilyen statikus tárhelyre
   (GitHub Pages, Netlify, Vercel).

Az élő játékhoz csak a Supabase Realtime (broadcast és presence) kell, adatbázistábla nem.

## Kettős betűk

A CS, SZ, GY, NY, ZS, LY, TY, DZ és DZS egy cellát foglal, a hosszú változatuk (pl. SSZ)
pedig két cellát. Összetett szavaknál a `|` jellel lehet kézzel szétválasztani: `HÁZ|SZÁM`.

## Biztonság

A játék egy nyilvános valós idejű csatornán fut, ezért minden védelem végpontok között működik,
a böngésző beépített kriptográfiájával (Web Crypto: ECDSA P-256, ECDH P-256, AES-GCM 256):

- **A tanár üzenetei alá vannak írva.** A szobakód a tanár nyilvános kulcsaiból származik
  (SHA-256 lenyomat, 30 bit), így a diák eszköze ellenőrzi, hogy az üzenet valóban a tanártól jön.
  Hamis „tanári” üzenetet a diákok eldobnak.
- **A diákok üzenetei titkosítva mennek a tanárnak.** Minden diák saját kulcsot kap; a többiek
  nem látják a tippjeit, és senki nem küldhet más nevében (a tanári gép a játékost a kulcsához köti).
- **Visszajátszás ellen** a tanár üzenetei időbélyeget, a diákéi sorszámot visznek.
- **A helyes válaszok csak a tanári gépen vannak.** Keresztrejtvénynél és minden minijátéknál
  a tanári gép ellenőrzi a választ, számolja a pontot és méri az időt; a diák csak az aktuális
  kérdést kapja meg (titkosítva, csak ő).
- **Szoba lezárása:** a lezárt szobába új diák nem léphet be (a bent lévők újracsatlakozhatnak),
  a tanár bármikor kiléptethet bárkit.

Korlátok: a 6 karakteres kód 30 bites lenyomat, egy előre, nagy számítási kapacitással készített
támadás elméletileg talál hozzá illő kulcsot; osztálytermi használatra ez elegendő. Aki tudja a
kódot, csatlakozni tud (ezért van a lezárás), és a csatornát elárasztani is megpróbálhatja.

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

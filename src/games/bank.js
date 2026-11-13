// Beépített kérdésbank teszteléshez és gyors játékokhoz:
// általános műveltség 1–8. osztályig és alapfokú informatika.

export const TOPICS = {
  mix: 'Vegyes',
  info: 'Informatika',
  foldrajz: 'Földrajz',
  tortenelem: 'Történelem',
  irodalom: 'Irodalom',
  termeszet: 'Természetismeret',
  matek: 'Matematika',
  nyelvtan: 'Nyelvtan',
  muveszet: 'Művészet, zene, sport',
};

// ---------------------------------------------------------------- VÁLASZ - meghatározás párok
const RAW_PAIRS = {
  info: `Egér - A számítógép mutatóeszköze
Billentyűzet - Gépeléshez használt beviteli eszköz
Monitor - Képet megjelenítő kimeneti eszköz
Nyomtató - Papírra író kimeneti eszköz
Szkenner - Papíron lévő képet, szöveget digitalizáló eszköz
Hangszóró - Hangot kiadó kimeneti eszköz
Mikrofon - Hangot rögzítő beviteli eszköz
Webkamera - Videóhívásnál ez lát minket
Processzor - A számítógép „agya”
Memória - Ide tölti be a gép a futó programokat (RAM)
Merevlemez - Mágneses háttértár a számítógépben
Pendrive - USB-be dugható, hordozható adattároló
Alaplap - Erre csatlakozik a gép minden alkatrésze
Tápegység - Árammal látja el a számítógépet
Bit - Az informatika legkisebb adategysége (0 vagy 1)
Bájt - 8 bitből álló adategység
Kilobájt - Körülbelül ezer bájt
Megabájt - Körülbelül ezer kilobájt
Gigabájt - Körülbelül ezer megabájt
Internet - Világméretű számítógép-hálózat
Böngésző - Weboldalak megnyitására szolgáló program
Weboldal - Böngészővel megnyitható tartalom az interneten
Jelszó - Titkos karaktersor a belépéshez
Vírus - Kártékony program, ami „megfertőzi” a gépet
Vírusirtó - Kártékony programokat felismerő és eltávolító szoftver
Tűzfal - A hálózati forgalmat szűrő védelem
Fájl - Elmentett dokumentum a számítógépen
Mappa - Ebben rendszerezzük a fájlokat
Ikon - Kis kép, ami egy programot vagy fájlt jelöl
Kurzor - Villogó jel, ahol a beírt szöveg megjelenik
Program - Utasítások sorozata, amit a számítógép végrehajt
Algoritmus - Lépések sorozata egy feladat megoldására
Ciklus - Ismétlődő utasítások a programban
Változó - Névvel ellátott hely, ahol a program értéket tárol
Operációs rendszer - A számítógépet működtető alapszoftver (pl. Windows)
Laptop - Hordozható számítógép
Tablet - Érintőképernyős, lapos hordozható eszköz
Okostelefon - Zsebben hordható, internetes mobiltelefon
Router - Az otthoni hálózatot az internethez kapcsoló eszköz
Wifi - Vezeték nélküli hálózat
Kukac - A @ jel magyar beceneve
Spam - Kéretlen, tömegesen küldött levél
Letöltés - Fájl átmásolása az internetről a gépre
Mentés - Ctrl+S
Másolás - Ctrl+C
Beillesztés - Ctrl+V
Visszavonás - Ctrl+Z
Pixel - A képernyő képének legkisebb pontja
Robot - Programozható, önállóan mozgó gép
Táblázatkezelő - Program számolótáblákhoz (pl. Excel)
Szövegszerkesztő - Program dokumentumok írására (pl. Word)
Felhő - Interneten elérhető tárhely (angolul: cloud)
Projektor - Kivetítő eszköz a tanteremben
Kábel - Vezeték, ami összeköti az eszközöket`,

  foldrajz: `Budapest - Magyarország fővárosa
Debrecen - Hazánk második legnépesebb városa
Szeged - Tisza-parti város, híres a paprikájáról
Pécs - A Mecsek lábánál fekvő dél-dunántúli város
Miskolc - Észak-magyarországi nagyváros a Bükk lábánál
Duna - Budapesten átfolyó nagy folyó
Tisza - A „szőke folyó”
Balaton - Közép-Európa legnagyobb tava
Kékes - Magyarország legmagasabb hegycsúcsa
Mátra - Ebben a hegységben van a Kékes
Alföld - Hazánk legnagyobb tájegysége
Hortobágy - Híres alföldi puszta, nemzeti park
Párizs - Franciaország fővárosa
Berlin - Németország fővárosa
Bécs - Ausztria fővárosa
Róma - Olaszország fővárosa
London - Az Egyesült Királyság fővárosa
Madrid - Spanyolország fővárosa
Varsó - Lengyelország fővárosa
Prága - Csehország fővárosa
Pozsony - Szlovákia fővárosa
Belgrád - Szerbia fővárosa
Zágráb - Horvátország fővárosa
Bukarest - Románia fővárosa
Kijev - Ukrajna fővárosa
Európa - Ezen a kontinensen van Magyarország
Ázsia - A legnagyobb kontinens
Afrika - Ezen a kontinensen van a Szahara
Ausztrália - A kenguruk kontinense
Antarktisz - A Déli-sark jeges kontinense
Amazonas - Dél-Amerika óriási folyója
Nílus - Egyiptomon átfolyó afrikai folyó
Himalája - Itt található a Mount Everest
Szahara - A legnagyobb forró sivatag
Egyenlítő - A Földet északi és déli félgömbre osztó képzeletbeli kör
Iránytű - Mágneses tűvel mutatja az északi irányt
Térkép - A Föld felszínének kicsinyített, síkbeli ábrázolása
Vulkán - Lávát okádó hegy
Sziget - Minden oldalról víz veszi körül
Félsziget - Három oldalról víz veszi körül
Földgömb - A Föld kicsinyített gömb alakú mása
Tenger - Az óceán szárazföldhöz közeli, részben elkülönülő része`,

  tortenelem: `István - Első királyunk
Árpád - Honfoglaló fejedelmünk
Mátyás - Az igazságos király
Szent László - A lovagkirály
Kossuth - Az 1848-as forradalom egyik vezetője, Lajos keresztnevű
Széchenyi - „A legnagyobb magyar”, István keresztnevű
Honfoglalás - A magyarok 895 körüli letelepedése a Kárpát-medencében
Mohács - Az 1526-os vesztes csata helyszíne
Turul - A magyarok mondabeli madara
Lánchíd - Széchenyi kezdeményezésére épült budapesti híd
Szent Korona - A magyar királyok koronázási jelvénye
Egyiptom - A piramisok országa
Fáraó - Az ókori Egyiptom uralkodója
Piramis - Az egyiptomi fáraók sírépülete
Olümpia - Az ókori olimpiai játékok helyszíne
Athén - Az ókori demokrácia városa
Gladiátor - Római arénában küzdő harcos
Lovag - Középkori páncélos harcos
Vár - Középkori erődített épület
Kolumbusz - 1492-ben hajózott el Amerikába
Gutenberg - A könyvnyomtatás feltalálója Európában
Napóleon - Francia császár a 19. század elején
Eger - Dobó István 1552-ben ennek a várát védte
Zrínyi - Szigetvár hős védője, Miklós keresztnevű
Hunyadi - Nándorfehérvár győztese, János keresztnevű
Rákóczi - Az 1703–1711-es szabadságharc vezetője, Ferenc keresztnevű
Deák - „A haza bölcse”, Ferenc keresztnevű
Március - Ennek a hónapnak a 15. napján tört ki az 1848-as forradalom
Kódex - Kézzel írt középkori könyv
Pápa - A katolikus egyház feje`,

  irodalom: `Arany János - A Toldi szerzője
Petőfi Sándor - A János vitéz szerzője
Toldi - Arany János erős vitéz hőse
Kukorica Jancsi - A János vitéz főhőse eredeti nevén
Iluska - Kukorica Jancsi szerelme
Kölcsey - A Himnusz költője, Ferenc keresztnevű
Vörösmarty - A Szózat költője, Mihály keresztnevű
Himnusz - Nemzeti imádságunk
Szózat - „Hazádnak rendületlenül…”
Jókai - Az arany ember írója, Mór keresztnevű
Gárdonyi - Az Egri csillagok írója, Géza keresztnevű
Egri csillagok - Gárdonyi Géza regénye Eger ostromáról
Molnár Ferenc - A Pál utcai fiúk szerzője
Nemecsek - A Pál utcai fiúk tragikus sorsú hőse
Vuk - Fekete István kisrókája
Lúdas Matyi - Fazekas Mihály hőse, aki háromszor veri vissza Döbrögit
Döbrögi - Lúdas Matyi ellenfele, a földesúr
Hamupipőke - Mesehős, aki elveszíti az üvegcipőjét
Piroska - Mesehős, akit a farkas bekap
Mese - Csodás elemeket tartalmazó történet
Vers - Ütemes, gyakran rímes költői mű
Rím - Sorvégi hangzásbeli egyezés
Regény - Hosszú prózai elbeszélő mű
Monda - Valós helyhez vagy személyhez kötődő hagyományos történet
Ballada - „Dalban elbeszélt tragédia”
Hasonlat - „Olyan, mint…” típusú költői kép
Weöres Sándor - A Bóbita költője
Bóbita - Weöres Sándor ismert gyerekverse
Mátyás király - Sok népmese igazságos uralkodója
Szereplő - A történet alakja`,

  termeszet: `Nap - A Földhöz legközelebbi csillag
Hold - A Föld természetes kísérője
Merkúr - A Naphoz legközelebbi bolygó
Vénusz - A legfényesebb bolygó az esti égen
Föld - Bolygónk
Mars - A „vörös bolygó”
Jupiter - A Naprendszer legnagyobb bolygója
Szaturnusz - Gyűrűiről híres bolygó
Oxigén - Ezt a gázt lélegezzük be
Szén-dioxid - Ezt a gázt lélegezzük ki
Víz - Képlete H₂O
Jég - A víz szilárd halmazállapota
Gőz - A víz légnemű halmazállapota
Fotoszintézis - A növények napfény segítségével táplálékot készítenek
Gyökér - A növény része, a földből szívja fel a vizet
Levél - A növény zöld része, itt zajlik a fotoszintézis
Virág - A növény gyakran színes szaporítószerve
Termés - A magot rejtő növényi rész
Emlős - Utódait anyatejjel táplálja
Madár - Tollas, tojást rakó gerinces
Hal - Kopoltyúval lélegző vízi gerinces
Kétéltű - Például a béka osztálya
Hüllő - Például a gyík és a kígyó osztálya
Rovar - Hat lábú ízeltlábú
Pók - Nyolc lábú ízeltlábú, hálót sző
Bálna - A legnagyobb emlős
Elefánt - A legnagyobb szárazföldi emlős
Zsiráf - A leghosszabb nyakú állat
Gepárd - A leggyorsabb szárazföldi állat
Pingvin - Repülni nem tudó, úszó madár
Denevér - Repülni tudó emlős
Méh - Mézet készítő rovar
Hangya - Szorgalmas rovar, bolyban él
Ebihal - A béka lárvája
Hernyó - A lepke lárvája
Szív - A vért pumpáló szervünk
Tüdő - A légzés szerve
Agy - A gondolkodás szerve
Csont - A vázrendszer eleme
Gravitáció - A tárgyakat a Föld felé húzó erő
Mágnes - A vasat magához vonzza
Szivárvány - Eső után a napfény színeire bomlik
Villám - Zivatarban keletkező elektromos kisülés
Tavasz - A tél utáni évszak
Ősz - Az az évszak, amikor hullanak a falevelek`,

  matek: `Háromszög - Három oldalú síkidom
Négyzet - Négy egyenlő oldalú, derékszögű négyszög
Téglalap - Szemközti oldalai egyenlők, minden szöge derékszög
Kör - Pontjai egyenlő távolságra vannak a középponttól
Kocka - Hat egybevágó négyzet határolja
Gömb - Labda alakú test
Henger - Konzervdoboz alakú test
Kerület - A síkidom határvonalának hossza
Terület - A síkidom által lefedett felület nagysága
Átmérő - A középponton átmenő, a kör két pontját összekötő szakasz
Sugár - A kör középpontjának és a körvonalnak a távolsága
Derékszög - 90 fokos szög
Összeadás - Az eredménye az összeg
Kivonás - Az eredménye a különbség
Szorzás - Az eredménye a szorzat
Osztás - Az eredménye a hányados
Tört - Számláló és nevező alkotja
Páros - Így nevezzük a 2-vel osztható számot
Prímszám - Csak 1-gyel és önmagával osztható, 1-nél nagyobb szám
Tucat - Tizenkét darab
Évszázad - Száz év
Méter - A hosszúság alapmértékegysége
Liter - Az űrtartalom mértékegysége
Kilogramm - Ezer gramm
Szökőév - 366 napos év
Óra - Hatvan perc
Perc - Hatvan másodperc
Hetvenkettő - Nyolcszor kilenc
Száz - Tízszer tíz
Negyed - Egy egész egynegyede (1/4)`,

  nyelvtan: `Ige - Cselekvést, történést, létezést jelölő szófaj
Főnév - Élőlények, tárgyak, fogalmak nevét jelölő szófaj
Melléknév - Tulajdonságot jelölő szófaj
Számnév - Mennyiséget vagy sorrendet jelölő szófaj
Névmás - Más szófajok helyett álló szó (pl. én, te)
Magánhangzó - Például a, e, i, o, u
Mássalhangzó - Például b, d, k, m
Szótag - A szó kiejthető része, egy magánhangzóval
Ábécé - A betűk rendezett sora
Mondat - Nagybetűvel kezdődik, írásjellel végződik
Alany - A Ki? Mi? kérdésre felelő mondatrész
Állítmány - A Mit csinál? kérdésre felelő mondatrész
Toldalék - A szótőhöz kapcsolódó végződés
Kérdőjel - A kérdő mondat végén álló írásjel
Felkiáltójel - A felkiáltó mondat végén álló írásjel
Pont - A kijelentő mondat végén álló írásjel
Betű - A hang írott jele
Szótő - A szó toldalék nélküli része
Rag - Például a -ban, -ból, -nak toldalék
Vessző - Tagmondatokat elválasztó írásjel`,

  muveszet: `Kodály - A Háry János zeneszerzője, Zoltán keresztnevű
Bartók - Világhírű zeneszerzőnk, Béla keresztnevű
Liszt - Zongoravirtuóz zeneszerzőnk, Ferenc keresztnevű
Hegedű - Vonóval megszólaltatott vonós hangszer
Zongora - Fekete-fehér billentyűs hangszer
Dob - Ütőhangszer
Furulya - Egyszerű fúvós hangszer
Kotta - A zene lejegyzésének módja
Ecset - Festéshez használt eszköz
Mona Lisa - Leonardo da Vinci híres festménye
Leonardo - A Mona Lisa festője
Vízilabda - Magyarország egyik legsikeresebb csapatsportja
Sakk - Táblajáték királlyal és vezérrel
Labdarúgás - A foci hivatalos neve
Puskás - Az Aranycsapat legendás csatára, Ferenc keresztnevű
Olimpia - Négyévente megrendezett nagy sportverseny
Kórus - Együtt éneklő csoport
Szobor - Térbeli képzőművészeti alkotás`,
};

export const PAIRS = Object.entries(RAW_PAIRS).flatMap(([topic, text]) => text.split('\n').map((l) => {
  const i = l.indexOf(' - ');
  return { a: l.slice(0, i).trim(), b: l.slice(i + 3).trim(), topic };
}));

// ---------------------------------------------------------------- igaz / hamis
const RAW_TF = `info|A monitor beviteli eszköz.|0
info|Az egér beviteli eszköz.|1
info|Egy bájt 8 bitből áll.|1
info|A Ctrl+C a beillesztés billentyűparancsa.|0
info|A Ctrl+V a beillesztés billentyűparancsa.|1
info|A nyomtató kimeneti eszköz.|1
info|A jelszót érdemes mindenkinek elmondani.|0
info|A vírusirtó a kártékony programok ellen véd.|1
info|A processzor a számítógép „agya”.|1
info|A pendrive háttértár.|1
info|A wifi vezeték nélküli hálózat.|1
info|A kilobájt nagyobb, mint a megabájt.|0
info|Az algoritmus lépések sorozata egy feladat megoldására.|1
info|A böngésző weboldalak megnyitására való program.|1
info|A hangszóró beviteli eszköz.|0
info|A Ctrl+Z visszavonja az utolsó műveletet.|1
foldrajz|Magyarország fővárosa Budapest.|1
foldrajz|A Balaton Közép-Európa legnagyobb tava.|1
foldrajz|Magyarország legmagasabb pontja a Kékes.|1
foldrajz|A Duna Debrecenen folyik át.|0
foldrajz|Ausztria fővárosa Bécs.|1
foldrajz|Ázsia a legkisebb kontinens.|0
foldrajz|A Szahara Afrikában van.|1
foldrajz|Az iránytű nyila északra mutat.|1
foldrajz|A Csendes-óceán a legnagyobb óceán.|1
foldrajz|Olaszország fővárosa Milánó.|0
foldrajz|Az Egyenlítő a Földet északi és déli félgömbre osztja.|1
foldrajz|Franciaország fővárosa Párizs.|1
foldrajz|A Tisza Szegeden folyik át.|1
foldrajz|Magyarországnak van tengerpartja.|0
tortenelem|Első királyunk Szent István volt.|1
tortenelem|A mohácsi csata 1526-ban volt.|1
tortenelem|Az 1848-as forradalom március 15-én tört ki.|1
tortenelem|Mátyás királyt igazságosnak nevezték.|1
tortenelem|Egerben Dobó István védte a várat 1552-ben.|1
tortenelem|A piramisokat a rómaiak építették.|0
tortenelem|A honfoglalás 895 körül történt.|1
tortenelem|Kolumbusz 1492-ben érte el Amerikát.|1
tortenelem|Széchenyi Istvánt „a legnagyobb magyar”-nak nevezték.|1
tortenelem|A Lánchíd Debrecenben áll.|0
irodalom|A Toldit Arany János írta.|1
irodalom|A János vitézt Petőfi Sándor írta.|1
irodalom|A Himnuszt Vörösmarty Mihály írta.|0
irodalom|A Szózatot Vörösmarty Mihály írta.|1
irodalom|Az Egri csillagokat Gárdonyi Géza írta.|1
irodalom|A Pál utcai fiúkat Jókai Mór írta.|0
irodalom|Vuk egy kisróka.|1
irodalom|A rím sorvégi hangzásbeli egyezés.|1
irodalom|Lúdas Matyi háromszor veri vissza Döbrögit.|1
irodalom|Hamupipőke az üvegcipőjét veszíti el.|1
termeszet|A Föld a Nap körül kering.|1
termeszet|A bálna hal.|0
termeszet|A pingvin madár.|1
termeszet|A pók rovar.|0
termeszet|A rovaroknak hat lábuk van.|1
termeszet|A Hold saját fényével világít.|0
termeszet|A víz 0 °C-on fagy meg.|1
termeszet|A denevér emlős.|1
termeszet|A Jupiter a Naprendszer legnagyobb bolygója.|1
termeszet|A Mars a „kék bolygó”.|0
termeszet|A növények a fotoszintézis során oxigént termelnek.|1
termeszet|A béka hüllő.|0
termeszet|A szív a vért pumpálja.|1
termeszet|A gepárd a leggyorsabb szárazföldi állat.|1
termeszet|A mágnes a fát magához vonzza.|0
termeszet|Az ebihal a béka lárvája.|1
termeszet|A víz 100 °C-on forr (normál légnyomáson).|1
termeszet|A Merkúr a Naphoz legközelebbi bolygó.|1
matek|Egy hétben 7 nap van.|1
matek|Egy évben 12 hónap van.|1
matek|A háromszögnek négy oldala van.|0
matek|7 × 8 = 56|1
matek|9 × 6 = 56|0
matek|A 12 páros szám.|1
matek|A 9 prímszám.|0
matek|A 13 prímszám.|1
matek|A négyzet minden oldala egyenlő.|1
matek|A derékszög 90 fokos.|1
matek|Egy óra 100 perc.|0
matek|Egy kilogramm 1000 gramm.|1
matek|A kör átmérője a sugár kétszerese.|1
matek|Egy tucat 10 darab.|0
matek|A szökőév 366 napos.|1
nyelvtan|Az „asztal” főnév.|1
nyelvtan|A „fut” melléknév.|0
nyelvtan|A „piros” melléknév.|1
nyelvtan|A kérdő mondat végén kérdőjel áll.|1
nyelvtan|Az „a” mássalhangzó.|0
nyelvtan|A magyar ábécé „a” betűvel kezdődik.|1
nyelvtan|Az „öt” számnév.|1
nyelvtan|Az „én” névmás.|1
nyelvtan|Minden mondat kisbetűvel kezdődik.|0
muveszet|A hegedű vonós hangszer.|1
muveszet|A dob fúvós hangszer.|0
muveszet|A Mona Lisát Leonardo da Vinci festette.|1
muveszet|Bartók Béla zeneszerző volt.|1
muveszet|A sakkban van király és vezér.|1
muveszet|Az olimpiát minden évben megrendezik.|0
muveszet|Puskás Ferenc az Aranycsapat tagja volt.|1`;

export const STATEMENTS = RAW_TF.split('\n').map((l) => { const [topic, text, v] = l.split('|'); return { topic, text, value: v === '1' }; });

// ---------------------------------------------------------------- csoportosítás
export const GROUP_SETS = [
  { topic: 'termeszet', title: 'Állatosztályok', text: 'Emlős: bálna, kutya, denevér, ló, delfin, mókus\nMadár: sas, pingvin, veréb, strucc, gólya, bagoly\nHal: ponty, cápa, harcsa, csuka, pisztráng\nHüllő: gyík, kígyó, krokodil, teknős' },
  { topic: 'nyelvtan', title: 'Szófajok', text: 'Ige: fut, olvas, alszik, ír, énekel\nFőnév: asztal, kutya, Budapest, ház, ceruza\nMelléknév: piros, nagy, gyors, okos, szép\nSzámnév: öt, sok, harmadik, tíz, kevés' },
  { topic: 'info', title: 'Számítógépes eszközök', text: 'Beviteli eszköz: egér, billentyűzet, mikrofon, szkenner, webkamera\nKimeneti eszköz: monitor, nyomtató, hangszóró, projektor, fejhallgató\nHáttértár: pendrive, merevlemez, SSD, memóriakártya' },
  { topic: 'foldrajz', title: 'Fővárosok kontinensenként', text: 'Európa: Párizs, Berlin, Róma, Madrid, Budapest\nÁzsia: Tokió, Peking, Újdelhi, Szöul\nAfrika: Kairó, Nairobi, Rabat\nAmerika: Washington, Ottawa, Brazíliaváros, Mexikóváros' },
  { topic: 'termeszet', title: 'Halmazállapotok', text: 'Szilárd: jég, kő, vas, fa, só\nFolyékony: víz, tej, olaj, méz\nLégnemű: gőz, oxigén, levegő, szén-dioxid' },
  { topic: 'matek', title: 'Páros és páratlan', text: 'Páros: 2, 8, 14, 20, 36, 48\nPáratlan: 3, 9, 15, 21, 27, 45' },
  { topic: 'matek', title: 'Síkidomok és testek', text: 'Síkidom: háromszög, négyzet, kör, téglalap, trapéz\nTest: kocka, gömb, henger, gúla, kúp' },
  { topic: 'termeszet', title: 'Évszakok hónapjai', text: 'Tél: december, január, február\nTavasz: március, április, május\nNyár: június, július, augusztus\nŐsz: szeptember, október, november' },
  { topic: 'muveszet', title: 'Hangszercsaládok', text: 'Vonós: hegedű, cselló, brácsa, nagybőgő\nFúvós: furulya, trombita, fuvola, klarinét\nÜtős: dob, cintányér, xilofon, triangulum' },
  { topic: 'termeszet', title: 'Gyümölcs vagy zöldség', text: 'Gyümölcs: alma, körte, szilva, cseresznye, barack\nZöldség: répa, krumpli, káposzta, hagyma, karfiol' },
  { topic: 'tortenelem', title: 'Korszakok', text: 'Ókor: piramis, fáraó, gladiátor, olimpiai játékok\nKözépkor: lovag, vár, kódex, céh\nÚjkor: gőzgép, vasút, könyvnyomtatás, felfedezések' },
  { topic: 'irodalom', title: 'Szerzők és műveik', text: 'Petőfi Sándor: János vitéz, Nemzeti dal, Szeptember végén\nArany János: Toldi, A walesi bárdok, Családi kör\nGárdonyi Géza: Egri csillagok, A láthatatlan ember' },
];

// ---------------------------------------------------------------- mondatok (szómágnes)
export const SENTENCES = [
  ['termeszet', 'A Föld a Nap körül kering.'], ['termeszet', 'A bálna a tengerben élő emlős.'], ['termeszet', 'A méhek mézet készítenek.'],
  ['termeszet', 'A növények napfény segítségével táplálkoznak.'], ['termeszet', 'A béka ebihalból fejlődik.'], ['termeszet', 'Ősszel lehullanak a falevelek.'],
  ['termeszet', 'A víz nulla fokon megfagy.'], ['termeszet', 'A Hold a Föld körül kering.'], ['termeszet', 'A pók nyolc lábon jár.'],
  ['foldrajz', 'A Duna Budapesten folyik át.'], ['foldrajz', 'Magyarország fővárosa Budapest.'], ['foldrajz', 'A Balaton Közép-Európa legnagyobb tava.'],
  ['foldrajz', 'Az iránytű északra mutat.'], ['foldrajz', 'A Kékes hazánk legmagasabb pontja.'], ['foldrajz', 'A Szahara Afrikában található.'],
  ['tortenelem', 'Szent István volt az első királyunk.'], ['tortenelem', 'A magyarok 895 körül foglalták el a Kárpát-medencét.'],
  ['tortenelem', 'Mátyás királyt igazságosnak nevezték.'], ['tortenelem', 'Dobó István megvédte Eger várát.'], ['tortenelem', 'A forradalom március tizenötödikén tört ki.'],
  ['irodalom', 'Petőfi Sándor írta a János vitézt.'], ['irodalom', 'Arany János írta a Toldit.'], ['irodalom', 'Vuk egy bátor kisróka.'],
  ['irodalom', 'A mese csodás elemeket tartalmaz.'], ['irodalom', 'Nemecsek a Pál utcai fiúk hőse.'],
  ['matek', 'A háromszögnek három oldala van.'], ['matek', 'Egy órában hatvan perc van.'], ['matek', 'A négyzet minden oldala egyenlő.'],
  ['matek', 'Egy évben tizenkét hónap van.'], ['matek', 'Hétszer nyolc az ötvenhat.'],
  ['nyelvtan', 'A mondat nagybetűvel kezdődik.'], ['nyelvtan', 'A kérdő mondat végén kérdőjel áll.'], ['nyelvtan', 'Az ige cselekvést jelöl.'],
  ['info', 'Az egér a számítógép mutatóeszköze.'], ['info', 'A jelszót senkinek se mondd el.'], ['info', 'A monitor képet jelenít meg.'],
  ['info', 'Egy bájt nyolc bitből áll.'], ['info', 'A böngészővel weboldalakat nyitunk meg.'], ['info', 'A vírusirtó védi a számítógépet.'],
  ['info', 'Mentsd el gyakran a munkádat!'], ['info', 'A nyomtató papírra nyomtat.'], ['info', 'A program utasítások sorozata.'],
  ['muveszet', 'Bartók Béla világhírű zeneszerző volt.'], ['muveszet', 'A hegedűt vonóval szólaltatjuk meg.'], ['muveszet', 'A sakkban a királyt kell mattolni.'],
].map(([topic, s]) => ({ topic, s }));

// ---------------------------------------------------------------- képes kvíz (emoji alapú képek)
export const EMOJI = [
  ['🐘', 'Elefánt', 'állat'], ['🦒', 'Zsiráf', 'állat'], ['🦁', 'Oroszlán', 'állat'], ['🐧', 'Pingvin', 'állat'], ['🐢', 'Teknős', 'állat'],
  ['🦊', 'Róka', 'állat'], ['🐝', 'Méh', 'állat'], ['🦋', 'Pillangó', 'állat'], ['🐬', 'Delfin', 'állat'], ['🐸', 'Béka', 'állat'],
  ['🦉', 'Bagoly', 'állat'], ['🐿️', 'Mókus', 'állat'], ['🦔', 'Sün', 'állat'], ['🐄', 'Tehén', 'állat'], ['🦀', 'Rák', 'állat'],
  ['🍎', 'Alma', 'étel'], ['🍌', 'Banán', 'étel'], ['🍇', 'Szőlő', 'étel'], ['🍓', 'Eper', 'étel'], ['🥕', 'Répa', 'étel'],
  ['🍉', 'Görögdinnye', 'étel'], ['🍞', 'Kenyér', 'étel'], ['🧀', 'Sajt', 'étel'], ['🌽', 'Kukorica', 'étel'],
  ['🖥️', 'Monitor', 'eszköz'], ['⌨️', 'Billentyűzet', 'eszköz'], ['🖱️', 'Egér', 'eszköz'], ['🖨️', 'Nyomtató', 'eszköz'], ['💻', 'Laptop', 'eszköz'],
  ['📱', 'Okostelefon', 'eszköz'], ['🎧', 'Fejhallgató', 'eszköz'], ['📷', 'Fényképezőgép', 'eszköz'], ['🔋', 'Akkumulátor', 'eszköz'], ['💾', 'Floppy', 'eszköz'],
  ['🚲', 'Kerékpár', 'jármű'], ['🚂', 'Mozdony', 'jármű'], ['✈️', 'Repülőgép', 'jármű'], ['🚁', 'Helikopter', 'jármű'], ['🚢', 'Hajó', 'jármű'], ['🚀', 'Rakéta', 'jármű'],
  ['🌋', 'Vulkán', 'természet'], ['🌈', 'Szivárvány', 'természet'], ['⛄', 'Hóember', 'természet'], ['🌵', 'Kaktusz', 'természet'], ['🌙', 'Hold', 'természet'], ['⚡', 'Villám', 'természet'],
  ['🎻', 'Hegedű', 'hangszer'], ['🥁', 'Dob', 'hangszer'], ['🎹', 'Zongora', 'hangszer'], ['🎺', 'Trombita', 'hangszer'], ['🎸', 'Gitár', 'hangszer'],
  ['⚽', 'Futball', 'sport'], ['🏀', 'Kosárlabda', 'sport'], ['🎾', 'Tenisz', 'sport'], ['♟️', 'Sakk', 'sport'], ['🏊', 'Úszás', 'sport'],
].map(([e, a, cat]) => ({ e, a, cat }));

const EMOJI_Q = { 'állat': 'Melyik állat ez?', 'étel': 'Mi látható a képen?', 'eszköz': 'Mi ez az eszköz?', 'jármű': 'Melyik jármű ez?', 'természet': 'Mi látható a képen?', 'hangszer': 'Melyik hangszer ez?', 'sport': 'Melyik sporthoz tartozik?' };

// ---------------------------------------------------------------- megfejtések keresztrejtvényhez
export const SOLUTIONS = ['TUDÁSBAJNOK', 'SZÁMÍTÓGÉP', 'NAPRENDSZER', 'OKOS VAGY', 'IRODALOM', 'FÖLDRAJZ', 'INFORMATIKA', 'HONFOGLALÁS', 'BALATON',
  'KÖNYVTÁR', 'SZORGALOM', 'BARÁTSÁG', 'ISKOLA', 'TANULÁS', 'VAKÁCIÓ', 'ÜGYES VAGY', 'SZÉP MUNKA', 'GRATULÁLOK', 'KITARTÁS', 'KÍVÁNCSISÁG',
  'BUDAPEST', 'MATEMATIKA', 'TERMÉSZET', 'TÖRTÉNELEM', 'ALGORITMUS', 'BILLENTYŰZET', 'PROGRAMOZÁS', 'OSZTÁLYTEREM', 'TUDOMÁNY', 'FELFEDEZÉS'];

// ================================================================= generálás
function rng(seed = Math.floor(Math.random() * 2 ** 31)) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function pick(arr, n, rnd) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, n);
}
const byTopic = (list, topic) => (topic && topic !== 'mix' ? list.filter((x) => x.topic === topic) : list);
const letters = (s) => [...s].filter((ch) => /\p{L}/u.test(ch)).length;
const topicLabel = (t) => TOPICS[t] || 'Vegyes';

/** Párok szűréssel (pl. szókeresőhöz csak rövid, egyszavas válaszok). */
export function testPairs(n, topic = 'mix', { maxLetters = 99, singleWord = false, rnd = rng() } = {}) {
  const pool = byTopic(PAIRS, topic).filter((p) => letters(p.a) <= maxLetters && (!singleWord || !/[\s-]/.test(p.a)));
  return pick(pool, n, rnd);
}

/** Feleletválasztós kérdések a párokból: a rossz válaszok ugyanabból a témából jönnek. */
export function testMcq(n, topic = 'mix', rnd = rng()) {
  return testPairs(n, topic, { rnd }).map((p) => {
    const others = PAIRS.filter((x) => x.topic === p.topic && x.a !== p.a);
    return { q: p.b, correct: p.a, wrong: pick(others, 3, rnd).map((x) => x.a) };
  });
}

const pairsText = (list) => list.map((p) => `${p.a} - ${p.b}`).join('\n');

/**
 * Tesztadatok egy minijátékhoz (a szerkesztő "raw" formátumában).
 * @returns {{title:string, raw:object}}
 */
export function testActivity(game, format, topic = 'mix', seed) {
  const rnd = rng(seed);
  const t = topicLabel(topic);
  if (format === 'pairs') {
    const opts = {
      wordsearch: { n: 12, maxLetters: 11, singleWord: true },
      memory: { n: 10, maxLetters: 16 },
      hangman: { n: 10, maxLetters: 14 },
      spell: { n: 10, maxLetters: 12, singleWord: true },
      pairornot: { n: 12 },
      type: { n: 15 },
    }[game] || { n: 15 };
    return { title: `Teszt – ${t}`, raw: { text: pairsText(testPairs(opts.n, topic, { ...opts, rnd })) } };
  }
  if (format === 'truefalse') {
    return { title: `Igaz vagy hamis – ${t}`, raw: { text: pick(byTopic(STATEMENTS, topic), 15, rnd).map((s) => `${s.text} - ${s.value ? 'igaz' : 'hamis'}`).join('\n') } };
  }
  if (format === 'groups') {
    const sets = byTopic(GROUP_SETS, topic);
    const set = pick(sets.length ? sets : GROUP_SETS, 1, rnd)[0];
    return { title: set.title, raw: { text: set.text } };
  }
  if (format === 'sentences') {
    const pool = byTopic(SENTENCES, topic);
    return { title: `Szómágnes – ${t}`, raw: { text: pick(pool.length >= 4 ? pool : SENTENCES, 8, rnd).map((x) => x.s).join('\n') } };
  }
  if (format === 'mcq') {
    return { title: `Kvíz – ${t}`, raw: { text: testMcq(10, topic, rnd).map((q) => [q.q, q.correct, ...q.wrong].join(' | ')).join('\n') } };
  }
  return null; // képes formátumokat a szerkesztő rajzolja (testImageQuiz / DIAGRAMS)
}

/** Képes kvíz kérdései emojikból: a rossz válaszok ugyanabból a kategóriából. */
export function testImageQuiz(n = 8, seed) {
  const rnd = rng(seed);
  return pick(EMOJI, n, rnd).map((x) => {
    const others = EMOJI.filter((y) => y.cat === x.cat && y.a !== x.a);
    return { emoji: x.e, text: [EMOJI_Q[x.cat], x.a, ...pick(others, 3, rnd).map((y) => y.a)].join(' | ') };
  });
}

/** Tesztrejtvény adatai: cím, megfejtés, szólista. */
export function testCrossword(topic = 'mix', seed) {
  const rnd = rng(seed);
  return {
    title: `Tesztrejtvény – ${topicLabel(topic)}`,
    solution: pick(SOLUTIONS, 1, rnd)[0],
    entries: testPairs(80, topic, { maxLetters: 14, rnd }),
    rnd,
  };
}

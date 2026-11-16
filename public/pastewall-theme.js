// Téma beállítása még a rajzolás előtt (ne villanjon fel a világos téma).
// Külön fájlban van, mert a kopidev.hu szigorú CSP-je tiltja a beágyazott szkriptet.
try {
  var t = localStorage.getItem('pastewall.theme');
  document.documentElement.dataset.theme = t || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
} catch (e) {}

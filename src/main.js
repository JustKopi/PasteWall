import './styles.css';
import { h } from './ui/dom.js';
import { isOnline } from './config.js';
import { homePage } from './ui/home.js';
import { editorPage } from './ui/editor.js';
import { hostPage } from './ui/host.js';
import { miniHostPage } from './ui/minihostpage.js';
import { gameEditorPage } from './ui/gameeditor.js';
import { joinPage, playPage } from './ui/play.js';

const app = document.getElementById('app');

// ---- téma (világos / sötét), a választás megmarad ----
const savedTheme = localStorage.getItem('pastewall.theme');
const theme = () => document.documentElement.dataset.theme || 'light';
function setTheme(t) {
  document.documentElement.dataset.theme = t;
  themeBtn.textContent = t === 'dark' ? '☀️' : '🌙';
  themeBtn.title = t === 'dark' ? 'Világos mód' : 'Sötét mód';
}
const themeBtn = h('button', { class: 'btn ghost theme-btn', onclick: () => { const t = theme() === 'dark' ? 'light' : 'dark'; localStorage.setItem('pastewall.theme', t); setTheme(t); } });
setTheme(savedTheme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
export const topbar = h('div', { class: 'topbar' }, themeBtn);
document.body.insertBefore(topbar, app);
let cleanup = null;

function route() {
  cleanup?.();
  cleanup = null;
  window.scrollTo(0, 0);
  const [, page = '', arg = '', arg2 = ''] = location.hash.split('/');
  const code = arg.toUpperCase();
  if (page === 'edit') cleanup = editorPage(app, arg || null);
  else if (page === 'game' && arg) cleanup = gameEditorPage(app, arg, arg2 || null);
  else if (page === 'host' && code) {
    const cfg = JSON.parse(sessionStorage.getItem(`pastewall.host.${code}`) || 'null');
    cleanup = cfg?.kind === 'mini' ? miniHostPage(app, code) : hostPage(app, code);
  }
  else if (page === 'play' && code) cleanup = playPage(app, code);
  else if (page === 'join') cleanup = joinPage(app, code);
  else cleanup = homePage(app);
}

if (!isOnline()) {
  document.body.prepend(h('div', { class: 'demo-banner' },
    'Demó mód: nincs beállítva szerver, ezért a játék csak ezen a gépen, több böngészőfülön próbálható ki.'));
}

// Frissítés-ellenőrzés: ha a böngésző régi változatot tart a gyorsítótárban, újratöltünk.
// (Különben a tanári gép és a telefonok eltérő változatot futtathatnak, és nem látják egymást.)
async function checkForUpdate() {
  if (!import.meta.env.PROD) return;
  try {
    const res = await fetch(`./index.html?v=${Date.now()}`, { cache: 'no-store' });
    const latest = (await res.text()).match(/assets\/index-[\w-]+\.js/)?.[0];
    const current = document.querySelector('script[type="module"][src*="assets/index-"]')?.getAttribute('src')?.match(/assets\/index-[\w-]+\.js/)?.[0];
    if (!latest || !current || latest === current) return;
    const key = `pastewall.reloadedFor.${latest}`;
    if (sessionStorage.getItem(key)) return; // egyszer próbáljuk, nehogy végtelen ciklus legyen
    sessionStorage.setItem(key, '1');
    location.reload();
  } catch {
    // offline vagy hiba: maradunk a jelenlegi változaton
  }
}

window.addEventListener('hashchange', route);
route();
checkForUpdate();

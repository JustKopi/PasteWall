import './styles.css';
import { h } from './ui/dom.js';
import { isOnline } from './config.js';
import { homePage } from './ui/home.js';
import { editorPage } from './ui/editor.js';
import { hostPage } from './ui/host.js';
import { joinPage, playPage } from './ui/play.js';

const app = document.getElementById('app');
let cleanup = null;

function route() {
  cleanup?.();
  cleanup = null;
  window.scrollTo(0, 0);
  const [, page = '', arg = ''] = location.hash.split('/');
  const code = arg.toUpperCase();
  if (page === 'edit') cleanup = editorPage(app, arg || null);
  else if (page === 'host' && code) cleanup = hostPage(app, code);
  else if (page === 'play' && code) cleanup = playPage(app, code);
  else if (page === 'join') cleanup = joinPage(app, code);
  else cleanup = homePage(app);
}

if (!isOnline()) {
  document.body.prepend(h('div', { class: 'demo-banner' },
    'Demó mód: nincs beállítva szerver, ezért a játék csak ezen a gépen, több böngészőfülön próbálható ki.'));
}

window.addEventListener('hashchange', route);
route();

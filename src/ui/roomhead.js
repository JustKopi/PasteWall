// Szoba fejléce a tanári oldalhoz: kód, belépési link, QR-kód (teljes képernyőn is), élő létszám.
import QRCode from 'qrcode';
import { h, fill } from './dom.js';

/**
 * @param {string} code
 * @param {()=>{name:string,color:string,online:boolean}[]} getPlayers
 */
export function createRoomHead(code, getPlayers) {
  const joinUrl = `${location.origin}${location.pathname}#/play/${code}`;
  const status = h('span', { class: 'conn' }, 'Kapcsolódás…');
  const titleLine = h('div', { class: 'muted' });
  const qr = h('img', { class: 'qr clickable', alt: 'QR-kód a belépéshez', title: 'Kattints a teljes képernyőhöz', onclick: () => showQrFull() });
  QRCode.toDataURL(joinUrl, { margin: 1, width: 220 }).then((u) => { qr.src = u; });
  let qrCount = null;

  function renderCount() {
    if (!qrCount) return;
    const online = getPlayers().filter((p) => p.online);
    fill(qrCount,
      h('div', { class: 'qr-count-num' }, `👥 ${online.length}`, h('span', {}, ' játékos bent')),
      h('div', { class: 'chips' }, online.slice(-40).map((p) => h('span', { class: 'chip', style: { background: p.color } }, p.name))));
  }

  function showQrFull() {
    const big = h('img', { class: 'qr-big-img', alt: 'QR-kód' });
    QRCode.toDataURL(joinUrl, { margin: 1, width: 900 }).then((u) => { big.src = u; });
    const close = () => {
      document.removeEventListener('keydown', onKey);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      overlay.remove();
      qrCount = null;
    };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    const overlay = h('div', { class: 'qr-overlay', onclick: close },
      h('div', { class: 'qr-big' }, big,
        h('div', { class: 'qr-side' },
          h('div', { class: 'muted' }, 'Olvasd be a telefonoddal, vagy írd be a kódot:'),
          h('div', { class: 'room-code huge' }, code),
          h('div', { class: 'join-line' }, joinUrl.replace(/^https?:\/\//, '').replace(/#.*$/, '')),
          (qrCount = h('div', { class: 'qr-count' })),
          h('div', { class: 'muted small' }, 'Bezárás: kattintás vagy Esc'))));
    document.addEventListener('keydown', onKey);
    document.body.append(overlay);
    renderCount();
    overlay.requestFullscreen?.().catch(() => {});
  }

  const el = h('header', { class: 'host-head' },
    h('div', {},
      titleLine,
      h('div', { class: 'join-line' }, 'Belépés: ', h('strong', {}, joinUrl.replace(/^https?:\/\//, '')), ' · kód: '),
      h('div', { class: 'room-code' }, code),
      status),
    h('div', { class: 'qr-wrap' }, qr, h('button', { class: 'btn ghost small', onclick: showQrFull }, '⛶ Teljes képernyő')));

  return {
    el, status, titleLine, renderCount,
    destroy() { document.querySelector('.qr-overlay')?.remove(); },
  };
}

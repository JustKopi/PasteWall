// Rajzolt tesztképek (képes kvízhez és ábracímkézőhöz), hogy fájl feltöltése nélkül is legyen tartalom.

const W = 480;
const H = 360;
function canvas(w = W, h = H) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}
const BG = ['#dff3ff', '#fff3c4', '#e6ffe9', '#ffe4ef', '#ece6ff', '#ffe9d6'];

export function emojiImage(emoji, k = 0) {
  const [c, x] = canvas(480, 320);
  x.fillStyle = BG[k % BG.length]; x.fillRect(0, 0, 480, 320);
  x.font = '200px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(emoji, 240, 175);
  return c.toDataURL('image/jpeg', 0.8);
}

/** A növény részei. */
function plant() {
  const [c, x] = canvas(480, 420);
  x.fillStyle = '#eaf6ff'; x.fillRect(0, 0, 480, 300);
  x.fillStyle = '#8b5a2b'; x.fillRect(0, 300, 480, 120);
  x.strokeStyle = '#5a3a1a'; x.lineWidth = 4;
  x.beginPath(); x.moveTo(240, 300); x.lineTo(200, 400); x.moveTo(240, 300); x.lineTo(285, 405); x.moveTo(240, 300); x.lineTo(240, 410); x.stroke();
  x.strokeStyle = '#2e8b2e'; x.lineWidth = 10; x.beginPath(); x.moveTo(240, 300); x.lineTo(240, 120); x.stroke();
  x.fillStyle = '#3bb273';
  x.beginPath(); x.ellipse(290, 220, 50, 20, -0.5, 0, Math.PI * 2); x.fill();
  x.beginPath(); x.ellipse(190, 250, 50, 20, 0.5, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#f25f9a';
  for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; x.beginPath(); x.ellipse(240 + Math.cos(a) * 32, 100 + Math.sin(a) * 32, 22, 14, a, 0, Math.PI * 2); x.fill(); }
  x.fillStyle = '#ffc914'; x.beginPath(); x.arc(240, 100, 20, 0, Math.PI * 2); x.fill();
  return { title: 'A növény részei', image: c.toDataURL('image/jpeg', 0.85), labels: [{ text: 'virág', x: 50, y: 24 }, { text: 'levél', x: 60.4, y: 52.4 }, { text: 'szár', x: 50, y: 45 }, { text: 'gyökér', x: 50, y: 88 }] };
}

/** A Naprendszer bolygói sorban. */
function solar() {
  const [c, x] = canvas(640, 260);
  x.fillStyle = '#0d1033'; x.fillRect(0, 0, 640, 260);
  for (let i = 0; i < 90; i++) { x.fillStyle = `rgba(255,255,255,${0.3 + Math.random() * 0.6})`; x.fillRect(Math.random() * 640, Math.random() * 260, 1.5, 1.5); }
  x.fillStyle = '#ffcc33'; x.beginPath(); x.arc(-20, 130, 90, 0, Math.PI * 2); x.fill();
  const planets = [['Merkúr', 105, 6, '#b3a89a'], ['Vénusz', 145, 10, '#e8c27a'], ['Föld', 190, 11, '#3a7bd5'], ['Mars', 232, 8, '#d0542c'],
    ['Jupiter', 305, 26, '#d8a874'], ['Szaturnusz', 395, 21, '#e3cf8f'], ['Uránusz', 475, 15, '#9fe3e8'], ['Neptunusz', 550, 15, '#3f5fd8']];
  for (const [name, px, r, col] of planets) {
    x.fillStyle = col; x.beginPath(); x.arc(px, 130, r, 0, Math.PI * 2); x.fill();
    if (name === 'Szaturnusz') { x.strokeStyle = '#f2e3b0'; x.lineWidth = 3; x.beginPath(); x.ellipse(px, 130, r * 1.8, r * 0.5, -0.3, 0, Math.PI * 2); x.stroke(); }
  }
  return {
    title: 'A Naprendszer bolygói', image: c.toDataURL('image/jpeg', 0.85),
    labels: planets.map(([name, px, r], k) => ({ text: name, x: Math.round((px / 640) * 1000) / 10, y: k % 2 ? 78 : 22 })),
  };
}

/** Égtájak. */
function compass() {
  const [c, x] = canvas(400, 400);
  x.fillStyle = '#fffaf0'; x.fillRect(0, 0, 400, 400);
  x.strokeStyle = '#2b2d42'; x.lineWidth = 6; x.beginPath(); x.arc(200, 200, 140, 0, Math.PI * 2); x.stroke();
  const star = (ang, col) => { x.fillStyle = col; x.beginPath(); x.moveTo(200, 200); x.lineTo(200 + Math.cos(ang - 0.18) * 40, 200 + Math.sin(ang - 0.18) * 40); x.lineTo(200 + Math.cos(ang) * 130, 200 + Math.sin(ang) * 130); x.lineTo(200 + Math.cos(ang + 0.18) * 40, 200 + Math.sin(ang + 0.18) * 40); x.fill(); };
  star(-Math.PI / 2, '#e4572e'); star(Math.PI / 2, '#2b2d42'); star(0, '#2b2d42'); star(Math.PI, '#2b2d42');
  return { title: 'Égtájak', image: c.toDataURL('image/jpeg', 0.85), labels: [{ text: 'észak', x: 50, y: 8 }, { text: 'dél', x: 50, y: 92 }, { text: 'kelet', x: 92, y: 50 }, { text: 'nyugat', x: 8, y: 50 }] };
}

/** Asztali számítógép részei. */
function computer() {
  const [c, x] = canvas(560, 380);
  x.fillStyle = '#eef3fb'; x.fillRect(0, 0, 560, 380);
  x.fillStyle = '#c7b299'; x.fillRect(0, 300, 560, 80);
  x.fillStyle = '#2b2d42'; x.fillRect(150, 50, 260, 170); x.fillStyle = '#7fc6ff'; x.fillRect(162, 62, 236, 146);
  x.fillStyle = '#2b2d42'; x.fillRect(268, 220, 24, 40); x.fillRect(230, 258, 100, 12);
  x.fillStyle = '#444'; x.fillRect(450, 110, 80, 190); x.fillStyle = '#7bd389'; x.beginPath(); x.arc(490, 140, 6, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#555'; x.fillRect(150, 300, 250, 34); x.fillStyle = '#ddd';
  for (let r = 0; r < 3; r++) for (let k = 0; k < 14; k++) x.fillRect(158 + k * 17, 304 + r * 10, 13, 7);
  x.fillStyle = '#555'; x.beginPath(); x.ellipse(440, 320, 18, 26, 0, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#3a3a3a'; x.fillRect(60, 120, 46, 100); x.fillRect(80, 220, 6, 80);
  return {
    title: 'A számítógép részei', image: c.toDataURL('image/jpeg', 0.85),
    labels: [{ text: 'monitor', x: 50, y: 36 }, { text: 'gépház', x: 87.5, y: 55 }, { text: 'billentyűzet', x: 49.5, y: 83 }, { text: 'egér', x: 78.5, y: 84 }, { text: 'hangszóró', x: 15, y: 45 }],
  };
}

export const DIAGRAMS = [plant, solar, compass, computer];

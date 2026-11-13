import { h } from './dom.js';

/**
 * Keresztrejtvény-rács kirajzolása.
 * @param {any} pub  publicView() eredménye (vagy teljes puzzle)
 * @param {object} o
 * @param {(r:number,c:number)=>({text?:string, cls?:string, color?:string}|null)} [o.cell]
 * @param {(r:number)=>({cls?:string, tag?:{name:string,color:string}}|null)} [o.row]
 * @param {(r:number)=>void} [o.onRow]
 */
export function renderGrid(pub, o = {}) {
  const grid = h('div', { class: 'cw-grid', style: { '--cols': pub.width } });
  const bandAt = (r, c) => pub.bands.findIndex((b) => b.col === c && r >= (b.rowStart || 0) && r < (b.rowStart || 0) + b.length);
  for (let r = 0; r < pub.height; r++) {
    const row = pub.rows[r];
    const rowInfo = o.row?.(r) || {};
    const line = h('div', {
      class: `cw-row ${rowInfo.cls || ''} ${o.onRow ? 'clickable' : ''}`,
      onclick: o.onRow ? () => o.onRow(r) : null,
      'data-row': r,
    });
    line.append(h('div', { class: 'cw-num' }, `${r + 1}.`));
    for (let c = 0; c < pub.width; c++) {
      const inWord = c >= row.start && c < row.start + row.length;
      if (!inWord) { line.append(h('div', { class: 'cw-cell empty' })); continue; }
      const band = bandAt(r, c);
      const info = o.cell?.(r, c) || {};
      line.append(
        h('div', {
          class: `cw-cell ${band >= 0 ? `band band-${band}` : ''} ${info.cls || ''}`,
          style: info.color ? { '--who': info.color } : null,
        }, info.text || ''),
      );
    }
    if (rowInfo.tag) {
      line.append(h('div', { class: 'cw-tag', style: { background: rowInfo.tag.color } }, rowInfo.tag.name));
    }
    grid.append(line);
  }
  return grid;
}

export function renderClues(pub, o = {}) {
  if (pub.type === 'free') {
    const item = (r) => h('li', {
      class: `${o.cls?.(r.row) || ''} ${o.onRow ? 'clickable' : ''}`,
      onclick: o.onRow ? () => o.onRow(r.row) : null,
    }, h('strong', { class: 'num' }, `${r.num}. `), h('span', { class: 'clue-text' }, r.clue || h('em', {}, '(nincs meghatározás)')), h('span', { class: 'len' }, ` (${r.length})`));
    const across = pub.rows.filter((r) => r.dir === 'across');
    const down = pub.rows.filter((r) => r.dir === 'down');
    return h('div', { class: 'clues-free' },
      h('div', {}, h('h4', {}, '→ Vízszintes'), h('ul', { class: 'clues' }, across.map(item))),
      h('div', {}, h('h4', {}, '↓ Függőleges'), h('ul', { class: 'clues' }, down.map(item))));
  }
  return h('ol', { class: 'clues' },
    pub.rows.map((r) => h('li', {
      class: `${o.cls?.(r.row) || ''} ${o.onRow ? 'clickable' : ''}`,
      onclick: o.onRow ? () => o.onRow(r.row) : null,
    }, h('span', { class: 'clue-text' }, r.clue || h('em', {}, '(nincs meghatározás)')), h('span', { class: 'len' }, ` (${r.length})`))),
  );
}

/**
 * Tartós rács: egyszer épül fel, utána csak a változó cellák frissülnek.
 * Így a gépelés nem rajzolja újra (és nem "ugráltatja") az egész rejtvényt.
 */
export class GridView {
  constructor(pub, { onRow } = {}) {
    this.pub = pub;
    this.onRow = onRow || null;
    this.el = h('div', { class: 'cw-grid', style: { '--cols': pub.width } });
    this.rows = [];
    for (let r = 0; r < pub.height; r++) {
      const row = pub.rows[r];
      const line = h('div', { class: 'cw-row', 'data-row': r, onclick: () => this.onRow?.(r) });
      line.append(h('div', { class: 'cw-num' }, `${r + 1}.`));
      const cells = [];
      for (let c = 0; c < pub.width; c++) {
        if (c < row.start || c >= row.start + row.length) { line.append(h('div', { class: 'cw-cell empty' })); continue; }
        const band = pub.bands.findIndex((b) => b.col === c && r >= (b.rowStart || 0) && r < (b.rowStart || 0) + b.length);
        const base = `cw-cell${band >= 0 ? ` band band-${band}` : ''}`;
        const cell = h('div', { class: base });
        cell.addEventListener('animationend', () => cell.classList.remove('pop'));
        cells.push({ el: cell, base, text: '', cls: '', color: '' });
        line.append(cell);
      }
      const tag = h('div', { class: 'cw-tag', hidden: true });
      line.append(tag);
      this.rows.push({ el: line, cells, tag, cls: null, tagKey: '' });
      this.el.append(line);
    }
  }

  setClickable(on) {
    this.el.classList.toggle('rows-clickable', Boolean(on));
  }

  /**
   * @param {(r:number,i:number)=>({text?:string, cls?:string, color?:string}|null)} cell  i = a soron belüli index
   * @param {(r:number)=>({cls?:string, tag?:{name:string,color:string}}|null)} row
   */
  update(cell, row) {
    this.rows.forEach((R, r) => {
      const ri = row?.(r) || {};
      const rowCls = `cw-row ${ri.cls || ''}`;
      if (R.cls !== rowCls) { R.el.className = rowCls; R.cls = rowCls; }
      const tagKey = ri.tag ? `${ri.tag.name}|${ri.tag.color}` : '';
      if (R.tagKey !== tagKey) {
        R.tagKey = tagKey;
        R.tag.hidden = !ri.tag;
        if (ri.tag) { R.tag.textContent = ri.tag.name; R.tag.style.background = ri.tag.color; }
      }
      R.cells.forEach((C, i) => {
        const info = cell(r, i) || {};
        const text = info.text || '';
        const cls = info.cls || '';
        const color = info.color || '';
        if (C.text !== text) { C.el.textContent = text; C.text = text; }
        if (C.cls !== cls) {
          const newlySolved = /\bsolved\b/.test(cls) && !/\bsolved\b/.test(C.cls);
          C.el.className = `${C.base} ${cls}`;
          if (newlySolved) C.el.classList.add('pop');
          C.cls = cls;
        }
        if (C.color !== color) {
          if (color) C.el.style.setProperty('--who', color); else C.el.style.removeProperty('--who');
          C.color = color;
        }
      });
    });
  }
}

const PRIORITY = ['solved', 'revealed', 'draft', 'ghost'];
const rank = (cls) => { const i = PRIORITY.findIndex((p) => new RegExp(`\\b${p}\\b`).test(cls || '')); return i === -1 ? 99 : i; };

/**
 * Vegyes irányú rács (vízszintes + függőleges szavak, számozott mezők).
 * Ugyanaz az update(cell, row) felület, mint a GridView-é, így a játékoldalak mindkettőt kezelik.
 */
export class FreeGridView {
  constructor(pub, { onRow } = {}) {
    this.pub = pub;
    this.onRow = onRow || null;
    this.selectedRow = null;
    this.el = h('div', { class: 'fw-grid', style: { '--cols': pub.width, '--rowsN': pub.height } });
    this.cells = new Map(); // "r,c" -> {el, t, covers:[{row,i}], ...}
    const covers = new Map();
    for (const e of pub.rows) {
      const [dr, dc] = e.dir === 'across' ? [0, 1] : [1, 0];
      for (let i = 0; i < e.length; i++) {
        const k = `${e.r + dr * i},${e.c + dc * i}`;
        if (!covers.has(k)) covers.set(k, []);
        covers.get(k).push({ row: e.row, i });
      }
    }
    const numAt = new Map(pub.rows.map((e) => [`${e.r},${e.c}`, e.num]));
    const solAt = new Map();
    (pub.bands[0]?.cells || []).forEach((x, idx) => solAt.set(`${x.r},${x.c}`, idx + 1));
    for (let r = 0; r < pub.height; r++) {
      for (let c = 0; c < pub.width; c++) {
        const k = `${r},${c}`;
        const pos = { gridRow: `${r + 1}`, gridColumn: `${c + 1}` }; // explicit hely, hogy a címkék ne tolják el
        if (!covers.has(k)) { this.el.append(h('div', { class: 'cw-cell empty', style: pos })); continue; }
        const base = `cw-cell${solAt.has(k) ? ' band band-0' : ''}`;
        const t = h('span', { class: 'cw-t' });
        const el = h('div', { class: base, style: pos, onclick: () => this.click(k) },
          numAt.has(k) ? h('span', { class: 'cw-n' }, numAt.get(k)) : null,
          solAt.has(k) ? h('span', { class: 'cw-s' }, solAt.get(k)) : null,
          t);
        el.addEventListener('animationend', () => el.classList.remove('pop'));
        this.cells.set(k, { el, t, base, covers: covers.get(k), text: '', cls: '', color: '' });
        this.el.append(el);
      }
    }
    // névcímkék a szavak kezdőmezője fölött
    this.tags = pub.rows.map((e) => {
      const tag = h('div', { class: 'cw-tag fw-tag', hidden: true, style: { gridRow: `${e.r + 1}`, gridColumn: `${e.c + 1}` } });
      this.el.append(tag);
      return { el: tag, key: '' };
    });
  }

  click(k) {
    const cov = this.cells.get(k).covers;
    let pick = cov.find((x) => this.pub.rows[x.row].dir === 'across') || cov[0];
    if (cov.length > 1 && this.selectedRow != null && cov.some((x) => x.row === this.selectedRow)) {
      pick = cov.find((x) => x.row !== this.selectedRow) || pick; // második kattintás: a másik irány
    }
    this.onRow?.(pick.row);
  }

  setClickable(on) { this.el.classList.toggle('rows-clickable', Boolean(on)); }

  update(cell, row) {
    const rowInfo = this.pub.rows.map((e) => row?.(e.row) || {});
    this.selectedRow = rowInfo.findIndex((x) => /\bselected\b/.test(x.cls || ''));
    if (this.selectedRow === -1) this.selectedRow = null;
    for (const C of this.cells.values()) {
      let best = null;
      for (const { row: r, i } of C.covers) {
        const info = cell(r, i);
        if (info && (info.text || info.cls) && (!best || rank(info.cls) < rank(best.cls))) best = info;
      }
      const flags = [];
      if (C.covers.some(({ row: r }) => /\bselected\b/.test(rowInfo[r].cls || ''))) flags.push('in-selected');
      if (C.covers.some(({ row: r }) => /\bdone\b/.test(rowInfo[r].cls || ''))) flags.push('in-done');
      else if (C.covers.some(({ row: r }) => /\brevealed-row\b/.test(rowInfo[r].cls || ''))) flags.push('in-revealed');
      const text = best?.text || '';
      const cls = `${best?.cls || ''} ${flags.join(' ')}`.trim();
      const color = best?.color || '';
      if (C.text !== text) { C.t.textContent = text; C.text = text; }
      if (C.cls !== cls) {
        const newlySolved = /\bsolved\b/.test(cls) && !/\bsolved\b/.test(C.cls);
        C.el.className = `${C.base} ${cls}`;
        if (newlySolved) C.el.classList.add('pop');
        C.cls = cls;
      }
      if (C.color !== color) {
        if (color) C.el.style.setProperty('--who', color); else C.el.style.removeProperty('--who');
        C.color = color;
      }
    }
    this.tags.forEach((T, r) => {
      const tag = rowInfo[r].tag;
      const k = tag ? `${tag.name}|${tag.color}` : '';
      if (T.key === k) return;
      T.key = k;
      T.el.hidden = !tag;
      if (tag) { T.el.textContent = tag.name; T.el.style.background = tag.color; }
    });
  }
}

export function makeGridView(pub, opts) {
  return pub.type === 'free' ? new FreeGridView(pub, opts) : new GridView(pub, opts);
}

/** A bejegyzés rövid neve a válaszpanelhez. */
export function entryLabel(pub, r) {
  const e = pub.rows[r];
  return pub.type === 'free' ? `${e.num}. ${e.dir === 'across' ? 'vízszintes' : 'függőleges'}: ` : `${r + 1}. `;
}

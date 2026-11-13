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

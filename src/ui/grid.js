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

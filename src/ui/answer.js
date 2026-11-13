// Közös válaszkezelő: közvetlen cellába írás ÉS ablakos beviteli mező, egyenrangúan.
// Mindkettő ugyanazt a vázlatot (draft) szerkeszti; ha a szó betelt, rövid szünet után
// magától beküldi (aki hamarabb beírja, azé a pont). Enter / Beküldés gomb azonnal küld.

import { h, fill, toast } from './dom.js';
import { tokenize } from '../crossword/hu.js';
import { entryLabel } from './grid.js';

const DIGRAPHS = ['DZS', 'CS', 'DZ', 'GY', 'LY', 'NY', 'SZ', 'TY', 'ZS'];
const SENTINEL = ' '; // a beviteli mezőben tartjuk, hogy a mobilos Backspace is eseményt adjon

export class AnswerController {
  /**
   * @param {object} o
   * @param {()=>any} o.getPub  az aktuális (nyilvános) rejtvény
   * @param {()=>boolean} o.canAnswer
   * @param {(row:number, tokens:string[])=>void} o.onSubmit
   * @param {(row:number, tokens:string[])=>void} [o.onTyping]
   * @param {()=>void} o.onChange  rács újrarajzolása
   * @param {number} [o.autoMs=700]
   */
  constructor(o) {
    this.o = o;
    this.autoMs = o.autoMs ?? 700;
    this.selected = null;
    this.cursor = 0;
    this.drafts = new Map(); // row -> string[]
    this.lastSent = new Map(); // row -> "A|B|C"
    this.pending = null;
    this.autoTimer = null;
    this.typingTimer = null;

    this.label = h('div', { class: 'ans-label' });
    this.text = h('input', { class: 'input big', autocomplete: 'off', autocapitalize: 'characters', spellcheck: false, placeholder: 'Válasz…' });
    this.count = h('span', { class: 'muted' });
    this.btn = h('button', { class: 'btn primary', type: 'submit' }, 'Beküldés');
    this.el = h('form', { class: 'answer card', onsubmit: (e) => { e.preventDefault(); this.submit(false); } },
      this.label, h('div', { class: 'ans-row' }, this.text, this.btn), this.count);

    // rejtett mező a közvetlen cellába íráshoz (mobilon ez hozza elő a billentyűzetet)
    this.cellInput = h('input', { class: 'cell-input', autocomplete: 'off', autocapitalize: 'characters', spellcheck: false, 'aria-label': 'Betű beírása a rejtvénybe' });
    this.cellInput.value = SENTINEL;
    document.body.append(this.cellInput);

    this.text.addEventListener('input', () => this.fromText());
    this.cellInput.addEventListener('input', () => this.fromCells());
    this.cellInput.addEventListener('keydown', (e) => this.onKey(e));
    this.cellInput.addEventListener('blur', () => this.o.onChange());
    this.cellInput.addEventListener('focus', () => this.o.onChange());
    this.render();
  }

  get pub() { return this.o.getPub(); }
  get digraphs() { return this.pub?.digraphs !== false; }
  len(row) { return this.pub.rows[row].length; }

  draft(row = this.selected) {
    if (row == null) return [];
    if (!this.drafts.has(row)) this.drafts.set(row, new Array(this.len(row)).fill(''));
    return this.drafts.get(row);
  }

  /** Sor kiválasztása; i = a kattintott cella indexe a szón belül. */
  select(row, i = null, focusCells = true) {
    if (!this.o.canAnswer()) return;
    if (this.selected !== row) {
      this.selected = row;
      const d = this.draft(row);
      this.cursor = i ?? Math.max(0, d.findIndex((t) => !t));
      if (this.cursor === -1) this.cursor = 0;
      this.syncText();
    } else if (i != null) {
      this.cursor = i;
    }
    this.render();
    this.o.onChange();
    if (focusCells) this.focusCells();
  }

  focusCells() {
    this.cellInput.value = SENTINEL;
    this.cellInput.focus({ preventScroll: true });
  }

  deselect() {
    this.selected = null;
    this.render();
    this.o.onChange();
  }

  /** A cella-megjelenítéshez: a kijelölt sor vázlata és a kurzor. */
  cellInfo(row, i) {
    if (row !== this.selected) return null;
    const t = this.draft(row)[i];
    const cursor = i === this.cursor && document.activeElement === this.cellInput;
    if (!t && !cursor) return null;
    return { text: t || '', cls: `draft${cursor ? ' cursor' : ''}` };
  }

  // --- bevitel a cellákba ---
  fromCells() {
    const v = this.cellInput.value;
    if (this.selected == null) { this.cellInput.value = SENTINEL; return; }
    if (v === '') this.backspace();
    else for (const ch of v.replace(SENTINEL, '')) this.typeChar(ch);
    this.cellInput.value = SENTINEL;
    this.changed(true);
  }

  typeChar(ch) {
    const L = this.toUpper(ch);
    if (!/^\p{L}$/u.test(L)) { if (ch === ' ') this.cursor = Math.min(this.cursor + 1, this.len(this.selected) - 1); return; }
    const d = this.draft();
    const prev = this.cursor > 0 ? d[this.cursor - 1] : '';
    const atEnd = this.cursor === d.length - 1 && d[this.cursor];
    // kettős betű: az előző cellával összevonjuk (S + Z -> SZ), ahogy a generátor is bontja
    const target = atEnd ? this.cursor : this.cursor - 1;
    const base = atEnd ? d[this.cursor] : prev;
    if (this.digraphs && base && DIGRAPHS.includes(base + L) && this.lastTypedAt === target) {
      d[target] = base + L;
      // hosszú kettős mássalhangzó: S, SZ -> SZ, SZ
      if (target > 0 && d[target - 1] === base[0] && base.length === 1) d[target - 1] = base + L;
      return;
    }
    d[this.cursor] = L;
    this.lastTypedAt = this.cursor;
    if (this.cursor < d.length - 1) this.cursor++;
  }

  backspace() {
    const d = this.draft();
    if (d[this.cursor]) {
      d[this.cursor] = ''; // a kurzor alatti betű törlése
    } else if (this.cursor > 0) {
      this.cursor--; // üres cellán: vissza egyet és azt töröljük
      d[this.cursor] = '';
    }
    this.lastTypedAt = null;
  }

  onKey(e) {
    if (this.selected == null) return;
    const d = this.draft();
    const moves = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 };
    if (e.key in moves) {
      e.preventDefault();
      this.cursor = Math.max(0, Math.min(d.length - 1, this.cursor + moves[e.key]));
      this.lastTypedAt = null;
      this.o.onChange();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      this.submit(false);
    } else if (e.key === 'Delete') {
      e.preventDefault();
      d[this.cursor] = '';
      this.changed(true);
    } else if (e.key === 'Escape') {
      this.cellInput.blur();
    }
  }

  // --- bevitel az ablakos mezőbe ---
  fromText() {
    if (this.selected == null) return;
    const L = this.len(this.selected);
    const toks = tokenize(this.text.value, { digraphs: this.digraphs }).slice(0, L);
    const d = new Array(L).fill('');
    toks.forEach((t, i) => { d[i] = t; });
    this.drafts.set(this.selected, d);
    this.cursor = Math.min(toks.length, L - 1);
    this.changed(false);
  }

  syncText() {
    if (document.activeElement === this.text) return;
    this.text.value = this.selected == null ? '' : this.draft().map((t) => t || '').join('');
  }

  toUpper(ch) { return ch.toLocaleUpperCase('hu-HU'); }

  changed(fromCells) {
    if (fromCells) this.syncText();
    this.render();
    this.o.onChange();
    this.sendTyping();
    this.scheduleAuto();
  }

  sendTyping() {
    if (!this.o.onTyping || this.selected == null) return;
    clearTimeout(this.typingTimer);
    const row = this.selected;
    this.typingTimer = setTimeout(() => {
      if (row !== this.selected || !this.o.canAnswer()) return;
      this.o.onTyping(row, this.draft(row).map((t) => t || ''));
    }, 100);
  }

  scheduleAuto() {
    clearTimeout(this.autoTimer);
    const row = this.selected;
    if (row == null) return;
    const d = this.draft(row);
    if (d.some((t) => !t)) return;
    const key = d.join('|');
    if (this.lastSent.get(row) === key) return; // ezt már beküldtük, és nem volt jó
    // ha az utolsó betű egy kettős betű eleje lehet (pl. S -> SZ), kicsit tovább várunk
    const last = d[d.length - 1];
    const wait = this.digraphs && DIGRAPHS.some((g) => g.startsWith(last) && g !== last) ? this.autoMs + 500 : this.autoMs;
    this.autoTimer = setTimeout(() => { if (this.selected === row) this.submit(true); }, wait);
  }

  submit(auto) {
    clearTimeout(this.autoTimer);
    const row = this.selected;
    if (row == null || !this.o.canAnswer() || this.pending != null) return;
    const d = this.draft(row);
    if (d.some((t) => !t)) {
      if (!auto) toast(`${d.length} betűs szó kell.`, 'warn');
      return;
    }
    this.pending = row;
    this.lastSent.set(row, d.join('|'));
    this.render();
    this.o.onSubmit(row, [...d]);
  }

  /** Eredmény a beküldött sorra. */
  result(row, correct) {
    if (this.pending === row) this.pending = null;
    if (correct) {
      this.drafts.delete(row);
      if (this.selected === row) { this.selected = null; this.text.value = ''; this.cellInput.blur(); }
    } else if (this.selected === row) {
      this.el.classList.remove('shake'); void this.el.offsetWidth; this.el.classList.add('shake');
    }
    this.o.onTyping?.(row, []);
    this.render();
    this.o.onChange();
  }

  /** Új kör vagy új rejtvény: minden vázlat törlődik. */
  reset() {
    clearTimeout(this.autoTimer);
    this.selected = null;
    this.cursor = 0;
    this.drafts.clear();
    this.lastSent.clear();
    this.pending = null;
    this.text.value = '';
    this.render();
  }

  render() {
    const pub = this.pub;
    const can = pub && this.o.canAnswer();
    this.text.disabled = !can || this.selected == null;
    this.btn.disabled = !can || this.selected == null || this.pending != null;
    if (!pub || this.selected == null) {
      fill(this.label, h('span', { class: 'muted' }, 'Kattints egy mezőre és gépelj — vagy válassz meghatározást és írd ide.'));
      this.count.textContent = '';
      return;
    }
    const r = pub.rows[this.selected];
    fill(this.label, h('strong', {}, entryLabel(pub, this.selected)), r.clue || '', h('span', { class: 'muted' }, ` (${r.length} betű)`));
    const n = this.draft().filter(Boolean).length;
    this.count.textContent = this.pending != null ? 'Ellenőrzés…' : `${n}/${r.length} betű${n === r.length ? ' — beküldés…' : ''}`;
    this.count.className = n === r.length ? 'ok' : 'muted';
  }

  destroy() {
    clearTimeout(this.autoTimer);
    clearTimeout(this.typingTimer);
    this.cellInput.remove();
  }
}

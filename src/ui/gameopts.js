// Keresztrejtvény-beállítások a tanárnak: lépcsős pontozás és diák-boostok.
import { h } from './dom.js';
import { BOOSTS, LADDER_MIN, cleanOptions } from '../live/game.js';

const LAST_KEY = 'pastewall.lastOptions';

/** Az utoljára használt beállítások (a következő játéknál ez az alapértelmezés). */
export function lastOptions() {
  try { return cleanOptions(JSON.parse(localStorage.getItem(LAST_KEY) || '{}')); } catch { return cleanOptions({}); }
}

/**
 * @param {{scoring?:any, boosts?:any}} [initial]
 * @returns {{el:HTMLElement, value:()=>{scoring:any, boosts:any}}}
 */
export function gameOptionsUI(initial) {
  const o = cleanOptions(initial || lastOptions());
  const ladder = h('input', { type: 'checkbox', checked: o.scoring.ladder });
  const top = h('input', { class: 'input tiny', type: 'number', min: LADDER_MIN, max: 1000, value: o.scoring.top });
  const step = h('input', { class: 'input tiny', type: 'number', min: 0, max: 1000, value: o.scoring.step });
  const example = h('div', { class: 'muted small' });
  const ladderBox = h('div', { class: 'check' }, 'Az első megfejtő ', top, ' pontot kap, minden további ', step, ' ponttal kevesebbet.');
  const sync = () => {
    ladderBox.hidden = !ladder.checked;
    example.hidden = !ladder.checked;
    const t = Math.max(LADDER_MIN, Number(top.value) || 0);
    const s = Math.max(0, Number(step.value) || 0);
    const seq = [];
    for (let k = 0; k < 6; k++) seq.push(Math.max(LADDER_MIN, t - s * k));
    example.textContent = `Példa: 1. → ${seq[0]}, 2. → ${seq[1]}, 3. → ${seq[2]}, … a legkevesebb ${LADDER_MIN} pont (akárhány játékos van).`;
  };
  [ladder, top, step].forEach((x) => x.addEventListener('input', sync));

  const boostSel = Object.entries(BOOSTS).map(([k, b]) => {
    const sel = h('select', { class: 'input tiny' },
      [0, 1, 2, 3, 5].map((n) => h('option', { value: n, selected: n === o.boosts[k] }, n ? `${n}×` : 'ki')));
    return { k, sel, el: h('label', { class: 'boost-opt' }, sel, h('span', {}, h('strong', {}, `${b.icon} ${b.label}`), h('span', { class: 'muted small' }, ` — ${b.desc}`))) };
  });

  const el = h('div', { class: 'opts' },
    h('label', { class: 'check' }, ladder, h('strong', {}, 'Lépcsős pontozás'), h('span', { class: 'muted small' }, '(verseny módban: a gyorsabb több pontot kap egy kérdésért)')),
    ladderBox, example,
    h('div', {}, h('strong', {}, '⚡ Boostok a diákoknak'), h('span', { class: 'muted small' }, ' — diákonként hányszor használhatók')),
    boostSel.map((b) => b.el));
  sync();

  return {
    el,
    value() {
      const v = cleanOptions({
        scoring: { ladder: ladder.checked, top: top.value, step: step.value },
        boosts: Object.fromEntries(boostSel.map((b) => [b.k, Number(b.sel.value)])),
      });
      localStorage.setItem(LAST_KEY, JSON.stringify(v));
      return v;
    },
  };
}

import { bushingDeviation } from '../calc/evaluate';
import { fmt } from '../calc/units';
import { resBadge } from '../ui';
import { type FormDef, PHASES, type ResultRow } from './types';
import { has, n, numRow, okRes, okTxt, selRow, textRow, val } from './inputs';

// ---------- 4.4 Sứ xuyên ----------
export const bushingForm: FormDef = {
  phased: true,
  render(v, _p, ph, prev) {
    return `${numRow(v, `${ph}.C1`, 'C1 đo được (pF)')}
      ${numRow(v, `${ph}.C1base`, 'C1 baseline / nhãn (pF)', prev?.[`${ph}.C1`] ? `Phiên trước: ${prev[`${ph}.C1`]} pF` : '')}
      <p class="calc-out" data-out="c1"></p>
      ${numRow(v, `${ph}.tan`, 'tan δ (%)')}
      ${selRow(v, `${ph}.dfr`, 'Đáp ứng điện môi DFR')}
      ${textRow(v, `${ph}.note`, 'Ghi chú')}`;
  },
  live(root, v, _p, ph) {
    const d = bushingDeviation(n(v, `${ph}.C1`), n(v, `${ph}.C1base`));
    root.querySelector('[data-out="c1"]')!.innerHTML = d.result === 'na' ? '' : `Sai lệch C1 = <b>${fmt(d.pct, 2)} %</b> ${resBadge(d.result, d.result === 'pass' ? '✅ ≤ 5 %' : '❌ > 5 %')}`;
  },
  rows(v) {
    const rows: ResultRow[] = [];
    for (const ph of PHASES) {
      if (!has(v, `${ph}.C1`) && !has(v, `${ph}.tan`) && !has(v, `${ph}.dfr`)) continue;
      const d = bushingDeviation(n(v, `${ph}.C1`), n(v, `${ph}.C1base`));
      rows.push({ group: `Pha ${ph}`, label: 'C1 (pF) / sai lệch', value: `${val(v, `${ph}.C1`)}${d.result !== 'na' ? ` (${fmt(d.pct, 2)} %)` : ''}`, expected: `≤ 5 % so với ${val(v, `${ph}.C1base`) || 'baseline'}`, result: d.result });
      if (has(v, `${ph}.tan`)) rows.push({ group: `Pha ${ph}`, label: 'tan δ (%)', value: v[`${ph}.tan`], expected: '', result: 'na' });
      if (has(v, `${ph}.dfr`)) rows.push({ group: `Pha ${ph}`, label: 'DFR', value: okTxt(v[`${ph}.dfr`]), expected: 'Đạt', result: okRes(v[`${ph}.dfr`]) });
      if (has(v, `${ph}.note`)) rows.push({ group: `Pha ${ph}`, label: 'Ghi chú', value: v[`${ph}.note`], expected: '', result: 'na' });
    }
    return rows;
  },
};

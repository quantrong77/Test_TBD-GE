import { getThreshold } from '../content';
import { evalCtPair, resolveThreshold } from '../calc/evaluate';
import { esc } from '../ui';
import { type FormDef, PHASES, type ResultRow } from './types';
import { has, n, numRow, okRes, okTxt, selRow, thDesc } from './inputs';

// ---------- 4.7 Bơm dòng nhất thứ ----------
export const CT_ROWS = [
  { id: 'CT1', label: 'CT1 – Capacitor Current', turns: '1', inj: '200', th: 'ct_200A', hmi: '%R620' },
  { id: 'CT2', label: 'CT2 – Breaker Current', turns: '1', inj: '200', th: 'ct_200A', hmi: '%R614' },
  { id: 'CT3x2', label: 'CT3–CT30 – Unbalance (1 vòng CT3, 2 vòng CT30)', turns: '1/2', inj: '6', th: 'ct_unb', hmi: '%R626' },
  { id: 'CT3x1', label: 'CT3–CT30 – Unbalance (1 vòng CT3 & CT30)', turns: '1/1', inj: '6', th: 'ct_unb0', hmi: '%R626' },
  { id: 'CT4', label: 'CT4 – Platform Fault Current', turns: '1', inj: '200', th: 'ct_200A', hmi: '%R638' },
  { id: 'CT6', label: 'CT6 – MOV Group 1', turns: '1', inj: '200', th: 'ct_mov', hmi: '%R1233' },
  { id: 'CT60', label: 'CT60 – MOV Group 2', turns: '1', inj: '200', th: 'ct_mov', hmi: '%R1235' },
  { id: 'CT8', label: 'CT8 – Gap Current', turns: '1', inj: '200', th: 'ct_200A', hmi: '%R632' },
];
export const injectForm: FormDef = {
  phased: true,
  render(v, p, ph) {
    return `<h3>Bước 1 – CT9 (aptomat nguồn phụ PFOI đã TẮT), bơm 80 A</h3>
      ${selRow(v, `${ph}.CT9A`, 'CT9A – 2 đèn GFOI Fiber Active sáng')}
      ${selRow(v, `${ph}.CT9B`, 'CT9B – 2 đèn GFOI Fiber Active sáng')}
      <h3>Bước 2 – Đóng aptomat, bơm lần lượt</h3>
      ${CT_ROWS.map(
        (c) => `<div class="card" style="margin:8px 0"><b>${esc(c.label)}</b><div class="small muted">Bơm ${c.inj} A · vòng ${c.turns} · kỳ vọng ${esc(thDesc(c.th, p))} · HMI ${c.hmi}</div>
          ${numRow(v, `${ph}.${c.id}.a`, 'HMI A (A)', '', c.th)}${numRow(v, `${ph}.${c.id}.b`, 'HMI B (A)', '', c.th)}</div>`,
      ).join('')}
      <p class="small muted">CT5: Not Used.</p>`;
  },
  rows(v, p) {
    const rows: ResultRow[] = [];
    for (const ph of PHASES) {
      for (const k of ['CT9A', 'CT9B'])
        if (has(v, `${ph}.${k}`)) rows.push({ group: `Pha ${ph}`, label: `${k} bơm 80 A`, value: okTxt(v[`${ph}.${k}`]), expected: 'Cả 2 đèn GFOI Fiber Active sáng', result: okRes(v[`${ph}.${k}`]) });
      for (const c of CT_ROWS) {
        const a = `${ph}.${c.id}.a`;
        const b = `${ph}.${c.id}.b`;
        if (!has(v, a) && !has(v, b)) continue;
        rows.push({ group: `Pha ${ph}`, label: `${c.label} (${c.hmi})`, value: `A: ${v[a] ?? '—'} / B: ${v[b] ?? '—'}`, expected: thDesc(c.th, p), result: evalCtPair(resolveThreshold(getThreshold(c.th)!, p), n(v, a), n(v, b)) });
      }
    }
    return rows;
  },
};

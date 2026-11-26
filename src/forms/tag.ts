import { getThreshold } from '../content';
import { combine, evalThreshold, evalTrigger, gapCheck } from '../calc/evaluate';
import { fmt } from '../calc/units';
import { resBadge } from '../ui';
import { type FormDef, PHASES, type ResultRow, VAPS, type Values } from './types';
import { has, n, numRow, okRes, okTxt, selRow, textRow, thDesc, val } from './inputs';

// ---------- 4.5.A Khe hở ----------
export const gapForm: FormDef = {
  phased: true,
  render(v, p, ph) {
    return `${numRow(v, `${ph}.gap`, 'Khe hở đo được (mm)', `Hồ sơ ${p.bank}: ${fmt(p.tagGap_mm)} mm ± ${fmt(p.gapTol_mm ?? 2)}`, 'tag_gap')}${textRow(v, `${ph}.note`, 'Ghi chú')}`;
  },
  rows(v, p) {
    return PHASES.filter((ph) => has(v, `${ph}.gap`)).map((ph) => ({
      group: `Pha ${ph}`,
      label: 'Khe hở điện cực TAG (mm)',
      value: v[`${ph}.gap`],
      expected: `${fmt(p.tagGap_mm)} ± ${fmt(p.gapTol_mm ?? 2)} mm`,
      result: gapCheck(n(v, `${ph}.gap`), p.tagGap_mm, p.gapTol_mm ?? 2),
    }));
  },
};

// ---------- 4.5.B VAP Threshold ----------
const VAP_FIELDS = [
  { k: 'mC', label: 'ENERGY (mC)', th: 'vap_mC' },
  { k: 'V', label: 'ENERGY (V)', th: 'vap_V' },
  { k: 'A', label: 'CURRENT (A)', th: 'vap_A', sub: 'trị tuyệt đối' },
  { k: 'ext', label: 'EXT TRIG (V)', th: 'vap_ext', sub: 'tùy chọn' },
];
export const vapForm: FormDef = {
  phased: true,
  render(v, p, ph) {
    return VAPS.map(
      (u) => `<div class="card"><b>${u} – pha ${ph}</b>
        ${textRow(v, `${ph}.${u}.serial`, 'Số serial VAP')}
        ${selRow(v, `${ph}.${u}.jumper`, 'Jumper đúng cấu hình gốc')}
        ${VAP_FIELDS.map((f) => numRow(v, `${ph}.${u}.${f.k}`, f.label, `${f.sub ? f.sub + ' · ' : ''}${thDesc(f.th, p)}`, f.th)).join('')}
        ${selRow(v, `${ph}.${u}.fired`, 'Đèn VAP FIRED sáng (≤ 1,5 s)')}</div>`,
    ).join('');
  },
  rows(v, p) {
    const rows: ResultRow[] = [];
    for (const ph of PHASES)
      for (const u of VAPS) {
        const g = `Pha ${ph} · ${u}${has(v, `${ph}.${u}.serial`) ? ` (SN ${v[`${ph}.${u}.serial`]})` : ''}`;
        if (has(v, `${ph}.${u}.jumper`)) rows.push({ group: g, label: 'Jumper cấu hình', value: okTxt(v[`${ph}.${u}.jumper`]), expected: 'Đúng cấu hình gốc', result: okRes(v[`${ph}.${u}.jumper`]) });
        for (const f of VAP_FIELDS) {
          const k = `${ph}.${u}.${f.k}`;
          if (!has(v, k)) continue;
          rows.push({ group: g, label: f.label, value: v[k], expected: thDesc(f.th, p), result: evalThreshold(getThreshold(f.th)!, n(v, k), p) });
        }
        if (has(v, `${ph}.${u}.fired`)) rows.push({ group: g, label: 'VAP FIRED', value: okTxt(v[`${ph}.${u}.fired`]), expected: 'Sáng trong 1,5 s', result: okRes(v[`${ph}.${u}.fired`]) });
      }
    return rows;
  },
};

// ---------- 4.5.C Trigger ±10 kV ----------
const POLS = [
  ['pos', '+10 kV'],
  ['neg', '−10 kV'],
] as const;
const FIRE: [string, string][] = [
  ['', '—'],
  ['ok', '✓ Có FIRE'],
  ['nok', '✗ Không'],
];
const trigOf = (v: Values, base: string) =>
  evalTrigger(
    [1, 2, 3].map((i) => (v[`${base}.f${i}`] === 'ok' ? true : v[`${base}.f${i}`] === 'nok' ? false : null)),
    [0, 1, 2, 3].map((i) => n(v, `${base}.c${i}`)),
  );
export const triggerForm: FormDef = {
  phased: true,
  render(v, _p, ph) {
    return VAPS.map(
      (u) => `<div class="card"><b>${u} – pha ${ph}</b>${POLS.map(
        ([pk, pl]) => `<h3>${pl}</h3>
          ${numRow(v, `${ph}.${u}.${pk}.kV`, 'Điện áp đặt (kV)', 'đồng hồ GAMMA / kẹp 8')}
          ${numRow(v, `${ph}.${u}.${pk}.c0`, 'COUNT trước khi thử')}
          ${[1, 2, 3].map((i) => `${selRow(v, `${ph}.${u}.${pk}.f${i}`, `Lần ${i}: FIRE`, FIRE)}${numRow(v, `${ph}.${u}.${pk}.c${i}`, `Lần ${i}: COUNT`)}`).join('')}
          <p data-out="${ph}.${u}.${pk}"></p>`,
      ).join('')}</div>`,
    ).join('');
  },
  live(root, v, _p, ph) {
    for (const u of VAPS)
      for (const [pk] of POLS) {
        const r = trigOf(v, `${ph}.${u}.${pk}`);
        const o = root.querySelector(`[data-out="${ph}.${u}.${pk}"]`);
        if (o) o.innerHTML = r === 'na' ? '' : resBadge(r, r === 'pass' ? '✅ 3/3 FIRE, COUNT tăng đúng' : '❌ Không đạt');
      }
  },
  rows(v) {
    const rows: ResultRow[] = [];
    for (const ph of PHASES)
      for (const u of VAPS)
        for (const [pk, pl] of POLS) {
          const b = `${ph}.${u}.${pk}`;
          const r = trigOf(v, b);
          if (r === 'na' && !has(v, `${b}.c0`)) continue;
          const fires = [1, 2, 3].map((i) => okTxt(v[`${b}.f${i}`]) || '·').join(' ');
          const counts = [0, 1, 2, 3].map((i) => v[`${b}.c${i}`] || '·').join('→');
          rows.push({ group: `Pha ${ph} · ${u}`, label: `Trigger ${pl}${has(v, `${b}.kV`) ? ` (${v[`${b}.kV`]} kV)` : ''}`, value: `FIRE ${fires}; COUNT ${counts}`, expected: '3/3 FIRE, COUNT +1 mỗi lần', result: r });
        }
    return rows;
  },
};

// ---------- 4.5.D Bơm CT10/CT11 ----------
export const ct10Form: FormDef = {
  phased: true,
  render(v, p, ph) {
    return VAPS.map(
      (u) => `<div class="card"><b>${u} – pha ${ph}</b>
        ${selRow(v, `${ph}.${u}.check100`, 'Kiểm tra mạch CT ở 100 A (ampe kìm)')}
        ${numRow(v, `${ph}.${u}.I`, 'Dòng phát (A)', thDesc('ct10_inject', p), 'ct10_inject', '265')}
        ${selRow(v, `${ph}.${u}.op`, 'TAG/VAP tác động')}
        ${textRow(v, `${ph}.${u}.note`, 'Ghi chú (thời gian, tín hiệu)')}</div>`,
    ).join('');
  },
  rows(v, p) {
    const rows: ResultRow[] = [];
    for (const ph of PHASES)
      for (const u of VAPS) {
        const b = `${ph}.${u}`;
        if (!has(v, `${b}.I`) && !has(v, `${b}.op`)) continue;
        const r = combine([evalThreshold(getThreshold('ct10_inject')!, n(v, `${b}.I`), p), okRes(v[`${b}.op`]), okRes(v[`${b}.check100`])]);
        rows.push({ group: `Pha ${ph} · ${u}`, label: 'Bơm CT10/CT11', value: `${val(v, `${b}.I`, 'A')} · tác động ${okTxt(v[`${b}.op`])}${has(v, `${b}.note`) ? ' · ' + v[`${b}.note`] : ''}`, expected: `${thDesc('ct10_inject', p)}; TAG/VAP tác động`, result: r });
      }
    return rows;
  },
};

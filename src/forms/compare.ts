import { deltaPct } from '../calc/evaluate';
import { tempCorrectRcd, tempCorrectRdc } from '../calc/temp-correction';
import { fmt } from '../calc/units';
import { esc, resBadge } from '../ui';
import { type FormDef, PHASES, type ResultRow } from './types';
import { has, n, numRow, textRow } from './inputs';

// ---------- So sánh lần trước (MOV, kháng cản dịu) có tích hợp quy đổi nhiệt độ ----------
function compareForm(fields: { k: string; label: string; unit: string; compare?: boolean }[]): FormDef {
  return {
    phased: true,
    render(v, _p, ph, prev) {
      return `
        <div class="card mb-8">
          ${numRow(v, `${ph}.t`, 'Nhiệt độ môi trường t (°C)', 'Dùng tự động quy đổi Rcd về 20°C và Rdc về 75°C', '', '25')}
          ${numRow(v, 'flagPct', 'Ngưỡng cờ bất thường Δ (%)', 'So với lần trước – người dùng đặt', '', '20')}
        </div>
        ${fields
          .filter((f) => f.k !== 't')
          .map(
            (f) => `<div class="card my-8"><b>${esc(f.label)} (${esc(f.unit)})</b>
            ${numRow(v, `${ph}.${f.k}`, 'Lần này')}
            ${f.compare === false ? '' : numRow(v, `${ph}.${f.k}_prev`, 'Lần trước', prev?.[`${ph}.${f.k}`] ? `Phiên trước: ${prev[`${ph}.${f.k}`]}` : '')}
            <div data-temp-corr="${ph}.${f.k}"></div>
            <p class="small" data-out="${ph}.${f.k}"></p></div>`,
          )
          .join('')}
        ${textRow(v, `${ph}.note`, 'Ghi chú')}`;
    },
    live(root, v, _p, ph) {
      const flag = n(v, 'flagPct') || 20;
      const t = n(v, `${ph}.t`) || n(v, 't');
      for (const f of fields) {
        if (f.k === 't') continue;
        const val = n(v, `${ph}.${f.k}`);
        const prevVal = n(v, `${ph}.${f.k}_prev`);
        const d = deltaPct(val, prevVal);
        const o = root.querySelector(`[data-out="${ph}.${f.k}"]`);
        if (o) o.innerHTML = d == null ? '' : `Δ = ${d >= 0 ? '+' : ''}${fmt(d, 1)} % ${Math.abs(d) > flag ? resBadge('warn', '⚠️ Bất thường') : resBadge('pass', '✓ Bình thường')}`;

        // Cập nhật quy đổi nhiệt độ
        const tempBox = root.querySelector(`[data-temp-corr="${ph}.${f.k}"]`);
        if (tempBox) {
          if (val > 0 && t != null && Number.isFinite(t)) {
            if (f.k.startsWith('Rcd') || f.k.startsWith('Rmov') || f.k.startsWith('Rsu')) {
              const corr = tempCorrectRcd(val, t);
              if (corr) {
                tempBox.innerHTML = `<div class="temp-calc-box">
                  🌡️ Quy đổi về 20°C: <b>${fmt(corr.R_ref, 1)} MΩ</b> (hệ số Kt = ${fmt(corr.factor, 3)})
                </div>`;
              }
            } else if (f.k === 'Rdc') {
              const corr = tempCorrectRdc(val, t, 75, 'Al');
              if (corr) {
                tempBox.innerHTML = `<div class="temp-calc-box">
                  🌡️ Quy đổi cuộn kháng (dây nhôm K=228):<br>
                  • <b>R(75°C) = ${fmt(corr.R_75, 2)} mΩ</b> (hệ số = ${fmt(corr.factor, 3)})<br>
                  • <b>R(20°C) = ${fmt(corr.R_20, 2)} mΩ</b>
                </div>`;
              }
            } else {
              tempBox.innerHTML = '';
            }
          } else {
            tempBox.innerHTML = '';
          }
        }
      }
    },
    rows(v) {
      const flag = n(v, 'flagPct') || 20;
      const rows: ResultRow[] = [];
      for (const ph of PHASES) {
        const t = n(v, `${ph}.t`) || n(v, 't');
        if (t != null && Number.isFinite(t)) {
          rows.push({ group: `Pha ${ph}`, label: 'Nhiệt độ môi trường', value: `${t} °C`, expected: '', result: 'na' });
        }
        for (const f of fields) {
          if (f.k === 't') continue;
          const k = `${ph}.${f.k}`;
          if (!has(v, k)) continue;
          const val = n(v, k);
          const d = f.compare === false ? null : deltaPct(val, n(v, `${k}_prev`));
          rows.push({
            group: `Pha ${ph}`,
            label: `${f.label} (${f.unit})`,
            value: v[k] + (d != null ? ` (Δ ${d >= 0 ? '+' : ''}${fmt(d, 1)} %)` : ''),
            expected: d != null ? `|Δ| ≤ ${fmt(flag)} % so với lần trước (${v[`${k}_prev`]})` : '',
            result: d == null ? 'na' : Math.abs(d) > flag ? 'warn' : 'pass',
          });

          // Quy đổi nhiệt độ trong kết quả xuất biên bản
          if (val > 0 && t != null && Number.isFinite(t)) {
            if (f.k.startsWith('Rcd') || f.k.startsWith('Rmov') || f.k.startsWith('Rsu')) {
              const corr = tempCorrectRcd(val, t);
              if (corr) {
                rows.push({
                  group: `Pha ${ph}`,
                  label: `→ ${f.label} (quy đổi 20°C)`,
                  value: `${fmt(corr.R_ref, 1)} MΩ`,
                  expected: 'Kt = 1.5^((t-20)/10)',
                  result: 'na',
                });
              }
            } else if (f.k === 'Rdc') {
              const corr = tempCorrectRdc(val, t, 75, 'Al');
              if (corr) {
                rows.push({
                  group: `Pha ${ph}`,
                  label: '→ Rdc kháng (quy đổi 75°C)',
                  value: `${fmt(corr.R_75, 2)} mΩ`,
                  expected: 'Kháng GE dây nhôm (K=228)',
                  result: 'na',
                });
              }
            }
          }
        }
        if (has(v, `${ph}.note`)) rows.push({ group: `Pha ${ph}`, label: 'Ghi chú', value: v[`${ph}.note`], expected: '', result: 'na' });
      }
      return rows;
    },
  };
}

export const movForm = compareForm([
  { k: 'Rmov', label: 'R cách điện MOV', unit: 'MΩ' },
  { k: 'Rsu', label: 'R cách điện sứ đỡ', unit: 'MΩ' },
  { k: 'P', label: 'Tổn hao công suất', unit: 'W' },
]);
export const reactorForm = compareForm([
  { k: 'Rcd', label: 'R cách điện', unit: 'MΩ' },
  { k: 'Rdc', label: 'Điện trở một chiều', unit: 'mΩ' },
  { k: 'Z', label: 'Tổng trở Z', unit: 'Ω' },
  { k: 'L', label: 'Điện cảm L', unit: 'mH' },
]);

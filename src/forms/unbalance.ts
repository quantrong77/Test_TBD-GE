import { type CurrentUnit, analyzeStrings, sanityChecks, stringLocation, stringOutliers, unbalance, unbalanceVerdict } from '../calc/unbalance';
import { fmt } from '../calc/units';
import { esc, resBadge } from '../ui';
import { type FormDef, PHASES, type ResultRow, type Values } from './types';
import { has, n, numRow, textRow } from './inputs';

// ---------- 4.1.B Mất cân bằng ----------
const UNITS: [string, string][] = [
  ['mA', 'mA'],
  ['A', 'A'],
  ['uA', 'µA'],
];
const unbOf = (v: Values, ph: string) =>
  unbalance({ U: n(v, `${ph}.U`), Isum: n(v, `${ph}.Isum`), IG1: n(v, `${ph}.IG1`), IG2: n(v, `${ph}.IG2`), Idx10: n(v, `${ph}.Idx10`), IdxUnit: ((v[`${ph}.unit`] || 'mA') as CurrentUnit) });
const strings = (v: Values, ph: string, g: string) => Array.from({ length: 24 }, (_, i) => n(v, `${ph}.${g}.s${i + 1}`));

function renderCapMatrix(g: 'G1' | 'G2', v: Values, ph: string): string {
  const stackA = g === 'G1' ? 1 : 3;
  const stackB = g === 'G1' ? 2 : 4;
  const renderStack = (stackNum: number, startStr: number) => {
    let racksHtml = '';
    for (let r = 1; r <= 3; r++) {
      let cellsHtml = '';
      for (let s = 1; s <= 4; s++) {
        const sIndex = startStr + (r - 1) * 4 + (s - 1); // 1..24
        const valStr = v[`${ph}.${g}.s${sIndex}`] ?? '';
        cellsHtml += `<div class="cap-cell" data-matrix-s="${g}:${sIndex}" title="Chuỗi S${sIndex} (Stack ${stackNum}, Rack ${r}, Chuỗi ${s})">
          <b>S${sIndex}</b>
          <span data-matrix-val="${g}:${sIndex}">${valStr ? `${valStr}A` : '—'}</span>
        </div>`;
      }
      racksHtml += `<div class="cap-rack"><div class="cap-rack-title">Rack ${r} (Tầng ${r})</div><div class="cap-cells">${cellsHtml}</div></div>`;
    }
    return `<div class="cap-stack"><div class="cap-stack-head"><span>Stack ${stackNum}</span><span class="small muted">72 bình (12 chuỗi)</span></div>${racksHtml}</div>`;
  };

  return `
    <div class="cap-matrix-wrap">
      <div class="matrix-stats-box" data-stats="${g}">
        <span class="muted">Nhập dòng điện chuỗi bên dưới để xem ma trận phân bố dòng và cảnh báo chuỗi lệch (> TB + 2σ).</span>
      </div>
      <div class="cap-matrix-stacks">
        ${renderStack(stackA, 1)}
        ${renderStack(stackB, 13)}
      </div>
    </div>`;
}

export const unbalanceForm: FormDef = {
  phased: true,
  render(v, p, ph) {
    const grid = (g: string) =>
      `<details class="card"><summary>Dòng từng string – ${g === 'G1' ? 'Group 1 (Stack 1+2)' : 'Group 2 (Stack 3+4)'} (A)</summary>
        ${renderCapMatrix(g as 'G1' | 'G2', v, ph)}
        <div class="bars" data-bars="${g}" aria-hidden="true"></div>
        <div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;margin-top:8px">${Array.from(
          { length: p.stringsPerGroup || 24 },
          (_, i) => `<label class="small">S${i + 1}<input inputmode="decimal" data-k="${ph}.${g}.s${i + 1}" value="${esc(v[`${ph}.${g}.s${i + 1}`] ?? '')}" aria-label="${g} string ${i + 1}"></label>`,
        ).join('')}</div>
        <p class="small" data-out="${g}"></p></details>`;
    return `
      ${numRow(v, `${ph}.U`, 'U (V)', 'Điện áp đặt, vôn kế số', '', '250')}
      ${numRow(v, `${ph}.Isum`, 'I∑ (A)', 'Tổng dòng – vị trí 3')}
      ${numRow(v, `${ph}.IG1`, 'IG1 (A)', 'Group 1 – vị trí 1')}
      ${numRow(v, `${ph}.IG2`, 'IG2 (A)', 'Group 2 – vị trí 2')}
      <div class="inrow"><span class="lbl">IΔ×10 đọc được<small>Vị trí 4 – = 10 × dòng vi sai thực</small></span>
        <div style="display:grid;grid-template-columns:1fr 38px 84px;gap:6px"><input inputmode="decimal" data-k="${ph}.Idx10" value="${esc(v[`${ph}.Idx10`] ?? '')}" aria-label="IΔ×10">
        <button type="button" class="btn-ocr-scan" data-scan-for="${ph}.Idx10" title="Quét số đo bằng camera (OCR)" aria-label="Quét số cho IΔ×10">📷</button>
        <select data-k="${ph}.unit" aria-label="Đơn vị IΔ×10">${UNITS.map(([o, l]) => `<option value="${o}"${(v[`${ph}.unit`] || 'mA') === o ? ' selected' : ''}>${l}</option>`).join('')}</select></div></div>
      <div class="card calc-out" data-out="calc">—</div>
      <div data-out="warn"></div>
      ${grid('G1')}${grid('G2')}
      ${textRow(v, `${ph}.Cunit`, 'Bình tụ nghi ngờ / C đo được', 'vd: G1-S7 bình 3: 12,1 µF')}`;
  },
  live(root, v, p, ph) {
    const r = unbOf(v, ph);
    const out = root.querySelector('[data-out="calc"]')!;
    const warn = root.querySelector('[data-out="warn"]')!;
    if (!r) {
      out.innerHTML = '<span class="muted">Nhập U, I∑, IG1, IG2, IΔ×10 để tính.</span>';
      warn.innerHTML = '';
    } else {
      const verdict = unbalanceVerdict(r.pct, p.unbAlarm_pct, p.unbBypass_pct);
      const label = verdict === 'pass' ? `✅ < ${fmt(p.unbAlarm_pct)} %` : verdict === 'warn' ? '⚠️ Cảnh báo – kiểm tra string' : '❌ KHÔNG ĐẠT – tìm bình tụ hỏng';
      out.innerHTML = `C∑ = <b>${fmt(r.Csum, 2)}</b> µF<br>CG1 = <b>${fmt(r.CG1, 2)}</b> µF · CG2 = <b>${fmt(r.CG2, 2)}</b> µF<br>ΔC = <b>${fmt(r.dC, 3)}</b> µF<br>%ΔC = <b>${fmt(r.pct, 3)} %</b> ${resBadge(verdict, label)}`;
      const s = sanityChecks(r, { IG1: n(v, `${ph}.IG1`), IG2: n(v, `${ph}.IG2`), Isum: n(v, `${ph}.Isum`) }, p.nominalTotal_uF);
      warn.innerHTML =
        s.warnings.map((w) => `<div class="callout warn"><span class="ico">⚠️</span><div>${esc(w)}</div></div>`).join('') +
        (s.nominalDevPct != null ? `<p class="small muted">C∑ so với danh định ${fmt(p.nominalTotal_uF)} µF: ${s.nominalDevPct >= 0 ? '+' : ''}${fmt(s.nominalDevPct, 2)} %</p>` : '');
    }
    for (const g of ['G1', 'G2']) {
      const vals = strings(v, ph, g);
      const analysis = analyzeStrings(vals);
      const outl = analysis ? analysis.outliersHigh : [];
      const max = Math.max(...vals.filter(Number.isFinite), 0);

      // Cập nhật thanh biểu đồ
      const bars = root.querySelector(`[data-bars="${g}"]`);
      if (bars) bars.innerHTML = vals.map((x, i) => `<i class="${outl.includes(i) ? 'out' : ''}" style="height:${Number.isFinite(x) && max ? (x / max) * 100 : 0}%"></i>`).join('');

      // Cập nhật thông số thống kê ma trận
      const statsBox = root.querySelector(`[data-stats="${g}"]`);
      if (statsBox) {
        if (analysis && analysis.count >= 3) {
          statsBox.innerHTML = `Đã đo: <b>${analysis.count}/24</b> chuỗi · Dòng TB <b>Ī = ${fmt(analysis.mean, 2)} A</b> (σ = ${fmt(analysis.sd, 3)} A)<br>
          Dải bình thường (Ī ± 2σ): <b>${fmt(analysis.lowerLimit, 2)} – ${fmt(analysis.upperLimit, 2)} A</b>
          ${outl.length ? `<br><b style="color:var(--c-danger-fg)">⚠️ Có ${outl.length} chuỗi vượt ngưỡng bất thường (> ${fmt(analysis.upperLimit, 2)} A)</b>` : ''}`;
        } else {
          statsBox.innerHTML = '<span class="muted">Nhập tối thiểu 3 chuỗi để phân tích thống kê và hiển thị chuỗi bất thường (2σ).</span>';
        }
      }

      // Cập nhật ô ma trận
      for (let i = 0; i < 24; i++) {
        const sIndex = i + 1;
        const cell = root.querySelector<HTMLElement>(`[data-matrix-s="${g}:${sIndex}"]`);
        const valEl = root.querySelector<HTMLElement>(`[data-matrix-val="${g}:${sIndex}"]`);
        const val = vals[i];
        const isOut = outl.includes(i);
        if (cell && valEl) {
          cell.classList.toggle('filled', Number.isFinite(val) && val > 0);
          cell.classList.toggle('outlier', isOut);
          valEl.textContent = Number.isFinite(val) && val > 0 ? `${fmt(val, 2)}A` : '—';
          if (isOut) {
            valEl.textContent = `⚠️ ${fmt(val, 2)}A`;
          }
        }
      }

      // Cảnh báo chi tiết vị trí chuỗi nghi ngờ
      const o = root.querySelector(`[data-out="${g}"]`);
      if (o) {
        if (outl.length) {
          const details = outl.map((i) => {
            const loc = stringLocation(g as 'G1' | 'G2', i);
            return `<b>S${i + 1}</b> (${loc.label}): ${vals[i]} A`;
          });
          o.innerHTML = `<div class="callout danger" style="margin-top:6px">
            <b>⚠️ Chuỗi lệch dòng (> TB + 2σ):</b><br>${details.join('<br>')}
            <div class="small" style="margin-top:4px">Kiểm tra ngay lực xiết bu-lông, mắt nối tiếp xúc và đo điện dung từng bình tụ trong chuỗi trên.</div>
          </div>`;
        } else {
          o.innerHTML = vals.some(Number.isFinite) ? 'Không có string bất thường.' : '';
        }
      }
    }

    // Gắn sự kiện click ô ma trận để cuộn nhanh đến ô nhập
    root.querySelectorAll<HTMLElement>('[data-matrix-s]').forEach((c) => {
      if (c.dataset.bound) return;
      c.dataset.bound = '1';
      c.addEventListener('click', () => {
        const [grp, sNum] = c.dataset.matrixS!.split(':');
        const input = root.querySelector<HTMLInputElement>(`input[data-k="${ph}.${grp}.s${sNum}"]`);
        if (input) {
          input.focus();
          input.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      });
    });
  },
  rows(v, p) {
    const rows: ResultRow[] = [];
    for (const ph of PHASES) {
      const r = unbOf(v, ph);
      if (!r) {
        if (has(v, `${ph}.U`) || has(v, `${ph}.Isum`)) rows.push({ group: `Pha ${ph}`, label: '%ΔC', value: 'Thiếu số liệu', expected: '', result: 'na' });
        continue;
      }
      const g = `Pha ${ph}`;
      rows.push({ group: g, label: 'U / I∑ / IG1 / IG2', value: `${v[`${ph}.U`]} V / ${v[`${ph}.Isum`]} A / ${v[`${ph}.IG1`]} A / ${v[`${ph}.IG2`]} A`, expected: '', result: 'na' });
      rows.push({ group: g, label: 'IΔ×10', value: `${v[`${ph}.Idx10`]} ${(v[`${ph}.unit`] || 'mA').replace('uA', 'µA')}`, expected: '', result: 'na' });
      rows.push({ group: g, label: 'C∑ (µF)', value: fmt(r.Csum, 2), expected: `danh định ${fmt(p.nominalTotal_uF)}`, result: 'na' });
      rows.push({ group: g, label: 'CG1 / CG2 (µF)', value: `${fmt(r.CG1, 2)} / ${fmt(r.CG2, 2)}`, expected: '', result: 'na' });
      rows.push({ group: g, label: 'ΔC (µF)', value: fmt(r.dC, 3), expected: '', result: 'na' });
      rows.push({ group: g, label: '%ΔC', value: `${fmt(r.pct, 3)} %`, expected: `< ${fmt(p.unbAlarm_pct)} % (alarm); < ${fmt(p.unbBypass_pct)} % (bypass)`, result: unbalanceVerdict(r.pct, p.unbAlarm_pct, p.unbBypass_pct) });
      for (const gr of ['G1', 'G2']) {
        const o = stringOutliers(strings(v, ph, gr));
        if (o.length) rows.push({ group: g, label: `String nghi ngờ ${gr}`, value: o.map((i) => 'S' + (i + 1)).join(', '), expected: '≤ TB + 2σ', result: 'warn' });
      }
      if (has(v, `${ph}.Cunit`)) rows.push({ group: g, label: 'Bình tụ nghi ngờ', value: v[`${ph}.Cunit`], expected: '', result: 'na' });
    }
    return rows;
  },
};

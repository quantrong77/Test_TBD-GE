import { getTest, getThreshold } from './content';
import { bushingDeviation, combine, deltaPct, describeThreshold, evalCtPair, evalThreshold, evalTrigger, gapCheck, resolveThreshold } from './calc/evaluate';
import { analyzeStrings, sanityChecks, stringLocation, stringOutliers, unbalance, unbalanceVerdict, type CurrentUnit } from './calc/unbalance';
import { tempCorrectRcd, tempCorrectRdc } from './calc/temp-correction';
import { fmt, parseNum } from './calc/units';
import { esc, rich, resBadge } from './ui';
import type { Profile, Result } from './types';

export const PHASES = ['A', 'B', 'C'] as const;
export type Phase = (typeof PHASES)[number];
export const VAPS = ['VAP-A', 'VAP-B'] as const;

export type Values = Record<string, string>;

export interface ResultRow {
  group: string;
  label: string;
  value: string;
  expected: string;
  result: Result;
}

export interface FormDef {
  phased: boolean;
  /** HTML biểu mẫu cho 1 pha (hoặc toàn bộ nếu không theo pha). */
  render(v: Values, p: Profile, phase: Phase, prev?: Values): string;
  /** Cập nhật phần tính toán trực tiếp (tùy chọn). */
  live?(root: HTMLElement, v: Values, p: Profile, phase: Phase): void;
  /** Kết quả để đánh giá, tổng kết và xuất biên bản. */
  rows(v: Values, p: Profile, testId: string, itemId: string): ResultRow[];
}

const n = (v: Values, k: string) => parseNum(v[k]);
const has = (v: Values, k: string) => (v[k] ?? '').trim() !== '';
const val = (v: Values, k: string, unit = '') => (has(v, k) ? `${v[k]}${unit ? ' ' + unit : ''}` : '');

const OKNOK: [string, string][] = [
  ['', '—'],
  ['ok', '✓ Đạt / Có'],
  ['nok', '✗ Không đạt / Không'],
];
const okRes = (s: string | undefined): Result => (s === 'ok' ? 'pass' : s === 'nok' ? 'fail' : 'na');
const okTxt = (s: string | undefined) => (s === 'ok' ? '✓' : s === 'nok' ? '✗' : '');

// ---------- Ô nhập ----------
export function numRow(v: Values, k: string, label: string, sub = '', th = '', placeholder = '', ocr = true): string {
  return `<div class="inrow" data-row="${esc(k)}"${th ? ` data-th="${esc(th)}"` : ''}><span class="lbl">${rich(label)}${sub ? `<small>${rich(sub)}</small>` : ''}</span><div style="display:flex;align-items:center;gap:4px;width:100%"><input inputmode="decimal" data-k="${esc(k)}" value="${esc(v[k] ?? '')}" placeholder="${esc(placeholder)}" aria-label="${esc(label)}" style="flex:1;min-width:0">${ocr ? `<button type="button" class="btn-ocr-scan" data-scan-for="${esc(k)}" title="Quét số đo bằng camera (OCR)" aria-label="Quét số cho ${esc(label)}">📷</button>` : ''}</div></div>`;
}
export function textRow(v: Values, k: string, label: string, sub = ''): string {
  return `<div class="inrow"><span class="lbl">${rich(label)}${sub ? `<small>${rich(sub)}</small>` : ''}</span><input type="text" data-k="${esc(k)}" value="${esc(v[k] ?? '')}" aria-label="${esc(label)}"></div>`;
}
export function selRow(v: Values, k: string, label: string, opts: [string, string][] = OKNOK, sub = ''): string {
  return `<div class="inrow" data-row="${esc(k)}" data-ok="1"><span class="lbl">${rich(label)}${sub ? `<small>${rich(sub)}</small>` : ''}</span><select data-k="${esc(k)}" aria-label="${esc(label)}">${opts
    .map(([o, l]) => `<option value="${esc(o)}"${(v[k] ?? '') === o ? ' selected' : ''}>${esc(l)}</option>`)
    .join('')}</select></div>`;
}

/** Tô màu các dòng có data-th / data-ok theo kết quả. */
export function paintRows(root: HTMLElement, v: Values, p: Profile) {
  root.querySelectorAll<HTMLElement>('.inrow[data-row]').forEach((row) => {
    const k = row.dataset.row!;
    let r: Result = 'na';
    if (row.dataset.th) {
      const t = getThreshold(row.dataset.th);
      if (t) r = evalThreshold(t, n(v, k), p);
    } else if (row.dataset.ok) r = okRes(v[k]);
    row.classList.remove('res-pass', 'res-fail', 'res-warn');
    if (r !== 'na') row.classList.add('res-' + r);
  });
}

const thDesc = (id: string, p: Profile) => {
  const t = getThreshold(id);
  return t ? describeThreshold(resolveThreshold(t, p)) : '';
};

// ---------- Checklist ----------
const checklist: FormDef = {
  phased: false,
  render(v, _p, _ph, _prev) {
    // testId truyền qua v.__test (gán khi mở biểu mẫu)
    const t = getTest(v.__item, v.__test);
    return `${(t?.checklist ?? []).map((c, i) => selRow(v, `c${i}`, c)).join('')}${textRow(v, 'note', 'Ghi chú / tồn tại')}`;
  },
  rows(v, _p, testId, itemId) {
    const t = getTest(itemId, testId);
    const rows = (t?.checklist ?? []).map((c, i) => ({ group: '', label: c.replace(/\*\*/g, ''), value: okTxt(v[`c${i}`]), expected: 'Đạt', result: okRes(v[`c${i}`]) }));
    if (has(v, 'note')) rows.push({ group: '', label: 'Ghi chú', value: v.note, expected: '', result: 'na' });
    return rows;
  },
};

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

const unbalanceForm: FormDef = {
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

// ---------- So sánh lần trước (MOV, kháng cản dịu) có tích hợp quy đổi nhiệt độ ----------
function compareForm(fields: { k: string; label: string; unit: string; compare?: boolean }[]): FormDef {
  return {
    phased: true,
    render(v, _p, ph, prev) {
      return `
        <div class="card" style="margin-bottom:10px">
          ${numRow(v, `${ph}.t`, 'Nhiệt độ môi trường t (°C)', 'Dùng tự động quy đổi Rcd về 20°C và Rdc về 75°C', '', '25')}
          ${numRow(v, 'flagPct', 'Ngưỡng cờ bất thường Δ (%)', 'So với lần trước – người dùng đặt', '', '20')}
        </div>
        ${fields
          .filter((f) => f.k !== 't')
          .map(
            (f) => `<div class="card" style="margin:8px 0"><b>${esc(f.label)} (${esc(f.unit)})</b>
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

// ---------- 4.4 Sứ xuyên ----------
const bushingForm: FormDef = {
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

// ---------- 4.5.A Khe hở ----------
const gapForm: FormDef = {
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
const vapForm: FormDef = {
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
const triggerForm: FormDef = {
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
const ct10Form: FormDef = {
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
const injectForm: FormDef = {
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

export const FORMS: Record<string, FormDef> = {
  checklist,
  unbalance: unbalanceForm,
  mov: compareForm([
    { k: 'Rmov', label: 'R cách điện MOV', unit: 'MΩ' },
    { k: 'Rsu', label: 'R cách điện sứ đỡ', unit: 'MΩ' },
    { k: 'P', label: 'Tổn hao công suất', unit: 'W' },
  ]),
  reactor: compareForm([
    { k: 'Rcd', label: 'R cách điện', unit: 'MΩ' },
    { k: 'Rdc', label: 'Điện trở một chiều', unit: 'mΩ' },
    { k: 'Z', label: 'Tổng trở Z', unit: 'Ω' },
    { k: 'L', label: 'Điện cảm L', unit: 'mH' },
  ]),
  bushing: bushingForm,
  gap: gapForm,
  vap: vapForm,
  trigger: triggerForm,
  ct10: ct10Form,
  inject: injectForm,
};

export function formFor(itemId: string, testId: string): FormDef | undefined {
  const t = getTest(itemId, testId);
  return t?.form ? FORMS[t.form] : undefined;
}

export function evaluateTest(itemId: string, testId: string, v: Values, p: Profile): ResultRow[] {
  const f = formFor(itemId, testId);
  if (!f) return [];
  return f.rows({ ...v, __item: itemId, __test: testId }, p, testId, itemId);
}

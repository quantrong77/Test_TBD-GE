// Vẽ đồ thị xu hướng bằng SVG (không thư viện ngoài, chạy offline). Phần tính toán: calc/trend.ts.
import { metricThreshold, type MetricDefinition, type TrendDataPoint } from './trend';
import type { Profile } from '../types';

/** Nhãn đợt có thể do người dùng nhập → escape trước khi đưa vào SVG. */
const escSvg = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/**
 * Tạo đồ thị Vector SVG trực quan, tương thích dark/light mode và 100% offline.
 */
export function renderTrendSvg(
  points: TrendDataPoint[],
  metric: MetricDefinition,
  profile: Profile,
  options?: { width?: number; height?: number },
): string {
  const W = options?.width || 680;
  const H = options?.height || 320;

  const padLeft = 60;
  const padRight = 30;
  const padTop = 45;
  const padBottom = 55;

  const chartW = W - padLeft - padRight;
  const chartH = H - padTop - padBottom;

  if (points.length === 0) {
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" class="trend-chart-svg">
      <rect width="${W}" height="${H}" fill="rgba(15,23,42,0.4)" rx="8"/>
      <text x="${W / 2}" y="${H / 2}" fill="#94a3b8" text-anchor="middle" font-size="14">Chưa có dữ liệu đồ thị</text>
    </svg>`;
  }

  // đường giới hạn trên đồ thị: Alarm/Bypass (higher), mức tối thiểu (lower), biên dải (range)
  const t = metricThreshold(metric, profile);
  let alarmLimit: number | undefined;
  let bypassLimit: number | undefined;
  let alarmLabel = 'Ngưỡng Alarm';
  let bypassLabel = 'Ngưỡng Bypass';
  if (metric.warningDirection === 'range' && t) {
    alarmLimit = t.max;
    bypassLimit = t.min;
    alarmLabel = 'Giới hạn trên';
    bypassLabel = 'Giới hạn dưới';
  } else if (metric.warningDirection === 'lower') {
    alarmLimit = t?.value ?? metric.alarm;
    alarmLabel = t ? 'Mức tối thiểu' : 'Ngưỡng cảnh báo';
  } else if (metric.warningDirection === 'higher') {
    alarmLimit = metric.key === 'unbalance' ? (profile.unbAlarm_pct ?? metric.alarm) : metric.alarm;
    bypassLimit = metric.key === 'unbalance' ? (profile.unbBypass_pct ?? metric.bypass) : metric.bypass;
  }

  // Tìm min/max trục Y
  let allVals: number[] = [];
  points.forEach((p) => {
    if (p.phaseA !== null) allVals.push(p.phaseA);
    if (p.phaseB !== null) allVals.push(p.phaseB);
    if (p.phaseC !== null) allVals.push(p.phaseC);
  });
  if (alarmLimit && Number.isFinite(alarmLimit)) allVals.push(alarmLimit);
  if (bypassLimit && Number.isFinite(bypassLimit)) allVals.push(bypassLimit);

  let minY = Math.min(...allVals);
  let maxY = Math.max(...allVals);
  if (maxY === minY) maxY += Math.abs(maxY) * 0.05 || 1;
  if (metric.thresholdId) {
    // dải hẹp quanh danh định (khe hở, VAP): không kéo trục về 0, đệm 15% hai phía
    const pad = (maxY - minY) * 0.15;
    minY -= pad;
    maxY += pad;
  } else {
    minY = Math.min(0, minY);
    maxY = maxY * 1.15;
  }

  const scaleX = (idx: number) => {
    if (points.length <= 1) return padLeft + chartW / 2;
    return padLeft + (idx / (points.length - 1)) * chartW;
  };

  const scaleY = (val: number) => {
    return padTop + chartH - ((val - minY) / (maxY - minY)) * chartH;
  };

  // Các vạch trục Y (4 mức)
  const yTicks: { val: number; y: number }[] = [];
  for (let i = 0; i <= 4; i++) {
    const v = minY + (i / 4) * (maxY - minY);
    yTicks.push({ val: v, y: scaleY(v) });
  }

  // Tạo đường biểu diễn cho Pha A (Vàng), B (Xanh lá), C (Đỏ)
  const makePath = (key: 'phaseA' | 'phaseB' | 'phaseC') => {
    const valid = points
      .map((p, idx) => ({ x: scaleX(idx), y: p[key] !== null ? scaleY(p[key]!) : null, val: p[key] }))
      .filter((d) => d.y !== null);
    if (valid.length === 0) return '';
    return valid.map((d, i) => `${i === 0 ? 'M' : 'L'} ${d.x.toFixed(1)} ${d.y!.toFixed(1)}`).join(' ');
  };

  const pathA = makePath('phaseA');
  const pathB = makePath('phaseB');
  const pathC = makePath('phaseC');

  // Ngưỡng Alarm / Bypass
  const alarmY = alarmLimit ? scaleY(alarmLimit) : null;
  const bypassY = bypassLimit ? scaleY(bypassLimit) : null;

  return `
  <svg viewBox="0 0 ${W} ${H}" width="100%" class="trend-chart-svg">
    <!-- Tiêu đề & Chú giải -->
    <g transform="translate(${padLeft}, 25)">
      <text x="0" y="0" fill="#f8fafc" font-size="13" font-weight="bold">${metric.shortTitle} (${metric.unit}) qua các năm</text>
      <g transform="translate(${chartW - 270}, -4)" font-size="11">
        <circle cx="0" cy="0" r="4" fill="#f59e0b"/>
        <text x="8" y="4" fill="#f59e0b">Pha A</text>

        <circle cx="55" cy="0" r="4" fill="#10b981"/>
        <text x="63" y="4" fill="#10b981">Pha B</text>

        <circle cx="110" cy="0" r="4" fill="#ef4444"/>
        <text x="118" y="4" fill="#ef4444">Pha C</text>

        ${alarmLimit ? `
        <line x1="165" y1="0" x2="185" y2="0" stroke="#f59e0b" stroke-dasharray="3,2" stroke-width="2"/>
        <text x="190" y="4" fill="#fbbf24">${metric.warningDirection === 'range' ? 'Giới hạn' : 'Ngưỡng'}</text>
        ` : ''}
      </g>
    </g>

    <!-- Đường lưới ngang trục Y -->
    ${yTicks
      .map(
        (t) => `
      <line x1="${padLeft}" y1="${t.y.toFixed(1)}" x2="${padLeft + chartW}" y2="${t.y.toFixed(1)}" stroke="rgba(255,255,255,0.08)" stroke-dasharray="2,2"/>
      <text x="${padLeft - 8}" y="${(t.y + 4).toFixed(1)}" fill="#94a3b8" font-size="10" text-anchor="end">${t.val.toFixed(metric.unit === '%' ? 2 : 1)}</text>
    `,
      )
      .join('')}

    <!-- Đường giới hạn Cảnh báo (Alarm) -->
    ${
      alarmY && alarmY >= padTop && alarmY <= padTop + chartH
        ? `
      <line x1="${padLeft}" y1="${alarmY.toFixed(1)}" x2="${padLeft + chartW}" y2="${alarmY.toFixed(1)}" stroke="#f59e0b" stroke-width="1.8" stroke-dasharray="5,3"/>
      <text x="${padLeft + chartW - 4}" y="${(alarmY - 5).toFixed(1)}" fill="#fbbf24" font-size="10" font-weight="bold" text-anchor="end">${alarmLabel} (${alarmLimit} ${metric.unit})</text>
    `
        : ''
    }

    <!-- Đường giới hạn Nguy hiểm (Bypass) -->
    ${
      bypassY && bypassY >= padTop && bypassY <= padTop + chartH
        ? `
      <line x1="${padLeft}" y1="${bypassY.toFixed(1)}" x2="${padLeft + chartW}" y2="${bypassY.toFixed(1)}" stroke="#ef4444" stroke-width="1.8" stroke-dasharray="5,3"/>
      <text x="${padLeft + chartW - 4}" y="${(bypassY - 5).toFixed(1)}" fill="#ef4444" font-size="10" font-weight="bold" text-anchor="end">${bypassLabel} (${bypassLimit} ${metric.unit})</text>
    `
        : ''
    }

    <!-- Các đường xu hướng của 3 pha -->
    ${pathA ? `<path d="${pathA}" fill="none" stroke="#f59e0b" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>` : ''}
    ${pathB ? `<path d="${pathB}" fill="none" stroke="#10b981" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>` : ''}
    ${pathC ? `<path d="${pathC}" fill="none" stroke="#ef4444" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>` : ''}

    <!-- Các điểm tròn (Data Markers) và Nhãn trục X -->
    ${points
      .map((p, idx) => {
        const x = scaleX(idx);
        const yA = p.phaseA !== null ? scaleY(p.phaseA) : null;
        const yB = p.phaseB !== null ? scaleY(p.phaseB) : null;
        const yC = p.phaseC !== null ? scaleY(p.phaseC) : null;

        return `
        <!-- Trục X nhãn -->
        <line x1="${x.toFixed(1)}" y1="${padTop + chartH}" x2="${x.toFixed(1)}" y2="${padTop + chartH + 5}" stroke="#64748b"/>
        <text x="${x.toFixed(1)}" y="${padTop + chartH + 18}" fill="#e2e8f0" font-size="10" text-anchor="middle" font-weight="500">${escSvg(p.yearLabel)}${p.source === 'manual' ? ' ✎' : ''}</text>
        <text x="${x.toFixed(1)}" y="${padTop + chartH + 30}" fill="#94a3b8" font-size="9" text-anchor="middle">${escSvg(p.date)}</text>

        <!-- Marker Pha A -->
        ${yA !== null ? `
          <circle cx="${x.toFixed(1)}" cy="${yA.toFixed(1)}" r="4.5" fill="#f59e0b" stroke="#0f172a" stroke-width="1.5">
            <title>Pha A: ${p.phaseA} ${metric.unit} (${p.date})</title>
          </circle>
          <text x="${x.toFixed(1)}" y="${(yA - 8).toFixed(1)}" fill="#fbbf24" font-size="9" text-anchor="middle" font-weight="600">${p.phaseA}</text>
        ` : ''}

        <!-- Marker Pha B -->
        ${yB !== null ? `
          <circle cx="${x.toFixed(1)}" cy="${yB.toFixed(1)}" r="4.5" fill="#10b981" stroke="#0f172a" stroke-width="1.5">
            <title>Pha B: ${p.phaseB} ${metric.unit} (${p.date})</title>
          </circle>
          <text x="${x.toFixed(1)}" y="${(yB - 8).toFixed(1)}" fill="#34d399" font-size="9" text-anchor="middle" font-weight="600">${p.phaseB}</text>
        ` : ''}

        <!-- Marker Pha C -->
        ${yC !== null ? `
          <circle cx="${x.toFixed(1)}" cy="${yC.toFixed(1)}" r="4.5" fill="#ef4444" stroke="#0f172a" stroke-width="1.5">
            <title>Pha C: ${p.phaseC} ${metric.unit} (${p.date})</title>
          </circle>
          <text x="${x.toFixed(1)}" y="${(yC - 8).toFixed(1)}" fill="#f87171" font-size="9" text-anchor="middle" font-weight="600">${p.phaseC}</text>
        ` : ''}
      `;
      })
      .join('')}
  </svg>
  `;
}

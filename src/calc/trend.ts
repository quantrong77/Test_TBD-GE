/**
 * Module phân tích xu hướng kỹ thuật qua các năm (Trend Analytics).
 * Phân tích biến thiên đa kỳ thí nghiệm:
 * - Sau lắp đặt (Commissioning)
 * - Sau 1 năm (After 1 Year)
 * - Định kỳ hàng năm (Periodic)
 *
 * Tham số theo dõi:
 * 1. %ΔC Mất cân bằng qua TAG (Mục 1.B)
 * 2. Rcd Chống sét van MOV quy đổi 20°C (Mục 2)
 * 3. Rdc Cuộn kháng quy đổi 75°C (Mục 3)
 * 4. Điện dung C1 và tan δ Sứ xuyên (Mục 4)
 */

import type { Profile, Session, Measurement, Result } from '../types';
import { unbalance } from './unbalance';
import { tempCorrectRcd, tempCorrectRdc } from './temp-correction';

export type TrendMetricKey = 'unbalance' | 'mov_rcd' | 'reactor_rdc' | 'bushing_c1' | 'bushing_tan';

export interface TrendDataPoint {
  id: string;
  sessionId?: string;
  date: string;
  yearLabel: string;
  sessionType: 'after_install' | 'after_1y' | 'periodic' | 'commissioning';
  phaseA: number | null;
  phaseB: number | null;
  phaseC: number | null;
  note?: string;
}

export interface MetricDefinition {
  key: TrendMetricKey;
  title: string;
  shortTitle: string;
  itemCode: string;
  unit: string;
  nominal?: number;
  alarm?: number;
  bypass?: number;
  warningDirection: 'higher' | 'lower' | 'deviation';
  description: string;
}

export const METRIC_DEFS: Record<TrendMetricKey, MetricDefinition> = {
  unbalance: {
    key: 'unbalance',
    title: 'Dòng mất cân bằng %ΔC qua TAG',
    shortTitle: '%ΔC Mất cân bằng',
    itemCode: '1.B',
    unit: '%',
    alarm: 0.40,
    bypass: 0.65,
    warningDirection: 'higher',
    description: 'Theo dõi độ lệch dòng vi sai qua TAG. Ngưỡng Alarm 0.40%, Bypass 0.65%.',
  },
  mov_rcd: {
    key: 'mov_rcd',
    title: 'Điện trở cách điện MOV (Rcd quy đổi 20°C)',
    shortTitle: 'MOV Rcd (20°C)',
    itemCode: '2',
    unit: 'MΩ',
    nominal: 2000,
    alarm: 1000,
    warningDirection: 'lower',
    description: 'Điện trở cách điện cột chống sét van MOV quy đổi về 20°C. Tiêu chuẩn ≥ 2000 MΩ.',
  },
  reactor_rdc: {
    key: 'reactor_rdc',
    title: 'Điện trở một chiều cuộn kháng (Rdc quy đổi 75°C)',
    shortTitle: 'Kháng Rdc (75°C)',
    itemCode: '3',
    unit: 'mΩ',
    warningDirection: 'deviation',
    description: 'Điện trở một chiều cuộn kháng cản dịu (Al) quy đổi về 75°C. Sai lệch ≤ 2% so với xuất xưởng.',
  },
  bushing_c1: {
    key: 'bushing_c1',
    title: 'Điện dung sứ xuyên C1',
    shortTitle: 'Sứ C1',
    itemCode: '4',
    unit: 'pF',
    warningDirection: 'deviation',
    description: 'Điện dung C1 sứ xuyên nền tảng. Giới hạn sai lệch ≤ 5% so với giá trị ban đầu.',
  },
  bushing_tan: {
    key: 'bushing_tan',
    title: 'Tổn hao điện môi sứ xuyên tan δ',
    shortTitle: 'Sứ tan δ',
    itemCode: '4',
    unit: '%',
    alarm: 0.50,
    bypass: 0.70,
    warningDirection: 'higher',
    description: 'Hệ số tổn hao điện môi tan δ của sứ xuyên. Giới hạn tiêu chuẩn EVN ≤ 0.50%.',
  },
};

/** Dữ liệu lịch sử mặc định (mẫu chuẩn nghiệm thu EVNNPT) */
export function getBenchmarkHistory(profileId: string): TrendDataPoint[] {
  if (profileId.includes('503') || profileId.includes('PLEIKU')) {
    return [
      {
        id: 'bench-2023',
        date: '2023-04-10',
        yearLabel: '2023 (Lắp đặt)',
        sessionType: 'after_install',
        phaseA: 0.08,
        phaseB: 0.09,
        phaseC: 0.07,
        note: 'Nghiệm thu đóng điện lần đầu',
      },
      {
        id: 'bench-2024',
        date: '2024-05-15',
        yearLabel: '2024 (Sau 1 năm)',
        sessionType: 'after_1y',
        phaseA: 0.12,
        phaseB: 0.14,
        phaseC: 0.11,
        note: 'Kiểm tra định kỳ sau 1 năm vận hành',
      },
      {
        id: 'bench-2025',
        date: '2025-06-20',
        yearLabel: '2025 (Định kỳ)',
        sessionType: 'periodic',
        phaseA: 0.16,
        phaseB: 0.19,
        phaseC: 0.15,
        note: 'Định kỳ năm 2025 - Vận hành an toàn',
      },
    ];
  }

  // Mặc định chung cho các trạm khác (Di Linh, Đắk Nông...)
  return [
    {
      id: 'bench-init',
      date: '2023-11-20',
      yearLabel: '2023 (Lắp đặt)',
      sessionType: 'after_install',
      phaseA: 0.09,
      phaseB: 0.10,
      phaseC: 0.08,
      note: 'Sau lắp đặt',
    },
    {
      id: 'bench-y1',
      date: '2024-11-25',
      yearLabel: '2024 (Sau 1 năm)',
      sessionType: 'after_1y',
      phaseA: 0.14,
      phaseB: 0.15,
      phaseC: 0.12,
      note: 'Định kỳ sau 1 năm',
    },
  ];
}

/** Trích xuất số liệu từ các phiên thí nghiệm trong IndexedDB */
export function extractTrendFromSessions(
  sessions: Session[],
  allMeasurements: Measurement[],
  metricKey: TrendMetricKey,
  profile: Profile,
): TrendDataPoint[] {
  // Lọc các phiên thuộc profile này, sắp xếp theo thời gian
  const profSessions = sessions
    .filter((s) => s.profileId === profile.id)
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);

  const points: TrendDataPoint[] = [];

  for (const s of profSessions) {
    const meas = allMeasurements.filter((m) => m.sessionId === s.id);
    const getVal = (ph: string, key: string): number | null => {
      const found = meas.find((m) => m.key === `${ph}.${key}` || m.key === key);
      if (!found || !found.value) return null;
      const num = parseFloat(found.value.replace(',', '.'));
      return Number.isFinite(num) ? num : null;
    };

    let pA: number | null = null;
    let pB: number | null = null;
    let pC: number | null = null;

    if (metricKey === 'unbalance') {
      const calcPct = (ph: string): number | null => {
        const u = getVal(ph, 'U');
        const isum = getVal(ph, 'Isum');
        const ig1 = getVal(ph, 'IG1');
        const ig2 = getVal(ph, 'IG2');
        const idx10 = getVal(ph, 'Idx10');
        const unit = meas.find((m) => m.key === `${ph}.unit`)?.value || 'mA';
        if (u && isum && ig1 && ig2 && idx10 !== null) {
          const res = unbalance({
            U: u,
            Isum: isum,
            IG1: ig1,
            IG2: ig2,
            Idx10: idx10,
            IdxUnit: unit as any,
          });
          return res ? Number(res.pct.toFixed(3)) : null;
        }
        return null;
      };
      pA = calcPct('A');
      pB = calcPct('B');
      pC = calcPct('C');
    } else if (metricKey === 'mov_rcd') {
      const getRcd = (ph: string): number | null => {
        const raw = getVal(ph, 'Rmov') ?? getVal(ph, 'Rcd');
        const t = getVal(ph, 't') ?? 25;
        if (raw !== null) {
          const cor = tempCorrectRcd(raw, t, 20);
          return cor ? Number(cor.R_ref.toFixed(0)) : raw;
        }
        return null;
      };
      pA = getRcd('A');
      pB = getRcd('B');
      pC = getRcd('C');
    } else if (metricKey === 'reactor_rdc') {
      const getRdc = (ph: string): number | null => {
        const raw = getVal(ph, 'Rdc');
        const t = getVal(ph, 't') ?? 25;
        if (raw !== null) {
          const cor = tempCorrectRdc(raw, t, 75, 'Al');
          return cor ? Number(cor.R_75.toFixed(3)) : raw;
        }
        return null;
      };
      pA = getRdc('A');
      pB = getRdc('B');
      pC = getRdc('C');
    } else if (metricKey === 'bushing_c1') {
      pA = getVal('A', 'C1');
      pB = getVal('B', 'C1');
      pC = getVal('C', 'C1');
    } else if (metricKey === 'bushing_tan') {
      pA = getVal('A', 'tan');
      pB = getVal('B', 'tan');
      pC = getVal('C', 'tan');
    }

    if (pA !== null || pB !== null || pC !== null) {
      const d = s.date;
      const yr = d.slice(0, 4);
      points.push({
        id: s.id,
        sessionId: s.id,
        date: s.date,
        yearLabel: `${yr} (${s.type === 'after_install' ? 'Lắp đặt' : s.type === 'after_1y' ? 'Sau 1 năm' : 'Định kỳ'})`,
        sessionType: s.type,
        phaseA: pA,
        phaseB: pB,
        phaseC: pC,
        note: s.conclusion,
      });
    }
  }

  return points;
}

export interface TrendAnalysis {
  annualDriftRate: number | null; // Tốc độ biến thiên trung bình mỗi năm (%/năm hoặc đơn vị/năm)
  latestA: number | null;
  latestB: number | null;
  latestC: number | null;
  verdict: Result;
  verdictText: string;
  projectedAlarmYears?: number | null;
  recommendation: string;
}

/** Phân tích tốc độ tăng trưởng và đưa ra cảnh báo sớm */
export function analyzeTrendSeries(
  points: TrendDataPoint[],
  metric: MetricDefinition,
  profile: Profile,
): TrendAnalysis {
  if (!points.length) {
    return {
      annualDriftRate: null,
      latestA: null,
      latestB: null,
      latestC: null,
      verdict: 'na',
      verdictText: 'Chưa có dữ liệu lịch sử',
      recommendation: 'Cần thực hiện thí nghiệm để bắt đầu lập hồ sơ xu hướng.',
    };
  }

  const latest = points[points.length - 1];
  const first = points[0];

  const lA = latest.phaseA;
  const lB = latest.phaseB;
  const lC = latest.phaseC;

  const maxVal = Math.max(lA ?? -Infinity, lB ?? -Infinity, lC ?? -Infinity);

  // Tính số năm chênh lệch giữa đợt đầu và đợt cuối
  const tFirst = new Date(first.date).getTime();
  const tLast = new Date(latest.date).getTime();
  const yearDiff = Math.max(0.2, (tLast - tFirst) / (365.25 * 86400000));

  let driftRate: number | null = null;
  if (points.length >= 2) {
    const fMax = Math.max(first.phaseA ?? 0, first.phaseB ?? 0, first.phaseC ?? 0);
    driftRate = Number(((maxVal - fMax) / yearDiff).toFixed(4));
  }

  const alarmLimit = metric.key === 'unbalance' ? (profile.unbAlarm_pct ?? metric.alarm ?? 0.40) : (metric.alarm ?? Infinity);
  const bypassLimit = metric.key === 'unbalance' ? (profile.unbBypass_pct ?? metric.bypass ?? 0.65) : (metric.bypass ?? Infinity);

  let verdict: Result = 'pass';
  let verdictText = 'Tình trạng tốt, độ ổn định cao';
  let recommendation = 'Duy trì chu kỳ thí nghiệm định kỳ theo quy trình.';
  let projectedAlarmYears: number | null = null;

  if (metric.warningDirection === 'higher') {
    if (maxVal >= bypassLimit) {
      verdict = 'fail';
      verdictText = 'VƯỢT NGƯỠNG BYPASS - NGUY HIỂM';
      recommendation = 'Kiểm tra tìm bình tụ hỏng ngay lập tức trên xe gàu.';
    } else if (maxVal >= alarmLimit) {
      verdict = 'warn';
      verdictText = 'ĐÃ CHẠM NGƯỠNG CẢNH BÁO ALARM';
      recommendation = 'Đo dòng từng string để khoanh vùng chuỗi có bình tụ suy giảm.';
    } else if (driftRate !== null && driftRate > 0.05) {
      verdict = 'warn';
      verdictText = 'Tốc độ tăng mất cân bằng nhanh (+ ' + driftRate + ' %/năm)';
      const remain = alarmLimit - maxVal;
      projectedAlarmYears = Number((remain / driftRate).toFixed(1));
      recommendation = `Dự báo chạm ngưỡng Cảnh báo trong ~ ${projectedAlarmYears} năm. Đưa vào diện theo dõi đặc biệt.`;
    }
  } else if (metric.warningDirection === 'lower') {
    const minVal = Math.min(lA ?? Infinity, lB ?? Infinity, lC ?? Infinity);
    if (minVal < (metric.alarm ?? 1000)) {
      verdict = 'fail';
      verdictText = 'CÁCH ĐIỆN SUY GIẢM DƯỚI TIÊU CHUẨN';
      recommendation = 'Cần vệ sinh, sấy cách điện hoặc thay thế cột MOV.';
    }
  }

  return {
    annualDriftRate: driftRate,
    latestA: lA,
    latestB: lB,
    latestC: lC,
    verdict,
    verdictText,
    projectedAlarmYears,
    recommendation,
  };
}

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
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="auto" class="trend-chart-svg">
      <rect width="${W}" height="${H}" fill="rgba(15,23,42,0.4)" rx="8"/>
      <text x="${W / 2}" y="${H / 2}" fill="#94a3b8" text-anchor="middle" font-size="14">Chưa có dữ liệu đồ thị</text>
    </svg>`;
  }

  const alarmLimit = metric.key === 'unbalance' ? (profile.unbAlarm_pct ?? metric.alarm ?? 0.40) : metric.alarm;
  const bypassLimit = metric.key === 'unbalance' ? (profile.unbBypass_pct ?? metric.bypass ?? 0.65) : metric.bypass;

  // Tìm min/max trục Y
  let allVals: number[] = [];
  points.forEach((p) => {
    if (p.phaseA !== null) allVals.push(p.phaseA);
    if (p.phaseB !== null) allVals.push(p.phaseB);
    if (p.phaseC !== null) allVals.push(p.phaseC);
  });
  if (alarmLimit && Number.isFinite(alarmLimit)) allVals.push(alarmLimit);
  if (bypassLimit && Number.isFinite(bypassLimit)) allVals.push(bypassLimit);

  let minY = Math.min(0, ...allVals);
  let maxY = Math.max(...allVals);
  if (maxY === minY) maxY += 1;
  // Đệm trục Y 15%
  maxY = maxY * 1.15;

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
  <svg viewBox="0 0 ${W} ${H}" width="100%" height="auto" class="trend-chart-svg" style="background: rgba(15,23,42,0.65); border-radius: 8px; border: 1px solid var(--c-border, #334155); display:block; font-family: sans-serif;">
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
        <text x="190" y="4" fill="#fbbf24">Alarm</text>
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
      <text x="${padLeft + chartW - 4}" y="${(alarmY - 5).toFixed(1)}" fill="#fbbf24" font-size="10" font-weight="bold" text-anchor="end">Ngưỡng Alarm (${alarmLimit} ${metric.unit})</text>
    `
        : ''
    }

    <!-- Đường giới hạn Nguy hiểm (Bypass) -->
    ${
      bypassY && bypassY >= padTop && bypassY <= padTop + chartH
        ? `
      <line x1="${padLeft}" y1="${bypassY.toFixed(1)}" x2="${padLeft + chartW}" y2="${bypassY.toFixed(1)}" stroke="#ef4444" stroke-width="1.8" stroke-dasharray="5,3"/>
      <text x="${padLeft + chartW - 4}" y="${(bypassY - 5).toFixed(1)}" fill="#ef4444" font-size="10" font-weight="bold" text-anchor="end">Ngưỡng Bypass (${bypassLimit} ${metric.unit})</text>
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
        <text x="${x.toFixed(1)}" y="${padTop + chartH + 18}" fill="#e2e8f0" font-size="10" text-anchor="middle" font-weight="500">${p.yearLabel}</text>
        <text x="${x.toFixed(1)}" y="${padTop + chartH + 30}" fill="#94a3b8" font-size="9" text-anchor="middle">${p.date}</text>

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

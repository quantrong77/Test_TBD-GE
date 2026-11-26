/**
 * Module phân tích xu hướng kỹ thuật qua các năm (Trend Analytics).
 * Phân tích biến thiên đa kỳ thí nghiệm:
 * - Sau lắp đặt (Commissioning)
 * - Sau 1 năm (After 1 Year)
 * - Định kỳ hàng năm (Periodic)
 *
 * Tham số theo dõi (14 chỉ số – mọi số đo có ý nghĩa theo thời gian):
 * 1. %ΔC mất cân bằng (1.B)
 * 2. MOV: Rcd, Rsu (quy đổi 20°C), tổn hao P (2)
 * 3. Kháng cản dịu: Rdc (75°C), Rcd (20°C), Z, L (3)
 * 4. Sứ xuyên: C1, tan δ (4)
 * 5. Khe hở TAG, VAP ENERGY mC / V, VAP CURRENT A (5)
 * Thử Trigger, bơm dòng CT là phép thử đạt/không đạt theo lần – không có xu hướng.
 * Ngưỡng lấy từ content/thresholds.json (và hồ sơ giàn khi ngưỡng có profileOverride).
 *
 * NGUỒN DỮ LIỆU – chỉ dùng số liệu thật, KHÔNG có dữ liệu mẫu viết cứng:
 * - Tự động: số đo trong các phiên thí nghiệm của hồ sơ giàn (IndexedDB `measurements`).
 * - Nhập tay: mốc lịch sử từ biên bản giấy trước khi dùng app (IndexedDB `trendHistory`).
 * Chưa có số liệu → đồ thị trống; có 1 đợt → 1 điểm; từ 2 đợt → tự vẽ đường xu hướng.
 */

import type { Profile, Session, Measurement, Result, Threshold } from '../types';
import { unbalance, type CurrentUnit } from './unbalance';
import { tempCorrectRcd, tempCorrectRdc } from './temp-correction';
import { parseNum } from './units';
import { evalThreshold, resolveThreshold } from './evaluate';
import thresholdsJson from '../../content/thresholds.json';

const TH = thresholdsJson as Threshold[];
const th = (id: string): Threshold => {
  const t = TH.find((x) => x.id === id);
  if (!t) throw new Error('Thiếu ngưỡng ' + id + ' trong content/thresholds.json');
  return t;
};

export const TREND_METRICS = [
  'unbalance',
  'mov_rcd',
  'mov_rsu',
  'mov_p',
  'reactor_rdc',
  'reactor_rcd',
  'reactor_z',
  'reactor_l',
  'bushing_c1',
  'bushing_tan',
  'tag_gap',
  'vap_mC',
  'vap_V',
  'vap_A',
] as const;
export type TrendMetricKey = (typeof TREND_METRICS)[number];

export type TrendSessionType = Session['type'];

export interface TrendDataPoint {
  id: string;
  sessionId?: string;
  date: string;
  yearLabel: string;
  sessionType: TrendSessionType;
  phaseA: number | null;
  phaseB: number | null;
  phaseC: number | null;
  note?: string;
  /** 'session' = trích từ phiên TN trong app; 'manual' = mốc lịch sử nhập tay */
  source?: 'session' | 'manual';
  /** true khi thiếu nhiệt độ → giá trị chưa quy đổi nhiệt độ */
  uncorrected?: boolean;
}

/** Mốc lịch sử nhập tay (bảng IndexedDB `trendHistory`), riêng cho từng hồ sơ giàn + chỉ số. */
export interface TrendHistoryRecord {
  id: string;
  profileId: string;
  metric: TrendMetricKey;
  date: string; // YYYY-MM-DD
  label: string;
  sessionType: TrendSessionType;
  phaseA: number | null;
  phaseB: number | null;
  phaseC: number | null;
  note?: string;
  createdAt: number;
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
  /** Giới hạn sai lệch (%) so với đợt đầu tiên (baseline) – dùng cho warningDirection 'deviation' */
  deviationPct?: number;
  /** Giới hạn thay đổi (%) so với đợt liền trước – warningDirection 'step' */
  stepPct?: number;
  /** Ngưỡng trong thresholds.json (dải cho phép – 'range'; mức tối thiểu – 'lower' theo hồ sơ giàn) */
  thresholdId?: string;
  /**
   * 'higher': càng cao càng xấu (alarm/bypass) · 'lower': càng thấp càng xấu
   * 'deviation': sai lệch so với đợt đầu · 'step': thay đổi so với đợt trước · 'range': phải nằm trong dải
   */
  warningDirection: 'higher' | 'lower' | 'deviation' | 'step' | 'range';
  description: string;
}

const STEP = th('trend_step').value!;
const defs: MetricDefinition[] = [
  {
    key: 'unbalance',
    title: 'Dòng mất cân bằng %ΔC qua TAG',
    shortTitle: '%ΔC Mất cân bằng',
    itemCode: '1.B',
    unit: '%',
    alarm: th('unb_alarm').value,
    bypass: th('unb_bypass').value,
    warningDirection: 'higher',
    description: 'Theo dõi độ lệch dòng vi sai qua TAG. Ngưỡng Alarm / Bypass lấy theo hồ sơ giàn.',
  },
  {
    key: 'mov_rcd',
    title: 'Điện trở cách điện MOV (Rcd quy đổi 20°C)',
    shortTitle: 'MOV Rcd (20°C)',
    itemCode: '2',
    unit: 'MΩ',
    nominal: th('trend_mov_rcd').value,
    alarm: th('trend_mov_rcd_alarm').value,
    warningDirection: 'lower',
    description: `Điện trở cách điện cột chống sét van MOV quy đổi về 20°C. Tiêu chuẩn ≥ ${th('trend_mov_rcd').value} MΩ, cảnh báo < ${th('trend_mov_rcd_alarm').value} MΩ.`,
  },
  {
    key: 'mov_rsu',
    title: 'Điện trở cách điện sứ đỡ MOV (Rsu quy đổi 20°C)',
    shortTitle: 'MOV Rsu (20°C)',
    itemCode: '2',
    unit: 'MΩ',
    stepPct: STEP,
    warningDirection: 'step',
    description: `Điện trở cách điện sứ đỡ quy đổi về 20°C. Cảnh báo khi thay đổi > ${STEP} % so với đợt trước.`,
  },
  {
    key: 'mov_p',
    title: 'Tổn hao công suất MOV (P)',
    shortTitle: 'MOV tổn hao P',
    itemCode: '2',
    unit: 'W',
    stepPct: STEP,
    warningDirection: 'step',
    description: `Tổn hao công suất cột MOV. Cảnh báo khi thay đổi > ${STEP} % so với đợt trước.`,
  },
  {
    key: 'reactor_rdc',
    title: 'Điện trở một chiều cuộn kháng (Rdc quy đổi 75°C)',
    shortTitle: 'Kháng Rdc (75°C)',
    itemCode: '3',
    unit: 'mΩ',
    deviationPct: th('trend_rdc_dev').value,
    warningDirection: 'deviation',
    description: `Điện trở một chiều cuộn kháng cản dịu (Al) quy đổi về 75°C. Sai lệch ≤ ${th('trend_rdc_dev').value}% so với đợt đầu tiên (xuất xưởng / lắp đặt).`,
  },
  {
    key: 'reactor_rcd',
    title: 'Điện trở cách điện cuộn kháng (Rcd quy đổi 20°C)',
    shortTitle: 'Kháng Rcd (20°C)',
    itemCode: '3',
    unit: 'MΩ',
    stepPct: STEP,
    warningDirection: 'step',
    description: `Điện trở cách điện cuộn kháng quy đổi về 20°C. Cảnh báo khi thay đổi > ${STEP} % so với đợt trước.`,
  },
  {
    key: 'reactor_z',
    title: 'Tổng trở cuộn kháng Z',
    shortTitle: 'Kháng Z',
    itemCode: '3',
    unit: 'Ω',
    stepPct: STEP,
    warningDirection: 'step',
    description: `Tổng trở cuộn kháng cản dịu. Cảnh báo khi thay đổi > ${STEP} % so với đợt trước.`,
  },
  {
    key: 'reactor_l',
    title: 'Điện cảm cuộn kháng L',
    shortTitle: 'Kháng L',
    itemCode: '3',
    unit: 'mH',
    stepPct: STEP,
    warningDirection: 'step',
    description: `Điện cảm cuộn kháng cản dịu. Cảnh báo khi thay đổi > ${STEP} % so với đợt trước.`,
  },
  {
    key: 'bushing_c1',
    title: 'Điện dung sứ xuyên C1',
    shortTitle: 'Sứ C1',
    itemCode: '4',
    unit: 'pF',
    deviationPct: th('bushing_c1').value,
    warningDirection: 'deviation',
    description: `Điện dung C1 sứ xuyên. Giới hạn sai lệch ≤ ${th('bushing_c1').value}% so với đợt đầu tiên.`,
  },
  {
    key: 'bushing_tan',
    title: 'Tổn hao điện môi sứ xuyên tan δ',
    shortTitle: 'Sứ tan δ',
    itemCode: '4',
    unit: '%',
    alarm: th('trend_tan').value,
    bypass: th('trend_tan_bypass').value,
    warningDirection: 'higher',
    description: `Hệ số tổn hao điện môi tan δ của sứ xuyên. Cảnh báo > ${th('trend_tan').value}%, không đạt > ${th('trend_tan_bypass').value}%.`,
  },
  {
    key: 'tag_gap',
    title: 'Khe hở điện cực TAG',
    shortTitle: 'Khe hở TAG',
    itemCode: '5.A',
    unit: 'mm',
    thresholdId: 'tag_gap',
    warningDirection: 'range',
    description: 'Khe hở điện cực TAG phải nằm trong dải theo hồ sơ giàn (danh định ± dung sai).',
  },
  {
    key: 'vap_mC',
    title: 'VAP ENERGY (mC)',
    shortTitle: 'VAP mC',
    itemCode: '5.B',
    unit: 'mC',
    thresholdId: 'vap_mC',
    warningDirection: 'range',
    description: 'Ngưỡng năng lượng VAP (mC) theo hồ sơ giàn. Mỗi pha lấy bộ VAP (A/B) lệch xa danh định nhất.',
  },
  {
    key: 'vap_V',
    title: 'VAP ENERGY (V)',
    shortTitle: 'VAP V',
    itemCode: '5.B',
    unit: 'V',
    thresholdId: 'vap_V',
    warningDirection: 'lower',
    description: 'Điện áp ngưỡng năng lượng VAP – không thấp hơn mức tối thiểu theo hồ sơ giàn. Mỗi pha lấy bộ VAP thấp hơn.',
  },
  {
    key: 'vap_A',
    title: 'VAP CURRENT (A)',
    shortTitle: 'VAP A',
    itemCode: '5.B',
    unit: 'A',
    thresholdId: 'vap_A',
    warningDirection: 'range',
    description: 'Ngưỡng dòng VAP (trị tuyệt đối) theo hồ sơ giàn. Mỗi pha lấy bộ VAP (A/B) lệch xa danh định nhất.',
  },
];
export const METRIC_DEFS = Object.fromEntries(defs.map((d) => [d.key, d])) as Record<TrendMetricKey, MetricDefinition>;

/** Nhóm hiển thị theo hạng mục (ô chọn chỉ số). */
export const METRIC_GROUPS: [string, TrendMetricKey[]][] = [
  ['1. Tụ & Group tụ', ['unbalance']],
  ['2. MOV', ['mov_rcd', 'mov_rsu', 'mov_p']],
  ['3. Kháng cản dịu', ['reactor_rdc', 'reactor_rcd', 'reactor_z', 'reactor_l']],
  ['4. Sứ xuyên', ['bushing_c1', 'bushing_tan']],
  ['5. VAP / TAG', ['tag_gap', 'vap_mC', 'vap_V', 'vap_A']],
];

/** Biểu mẫu chứa số liệu của từng chỉ số (khớp items.json / forms). key = khóa số đo sau "Pha.". */
export const METRIC_SOURCE: Record<TrendMetricKey, { itemId: string; testId: string; key: string }> = {
  unbalance: { itemId: '4.1', testId: 'unbalance', key: 'Idx10' },
  mov_rcd: { itemId: '4.2', testId: 'measure', key: 'Rmov' },
  mov_rsu: { itemId: '4.2', testId: 'measure', key: 'Rsu' },
  mov_p: { itemId: '4.2', testId: 'measure', key: 'P' },
  reactor_rdc: { itemId: '4.3', testId: 'measure', key: 'Rdc' },
  reactor_rcd: { itemId: '4.3', testId: 'measure', key: 'Rcd' },
  reactor_z: { itemId: '4.3', testId: 'measure', key: 'Z' },
  reactor_l: { itemId: '4.3', testId: 'measure', key: 'L' },
  bushing_c1: { itemId: '4.4', testId: 'measure', key: 'C1' },
  bushing_tan: { itemId: '4.4', testId: 'measure', key: 'tan' },
  tag_gap: { itemId: '4.5', testId: 'gap', key: 'gap' },
  vap_mC: { itemId: '4.5', testId: 'vap-threshold', key: 'mC' },
  vap_V: { itemId: '4.5', testId: 'vap-threshold', key: 'V' },
  vap_A: { itemId: '4.5', testId: 'vap-threshold', key: 'A' },
};

/** Ngưỡng đã áp hồ sơ giàn (chỉ số có thresholdId: khe hở TAG, VAP). */
export function metricThreshold(metric: MetricDefinition, profile: Profile): Threshold | null {
  return metric.thresholdId ? resolveThreshold(th(metric.thresholdId), profile) : null;
}

export const SESSION_TYPE_LABEL: Record<TrendSessionType, string> = {
  after_install: 'Lắp đặt',
  after_1y: 'Sau 1 năm',
  periodic: 'Định kỳ',
};

const PH = ['A', 'B', 'C'] as const;
type Ph = (typeof PH)[number];
const phaseKey = (ph: Ph) => `phase${ph}` as 'phaseA' | 'phaseB' | 'phaseC';
const round = (x: number, d: number) => Number(x.toFixed(d));

/**
 * Trích xuất số liệu xu hướng từ các phiên thí nghiệm của hồ sơ giàn.
 * Chỉ đọc số đo của đúng biểu mẫu nguồn (METRIC_SOURCE) để tránh lẫn khóa trùng tên giữa các hạng mục.
 */
export function extractTrendFromSessions(
  sessions: Session[],
  allMeasurements: Measurement[],
  metricKey: TrendMetricKey,
  profile: Profile,
): TrendDataPoint[] {
  const src = METRIC_SOURCE[metricKey];
  const profSessions = sessions
    .filter((s) => s.profileId === profile.id)
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);

  const points: TrendDataPoint[] = [];

  for (const s of profSessions) {
    // hạng mục bỏ chọn "Thực hiện" trong phiên → không đưa vào xu hướng (dù còn số liệu cũ)
    if (s.items && !s.items.includes(src.itemId)) continue;
    const vals: Record<string, string> = {};
    for (const m of allMeasurements) {
      if (m.sessionId === s.id && m.itemId === src.itemId && m.testId === src.testId) vals[m.key] = m.value;
    }
    const num = (k: string): number | null => {
      const x = parseNum(vals[k]);
      return Number.isFinite(x) ? x : null;
    };
    const temp = (ph: Ph) => num(`${ph}.t`) ?? num('t');
    let uncorrected = false;

    const valueFor = (ph: Ph): number | null => {
      switch (metricKey) {
        case 'unbalance': {
          const U = num(`${ph}.U`);
          const Isum = num(`${ph}.Isum`);
          const IG1 = num(`${ph}.IG1`);
          const IG2 = num(`${ph}.IG2`);
          const Idx10 = num(`${ph}.Idx10`);
          if (U == null || Isum == null || IG1 == null || IG2 == null || Idx10 == null) return null;
          const r = unbalance({ U, Isum, IG1, IG2, Idx10, IdxUnit: (vals[`${ph}.unit`] || 'mA') as CurrentUnit });
          return r ? round(r.pct, 3) : null;
        }
        case 'mov_rcd': {
          const raw = num(`${ph}.Rmov`);
          if (raw == null) return null;
          const t = temp(ph);
          const cor = t != null ? tempCorrectRcd(raw, t, 20) : null;
          if (!cor) uncorrected = true;
          return cor ? round(cor.R_ref, 0) : raw;
        }
        case 'reactor_rdc': {
          const raw = num(`${ph}.Rdc`);
          if (raw == null) return null;
          const t = temp(ph);
          const cor = t != null ? tempCorrectRdc(raw, t, 75, 'Al') : null;
          if (!cor) uncorrected = true;
          return cor ? round(cor.R_75, 3) : raw;
        }
        case 'mov_rsu':
        case 'reactor_rcd': {
          const raw = num(`${ph}.${src.key}`);
          if (raw == null) return null;
          const t = temp(ph);
          const cor = t != null ? tempCorrectRcd(raw, t, 20) : null;
          if (!cor) uncorrected = true;
          return cor ? round(cor.R_ref, 0) : raw;
        }
        case 'vap_mC':
        case 'vap_A': {
          // 2 bộ VAP mỗi pha → lấy giá trị lệch xa danh định nhất (bất lợi nhất)
          const t = metricThreshold(METRIC_DEFS[metricKey], profile)!;
          const nom = t.nominal ?? ((t.min ?? 0) + (t.max ?? 0)) / 2;
          const xs = ['VAP-A', 'VAP-B']
            .map((u) => num(`${ph}.${u}.${src.key}`))
            .filter((x): x is number => x !== null)
            .map((x) => (t.abs ? Math.abs(x) : x));
          return xs.length ? xs.reduce((a, b) => (Math.abs(b - nom) > Math.abs(a - nom) ? b : a)) : null;
        }
        case 'vap_V': {
          const xs = ['VAP-A', 'VAP-B'].map((u) => num(`${ph}.${u}.V`)).filter((x): x is number => x !== null);
          return xs.length ? Math.min(...xs) : null;
        }
        default:
          // C1, tan δ, tổn hao P, Z, L, khe hở TAG: lấy nguyên giá trị đo
          return num(`${ph}.${src.key}`);
      }
    };

    const [pA, pB, pC] = PH.map(valueFor);
    if (pA === null && pB === null && pC === null) continue;
    points.push({
      id: s.id,
      sessionId: s.id,
      date: s.date,
      yearLabel: `${s.date.slice(0, 4)} (${SESSION_TYPE_LABEL[s.type] ?? 'Định kỳ'})`,
      sessionType: s.type,
      phaseA: pA,
      phaseB: pB,
      phaseC: pC,
      note: [s.conclusion, uncorrected ? 'Thiếu nhiệt độ – chưa quy đổi' : ''].filter(Boolean).join(' · ') || undefined,
      source: 'session',
      uncorrected: uncorrected || undefined,
    });
  }

  return points;
}

/** Mốc lịch sử nhập tay → điểm đồ thị (chỉ lấy đúng hồ sơ + chỉ số). */
export function historyToPoints(records: TrendHistoryRecord[], profileId: string, metricKey: TrendMetricKey): TrendDataPoint[] {
  return records
    .filter((r) => r.profileId === profileId && r.metric === metricKey)
    .map((r) => ({
      id: r.id,
      date: r.date,
      yearLabel: r.label || r.date.slice(0, 4),
      sessionType: r.sessionType,
      phaseA: r.phaseA,
      phaseB: r.phaseB,
      phaseC: r.phaseC,
      note: r.note,
      source: 'manual' as const,
    }));
}

/** Gộp số liệu phiên + mốc nhập tay, sắp theo ngày (cùng ngày: mốc nhập tay trước). */
export function mergeTrendPoints(...lists: TrendDataPoint[][]): TrendDataPoint[] {
  return lists
    .flat()
    .filter((p) => p.phaseA !== null || p.phaseB !== null || p.phaseC !== null)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.source === 'manual' ? -1 : 0) - (b.source === 'manual' ? -1 : 0));
}

/** Kiểm tra một mốc nhập tay trước khi lưu. Trả về thông báo lỗi hoặc null. */
export function validateHistoryInput(date: string, values: (number | null)[], today = new Date().toISOString().slice(0, 10)): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'Ngày thí nghiệm không hợp lệ.';
  if (date > today) return 'Ngày thí nghiệm không được ở tương lai.';
  if (values.every((v) => v === null)) return 'Cần nhập số liệu ít nhất một pha.';
  if (values.some((v) => v !== null && (!Number.isFinite(v) || v < 0))) return 'Số liệu phải là số không âm.';
  return null;
}

export interface TrendAnalysis {
  pointCount: number;
  annualDriftRate: number | null; // Tốc độ biến thiên mỗi năm (đơn vị/năm) – pha biến thiên bất lợi nhất
  latestA: number | null;
  latestB: number | null;
  latestC: number | null;
  /** Giá trị bất lợi nhất ở đợt mới nhất (max với 'higher', min với 'lower', max |sai lệch| với 'deviation') */
  headline: { label: string; value: number | null; unit: string };
  /** Sai lệch lớn nhất so với đợt đầu tiên (%), cho chỉ số 'deviation' */
  maxDeviationPct?: number | null;
  verdict: Result;
  verdictText: string;
  projectedAlarmYears?: number | null;
  recommendation: string;
}

const YEAR_MS = 365.25 * 86400000;

/** Giá trị đầu & cuối của từng pha (bỏ qua đợt thiếu pha đó). */
function phaseSpans(points: TrendDataPoint[]) {
  return PH.map((ph) => {
    const k = phaseKey(ph);
    const has = points.filter((p) => p[k] !== null);
    if (!has.length) return null;
    const first = has[0];
    const last = has[has.length - 1];
    const years = (new Date(last.date).getTime() - new Date(first.date).getTime()) / YEAR_MS;
    return { ph, first: first[k]!, last: last[k]!, years, n: has.length };
  });
}

/** Phân tích tốc độ biến thiên và đưa ra cảnh báo sớm – chỉ dựa trên số liệu thật đã có. */
export function analyzeTrendSeries(points: TrendDataPoint[], metric: MetricDefinition, profile: Profile): TrendAnalysis {
  const pts = mergeTrendPoints(points);
  if (!pts.length) {
    return {
      pointCount: 0,
      annualDriftRate: null,
      latestA: null,
      latestB: null,
      latestC: null,
      headline: { label: 'Đợt mới nhất', value: null, unit: metric.unit },
      verdict: 'na',
      verdictText: 'Chưa có dữ liệu lịch sử',
      recommendation: `Số liệu sẽ tự hiển thị khi phiên thí nghiệm của giàn này có kết quả mục ${metric.itemCode}, hoặc thêm mốc lịch sử từ biên bản cũ.`,
    };
  }

  const latest = pts[pts.length - 1];
  const lv = [latest.phaseA, latest.phaseB, latest.phaseC].filter((x): x is number => x !== null);
  const spans = phaseSpans(pts).filter((s): s is NonNullable<typeof s> => !!s);
  // tốc độ chỉ tính khi pha có ≥ 2 đợt cách nhau ≥ ~1 tháng
  const rates = spans.filter((s) => s.n >= 2 && s.years >= 0.08).map((s) => (s.last - s.first) / s.years);

  let driftRate: number | null = null;
  let verdict: Result = 'pass';
  let verdictText = 'Tình trạng tốt, độ ổn định cao';
  let recommendation = 'Duy trì chu kỳ thí nghiệm định kỳ theo quy trình.';
  let projectedAlarmYears: number | null = null;
  let headline: TrendAnalysis['headline'] = { label: 'Đợt mới nhất (Max)', value: lv.length ? Math.max(...lv) : null, unit: metric.unit };
  let maxDeviationPct: number | null | undefined;

  if (metric.warningDirection === 'higher') {
    const alarmLimit = metric.key === 'unbalance' ? (profile.unbAlarm_pct ?? metric.alarm ?? Infinity) : (metric.alarm ?? Infinity);
    const bypassLimit = metric.key === 'unbalance' ? (profile.unbBypass_pct ?? metric.bypass ?? Infinity) : (metric.bypass ?? Infinity);
    const maxVal = headline.value ?? -Infinity;
    if (rates.length) driftRate = round(Math.max(...rates), 4);
    if (maxVal >= bypassLimit) {
      verdict = 'fail';
      verdictText = 'VƯỢT NGƯỠNG BYPASS - NGUY HIỂM';
      recommendation = metric.key === 'unbalance' ? 'Kiểm tra tìm bình tụ hỏng ngay lập tức trên xe gàu.' : 'Vượt giới hạn tiêu chuẩn – đánh giá thay thế thiết bị.';
    } else if (maxVal >= alarmLimit) {
      verdict = 'warn';
      verdictText = 'ĐÃ CHẠM NGƯỠNG CẢNH BÁO ALARM';
      recommendation = metric.key === 'unbalance' ? 'Đo dòng từng string để khoanh vùng chuỗi có bình tụ suy giảm.' : 'Rút ngắn chu kỳ thí nghiệm, theo dõi đặc biệt.';
    } else if (driftRate !== null && driftRate > 0.05) {
      verdict = 'warn';
      verdictText = `Tốc độ tăng nhanh (+${driftRate} ${metric.unit}/năm)`;
      if (Number.isFinite(alarmLimit)) {
        projectedAlarmYears = round((alarmLimit - maxVal) / driftRate, 1);
        recommendation = `Dự báo chạm ngưỡng Cảnh báo trong ~ ${projectedAlarmYears} năm. Đưa vào diện theo dõi đặc biệt.`;
      } else recommendation = 'Đưa vào diện theo dõi đặc biệt.';
    }
  } else if (metric.warningDirection === 'lower') {
    const minVal = lv.length ? Math.min(...lv) : null;
    headline = { label: 'Đợt mới nhất (Min)', value: minVal, unit: metric.unit };
    if (rates.length) driftRate = round(Math.min(...rates), 4);
    // mức tối thiểu theo hồ sơ giàn (VAP V) hoặc mức cảnh báo cố định (Rcd MOV)
    const floor = metricThreshold(metric, profile)?.value ?? metric.alarm;
    if (minVal !== null && floor !== undefined && minVal < floor) {
      verdict = 'fail';
      verdictText = metric.thresholdId ? `DƯỚI MỨC TỐI THIỂU (${floor} ${metric.unit})` : 'CÁCH ĐIỆN SUY GIẢM DƯỚI NGƯỠNG CẢNH BÁO';
      recommendation = metric.thresholdId ? 'Kiểm tra, hiệu chỉnh bộ VAP theo hướng dẫn GE.' : 'Cần vệ sinh, sấy cách điện hoặc thay thế cột MOV.';
    } else if (minVal !== null && metric.nominal !== undefined && minVal < metric.nominal) {
      verdict = 'warn';
      verdictText = 'Thấp hơn giá trị tiêu chuẩn';
      recommendation = 'Vệ sinh bề mặt, đo lại; rút ngắn chu kỳ theo dõi.';
    } else if (driftRate !== null && driftRate < 0 && floor !== undefined && minVal !== null) {
      projectedAlarmYears = round((minVal - floor) / -driftRate, 1);
      if (projectedAlarmYears < 5) {
        verdict = 'warn';
        verdictText = `Suy giảm nhanh (${driftRate} ${metric.unit}/năm)`;
        recommendation = `Dự báo xuống dưới ngưỡng cảnh báo trong ~ ${projectedAlarmYears} năm.`;
      }
    }
  } else if (metric.warningDirection === 'range') {
    // phải nằm trong dải (khe hở TAG, VAP mC/A): đánh giá đợt mới nhất + dự báo thời điểm ra khỏi dải
    const t = metricThreshold(metric, profile)!;
    const nom = t.nominal ?? ((t.min ?? 0) + (t.max ?? 0)) / 2;
    const worst = lv.length ? lv.reduce((a, b) => (Math.abs(b - nom) > Math.abs(a - nom) ? b : a)) : null;
    headline = { label: 'Đợt mới nhất (lệch xa danh định nhất)', value: worst, unit: metric.unit };
    if (rates.length) driftRate = round(rates.reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a)), 4);
    const out = lv.filter((x) => evalThreshold(t, x) === 'fail');
    if (out.length) {
      verdict = 'fail';
      verdictText = `NGOÀI DẢI CHO PHÉP (${t.min} – ${t.max} ${metric.unit})`;
      recommendation = metric.key === 'tag_gap' ? 'Chỉnh lại khe hở điện cực TAG (shim) theo hồ sơ giàn.' : 'Kiểm tra, hiệu chỉnh bộ VAP theo hướng dẫn GE.';
    } else {
      const years = spans
        .filter((s) => s.n >= 2 && s.years >= 0.08 && s.last !== s.first)
        .map((s) => {
          const r = (s.last - s.first) / s.years;
          return r > 0 ? ((t.max ?? Infinity) - s.last) / r : (s.last - (t.min ?? -Infinity)) / -r;
        })
        .filter((y) => Number.isFinite(y) && y >= 0);
      if (years.length) {
        projectedAlarmYears = round(Math.min(...years), 1);
        if (projectedAlarmYears < 5) {
          verdict = 'warn';
          verdictText = `Đang trôi về biên dải (${driftRate! > 0 ? '+' : ''}${driftRate} ${metric.unit}/năm)`;
          recommendation = `Dự báo ra khỏi dải cho phép trong ~ ${projectedAlarmYears} năm. Theo dõi đặc biệt.`;
        }
      }
    }
  } else if (metric.warningDirection === 'step') {
    // so với đợt liền trước của từng pha
    const steps = PH.map((ph) => {
      const k = phaseKey(ph);
      const has = pts.filter((p) => p[k] !== null);
      if (has.length < 2) return null;
      const prev = has[has.length - 2][k]!;
      return prev !== 0 ? ((has[has.length - 1][k]! - prev) / prev) * 100 : null;
    }).filter((x): x is number => x !== null);
    const maxStep = steps.length ? round(steps.reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a)), 2) : null;
    headline = { label: 'Thay đổi so với đợt trước', value: maxStep, unit: '%' };
    if (rates.length) driftRate = round(rates.reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a)), 4);
    const lim = metric.stepPct ?? Infinity;
    if (maxStep == null) {
      verdict = 'na';
      verdictText = 'Mới có 1 đợt – chưa có mốc so sánh';
      recommendation = 'Cần thêm ít nhất 1 đợt để so sánh với đợt trước.';
    } else if (Math.abs(maxStep) > lim) {
      verdict = 'warn';
      verdictText = `BẤT THƯỜNG: thay đổi ${maxStep > 0 ? '+' : ''}${maxStep} % > ${lim} % so với đợt trước`;
      recommendation = 'Kiểm tra lại phép đo (nhiệt độ, độ ẩm, đấu nối) và đánh giá theo QĐ 1901.';
    }
  } else {
    // 'deviation': so với đợt đầu tiên của từng pha (baseline)
    const devs = spans.filter((s) => s.n >= 2 && s.first !== 0).map((s) => ((s.last - s.first) / s.first) * 100);
    maxDeviationPct = devs.length ? round(devs.reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a)), 2) : null;
    headline = { label: 'Sai lệch so với đợt đầu', value: maxDeviationPct, unit: '%' };
    if (rates.length) driftRate = round(rates.reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a)), 4);
    const lim = metric.deviationPct ?? Infinity;
    if (maxDeviationPct == null) {
      verdict = 'na';
      verdictText = 'Mới có 1 đợt – chưa có mốc so sánh';
      recommendation = 'Đợt này được dùng làm baseline; cần thêm ít nhất 1 đợt để đánh giá sai lệch.';
    } else if (Math.abs(maxDeviationPct) > lim) {
      verdict = 'warn';
      verdictText = `SAI LỆCH ${maxDeviationPct > 0 ? '+' : ''}${maxDeviationPct} % > ${lim} %`;
      recommendation = 'Vượt giới hạn sai lệch so với baseline – kiểm tra lại phép đo và đánh giá theo QĐ 1901.';
    }
  }

  if (pts.length === 1 && verdict === 'pass') {
    verdictText = 'Mới có 1 đợt đo';
    recommendation = 'Cần thêm ít nhất 1 đợt (phiên mới hoặc mốc lịch sử) để vẽ đường xu hướng và tính tốc độ biến thiên.';
  }

  return {
    pointCount: pts.length,
    annualDriftRate: driftRate,
    latestA: latest.phaseA,
    latestB: latest.phaseB,
    latestC: latest.phaseC,
    headline,
    maxDeviationPct,
    verdict,
    verdictText,
    projectedAlarmYears,
    recommendation,
  };
}

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

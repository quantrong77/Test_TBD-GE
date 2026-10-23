import type { ProfileLimits, Result, Threshold } from '../types';

const EPS = 1e-9;

/** Áp hồ sơ giàn vào ngưỡng có profileOverride. */
export function resolveThreshold(t: Threshold, p?: Partial<ProfileLimits> & { tagGap_mm?: number; gapTol_mm?: number }): Threshold {
  if (!p || !t.profileOverride) return t;
  const range = (nom: number, tol: number): Threshold => ({ ...t, nominal: nom, tol, min: nom - tol, max: nom + tol });
  switch (t.id) {
    case 'unb_alarm':
      return p.unbAlarm_pct != null ? { ...t, value: p.unbAlarm_pct } : t;
    case 'unb_bypass':
      return p.unbBypass_pct != null ? { ...t, value: p.unbBypass_pct } : t;
    case 'vap_mC':
      return p.vap ? range(p.vap.mC[0], p.vap.mC[1]) : t;
    case 'vap_A':
      return p.vap ? range(p.vap.A[0], p.vap.A[1]) : t;
    case 'vap_V':
      return p.vap ? { ...t, value: p.vap.Vmin } : t;
    case 'tag_gap':
      return p.tagGap_mm ? range(p.tagGap_mm, p.gapTol_mm ?? t.tol ?? 2) : t;
    default:
      return t;
  }
}

export function evalThreshold(t: Threshold, value: number, profile?: Partial<ProfileLimits> & { tagGap_mm?: number; gapTol_mm?: number }): Result {
  if (!Number.isFinite(value)) return 'na';
  const r = resolveThreshold(t, profile);
  // vd VAP CURRENT: DPM hiển thị số âm, đánh giá theo trị tuyệt đối
  if (r.abs) value = Math.abs(value);
  switch (r.op) {
    case '<':
      return value < r.value! - EPS ? 'pass' : 'fail';
    case '<=':
      return value <= r.value! + EPS ? 'pass' : 'fail';
    case '>=':
      return value >= r.value! - EPS ? 'pass' : 'fail';
    case 'range':
      return value >= r.min! - EPS && value <= r.max! + EPS ? 'pass' : 'fail';
    case 'approx0':
      return Math.abs(value) <= r.value! + EPS ? 'pass' : 'fail';
  }
}

/** Văn bản mô tả khoảng Đạt. */
export function describeThreshold(t: Threshold): string {
  const n = (x?: number) => (x == null ? '' : x.toLocaleString('vi-VN', { maximumFractionDigits: 3 }));
  switch (t.op) {
    case '<':
      return `< ${n(t.value)} ${t.unit}`;
    case '<=':
      return `≤ ${n(t.value)} ${t.unit}`;
    case '>=':
      return `≥ ${n(t.value)} ${t.unit}`;
    case 'approx0':
      return `≈ 0 (|x| ≤ ${n(t.value)}) ${t.unit}`;
    case 'range':
      if (t.nominal != null && t.tol != null) return `${n(t.nominal)} ± ${n(t.tol)} ${t.unit} (${n(t.min)} – ${n(t.max)})`;
      return `${n(t.min)} – ${n(t.max)} ${t.unit}`;
  }
}

/** Trigger: 3 lần FIRE ở một cực tính; counts = [trước, sau lần 1, sau lần 2, sau lần 3] (ô trống bỏ qua). */
export function evalTrigger(fires: (boolean | null)[], counts: number[]): Result {
  if (fires.every((f) => f == null)) return 'na';
  if (fires.some((f) => f !== true)) return fires.some((f) => f === false) ? 'fail' : 'na';
  for (let i = 1; i < counts.length; i++) {
    if (Number.isFinite(counts[i]) && Number.isFinite(counts[i - 1]) && counts[i] - counts[i - 1] !== 1) return 'fail';
  }
  return 'pass';
}

export function bushingDeviation(measured: number, baseline: number): { pct: number; result: Result } {
  if (!Number.isFinite(measured) || !Number.isFinite(baseline) || baseline === 0) return { pct: NaN, result: 'na' };
  const pct = (Math.abs(measured - baseline) / baseline) * 100;
  return { pct: Math.round(pct * 1e6) / 1e6, result: pct <= 5 + EPS ? 'pass' : 'fail' };
}

export function evalCtPair(t: Threshold, a: number, b: number): Result {
  const ra = evalThreshold(t, a);
  const rb = evalThreshold(t, b);
  if (ra === 'fail' || rb === 'fail') return 'fail';
  if (ra === 'na' || rb === 'na') return 'na';
  return 'pass';
}

export function gapCheck(measured: number, nominal: number, tol = 2): Result {
  if (!Number.isFinite(measured) || !Number.isFinite(nominal)) return 'na';
  return Math.abs(measured - nominal) <= tol + EPS ? 'pass' : 'fail';
}

export function deltaPct(now: number, prev: number): number | null {
  if (!Number.isFinite(now) || !Number.isFinite(prev) || prev === 0) return null;
  return ((now - prev) / prev) * 100;
}

/** true nếu hạn kiểm định (YYYY-MM-DD) đã qua tại ngày thí nghiệm. */
export function calibOverdue(calibDue: string, testDate: string): boolean {
  if (!calibDue || !testDate) return false;
  return calibDue < testDate;
}

export function combine(results: Result[]): Result {
  const r = results.filter((x) => x !== 'na');
  if (!r.length) return 'na';
  if (r.includes('fail')) return 'fail';
  if (r.includes('warn')) return 'warn';
  return 'pass';
}

import type { Result } from '../types';
import { fmtFixed } from './units';

export type CurrentUnit = 'A' | 'mA' | 'uA';

const UNIT_SCALE: Record<CurrentUnit, number> = { A: 1, mA: 1e-3, uA: 1e-6 };

/** k = 10⁶ / (2πf): C[µF] = k · I[A] / U[V]. 3183.1 at 50 Hz. */
export const kFactor = (f = 50) => 1e6 / (2 * Math.PI * f);

export function bankCapacitance(p: { unitCap_uF: number; unitsPerString: number; stringsPerGroup: number; groupsPerPhase: number; f?: number }) {
  const string_uF = p.unitCap_uF / p.unitsPerString;
  const group_uF = string_uF * p.stringsPerGroup;
  const total_uF = group_uF * p.groupsPerPhase;
  const X_ohm = 1 / (2 * Math.PI * (p.f ?? 50) * total_uF * 1e-6);
  return { string_uF, group_uF, total_uF, X_ohm };
}

export interface UnbalanceInput {
  U: number;
  Isum: number;
  IG1: number;
  IG2: number;
  Idx10: number;
  IdxUnit: CurrentUnit;
  f?: number;
}

export interface UnbalanceResult {
  Csum: number;
  CG1: number;
  CG2: number;
  Id: number;
  dC: number;
  pct: number;
  crossCheck: number;
}

const finite = (...v: number[]) => v.every((x) => Number.isFinite(x));

/** Mục 9.1 – tính từ C = I/(ωU); IΔ×10 đọc trên cuộn 10 vòng nên chia 10. */
export function unbalance(p: UnbalanceInput): UnbalanceResult | null {
  if (!finite(p.U, p.Isum, p.IG1, p.IG2, p.Idx10) || p.U <= 0 || p.Isum <= 0) return null;
  const k = kFactor(p.f ?? 50);
  const Id = (Math.abs(p.Idx10) * UNIT_SCALE[p.IdxUnit]) / 10;
  const Csum = (k * p.Isum) / p.U;
  const CG1 = (k * p.IG1) / p.U;
  const CG2 = (k * p.IG2) / p.U;
  const dC = (k * Id) / p.U;
  const pct = (Id / p.Isum) * 100;
  return { Csum, CG1, CG2, Id, dC, pct, crossCheck: Math.abs(CG1 - CG2) };
}

export function unbalanceVerdict(pct: number, alarm: number, bypass: number): Result {
  if (!Number.isFinite(pct)) return 'na';
  if (pct >= bypass) return 'fail';
  if (pct >= alarm) return 'warn';
  return 'pass';
}

export function sanityChecks(r: UnbalanceResult, raw: { IG1: number; IG2: number; Isum: number }, nominal_uF?: number) {
  const warnings: string[] = [];
  const sumMismatchPct = (Math.abs(raw.IG1 + raw.IG2 - raw.Isum) / raw.Isum) * 100;
  if (sumMismatchPct > 2) warnings.push(`IG1 + IG2 lệch ${fmtFixed(sumMismatchPct, 1)} % so với I∑ (> 2 %) – kiểm tra kẹp dòng.`);
  // |CG1 − CG2| nên xấp xỉ ΔC; lệch lớn thường do sai chiều quấn hoặc sai đơn vị IΔ
  const ref = Math.max(r.dC, r.crossCheck);
  if (ref > 0.02 && Math.abs(r.crossCheck - r.dC) / ref > 0.5) {
    warnings.push(`|CG1 − CG2| = ${fmtFixed(r.crossCheck, 3)} µF khác nhiều so với ΔC = ${fmtFixed(r.dC, 3)} µF – kiểm tra chiều quấn cuộn 10 vòng / đơn vị IΔ.`);
  }
  let nominalDevPct: number | null = null;
  if (nominal_uF && nominal_uF > 0) nominalDevPct = ((r.Csum - nominal_uF) / nominal_uF) * 100;
  return { warnings, sumMismatchPct, nominalDevPct };
}

/** Chỉ số string có Is > trung bình + 2σ (σ tổng thể). Bỏ qua ô trống. */
export function stringOutliers(values: number[]): number[] {
  const v = values.map((x, i) => [x, i] as const).filter(([x]) => Number.isFinite(x));
  if (v.length < 3) return [];
  const mean = v.reduce((s, [x]) => s + x, 0) / v.length;
  const sd = Math.sqrt(v.reduce((s, [x]) => s + (x - mean) ** 2, 0) / v.length);
  if (sd === 0) return [];
  return v.filter(([x]) => x > mean + 2 * sd).map(([, i]) => i);
}

export interface StringAnalysis {
  count: number;
  mean: number;
  sd: number;
  min: number;
  max: number;
  upperLimit: number;
  lowerLimit: number;
  outliersHigh: number[];
  outliersLow: number[];
  outliers: number[];
}

export function analyzeStrings(values: number[]): StringAnalysis | null {
  const v = values.map((x, i) => [x, i] as const).filter(([x]) => Number.isFinite(x) && x > 0);
  if (v.length < 3) return null;
  const nums = v.map(([x]) => x);
  const mean = nums.reduce((s, x) => s + x, 0) / nums.length;
  const variance = nums.reduce((s, x) => s + (x - mean) ** 2, 0) / nums.length;
  const sd = Math.sqrt(variance);
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const upperLimit = mean + 2 * sd;
  const lowerLimit = Math.max(0, mean - 2 * sd);
  const outliersHigh = v.filter(([x]) => x > upperLimit).map(([, i]) => i);
  const outliersLow = v.filter(([x]) => sd > 0 && x < lowerLimit).map(([, i]) => i);
  const outliers = [...outliersHigh, ...outliersLow];
  return {
    count: nums.length,
    mean,
    sd,
    min,
    max,
    upperLimit,
    lowerLimit,
    outliersHigh,
    outliersLow,
    outliers,
  };
}

/**
 * Trả về thông tin vị trí vật lý của String trên giàn tụ GE 500 kV:
 * - Group 1: S1..S12 thuộc Stack 1; S13..S24 thuộc Stack 2
 * - Group 2: S1..S12 thuộc Stack 3; S13..S24 thuộc Stack 4
 */
export function stringLocation(group: 'G1' | 'G2', stringIndex: number): { stack: number; rack: number; stringInRack: number; label: string } {
  const sNum = stringIndex + 1; // 1-based (1..24)
  const isSecondHalf = sNum > 12;
  const stack = group === 'G1' ? (isSecondHalf ? 2 : 1) : (isSecondHalf ? 4 : 3);
  const localIndex = isSecondHalf ? sNum - 12 : sNum; // 1..12
  const rack = Math.ceil(localIndex / 4); // 1..3 (4 strings per rack)
  const stringInRack = ((localIndex - 1) % 4) + 1; // 1..4
  return {
    stack,
    rack,
    stringInRack,
    label: `Stack ${stack} · Rack ${rack} · Chuỗi ${stringInRack}`,
  };
}

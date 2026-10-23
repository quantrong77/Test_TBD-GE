import type { Result } from '../types';

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
  if (sumMismatchPct > 2) warnings.push(`IG1 + IG2 lệch ${sumMismatchPct.toFixed(1)} % so với I∑ (> 2 %) – kiểm tra kẹp dòng.`);
  // |CG1 − CG2| nên xấp xỉ ΔC; lệch lớn thường do sai chiều quấn hoặc sai đơn vị IΔ
  const ref = Math.max(r.dC, r.crossCheck);
  if (ref > 0.02 && Math.abs(r.crossCheck - r.dC) / ref > 0.5) {
    warnings.push(`|CG1 − CG2| = ${r.crossCheck.toFixed(3)} µF khác nhiều so với ΔC = ${r.dC.toFixed(3)} µF – kiểm tra chiều quấn cuộn 10 vòng / đơn vị IΔ.`);
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

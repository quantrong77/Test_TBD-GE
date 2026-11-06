/**
 * Quy đổi nhiệt độ điện trở cách điện (Rcd) và điện trở một chiều (Rdc)
 * Tiêu chuẩn áp dụng: QĐ 1901/QĐ-EVNNPT, IEEE Std 43, IEEE 62, IEC 60076.
 */

export interface RcdCorrectionResult {
  R_ref: number;     // Giá trị quy đổi về nhiệt độ chuẩn (mặc định 20°C)
  factor: number;    // Hệ số quy đổi Kt = 1.5^((t - t_ref)/10)
  t_meas: number;    // Nhiệt độ đo thực tế (°C)
  t_ref: number;     // Nhiệt độ chuẩn quy đổi (°C)
}

/**
 * Quy đổi điện trở cách điện Rcd về nhiệt độ chuẩn t_ref (mặc định 20°C).
 * Công thức EVN/TCVN: R_20 = R_t * 1.5^((t - 20)/10)
 */
export function tempCorrectRcd(R_meas: number, t_meas: number, t_ref = 20): RcdCorrectionResult | null {
  if (!Number.isFinite(R_meas) || !Number.isFinite(t_meas) || R_meas <= 0) return null;
  const factor = Math.pow(1.5, (t_meas - t_ref) / 10);
  const R_ref = R_meas * factor;
  return { R_ref, factor, t_meas, t_ref };
}

export type WireMaterial = 'Al' | 'Cu';

export interface RdcCorrectionResult {
  R_ref: number;     // Giá trị quy đổi về t_ref (mặc định 75°C)
  R_20: number;      // Giá trị quy đổi về 20°C
  R_75: number;      // Giá trị quy đổi về 75°C
  factor: number;    // Hệ số quy đổi Kt = (K + t_ref)/(K + t_meas)
  material: WireMaterial;
  t_meas: number;
  t_ref: number;
}

/**
 * Quy đổi điện trở một chiều Rdc cuộn kháng về nhiệt độ chuẩn.
 * Đối với cuộn kháng cản dịu giàn tụ GE: dây nhôm hoán vị bọc epoxy, K = 228.
 * Đối với dây đồng: K = 234.5.
 * Công thức: R_ref = R_t * (K + t_ref) / (K + t_meas)
 */
export function tempCorrectRdc(
  R_meas: number,
  t_meas: number,
  t_ref = 75,
  material: WireMaterial = 'Al',
): RdcCorrectionResult | null {
  if (!Number.isFinite(R_meas) || !Number.isFinite(t_meas) || R_meas <= 0) return null;
  const K = material === 'Al' ? 228 : 234.5;
  const factor = (K + t_ref) / (K + t_meas);
  const R_ref = R_meas * factor;
  const R_20 = R_meas * ((K + 20) / (K + t_meas));
  const R_75 = R_meas * ((K + 75) / (K + t_meas));
  return { R_ref, R_20, R_75, factor, material, t_meas, t_ref };
}

/**
 * Tính phần trăm chênh lệch giữa các pha hoặc so với lần trước:
 * delta% = ((R_meas - R_base) / R_base) * 100
 */
export function rDevPct(meas: number, base: number): number | null {
  if (!Number.isFinite(meas) || !Number.isFinite(base) || base === 0) return null;
  return ((meas - base) / base) * 100;
}

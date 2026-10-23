export const FTLB_TO_NM = 1.3558;

export const ftlbToNm = (ftlb: number) => ftlb * FTLB_TO_NM;

/** GAMMA RR10 – kẹp 8: 5 V = 10 kV. */
export const gammaKv = (v: number) => v * 2;
/** GAMMA RR10 – kẹp 7: 5 V = 6 mA. */
export const gammaMa = (v: number) => v * 1.2;

/** Bỏ dấu tiếng Việt + chữ thường, để tìm kiếm không phân biệt dấu. */
export function foldVi(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

/**
 * Parse số kiểu VN ("4,36", "1.234,5") hoặc quốc tế ("4.36", "1,234.5").
 * Chỉ có một dấu "." → thập phân (bàn phím số Android thường chỉ có "."); nhiều dấu "." → phân cách nghìn.
 */
export function parseNum(s: string | number | null | undefined): number {
  if (typeof s === 'number') return s;
  if (s == null) return NaN;
  let t = String(s).trim().replace(/[\s ]/g, '');
  const dots = (t.match(/\./g) ?? []).length;
  const commas = (t.match(/,/g) ?? []).length;
  if (dots && commas) {
    // dấu xuất hiện sau cùng là dấu thập phân
    t = t.lastIndexOf(',') > t.lastIndexOf('.') ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  } else if (commas === 1) t = t.replace(',', '.');
  else if (commas > 1) return NaN;
  else if (dots > 1) t = /^-?\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, '') : 'x';
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(t)) return NaN;
  return Number(t);
}

/** Số với đúng `digits` chữ số thập phân, dấu phẩy kiểu VN (vd 0,000). */
export function fmtFixed(x: number, digits: number): string {
  if (!Number.isFinite(x)) return '—';
  return x.toLocaleString('vi-VN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function fmt(x: number | null | undefined, digits = 3): string {
  if (x == null || !Number.isFinite(x)) return '—';
  return x.toLocaleString('vi-VN', { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

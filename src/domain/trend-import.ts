// Nhập mốc lịch sử xu hướng hàng loạt từ bảng (Excel/CSV) – hàm thuần, có test. Đọc file bằng SheetJS ở màn hình.
import { METRIC_DEFS, METRIC_SOURCE, SESSION_TYPE_LABEL, TREND_METRICS, type TrendHistoryRecord, type TrendMetricKey, type TrendSessionType } from '../calc/trend';
import { foldVi, localISODate, parseNum } from '../calc/units';
import type { Profile } from '../types';

export const IMPORT_HEADER = ['Ngày thí nghiệm', 'Mã hồ sơ giàn', 'Chỉ số', 'Loại đợt', 'Pha A', 'Pha B', 'Pha C', 'Tên đợt', 'Ghi chú / số biên bản giấy'] as const;

export interface ImportRow {
  /** số dòng trong file (tính cả dòng tiêu đề) – để báo lỗi */
  line: number;
  rec: Omit<TrendHistoryRecord, 'id' | 'createdAt'>;
}
export interface ImportResult {
  rows: ImportRow[];
  errors: { line: number; message: string }[];
  /** dòng trùng giàn + chỉ số + ngày với dòng phía dưới trong cùng file – bỏ, lấy dòng sau */
  duplicates: number[];
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Ô ngày: Date (SheetJS cellDates), số seri Excel, "dd/mm/yyyy", "yyyy-mm-dd". */
export function parseDateCell(x: unknown): string | null {
  if (x instanceof Date && !Number.isNaN(x.getTime())) return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
  if (typeof x === 'number' && x > 20000 && x < 80000) {
    // số seri ngày Excel (1900-based)
    const d = new Date(Math.round((x - 25569) * 86400000));
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  const s = String(x ?? '').trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  if (m) return valid(+m[3], +m[2], +m[1]);
  return null;
}
function valid(y: number, mo: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d ? `${y}-${pad(mo)}-${pad(d)}` : null;
}

const norm = (s: unknown) => foldVi(String(s ?? '')).toLowerCase().replace(/[^a-z0-9]+/g, '');

/** "mov_rcd", "MOV Rcd (20°C)", "Điện trở cách điện MOV…" → mã chỉ số. */
export function matchMetric(x: unknown): TrendMetricKey | null {
  const n = norm(x);
  if (!n) return null;
  for (const k of TREND_METRICS) {
    const d = METRIC_DEFS[k];
    if (norm(k) === n || norm(d.shortTitle) === n || norm(d.title) === n) return k;
  }
  return null;
}

/** "Lắp đặt" / "Sau 1 năm" / "Định kỳ" (hoặc mã) → loại đợt; trống = định kỳ. */
export function matchType(x: unknown): TrendSessionType | null {
  const n = norm(x);
  if (!n) return 'periodic';
  for (const [k, label] of Object.entries({ ...SESSION_TYPE_LABEL, after_install: 'Sau lắp đặt' })) if (norm(k) === n || norm(label) === n) return k as TrendSessionType;
  if (n === 'lapdat') return 'after_install';
  return null;
}

/** Mã hồ sơ giàn hoặc tên giàn ("TBD503") hoặc "TBD503 – T500 Pleiku 2". */
export function matchProfile(x: unknown, profiles: Profile[]): Profile | null {
  const n = norm(x);
  if (!n) return null;
  return profiles.find((p) => norm(p.id) === n) ?? profiles.find((p) => norm(`${p.bank}${p.station}`) === n) ?? (profiles.filter((p) => norm(p.bank) === n).length === 1 ? profiles.find((p) => norm(p.bank) === n)! : null);
}

function num(x: unknown): number | null | 'bad' {
  if (x === null || x === undefined || String(x).trim() === '') return null;
  const v = typeof x === 'number' ? x : parseNum(String(x));
  return Number.isFinite(v) && v >= 0 ? v : 'bad';
}

/**
 * Bảng (dòng 1 = tiêu đề, theo IMPORT_HEADER) → mốc lịch sử hợp lệ + danh sách lỗi theo dòng.
 * Dòng trống bị bỏ qua. Không ghi gì – màn hình hiển thị xem trước rồi mới lưu.
 */
export function parseTrendTable(table: unknown[][], profiles: Profile[], today = localISODate()): ImportResult {
  const rows: ImportRow[] = [];
  const errors: ImportResult['errors'] = [];
  table.slice(1).forEach((r, i) => {
    const line = i + 2;
    if (!r || r.every((c) => String(c ?? '').trim() === '')) return;
    const bad = (message: string) => errors.push({ line, message });
    const date = parseDateCell(r[0]);
    if (!date) return bad(`ngày "${String(r[0] ?? '')}" không hợp lệ (dùng dd/mm/yyyy)`);
    if (date > today) return bad('ngày ở tương lai');
    const prof = matchProfile(r[1], profiles);
    if (!prof) return bad(`không tìm thấy hồ sơ giàn "${String(r[1] ?? '')}"`);
    const metric = matchMetric(r[2]);
    if (!metric) return bad(`chỉ số "${String(r[2] ?? '')}" không có trong danh mục`);
    const type = matchType(r[3]);
    if (!type) return bad(`loại đợt "${String(r[3])}" không hợp lệ (Lắp đặt / Sau 1 năm / Định kỳ)`);
    const vals = [num(r[4]), num(r[5]), num(r[6])];
    if (vals.includes('bad')) return bad('số liệu pha phải là số không âm (VAP A ghi trị tuyệt đối)');
    if (vals.every((v) => v === null)) return bad('chưa có số liệu pha nào');
    const label = String(r[7] ?? '').trim().slice(0, 100) || `${date.slice(0, 4)} (${SESSION_TYPE_LABEL[type]})`;
    const note = String(r[8] ?? '').trim().slice(0, 500) || undefined;
    rows.push({
      line,
      rec: { profileId: prof.id, metric, date, label, sessionType: type, phaseA: vals[0] as number | null, phaseB: vals[1] as number | null, phaseC: vals[2] as number | null, ...(note ? { note } : {}) },
    });
  });
  // trong cùng file: dòng sau thay dòng trước (vd dòng sửa lại thêm ở cuối)
  const last = new Map<string, number>();
  rows.forEach((r, i) => last.set(historyKey(r.rec), i));
  const duplicates = rows.filter((r, i) => last.get(historyKey(r.rec)) !== i).map((r) => r.line);
  return { rows: rows.filter((r, i) => last.get(historyKey(r.rec)) === i), errors, duplicates };
}

/** Khóa trùng: cùng giàn + chỉ số + ngày → mốc nhập sau thay mốc cũ. */
export const historyKey = (r: Pick<TrendHistoryRecord, 'profileId' | 'metric' | 'date'>) => `${r.profileId}|${r.metric}|${r.date}`;

/** Bảng cho file mẫu: tiêu đề + danh mục chỉ số + hồ sơ giàn. */
export function templateSheets(profiles: Profile[]) {
  return {
    data: [[...IMPORT_HEADER]],
    metrics: [
      ['Mã chỉ số (cột "Chỉ số")', 'Tên', 'Đơn vị', 'Hạng mục', 'Lấy từ biểu mẫu'],
      ...TREND_METRICS.map((k) => [k, METRIC_DEFS[k].title, METRIC_DEFS[k].unit, METRIC_DEFS[k].itemCode, `${METRIC_SOURCE[k].itemId.slice(2)} / ${METRIC_SOURCE[k].testId}`]),
    ],
    profiles: [['Mã hồ sơ giàn (cột "Mã hồ sơ giàn")', 'Giàn', 'Trạm'], ...profiles.map((p) => [p.id, p.bank, p.station])],
    guide: [
      ['HƯỚNG DẪN NHẬP MỐC LỊCH SỬ XU HƯỚNG'],
      ['1. Nhập vào sheet "Mốc lịch sử", mỗi dòng = 1 đợt thí nghiệm của 1 chỉ số trên 1 giàn.'],
      ['2. Ngày: dd/mm/yyyy (hoặc ô kiểu ngày của Excel). Không nhập ngày tương lai.'],
      ['3. Mã hồ sơ giàn: xem sheet "Hồ sơ giàn" (có thể ghi tên giàn, vd TBD503, nếu không trùng).'],
      ['4. Chỉ số: ghi mã ở sheet "Danh mục chỉ số" (vd mov_rcd) hoặc tên ngắn.'],
      ['5. Loại đợt: Lắp đặt / Sau 1 năm / Định kỳ (trống = Định kỳ).'],
      ['6. Pha A/B/C: số không âm, dấu phẩy hoặc chấm thập phân; pha không có số liệu để trống. Điện trở cách điện ghi giá trị ĐÃ quy đổi 20 °C, Rdc đã quy đổi 75 °C.'],
      ['7. Cùng giàn + chỉ số + ngày đã có mốc → mốc trong file sẽ thay mốc cũ.'],
      ['Ví dụ: 15/03/2022 | TBD503-PLEIKU2 | mov_rcd | Định kỳ | 3200 | 3100 | 2950 | | BB số 12/2022'],
    ],
  };
}

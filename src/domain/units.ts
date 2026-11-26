// Đơn vị thí nghiệm (đầu biên bản) và đánh số biên bản – hàm thuần, có test.
import type { CrewMember, Session, Unit } from '../types';

/** Dùng khi Quản trị chưa khai đơn vị nào (không ghi vào CSDL để tránh tạo trùng giữa các máy). */
export const DEFAULT_UNIT: Unit = {
  id: 'default',
  orgName: 'Trung tâm Sửa chữa, thí nghiệm điện 3',
  name: 'Đội Sửa chữa, thí nghiệm điện Lâm Đồng',
  reportFormat: '{nn}/{yyyy}/BB-TN',
  numberStart: 1,
  numberYear: new Date().getFullYear(),
};

export const SAFETY_GRADES = [1, 2, 3, 4, 5] as const;

const yearOf = (date: string) => Number(date.slice(0, 4));

/**
 * Đơn vị của phiên khi đánh số. Phiên tạo lúc chưa khai đơn vị mang mã 'default' (hoặc không có):
 * nếu đội chỉ có MỘT đơn vị (`primary`) thì coi là của đơn vị đó – tránh đánh lại từ 01 và trùng số.
 */
const unitOf = (s: Pick<Session, 'unitId'>, primary: string | null) => {
  const id = s.unitId ?? DEFAULT_UNIT.id;
  return id === DEFAULT_UNIT.id && primary ? primary : id;
};

/**
 * Số biên bản kế tiếp của đơn vị trong năm của ngày thí nghiệm.
 * Năm Quản trị đặt số bắt đầu → không nhỏ hơn số đó; năm khác → bắt đầu lại từ 01.
 * Không bao giờ trùng/nhỏ hơn số đã dùng trên máy này.
 */
export function nextReportNo(
  unit: Pick<Unit, 'id' | 'numberStart' | 'numberYear'>,
  date: string,
  sessions: Pick<Session, 'id' | 'unitId' | 'date' | 'reportNo'>[],
  primary: string | null = null,
): number {
  const year = yearOf(date);
  const start = unit.numberYear === year ? Math.max(1, Math.floor(unit.numberStart)) : 1;
  const used = sessions.filter((s) => unitOf(s, primary) === unit.id && yearOf(s.date) === year && s.reportNo).map((s) => s.reportNo!);
  return used.length ? Math.max(start, Math.max(...used) + 1) : start;
}

/** "{nn}/{yyyy}/BB-TN" + 5, 2026 → "05/2026/BB-TN". */
export function formatReportNo(format: string, no: number | undefined, date: string): string {
  if (!no) return '';
  return (format || DEFAULT_UNIT.reportFormat).replace(/\{nn\}/g, String(no).padStart(2, '0')).replace(/\{yyyy\}/g, String(yearOf(date)));
}

/** Các phiên khác cùng đơn vị, cùng năm, cùng số (trùng do tạo offline trên 2 máy). `primary`: xem unitOf. */
export function duplicateReportNo(
  s: Pick<Session, 'id' | 'unitId' | 'date' | 'reportNo'>,
  sessions: Pick<Session, 'id' | 'unitId' | 'date' | 'reportNo'>[],
  primary: string | null = null,
) {
  if (!s.reportNo) return [];
  return sessions.filter((x) => x.id !== s.id && unitOf(x, primary) === unitOf(s, primary) && yearOf(x.date) === yearOf(s.date) && x.reportNo === s.reportNo);
}

/** "Nguyễn Văn A – Kỹ sư, bậc 4/5" */
export function crewLabel(c: { name: string; title?: string; safetyGrade?: number }): string {
  const extra = [c.title, c.safetyGrade ? `bậc ${c.safetyGrade}/5` : ''].filter(Boolean).join(', ');
  return extra ? `${c.name} (${extra})` : c.name;
}

/** "Lê Văn D, Kỹ sư, 4" (mỗi dòng 1 người) → người trong phiên. */
export function parseExtraCrew(text: string): CrewMember[] {
  return text
    .split('\n')
    .map((l) => l.split(',').map((x) => x.trim()))
    .filter((p) => p[0])
    .map(([name, title, g]) => {
      const grade = Number((g ?? '').replace(/\D/g, ''));
      // giới hạn 200 ký tự như kiểm tra dữ liệu (dài hơn → máy khác từ chối khi đồng bộ)
      return { name: name.slice(0, 200), ...(title ? { title: title.slice(0, 200) } : {}), ...(grade >= 1 && grade <= 5 ? { safetyGrade: grade } : {}) };
    });
}

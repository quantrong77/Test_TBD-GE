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
 * Số biên bản kế tiếp của đơn vị trong năm của ngày thí nghiệm.
 * Năm Quản trị đặt số bắt đầu → không nhỏ hơn số đó; năm khác → bắt đầu lại từ 01.
 * Không bao giờ trùng/nhỏ hơn số đã dùng trên máy này.
 */
export function nextReportNo(unit: Pick<Unit, 'id' | 'numberStart' | 'numberYear'>, date: string, sessions: Pick<Session, 'id' | 'unitId' | 'date' | 'reportNo'>[]): number {
  const year = yearOf(date);
  const start = unit.numberYear === year ? Math.max(1, Math.floor(unit.numberStart)) : 1;
  const used = sessions.filter((s) => (s.unitId ?? DEFAULT_UNIT.id) === unit.id && yearOf(s.date) === year && s.reportNo).map((s) => s.reportNo!);
  return used.length ? Math.max(start, Math.max(...used) + 1) : start;
}

/** "{nn}/{yyyy}/BB-TN" + 5, 2026 → "05/2026/BB-TN". */
export function formatReportNo(format: string, no: number | undefined, date: string): string {
  if (!no) return '';
  return (format || DEFAULT_UNIT.reportFormat).replace(/\{nn\}/g, String(no).padStart(2, '0')).replace(/\{yyyy\}/g, String(yearOf(date)));
}

/** Các phiên khác cùng đơn vị, cùng năm, cùng số (trùng do tạo offline trên 2 máy). */
export function duplicateReportNo(s: Pick<Session, 'id' | 'unitId' | 'date' | 'reportNo'>, sessions: Pick<Session, 'id' | 'unitId' | 'date' | 'reportNo'>[]) {
  if (!s.reportNo) return [];
  return sessions.filter((x) => x.id !== s.id && (x.unitId ?? DEFAULT_UNIT.id) === (s.unitId ?? DEFAULT_UNIT.id) && yearOf(x.date) === yearOf(s.date) && x.reportNo === s.reportNo);
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
      return { name, ...(title ? { title } : {}), ...(grade >= 1 && grade <= 5 ? { safetyGrade: grade } : {}) };
    });
}

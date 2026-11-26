// Kiểu dữ liệu chung của biểu mẫu nhập số đo.
import type { Profile, Result } from '../types';

export const PHASES = ['A', 'B', 'C'] as const;
export type Phase = (typeof PHASES)[number];
export const VAPS = ['VAP-A', 'VAP-B'] as const;

export type Values = Record<string, string>;

export interface ResultRow {
  group: string;
  label: string;
  value: string;
  expected: string;
  result: Result;
}

export interface FormDef {
  phased: boolean;
  /** HTML biểu mẫu cho 1 pha (hoặc toàn bộ nếu không theo pha). */
  render(v: Values, p: Profile, phase: Phase, prev?: Values): string;
  /** Cập nhật phần tính toán trực tiếp (tùy chọn). */
  live?(root: HTMLElement, v: Values, p: Profile, phase: Phase): void;
  /** Kết quả để đánh giá, tổng kết và xuất biên bản. */
  rows(v: Values, p: Profile, testId: string, itemId: string): ResultRow[];
}

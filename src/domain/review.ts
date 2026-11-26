// Rà soát phiên: gom dòng ❌/⚠️, cảnh báo (máy quá hạn, cổng an toàn, thiếu số liệu, xu hướng) kèm đề xuất xử lý
// và soạn bản nháp "Kết luận, kiến nghị". Chỉ là GỢI Ý – Chỉ huy trực tiếp xem xét, sửa trước khi ký.
import adviceJson from '../../content/advice.json';
import { items } from '../content';
import { itemOn, testState, type SessionData } from './session';
import type { ResultRow } from '../forms';

interface AdviceRule {
  item: string;
  test: string;
  label?: string;
  advice: string;
}
const ADVICE = adviceJson as { rules: AdviceRule[]; general: Record<'fallback' | 'instrumentOverdue' | 'noData' | 'gateMissing' | 'uncorrected', string> };

/** Tiêu đề vấn đề gộp các hạng mục được chọn thực hiện mà chưa có số liệu. */
export const NO_DATA_TITLE = 'Hạng mục chưa có số liệu';

export type IssueLevel = 'fail' | 'warn' | 'info';
export interface ReviewIssue {
  level: IssueLevel;
  /** "5.B Thí nghiệm ngưỡng VAP" / "Máy thí nghiệm" / "Xu hướng" */
  title: string;
  /** các dòng chi tiết (nội dung = giá trị, yêu cầu) */
  details: string[];
  advice: string;
}

export interface ReviewContext {
  /** máy TN quá hạn kiểm định tại ngày thí nghiệm */
  overdueInstruments: string[];
  /** tên các cổng an toàn chưa xác nhận (phiên nhập lại biên bản giấy: để trống) */
  missingGates: string[];
  /** cảnh báo xu hướng của giàn (đã tính sẵn ở màn hình) */
  trendAlerts: { level: 'fail' | 'warn'; metric: string; text: string; advice: string }[];
}

/** Đề xuất xử lý: luật đầu tiên khớp hạng mục + phép thử (+ nhãn dòng nếu luật có). */
export function adviceFor(itemId: string, testId: string, rows: Pick<ResultRow, 'label'>[] = []): string {
  const r = ADVICE.rules.find((x) => x.item === itemId && x.test === testId && (!x.label || rows.some((row) => row.label.includes(x.label!))));
  return r?.advice ?? ADVICE.general.fallback;
}

const testCode = (itemId: string, idx: number, count: number) => `${itemId.slice(2)}${count > 1 ? '.' + String.fromCharCode(65 + idx) : ''}`;
const rowText = (r: ResultRow) => `${r.group ? r.group + ' – ' : ''}${r.label}: ${r.value}${r.expected ? ` (yêu cầu ${r.expected})` : ''}`;

/** Rà soát một phiên → danh sách vấn đề, nặng nhất trước. */
export function reviewSession(d: SessionData, ctx: ReviewContext): ReviewIssue[] {
  const out: ReviewIssue[] = [];
  const noData: string[] = [];
  for (const it of items.filter((x) => itemOn(d.session, x.id))) {
    let any = false;
    it.tests.forEach((t, i) => {
      const { state, rows } = testState(d, it.id, t.id);
      if (state !== 'todo') any = true;
      const bad = rows.filter((r) => r.result === 'fail' || r.result === 'warn');
      if (!bad.length) return;
      const title = `${testCode(it.id, i, it.tests.length)} ${t.title.replace(/^[A-D]\.\s*/, '')}`;
      for (const level of ['fail', 'warn'] as const) {
        const mine = bad.filter((r) => r.result === level);
        if (mine.length) out.push({ level, title, details: mine.map(rowText), advice: adviceFor(it.id, t.id, mine) });
      }
    });
    if (!any) noData.push(`${it.id.slice(2)}. ${it.title}`);
  }
  if (noData.length) out.push({ level: 'info', title: NO_DATA_TITLE, details: noData, advice: ADVICE.general.noData });
  if (ctx.overdueInstruments.length) out.push({ level: 'warn', title: 'Máy thí nghiệm', details: ctx.overdueInstruments.map((m) => `${m}: quá hạn kiểm định`), advice: ADVICE.general.instrumentOverdue });
  if (ctx.missingGates.length) out.push({ level: 'info', title: 'Cổng an toàn', details: ctx.missingGates.map((g) => `${g}: chưa xác nhận`), advice: ADVICE.general.gateMissing });
  for (const a of ctx.trendAlerts) out.push({ level: a.level === 'fail' ? 'warn' : a.level, title: `Xu hướng – ${a.metric}`, details: [a.text], advice: a.advice });
  const rank: Record<IssueLevel, number> = { fail: 0, warn: 1, info: 2 };
  return out.sort((a, b) => rank[a.level] - rank[b.level]);
}

/** Bản nháp "Kết luận, kiến nghị" để Chỉ huy sửa – không tự ghi vào biên bản. */
export function conclusionDraft(d: SessionData, issues: ReviewIssue[]): string {
  const on = items.filter((it) => itemOn(d.session, it.id));
  const off = items.filter((it) => !itemOn(d.session, it.id));
  const counts = { pass: 0, warn: 0, fail: 0 };
  for (const it of on) for (const t of it.tests) for (const r of testState(d, it.id, t.id).rows) if (r.result in counts) counts[r.result as keyof typeof counts]++;
  const fails = issues.filter((x) => x.level === 'fail');
  const warns = issues.filter((x) => x.level === 'warn');
  const lines: string[] = ['KẾT LUẬN:'];
  lines.push(`- Hạng mục thực hiện: ${on.map((it) => it.id.slice(2)).join(', ') || '—'}${off.length ? `; không thực hiện: ${off.map((it) => it.id.slice(2)).join(', ')}` : ''}.`);
  lines.push(`- Kết quả: ${counts.pass} nội dung đạt, ${counts.warn} nội dung cảnh báo, ${counts.fail} nội dung không đạt.`);
  if (fails.length) {
    lines.push('- Các nội dung KHÔNG ĐẠT:');
    for (const f of fails) for (const x of f.details) lines.push(`  + ${f.title}: ${x}.`);
  }
  if (warns.length) {
    lines.push('- Các nội dung cần theo dõi:');
    for (const w of warns) for (const x of w.details) lines.push(`  + ${w.title}: ${x}.`);
  }
  lines.push(
    fails.length
      ? '- Đánh giá chung: giàn tụ CHƯA đạt yêu cầu; chỉ đưa vào vận hành sau khi xử lý xong và thí nghiệm lại các nội dung không đạt.'
      : warns.length
        ? '- Đánh giá chung: các nội dung thí nghiệm đạt yêu cầu; cần theo dõi các nội dung cảnh báo nêu trên.'
        : '- Đánh giá chung: các hạng mục thực hiện đều đạt yêu cầu.',
  );
  const todo = [...fails, ...warns];
  if (todo.length) {
    lines.push('', 'KIẾN NGHỊ:');
    // gộp đề xuất trùng nhau (vd nhiều dòng cùng phép thử)
    const seen = new Map<string, string[]>();
    for (const x of todo) seen.set(x.advice, [...(seen.get(x.advice) ?? []), x.title]);
    let n = 1;
    for (const [advice, titles] of seen) lines.push(`${n++}. ${[...new Set(titles)].join('; ')}: ${advice}`);
  }
  return lines.join('\n');
}

// Rà soát phiên: dòng ❌/⚠️ + đề xuất xử lý + cảnh báo, và bản nháp Kết luận, kiến nghị.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll } from 'vitest';
import { PROFILE_DEFAULTS } from '../src/content';
import type { Profile, Session } from '../src/types';
import type { SessionData } from '../src/domain/session';

let R: typeof import('../src/domain/review');
beforeAll(async () => {
  // module phiên dùng CSDL trình duyệt → môi trường tối thiểu trước khi nạp
  const bus = new EventTarget();
  const mem = new Map<string, string>();
  Object.assign(globalThis, {
    window: globalThis,
    localStorage: { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) },
    addEventListener: bus.addEventListener.bind(bus),
    removeEventListener: bus.removeEventListener.bind(bus),
    dispatchEvent: bus.dispatchEvent.bind(bus),
  });
  R = await import('../src/domain/review');
});

const profile = { id: 'p', station: 'T500', bank: 'TBD503', tagGap_mm: 161, gapTol_mm: 2, ...PROFILE_DEFAULTS } as Profile;
const session = (items?: string[]): Session => ({ id: 's', profileId: 'p', date: '2026-11-26', type: 'periodic', leader: 'C', members: [], instruments: [], status: 'open', createdAt: 0, ...(items ? { items } : {}) });
const ctx = { overdueInstruments: [], missingGates: [], trendAlerts: [] };
// %ΔC = IΔ / I∑ = (100 mA / 10) / 4 A = 0,25 % ≥ bypass 0,22 % → Không đạt
const unbFail = { 'A.U': '250', 'A.Isum': '4', 'A.IG1': '2', 'A.IG2': '2', 'A.Idx10': '100', 'A.unit': 'mA' };

describe('rà soát phiên', () => {
  it('dòng không đạt → vấn đề ❌ kèm đề xuất theo phép thử; hạng mục chọn mà chưa có số liệu → nhắc', () => {
    const d: SessionData = { session: session(['4.1', '4.3']), profile, values: new Map([['4.1|unbalance', unbFail]]) };
    const issues = R.reviewSession(d, ctx);
    expect(issues[0].level).toBe('fail');
    expect(issues[0].title).toContain('1.B');
    expect(issues[0].details.join(' ')).toContain('%ΔC');
    expect(issues[0].advice).toContain('Đo dòng từng chuỗi');
    const info = issues.find((x) => x.level === 'info')!;
    expect(info.title).toBe(R.NO_DATA_TITLE);
    expect(info.details).toHaveLength(1);
    expect(info.details[0]).toMatch(/^3\. /);
  });
  it('hạng mục không tick Thực hiện bị bỏ qua', () => {
    const d: SessionData = { session: session(['4.3']), profile, values: new Map([['4.1|unbalance', unbFail]]) };
    expect(R.reviewSession(d, ctx).some((x) => x.level === 'fail')).toBe(false);
  });
  it('đề xuất theo nhãn dòng (string nghi ngờ) và mặc định khi không có luật', () => {
    expect(R.adviceFor('4.1', 'unbalance', [{ label: 'String nghi ngờ G1' }])).toContain('chuỗi nghi ngờ');
    expect(R.adviceFor('9.9', 'x')).toContain('QĐ 1901');
  });
  it('máy quá hạn, cổng an toàn, xu hướng → cảnh báo', () => {
    const d: SessionData = { session: session(['4.1']), profile, values: new Map() };
    const issues = R.reviewSession(d, { overdueInstruments: ['VAP Tester'], missingGates: ['Lên sàn tụ'], trendAlerts: [{ level: 'warn', metric: 'Sứ tan δ', text: 'tăng nhanh', advice: 'theo dõi' }] });
    expect(issues.map((x) => x.title)).toEqual(expect.arrayContaining(['Máy thí nghiệm', 'Cổng an toàn', 'Xu hướng – Sứ tan δ']));
  });
});

describe('bản nháp kết luận', () => {
  it('có không đạt: liệt kê, đánh giá chưa đạt, kiến nghị đánh số, ghi hạng mục không thực hiện', () => {
    const d: SessionData = { session: session(['4.1']), profile, values: new Map([['4.1|unbalance', unbFail]]) };
    const text = R.conclusionDraft(d, R.reviewSession(d, ctx));
    expect(text).toContain('KẾT LUẬN:');
    expect(text).toContain('không thực hiện: 2, 3, 4, 5, 6, 7');
    expect(text).toContain('Các nội dung KHÔNG ĐẠT');
    expect(text).toContain('CHƯA đạt yêu cầu');
    expect(text).toMatch(/KIẾN NGHỊ:\n1\. 1\.B /);
  });
  it('không có vấn đề: đánh giá đạt, không có phần kiến nghị', () => {
    const ok = { ...unbFail, 'A.Idx10': '10' }; // 0,025 %
    const d: SessionData = { session: session(['4.1']), profile, values: new Map([['4.1|unbalance', ok]]) };
    const text = R.conclusionDraft(d, R.reviewSession(d, ctx));
    expect(text).toContain('đều đạt yêu cầu');
    expect(text).not.toContain('KIẾN NGHỊ');
  });
});

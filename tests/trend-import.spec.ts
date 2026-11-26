// Nhập mốc lịch sử từ Excel + các chỉ số xu hướng mở rộng (dải cho phép, thay đổi so với đợt trước, VAP).
import { describe, it, expect } from 'vitest';
import { matchMetric, matchProfile, matchType, parseDateCell, parseTrendTable, historyKey, IMPORT_HEADER, templateSheets } from '../src/domain/trend-import';
import { METRIC_DEFS, TREND_METRICS, analyzeTrendSeries, extractTrendFromSessions, type TrendDataPoint } from '../src/calc/trend';
import { PROFILE_DEFAULTS } from '../src/content';
import type { Measurement, Profile, Session } from '../src/types';

const prof = { id: 'TBD503-PLEIKU2', station: 'T500 Pleiku 2', bank: 'TBD503', tagGap_mm: 161, gapTol_mm: 2, ...PROFILE_DEFAULTS } as Profile;
const other = { ...prof, id: 'TBD502-DAKNONG', station: 'T500 Đắk Nông', bank: 'TBD502' } as Profile;

describe('đọc ô của file Excel', () => {
  it('ngày: dd/mm/yyyy, yyyy-mm-dd, ô ngày Excel, số seri; từ chối ngày sai', () => {
    expect(parseDateCell('15/03/2022')).toBe('2022-03-15');
    expect(parseDateCell('5-3-2022')).toBe('2022-03-05');
    expect(parseDateCell('2022-03-15')).toBe('2022-03-15');
    expect(parseDateCell(new Date(2021, 11, 31))).toBe('2021-12-31');
    expect(parseDateCell(44635)).toBe('2022-03-15');
    expect(parseDateCell('31/02/2022')).toBeNull();
    expect(parseDateCell('abc')).toBeNull();
  });
  it('chỉ số theo mã hoặc tên ngắn (không dấu, không phân biệt hoa thường)', () => {
    expect(matchMetric('mov_rcd')).toBe('mov_rcd');
    expect(matchMetric('Sứ tan δ')).toBe('bushing_tan');
    expect(matchMetric('khang z')).toBe('reactor_z');
    expect(matchMetric('xyz')).toBeNull();
  });
  it('loại đợt và hồ sơ giàn', () => {
    expect(matchType('')).toBe('periodic');
    expect(matchType('Lắp đặt')).toBe('after_install');
    expect(matchType('sau 1 nam')).toBe('after_1y');
    expect(matchType('khác')).toBeNull();
    expect(matchProfile('tbd503-pleiku2', [prof, other])?.id).toBe(prof.id);
    expect(matchProfile('TBD502', [prof, other])?.id).toBe(other.id);
    expect(matchProfile('TBD999', [prof, other])).toBeNull();
  });
});

describe('nhập bảng mốc lịch sử', () => {
  it('dòng hợp lệ → mốc; dòng lỗi báo đúng số dòng; dòng trống bỏ qua', () => {
    const r = parseTrendTable(
      [
        [...IMPORT_HEADER],
        ['15/03/2022', 'TBD503', 'mov_rcd', 'Định kỳ', 3200, '3100,5', '', '', 'BB 12/2022'],
        ['', '', '', '', '', '', '', '', ''],
        ['01/01/2099', 'TBD503', 'mov_rcd', '', 1, 1, 1],
        ['15/03/2022', 'TBD999', 'mov_rcd', '', 1, 1, 1],
        ['15/03/2022', 'TBD503', 'abc', '', 1, 1, 1],
        ['15/03/2022', 'TBD503', 'vap_A', '', -4.5, '', ''],
        ['15/03/2022', 'TBD503', 'vap_A', '', '', '', ''],
      ],
      [prof, other],
      '2026-11-26',
    );
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toEqual({
      line: 2,
      rec: { profileId: prof.id, metric: 'mov_rcd', date: '2022-03-15', label: '2022 (Định kỳ)', sessionType: 'periodic', phaseA: 3200, phaseB: 3100.5, phaseC: null, note: 'BB 12/2022' },
    });
    expect(r.errors.map((e) => e.line)).toEqual([4, 5, 6, 7, 8]);
    expect(r.errors[0].message).toContain('tương lai');
  });
  it('khóa trùng: cùng giàn + chỉ số + ngày', () => {
    expect(historyKey({ profileId: 'p', metric: 'vap_mC', date: '2022-01-01' })).toBe('p|vap_mC|2022-01-01');
  });
  it('file mẫu có tiêu đề, đủ danh mục chỉ số và hồ sơ giàn', () => {
    const t = templateSheets([prof]);
    expect(t.data[0]).toEqual([...IMPORT_HEADER]);
    expect(t.metrics.length).toBe(TREND_METRICS.length + 1);
    expect(t.profiles[1][0]).toBe(prof.id);
  });
});

describe('chỉ số xu hướng mở rộng', () => {
  const pt = (date: string, a: number | null, b: number | null = null, c: number | null = null): TrendDataPoint => ({ id: date, date, yearLabel: date, sessionType: 'periodic', phaseA: a, phaseB: b, phaseC: c });
  const sess = (id: string, date: string, items?: string[]): Session => ({ id, profileId: prof.id, date, type: 'periodic', leader: '', members: [], instruments: [], status: 'done', createdAt: 0, ...(items ? { items } : {}) });
  const meas = (sessionId: string, itemId: string, testId: string, kv: Record<string, string>): Measurement[] =>
    Object.entries(kv).map(([key, value]) => ({ id: `${sessionId}|${key}`, sessionId, itemId, testId, key, value, ts: 0 }));

  it('14 chỉ số, mỗi chỉ số có định nghĩa', () => {
    expect(TREND_METRICS).toHaveLength(14);
    for (const k of TREND_METRICS) expect(METRIC_DEFS[k].key).toBe(k);
  });
  it('VAP: mỗi pha lấy bộ VAP lệch xa danh định nhất; dòng lấy trị tuyệt đối', () => {
    const ms = meas('s1', '4.5', 'vap-threshold', { 'A.VAP-A.mC': '91,8', 'A.VAP-B.mC': '93,0', 'A.VAP-A.A': '-4,5', 'A.VAP-B.A': '-4,62', 'A.VAP-A.V': '950', 'A.VAP-B.V': '920' });
    expect(extractTrendFromSessions([sess('s1', '2025-01-01')], ms, 'vap_mC', prof)[0].phaseA).toBe(93);
    expect(extractTrendFromSessions([sess('s1', '2025-01-01')], ms, 'vap_A', prof)[0].phaseA).toBe(4.62);
    expect(extractTrendFromSessions([sess('s1', '2025-01-01')], ms, 'vap_V', prof)[0].phaseA).toBe(920);
  });
  it('bỏ qua hạng mục không thực hiện trong phiên (dù còn số liệu cũ)', () => {
    const ms = meas('s1', '4.4', 'measure', { 'A.C1': '300' });
    expect(extractTrendFromSessions([sess('s1', '2025-01-01', ['4.1'])], ms, 'bushing_c1', prof)).toEqual([]);
    expect(extractTrendFromSessions([sess('s1', '2025-01-01', ['4.4'])], ms, 'bushing_c1', prof)).toHaveLength(1);
  });
  it('Rsu sứ đỡ MOV quy đổi về 20°C', () => {
    const ms = meas('s1', '4.2', 'measure', { 'A.Rsu': '1000', 'A.t': '30' });
    expect(extractTrendFromSessions([sess('s1', '2025-01-01')], ms, 'mov_rsu', prof)[0].phaseA).toBe(1500);
  });
  it('dải cho phép (khe hở TAG theo hồ sơ giàn): ngoài dải → không đạt; trôi dần → cảnh báo dự báo', () => {
    expect(analyzeTrendSeries([pt('2024-01-01', 161), pt('2025-01-01', 163.5)], METRIC_DEFS.tag_gap, prof).verdict).toBe('fail');
    const drift = analyzeTrendSeries([pt('2023-01-01', 160.5), pt('2025-01-01', 162.4)], METRIC_DEFS.tag_gap, prof);
    expect(drift.verdict).toBe('warn');
    expect(drift.projectedAlarmYears).toBeLessThan(1);
    expect(analyzeTrendSeries([pt('2023-01-01', 161), pt('2025-01-01', 161.1)], METRIC_DEFS.tag_gap, prof).verdict).toBe('pass');
  });
  it('thay đổi so với đợt trước > 20% → bất thường; 1 đợt → chưa đánh giá', () => {
    expect(analyzeTrendSeries([pt('2023-01-01', 10), pt('2024-01-01', 12.5)], METRIC_DEFS.reactor_z, prof).verdict).toBe('warn');
    expect(analyzeTrendSeries([pt('2023-01-01', 10), pt('2024-01-01', 11)], METRIC_DEFS.reactor_z, prof).verdict).toBe('pass');
    expect(analyzeTrendSeries([pt('2023-01-01', 10)], METRIC_DEFS.reactor_z, prof).verdict).toBe('na');
  });
  it('VAP V thấp hơn mức tối thiểu của hồ sơ giàn → không đạt', () => {
    const vmin = prof.vap.Vmin;
    expect(analyzeTrendSeries([pt('2024-01-01', vmin - 10)], METRIC_DEFS.vap_V, prof).verdict).toBe('fail');
    expect(analyzeTrendSeries([pt('2024-01-01', vmin + 10)], METRIC_DEFS.vap_V, prof).verdict).not.toBe('fail');
  });
});

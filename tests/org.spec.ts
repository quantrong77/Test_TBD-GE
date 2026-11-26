// Đơn vị, số biên bản, nhân sự, hạng mục thực hiện, tiến độ theo pha, ô ký người chịu trách nhiệm.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll } from 'vitest';
import { crewLabel, DEFAULT_UNIT, duplicateReportNo, formatReportNo, nextReportNo, parseExtraCrew } from '../src/domain/units';
import type { SessionData } from '../src/domain/session';
import { signerBlocks } from '../src/export/signers';
import { vSession, vStaff, vUnit } from '../src/store/validate';
import { PROFILE_DEFAULTS } from '../src/content';
import type { Profile, Session } from '../src/types';

const unit = { id: 'u1', numberStart: 15, numberYear: 2026 };
const ses = (id: string, date: string, reportNo?: number, unitId = 'u1') => ({ id, date, reportNo, unitId });

describe('số biên bản', () => {
  it('năm đã đặt số bắt đầu: bắt đầu từ số đó, rồi tăng dần', () => {
    expect(nextReportNo(unit, '2026-03-01', [])).toBe(15);
    expect(nextReportNo(unit, '2026-03-01', [ses('a', '2026-01-02', 15), ses('b', '2026-02-02', 16)])).toBe(17);
  });
  it('số đã dùng nhỏ hơn số bắt đầu (Quản trị đặt lại giữa năm) → lấy số bắt đầu', () => {
    expect(nextReportNo(unit, '2026-06-01', [ses('a', '2026-01-02', 3)])).toBe(15);
  });
  it('sang năm mới tự về 01; chỉ tính phiên cùng đơn vị', () => {
    expect(nextReportNo(unit, '2027-01-05', [ses('a', '2026-12-30', 40)])).toBe(1);
    expect(nextReportNo(unit, '2027-01-05', [ses('a', '2027-01-02', 1), ses('b', '2027-01-03', 9, 'khac')])).toBe(2);
  });
  it('phiên không ghi đơn vị thuộc đơn vị mặc định', () => {
    expect(nextReportNo({ ...DEFAULT_UNIT, numberYear: 2026 }, '2026-05-05', [{ id: 'x', date: '2026-01-01', reportNo: 4 }])).toBe(5);
  });
  it('định dạng 2 chữ số + năm theo mẫu', () => {
    expect(formatReportNo('{nn}/{yyyy}/BB-TN', 5, '2026-11-26')).toBe('05/2026/BB-TN');
    expect(formatReportNo('BB{nn}-TNĐLĐ', 123, '2026-11-26')).toBe('BB123-TNĐLĐ');
    expect(formatReportNo('{nn}', undefined, '2026-11-26')).toBe('');
  });
  it('phiên tạo khi chưa khai đơn vị thuộc đơn vị duy nhất của đội (không đánh lại từ 01, vẫn báo trùng)', () => {
    const old = [{ id: 'a', date: '2026-01-02', reportNo: 1 }, { id: 'b', date: '2026-02-02', reportNo: 2, unitId: 'default' }];
    expect(nextReportNo({ id: 'u9', numberStart: 1, numberYear: 2026 }, '2026-05-01', old)).toBe(1);
    expect(nextReportNo({ id: 'u9', numberStart: 1, numberYear: 2026 }, '2026-05-01', old, 'u9')).toBe(3);
    expect(duplicateReportNo({ id: 'n', unitId: 'u9', date: '2026-05-01', reportNo: 2 }, old, 'u9').map((x) => x.id)).toEqual(['b']);
  });
  it('phát hiện trùng số (cùng đơn vị, cùng năm)', () => {
    const all = [ses('a', '2026-01-02', 7), ses('b', '2025-01-02', 7), ses('c', '2026-03-02', 7, 'khac')];
    expect(duplicateReportNo(ses('n', '2026-05-01', 7), all).map((x) => x.id)).toEqual(['a']);
  });
});

describe('nhân sự', () => {
  it('nhãn: tên (chức danh, bậc an toàn)', () => {
    expect(crewLabel({ name: 'Lê D', title: 'Kỹ sư', safetyGrade: 4 })).toBe('Lê D (Kỹ sư, bậc 4/5)');
    expect(crewLabel({ name: 'Lê D' })).toBe('Lê D');
  });
  it('nhập tay người ngoài danh sách: "Họ tên, chức danh, bậc"', () => {
    expect(parseExtraCrew('Lê Văn D, Kỹ sư, 4\n\nTrần E\nPhạm F, , bậc 3\nNgô G, CN, 9')).toEqual([
      { name: 'Lê Văn D', title: 'Kỹ sư', safetyGrade: 4 },
      { name: 'Trần E' },
      { name: 'Phạm F', safetyGrade: 3 },
      { name: 'Ngô G', title: 'CN' },
    ]);
    // dài hơn 200 ký tự bị cắt (máy khác sẽ từ chối khi đồng bộ nếu để nguyên)
    expect(parseExtraCrew('x'.repeat(300))[0].name).toHaveLength(200);
  });
  it('kiểm tra dữ liệu đơn vị, nhân viên, phiên có nhân sự & hạng mục', () => {
    expect(() => vUnit({ id: 'u1', orgName: 'TT', name: 'Đội', reportFormat: '{nn}', numberStart: 1, numberYear: 2026 })).not.toThrow();
    expect(() => vUnit({ id: 'u1', orgName: 'TT', name: 'Đội', reportFormat: '{nn}', numberStart: 0, numberYear: 2026 })).toThrow();
    expect(() => vStaff({ id: 's1', unitId: 'u1', name: 'A', title: '', safetyGrade: 4 })).not.toThrow();
    expect(() => vStaff({ id: 's1', unitId: 'u1', name: 'A', title: '', safetyGrade: 7 })).toThrow();
    const base = { id: 's', profileId: 'p', date: '2026-11-26', type: 'periodic', status: 'open', leader: 'C', members: [], instruments: [], createdAt: 1 };
    expect(() => vSession({ ...base, reportNo: 3, items: ['4.1'], crew: { leader: { name: 'C' }, responsible: { name: 'A', safetyGrade: 4 }, members: [{ name: 'A' }] } })).not.toThrow();
    expect(() => vSession({ ...base, crew: { members: [{ name: 'A', safetyGrade: 0 }] } })).toThrow();
  });
});

describe('ô ký Người thí nghiệm: chỉ người chịu trách nhiệm', () => {
  const s = { leader: 'Chỉ Huy', members: ['A', 'B'], crew: { leader: { name: 'Chỉ Huy' }, responsible: { name: 'B' }, members: [{ name: 'A' }, { name: 'B' }] } };
  it('chưa ký: in tên người chịu trách nhiệm (không in cả đội)', () => {
    expect(signerBlocks(s, [])[0].people).toEqual([{ name: 'B' }]);
  });
  it('đã ký điện tử: chỉ in người đã ký', () => {
    expect(signerBlocks(s, [{ slot: 'tester', name: 'B', time: 't' }])[0].people).toEqual([{ name: 'B', signedAt: 't' }]);
  });
});

describe('hạng mục thực hiện & tiến độ theo pha', () => {
  let itemOn: typeof import('../src/domain/session').itemOn;
  let phaseState: typeof import('../src/domain/session').phaseState;
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
    ({ itemOn, phaseState } = await import('../src/domain/session'));
  });
  const profile = { id: 'p', station: 'T', bank: 'B', tagGap_mm: 12, ...PROFILE_DEFAULTS } as Profile;
  const session = { id: 's', items: ['4.1', '4.2'] } as Session;
  it('phiên cũ (không khai) = làm tất cả', () => {
    expect(itemOn({}, '4.7')).toBe(true);
    expect(itemOn(session, '4.2')).toBe(true);
    expect(itemOn(session, '4.7')).toBe(false);
  });
  it('mỗi pha chỉ tính số đo của pha đó', () => {
    const d: SessionData = {
      session,
      profile,
      values: new Map([['4.2|measure', { 'A.Rmov': '5000', 'A.Rsu': '5000', 'A.P': '1' }]]),
    };
    expect(phaseState(d, '4.2', 'A')).not.toBe('todo');
    expect(phaseState(d, '4.2', 'B')).toBe('todo');
  });
});

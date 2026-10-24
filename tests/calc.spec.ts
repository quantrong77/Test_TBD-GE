import { describe, it, expect } from 'vitest';
import { unbalance, unbalanceVerdict, sanityChecks, stringOutliers, kFactor, bankCapacitance } from '../src/calc/unbalance';
import { evalThreshold, evalTrigger, bushingDeviation, evalCtPair, calibOverdue, gapCheck, deltaPct } from '../src/calc/evaluate';
import { ftlbToNm, gammaKv, gammaMa, foldVi, parseNum } from '../src/calc/units';
import { parseIsolationTime } from '../src/calc/isolation';
import thresholds from '../content/thresholds.json';
import type { Threshold } from '../src/types';

const th = (id: string) => (thresholds as Threshold[]).find((t) => t.id === id)!;

describe('capacitance basics', () => {
  it('nominal bank capacitance 104.4 µF and X ≈ 30.49 Ω', () => {
    const r = bankCapacitance({ unitCap_uF: 13.05, unitsPerString: 6, stringsPerGroup: 24, groupsPerPhase: 2 });
    expect(r.string_uF).toBeCloseTo(2.175, 6);
    expect(r.group_uF).toBeCloseTo(52.2, 6);
    expect(r.total_uF).toBeCloseTo(104.4, 6);
    expect(r.X_ohm).toBeCloseTo(30.49, 2);
  });
  it('k factor at 50 Hz is 3183.1', () => {
    expect(kFactor(50)).toBeCloseTo(3183.1, 1);
  });
});

describe('unbalance', () => {
  it('C∑ from U=250 V, I∑=8.20 A ≈ 104.4 µF', () => {
    const r = unbalance({ U: 250, Isum: 8.2, IG1: 4.1, IG2: 4.1, Idx10: 100, IdxUnit: 'mA' })!;
    expect(r.Csum).toBeCloseTo(104.4, 1);
  });
  it('IΔ×10 = 100 mA, I∑ = 8.20 A → %ΔC ≈ 0.122 % → pass', () => {
    const r = unbalance({ U: 250, Isum: 8.2, IG1: 4.1, IG2: 4.1, Idx10: 100, IdxUnit: 'mA' })!;
    expect(r.Id).toBeCloseTo(0.01, 9);
    expect(r.pct).toBeCloseTo(0.122, 3);
    expect(unbalanceVerdict(r.pct, 0.16, 0.22)).toBe('pass');
  });
  it('spec example screen (e): U=250, I∑=7.87, IG1=3.94, IG2=3.93, IΔ×10=98 mA', () => {
    const r = unbalance({ U: 250, Isum: 7.87, IG1: 3.94, IG2: 3.93, Idx10: 98, IdxUnit: 'mA' })!;
    // wireframe ghi 100.19 – thực tế 3183.1 × 7.87 / 250 = 100.20
    expect(r.Csum).toBeCloseTo(100.2, 2);
    expect(r.CG1).toBeCloseTo(50.166, 2);
    expect(r.CG2).toBeCloseTo(50.038, 2);
    expect(r.dC).toBeCloseTo(0.125, 3);
    expect(r.pct).toBeCloseTo(0.1245, 3);
  });
  it('unit selector µA vs mA', () => {
    const a = unbalance({ U: 250, Isum: 8.2, IG1: 4.1, IG2: 4.1, Idx10: 100000, IdxUnit: 'uA' })!;
    const b = unbalance({ U: 250, Isum: 8.2, IG1: 4.1, IG2: 4.1, Idx10: 100, IdxUnit: 'mA' })!;
    expect(a.pct).toBeCloseTo(b.pct, 9);
  });
  it('verdict levels', () => {
    expect(unbalanceVerdict(0.159, 0.16, 0.22)).toBe('pass');
    expect(unbalanceVerdict(0.16, 0.16, 0.22)).toBe('warn');
    expect(unbalanceVerdict(0.22, 0.16, 0.22)).toBe('fail');
  });
  it('invalid input returns null', () => {
    expect(unbalance({ U: 0, Isum: 8.2, IG1: 4.1, IG2: 4.1, Idx10: 100, IdxUnit: 'mA' })).toBeNull();
    expect(unbalance({ U: 250, Isum: NaN, IG1: 4.1, IG2: 4.1, Idx10: 100, IdxUnit: 'mA' })).toBeNull();
  });
  it('sanity checks flag IG1+IG2 vs I∑ > 2 % and nominal deviation', () => {
    const r = unbalance({ U: 250, Isum: 8.2, IG1: 3.9, IG2: 3.9, Idx10: 100, IdxUnit: 'mA' })!;
    const s = sanityChecks(r, { IG1: 3.9, IG2: 3.9, Isum: 8.2 }, 104.4);
    expect(s.sumMismatchPct).toBeGreaterThan(2);
    expect(s.warnings.some((w) => w.includes('kẹp dòng'))).toBe(true);
    expect(s.nominalDevPct).toBeCloseTo(0, 1);
  });
  it('sanity warnings use Vietnamese decimal comma', () => {
    const r = unbalance({ U: 250, Isum: 8.2, IG1: 3.9, IG2: 3.9, Idx10: 100, IdxUnit: 'mA' })!;
    const w = sanityChecks(r, { IG1: 3.9, IG2: 3.9, Isum: 8.2 }, 104.4).warnings.join(' ');
    expect(w).toContain('4,9 %');
    expect(w).toContain('= 0,000 µF');
    expect(w).toContain('= 0,127 µF');
    expect(w).not.toMatch(/\d\.\d/);
  });
  it('string outliers > mean + 2σ', () => {
    const v = Array(24).fill(0.34);
    v[7] = 0.5;
    expect(stringOutliers(v)).toEqual([7]);
    expect(stringOutliers(Array(24).fill(0.34))).toEqual([]);
  });
});

describe('thresholds', () => {
  it('VAP mC 93.3 → fail', () => expect(evalThreshold(th('vap_mC'), 93.3)).toBe('fail'));
  it('VAP mC 91.8 → pass', () => expect(evalThreshold(th('vap_mC'), 91.8)).toBe('pass'));
  it('VAP A 4.36 → pass (lower bound)', () => expect(evalThreshold(th('vap_A'), 4.36)).toBe('pass'));
  it('VAP V 899 → fail, 900 → pass', () => {
    expect(evalThreshold(th('vap_V'), 899)).toBe('fail');
    expect(evalThreshold(th('vap_V'), 900)).toBe('pass');
  });
  it('CT6 189 A → fail', () => expect(evalThreshold(th('ct_mov'), 189)).toBe('fail'));
  it('VAP A shown negative on DPM: −4,36 → pass (abs threshold)', () => expect(evalThreshold(th('vap_A'), -4.36)).toBe('pass'));
  it('CT reading with reversed sign is NOT abs: −200 → fail', () => expect(evalThreshold(th('ct_200A'), -200)).toBe('fail'));
  it('empty value → na', () => expect(evalThreshold(th('ct_mov'), NaN)).toBe('na'));
  it('profile override for VAP mC', () => {
    const p = { vap: { mC: [80, 1] as [number, number], Vmin: 900, A: [4.5, 0.14] as [number, number] }, unbAlarm_pct: 0.16, unbBypass_pct: 0.22 };
    expect(evalThreshold(th('vap_mC'), 80.5, p)).toBe('pass');
    expect(evalThreshold(th('vap_mC'), 91.8, p)).toBe('fail');
  });
});

describe('other evaluations', () => {
  it('trigger: 3/3 fires and counts +1 each', () => {
    expect(evalTrigger([true, true, true], [10, 11, 12, 13])).toBe('pass');
    expect(evalTrigger([true, false, true], [10, 11, 12, 13])).toBe('fail');
    expect(evalTrigger([true, true, true], [10, 11, 11, 12])).toBe('fail');
    expect(evalTrigger([true, true, true], [10, 11, 12, NaN])).toBe('pass');
    expect(evalTrigger([null, null, null], [])).toBe('na');
  });
  it('bushing C1 deviation', () => {
    expect(bushingDeviation(105, 100)).toEqual({ pct: 5, result: 'pass' });
    expect(bushingDeviation(94.9, 100).result).toBe('fail');
  });
  it('CT pair HMI A & B', () => {
    expect(evalCtPair(th('ct_200A'), 200, 205)).toBe('pass');
    expect(evalCtPair(th('ct_200A'), 200, 207)).toBe('fail');
    expect(evalCtPair(th('ct_200A'), 200, NaN)).toBe('na');
  });
  it('TAG gap ± tolerance', () => {
    expect(gapCheck(162, 161, 2)).toBe('pass');
    expect(gapCheck(164, 161, 2)).toBe('fail');
  });
  it('delta % vs previous', () => {
    expect(deltaPct(110, 100)).toBeCloseTo(10, 9);
    expect(deltaPct(1, 0)).toBeNull();
  });
  it('calibration overdue', () => {
    expect(calibOverdue('2026-01-01', '2026-10-24')).toBe(true);
    expect(calibOverdue('2026-10-24', '2026-10-24')).toBe(false);
    expect(calibOverdue('', '2026-10-24')).toBe(false);
  });
});

describe('units', () => {
  it('ft-lb → N·m', () => expect(ftlbToNm(25)).toBeCloseTo(33.9, 1));
  it('GAMMA monitor', () => {
    expect(gammaKv(5)).toBe(10);
    expect(gammaMa(5)).toBeCloseTo(6, 9);
  });
  it('parseNum: VN and international formats', () => {
    expect(parseNum('4,36')).toBe(4.36);
    expect(parseNum('4.36')).toBe(4.36);
    expect(parseNum('-4,36')).toBe(-4.36);
    expect(parseNum('1.234,5')).toBe(1234.5);
    expect(parseNum('1.234.567')).toBe(1234567);
    expect(parseNum('1,234.5')).toBe(1234.5);
    expect(parseNum('1 500')).toBe(1500);
    expect(parseNum('')).toBeNaN();
    expect(parseNum('abc')).toBeNaN();
    expect(parseNum('1,2,3')).toBeNaN();
  });
  it('fold Vietnamese diacritics', () => {
    expect(foldVi('Kháng cản dịu')).toBe('khang can diu');
    expect(foldVi('Điện dung ĐỒNG')).toBe('dien dung dong');
  });
});

describe('isolation time entered manually', () => {
  const now = new Date(2026, 9, 24, 9, 0, 0).getTime(); // 09:00
  it('08:30 → 30 phút trước', () => {
    const r = parseIsolationTime('08:30', now);
    expect(r.ok && r.agoMin).toBe(30);
  });
  it('08:50 → 10 phút trước (chưa đủ 15 phút vẫn hợp lệ, đếm phần còn lại)', () => {
    const r = parseIsolationTime('8:50', now);
    expect(r.ok && r.agoMin).toBe(10);
  });
  it('giờ sau hiện tại → hôm trước; quá 12 h → từ chối', () => {
    expect(parseIsolationTime('09:30', now).ok).toBe(false); // 23,5 h trước
    const night = new Date(2026, 9, 24, 0, 10).getTime();
    const r = parseIsolationTime('23:50', night);
    expect(r.ok && r.agoMin).toBe(20);
  });
  it('sai định dạng → từ chối', () => {
    expect(parseIsolationTime('25:00', now).ok).toBe(false);
    expect(parseIsolationTime('abc', now).ok).toBe(false);
  });
});

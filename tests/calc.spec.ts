import { describe, it, expect } from 'vitest';
import { unbalance, unbalanceVerdict, sanityChecks, stringOutliers, analyzeStrings, stringLocation, kFactor, bankCapacitance } from '../src/calc/unbalance';
import { evalThreshold, evalTrigger, bushingDeviation, evalCtPair, calibOverdue, gapCheck, deltaPct } from '../src/calc/evaluate';
import { tempCorrectRcd, tempCorrectRdc, rDevPct } from '../src/calc/temp-correction';
import { formatWatermarkLines } from '../src/calc/watermark';
import { computeOtsuThreshold, findConnectedComponents, classify7Segment, type BoundingBox } from '../src/calc/ocr';
import { METRIC_DEFS, analyzeTrendSeries, renderTrendSvg, getBenchmarkHistory, type TrendDataPoint } from '../src/calc/trend';
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

describe('temperature correction (Rcd and Rdc)', () => {
  it('Rcd temp correction to 20°C: at 20°C factor = 1', () => {
    const r = tempCorrectRcd(1000, 20)!;
    expect(r.R_ref).toBeCloseTo(1000, 1);
    expect(r.factor).toBeCloseTo(1, 4);
  });

  it('Rcd temp correction to 20°C: at 30°C factor = 1.5', () => {
    const r = tempCorrectRcd(1000, 30)!;
    expect(r.R_ref).toBeCloseTo(1500, 1);
    expect(r.factor).toBeCloseTo(1.5, 4);
  });

  it('Rcd temp correction: at 40°C factor = 2.25', () => {
    const r = tempCorrectRcd(1000, 40)!;
    expect(r.R_ref).toBeCloseTo(2250, 1);
    expect(r.factor).toBeCloseTo(2.25, 4);
  });

  it('Rdc temp correction for Aluminium (K=228) to 75°C', () => {
    // Đo ở 30°C: factor = (228 + 75) / (228 + 30) = 303 / 258 ≈ 1.1744
    const r = tempCorrectRdc(10.0, 30, 75, 'Al')!;
    expect(r.R_ref).toBeCloseTo(11.744, 3);
    expect(r.R_75).toBeCloseTo(11.744, 3);
    // Quy đổi về 20°C: (228 + 20) / (228 + 30) = 248 / 258 ≈ 0.9612
    expect(r.R_20).toBeCloseTo(9.612, 3);
  });

  it('rDevPct calculates percentage deviation correctly', () => {
    expect(rDevPct(10.5, 10.0)).toBeCloseTo(5.0, 2);
    expect(rDevPct(9.5, 10.0)).toBeCloseTo(-5.0, 2);
  });
});

describe('capacitor matrix & string analysis', () => {
  it('stringLocation maps S1..S24 to physical Stack 1..4 and Racks 1..3', () => {
    // Group 1:
    // S1 (index 0) -> Stack 1, Rack 1, Chuỗi 1
    const s1 = stringLocation('G1', 0);
    expect(s1.stack).toBe(1);
    expect(s1.rack).toBe(1);
    expect(s1.stringInRack).toBe(1);

    // S12 (index 11) -> Stack 1, Rack 3, Chuỗi 4
    const s12 = stringLocation('G1', 11);
    expect(s12.stack).toBe(1);
    expect(s12.rack).toBe(3);
    expect(s12.stringInRack).toBe(4);

    // S13 (index 12) -> Stack 2, Rack 1, Chuỗi 1
    const s13 = stringLocation('G1', 12);
    expect(s13.stack).toBe(2);
    expect(s13.rack).toBe(1);
    expect(s13.stringInRack).toBe(1);

    // Group 2:
    // S1 (index 0) -> Stack 3
    const g2s1 = stringLocation('G2', 0);
    expect(g2s1.stack).toBe(3);

    // S24 (index 23) -> Stack 4, Rack 3, Chuỗi 4
    const g2s24 = stringLocation('G2', 23);
    expect(g2s24.stack).toBe(4);
    expect(g2s24.rack).toBe(3);
    expect(g2s24.stringInRack).toBe(4);
  });

  it('analyzeStrings calculates mean, standard deviation and flags outliers', () => {
    // 23 chuỗi bình thường (0.28 A), 1 chuỗi bị tăng vọt (0.45 A)
    const vals = Array(23).fill(0.28);
    vals.push(0.45); // index 23 (S24)

    const analysis = analyzeStrings(vals)!;
    expect(analysis).not.toBeNull();
    expect(analysis.count).toBe(24);
    expect(analysis.outliersHigh).toContain(23);
    expect(analysis.outliers).toContain(23);
  });
});

describe('watermark module', () => {
  it('formats watermark lines with station, bank, phase, and item', () => {
    const meta = {
      station: 'Trạm 500kV Di Linh',
      bank: 'TBD 572',
      phase: 'A',
      itemTitle: '1. Dòng điện mất cân bằng qua TAG',
      timestamp: '06/11/2026 20:30',
      gps: '11.5342° N, 108.0671° E',
    };
    const lines = formatWatermarkLines(meta);
    expect(lines.headline).toBe('⚡ Trạm 500kV Di Linh · TBD 572 · Pha A');
    expect(lines.subtitle).toBe('📋 1. Dòng điện mất cân bằng qua TAG');
    expect(lines.timeText).toBe('06/11/2026 20:30');
    expect(lines.locText).toBe('📍 11.5342° N, 108.0671° E');
    expect(lines.brandText).toContain('TBD-GE Field');
  });

  it('uses default values when metadata is partially missing', () => {
    const lines = formatWatermarkLines({});
    expect(lines.headline).toContain('Trạm 500 kV');
    expect(lines.subtitle).toContain('Biên bản thí nghiệm hiện trường');
    expect(lines.locText).toContain('EVNNPT');
  });
});

describe('on-device ocr module', () => {
  it('computes optimal Otsu threshold on bimodal distribution', () => {
    // 50 pixel tối (giá trị 30) và 50 pixel sáng (giá trị 210)
    const gray = new Uint8Array(100);
    for (let i = 0; i < 50; i++) gray[i] = 30;
    for (let i = 50; i < 100; i++) gray[i] = 210;

    const th = computeOtsuThreshold(gray);
    expect(th).toBeGreaterThanOrEqual(30);
    expect(th).toBeLessThanOrEqual(210);
  });

  it('classifies 7-segment digit 1 for narrow aspect ratio', () => {
    const w = 20, h = 30;
    const bin = new Uint8Array(w * h).fill(0);
    const box: BoundingBox = {
      minX: 5,
      minY: 2,
      maxX: 11,
      maxY: 28,
      width: 7,
      height: 27,
      area: 7 * 27,
      pixelCount: 50,
    };
    const res = classify7Segment(bin, w, box);
    expect(res).not.toBeNull();
    expect(res!.char).toBe('1');
  });

  it('classifies 7-segment minus sign for wide flat bar', () => {
    const w = 40, h = 30;
    const bin = new Uint8Array(w * h).fill(0);
    const box: BoundingBox = {
      minX: 5,
      minY: 12,
      maxX: 25,
      maxY: 16,
      width: 21,
      height: 5,
      area: 21 * 5,
      pixelCount: 40,
    };
    const res = classify7Segment(bin, w, box);
    expect(res).not.toBeNull();
    expect(res!.char).toBe('-');
  });

  it('classifies 7-segment digit 8 when all zones are active', () => {
    const w = 40, h = 50;
    const bin = new Uint8Array(w * h).fill(1); // Toàn bộ pixel được bật
    const box: BoundingBox = {
      minX: 10,
      minY: 5,
      maxX: 30,
      maxY: 45,
      width: 21,
      height: 41,
      area: 21 * 41,
      pixelCount: 21 * 41,
    };
    const res = classify7Segment(bin, w, box);
    expect(res).not.toBeNull();
    expect(res!.char).toBe('8');
  });

  it('finds connected components in a binary grid', () => {
    const w = 10, h = 10;
    const bin = new Uint8Array(w * h).fill(0);
    // Vẽ 1 khối 8x8 ở giữa
    for (let y = 1; y <= 8; y++) {
      for (let x = 1; x <= 8; x++) {
        bin[y * w + x] = 1;
      }
    }
    const boxes = findConnectedComponents(bin, w, h);
    expect(boxes.length).toBe(1);
    expect(boxes[0].width).toBe(8);
    expect(boxes[0].height).toBe(8);
  });
});

describe('trend analytics module', () => {
  const dummyProfile = {
    id: 'TBD503-PLEIKU2',
    station: 'Pleiku 2',
    bank: 'TBD 503',
    unbAlarm_pct: 0.40,
    unbBypass_pct: 0.65,
    vap: { mC: [1, 2] as [number, number], Vmin: 100, A: [1, 2] as [number, number] },
    unitCap_uF: 13.05,
    unitsPerString: 6,
    stringsPerGroup: 24,
    groupsPerPhase: 2,
    nominalTotal_uF: 104.4,
    tagGap_mm: 14,
  };

  it('loads benchmark history points for default profile', () => {
    const pts = getBenchmarkHistory('TBD503-PLEIKU2');
    expect(pts.length).toBeGreaterThanOrEqual(2);
    expect(pts[0].phaseA).toBeDefined();
    expect(pts[0].yearLabel).toContain('2023');
  });

  it('analyzes trend series and detects stable normal condition', () => {
    const pts: TrendDataPoint[] = [
      { id: '1', date: '2023-01-01', yearLabel: '2023', sessionType: 'after_install', phaseA: 0.08, phaseB: 0.09, phaseC: 0.07 },
      { id: '2', date: '2024-01-01', yearLabel: '2024', sessionType: 'after_1y', phaseA: 0.09, phaseB: 0.10, phaseC: 0.08 },
    ];
    const analysis = analyzeTrendSeries(pts, METRIC_DEFS.unbalance, dummyProfile);
    expect(analysis.verdict).toBe('pass');
    expect(analysis.annualDriftRate).toBeCloseTo(0.01, 2);
  });

  it('detects high drift rate and flags warning', () => {
    const pts: TrendDataPoint[] = [
      { id: '1', date: '2023-01-01', yearLabel: '2023', sessionType: 'after_install', phaseA: 0.10, phaseB: 0.10, phaseC: 0.10 },
      { id: '2', date: '2024-01-01', yearLabel: '2024', sessionType: 'after_1y', phaseA: 0.28, phaseB: 0.12, phaseC: 0.11 },
    ];
    const analysis = analyzeTrendSeries(pts, METRIC_DEFS.unbalance, dummyProfile);
    expect(analysis.verdict).toBe('warn');
    expect(analysis.projectedAlarmYears).toBeDefined();
  });

  it('flags fail when value exceeds bypass limit', () => {
    const pts: TrendDataPoint[] = [
      { id: '1', date: '2024-01-01', yearLabel: '2024', sessionType: 'periodic', phaseA: 0.68, phaseB: 0.10, phaseC: 0.10 },
    ];
    const analysis = analyzeTrendSeries(pts, METRIC_DEFS.unbalance, dummyProfile);
    expect(analysis.verdict).toBe('fail');
  });

  it('renders SVG trend chart with responsive polylines and markers', () => {
    const pts = getBenchmarkHistory('TBD503-PLEIKU2');
    const svg = renderTrendSvg(pts, METRIC_DEFS.unbalance, dummyProfile);
    expect(svg).toContain('<svg');
    expect(svg).toContain('Pha A');
    expect(svg).toContain('Pha B');
    expect(svg).toContain('Pha C');
    expect(svg).toContain('Alarm');
    expect(svg).toContain('class="trend-chart-svg"');
  });
});


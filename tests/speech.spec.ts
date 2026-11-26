// Hiểu câu nói khi nhập số đo bằng giọng nói (tiếng Việt).
import { describe, it, expect } from 'vitest';
import { parseCommand, parseOkNok, parseSpokenNumber, speakableNumber } from '../src/calc/speech';
import { parseNum } from '../src/calc/units';

describe('đọc số bằng giọng nói', () => {
  const cases: [string, string | null][] = [
    // máy nhận dạng trả chữ số
    ['250', '250'],
    ['4,36', '4,36'],
    ['4.36', '4,36'],
    ['4 , 36', '4,36'],
    ['1.200', '1200'],
    ['0.125', '0,125'],
    ['-4,36', '-4,36'],
    ['250 vôn', '250'],
    ['4,5 ampe', '4,5'],
    // đọc bằng chữ
    ['hai trăm năm mươi', '250'],
    ['bốn phẩy ba sáu', '4,36'],
    ['bốn phẩy ba mươi sáu', '4,36'],
    ['không phẩy không năm', '0,05'],
    ['phẩy một hai', '0,12'],
    ['mười lăm', '15'],
    ['hai mươi mốt', '21'],
    ['ba mươi tư', '34'],
    ['một trăm linh năm', '105'],
    ['hai nghìn', '2000'],
    ['ba nghìn hai trăm', '3200'],
    ['hai trăm rưỡi', '250'],
    ['bốn rưỡi', '4,5'],
    ['âm bốn phẩy ba sáu', '-4,36'],
    ['trừ hai', '-2'],
    ['chín mươi ba phẩy ba', '93,3'],
    ['không phẩy một sáu phần trăm', '0,16'],
    ['năm nghìn mê ga ôm', '5000'],
    ['bốn phẩy ba sáu ampe', '4,36'],
    ['một sáu một', '161'],
    // không phải số
    ['xin chào', null],
    ['', null],
    ['bốn phẩy', null],
  ];
  for (const [said, want] of cases) it(`"${said}" → ${want}`, () => expect(parseSpokenNumber(said)).toBe(want));
  it('kết quả đọc được bằng parseNum của app', () => {
    expect(parseNum(parseSpokenNumber('bốn phẩy ba sáu')!)).toBeCloseTo(4.36);
    expect(parseNum(parseSpokenNumber('1.200')!)).toBe(1200);
  });
});

describe('lệnh giọng nói', () => {
  it('tiếp / quay lại / dừng / xóa', () => {
    expect(parseCommand('Tiếp')).toBe('next');
    expect(parseCommand('bỏ qua')).toBe('next');
    expect(parseCommand('quay lại')).toBe('back');
    expect(parseCommand('Dừng lại.')).toBe('stop');
    expect(parseCommand('xóa')).toBe('clear');
    expect(parseCommand('bốn phẩy năm')).toBeNull();
  });
  it('ô Đạt / Không đạt', () => {
    expect(parseOkNok('Đạt')).toBe('ok');
    expect(parseOkNok('có')).toBe('ok');
    expect(parseOkNok('không đạt')).toBe('nok');
    expect(parseOkNok('không')).toBe('nok');
    expect(parseOkNok('hai')).toBeNull();
  });
  it('đọc lại giá trị', () => {
    expect(speakableNumber('-4,36')).toBe('âm 4 phẩy 36');
  });
});

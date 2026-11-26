// Hiểu câu nói tiếng Việt khi nhập số đo bằng giọng nói – hàm thuần, có test (tests/speech.spec.ts).
// Bộ nhận giọng nói (Chrome/Safari, vi-VN) có thể trả về chữ số ("4,36", "250") hoặc chữ ("bốn phẩy ba sáu").
// Kết quả luôn là chuỗi số kiểu Việt Nam (dấu phẩy thập phân) để ghi thẳng vào ô nhập – parseNum() đọc được.

import { foldVi } from './units';

const DIGIT: Record<string, number> = {
  khong: 0,
  mot: 1, // một, mốt
  hai: 2,
  ba: 3,
  bon: 4,
  tu: 4,
  nam: 5,
  lam: 5, // lăm
  nham: 5, // nhăm
  sau: 6,
  bay: 7,
  tam: 8,
  chin: 9,
};
/** Đơn vị và từ đệm hay đọc kèm số ("bốn phẩy năm ampe", "là hai trăm vôn") – bỏ qua. */
const UNIT_WORDS = new Set(['ampe', 'a', 'mili', 'mi', 'ma', 'vol', 'von', 'v', 'om', 'ohm', 'mega', 'me', 'ga', 'megaom', 'kilo', 'ki', 'lo', 'kv', 'mc', 'micro', 'pico', 'fara', 'f', 'pf', 'do', 'c', 'oat', 'w', 'mh', 'h', 'giay', 'phut', 'so', 'la', 'bang']);

/** Tách câu nói thành các từ đã bỏ dấu, chữ thường; giữ nguyên cụm chữ số như "4,36". */
function tokens(text: string): string[] {
  return foldVi(text)
    .toLowerCase()
    .replace(/(\d)\s*([.,])\s*(\d)/g, '$1$2$3') // "4 , 36" → "4,36"
    .split(/[\s;:!?]+/)
    .map((t) => t.replace(/^[^\p{L}\p{N}-]+|[^\p{L}\p{N}%]+$/gu, ''))
    .filter(Boolean);
}

/** "1.200" (vi-VN: chấm = nghìn) → 1200; "4,36" / "4.36" (≤ 2 chữ số sau chấm) → 4,36. */
function digitsToken(t: string): string | null {
  if (!/^-?\d+(?:[.,]\d+)*$/.test(t)) return null;
  const neg = t.startsWith('-');
  const s = neg ? t.slice(1) : t;
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s) && !/^0\./.test(s)) return (neg ? '-' : '') + s.replace(/\./g, ''); // 1.200 / 1.200,5
  if (/^\d+[.,]\d+$/.test(s)) return (neg ? '-' : '') + s.replace('.', ',');
  if (/^\d+$/.test(s)) return (neg ? '-' : '') + s;
  return null;
}

/** Dãy từ chỉ số (không dấu) → số nguyên. Không có hàng (mươi/trăm/nghìn) → đọc từng chữ số: "ba sáu" = 36. */
function wordsToInt(words: string[]): { value: string; half: boolean } | null {
  if (!words.length) return null;
  const SCALE = new Set(['muoi', 'tram', 'nghin', 'ngan', 'trieu', 'linh', 'le', 'ruoi']);
  const known = (w: string) => w in DIGIT || SCALE.has(w) || /^\d+$/.test(w);
  if (!words.every(known)) return null;
  // chỉ chữ số đơn → ghép lần lượt (đọc số serial, phần thập phân, "không năm")
  if (!words.some((w) => SCALE.has(w))) return { value: words.map((w) => (/^\d+$/.test(w) ? w : String(DIGIT[w]))).join(''), half: false };
  let total = 0;
  let cur = 0; // phần dưới 1000
  let pending: number | null = null; // chữ số chưa gán hàng
  let lastScale = 1;
  let half = false;
  for (const w of words) {
    if (/^\d+$/.test(w)) {
      pending = (pending ?? 0) * 10 ** w.length + Number(w);
      continue;
    }
    if (w in DIGIT) {
      pending = DIGIT[w];
      continue;
    }
    switch (w) {
      case 'muoi': // "mười" và "mươi" cùng bỏ dấu thành "muoi": không có số đứng trước = mười
        cur += (pending ?? 1) * 10;
        pending = null;
        lastScale = 10;
        break;
      case 'tram':
        cur += (pending ?? 1) * 100;
        pending = null;
        lastScale = 100;
        break;
      case 'nghin':
      case 'ngan':
        total += (cur + (pending ?? 0) || 1) * 1000;
        cur = 0;
        pending = null;
        lastScale = 1000;
        break;
      case 'trieu':
        total += (cur + (pending ?? 0) || 1) * 1e6;
        cur = 0;
        pending = null;
        lastScale = 1e6;
        break;
      case 'linh':
      case 'le':
        break;
      case 'ruoi': // "hai trăm rưỡi" = 250; "bốn rưỡi" = 4,5
        if (lastScale >= 100) cur += lastScale / 2;
        else half = true;
        break;
    }
  }
  return { value: String(total + cur + (pending ?? 0)), half };
}

/**
 * Câu nói → số đo dạng chuỗi Việt Nam ("4,36", "-4,5", "250") hoặc null nếu không phải số.
 * Hiểu: chữ số do máy nhận dạng trả về, chữ ("hai trăm năm mươi", "bốn phẩy ba sáu", "không phẩy không năm"),
 * dấu âm ("âm", "trừ"), "rưỡi"; bỏ qua đơn vị đọc kèm ("ampe", "mê ga ôm", "độ"…).
 */
export function parseSpokenNumber(text: string): string | null {
  let ts = tokens(text);
  let neg = false;
  while (ts.length && ['am', 'tru'].includes(ts[0])) {
    neg = true;
    ts = ts.slice(1);
  }
  // "phần trăm" là đơn vị, không phải hàng trăm
  ts = ts.filter((t, i) => !UNIT_WORDS.has(t) && t !== '%' && !(t === 'phan' && ts[i + 1] === 'tram') && !(t === 'tram' && ts[i - 1] === 'phan'));
  if (!ts.length) return null;
  // máy đã trả chữ số: lấy cụm số đầu tiên (kèm phần thập phân đọc riêng nếu có)
  if (ts.length === 1 && digitsToken(ts[0])) return sign(neg, digitsToken(ts[0])!);
  const sep = ts.findIndex((t) => t === 'phay' || t === 'cham');
  const intWords = sep >= 0 ? ts.slice(0, sep) : ts;
  const fracWords = sep >= 0 ? ts.slice(sep + 1) : [];
  const ip = intWords.length === 1 && digitsToken(intWords[0]) ? { value: digitsToken(intWords[0])!, half: false } : wordsToInt(intWords.length ? intWords : ['khong']);
  if (!ip) return null;
  if (sep >= 0) {
    const fp = fracWords.length === 1 && /^\d+$/.test(fracWords[0]) ? { value: fracWords[0] } : wordsToInt(fracWords);
    if (!fp || !fracWords.length) return null;
    return sign(neg, `${ip.value},${fp.value}`);
  }
  return sign(neg, ip.half ? `${ip.value},5` : ip.value);
}
const sign = (neg: boolean, v: string) => (neg && !v.startsWith('-') ? '-' + v : v);

export type VoiceCommand = 'next' | 'back' | 'stop' | 'clear';

/** Lệnh điều khiển khi đọc liên tiếp: "tiếp/bỏ qua", "quay lại", "dừng", "xóa". */
export function parseCommand(text: string): VoiceCommand | null {
  const t = foldVi(text).toLowerCase().replace(/[^a-z\s]/g, '').trim();
  if (/^(tiep( theo)?|bo qua|qua|next)$/.test(t)) return 'next';
  if (/^(quay lai|lui|tro lai|back)$/.test(t)) return 'back';
  if (/^(dung( lai)?|thoi|ket thuc|xong|stop)$/.test(t)) return 'stop';
  if (/^(xoa|xoa di|xoa so)$/.test(t)) return 'clear';
  return null;
}

/** Ô chọn Đạt/Không đạt: "đạt", "có", "ok" → ok; "không đạt", "không", "hỏng" → nok. */
export function parseOkNok(text: string): 'ok' | 'nok' | null {
  const t = foldVi(text).toLowerCase().replace(/[^a-z\s]/g, '').trim();
  if (/^(khong dat|khong|hong|loi|nok|not ok|sai)$/.test(t)) return 'nok';
  if (/^(dat|co|ok|oke|duoc|tot|dung)$/.test(t)) return 'ok';
  return null;
}

/** Đọc lại giá trị cho người dùng nghe: "4,36" → "4 phẩy 36", "-4,5" → "âm 4 phẩy 5". */
export function speakableNumber(v: string): string {
  return v.replace(/^-/, 'âm ').replace(',', ' phẩy ');
}

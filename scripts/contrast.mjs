// Kiểm tra độ tương phản WCAG của các cặp màu đang dùng trong từng chủ đề (src/styles/tokens.css).
// Chữ thường cần ≥ 4.5; chữ đậm/lớn (thanh tiêu đề, nút, nhãn kết quả) ≥ 3.
import { readFileSync } from 'node:fs';

const css = readFileSync('src/styles/tokens.css', 'utf8');
const themes = {};
for (const m of css.matchAll(/((?:\[data-theme='(\w+)'\]|:root)[^{]*)\{([^}]*)\}/g)) {
  const names = [...m[1].matchAll(/data-theme='(\w+)'/g)].map((x) => x[1]);
  if (!names.length) continue;
  const vars = Object.fromEntries([...m[3].matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((x) => [x[1], x[2]]));
  for (const n of names) themes[n] = { ...themes[n], ...vars };
}

const lum = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

const PAIRS = [
  ['c-text', 'c-bg', 4.5, 'chữ / nền'],
  ['c-text', 'c-surface-2', 4.5, 'chữ / ô xám'],
  ['c-muted', 'c-bg', 4.5, 'chữ phụ / nền'],
  ['c-muted', 'c-surface', 4.5, 'chữ phụ / thẻ'],
  ['c-primary', 'c-bg', 4.5, 'liên kết / nền'],
  ['c-primary-ink', 'c-primary', 4.5, 'nút chính'],
  ['c-bar-ink', 'c-bar', 4.5, 'thanh tiêu đề'],
  ['c-danger-ink', 'c-danger', 4.5, 'khối NGUY HIỂM'],
  ['c-ok-ink', 'c-ok', 3, 'nhãn Đạt (đậm)'],
  ['c-warn-ink', 'c-warn-bg', 4.5, 'khối CẢNH BÁO'],
  ['c-info-ink', 'c-info-bg', 4.5, 'khối LƯU Ý'],
  ['c-danger-fg', 'c-bg', 3, 'viền/vạch/chữ nguy hiểm'],
  ['c-danger-edge', 'c-bg', 3, 'viền khối NGUY HIỂM'],
];

let bad = 0;
for (const [name, v] of Object.entries(themes)) {
  console.log(`\n${name}`);
  for (const [fg, bg, min, label] of PAIRS) {
    const r = ratio(v[fg], v[bg]);
    const ok = r >= min;
    if (!ok) bad++;
    console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${r.toFixed(2).padStart(5)} (≥${min})  ${label}`);
  }
}
console.log(bad ? `\n${bad} cặp chưa đạt` : '\nTất cả đạt');
process.exit(bad ? 1 : 0);

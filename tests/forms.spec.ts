// Kiểm tra đặc tính (characterization) toàn bộ biểu mẫu: HTML render và rows() phải giữ nguyên khi refactor.
// Snapshot đổi = hành vi biên bản đổi → chỉ cập nhật (`vitest -u`) khi thay đổi là chủ ý.
import { describe, it, expect } from 'vitest';
import { items, PROFILE_DEFAULTS } from '../src/content';
import { formFor, evaluateTest, PHASES, type Values } from '../src/forms';
import type { Profile } from '../src/types';

const profile = { id: 'p', station: 'T500 Test', bank: 'TBD-T', tagGap_mm: 12, ...PROFILE_DEFAULTS } as Profile;

/** Lấy mọi ô nhập của biểu mẫu (mọi pha) và điền giá trị xác định theo bộ số. */
function fill(itemId: string, testId: string, set: number): Values {
  const f = formFor(itemId, testId)!;
  const v: Values = {};
  const base = { __item: itemId, __test: testId };
  const nums = ['1', '12,5', '2500', '-3', '0,15', '250', '4,1'];
  let i = set;
  for (const ph of f.phased ? PHASES : (['A'] as const)) {
    const html = f.render(base, profile, ph);
    for (const m of html.matchAll(/<(input|select)([^>]*?)data-k="([^"]+)"([^>]*)>([\s\S]*?)(?=<\/select>|$)?/g)) {
      const key = m[3];
      if (key in v) continue;
      if (m[1] === 'select') {
        const opts = [...html.slice(m.index!).split('</select>')[0].matchAll(/<option value="([^"]*)"/g)].map((o) => o[1]).filter(Boolean);
        v[key] = opts[i++ % opts.length] ?? '';
      } else if (/type="text"/.test(m[2] + m[4])) v[key] = `ghi chú ${key}`;
      else v[key] = nums[i++ % nums.length];
    }
  }
  return v;
}

const tests = items.flatMap((it) => it.tests.filter((t) => t.form).map((t) => [it.id, t.id, t.form!] as const));

describe('biểu mẫu – đặc tính render và kết quả', () => {
  it('có đủ 10 loại biểu mẫu', () => {
    expect(new Set(tests.map((t) => t[2])).size).toBe(10);
  });
  for (const [itemId, testId, form] of tests) {
    it(`${itemId}/${testId} (${form})`, () => {
      const f = formFor(itemId, testId)!;
      const render = (f.phased ? PHASES : (['A'] as const)).map((ph) => f.render({ __item: itemId, __test: testId }, profile, ph));
      const rows = [0, 1, 2].map((set) => evaluateTest(itemId, testId, fill(itemId, testId, set), profile));
      expect(rows.some((r) => r.length > 0)).toBe(true);
      expect({ render, rows }).toMatchSnapshot();
    });
  }
});

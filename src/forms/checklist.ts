import { getTest } from '../content';
import type { FormDef } from './types';
import { has, okRes, okTxt, selRow, textRow } from './inputs';

// ---------- Checklist ----------
export const checklist: FormDef = {
  phased: false,
  render(v, _p, _ph, _prev) {
    // testId truyền qua v.__test (gán khi mở biểu mẫu)
    const t = getTest(v.__item, v.__test);
    return `${(t?.checklist ?? []).map((c, i) => selRow(v, `c${i}`, c)).join('')}${textRow(v, 'note', 'Ghi chú / tồn tại')}`;
  },
  rows(v, _p, testId, itemId) {
    const t = getTest(itemId, testId);
    const rows = (t?.checklist ?? []).map((c, i) => ({ group: '', label: c.replace(/\*\*/g, ''), value: okTxt(v[`c${i}`]), expected: 'Đạt', result: okRes(v[`c${i}`]) }));
    if (has(v, 'note')) rows.push({ group: '', label: 'Ghi chú', value: v.note, expected: '', result: 'na' });
    return rows;
  },
};

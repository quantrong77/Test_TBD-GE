// Trung tâm biểu mẫu: mỗi biểu mẫu render / live / rows. rows() là nguồn duy nhất cho kết quả (UI, tổng kết, PDF, Excel, xu hướng).
import { getTest } from '../content';
import type { Profile } from '../types';
import type { FormDef, ResultRow, Values } from './types';
import { checklist } from './checklist';
import { unbalanceForm } from './unbalance';
import { movForm, reactorForm } from './compare';
import { bushingForm } from './bushing';
import { ct10Form, gapForm, triggerForm, vapForm } from './tag';
import { injectForm } from './inject';

export * from './types';
export { numRow, paintRows, selRow, textRow } from './inputs';
export { CT_ROWS } from './inject';

export const FORMS: Record<string, FormDef> = {
  checklist,
  unbalance: unbalanceForm,
  mov: movForm,
  reactor: reactorForm,
  bushing: bushingForm,
  gap: gapForm,
  vap: vapForm,
  trigger: triggerForm,
  ct10: ct10Form,
  inject: injectForm,
};

export function formFor(itemId: string, testId: string): FormDef | undefined {
  const t = getTest(itemId, testId);
  return t?.form ? FORMS[t.form] : undefined;
}

export function evaluateTest(itemId: string, testId: string, v: Values, p: Profile): ResultRow[] {
  const f = formFor(itemId, testId);
  if (!f) return [];
  return f.rows({ ...v, __item: itemId, __test: testId }, p, testId, itemId);
}

// Ô nhập dùng chung (số, chữ, chọn Đạt/Không đạt) và tô màu dòng theo ngưỡng.
import { getThreshold } from '../content';
import { describeThreshold, evalThreshold, resolveThreshold } from '../calc/evaluate';
import { parseNum } from '../calc/units';
import { esc, rich } from '../ui';
import type { Profile, Result } from '../types';
import type { Values } from './types';

export const n = (v: Values, k: string) => parseNum(v[k]);
export const has = (v: Values, k: string) => (v[k] ?? '').trim() !== '';
export const val = (v: Values, k: string, unit = '') => (has(v, k) ? `${v[k]}${unit ? ' ' + unit : ''}` : '');

export const OKNOK: [string, string][] = [
  ['', '—'],
  ['ok', '✓ Đạt / Có'],
  ['nok', '✗ Không đạt / Không'],
];
export const okRes = (s: string | undefined): Result => (s === 'ok' ? 'pass' : s === 'nok' ? 'fail' : 'na');
export const okTxt = (s: string | undefined) => (s === 'ok' ? '✓' : s === 'nok' ? '✗' : '');

// ---------- Ô nhập ----------
export function numRow(v: Values, k: string, label: string, sub = '', th = '', placeholder = '', ocr = true): string {
  return `<div class="inrow" data-row="${esc(k)}"${th ? ` data-th="${esc(th)}"` : ''}><span class="lbl">${rich(label)}${sub ? `<small>${rich(sub)}</small>` : ''}</span><div class="hstack-tight"><input class="grow" inputmode="decimal" data-k="${esc(k)}" value="${esc(v[k] ?? '')}" placeholder="${esc(placeholder)}" aria-label="${esc(label)}">${ocr ? `<button type="button" class="btn-ocr-scan" data-scan-for="${esc(k)}" title="Quét số đo bằng camera (OCR)" aria-label="Quét số cho ${esc(label)}">📷</button>` : ''}<button type="button" class="btn-voice" data-voice-for="${esc(k)}" title="Nói số đo (giọng nói)" aria-label="Nói số cho ${esc(label)}">🎤</button></div></div>`;
}
export function textRow(v: Values, k: string, label: string, sub = ''): string {
  return `<div class="inrow"><span class="lbl">${rich(label)}${sub ? `<small>${rich(sub)}</small>` : ''}</span><input type="text" data-k="${esc(k)}" value="${esc(v[k] ?? '')}" aria-label="${esc(label)}"></div>`;
}
export function selRow(v: Values, k: string, label: string, opts: [string, string][] = OKNOK, sub = ''): string {
  return `<div class="inrow" data-row="${esc(k)}" data-ok="1"><span class="lbl">${rich(label)}${sub ? `<small>${rich(sub)}</small>` : ''}</span><select data-k="${esc(k)}" aria-label="${esc(label)}">${opts
    .map(([o, l]) => `<option value="${esc(o)}"${(v[k] ?? '') === o ? ' selected' : ''}>${esc(l)}</option>`)
    .join('')}</select></div>`;
}

/** Tô màu các dòng có data-th / data-ok theo kết quả. */
export function paintRows(root: HTMLElement, v: Values, p: Profile) {
  root.querySelectorAll<HTMLElement>('.inrow[data-row]').forEach((row) => {
    const k = row.dataset.row!;
    let r: Result = 'na';
    if (row.dataset.th) {
      const t = getThreshold(row.dataset.th);
      if (t) r = evalThreshold(t, n(v, k), p);
    } else if (row.dataset.ok) r = okRes(v[k]);
    row.classList.remove('res-pass', 'res-fail', 'res-warn');
    if (r !== 'na') row.classList.add('res-' + r);
  });
}

export const thDesc = (id: string, p: Profile) => {
  const t = getThreshold(id);
  return t ? describeThreshold(resolveThreshold(t, p)) : '';
};

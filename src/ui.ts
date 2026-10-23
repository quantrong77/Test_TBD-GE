import type { Callout, Result } from './types';
import imagesMeta from '../content/images.json';

export const esc = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Văn bản nội dung: escape rồi đổi **x** thành <b>x</b>. */
export const rich = (s: string): string => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');

/** Bỏ ký hiệu ** khi cần text thuần (PDF, tìm kiếm). */
export const plain = (s: string): string => s.replace(/\*\*/g, '');

export const imgUrl = (f: string) => `images/${f}`;

type ImgMeta = { w: number; h: number; caption: string };
export const imgMeta = (f: string): ImgMeta => (imagesMeta as Record<string, ImgMeta>)[f] ?? { w: 1200, h: 900, caption: f };

const CALLOUT: Record<Callout['level'], [string, string]> = {
  danger: ['⛔', 'NGUY HIỂM'],
  warn: ['⚠️', 'CẢNH BÁO'],
  info: ['ℹ️', 'LƯU Ý'],
};

export function callout(c: Callout): string {
  const [ico, lbl] = CALLOUT[c.level];
  return `<div class="callout ${c.level}" role="${c.level === 'danger' ? 'alert' : 'note'}"><span class="ico" aria-hidden="true">${ico}</span><div><span class="lbl">${lbl}</span>${rich(c.text)}</div></div>`;
}

/** Thư viện ảnh có thể mở trình xem (data-gallery gom nhóm). */
export function gallery(files: string[], group: string): string {
  if (!files.length) return '';
  return `<div class="gallery" data-gallery="${esc(group)}">${files
    .map((f) => {
      const m = imgMeta(f);
      return `<a href="${imgUrl(f)}" data-pswp-width="${m.w}" data-pswp-height="${m.h}" data-caption="${esc(m.caption)}"><img src="${imgUrl(f)}" alt="${esc(m.caption)}" loading="lazy" width="${m.w}" height="${m.h}"><span>${esc(m.caption)}</span></a>`;
    })
    .join('')}</div>`;
}

/** Một ảnh lớn (chạm để phóng to). */
export function figure(f: string, group: string): string {
  const m = imgMeta(f);
  return `<div data-gallery="${esc(group)}"><a class="figure" href="${imgUrl(f)}" data-pswp-width="${m.w}" data-pswp-height="${m.h}" data-caption="${esc(m.caption)}"><img src="${imgUrl(f)}" alt="${esc(m.caption)}" width="${m.w}" height="${m.h}"><span>${esc(m.caption)} · chạm để phóng to</span></a></div>`;
}

export function table(head: string[], rows: string[][], numericCols: number[] = []): string {
  return `<div class="table-wrap"><table><thead><tr>${head.map((h) => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows
    .map((r) => `<tr>${r.map((c, i) => `<td${numericCols.includes(i) ? ' class="num"' : ''}>${rich(c)}</td>`).join('')}</tr>`)
    .join('')}</tbody></table></div>`;
}

const RES_LABEL: Record<Result, string> = { pass: '✅ Đạt', fail: '❌ Không đạt', warn: '⚠️ Cảnh báo', na: '— Chưa có' };
export const resText = (r: Result) => RES_LABEL[r];
export const resBadge = (r: Result, label?: string) => `<span class="res ${r}">${esc(label ?? RES_LABEL[r])}</span>`;

export function vibrate(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* không hỗ trợ */
  }
}

let toastTimer: number | undefined;
export function toast(msg: string, action?: { label: string; run: () => void }, ms = 3500) {
  const el = document.getElementById('toast')!;
  el.innerHTML = `<span>${esc(msg)}</span>${action ? `<button class="btn" type="button">${esc(action.label)}</button>` : ''}`;
  el.classList.add('show');
  if (action) el.querySelector('button')!.addEventListener('click', () => { el.classList.remove('show'); action.run(); });
  window.clearTimeout(toastTimer);
  if (!action) toastTimer = window.setTimeout(() => el.classList.remove('show'), ms);
}

export const uid = () =>
  (crypto as Crypto & { randomUUID?: () => string }).randomUUID?.() ??
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const fmtDate = (iso: string) => (iso ? iso.split('-').reverse().join('/') : '');
export const fmtTime = (ts: number) => new Date(ts).toLocaleString('vi-VN');

export function debounce<A extends unknown[]>(fn: (...a: A) => void, ms: number) {
  let t: number | undefined;
  return (...a: A) => {
    window.clearTimeout(t);
    t = window.setTimeout(() => fn(...a), ms);
  };
}

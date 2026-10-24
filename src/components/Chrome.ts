import { esc } from '../ui';

const NAV = [
  { href: '#/', ico: '🏠', label: 'Trang chủ', match: (p: string) => p === '' },
  { href: '#/sessions', ico: '📝', label: 'Phiên TN', match: (p: string) => /^(session|profile|instrument|calc)/.test(p) },
  { href: '#/items', ico: '🧪', label: 'Hạng mục', match: (p: string) => p.startsWith('item') || p.startsWith('gate') },
  { href: '#/thresholds', ico: '📊', label: 'Ngưỡng', match: (p: string) => p.startsWith('thresholds') },
  { href: '#/search', ico: '🔍', label: 'Tìm', match: (p: string) => p.startsWith('search') },
];

/** Thanh tab dựng một lần; mỗi lần chuyển trang chỉ đổi tab đang chọn (không chớp biểu tượng). */
export function renderNav(raw: string) {
  const p = raw.split('?')[0];
  const nav = document.getElementById('bottomnav')!;
  if (!nav.children.length) {
    nav.innerHTML = NAV.map((n) => `<a href="${n.href}"><span class="ico" aria-hidden="true">${n.ico}</span>${n.label}</a>`).join('');
  }
  NAV.forEach((n, i) => {
    const a = nav.children[i];
    if (n.match(p)) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}

/** Thanh tiêu đề: back (nếu có), tiêu đề, phụ đề, nút cài đặt. */
export function setTop(title: string, opts: { back?: string | true; sub?: string; close?: string } = {}) {
  const top = document.getElementById('topbar')!;
  const left = opts.close
    ? `<a class="icon-btn" href="${esc(opts.close)}" aria-label="Thoát chế độ từng bước">✕</a>`
    : opts.back
      ? opts.back === true
        ? `<button class="icon-btn" type="button" data-back aria-label="Quay lại">←</button>`
        : `<a class="icon-btn" href="${esc(opts.back)}" aria-label="Quay lại">←</a>`
      : // giữ chỗ cho nút ← để tiêu đề không xô ngang giữa các trang
        '<span class="icon-btn" aria-hidden="true"></span>';
  top.innerHTML = `${left}<div class="title">${esc(title)}${opts.sub ? `<small>${esc(opts.sub)}</small>` : ''}</div>
    <a class="icon-btn" href="#/help" aria-label="Hướng dẫn sử dụng" title="Hướng dẫn sử dụng">📖</a>
    <a class="icon-btn" href="#/info" aria-label="Giới thiệu" title="Giới thiệu">ℹ️</a>
    <a class="icon-btn" href="#/settings" aria-label="Cài đặt" title="Cài đặt">⚙️</a>`;
  top.querySelector('[data-back]')?.addEventListener('click', () => history.back());
  document.title = `${title} – TBD-GE Field`;
}

import { can, getMe, ROLE_LABEL, type Me } from '../auth/roles';
import { authState } from '../auth/gate';
import { getAuth } from '../auth/session';
import { getStatus, isConfigured, onStatus, statusText } from '../sync/status';
import { esc, toast } from '../ui';
import { Icons } from './Icons';

/**
 * Vùng người dùng trên thanh tiêu đề: ảnh đại diện (chữ viết tắt) + chấm trạng thái
 * (xanh: đã đồng bộ · vàng: còn thay đổi chờ gửi · xanh dương: đang đồng bộ · đỏ: lỗi · xám: ngoại tuyến).
 * Bấm → bảng tài khoản: thông tin, trạng thái đăng nhập / đồng bộ, lối tắt, đăng xuất.
 * Chế độ dùng một mình hoặc chưa vào app: hiện nút ⚙️ Cài đặt như cũ.
 */

/** Chữ viết tắt: chữ đầu của họ + tên (tên tiếng Việt đứng cuối), hoặc chữ đầu email. */
export function initials(me: Pick<Me, 'name' | 'email'>): string {
  const words = (me.name && me.name !== me.email ? me.name : '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return (me.email[0] ?? '?').toUpperCase();
  const first = words[0][0];
  const last = words.length > 1 ? words[words.length - 1][0] : '';
  return (first + last).toUpperCase();
}

type Presence = 'ok' | 'warn' | 'busy' | 'err' | 'off';
function presence(): { p: Presence; text: string } {
  if (!navigator.onLine) return { p: 'off', text: 'Ngoại tuyến – dữ liệu lưu trên máy, gửi khi có mạng' };
  const s = getStatus();
  if (s.state === 'error') return { p: 'err', text: s.message ?? 'Lỗi đồng bộ' };
  if (s.state === 'syncing') return { p: 'busy', text: 'Đang đồng bộ…' };
  if (s.pending) return { p: 'warn', text: `Còn ${s.pending} thay đổi chờ gửi` };
  return { p: 'ok', text: 'Trực tuyến – đã đồng bộ' };
}

const showChip = () => isConfigured() && authState() === 'ok';

/** HTML cho góc phải thanh tiêu đề (gọi từ setTop). */
export function userSlotHtml(): string {
  const me = getMe();
  if (!showChip() || !me) return `<a class="icon-btn" href="#/settings" aria-label="Cài đặt" title="Cài đặt">${Icons.settings}</a>`;
  const { p, text } = presence();
  return `<button class="icon-btn user-chip" type="button" data-user-chip aria-haspopup="dialog" aria-expanded="${isOpen()}" aria-controls="user-menu"
      aria-label="Tài khoản ${esc(me.name)} – ${esc(text)}" title="${esc(me.name)} – ${esc(text)}">
      <span class="avatar" aria-hidden="true">${esc(initials(me))}</span><span class="presence p-${p}" aria-hidden="true"></span>
    </button>`;
}

const fmtDT = (ts: number) => new Date(ts).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });
const fmtD = (ts: number) => new Date(ts).toLocaleDateString('vi-VN');

function menuHtml(me: Me): string {
  const auth = getAuth();
  const { p, text } = presence();
  return `
    <div class="um-head">
      <span class="avatar big" aria-hidden="true">${esc(initials(me))}</span>
      <div>
        <b>${esc(me.name)}</b>
        <div class="small muted">${esc(me.email)}</div>
        <div class="small">${me.role ? esc(ROLE_LABEL[me.role]) : ''}${me.teamName ? ` – ${esc(me.teamName)}` : ''}</div>
        ${me.title || me.unit ? `<div class="small muted">${esc([me.title, me.unit].filter(Boolean).join(' · '))}</div>` : ''}
      </div>
    </div>
    <ul class="um-status" aria-label="Trạng thái">
      <li><span class="presence p-${p}" aria-hidden="true"></span><span>${esc(text)}</span></li>
      ${navigator.onLine && getStatus().state !== 'off' ? `<li><span>${esc(statusText(getStatus()))}</span></li>` : ''}
      ${auth?.signedInAt ? `<li><span>🕒 Đăng nhập lúc ${esc(fmtDT(auth.signedInAt))}</span></li>` : ''}
      ${auth ? `<li><span>🔑 Phiên hiệu lực đến ${esc(fmtD(auth.expiresAt))} <span class="muted">(tự gia hạn khi có mạng)</span></span></li>` : ''}
    </ul>
    <div class="um-actions">
      <button class="btn block" type="button" data-um="sync"${navigator.onLine ? '' : ' disabled'}>↻ Đồng bộ ngay</button>
      <a class="um-link" href="#/register">✎ Hồ sơ của tôi</a>
      <a class="um-link" href="#/settings">⚙️ Cài đặt</a>
      ${can('admin.panel', me) ? '<a class="um-link" href="#/admin">🛡️ Quản trị hệ thống</a>' : ''}
      <button class="btn secondary block" type="button" data-um="out">↪ Đăng xuất</button>
    </div>`;
}

let menu: HTMLElement | null = null;
const isOpen = () => !!menu && !menu.hidden;

function chip(): HTMLButtonElement | null {
  return document.querySelector<HTMLButtonElement>('#topbar [data-user-chip]');
}

function open() {
  const me = getMe();
  if (!menu || !me || !showChip()) return;
  menu.innerHTML = menuHtml(me);
  menu.dataset.html = menu.innerHTML;
  menu.hidden = false;
  chip()?.setAttribute('aria-expanded', 'true');
  menu.querySelector<HTMLElement>('button, a')?.focus();
}

function close(focusChip = false) {
  if (!menu || menu.hidden) return;
  menu.hidden = true;
  const c = chip();
  c?.setAttribute('aria-expanded', 'false');
  if (focusChip) c?.focus();
}

/** Cập nhật chip (chấm trạng thái, chữ viết tắt) và bảng nếu đang mở – sửa tại chỗ, không thay phần tử. */
function refresh() {
  const c = chip();
  const me = getMe();
  if (c && me && showChip()) {
    const { p, text } = presence();
    const ini = initials(me);
    const av = c.querySelector('.avatar')!;
    if (av.textContent !== ini) av.textContent = ini;
    const dot = c.querySelector('.presence')!;
    if (dot.className !== `presence p-${p}`) dot.className = `presence p-${p}`;
    c.setAttribute('aria-label', `Tài khoản ${me.name} – ${text}`);
    c.title = `${me.name} – ${text}`;
  } else if (c) {
    // rời app (đăng xuất, bị khóa): trả lại nút ⚙️
    c.outerHTML = userSlotHtml();
  } else if (showChip()) {
    // vừa vào app: thay nút ⚙️ bằng chip
    const gear = document.querySelector<HTMLElement>('#topbar a[href="#/settings"]');
    if (gear) gear.outerHTML = userSlotHtml();
  }
  if (isOpen()) {
    if (me && showChip()) {
      const html = menuHtml(me);
      if (menu!.dataset.html !== html) {
        menu!.innerHTML = html;
        menu!.dataset.html = html;
      }
    } else close();
  }
}

let started = false;
export function initUserMenu() {
  if (started) return;
  started = true;
  menu = document.createElement('div');
  menu.id = 'user-menu';
  menu.className = 'user-menu';
  menu.setAttribute('role', 'dialog');
  menu.setAttribute('aria-label', 'Tài khoản và trạng thái đăng nhập');
  menu.hidden = true;
  document.body.appendChild(menu);

  document.getElementById('topbar')!.addEventListener('click', (e) => {
    if (!(e.target as Element).closest('[data-user-chip]')) return;
    if (isOpen()) close();
    else open();
  });
  menu.addEventListener('click', async (e) => {
    const t = e.target as Element;
    if (t.closest('a')) return close(); // điều hướng
    const act = t.closest<HTMLElement>('[data-um]')?.dataset.um;
    if (act === 'sync') {
      const { loadBackend } = await import('../sync/backend');
      const m = await loadBackend();
      m.startAuto();
      void m.syncNow();
      toast('Đang đồng bộ…');
    } else if (act === 'out') {
      if (!confirm('Đăng xuất? Dữ liệu trên máy này vẫn giữ nguyên; thay đổi chưa gửi sẽ gửi khi đăng nhập lại.')) return;
      close();
      const { signOutAndLeave } = await import('../views/Auth');
      await signOutAndLeave();
    }
  });
  document.addEventListener('click', (e) => {
    if (isOpen() && !menu!.contains(e.target as Node) && !(e.target as Element).closest?.('[data-user-chip]')) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen()) close(true);
  });
  window.addEventListener('route:leave', () => close());
  window.addEventListener('auth:changed', refresh);
  window.addEventListener('online', refresh);
  window.addEventListener('offline', refresh);
  onStatus(refresh);
}

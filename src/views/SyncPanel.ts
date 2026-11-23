import { getStatus, isConfigured, onStatus, statusText } from '../sync/status';
import { can, getMe, isMember, ROLE_LABEL } from '../auth/roles';
import { esc } from '../ui';
import { signOutAndLeave } from './Auth';

/**
 * Mục "Tài khoản và đồng bộ" trong Cài đặt.
 * Có máy chủ: người dùng đã đăng nhập (cổng đăng nhập bắt buộc) – đồng bộ chạy tự động với cả đội.
 * Không có máy chủ: chế độ dùng một mình.
 */
export async function renderSyncPanel(box: HTMLElement) {
  if (!isConfigured()) {
    box.innerHTML = `<p class="small muted">Chế độ dùng một mình: chưa cấu hình máy chủ, không cần đăng nhập. Dữ liệu chỉ nằm trên máy này – dùng <b>Sao lưu toàn bộ</b> bên dưới.</p>`;
    return;
  }
  const me = getMe();
  if (!isMember(me)) {
    box.innerHTML = '<p class="small muted">Chưa đăng nhập.</p>';
    return;
  }
  const { loadBackend } = await import('../sync/backend');
  const m = await loadBackend();
  box.innerHTML = `
    <div class="card" style="margin-top:0">
      <b>${esc(me.name)}</b>
      <div class="small muted">${esc(me.email)}</div>
      <div class="small">${esc(ROLE_LABEL[me.role])} – ${esc(me.teamName ?? '')}</div>
      ${me.title || me.unit ? `<div class="small muted">${esc([me.title, me.unit].filter(Boolean).join(' · '))}</div>` : ''}
    </div>
    <p class="small muted">Dữ liệu tự đồng bộ với cả đội qua ${esc(m.SERVER_LABEL)} mỗi khi có mạng; không có mạng vẫn dùng bình thường.</p>
    <p class="small" id="sync-status" role="status">${esc(statusText(getStatus()))}</p>
    <div class="btn-row">
      <button class="btn" type="button" id="sync-now">↻ Đồng bộ ngay</button>
      <a class="btn secondary" href="#/register">✎ Hồ sơ của tôi</a>
      <button class="btn secondary" type="button" id="sync-out">Đăng xuất</button>
    </div>
    ${can('admin.panel', me) ? '<a class="btn block" href="#/admin" style="margin-top:8px">🛡️ Quản trị hệ thống</a>' : ''}`;

  box.querySelector('#sync-now')!.addEventListener('click', () => {
    m.startAuto();
    void m.syncNow();
  });
  box.querySelector('#sync-out')!.addEventListener('click', async () => {
    if (!confirm('Đăng xuất? Dữ liệu trên máy này vẫn giữ nguyên; thay đổi chưa gửi sẽ gửi khi đăng nhập lại.')) return;
    await signOutAndLeave();
  });
  const off = onStatus((s) => {
    const el = box.querySelector('#sync-status');
    if (el) el.textContent = statusText(s);
  });
  window.addEventListener('route:leave', () => off(), { once: true });
}

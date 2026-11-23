import { setTop } from '../components/Chrome';
import { Icons } from '../components/Icons';
import { can } from '../auth/roles';
import { getStatus, isConfigured, onStatus, statusText } from '../sync/status';
import { download } from '../export/report';
import { callout, esc, toast } from '../ui';
import type { View } from '../router';

/** Tải file sao lưu toàn bộ dữ liệu trên máy (JSON). */
export async function downloadBackup() {
  const { backupJson } = await import('../export/json');
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  download(new Blob([JSON.stringify(await backupJson())], { type: 'application/json' }), `tbdge-backup-${stamp}.json`);
}

/**
 * Quản trị hệ thống – chỉ Quản trị: người dùng, cấu hình (hồ sơ giàn, máy TN), dữ liệu, máy chủ.
 * Chế độ dùng một mình (không máy chủ): người dùng duy nhất trên máy giữ quyền cấu hình.
 */
export const Admin: View = async (_r, el) => {
  setTop('Quản trị hệ thống', { back: '#/settings' });
  if (!can('admin.panel')) {
    el.innerHTML = callout({ level: 'info', text: 'Chỉ tài khoản **Quản trị** mới mở được trang này.' });
    return;
  }
  const server = isConfigured();
  el.innerHTML = `
    <div id="outdated"></div>
    ${
      server
        ? `<h2>Người dùng</h2>
           <a class="card admin-link" href="#/users">
             <span class="ico">👥</span>
             <span><b>Quản lý người dùng</b><span class="small muted">Phê duyệt đăng ký, gán vai trò, khóa / mở khóa tài khoản</span></span>
             <span class="pill" id="pending-badge" hidden></span>
           </a>`
        : ''
    }
    <h2>Cấu hình</h2>
    <a class="card admin-link" href="#/profiles">
      <span class="ico">${Icons.folder}</span>
      <span><b>Hồ sơ giàn tụ</b><span class="small muted">Số bình, điện dung danh định, ngưỡng Alarm/Bypass, khe hở TAG, ngưỡng VAP</span></span>
    </a>
    <a class="card admin-link" href="#/instruments">
      <span class="ico">${Icons.testSet}</span>
      <span><b>Máy thí nghiệm</b><span class="small muted">Số serial, hạn kiểm định / hiệu chuẩn</span></span>
    </a>
    <a class="card admin-link" href="#/trend">
      <span class="ico">${Icons.chart}</span>
      <span><b>Mốc lịch sử xu hướng</b><span class="small muted">Nhập số liệu các năm trước từ biên bản giấy</span></span>
    </a>

    <h2>Dữ liệu</h2>
    ${server ? `<p class="small" id="sync-status" role="status">${esc(statusText(getStatus()))}</p>` : ''}
    <div class="btn-row">
      ${server ? '<button class="btn" type="button" id="sync-now">↻ Đồng bộ ngay</button>' : ''}
      <button class="btn secondary" type="button" id="backup">💾 Sao lưu toàn bộ</button>
      <label class="btn secondary">📂 Khôi phục / nhập JSON<input type="file" accept="application/json,.json" hidden id="restore"></label>
    </div>
    <p class="small muted">Khôi phục ghi đè các bản ghi trùng mã trên máy này${server ? ', rồi tự gửi lên máy chủ ở lần đồng bộ sau' : ''}.</p>

    <h2>Máy chủ</h2>
    <div id="server">${
      server
        ? '<p class="small muted">Đang đọc thông tin máy chủ…</p>'
        : '<p class="small muted">Chưa cấu hình máy chủ – chế độ dùng một mình, không có đăng nhập và đồng bộ. Hướng dẫn cài đặt: thư mục <code>gas/</code> trong mã nguồn.</p>'
    }</div>`;

  el.querySelector('#backup')!.addEventListener('click', () => void downloadBackup());
  el.querySelector<HTMLInputElement>('#restore')!.addEventListener('change', async (e) => {
    const input = e.target as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (!f || !confirm(`Nhập "${f.name}"? Bản ghi trùng mã sẽ bị ghi đè.`)) return;
    try {
      const { importJson } = await import('../export/json');
      toast(await importJson(await f.text()), undefined, 5000);
    } catch (err) {
      toast('Lỗi: ' + (err as Error).message, undefined, 6000);
    }
  });
  if (!server) return;

  const { loadBackend } = await import('../sync/backend');
  const m = await loadBackend();
  el.querySelector('#sync-now')!.addEventListener('click', () => {
    m.startAuto();
    void m.syncNow();
  });
  const off = onStatus((s) => {
    const x = el.querySelector('#sync-status');
    if (x) x.textContent = statusText(s);
  });
  window.addEventListener('route:leave', () => off(), { once: true });

  const box = el.querySelector<HTMLElement>('#server')!;
  try {
    const v = await m.serverVersion();
    if (v.outdated) {
      el.querySelector('#outdated')!.innerHTML = callout({ level: 'danger', text: `**Máy chủ cần cập nhật** (đang chạy bản ${v.version}). ${m.SERVER_OUTDATED_MSG}` });
      box.innerHTML = `<p class="small">⚠️ Máy chủ bản ${v.version} – chưa đọc được thông tin chi tiết.</p>`;
      return;
    }
    const info = await m.serverInfo();
    const badge = el.querySelector<HTMLElement>('#pending-badge');
    if (badge && info.users.pending) {
      badge.hidden = false;
      badge.textContent = `${info.users.pending} chờ duyệt`;
    }
    box.innerHTML = `
      <dl class="kv">
        <dt>Nơi lưu</dt><dd>${esc(m.SERVER_LABEL)}</dd>
        <dt>Phiên bản máy chủ</dt><dd>${v.version} ✓</dd>
        <dt>Tài khoản</dt><dd>${info.users.approved} đang hoạt động · ${info.users.pending} chờ duyệt · ${info.users.disabled} đã khóa</dd>
        <dt>Đăng nhập Google</dt><dd>${info.clientIdSet ? '✓ Đã cấu hình' : '⚠️ Máy chủ chưa có GOOGLE_CLIENT_ID (chỉ dùng được mã email)'}</dd>
      </dl>
      <div class="btn-row">
        ${info.dbUrl ? `<a class="btn secondary" href="${esc(info.dbUrl)}" target="_blank" rel="noopener">📊 Mở file dữ liệu (Google Sheets)</a>` : ''}
        ${info.photoFolderUrl ? `<a class="btn secondary" href="${esc(info.photoFolderUrl)}" target="_blank" rel="noopener">🖼️ Thư mục ảnh (Drive)</a>` : ''}
      </div>
      <p class="small muted">Không sửa tay các tab dữ liệu trong file Sheets; thêm người được duyệt sẵn ở tab <b>members</b>.</p>`;
  } catch (e) {
    box.innerHTML = `<p class="small">⚠️ ${esc((e as Error).message)}</p>`;
  }
};

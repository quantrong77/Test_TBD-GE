import { isMember } from '../auth/roles';
import { hasSession } from '../auth/session';

/**
 * Cấu hình + trạng thái đồng bộ. File nhẹ (không kéo mã máy chủ) – app luôn tải.
 * Máy chủ gắn lúc build (xem gas/README.md):
 *   VITE_GAS_URL – địa chỉ web app Apps Script (…/exec); VITE_GOOGLE_CLIENT_ID – OAuth Client ID (Web).
 * Hai giá trị này công khai được. KHÔNG BAO GIỜ đặt Client secret hay khóa bí mật vào app.
 * Không khai báo → chế độ dùng một mình: không đăng nhập, dữ liệu chỉ trên máy.
 */
export const GAS_URL = (import.meta.env.VITE_GAS_URL as string | undefined)?.trim() || '';
export const GOOGLE_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim() || '';
export const isConfigured = () => GAS_URL !== '';

export interface SyncStatus {
  state: 'off' | 'idle' | 'syncing' | 'offline' | 'error';
  lastSync?: number;
  pending?: number;
  message?: string;
}
let status: SyncStatus = { state: 'off' };
const listeners = new Set<(s: SyncStatus) => void>();
export const getStatus = () => status;
export function setStatus(s: Partial<SyncStatus>) {
  status = { ...status, ...s };
  listeners.forEach((f) => f(status));
}
export function onStatus(f: (s: SyncStatus) => void) {
  listeners.add(f);
  return () => listeners.delete(f);
}

const fmtHM = (ts: number) => new Date(ts).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

/** Mô tả trạng thái đồng bộ cho người dùng. */
export function statusText(s: SyncStatus): string {
  const pend = s.pending ? ` · chờ gửi ${s.pending} thay đổi` : '';
  switch (s.state) {
    case 'off':
      return 'Chưa đồng bộ.';
    case 'syncing':
      return 'Đang đồng bộ…';
    case 'idle':
      return `✓ Đã đồng bộ lúc ${s.lastSync ? fmtHM(s.lastSync) : '—'}${pend}${s.message ? `. ${s.message}` : ''}`;
    case 'offline':
      return `${s.message ?? 'Không có mạng'}${pend}`;
    case 'error':
      return `⚠️ ${s.message ?? 'Lỗi đồng bộ'}${pend}`;
  }
}

/**
 * Gọi khi mở app. Đã đăng nhập → đọc lại tài khoản (gia hạn phiên, cập nhật vai trò / trạng thái duyệt);
 * tài khoản đã duyệt thì đồng bộ tự động với cả đội.
 */
export async function bootSync() {
  if (!isConfigured() || !hasSession()) return;
  const { loadBackend } = await import('./backend');
  const m = await loadBackend();
  const me = await m.refreshMe().catch(() => null);
  if (isMember(me)) m.startAuto();
}

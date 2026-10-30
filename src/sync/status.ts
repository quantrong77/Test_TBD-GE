import { getMe } from '../auth/roles';

/**
 * Cấu hình + trạng thái đồng bộ. File nhẹ (không kéo thư viện Supabase) – app luôn tải.
 * Địa chỉ máy chủ gắn lúc build: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (khóa anon được phép công khai;
 * an toàn dựa vào RLS trên máy chủ). KHÔNG BAO GIỜ đặt service_role key vào app.
 */
export const SB_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() || '';
export const SB_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() || '';
export const isConfigured = () => !!(SB_URL && SB_KEY);

const ENABLED = 'tbd.sync.enabled';

/** Đồng bộ TẮT mặc định: chỉ bật khi người dùng chủ động bật (cần đơn vị cho phép đưa dữ liệu lên đám mây). */
export function isEnabled(): boolean {
  try {
    return localStorage.getItem(ENABLED) === '1';
  } catch {
    return false;
  }
}
export function setEnabled(on: boolean) {
  try {
    if (on) localStorage.setItem(ENABLED, '1');
    else localStorage.removeItem(ENABLED);
  } catch {
    /* bỏ qua */
  }
}

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

/** Gọi khi mở app: chỉ tải thư viện Supabase khi đã cấu hình và có lý do dùng tới. */
export async function bootSync() {
  if (!isConfigured()) return;
  const q = new URLSearchParams(location.search);
  const oauthReturn = q.has('code') || q.has('error_description');
  if (!oauthReturn && !isEnabled() && !getMe()) return;
  const m = await import('./supabase');
  if (oauthReturn) {
    // quay về từ Google: thư viện tự đổi ?code= lấy phiên; dọn URL rồi mở Cài đặt
    await m.sb().auth.getSession();
    const err = q.get('error_description');
    history.replaceState(null, '', `${location.pathname}#/settings`);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    if (err) window.dispatchEvent(new CustomEvent('auth:error', { detail: err }));
  }
  await m.refreshMe().catch(() => undefined); // vừa được duyệt / đổi vai trò thì cập nhật ngay
  if (isEnabled()) m.startAuto();
}

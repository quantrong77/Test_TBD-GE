import { getMe, ROLE_LABEL, type Me } from './roles';
import { authState, type AuthState } from './gate';
import { takeSignOutReason } from './session';
import { isConfigured } from '../sync/status';
import { toast } from '../ui';

/**
 * Thông báo tập trung về đăng nhập: đăng nhập, đăng xuất, phiên hết hạn, được duyệt, bị khóa, đổi vai trò,
 * mất mạng / có mạng lại. So trạng thái trước–sau mỗi lần tài khoản thay đổi (sự kiện auth:changed)
 * để chọn đúng câu, không thông báo trùng.
 */
export function describeAuthChange(was: AuthState, st: AuthState, prev: Me | null, me: Me | null, reason: 'manual' | 'expired' | null): string | null {
  if (was === st) {
    if (st === 'ok' && prev?.role && me?.role && prev.role !== me.role) return `Vai trò của bạn đã đổi: ${ROLE_LABEL[prev.role]} → ${ROLE_LABEL[me.role]}`;
    return null;
  }
  const name = me?.name || me?.email || '';
  if (st === 'signedOut') {
    if (reason === 'expired') return '⚠️ Phiên đăng nhập đã hết hạn hoặc không còn hiệu lực – vui lòng đăng nhập lại';
    return `Đã đăng xuất${prev?.email ? ` (${prev.email})` : ''}. Dữ liệu trên máy vẫn được giữ.`;
  }
  if (was === 'signedOut') {
    if (st === 'ok') return `👋 Xin chào ${name} – đã đăng nhập (${me?.role ? ROLE_LABEL[me.role] : ''})`;
    if (st === 'register') return `Đã đăng nhập bằng ${me?.email ?? ''} – vui lòng khai hồ sơ đăng ký`;
    if (st === 'pending') return `Đã đăng nhập – tài khoản ${me?.email ?? ''} đang chờ Quản trị duyệt`;
    if (st === 'disabled') return `Tài khoản ${me?.email ?? ''} đã bị khóa`;
  }
  if (st === 'ok' && (was === 'pending' || was === 'register')) return `🎉 Tài khoản đã được duyệt – vai trò ${me?.role ? ROLE_LABEL[me.role] : ''}. Chào mừng ${name}!`;
  if (st === 'ok' && was === 'disabled') return `Tài khoản đã được mở khóa – chào mừng ${name} trở lại`;
  if (st === 'disabled') return `⛔ Tài khoản đã bị Quản trị khóa${me?.banReason ? `: ${me.banReason}` : ''}`;
  if (st === 'pending' && was === 'ok') return 'Tài khoản chuyển về trạng thái chờ duyệt';
  return null;
}

let started = false;

export function initAuthNotifications() {
  if (started || !isConfigured()) return;
  started = true;
  let prevState = authState();
  let prevMe = getMe();
  window.addEventListener('auth:changed', () => {
    const st = authState();
    const me = getMe();
    const msg = describeAuthChange(prevState, st, prevMe, me, st === 'signedOut' ? takeSignOutReason() : null);
    prevState = st;
    prevMe = me;
    if (msg) toast(msg, undefined, 5000);
  });
  // mạng: chỉ báo khi đang dùng app với tài khoản đã duyệt (có đồng bộ)
  window.addEventListener('offline', () => {
    if (authState() === 'ok') toast('📴 Mất kết nối mạng – vẫn dùng bình thường, dữ liệu lưu trên máy và gửi khi có mạng', undefined, 5000);
  });
  window.addEventListener('online', () => {
    if (authState() === 'ok') toast('📶 Đã có mạng trở lại – đang đồng bộ', undefined, 3500);
  });
}

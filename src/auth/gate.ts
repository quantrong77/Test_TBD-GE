import { getMe, isMember } from './roles';
import { hasSession } from './session';
import { isConfigured } from '../sync/status';
import type { Route } from '../router';

/**
 * Cổng đăng nhập bắt buộc.
 *  - Không cấu hình máy chủ (VITE_GAS_URL trống) → 'off': dùng một mình như trước, không cần đăng nhập.
 *  - Chưa đăng nhập → trang Đăng nhập. Đăng nhập rồi mà chưa gửi hồ sơ → trang Đăng ký.
 *  - Đã gửi hồ sơ, chờ duyệt / bị khóa → trang Tài khoản. Đã duyệt → vào app.
 * Phiên lưu trên máy 30 ngày (tự gia hạn) nên vẫn vào được app khi offline.
 */
export type AuthState = 'off' | 'signedOut' | 'register' | 'pending' | 'disabled' | 'ok';

export function authState(): AuthState {
  if (!isConfigured()) return 'off';
  if (!hasSession()) return 'signedOut';
  const me = getMe();
  if (!me) return 'signedOut';
  if (me.status === 'disabled') return 'disabled';
  if (isMember(me)) return 'ok';
  return me.registered ? 'pending' : 'register';
}

/** Trang riêng của từng trạng thái. */
const HOME: Record<Exclude<AuthState, 'off' | 'ok'>, string> = {
  signedOut: 'login',
  register: 'register',
  pending: 'account',
  disabled: 'account',
};
export const AUTH_PAGES = ['login', 'register', 'account'];
/** Xem được khi chưa đăng nhập. */
const PUBLIC = ['help', 'info'];

export function guard(r: Route): string | null {
  const st = authState();
  const page = r.path[0] ?? '';
  if (st === 'off') return AUTH_PAGES.includes(page) ? '' : null;
  if (st === 'ok') {
    if (page === 'register') return null; // sửa hồ sơ
    if (page === 'login' || page === 'account') return safeNext(r.query.get('next'));
    return null;
  }
  const home = HOME[st];
  if (page === home) return null;
  if (st === 'pending' && page === 'register') return null; // sửa hồ sơ trong lúc chờ
  if (st === 'signedOut' && PUBLIC.includes(page)) return null;
  // nhớ trang định mở để quay lại sau khi đăng nhập
  if (st === 'signedOut' && r.raw && !AUTH_PAGES.includes(page)) return `${home}?next=${encodeURIComponent(r.raw)}`;
  return home;
}

/** Chỉ cho quay lại route trong app (không phải URL ngoài). */
function safeNext(n: string | null): string {
  if (!n || /^[a-z]+:|^\/\//i.test(n)) return '';
  const p = n.replace(/^#?\/?/, '');
  return AUTH_PAGES.includes(p.split(/[/?]/)[0]) ? '' : p;
}

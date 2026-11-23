/**
 * Phiên đăng nhập lưu trên máy (token do máy chủ Apps Script ký, hạn 30 ngày, tự gia hạn mỗi lần dùng).
 * File nhẹ – cổng đăng nhập đọc được ngay khi mở app, kể cả khi offline.
 */
const AUTH_KEY = 'tbd.gas.auth';

export interface Auth {
  token: string;
  email: string;
  expiresAt: number;
  /** thời điểm đăng nhập (giữ nguyên khi phiên được gia hạn) */
  signedInAt?: number;
}

export function getAuth(): Auth | null {
  try {
    const a = JSON.parse(localStorage.getItem(AUTH_KEY) || 'null') as Auth | null;
    return a && a.token && a.expiresAt > Date.now() ? a : null;
  } catch {
    return null;
  }
}

export function setAuth(a: Auth | null) {
  try {
    if (a) localStorage.setItem(AUTH_KEY, JSON.stringify(a));
    else localStorage.removeItem(AUTH_KEY);
  } catch {
    /* bỏ qua */
  }
}

export const hasSession = () => getAuth() !== null;

/** Lý do lần đăng xuất gần nhất – để thông báo đúng (tự đăng xuất hay phiên hết hạn). Chỉ giữ trong bộ nhớ. */
export type SignOutReason = 'manual' | 'expired';
let lastReason: SignOutReason | null = null;
export function markSignOut(reason: SignOutReason) {
  lastReason = reason;
}
/** Đọc một lần rồi xóa. */
export function takeSignOutReason(): SignOutReason | null {
  const r = lastReason;
  lastReason = null;
  return r;
}

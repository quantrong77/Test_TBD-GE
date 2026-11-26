import type { Role, SignSlot } from '../types';

/**
 * Tài khoản đang đăng nhập (lưu trên máy để giao diện dùng được khi offline).
 * Quyền THẬT do máy chủ quyết định (gas/Core.gs); ở đây chỉ để ẩn/khóa nút cho dễ dùng.
 */
export interface Me {
  userId: string;
  email: string;
  name: string;
  status: 'pending' | 'approved' | 'disabled';
  role: Role | null;
  teamId: string | null;
  teamName: string | null;
  /** đã gửi hồ sơ đăng ký */
  registered?: boolean;
  title?: string;
  unit?: string;
  phone?: string;
  /** lý do khóa (khi status = disabled) */
  banReason?: string;
}

const KEY = 'tbd.auth.me';
export function getMe(): Me | null {
  try {
    return JSON.parse(localStorage.getItem(KEY) || 'null');
  } catch {
    return null;
  }
}
export function setMe(me: Me | null) {
  try {
    if (me) localStorage.setItem(KEY, JSON.stringify(me));
    else localStorage.removeItem(KEY);
  } catch {
    /* bỏ qua */
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('auth:changed'));
}

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Quản trị',
  leader: 'Chỉ huy trực tiếp',
  tester: 'Nhân viên thí nghiệm',
  viewer: 'Chỉ xem',
};
export const SLOT_LABEL: Record<SignSlot, string> = {
  tester: 'Người thí nghiệm',
  leader: 'Chỉ huy trực tiếp',
};

export type Action =
  | 'session.create'
  | 'session.edit'
  | 'measure.edit'
  | 'gate.confirm'
  | 'profile.edit'
  | 'instrument.edit'
  | 'unit.edit'
  | 'staff.edit'
  | 'trend.edit'
  | 'data.import'
  | 'users.manage'
  | 'sign.revoke'
  | 'admin.panel';

const MATRIX: Record<Action, Role[]> = {
  'session.create': ['admin', 'leader'],
  'session.edit': ['admin', 'leader'],
  'measure.edit': ['admin', 'leader', 'tester'],
  'gate.confirm': ['admin', 'leader', 'tester'],
  // cấu hình hệ thống: chỉ Quản trị
  'profile.edit': ['admin'],
  'instrument.edit': ['admin'],
  'unit.edit': ['admin'],
  // danh sách nhân viên: Chỉ huy cũng thêm được người khi chuẩn bị phiên
  'staff.edit': ['admin', 'leader'],
  // mốc lịch sử xu hướng (nhập tay / từ Excel)
  'trend.edit': ['admin', 'leader'],
  'data.import': ['admin'],
  'users.manage': ['admin'],
  'sign.revoke': ['admin'],
  'admin.panel': ['admin'],
};

/** Ô ký mà mỗi vai trò được ký (khớp hàm can_sign trên máy chủ). */
export const SIGN_SLOTS: Record<Role, SignSlot[]> = {
  admin: [],
  leader: ['tester', 'leader'],
  tester: ['tester'],
  viewer: [],
};

/** Đã đăng nhập và được duyệt vào một đội? */
export const isMember = (me: Me | null = getMe()): me is Me & { role: Role; teamId: string } => !!me && me.status === 'approved' && !!me.role && !!me.teamId;

/**
 * Chế độ dùng một mình (chưa đăng nhập): mọi việc trên máy như trước, trừ ký và quản lý tài khoản.
 * Đã đăng nhập: theo vai trò; tài khoản chờ duyệt / bị khóa chỉ xem.
 */
export function can(action: Action, me: Me | null = getMe()): boolean {
  if (!me) return action !== 'users.manage' && action !== 'sign.revoke';
  if (!isMember(me)) return false;
  return MATRIX[action].includes(me.role);
}

export function canSign(slot: SignSlot, me: Me | null = getMe()): boolean {
  return isMember(me) && (SIGN_SLOTS[me.role] ?? []).includes(slot);
}

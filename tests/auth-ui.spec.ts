// Thông báo đăng nhập / đăng xuất và chữ viết tắt ảnh đại diện.
import { describe, it, expect } from 'vitest';
import { describeAuthChange } from '../src/auth/notify';
import { initials } from '../src/components/UserMenu';
import type { Me } from '../src/auth/roles';

const me = (o: Partial<Me> = {}): Me => ({
  userId: 'u1',
  email: 'moi@evn.vn',
  name: 'Nguyễn Văn Mới',
  status: 'approved',
  role: 'tester',
  teamId: 't',
  teamName: 'Đội PTC3',
  ...o,
});

describe('thông báo đăng nhập', () => {
  it('đăng nhập vào app: chào theo tên và vai trò', () => {
    expect(describeAuthChange('signedOut', 'ok', null, me(), null)).toBe('👋 Xin chào Nguyễn Văn Mới – đã đăng nhập (Nhân viên thí nghiệm)');
  });
  it('đăng nhập lần đầu / chờ duyệt', () => {
    expect(describeAuthChange('signedOut', 'register', null, me({ status: 'pending', role: null }), null)).toContain('khai hồ sơ đăng ký');
    expect(describeAuthChange('signedOut', 'pending', null, me({ status: 'pending', role: null }), null)).toContain('chờ Quản trị duyệt');
  });
  it('phân biệt tự đăng xuất và phiên hết hạn', () => {
    expect(describeAuthChange('ok', 'signedOut', me(), null, 'manual')).toBe('Đã đăng xuất (moi@evn.vn). Dữ liệu trên máy vẫn được giữ.');
    expect(describeAuthChange('ok', 'signedOut', me(), null, 'expired')).toContain('hết hạn');
  });
  it('được duyệt, bị khóa có lý do, mở khóa, đổi vai trò', () => {
    expect(describeAuthChange('pending', 'ok', me({ status: 'pending' }), me({ role: 'leader' }), null)).toContain('đã được duyệt – vai trò Chỉ huy trực tiếp');
    expect(describeAuthChange('ok', 'disabled', me(), me({ status: 'disabled', banReason: 'Nghỉ việc' }), null)).toBe('⛔ Tài khoản đã bị Quản trị khóa: Nghỉ việc');
    expect(describeAuthChange('disabled', 'ok', me({ status: 'disabled' }), me(), null)).toContain('mở khóa');
    expect(describeAuthChange('ok', 'ok', me(), me({ role: 'leader' }), null)).toBe('Vai trò của bạn đã đổi: Nhân viên thí nghiệm → Chỉ huy trực tiếp');
  });
  it('không thông báo khi không có gì thay đổi (đồng bộ định kỳ đọc lại tài khoản)', () => {
    expect(describeAuthChange('ok', 'ok', me(), me(), null)).toBeNull();
    expect(describeAuthChange('pending', 'pending', me(), me(), null)).toBeNull();
  });
});

describe('chữ viết tắt ảnh đại diện', () => {
  it('chữ đầu họ + tên; một từ; chỉ có email', () => {
    expect(initials({ name: 'Nguyễn Văn Mới', email: 'a@b.vn' })).toBe('NM');
    expect(initials({ name: 'Trọng', email: 'a@b.vn' })).toBe('T');
    expect(initials({ name: 'quantrong77@gmail.com', email: 'quantrong77@gmail.com' })).toBe('Q');
    expect(initials({ name: '', email: 'x@y.vn' })).toBe('X');
  });
});

import type { Me } from '../auth/roles';
import type { Role } from '../types';

/** Tài khoản trong màn hình Quản lý người dùng. */
export interface AppUser {
  user_id: string;
  email: string;
  full_name: string | null;
  provider: string | null;
  status: Me['status'];
  role: Role | null;
  team_id: string | null;
  requested_at: string;
  registered_at: string | null;
  title: string;
  unit: string;
  phone: string;
  note: string;
  last_seen: string | null;
  decided_at: string | null;
  ban_reason: string;
}

/** Hồ sơ người dùng tự khai khi đăng ký. */
export interface RegisterProfile {
  name: string;
  title: string;
  unit: string;
  phone: string;
  note: string;
}

export interface ServerInfo {
  users: { pending: number; approved: number; disabled: number };
  dbUrl: string;
  photoFolderUrl: string;
  clientIdSet: boolean;
}

export type UserPatch = Partial<Pick<AppUser, 'status' | 'role' | 'team_id' | 'ban_reason'>>;

/** Máy chủ đồng bộ + đăng nhập (bản cài đặt: gas.ts – Google Apps Script + Google Sheets/Drive). */
export interface Backend {
  /** Tên hiển thị nơi lưu dữ liệu. */
  SERVER_LABEL: string;
  /** Lời nhắc cập nhật mã máy chủ khi máy chủ chạy bản cũ hơn app cần. */
  SERVER_OUTDATED_MSG: string;
  /** Phiên bản mã máy chủ đang chạy; outdated = thấp hơn bản app cần. */
  serverVersion(): Promise<{ version: number; outdated: boolean }>;
  /** Vẽ nút "Đăng nhập bằng Google" chính chủ của Google vào `host`. */
  renderGoogleButton(host: HTMLElement, onSignedIn: () => void, onError: (msg: string) => void): Promise<void>;
  sendCode(email: string): Promise<void>;
  verifyCode(email: string, code: string): Promise<void>;
  signOut(): Promise<void>;
  refreshMe(): Promise<Me | null>;
  register(profile: RegisterProfile): Promise<Me>;
  serverInfo(): Promise<ServerInfo>;
  listUsers(): Promise<AppUser[]>;
  decideUser(userId: string, patch: UserPatch): Promise<void>;
  syncNow(): Promise<void>;
  startAuto(): void;
  stopAuto(): void;
}

/** Tải mã máy chủ khi cần (không nằm trong gói tải ban đầu). */
export async function loadBackend(): Promise<Backend> {
  return (await import('./gas')) satisfies Backend;
}

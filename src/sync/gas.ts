import { RefusedError, type Remote, type RemoteRow } from './engine';
import { GAS_URL, GOOGLE_CLIENT_ID } from './status';
import { makeRunner } from './runner';
import { getMe, setMe, type Me } from '../auth/roles';
import { getAuth, markSignOut, setAuth } from '../auth/session';
import type { AppUser, RegisterProfile, ServerInfo, UserPatch } from './backend';

/**
 * Máy chủ đồng bộ trên Google Apps Script (mã máy chủ: thư mục gas/).
 * Dữ liệu nằm trong 1 file Google Sheets + 1 thư mục Drive của đơn vị.
 * Đăng nhập: nút Google (Google Identity Services → mã ID Google → máy chủ kiểm tra, cấp phiên 30 ngày)
 * hoặc mã 6 số gửi qua email (máy chủ gửi bằng Gmail của tài khoản cài Apps Script).
 */
export const SERVER_LABEL = 'Google Drive của đơn vị (Google Sheets + thư mục ảnh)';

/** Phiên bản mã máy chủ (gas/Core.gs – SERVER_VERSION) mà bản app này cần. */
export const REQUIRED_SERVER_VERSION = 3;
/** Bảng chỉ có từ máy chủ bản 3 – máy chủ cũ: bỏ qua (giữ trên máy, gửi sau khi cập nhật). */
const V3_TABLES = ['units', 'staff', 'trend_history'];
const OUTDATED_MSG =
  'Máy chủ Apps Script đang chạy mã cũ, chưa có chức năng này. Quản trị cần dán lại Core.gs và Code.gs mới vào Apps Script rồi Deploy → Manage deployments → New version (gas/README.md, mục 3).';

class ServerError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Gọi Apps Script. Content-Type text/plain để không phát sinh preflight CORS (Apps Script không trả lời OPTIONS). */
async function call<T = Record<string, unknown>>(action: string, body: Record<string, unknown> = {}, withAuth = true): Promise<T> {
  const payload: Record<string, unknown> = { action, ...body };
  if (withAuth) {
    const a = getAuth();
    if (!a) throw new ServerError('auth', 'Chưa đăng nhập');
    payload.token = a.token;
  }
  let res: Response;
  try {
    res = await fetch(GAS_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload), redirect: 'follow' });
  } catch {
    throw new Error('Không kết nối được máy chủ – sẽ thử lại khi có mạng');
  }
  let j: { ok: boolean; code?: string; message?: string } & T;
  try {
    j = await res.json();
  } catch {
    // Apps Script trả trang HTML khi web app chưa cho "Bất kỳ ai" truy cập hoặc địa chỉ sai
    throw new Error('Máy chủ trả về dữ liệu không đúng – kiểm tra địa chỉ web app và quyền truy cập "Bất kỳ ai"');
  }
  if (j.ok) return j;
  if (j.code === 'auth' && withAuth) {
    markSignOut('expired');
    setAuth(null);
    setMe(null);
  }
  if (j.code === 'refused') throw new RefusedError(j.message ?? 'Máy chủ từ chối');
  // máy chủ bản cũ không biết lệnh mới → báo rõ cách cập nhật thay vì "Thao tác không hỗ trợ"
  if (j.code === 'bad_request' && /^Thao tác không hỗ trợ/.test(j.message ?? '')) throw new ServerError('outdated', OUTDATED_MSG);
  throw new ServerError(j.code ?? 'error', j.message ?? 'Lỗi máy chủ');
}

/** Phiên bản mã máy chủ đang chạy (máy chủ bản đầu không báo → 1). */
export async function serverVersion(): Promise<{ version: number; outdated: boolean }> {
  const r = await call<{ version?: number }>('ping', {}, false);
  const version = typeof r.version === 'number' ? r.version : 1;
  return { version, outdated: version < REQUIRED_SERVER_VERSION };
}
export const SERVER_OUTDATED_MSG = OUTDATED_MSG;

function signedIn(r: { token: string; me: Me; expiresAt: number }) {
  const prev = getAuth();
  // gia hạn phiên giữ nguyên thời điểm đăng nhập; đăng nhập mới thì ghi thời điểm hiện tại
  const signedInAt = prev && prev.email === r.me.email ? (prev.signedInAt ?? Date.now()) : Date.now();
  setAuth({ token: r.token, email: r.me.email, expiresAt: r.expiresAt, signedInAt });
  setMe(r.me);
}

// ---------- Đăng nhập ----------
interface Gsi {
  accounts: {
    id: {
      initialize(o: Record<string, unknown>): void;
      renderButton(el: HTMLElement, o: Record<string, unknown>): void;
      disableAutoSelect(): void;
    };
  };
}
let gsiLoading: Promise<Gsi> | null = null;
function loadGsi(): Promise<Gsi> {
  const w = window as unknown as { google?: Gsi };
  if (w.google?.accounts?.id) return Promise.resolve(w.google);
  gsiLoading ??= new Promise<Gsi>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => (w.google?.accounts?.id ? resolve(w.google) : reject(new Error('Không tải được thư viện đăng nhập Google')));
    s.onerror = () => {
      gsiLoading = null;
      reject(new Error('Không tải được thư viện đăng nhập Google – kiểm tra kết nối mạng'));
    };
    document.head.appendChild(s);
  });
  return gsiLoading;
}

/** Vẽ nút "Đăng nhập bằng Google" chính chủ của Google. Bấm → Google trả mã ID → gửi máy chủ kiểm tra. */
export async function renderGoogleButton(host: HTMLElement, onSignedIn: () => void, onError: (msg: string) => void): Promise<void> {
  if (!GOOGLE_CLIENT_ID) {
    host.innerHTML = '<p class="small muted">Chưa cấu hình đăng nhập Google (VITE_GOOGLE_CLIENT_ID) – dùng mã email bên dưới.</p>';
    return;
  }
  const g = await loadGsi();
  g.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    auto_select: false,
    // Cửa sổ bật lên truyền thống: chế độ FedCM im lặng không làm gì khi Chrome tắt "Đăng nhập bên thứ ba"
    // hoặc khi trình duyệt/PWA không hỗ trợ đầy đủ.
    use_fedcm_for_button: false,
    ux_mode: 'popup',
    callback: async (resp: { credential?: string }) => {
      try {
        if (!resp.credential) throw new Error('Google không trả về thông tin đăng nhập');
        signedIn(await call('loginGoogle', { idToken: resp.credential }, false));
        onSignedIn();
      } catch (e) {
        onError((e as Error).message);
      }
    },
  });
  host.innerHTML = '';
  g.accounts.id.renderButton(host, { type: 'standard', theme: 'outline', size: 'large', text: 'continue_with', shape: 'rectangular', locale: 'vi', width: Math.min(400, host.clientWidth || 320) });
}

export async function sendCode(email: string) {
  await call('sendCode', { email }, false);
}
export async function verifyCode(email: string, code: string) {
  signedIn(await call('verifyCode', { email, code: code.trim() }, false));
}
export async function signOut() {
  stopAuto();
  markSignOut('manual');
  setAuth(null);
  setMe(null);
  (window as unknown as { google?: Gsi }).google?.accounts?.id?.disableAutoSelect();
}

/**
 * Đọc tài khoản (trạng thái duyệt, vai trò, đội) từ máy chủ và gia hạn phiên 30 ngày.
 * Mất mạng thì giữ bản đã lưu trên máy.
 */
export async function refreshMe(): Promise<Me | null> {
  if (!getAuth()) {
    setMe(null);
    return null;
  }
  try {
    const r = await call<{ token?: string; me: Me; expiresAt?: number }>('me');
    // máy chủ bản cũ không trả token gia hạn → giữ phiên đang có
    if (r.token && r.expiresAt) signedIn({ token: r.token, me: r.me, expiresAt: r.expiresAt });
    else setMe(r.me);
    return r.me;
  } catch (e) {
    if (e instanceof ServerError && e.code === 'auth') return null; // phiên hết hạn – call() đã đăng xuất
    return getMe();
  }
}

/** Gửi / sửa hồ sơ đăng ký của chính mình (họ tên, chức danh, đơn vị…). */
export async function register(profile: RegisterProfile): Promise<Me> {
  const r = await call<{ me: Me }>('register', { profile });
  setMe(r.me);
  return r.me;
}

// ---------- Quản trị (máy chủ chỉ cho Quản trị; không sửa được chính mình) ----------
export async function serverInfo(): Promise<ServerInfo> {
  return call<ServerInfo & { ok: boolean }>('serverInfo');
}
export async function listUsers(): Promise<AppUser[]> {
  return (await call<{ users: AppUser[] }>('listUsers')).users;
}
export async function decideUser(userId: string, patch: UserPatch) {
  await call('decideUser', { userId, patch });
}

// ---------- Máy chủ cho bộ đồng bộ ----------
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ''));
    r.onerror = () => reject(r.error ?? new Error('Không đọc được ảnh'));
    r.readAsDataURL(blob);
  });
}
function base64ToBlob(b64: string, mime: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

class GasRemote implements Remote {
  private version = REQUIRED_SERVER_VERSION;
  async prepare() {
    this.version = (await serverVersion()).version;
  }
  supports(table: string) {
    return this.version >= 3 || !V3_TABLES.includes(table);
  }
  async pull(table: string, since: string | null): Promise<RemoteRow[]> {
    return (await call<{ rows: RemoteRow[] }>('pull', { table, since })).rows;
  }
  async upsert(table: string, rows: { id: string; data: Record<string, unknown>; deleted: boolean }[]) {
    return (await call<{ rows: { id: string; updated_at: string }[] }>('upsert', { table, rows })).rows;
  }
  async uploadPhoto(path: string, blob: Blob) {
    await call('uploadPhoto', { path, data: await blobToBase64(blob), mime: blob.type || 'image/jpeg' });
  }
  async downloadPhoto(path: string) {
    const r = await call<{ data: string; mime: string }>('downloadPhoto', { path });
    return base64ToBlob(r.data, r.mime);
  }
}

// ---------- Chạy tự động ----------
export const { syncNow, startAuto, stopAuto } = makeRunner({ refreshMe, remote: () => new GasRemote() });

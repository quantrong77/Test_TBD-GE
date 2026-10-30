import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { pendingCount, RefusedError, syncOnce, type Remote, type RemoteRow } from './engine';
import { isEnabled, SB_KEY, SB_URL, setStatus } from './status';
import { getMe, isMember, setMe, type Me } from '../auth/roles';
import type { Role } from '../types';

let client: SupabaseClient | null = null;
export function sb(): SupabaseClient {
  client ??= createClient(SB_URL, SB_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce', storageKey: 'tbd.sb.auth' },
  });
  return client;
}

// ---------- Đăng nhập ----------
export async function currentEmail(): Promise<string | null> {
  const { data } = await sb().auth.getSession(); // đọc phiên lưu trên máy – chạy được khi offline
  return data.session?.user.email ?? null;
}
/** Google: chuyển trang sang Google rồi quay về app với ?code=... */
export async function signInGoogle() {
  const { error } = await sb().auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname } });
  if (error) throw new Error(friendly(error.message));
}
/** Mã 6 số qua email (dự phòng: trên iPhone, app đã cài hay bị đẩy ra Safari khi đăng nhập Google). */
export async function sendCode(email: string) {
  const { error } = await sb().auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  if (error) throw new Error(friendly(error.message));
}
export async function verifyCode(email: string, code: string) {
  const { error } = await sb().auth.verifyOtp({ email, token: code.trim(), type: 'email' });
  if (error) throw new Error(friendly(error.message));
}
export async function signOut() {
  stopAuto();
  setMe(null);
  await sb().auth.signOut();
}

/** Đọc tài khoản (trạng thái duyệt, vai trò, đội) từ máy chủ. Mất mạng thì giữ bản đã lưu. */
export async function refreshMe(): Promise<Me | null> {
  const { data } = await sb().auth.getSession();
  const user = data.session?.user;
  if (!user) {
    setMe(null);
    return null;
  }
  const { data: row, error } = await sb().from('app_users').select('email,full_name,status,role,team_id').eq('user_id', user.id).maybeSingle();
  if (error) return getMe();
  let teamName: string | null = null;
  if (row?.team_id) teamName = (await sb().from('teams').select('name').eq('id', row.team_id).maybeSingle()).data?.name ?? null;
  const me: Me = {
    userId: user.id,
    email: row?.email ?? user.email ?? '',
    name: row?.full_name ?? (user.user_metadata?.full_name as string | undefined) ?? user.email ?? '',
    status: (row?.status as Me['status']) ?? 'pending',
    role: (row?.role as Role | null) ?? null,
    teamId: row?.team_id ?? null,
    teamName,
  };
  setMe(me);
  return me;
}

// ---------- Quản trị tài khoản (RLS chỉ cho admin; không sửa được chính mình) ----------
export interface AppUser {
  user_id: string;
  email: string;
  full_name: string | null;
  provider: string | null;
  status: Me['status'];
  role: Role | null;
  team_id: string | null;
  requested_at: string;
}
export async function listUsers(): Promise<AppUser[]> {
  const { data, error } = await sb().from('app_users').select('user_id,email,full_name,provider,status,role,team_id,requested_at').order('requested_at', { ascending: false });
  if (error) throw new Error(friendly(error.message));
  return (data ?? []) as AppUser[];
}
export async function decideUser(userId: string, patch: Partial<Pick<AppUser, 'status' | 'role' | 'team_id'>>) {
  const { data, error } = await sb()
    .from('app_users')
    .update({ ...patch, decided_at: new Date().toISOString(), decided_by: getMe()?.userId })
    .eq('user_id', userId)
    .select('user_id');
  if (error) throw new Error(friendly(error.message));
  if (!data?.length) throw new Error('Không có quyền sửa tài khoản này');
}

// ---------- Máy chủ cho bộ đồng bộ ----------
const PAGE = 1000;
class SupabaseRemote implements Remote {
  constructor(private team: string) {}
  async pull(table: string, since: string | null): Promise<RemoteRow[]> {
    const out: RemoteRow[] = [];
    for (let from = 0; ; from += PAGE) {
      let q = sb().from(table).select('id,data,deleted,updated_at').eq('team_id', this.team).order('updated_at').order('id').range(from, from + PAGE - 1);
      if (since) q = q.gte('updated_at', since);
      const { data, error } = await q;
      if (error) throw new Error(friendly(error.message));
      out.push(...((data ?? []) as RemoteRow[]));
      if (!data || data.length < PAGE) return out;
    }
  }
  async upsert(table: string, rows: { id: string; data: Record<string, unknown>; deleted: boolean }[]) {
    const { data, error } = await sb()
      .from(table)
      .upsert(rows.map((r) => ({ team_id: this.team, ...r })), { onConflict: 'team_id,id' })
      .select('id,updated_at');
    // 42501 = RLS, 23505 = trùng (đã có chữ ký Chỉ huy): máy chủ từ chối, không phải lỗi mạng
    if (error?.code === '42501' || error?.code === '23505') throw new RefusedError(error.message);
    if (error) throw new Error(friendly(error.message));
    return (data ?? []) as { id: string; updated_at: string }[];
  }
  async uploadPhoto(path: string, blob: Blob) {
    const { error } = await sb().storage.from('photos').upload(path, blob, { upsert: true, contentType: blob.type || 'image/jpeg' });
    if (error && /row-level security|unauthorized|403/i.test(error.message)) throw new RefusedError(error.message);
    if (error) throw new Error(friendly(error.message));
  }
  async downloadPhoto(path: string) {
    const { data, error } = await sb().storage.from('photos').download(path);
    if (error || !data) throw new Error(friendly(error?.message ?? 'Không tải được ảnh'));
    return data;
  }
}

function friendly(msg: string): string {
  if (/fetch|network|Failed to/i.test(msg)) return 'Không kết nối được máy chủ – sẽ thử lại khi có mạng';
  if (/row-level security|permission/i.test(msg)) return 'Tài khoản không có quyền thực hiện việc này';
  if (/expired|invalid.*(otp|token)/i.test(msg)) return 'Mã không đúng hoặc đã hết hạn – gửi lại mã mới';
  if (/rate limit|too many/i.test(msg)) return 'Gửi mã quá nhiều lần – chờ ít phút rồi thử lại';
  return msg;
}

// ---------- Chạy tự động ----------
let running: Promise<void> | null = null;

export function syncNow(): Promise<void> {
  if (running) return running;
  running = (async () => {
    try {
      if (!isEnabled()) return setStatus({ state: 'off' });
      if (!navigator.onLine) return setStatus({ state: 'offline', pending: await pendingCount(), message: 'Đang không có mạng – dữ liệu vẫn lưu trên máy' });
      const me = await refreshMe();
      if (!isMember(me)) return setStatus({ state: 'error', message: me ? 'Tài khoản chưa được duyệt hoặc đã bị khóa' : 'Chưa đăng nhập' });
      setStatus({ state: 'syncing', message: undefined });
      const r = await syncOnce(new SupabaseRemote(me.teamId), me.teamId);
      const notes = [
        r.refused ? `${r.refused} thay đổi bị máy chủ từ chối (không có quyền hoặc biên bản đã khóa) nên đã bỏ` : '',
        r.rejected ? `${r.rejected} bản ghi từ máy chủ bị bỏ qua vì dữ liệu không hợp lệ` : '',
      ].filter(Boolean);
      setStatus({ state: 'idle', lastSync: Date.now(), pending: await pendingCount(), message: notes.join('. ') || undefined });
    } catch (e) {
      setStatus({ state: 'error', message: (e as Error).message, pending: await pendingCount().catch(() => undefined) });
    } finally {
      running = null;
    }
  })();
  return running;
}

let started = false;
let interval: ReturnType<typeof setInterval> | undefined;
let soon: ReturnType<typeof setTimeout> | undefined;
const onVisible = () => document.visibilityState === 'visible' && void syncNow();
const onLocal = () => {
  clearTimeout(soon);
  soon = setTimeout(() => void syncNow(), 4000);
};
const onOnline = () => void syncNow();

export function startAuto() {
  if (started) return void syncNow();
  started = true;
  window.addEventListener('online', onOnline);
  window.addEventListener('tbd:local-change', onLocal);
  document.addEventListener('visibilitychange', onVisible);
  interval = setInterval(() => document.visibilityState === 'visible' && void syncNow(), 60_000);
  void syncNow();
}

export function stopAuto() {
  started = false;
  window.removeEventListener('online', onOnline);
  window.removeEventListener('tbd:local-change', onLocal);
  document.removeEventListener('visibilitychange', onVisible);
  clearInterval(interval);
  clearTimeout(soon);
  setStatus({ state: 'off' });
}

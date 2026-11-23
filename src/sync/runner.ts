import { pendingCount, syncOnce, type Remote } from './engine';
import { setStatus } from './status';
import { isMember, type Me } from '../auth/roles';

/**
 * Chạy đồng bộ tự động – dùng chung cho mọi máy chủ (Google Apps Script, Supabase).
 * Máy chủ chỉ cần cung cấp: đọc lại tài khoản và tạo Remote cho đội.
 */
export function makeRunner(opts: { refreshMe: () => Promise<Me | null>; remote: (team: string) => Remote }) {
  let running: Promise<void> | null = null;

  function syncNow(): Promise<void> {
    if (running) return running;
    running = (async () => {
      try {
        if (!navigator.onLine) return setStatus({ state: 'offline', pending: await pendingCount(), message: 'Đang không có mạng – dữ liệu vẫn lưu trên máy' });
        const me = await opts.refreshMe();
        if (!isMember(me)) return setStatus({ state: 'error', message: me ? 'Tài khoản chưa được duyệt hoặc đã bị khóa' : 'Chưa đăng nhập' });
        setStatus({ state: 'syncing', message: undefined });
        const r = await syncOnce(opts.remote(me.teamId), me.teamId);
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

  function startAuto() {
    if (started) return void syncNow();
    started = true;
    window.addEventListener('online', onOnline);
    window.addEventListener('tbd:local-change', onLocal);
    document.addEventListener('visibilitychange', onVisible);
    interval = setInterval(() => document.visibilityState === 'visible' && void syncNow(), 60_000);
    void syncNow();
  }

  function stopAuto() {
    started = false;
    window.removeEventListener('online', onOnline);
    window.removeEventListener('tbd:local-change', onLocal);
    document.removeEventListener('visibilitychange', onVisible);
    clearInterval(interval);
    clearTimeout(soon);
    setStatus({ state: 'off' });
  }

  return { syncNow, startAuto, stopAuto };
}

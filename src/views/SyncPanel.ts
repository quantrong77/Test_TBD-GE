import { getStatus, isConfigured, isEnabled, onStatus, setEnabled, type SyncStatus } from '../sync/status';
import { can, isMember, ROLE_LABEL } from '../auth/roles';
import { callout, esc, toast } from '../ui';

const fmtHM = (ts: number) => new Date(ts).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

function statusText(s: SyncStatus): string {
  const pend = s.pending ? ` · chờ gửi ${s.pending} thay đổi` : '';
  switch (s.state) {
    case 'off':
      return 'Đang tắt – dữ liệu chỉ nằm trên máy này.';
    case 'syncing':
      return 'Đang đồng bộ…';
    case 'idle':
      return `✓ Đã đồng bộ lúc ${s.lastSync ? fmtHM(s.lastSync) : '—'}${pend}${s.message ? `. ${s.message}` : ''}`;
    case 'offline':
      return `${s.message ?? 'Không có mạng'}${pend}`;
    case 'error':
      return `⚠️ ${s.message ?? 'Lỗi đồng bộ'}${pend}`;
  }
}

/** Mục "Tài khoản và đồng bộ" trong Cài đặt. Thư viện Supabase chỉ tải khi đã cấu hình máy chủ. */
export async function renderSyncPanel(box: HTMLElement) {
  if (!isConfigured()) {
    box.innerHTML = `<p class="small muted">Chưa cấu hình máy chủ. Dữ liệu chỉ nằm trên máy này; dùng <b>Sao lưu toàn bộ</b> bên dưới. Đăng nhập, phân quyền và ký biên bản cần máy chủ.</p>`;
    return;
  }
  box.innerHTML = '<p class="small muted">Đang tải…</p>';
  const m = await import('../sync/supabase');
  let pendingEmail = '';

  const run = async (f: () => Promise<void>, btn: HTMLButtonElement) => {
    btn.disabled = true;
    try {
      await f();
    } catch (e) {
      toast((e as Error).message, undefined, 6000);
    } finally {
      btn.disabled = false;
    }
  };
  const wireOut = () =>
    box.querySelector('#sync-out')?.addEventListener('click', async () => {
      if (!confirm('Đăng xuất? Dữ liệu trên máy này vẫn giữ nguyên; thay đổi chưa gửi sẽ gửi khi đăng nhập lại.')) return;
      setEnabled(false);
      await m.signOut();
      await draw();
    });

  const draw = async (): Promise<void> => {
    const email = await m.currentEmail();
    if (!email) {
      box.innerHTML = `
        ${callout({ level: 'warn', text: 'Đăng nhập để dùng phân quyền, ký biên bản và đồng bộ. Tài khoản mới phải được **quản trị duyệt**. Đồng bộ sẽ gửi **số đo, tên thành viên và ảnh hiện trường** lên máy chủ Supabase (đặt ở Singapore) – chỉ bật khi đơn vị đã cho phép.' })}
        <button class="btn block big" type="button" id="sync-google">Tiếp tục với Google</button>
        <details class="card"><summary>Đăng nhập bằng mã gửi qua email</summary>
        <p class="small muted">Dùng khi app đã cài trên iPhone hoặc không có tài khoản Google.</p>
        ${
          pendingEmail
            ? `<p>Đã gửi mã tới <b>${esc(pendingEmail)}</b>. Mở email, nhập mã:</p>
               <label class="field"><span>Mã đăng nhập</span><input id="sync-code" inputmode="numeric" autocomplete="one-time-code" maxlength="10"></label>
               <div class="btn-row"><button class="btn" type="button" id="sync-verify">Đăng nhập</button><button class="btn secondary" type="button" id="sync-resend">Gửi lại mã</button></div>`
            : `<label class="field"><span>Email</span><input id="sync-email" type="email" autocomplete="email" inputmode="email"></label>
               <button class="btn" type="button" id="sync-send">Gửi mã đăng nhập</button>`
        }</details>`;
      if (pendingEmail) box.querySelector('details')!.open = true;
      box.querySelector<HTMLButtonElement>('#sync-google')!.addEventListener('click', (e) => run(() => m.signInGoogle(), e.currentTarget as HTMLButtonElement));
      box.querySelector<HTMLButtonElement>('#sync-send')?.addEventListener('click', (e) =>
        run(async () => {
          const v = box.querySelector<HTMLInputElement>('#sync-email')!.value.trim().toLowerCase();
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw new Error('Email không hợp lệ');
          await m.sendCode(v);
          pendingEmail = v;
          await draw();
        }, e.currentTarget as HTMLButtonElement),
      );
      box.querySelector<HTMLButtonElement>('#sync-resend')?.addEventListener('click', (e) =>
        run(async () => {
          await m.sendCode(pendingEmail);
          toast('Đã gửi lại mã');
        }, e.currentTarget as HTMLButtonElement),
      );
      box.querySelector<HTMLButtonElement>('#sync-verify')?.addEventListener('click', (e) =>
        run(async () => {
          await m.verifyCode(pendingEmail, box.querySelector<HTMLInputElement>('#sync-code')!.value);
          pendingEmail = '';
          toast('✓ Đã đăng nhập');
          await draw();
        }, e.currentTarget as HTMLButtonElement),
      );
      return;
    }

    const me = await m.refreshMe();
    if (!isMember(me)) {
      const disabled = me?.status === 'disabled';
      box.innerHTML = `
        ${callout({ level: disabled ? 'danger' : 'info', text: disabled ? `Tài khoản **${email}** đã bị khóa. Liên hệ quản trị.` : `Tài khoản **${email}** đang **chờ quản trị duyệt**. Được duyệt rồi mới xem được dữ liệu của đội; vẫn dùng app trên máy này để tra cứu.` })}
        <div class="btn-row"><button class="btn" type="button" id="sync-recheck">↻ Kiểm tra lại</button><button class="btn secondary" type="button" id="sync-out">Đăng xuất</button></div>`;
      box.querySelector('#sync-recheck')!.addEventListener('click', () => void draw());
      wireOut();
      return;
    }

    const on = isEnabled();
    box.innerHTML = `
      <div class="card" style="margin-top:0"><b>${esc(me.name)}</b><div class="small muted">${esc(me.email)}</div>
        <div class="small">${esc(ROLE_LABEL[me.role])} – ${esc(me.teamName ?? '')}</div></div>
      ${can('users.manage', me) ? '<a class="btn secondary block" href="#/users">👥 Quản lý tài khoản</a>' : ''}
      <label class="check"><input type="checkbox" id="sync-on"${on ? ' checked' : ''}><span><b>Bật đồng bộ</b><br><span class="small muted">Có mạng thì tự gửi và nhận; không mạng vẫn dùng bình thường.</span></span></label>
      <p class="small" id="sync-status" role="status">${esc(statusText(on ? getStatus() : { state: 'off' }))}</p>
      <div class="btn-row">
        <button class="btn" type="button" id="sync-now"${on ? '' : ' disabled'}>↻ Đồng bộ ngay</button>
        <button class="btn secondary" type="button" id="sync-out">Đăng xuất</button>
      </div>`;
    box.querySelector<HTMLInputElement>('#sync-on')!.addEventListener('change', (e) => {
      const cb = e.target as HTMLInputElement;
      if (cb.checked && !confirm('Đơn vị đã cho phép đưa dữ liệu thí nghiệm lên máy chủ Supabase?\nToàn bộ phiên, số đo và ảnh trên máy này sẽ được gửi lên cho cả đội.')) {
        cb.checked = false;
        return;
      }
      setEnabled(cb.checked);
      if (cb.checked) m.startAuto();
      else m.stopAuto();
      box.querySelector<HTMLButtonElement>('#sync-now')!.disabled = !cb.checked;
    });
    box.querySelector('#sync-now')!.addEventListener('click', () => void m.syncNow());
    wireOut();
  };

  const off = onStatus((s) => {
    const el = box.querySelector('#sync-status');
    if (el) el.textContent = statusText(isEnabled() ? s : { state: 'off' });
  });
  window.addEventListener('route:leave', () => off(), { once: true });
  await draw();
}

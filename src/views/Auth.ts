import { setTop } from '../components/Chrome';
import { getMe, ROLE_LABEL } from '../auth/roles';
import { getAuth } from '../auth/session';
import { callout, esc, fmtTime, toast } from '../ui';
import { go, type View } from '../router';
import type { Backend } from '../sync/backend';

const backend = async (): Promise<Backend> => (await import('../sync/backend')).loadBackend();

/** Khóa nút trong lúc chạy, báo lỗi bằng toast. */
async function busy(btn: HTMLButtonElement, f: () => Promise<void>) {
  btn.disabled = true;
  try {
    await f();
  } catch (e) {
    toast((e as Error).message, undefined, 6000);
  } finally {
    btn.disabled = false;
  }
}

const brand = (sub: string) => `
  <div class="auth-brand">
    <img src="icons/icon-192.png" alt="" width="72" height="72">
    <h1>Sổ tay TN Tụ bù dọc GE</h1>
    <p class="muted">${sub}</p>
  </div>`;

const DISCLAIMER =
  '<p class="small muted auth-foot">Ứng dụng chỉ hỗ trợ tra cứu và tính toán, không thay thế Phiếu công tác, Quy trình an toàn điện, Biện pháp kỹ thuật và mệnh lệnh của Chỉ huy trực tiếp. · <a href="#/help">Hướng dẫn</a> · <a href="#/info">Giới thiệu</a></p>';

/** Đăng nhập / đăng ký bằng Google (hoặc mã email). Tài khoản mới chờ Quản trị duyệt. */
export const Login: View = async (_r, el) => {
  setTop('Đăng nhập');
  const m = await backend();
  let pendingEmail = '';

  const draw = () => {
    el.innerHTML = `
      <div class="auth-wrap">
        ${brand('TBD-GE Field · Đội Thí nghiệm PTC3')}
        <div class="card auth-card">
          <h2>Đăng nhập / Đăng ký</h2>
          <p class="small muted">Dùng tài khoản Google của bạn. Lần đầu đăng nhập là <b>đăng ký</b>: khai hồ sơ và chờ <b>Quản trị phê duyệt</b> rồi mới vào được ứng dụng.</p>
          ${navigator.onLine ? '' : callout({ level: 'warn', text: 'Đang **không có mạng**. Đăng nhập lần đầu cần mạng; sau đó dùng được offline 30 ngày.' })}
          <div id="gsi" class="auth-gsi"><p class="small muted">Đang tải nút đăng nhập Google…</p></div>
          <div class="auth-or"><span>hoặc</span></div>
          <details class="card"${pendingEmail ? ' open' : ''}><summary>Nhận mã đăng nhập qua email</summary>
            <p class="small muted">Dùng khi không đăng nhập được bằng Google (iPhone đã cài app, máy không có tài khoản Google…).</p>
            ${
              pendingEmail
                ? `<p>Đã gửi mã tới <b>${esc(pendingEmail)}</b>. Mở email, nhập mã 6 số:</p>
                   <label class="field"><span>Mã đăng nhập</span><input id="code" inputmode="numeric" autocomplete="one-time-code" maxlength="10"></label>
                   <div class="btn-row"><button class="btn" type="button" id="verify">Đăng nhập</button><button class="btn secondary" type="button" id="resend">Gửi lại mã</button><button class="btn secondary" type="button" id="other">Email khác</button></div>`
                : `<label class="field"><span>Email</span><input id="email" type="email" autocomplete="email" inputmode="email"></label>
                   <button class="btn" type="button" id="send">Gửi mã đăng nhập</button>`
            }
          </details>
        </div>
        ${DISCLAIMER}
      </div>`;

    const host = el.querySelector<HTMLElement>('#gsi')!;
    m.renderGoogleButton(
      host,
      () => undefined, // lời chào do auth/notify.ts hiện
      (msg) => toast(msg, undefined, 6000),
    ).catch((e: Error) => (host.innerHTML = `<p class="small">⚠️ ${esc(e.message)}</p>`));

    el.querySelector<HTMLButtonElement>('#send')?.addEventListener('click', (e) =>
      busy(e.currentTarget as HTMLButtonElement, async () => {
        const v = el.querySelector<HTMLInputElement>('#email')!.value.trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw new Error('Email không hợp lệ');
        await m.sendCode(v);
        pendingEmail = v;
        draw();
      }),
    );
    el.querySelector<HTMLButtonElement>('#resend')?.addEventListener('click', (e) =>
      busy(e.currentTarget as HTMLButtonElement, async () => {
        await m.sendCode(pendingEmail);
        toast('Đã gửi lại mã');
      }),
    );
    el.querySelector<HTMLButtonElement>('#other')?.addEventListener('click', () => {
      pendingEmail = '';
      draw();
    });
    el.querySelector<HTMLButtonElement>('#verify')?.addEventListener('click', (e) =>
      busy(e.currentTarget as HTMLButtonElement, async () => {
        await m.verifyCode(pendingEmail, el.querySelector<HTMLInputElement>('#code')!.value);
        // lời chào do auth/notify.ts hiện; cổng đăng nhập tự chuyển trang (sự kiện auth:changed)
      }),
    );
  };
  draw();
};

/** Hồ sơ đăng ký (lần đầu) hoặc sửa hồ sơ của mình. */
export const Register: View = async (_r, el) => {
  const me = getMe();
  const first = !me?.registered && me?.status !== 'approved';
  setTop(first ? 'Đăng ký tài khoản' : 'Hồ sơ của tôi', first ? {} : { back: true });
  const m = await backend();
  const v = (x?: string) => esc(x ?? '');
  el.innerHTML = `
    <div class="auth-wrap">
      ${first ? brand('Bước 2/3 · Khai hồ sơ để Quản trị xét duyệt') : ''}
      <form class="card auth-card" id="f" novalidate>
        <p class="small muted">Đăng nhập bằng <b>${esc(me?.email ?? getAuth()?.email ?? '')}</b></p>
        <label class="field"><span>Họ và tên *</span><input name="name" required maxlength="100" autocomplete="name" value="${v(me?.name && me.name !== me.email ? me.name : '')}"></label>
        <label class="field"><span>Chức danh *</span><input name="title" required maxlength="100" placeholder="vd: Kỹ sư, Đội phó, Nhân viên thí nghiệm" value="${v(me?.title)}"></label>
        <label class="field"><span>Đơn vị công tác *</span><input name="unit" required maxlength="150" placeholder="vd: Đội Sửa chữa, thí nghiệm điện Lâm Đồng – PTC3" value="${v(me?.unit)}"></label>
        <label class="field"><span>Số điện thoại</span><input name="phone" type="tel" inputmode="tel" maxlength="30" autocomplete="tel" value="${v(me?.phone)}"></label>
        ${first ? '<label class="field"><span>Ghi chú cho Quản trị</span><textarea name="note" rows="3" maxlength="500" placeholder="vd: tham gia đợt thí nghiệm TBD Pleiku tháng 12"></textarea></label>' : ''}
        <p class="small text-danger" id="err" role="alert"></p>
        <button class="btn block big" type="submit">${first ? 'Gửi đăng ký' : 'Lưu hồ sơ'}</button>
        ${first ? '<button class="btn secondary block mt-8" type="button" id="out">Đăng xuất</button>' : ''}
      </form>
      ${first ? DISCLAIMER : ''}
    </div>`;

  const f = el.querySelector<HTMLFormElement>('#f')!;
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(f);
    const s = (k: string) => String(fd.get(k) ?? '').trim();
    const err = el.querySelector<HTMLElement>('#err')!;
    const missing = [s('name') ? '' : 'họ và tên', s('title') ? '' : 'chức danh', s('unit') ? '' : 'đơn vị công tác'].filter(Boolean);
    if (missing.length) {
      err.textContent = 'Vui lòng nhập ' + missing.join(', ') + '.';
      return;
    }
    err.textContent = '';
    void busy(f.querySelector<HTMLButtonElement>('button[type=submit]')!, async () => {
      await m.register({ name: s('name'), title: s('title'), unit: s('unit'), phone: s('phone'), note: s('note') });
      toast(first ? '✓ Đã gửi đăng ký – chờ Quản trị duyệt' : '✓ Đã lưu hồ sơ');
      if (first) go('#/account');
      else history.back();
    });
  });
  el.querySelector('#out')?.addEventListener('click', () => void m.signOut());
};

/** Tài khoản đang chờ duyệt hoặc đã bị khóa. */
export const Account: View = async (_r, el) => {
  const me = getMe();
  const disabled = me?.status === 'disabled';
  setTop(disabled ? 'Tài khoản bị khóa' : 'Chờ phê duyệt');
  const m = await backend();
  el.innerHTML = `
    <div class="auth-wrap">
      ${brand(disabled ? 'Tài khoản không còn quyền truy cập' : 'Bước 3/3 · Đã gửi đăng ký')}
      <div class="card auth-card">
        ${
          disabled
            ? callout({ level: 'danger', text: `Tài khoản **${me?.email ?? ''}** đã bị Quản trị **khóa**.${me?.banReason ? ` Lý do: ${me.banReason}.` : ''} Liên hệ Quản trị nếu cần mở lại.` })
            : callout({ level: 'info', text: `Đăng ký của **${me?.email ?? ''}** đang **chờ Quản trị phê duyệt**. Được duyệt và gán vai trò rồi mới vào được ứng dụng.` })
        }
        ${
          me
            ? `<dl class="kv">
                <dt>Họ và tên</dt><dd>${esc(me.name)}</dd>
                ${me.title ? `<dt>Chức danh</dt><dd>${esc(me.title)}</dd>` : ''}
                ${me.unit ? `<dt>Đơn vị</dt><dd>${esc(me.unit)}</dd>` : ''}
                ${me.phone ? `<dt>Điện thoại</dt><dd>${esc(me.phone)}</dd>` : ''}
                ${me.role ? `<dt>Vai trò</dt><dd>${esc(ROLE_LABEL[me.role])}</dd>` : ''}
              </dl>`
            : ''
        }
        <p class="small muted" id="checked"></p>
        <div class="btn-row">
          <button class="btn" type="button" id="check">↻ Kiểm tra lại</button>
          ${disabled ? '' : '<a class="btn secondary" href="#/register">✎ Sửa hồ sơ</a>'}
          <button class="btn secondary" type="button" id="out">Đăng xuất</button>
        </div>
      </div>
      ${DISCLAIMER}
    </div>`;

  const check = async () => {
    const r = await m.refreshMe(); // đã duyệt → cổng đăng nhập tự đưa vào app
    const c = el.querySelector('#checked');
    if (c) c.textContent = r ? `Kiểm tra lúc ${fmtTime(Date.now())}: ${r.status === 'approved' ? 'đã được duyệt' : r.status === 'disabled' ? 'đang bị khóa' : 'chưa được duyệt'}.` : '';
  };
  el.querySelector<HTMLButtonElement>('#check')!.addEventListener('click', (e) => busy(e.currentTarget as HTMLButtonElement, check));
  el.querySelector('#out')!.addEventListener('click', () => void m.signOut());
  // tự kiểm tra định kỳ khi đang mở trang (được duyệt là vào app ngay)
  const t = setInterval(() => document.visibilityState === 'visible' && navigator.onLine && void check().catch(() => undefined), 30_000);
  window.addEventListener('route:leave', () => clearInterval(t), { once: true });
  if (navigator.onLine) void check().catch(() => undefined);
};

/** Đăng xuất rồi về trang đăng nhập (dùng ở Cài đặt). */
export async function signOutAndLeave() {
  const m = await backend();
  await m.signOut();
  go('#/login');
}

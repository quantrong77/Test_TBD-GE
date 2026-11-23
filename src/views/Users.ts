import { setTop } from '../components/Chrome';
import { can, getMe, isMember, ROLE_LABEL } from '../auth/roles';
import { isConfigured } from '../sync/status';
import { foldVi } from '../calc/units';
import { callout, esc, fmtTime, toast } from '../ui';
import type { Role } from '../types';
import type { View } from '../router';
import type { AppUser, UserPatch } from '../sync/backend';

const ROLES: Role[] = ['tester', 'leader', 'viewer', 'admin'];
const ROLE_HINT: Record<Role, string> = {
  tester: 'nhập số đo, xác nhận cổng an toàn, ký ô Người thí nghiệm',
  leader: 'thêm: tạo/sửa phiên, ký Chỉ huy trực tiếp (khóa biên bản)',
  viewer: 'chỉ xem dữ liệu của đội',
  admin: 'toàn quyền: người dùng, cấu hình, hủy chữ ký',
};
const roleOptions = (cur: Role | null) => ROLES.map((r) => `<option value="${r}"${r === cur ? ' selected' : ''}>${esc(ROLE_LABEL[r])}</option>`).join('');

type Filter = 'pending' | 'approved' | 'disabled' | 'all';
const FILTERS: [Filter, string][] = [
  ['pending', 'Chờ duyệt'],
  ['approved', 'Hoạt động'],
  ['disabled', 'Đã khóa'],
  ['all', 'Tất cả'],
];
const STATUS_PILL: Record<AppUser['status'], string> = { pending: '⏳ Chờ duyệt', approved: '✓ Hoạt động', disabled: '⛔ Đã khóa' };
const when = (iso: string | null) => (iso ? fmtTime(Date.parse(iso)) : '—');

/** Quản lý người dùng: phê duyệt đăng ký, gán vai trò, khóa (có lý do) / mở khóa. Cần mạng; máy chủ chặn nếu không phải Quản trị. */
export const Users: View = async (r, el) => {
  setTop('Quản lý người dùng', { back: '#/admin' });
  const me = getMe();
  if (!isConfigured() || !isMember(me) || !can('users.manage', me)) {
    el.innerHTML = callout({ level: 'info', text: 'Chỉ tài khoản **Quản trị** mới mở được trang này.' });
    return;
  }
  const { loadBackend } = await import('../sync/backend');
  const m = await loadBackend();
  let list: AppUser[] = [];
  let filter: Filter = (r.query.get('f') as Filter) || 'pending';
  let q = '';

  const card = (u: AppUser) => {
    const self = u.user_id === me.userId;
    const info = [u.title, u.unit].filter(Boolean).join(' · ');
    return `<div class="card user-card" data-user="${esc(u.user_id)}">
      <div class="row"><b>${esc(u.full_name || u.email)}</b><span class="pill">${STATUS_PILL[u.status]}</span></div>
      <div class="small muted">${esc(u.email)}${u.phone ? ` · ☎ ${esc(u.phone)}` : ''}</div>
      ${info ? `<div class="small">${esc(info)}</div>` : '<div class="small muted">Chưa gửi hồ sơ đăng ký</div>'}
      ${u.note ? `<div class="small">📝 ${esc(u.note)}</div>` : ''}
      <div class="small muted">Đăng ký ${esc(when(u.registered_at ?? u.requested_at))} · Truy cập gần nhất ${esc(when(u.last_seen))}${u.provider ? ` · ${esc(u.provider === 'google' ? 'Google' : 'mã email')}` : ''}</div>
      ${u.status === 'disabled' && u.ban_reason ? `<div class="small">Lý do khóa: ${esc(u.ban_reason)}</div>` : ''}
      ${
        self
          ? `<div class="small">${esc(ROLE_LABEL[u.role ?? 'admin'])} – tài khoản của bạn (không tự sửa được)</div>`
          : `${
              u.status !== 'disabled'
                ? `<label class="field"><span>Vai trò</span><select data-role aria-label="Vai trò của ${esc(u.email)}">${roleOptions(u.role ?? 'tester')}</select></label>
                   <p class="small muted" data-role-hint>Quyền: ${esc(ROLE_HINT[u.role ?? 'tester'])}</p>`
                : ''
            }
            <div class="btn-row">
              ${u.status === 'pending' ? '<button class="btn" type="button" data-act="approve">✓ Phê duyệt</button><button class="btn danger" type="button" data-act="ask-ban">Từ chối</button>' : ''}
              ${u.status === 'approved' ? '<button class="btn" type="button" data-act="role">Lưu vai trò</button><button class="btn danger" type="button" data-act="ask-ban">⛔ Khóa</button>' : ''}
              ${u.status === 'disabled' ? '<button class="btn" type="button" data-act="unban">Mở khóa</button>' : ''}
            </div>
            <div class="ban-box" hidden>
              <label class="field"><span>Lý do ${u.status === 'pending' ? 'từ chối' : 'khóa'} (người dùng sẽ thấy)</span><input data-reason maxlength="300" placeholder="vd: không thuộc đơn vị, đã nghỉ việc"></label>
              <div class="btn-row"><button class="btn danger" type="button" data-act="ban">Xác nhận ${u.status === 'pending' ? 'từ chối' : 'khóa'}</button><button class="btn secondary" type="button" data-act="cancel">Hủy</button></div>
            </div>`
      }
    </div>`;
  };

  const draw = () => {
    const count = (f: Filter) => (f === 'all' ? list.length : list.filter((u) => u.status === f).length);
    const needle = foldVi(q);
    const shown = list.filter(
      (u) => (filter === 'all' || u.status === filter) && (!needle || foldVi([u.full_name, u.email, u.title, u.unit, u.phone].join(' ')).includes(needle)),
    );
    el.querySelector('#tabs')!.innerHTML = FILTERS.map(
      ([f, l]) => `<button type="button" data-f="${f}" aria-pressed="${f === filter}">${l} (${count(f)})</button>`,
    ).join('');
    el.querySelector('#list')!.innerHTML = shown.length
      ? shown.map(card).join('')
      : `<p class="muted">${filter === 'pending' && !needle ? 'Không có đăng ký nào đang chờ duyệt.' : 'Không có tài khoản phù hợp.'}</p>`;
  };

  const load = async () => {
    try {
      list = await m.listUsers();
      draw();
    } catch (e) {
      el.querySelector('#list')!.innerHTML = `<p>⚠️ ${esc((e as Error).message)}</p><button class="btn secondary" type="button" id="retry">Thử lại</button>`;
      el.querySelector('#retry')!.addEventListener('click', () => void load());
    }
  };

  el.innerHTML = `
    <div id="outdated"></div>
    <div class="filter-tabs" role="group" aria-label="Lọc theo trạng thái" id="tabs"></div>
    <label class="field" style="margin-top:8px"><span>Tìm theo tên, email, đơn vị</span><input type="search" id="q" autocomplete="off"></label>
    <div id="list"><p class="small muted">Đang tải…</p></div>`;

  el.querySelector('#tabs')!.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLButtonElement>('[data-f]');
    if (!b) return;
    filter = b.dataset.f as Filter;
    history.replaceState(history.state, '', `#/users?f=${filter}`);
    draw();
  });
  el.querySelector<HTMLInputElement>('#q')!.addEventListener('input', (e) => {
    q = (e.target as HTMLInputElement).value;
    draw();
  });

  el.querySelector('#list')!.addEventListener('change', (e) => {
    const sel = e.target as HTMLSelectElement;
    if (!sel.matches('[data-role]')) return;
    const hint = sel.closest('[data-user]')?.querySelector('[data-role-hint]');
    if (hint) hint.textContent = `Quyền: ${ROLE_HINT[sel.value as Role]}`;
  });

  el.querySelector('#list')!.addEventListener('click', async (e) => {
    const b = (e.target as Element).closest<HTMLButtonElement>('[data-act]');
    if (!b) return;
    const row = b.closest<HTMLElement>('[data-user]')!;
    const banBox = row.querySelector<HTMLElement>('.ban-box');
    const act = b.dataset.act;
    if (act === 'ask-ban' || act === 'cancel') {
      if (banBox) banBox.hidden = act === 'cancel';
      if (act === 'ask-ban') row.querySelector<HTMLInputElement>('[data-reason]')?.focus();
      return;
    }
    const role = (row.querySelector<HTMLSelectElement>('[data-role]')?.value ?? 'tester') as Role;
    let patch: UserPatch;
    let done: string;
    if (act === 'approve') {
      patch = { status: 'approved', role, team_id: me.teamId };
      done = `Đã phê duyệt – vai trò ${ROLE_LABEL[role]}`;
    } else if (act === 'role') {
      patch = { role };
      done = `Đã đổi vai trò thành ${ROLE_LABEL[role]}`;
    } else if (act === 'ban') {
      patch = { status: 'disabled', ban_reason: row.querySelector<HTMLInputElement>('[data-reason]')?.value.trim() ?? '' };
      done = 'Đã khóa tài khoản – người đó mất quyền truy cập ngay';
    } else if (act === 'unban') {
      patch = { status: 'approved', team_id: me.teamId };
      done = 'Đã mở khóa tài khoản';
    } else return;
    row.querySelectorAll('button').forEach((x) => (x.disabled = true));
    try {
      await m.decideUser(row.dataset.user!, patch);
      toast(done);
      await load();
    } catch (err) {
      toast((err as Error).message, undefined, 6000);
      row.querySelectorAll('button').forEach((x) => (x.disabled = false));
    }
  });

  // máy chủ bản cũ: khóa không lưu lý do, danh sách thiếu hồ sơ đăng ký → báo cập nhật
  void m
    .serverVersion()
    .then((v) => {
      if (v.outdated)
        el.querySelector('#outdated')!.innerHTML = callout({
          level: 'warn',
          text: `**Máy chủ cần cập nhật** (đang chạy bản ${v.version}): chưa lưu được lý do khóa và hồ sơ đăng ký. ${m.SERVER_OUTDATED_MSG}`,
        });
    })
    .catch(() => undefined);
  await load();
};

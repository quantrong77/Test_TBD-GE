import { setTop } from '../components/Chrome';
import { can, getMe, isMember, ROLE_LABEL } from '../auth/roles';
import { isConfigured } from '../sync/status';
import { esc, fmtTime, toast } from '../ui';
import type { Role } from '../types';
import type { View } from '../router';
import type { AppUser } from '../sync/supabase';

const ROLES: Role[] = ['tester', 'leader', 'viewer', 'admin'];
const roleOptions = (cur: Role | null) => ROLES.map((r) => `<option value="${r}"${r === cur ? ' selected' : ''}>${esc(ROLE_LABEL[r])}</option>`).join('');

/** Quản lý tài khoản: admin duyệt người mới, đổi vai trò, khóa. Cần mạng; máy chủ chặn nếu không phải admin. */
export const Users: View = async (_r, el) => {
  setTop('Quản lý tài khoản', { back: '#/settings' });
  const me = getMe();
  if (!isConfigured() || !isMember(me) || !can('users.manage', me)) {
    el.innerHTML = '<p>Chỉ tài khoản Quản trị mới mở được trang này.</p>';
    return;
  }
  const m = await import('../sync/supabase');

  const card = (u: AppUser) => `<div class="card" data-user="${esc(u.user_id)}">
      <b>${esc(u.full_name || u.email)}</b>
      <div class="small muted">${esc(u.email)} · ${esc(u.provider ?? '')} · ${esc(fmtTime(Date.parse(u.requested_at)))}</div>
      ${
        u.user_id === me.userId
          ? `<div class="small">${esc(ROLE_LABEL[u.role ?? 'admin'])} (tài khoản của bạn)</div>`
          : `<label class="field"><span>Vai trò</span><select data-role aria-label="Vai trò của ${esc(u.email)}">${roleOptions(u.role ?? 'tester')}</select></label>
             <div class="btn-row">
               ${u.status === 'approved' ? '<button class="btn" type="button" data-act="save">Lưu vai trò</button><button class="btn danger" type="button" data-act="disable">Khóa</button>' : ''}
               ${u.status === 'pending' ? '<button class="btn" type="button" data-act="approve">✓ Duyệt</button><button class="btn danger" type="button" data-act="disable">Từ chối</button>' : ''}
               ${u.status === 'disabled' ? '<button class="btn" type="button" data-act="approve">Mở khóa</button>' : ''}
             </div>`
      }
    </div>`;

  const draw = async () => {
    let list: AppUser[];
    try {
      list = await m.listUsers();
    } catch (e) {
      el.innerHTML = `<p>⚠️ ${esc((e as Error).message)}</p><button class="btn secondary" type="button" id="retry">Thử lại</button>`;
      el.querySelector('#retry')!.addEventListener('click', () => void draw());
      return;
    }
    const by = (s: AppUser['status']) => list.filter((u) => u.status === s);
    const group = (title: string, s: AppUser['status'], empty = '') =>
      by(s).length ? `<h2>${title} (${by(s).length})</h2>${by(s).map(card).join('')}` : empty && `<h2>${title}</h2><p class="muted">${empty}</p>`;
    el.innerHTML = `
      ${group('Chờ duyệt', 'pending', 'Không có tài khoản nào đang chờ.')}
      ${group('Đang hoạt động', 'approved')}
      ${group('Đã khóa', 'disabled')}`;
  };

  el.addEventListener('click', async (e) => {
    const b = (e.target as Element).closest<HTMLButtonElement>('[data-act]');
    if (!b) return;
    const row = b.closest<HTMLElement>('[data-user]')!;
    const role = row.querySelector<HTMLSelectElement>('[data-role]')!.value as Role;
    const act = b.dataset.act;
    if (act === 'disable' && !confirm('Khóa tài khoản này? Người đó mất quyền xem dữ liệu ngay.')) return;
    b.disabled = true;
    try {
      if (act === 'disable') await m.decideUser(row.dataset.user!, { status: 'disabled' });
      else await m.decideUser(row.dataset.user!, { status: 'approved', role, team_id: me.teamId });
      toast(act === 'disable' ? 'Đã khóa tài khoản' : 'Đã lưu');
      await draw();
    } catch (err) {
      toast((err as Error).message, undefined, 6000);
      b.disabled = false;
    }
  });
  await draw();
};

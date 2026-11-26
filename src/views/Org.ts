// Cấu hình tổ chức: đơn vị thí nghiệm (đầu biên bản, đánh số) và danh sách nhân viên.
import { setTop } from '../components/Chrome';
import { can } from '../auth/roles';
import { db } from '../store/db';
import { DEFAULT_UNIT, formatReportNo, nextReportNo, SAFETY_GRADES } from '../domain/units';
import { callout, esc, today, toast, uid } from '../ui';
import type { View } from '../router';
import type { Staff, Unit } from '../types';

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'vi');

/** Đơn vị đã khai; chưa khai → đơn vị mặc định (chỉ để hiển thị/chọn, không ghi vào CSDL). */
export async function unitsOrDefault(): Promise<Unit[]> {
  const list = (await db.units.toArray()).sort(byName);
  return list.length ? list : [DEFAULT_UNIT];
}

// ---------- Đơn vị & số biên bản ----------
export const Units: View = async (_r, el) => {
  setTop('Đơn vị & số biên bản', { back: '#/admin' });
  const edit = can('unit.edit');
  const draw = async () => {
    const [list, sessions] = await Promise.all([db.units.toArray(), db.sessions.toArray()]);
    const d = today();
    const year = Number(d.slice(0, 4));
    const card = (u: Unit, isNew: boolean) => {
      const next = nextReportNo(u, d, sessions, list.length <= 1 ? u.id : null);
      return `<form class="card" data-id="${esc(u.id)}"${isNew ? ' data-new' : ''}>
        ${isNew ? '<p class="small muted mt-0">Chưa khai đơn vị – biên bản đang dùng tên mặc định dưới đây. Bấm Lưu để khai chính thức.</p>' : ''}
        <label class="field"><span>Tên đơn vị (cấp trên)</span><input name="orgName" required maxlength="200" value="${esc(u.orgName)}"></label>
        <label class="field"><span>Đơn vị thí nghiệm</span><input name="name" required maxlength="200" value="${esc(u.name)}"></label>
        <label class="field"><span>Mẫu số biên bản – {nn}: số thứ tự, {yyyy}: năm</span><input name="reportFormat" required maxlength="100" value="${esc(u.reportFormat)}"></label>
        <div class="grid-2">
          <label class="field"><span>Số bắt đầu</span><input name="numberStart" inputmode="numeric" required value="${u.numberYear === year ? u.numberStart : 1}"></label>
          <label class="field"><span>Áp dụng cho năm</span><input name="numberYear" inputmode="numeric" required value="${year}"></label>
        </div>
        <p class="small muted">Sang năm mới số tự bắt đầu lại từ 01. Số kế tiếp năm ${year}: <b>${esc(formatReportNo(u.reportFormat, next, d))}</b></p>
        ${edit ? `<div class="btn-row"><button class="btn" type="submit">Lưu</button>${isNew ? '' : '<button class="btn secondary" type="button" data-del>Xóa</button>'}</div>` : ''}
      </form>`;
    };
    el.innerHTML = `
      <p class="small muted">Tên đơn vị in ở đầu biên bản thí nghiệm. Mỗi phiên lưu bản chụp tên đơn vị lúc tạo – sửa ở đây không đổi biên bản cũ.</p>
      ${list.length ? list.sort(byName).map((u) => card(u, false)).join('') : card({ ...DEFAULT_UNIT, id: uid() }, true)}
      ${edit && list.length ? '<button class="btn secondary block" type="button" id="add">＋ Thêm đơn vị thí nghiệm</button>' : ''}
      ${edit ? '' : callout({ level: 'info', text: 'Chỉ **Quản trị** sửa được đơn vị.' })}`;

    el.querySelectorAll<HTMLFormElement>('form[data-id]').forEach((f) => {
      f.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(f);
        const s = (k: string) => String(fd.get(k) ?? '').trim();
        const start = Number(s('numberStart'));
        const yr = Number(s('numberYear'));
        if (!s('orgName') || !s('name') || !s('reportFormat').includes('{nn}')) return toast('Nhập đủ tên đơn vị; mẫu số biên bản phải có {nn}');
        if (!Number.isInteger(start) || start < 1 || start > 99999 || !Number.isInteger(yr) || yr < 2000 || yr > 2200) return toast('Số bắt đầu hoặc năm không hợp lệ');
        const rec: Unit = { id: f.dataset.id!, orgName: s('orgName'), name: s('name'), reportFormat: s('reportFormat'), numberStart: start, numberYear: yr };
        await db.units.put(rec);
        // nhân viên khai trước khi có đơn vị (gắn đơn vị mặc định) → chuyển sang đơn vị đầu tiên
        if (f.hasAttribute('data-new')) await db.staff.where('unitId').equals(DEFAULT_UNIT.id).modify({ unitId: rec.id });
        toast('Đã lưu đơn vị');
        void draw();
      });
      f.querySelector('[data-del]')?.addEventListener('click', async () => {
        const n = await db.staff.where('unitId').equals(f.dataset.id!).count();
        if (n) return toast(`Đơn vị còn ${n} nhân viên – chuyển hoặc xóa nhân viên trước.`);
        if (!confirm('Xóa đơn vị này? Biên bản đã tạo vẫn giữ tên đơn vị cũ.')) return;
        await db.units.delete(f.dataset.id!);
        void draw();
      });
    });
    el.querySelector('#add')?.addEventListener('click', async () => {
      await db.units.add({ ...DEFAULT_UNIT, id: uid(), name: 'Đơn vị thí nghiệm mới', numberYear: year });
      void draw();
    });
  };
  await draw();
};

// ---------- Nhân viên ----------
export const StaffList: View = async (_r, el) => {
  setTop('Nhân viên đơn vị thí nghiệm', { back: true });
  const edit = can('staff.edit');
  const units = await unitsOrDefault();
  let unitId = units[0].id;
  let editing: string | null = null;

  const gradeOpts = (g: number) => SAFETY_GRADES.map((x) => `<option value="${x}"${x === g ? ' selected' : ''}>Bậc ${x}/5</option>`).join('');
  const formHtml = (p: Partial<Staff>, id: string) => `<form class="card" data-sid="${esc(id)}">
      <label class="field"><span>Họ và tên *</span><input name="name" required maxlength="200" autocomplete="off" value="${esc(p.name ?? '')}"></label>
      <label class="field"><span>Chức danh</span><input name="title" maxlength="200" placeholder="vd: Kỹ sư, Đội phó, Công nhân thí nghiệm" value="${esc(p.title ?? '')}"></label>
      <label class="field"><span>Bậc an toàn điện</span><select name="safetyGrade">${gradeOpts(p.safetyGrade ?? 3)}</select></label>
      ${units.length > 1 ? `<label class="field"><span>Đơn vị</span><select name="unitId">${units.map((u) => `<option value="${esc(u.id)}"${u.id === (p.unitId ?? unitId) ? ' selected' : ''}>${esc(u.name)}</option>`).join('')}</select></label>` : ''}
      <label class="check"><input type="checkbox" name="inactive"${p.inactive ? ' checked' : ''}><span>Đã nghỉ / chuyển đơn vị (ẩn khỏi danh sách chọn)</span></label>
      <div class="btn-row"><button class="btn" type="submit">Lưu</button><button class="btn secondary" type="button" data-cancel>Hủy</button>${p.id ? '<button class="btn danger" type="button" data-del>Xóa</button>' : ''}</div>
    </form>`;

  const draw = async () => {
    const all = (await db.staff.toArray()).filter((s) => s.unitId === unitId || (units.length === 1 && !units.some((u) => u.id === s.unitId))).sort(byName);
    el.innerHTML = `
      ${units.length > 1 ? `<label class="field"><span>Đơn vị</span><select id="unit">${units.map((u) => `<option value="${esc(u.id)}"${u.id === unitId ? ' selected' : ''}>${esc(u.name)}</option>`).join('')}</select></label>` : `<p class="small muted">${esc(units[0].name)}</p>`}
      ${edit ? (editing === 'new' ? formHtml({}, 'new') : '<button class="btn block" type="button" id="add">＋ Thêm nhân viên</button>') : ''}
      <h2>${all.filter((s) => !s.inactive).length} người đang làm việc</h2>
      ${
        all.length
          ? all
              .map((s) =>
                editing === s.id
                  ? formHtml(s, s.id)
                  : `<div class="card row${s.inactive ? ' muted' : ''}"><span><b>${esc(s.name)}</b><br><span class="small">${esc([s.title, `Bậc an toàn ${s.safetyGrade}/5`].filter(Boolean).join(' · '))}${s.inactive ? ' · đã nghỉ' : ''}</span></span>${edit ? `<button class="btn secondary" type="button" data-edit="${esc(s.id)}">Sửa</button>` : ''}</div>`,
              )
              .join('')
          : '<p class="muted">Chưa có nhân viên nào.</p>'
      }`;

    el.querySelector<HTMLSelectElement>('#unit')?.addEventListener('change', (e) => {
      unitId = (e.target as HTMLSelectElement).value;
      editing = null;
      void draw();
    });
    el.querySelector('#add')?.addEventListener('click', () => {
      editing = 'new';
      void draw().then(() => el.querySelector<HTMLInputElement>('form[data-sid="new"] input[name=name]')?.focus());
    });
    el.querySelectorAll<HTMLButtonElement>('[data-edit]').forEach((b) =>
      b.addEventListener('click', () => {
        editing = b.dataset.edit!;
        void draw();
      }),
    );
    el.querySelectorAll<HTMLFormElement>('form[data-sid]').forEach((f) => {
      f.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(f);
        const name = String(fd.get('name') ?? '').trim();
        if (!name) return toast('Nhập họ và tên');
        const id = f.dataset.sid === 'new' ? uid() : f.dataset.sid!;
        const rec: Staff = {
          id,
          unitId: String(fd.get('unitId') ?? unitId),
          name,
          title: String(fd.get('title') ?? '').trim(),
          safetyGrade: Number(fd.get('safetyGrade')) || 3,
          ...(fd.get('inactive') ? { inactive: true } : {}),
        };
        await db.staff.put(rec);
        toast('Đã lưu ' + name);
        editing = null;
        void draw();
      });
      f.querySelector('[data-cancel]')?.addEventListener('click', () => {
        editing = null;
        void draw();
      });
      f.querySelector('[data-del]')?.addEventListener('click', async () => {
        if (!confirm('Xóa nhân viên này? Biên bản cũ vẫn giữ tên. Nếu người này nghỉ, nên đánh dấu "Đã nghỉ" thay vì xóa.')) return;
        await db.staff.delete(f.dataset.sid!);
        editing = null;
        void draw();
      });
    });
  };
  await draw();
};

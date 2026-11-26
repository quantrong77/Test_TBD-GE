import { setTop } from '../components/Chrome';
import { Icons } from '../components/Icons';
import { can } from '../auth/roles';
import { activeSessionId, db } from '../store/db';
import { calibOverdue } from '../calc/evaluate';
import { parseNum } from '../calc/units';
import { PROFILE_DEFAULTS } from '../content';
import { callout, esc, fmtDate, today, toast, uid } from '../ui';
import { go, params, type View } from '../router';
import type { Instrument, Profile } from '../types';

import { TYPE_LABEL } from '../domain/session';

export const Sessions: View = async (_r, el) => {
  setTop('Phiên thí nghiệm', { back: '#/' });
  const list = (await db.sessions.toArray()).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  const active = activeSessionId();
  el.innerHTML = `
    ${can('session.create') ? '<div class="btn-row"><a class="btn big" href="#/session-new">＋ Tạo phiên mới</a></div>' : ''}
    ${
      list.length
        ? list
            .map(
              (s) => `<a class="card block link-plain" href="#/session/${esc(s.id)}">
            <div class="row"><b>${esc(s.profileId)}</b>${s.id === active ? '<span class="pill">● Đang làm</span>' : s.status === 'done' ? '<span class="pill">Đã kết thúc</span>' : ''}</div>
            <div class="small muted">${esc(fmtDate(s.date))} · ${esc(TYPE_LABEL[s.type])} · Chỉ huy: ${esc(s.leader)}</div></a>`,
            )
            .join('')
        : '<p class="muted">Chưa có phiên nào. Tạo phiên để ghi số đo, xuất biên bản PDF/Excel/JSON.</p>'
    }
    <h2>Danh mục</h2>
    <div class="shortcuts">
      <a href="#/profiles"><span class="ico">${Icons.folder}</span>Hồ sơ giàn</a>
      <a href="#/instruments"><span class="ico">${Icons.testSet}</span>Máy TN</a>
      <a href="#/calc/unbalance"><span class="ico">${Icons.calculator}</span>Máy tính ΔC</a>
      <a href="#/trend"><span class="ico">${Icons.chart}</span>Xu hướng</a>
    </div>
    ${can('admin.panel') ? '<div class="btn-row"><a class="btn secondary" href="#/admin">🛡️ Quản trị: cấu hình, dữ liệu, người dùng</a></div>' : ''}`;
};

// ---------- Hồ sơ giàn ----------
export const Profiles: View = async (_r, el) => {
  setTop('Hồ sơ giàn tụ', { back: '#/sessions' });
  const list = await db.profiles.toArray();
  el.innerHTML = `${can('profile.edit') ? '<div class="btn-row"><a class="btn" href="#/profile/new">＋ Hồ sơ mới</a></div>' : ''}
    ${list
      .map(
        (p) => `<a class="card block link-plain" href="#/profile/${encodeURIComponent(p.id)}"><b>${esc(p.bank)} – ${esc(p.station)}</b>
        <div class="small muted">Khe hở TAG ${esc(p.tagGap_mm)} mm · ΔC alarm ${esc(p.unbAlarm_pct)} % / bypass ${esc(p.unbBypass_pct)} % · VAP ${esc(p.vap?.mC?.[0])}±${esc(p.vap?.mC?.[1])} mC</div></a>`,
      )
      .join('')}`;
};

const PF: [string, string, string][] = [
  ['station', 'Trạm', 'text'],
  ['bank', 'Giàn tụ (vd TBD503)', 'text'],
  ['unitCap_uF', 'Điện dung 1 bình (µF)', 'num'],
  ['unitsPerString', 'Số bình nối tiếp / string', 'num'],
  ['stringsPerGroup', 'Số string / group', 'num'],
  ['groupsPerPhase', 'Số group / pha', 'num'],
  ['nominalTotal_uF', 'Điện dung danh định 1 pha (µF)', 'num'],
  ['tagGap_mm', 'Khe hở TAG (mm)', 'num'],
  ['gapTol_mm', 'Dung sai khe hở (± mm)', 'num'],
  ['unbAlarm_pct', 'Ngưỡng ΔC alarm (%)', 'num'],
  ['unbBypass_pct', 'Ngưỡng ΔC bypass (%)', 'num'],
  ['vap_mC_nom', 'VAP mC – danh định', 'num'],
  ['vap_mC_tol', 'VAP mC – dung sai ±', 'num'],
  ['vap_Vmin', 'VAP V – tối thiểu', 'num'],
  ['vap_A_nom', 'VAP A – danh định', 'num'],
  ['vap_A_tol', 'VAP A – dung sai ±', 'num'],
];

export const ProfileEdit: View = async (_r, el) => {
  const id = params().id;
  const isNew = id === 'new';
  const p: Profile = isNew ? { ...PROFILE_DEFAULTS, id: '', station: '', bank: '', tagGap_mm: 161 } : (await db.profiles.get(id))!;
  setTop(isNew ? 'Hồ sơ giàn mới' : `Hồ sơ ${p?.bank ?? ''}`, { back: '#/profiles' });
  if (!p) {
    el.innerHTML = '<p>Không tìm thấy hồ sơ.</p>';
    return;
  }
  const { vap: _vap, ...scalars } = p;
  const flat: Record<string, string | number | undefined> = {
    ...scalars,
    vap_mC_nom: p.vap.mC[0],
    vap_mC_tol: p.vap.mC[1],
    vap_Vmin: p.vap.Vmin,
    vap_A_nom: p.vap.A[0],
    vap_A_tol: p.vap.A[1],
  };
  el.innerHTML = `<form id="f">
    ${PF.map(([k, l, t]) => `<label class="field"><span>${esc(l)}</span><input name="${k}" ${t === 'num' ? 'inputmode="decimal"' : 'type="text"'} value="${esc(flat[k] ?? '')}" required></label>`).join('')}
    <label class="field"><span>Ghi chú</span><textarea name="note">${esc(p.note ?? '')}</textarea></label>
    ${can('profile.edit') ? `<button class="btn block big" type="submit">Lưu hồ sơ</button>
    ${isNew ? '' : '<button class="btn danger block mt-12" type="button" id="del">Xóa hồ sơ</button>'}` : '<p class="small muted">Tài khoản này chỉ xem hồ sơ giàn.</p>'}
  </form>`;
  const f = el.querySelector<HTMLFormElement>('#f')!;
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(f);
    const num = (k: string) => parseNum(String(fd.get(k)));
    const nums = PF.filter(([, , t]) => t === 'num').map(([k]) => k);
    const bad = nums.filter((k) => !Number.isFinite(num(k)));
    if (bad.length) {
      toast('Giá trị số không hợp lệ: ' + bad.map((k) => PF.find((x) => x[0] === k)![1]).join(', '));
      return;
    }
    const bank = String(fd.get('bank')).trim();
    const station = String(fd.get('station')).trim();
    const out: Profile = {
      id: isNew ? `${bank}-${station}`.toUpperCase().replace(/\s+/g, '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/Đ/g, 'D') : p.id,
      station,
      bank,
      unitCap_uF: num('unitCap_uF'),
      unitsPerString: num('unitsPerString'),
      stringsPerGroup: num('stringsPerGroup'),
      groupsPerPhase: num('groupsPerPhase'),
      nominalTotal_uF: num('nominalTotal_uF'),
      tagGap_mm: num('tagGap_mm'),
      gapTol_mm: num('gapTol_mm'),
      unbAlarm_pct: num('unbAlarm_pct'),
      unbBypass_pct: num('unbBypass_pct'),
      vap: { mC: [num('vap_mC_nom'), num('vap_mC_tol')], Vmin: num('vap_Vmin'), A: [num('vap_A_nom'), num('vap_A_tol')] },
      note: String(fd.get('note') ?? ''),
    };
    if (isNew && (await db.profiles.get(out.id))) {
      toast('Đã có hồ sơ cùng mã ' + out.id);
      return;
    }
    await db.profiles.put(out);
    toast('Đã lưu hồ sơ');
    go('#/profiles');
  });
  el.querySelector('#del')?.addEventListener('click', async () => {
    const used = await db.sessions.where('profileId').equals(p.id).count();
    if (used) {
      toast(`Hồ sơ đang dùng trong ${used} phiên – không xóa được.`);
      return;
    }
    if (!confirm('Xóa hồ sơ ' + p.bank + '?')) return;
    await db.profiles.delete(p.id);
    go('#/profiles');
  });
};

// ---------- Máy thí nghiệm ----------
export const Instruments: View = async (_r, el) => {
  setTop('Máy thí nghiệm – kiểm định', { back: true });
  const draw = async () => {
    const list = await db.instruments.toArray();
    const t = today();
    el.innerHTML = `<p class="small muted">Lưu số serial và hạn hiệu chuẩn/kiểm định. App cảnh báo khi tạo phiên nếu máy quá hạn.</p>
      ${list
        .map(
          (i) => `<form class="card" data-id="${esc(i.id)}">
          ${calibOverdue(i.calibDue, t) ? callout({ level: 'danger', text: `QUÁ HẠN kiểm định từ ${fmtDate(i.calibDue)}` }) : ''}
          <label class="field"><span>Model</span><input type="text" name="model" value="${esc(i.model)}" required></label>
          <label class="field"><span>Số serial</span><input type="text" name="serial" value="${esc(i.serial)}"></label>
          <label class="field"><span>Hạn hiệu chuẩn / kiểm định</span><input type="date" name="calibDue" value="${esc(i.calibDue)}"></label>
          <label class="field"><span>Ghi chú</span><input type="text" name="note" value="${esc(i.note ?? '')}"></label>
          ${can('instrument.edit') ? '<div class="btn-row"><button class="btn" type="submit">Lưu</button><button class="btn secondary" type="button" data-del>Xóa</button></div>' : ''}</form>`,
        )
        .join('')}
      ${can('instrument.edit') ? '<button class="btn secondary block" type="button" id="add">＋ Thêm máy</button>' : ''}`;
    el.querySelectorAll<HTMLFormElement>('form[data-id]').forEach((f) => {
      f.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(f);
        const rec: Instrument = { id: f.dataset.id!, model: String(fd.get('model')), serial: String(fd.get('serial')), calibDue: String(fd.get('calibDue')), note: String(fd.get('note')) };
        await db.instruments.put(rec);
        toast('Đã lưu');
        draw();
      });
      f.querySelector('[data-del]')?.addEventListener('click', async () => {
        if (!confirm('Xóa máy này?')) return;
        await db.instruments.delete(f.dataset.id!);
        draw();
      });
    });
    el.querySelector('#add')?.addEventListener('click', async () => {
      await db.instruments.add({ id: uid(), model: 'Máy mới', serial: '', calibDue: '' });
      draw();
    });
  };
  await draw();
};
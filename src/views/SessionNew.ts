// Tạo phiên thí nghiệm: đơn vị & số biên bản, nhân sự (chọn từ danh sách nhân viên), hạng mục thực hiện, máy TN.
import { setTop } from '../components/Chrome';
import { can } from '../auth/roles';
import { db, setActiveSession } from '../store/db';
import { calibOverdue } from '../calc/evaluate';
import { items } from '../content';
import { TYPE_LABEL } from '../domain/session';
import { crewLabel, duplicateReportNo, formatReportNo, nextReportNo, parseExtraCrew } from '../domain/units';
import { unitsOrDefault } from './Org';
import { callout, esc, fmtDate, today, toast, uid } from '../ui';
import { go, type View } from '../router';
import type { CrewMember, Session, Staff } from '../types';

const OTHER = '__other';
const toCrew = (s: Staff): CrewMember => ({ staffId: s.id, name: s.name, title: s.title, safetyGrade: s.safetyGrade });

export const SessionNew: View = async (_r, el) => {
  setTop('Tạo phiên thí nghiệm', { back: '#/sessions' });
  if (!can('session.create')) {
    el.innerHTML = '<p>Chỉ Quản trị và Chỉ huy trực tiếp được tạo phiên.</p>';
    return;
  }
  const [profiles, instruments, sessions, units, staffAll] = await Promise.all([
    db.profiles.toArray(),
    db.instruments.toArray(),
    db.sessions.toArray(),
    unitsOrDefault(),
    db.staff.toArray(),
  ]);
  const last = [...sessions].sort((a, b) => b.createdAt - a.createdAt)[0];
  const preferred = last?.profileId ?? 'TBD503-PLEIKU2';

  el.innerHTML = `
    <form id="f" novalidate>
      <label class="check card"><input type="checkbox" name="historical" id="historical"><span><b>📜 Nhập lại biên bản giấy cũ</b><br><span class="small muted">Chỉ để lưu số liệu các năm trước cho phân tích xu hướng: không cấp số biên bản mới, không ký điện tử, không cần cổng an toàn.</span></span></label>
      <h2>Thông tin biên bản</h2>
      ${
        units.length > 1
          ? `<label class="field"><span>Đơn vị thí nghiệm</span><select name="unitId">${units.map((u) => `<option value="${esc(u.id)}"${u.id === last?.unitId ? ' selected' : ''}>${esc(u.name)}</option>`).join('')}</select></label>`
          : `<p class="small muted">${esc(units[0].orgName)} · <b>${esc(units[0].name)}</b></p>`
      }
      <label class="field"><span>Hồ sơ giàn tụ</span><select name="profileId" required>${profiles
        .map((p) => `<option value="${esc(p.id)}"${p.id === preferred ? ' selected' : ''}>${esc(p.bank)} – ${esc(p.station)}</option>`)
        .join('')}</select></label>
      ${can('profile.edit') ? '<p class="small"><a href="#/profile/new">＋ Tạo hồ sơ giàn mới</a></p>' : ''}
      <div class="grid-2">
        <label class="field"><span>Ngày thí nghiệm</span><input type="date" name="date" value="${today()}" required></label>
        <label class="field"><span>Loại thí nghiệm</span><select name="type">${Object.entries(TYPE_LABEL)
          .map(([k, l]) => `<option value="${k}"${k === 'periodic' ? ' selected' : ''}>${l}</option>`)
          .join('')}</select></label>
      </div>
      <div id="noWrap">
        <label class="field"><span>Số biên bản (tự tăng, sửa được)</span><input name="reportNo" inputmode="numeric" required></label>
        <p class="small muted mt-0" id="noPreview"></p>
      </div>
      <label class="field" id="paperWrap" hidden><span>Số / ký hiệu biên bản giấy gốc (nếu có)</span><input name="paperRef" maxlength="100" placeholder="vd: 12/BB-TN ngày 15/03/2022"></label>

      <h2>Nhân sự</h2>
      <div id="crew"></div>

      <h2>Hạng mục thực hiện</h2>
      <p class="small muted mt-0">Bỏ chọn hạng mục không làm trong đợt này – hạng mục bỏ chọn ẩn khỏi phiên và không đưa vào biên bản. Sửa lại được trong phiên.</p>
      <fieldset class="card">${items.map((it) => `<label class="check"><input type="checkbox" name="item" value="${esc(it.id)}" checked><span><b>${it.id.slice(2)}.</b> ${esc(it.title)}</span></label>`).join('')}</fieldset>

      <h2>Máy thí nghiệm sử dụng</h2>
      <fieldset class="card">
        ${instruments
          .map(
            (i) =>
              `<label class="check"><input type="checkbox" name="inst" value="${esc(i.id)}" checked><span>${esc(i.model)}${i.serial ? ` · SN ${esc(i.serial)}` : ''}<br><span class="small muted">Hạn kiểm định: ${i.calibDue ? esc(fmtDate(i.calibDue)) : 'chưa nhập'}</span></span></label>`,
          )
          .join('')}
        <div id="calwarn"></div>
      </fieldset>
      <p class="small text-danger" id="err" role="alert"></p>
      <button class="btn block big" type="submit">Tạo phiên</button>
    </form>`;

  const f = el.querySelector<HTMLFormElement>('#f')!;
  const val = (k: string) => String(new FormData(f).get(k) ?? '').trim();
  const unit = () => units.find((u) => u.id === val('unitId')) ?? units[0];
  const staffOf = () =>
    staffAll
      .filter((s) => !s.inactive && (s.unitId === unit().id || (units.length === 1 && !units.some((u) => u.id === s.unitId))))
      .sort((a, b) => a.name.localeCompare(b.name, 'vi'));

  // ---- số biên bản: tự tăng theo đơn vị + năm; sửa tay thì giữ số đã sửa
  const noInput = f.querySelector<HTMLInputElement>('[name=reportNo]')!;
  let autoNo = true;
  const refreshNo = () => {
    const date = val('date') || today();
    if (autoNo) noInput.value = String(nextReportNo(unit(), date, sessions));
    const n = Number(noInput.value);
    el.querySelector('#noPreview')!.textContent = Number.isInteger(n) && n > 0 ? `In trên biên bản: Số ${formatReportNo(unit().reportFormat, n, date)}` : 'Số không hợp lệ';
  };
  noInput.addEventListener('input', () => {
    autoNo = false;
    refreshNo();
  });

  // ---- nhân sự
  const crewBox = el.querySelector<HTMLElement>('#crew')!;
  let responsibleName = '';
  const members = (): CrewMember[] => {
    const ids = new Set(new FormData(f).getAll('member').map(String));
    return [...staffOf().filter((s) => ids.has(s.id)).map(toCrew), ...parseExtraCrew(val('extra'))];
  };
  const leader = (): CrewMember | null => {
    const id = val('leaderId');
    if (id && id !== OTHER) {
      const s = staffAll.find((x) => x.id === id);
      return s ? toCrew(s) : null;
    }
    return val('leaderText') ? { name: val('leaderText') } : null;
  };
  /** Người chịu trách nhiệm chọn trong thành viên, không phải Chỉ huy trực tiếp. */
  const candidates = () => {
    const ld = leader();
    return members().filter((m) => !ld || m.name !== ld.name);
  };
  const drawResponsible = () => {
    const sel = f.querySelector<HTMLSelectElement>('[name=responsible]')!;
    const ms = candidates();
    sel.innerHTML = ms.length
      ? ms.map((m, i) => `<option value="${i}"${m.name === responsibleName ? ' selected' : ''}>${esc(crewLabel(m))}</option>`).join('')
      : '<option value="">— chọn thành viên trước —</option>';
    responsibleName = ms[Number(sel.value)]?.name ?? '';
  };
  const drawCrew = () => {
    const staff = staffOf();
    crewBox.innerHTML = `
      ${staff.length ? '' : callout({ level: 'info', text: `Chưa có danh sách nhân viên của đơn vị${can('staff.edit') ? ' – [thêm nhân viên](#/staff) để lần sau chọn nhanh' : ''}. Nhập tay bên dưới.` })}
      <label class="field"><span>Chỉ huy trực tiếp *</span><select name="leaderId">${
        staff.length ? '<option value="">— Chọn —</option>' + staff.map((s) => `<option value="${esc(s.id)}">${esc(crewLabel(s))}</option>`).join('') : ''
      }<option value="${OTHER}"${staff.length ? '' : ' selected'}>Người ngoài danh sách (nhập tay)</option></select></label>
      <label class="field" id="leaderTextWrap"${staff.length ? ' hidden' : ''}><span>Họ tên Chỉ huy trực tiếp</span><input name="leaderText" autocomplete="name" maxlength="200"></label>
      ${
        staff.length
          ? `<fieldset class="card"><legend><b>Thành viên</b></legend>${staff
              .map(
                (s) =>
                  `<label class="check"><input type="checkbox" name="member" value="${esc(s.id)}"><span>${esc(s.name)}<br><span class="small muted">${esc([s.title, `bậc an toàn ${s.safetyGrade}/5`].filter(Boolean).join(' · '))}</span></span></label>`,
              )
              .join('')}</fieldset>`
          : ''
      }
      <label class="field"><span>${staff.length ? 'Người ngoài danh sách' : 'Thành viên'} – mỗi dòng 1 người: Họ tên, chức danh, bậc an toàn</span><textarea name="extra" rows="3" placeholder="vd: Lê Văn D, Kỹ sư, 4"></textarea></label>
      <label class="field"><span>Người chịu trách nhiệm thí nghiệm * (ký ô Người thí nghiệm)</span><select name="responsible"></select></label>`;
    drawResponsible();
  };

  const checkCal = () => {
    const date = val('date');
    const chosen = new Set(new FormData(f).getAll('inst').map(String));
    const bad = instruments.filter((i) => chosen.has(i.id) && calibOverdue(i.calibDue, date));
    const missing = instruments.filter((i) => chosen.has(i.id) && !i.calibDue);
    el.querySelector('#calwarn')!.innerHTML =
      bad.map((i) => callout({ level: 'danger', text: `**${i.model}** đã QUÁ HẠN kiểm định (${fmtDate(i.calibDue)}).` })).join('') +
      (missing.length ? `<p class="small muted">Chưa nhập hạn kiểm định: ${missing.map((i) => esc(i.model)).join(', ')}${can('instrument.edit') ? ' – <a href="#/instruments">nhập</a>' : ''}.</p>` : '');
  };

  const isHist = () => f.querySelector<HTMLInputElement>('#historical')!.checked;
  f.addEventListener('change', (e) => {
    const name = (e.target as HTMLInputElement).name;
    if (name === 'historical') {
      el.querySelector<HTMLElement>('#noWrap')!.hidden = isHist();
      el.querySelector<HTMLElement>('#paperWrap')!.hidden = !isHist();
      f.querySelector<HTMLInputElement>('[name=date]')!.max = isHist() ? today() : '';
    }
    if (name === 'unitId') drawCrew();
    if (name === 'unitId' || name === 'date') refreshNo();
    if (name === 'leaderId') el.querySelector<HTMLElement>('#leaderTextWrap')!.hidden = val('leaderId') !== OTHER;
    if (name === 'responsible') responsibleName = candidates()[Number(val('responsible'))]?.name ?? '';
    if (name === 'member' || name === 'leaderId' || name === 'leaderText') drawResponsible();
    checkCal();
  });
  f.addEventListener('input', (e) => {
    const n = (e.target as HTMLInputElement).name;
    if (n === 'extra' || n === 'leaderText') drawResponsible();
  });
  drawCrew();
  refreshNo();
  checkCal();

  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(f);
    const ld = leader();
    const all = members();
    const resp = candidates()[Number(val('responsible'))];
    const reportNo = Number(val('reportNo'));
    const scope = fd.getAll('item').map(String);
    const hist = isHist();
    const missing = [
      ld || hist ? '' : 'Chỉ huy trực tiếp',
      resp || hist ? '' : 'Người chịu trách nhiệm thí nghiệm',
      hist || (Number.isInteger(reportNo) && reportNo > 0) ? '' : 'Số biên bản',
      scope.length ? '' : 'ít nhất 1 hạng mục',
      hist && val('date') > today() ? 'ngày thí nghiệm không ở tương lai' : '',
    ].filter(Boolean);
    if (missing.length) {
      el.querySelector('#err')!.textContent = 'Vui lòng chọn/nhập: ' + missing.join(', ') + '.';
      return;
    }
    const u = unit();
    const date = val('date');
    const draft = { id: uid(), unitId: u.id, date, ...(hist ? {} : { reportNo }) };
    const dup = duplicateReportNo(draft, sessions);
    if (!hist && dup.length && !confirm(`Số biên bản ${formatReportNo(u.reportFormat, reportNo, date)} đã dùng cho phiên ngày ${fmtDate(dup[0].date)}. Vẫn dùng số này?`)) return;
    const ms = all.filter((m) => m.name !== ld?.name);
    const s: Session = {
      ...draft,
      profileId: val('profileId'),
      type: fd.get('type') as Session['type'],
      leader: ld?.name ?? '',
      members: ms.map((m) => m.name),
      crew: { ...(ld ? { leader: ld } : {}), ...(resp ? { responsible: resp } : {}), members: ms },
      ...(hist ? { historical: true, ...(val('paperRef') ? { paperRef: val('paperRef') } : {}) } : {}),
      unitSnap: { orgName: u.orgName, name: u.name, reportFormat: u.reportFormat },
      items: scope,
      instruments: fd.getAll('inst').map(String),
      profileSnap: profiles.find((x) => x.id === val('profileId')),
      instrumentSnap: instruments.filter((i) => fd.getAll('inst').includes(i.id)),
      status: 'open',
      createdAt: Date.now(),
    };
    await db.sessions.add(s);
    if (hist) toast('Đã tạo phiên nhập lại biên bản cũ – nhập số liệu vào các hạng mục');
    else {
      setActiveSession(s.id);
      toast('Đã tạo phiên – đặt làm phiên đang làm');
    }
    go(`#/session/${s.id}`);
  });
};

// Chi tiết phiên: thông tin biên bản, nhân sự, hạng mục thực hiện, tiến độ theo pha, kết luận, ký, xuất.
import { items } from '../../content';
import { setTop } from '../../components/Chrome';
import { Icons } from '../../components/Icons';
import { activeSessionId, db, deleteSession, getGateCheck, setActiveSession } from '../../store/db';
import { PHASES } from '../../forms';
import { calibOverdue } from '../../calc/evaluate';
import { callout, debounce, esc, fmtDate, fmtTime, resBadge, toast } from '../../ui';
import { go, params, type View } from '../../router';
import { can } from '../../auth/roles';
import { verifySignatures } from '../../sign/sign';
import { itemOn, itemState, loadSessionData, phaseState, sessionInstruments, STATE_ICON, testState, TYPE_LABEL, type SessionData } from '../../domain/session';
import { crewLabel, DEFAULT_UNIT, duplicateReportNo, formatReportNo } from '../../domain/units';
import { bindSignActions, saveConclusionNow, signBlock } from './sign';
import type { Session } from '../../types';

export const reportNoText = (s: Session) => formatReportNo(s.unitSnap?.reportFormat ?? DEFAULT_UNIT.reportFormat, s.reportNo, s.date);

/** Bảng tiến độ hạng mục × pha: 3 nhóm làm song song ở 3 pha cùng nhìn được. */
function phaseMatrix(d: SessionData): string {
  const on = items.filter((it) => itemOn(d.session, it.id));
  return `<div class="table-wrap"><table class="phase-matrix"><thead><tr><th>Hạng mục</th>${PHASES.map((ph) => `<th>Pha ${ph}</th>`).join('')}</tr></thead><tbody>${on
    .map(
      (it) =>
        `<tr><td><a href="#/session/${esc(d.session.id)}/form/${it.id}/${it.tests[0].id}">${it.id.slice(2)}. ${esc(it.short)}</a></td>${PHASES.map((ph) => `<td>${STATE_ICON[phaseState(d, it.id, ph)]}</td>`).join('')}</tr>`,
    )
    .join('')}</tbody></table></div>
    <p class="small muted mt-4">○ chưa làm · ⏳ đang làm · ✅ đạt · ⚠️ cảnh báo · ❌ không đạt. Phép thử không chia pha (kiểm tra ngoại quan) tính chung cho cả 3 pha.</p>`;
}

function crewHtml(s: Session): string {
  const c = s.crew;
  if (!c) return `Chỉ huy: <b>${esc(s.leader)}</b>${s.members.length ? `<br>Thành viên: ${s.members.map(esc).join(', ')}` : ''}`;
  return `Chỉ huy trực tiếp: <b>${esc(crewLabel(c.leader ?? { name: s.leader }))}</b>
    ${c.responsible ? `<br>Chịu trách nhiệm thí nghiệm: <b>${esc(crewLabel(c.responsible))}</b>` : ''}
    ${c.members.length ? `<br>Thành viên: ${c.members.map((m) => esc(crewLabel(m))).join('; ')}` : ''}`;
}

export const SessionView: View = async (_r, el) => {
  const id = params().id;
  const d = await loadSessionData(id);
  if (!d) {
    setTop('Không tìm thấy', { back: '#/sessions' });
    el.innerHTML = '<p>Không tìm thấy phiên hoặc hồ sơ giàn của phiên.</p>';
    return;
  }
  const { session: s, profile: p } = d;
  setTop(`Phiên ${p.bank}`, { back: '#/sessions', sub: `${fmtDate(s.date)} · ${TYPE_LABEL[s.type]}` });
  const isActive = activeSessionId() === s.id;
  const insts = await sessionInstruments(s);
  const gp = await getGateCheck('gate-platform', s.id);
  const onItems = items.filter((it) => itemOn(s, it.id));
  const all = onItems.flatMap((it) => it.tests.map((t) => ({ it, t, ...testState(d, it.id, t.id) })));
  const counts = { pass: 0, fail: 0, warn: 0 };
  for (const x of all) for (const r of x.rows) if (r.result in counts) counts[r.result as keyof typeof counts]++;
  const sigs = await verifySignatures(s.id);
  const locked = sigs.some((x) => x.sig.slot === 'leader');
  const editable = !locked && can('session.edit');
  const dup = duplicateReportNo(s, await db.sessions.toArray());
  const unit = s.unitSnap ?? DEFAULT_UNIT;

  el.innerHTML = `
    <div class="card">
      <div class="row"><b>${esc(p.bank)} – ${esc(p.station)}</b>${isActive ? '<span class="pill">● Đang làm</span>' : ''}</div>
      <div class="small">${esc(unit.name)}${s.reportNo ? ` · Biên bản số <b>${esc(reportNoText(s))}</b>` : ''}${editable ? ' <button class="btn secondary" type="button" id="editNo">Sửa số</button>' : ''}</div>
      ${dup.length ? callout({ level: 'warn', text: `Số biên bản trùng với phiên ngày ${fmtDate(dup[0].date)} (có thể do tạo trên 2 máy khi không có mạng) – hãy sửa số.` }) : ''}
      <div class="small mt-4">Ngày: ${esc(fmtDate(s.date))} · ${esc(TYPE_LABEL[s.type])}<br>${crewHtml(s)}</div>
      ${insts.map((i) => `<div class="small hstack">${Icons.testSet} <span>${esc(i!.model)}${i!.serial ? ` · SN ${esc(i!.serial)}` : ''}${calibOverdue(i!.calibDue, s.date) ? ` <span class="res fail">QUÁ HẠN ${esc(fmtDate(i!.calibDue))}</span>` : ''}</span></div>`).join('')}
      <div class="btn-row">${isActive ? '<button class="btn secondary" type="button" id="deact">Bỏ chọn phiên</button>' : '<button class="btn" type="button" id="act">Đặt làm phiên đang làm</button>'}${editable ? '<button class="btn secondary" type="button" id="resnap">↻ Cập nhật ngưỡng từ hồ sơ giàn</button>' : ''}<a class="btn secondary" href="#/trend/${esc(s.profileId)}">📈 Xem xu hướng giàn tụ</a></div>
    </div>
    <a class="card row link-plain" href="#/gate/gate-platform" ${isActive ? '' : 'data-need-active'}>
      <span>${gp.confirmedBy ? '✅' : '⚠️'} Cổng an toàn lên sàn tụ</span><span class="small">${gp.confirmedBy ? `${esc(gp.confirmedBy)} · ${esc(fmtTime(gp.timestamp!))}` : 'Chưa xác nhận'}</span></a>

    <h2>Tiến độ theo pha</h2>
    ${onItems.length ? phaseMatrix(d) : '<p class="muted">Chưa chọn hạng mục nào.</p>'}

    <h2>Hạng mục</h2>
    ${can('session.edit') ? '' : '<p class="small muted mt-0">Chỉ Chỉ huy / Quản trị chọn được hạng mục thực hiện.</p>'}
    ${items
      .map((it) => {
        const on = itemOn(s, it.id);
        return `<div class="card${on ? '' : ' item-off'}">
          <div class="row"><b>${it.id.slice(2)}. ${esc(it.short)}</b>
            <label class="check borderless item-toggle"><input type="checkbox" data-item="${esc(it.id)}"${on ? ' checked' : ''}${editable ? '' : ' disabled'}><span>Thực hiện</span></label></div>
          ${
            on
              ? it.tests
                  .map((t) => `<a class="row link-plain list-row" href="#/session/${esc(s.id)}/form/${it.id}/${t.id}"><span>${esc(t.title)}</span><span>${STATE_ICON[testState(d, it.id, t.id).state]}</span></a>`)
                  .join('')
              : `<div class="small muted">Không thực hiện${itemState(d, it.id) !== 'todo' ? ' – đã có số liệu (giữ lại, không đưa vào biên bản)' : ''}</div>`
          }</div>`;
      })
      .join('')}

    <h2>Tổng kết</h2>
    <p>${resBadge('pass', `✅ Đạt: ${counts.pass}`)} ${resBadge('warn', `⚠️ Cảnh báo: ${counts.warn}`)} ${resBadge('fail', `❌ Không đạt: ${counts.fail}`)}</p>
    ${
      counts.fail + counts.warn
        ? `<div class="table-wrap"><table><thead><tr><th>Hạng mục</th><th>Nội dung</th><th>Giá trị</th><th>KQ</th></tr></thead><tbody>${all
            .flatMap((x) => x.rows.filter((r) => r.result === 'fail' || r.result === 'warn').map((r) => `<tr><td>${x.it.id.slice(2)}</td><td>${esc(r.group)} ${esc(r.label)}</td><td>${esc(r.value)}</td><td>${resBadge(r.result)}</td></tr>`))
            .join('')}</tbody></table></div>`
        : ''
    }
    <label class="field"><span>Kết luận, kiến nghị</span><textarea id="concl" rows="4"${editable ? '' : ' disabled'}>${esc(s.conclusion ?? '')}</textarea></label>
    <label class="check"><input type="checkbox" id="done"${s.status === 'done' ? ' checked' : ''}${editable ? '' : ' disabled'}><span>Đã kết thúc phiên</span></label>
    <h2>Ký biên bản</h2>
    ${locked ? callout({ level: 'info', text: '🔒 **Biên bản đã khóa** do Chỉ huy trực tiếp đã ký. Không sửa được số liệu.' }) : ''}
    ${signBlock(s, sigs)}
    <h2>Xuất biên bản</h2>
    <div class="btn-row">
      <button class="btn" type="button" data-exp="pdf">📄 PDF</button>
      <button class="btn" type="button" data-exp="xlsx">📊 Excel</button>
      <button class="btn secondary" type="button" data-exp="json">{ } JSON</button>
      ${'share' in navigator ? '<button class="btn secondary" type="button" data-exp="share">📤 Chia sẻ PDF</button>' : ''}
    </div>
    ${editable ? '<button class="btn danger block mt-24" type="button" id="del">Xóa phiên</button>' : ''}`;

  bindSignActions(el, s, () => saveConclusionNow(el, s));

  el.querySelectorAll<HTMLInputElement>('[data-item]').forEach((cb) =>
    cb.addEventListener('change', async () => {
      const itemId = cb.dataset.item!;
      const cur = s.items ?? items.map((it) => it.id);
      if (!cb.checked && itemState(d, itemId) !== 'todo' && !confirm('Hạng mục này đã có số liệu. Bỏ chọn sẽ ẩn và không đưa vào biên bản (số liệu vẫn được giữ). Tiếp tục?')) {
        cb.checked = true;
        return;
      }
      const next = cb.checked ? items.map((it) => it.id).filter((x) => x === itemId || cur.includes(x)) : cur.filter((x) => x !== itemId);
      await db.sessions.update(s.id, { items: next });
      go(location.hash);
    }),
  );
  el.querySelector('#editNo')?.addEventListener('click', async () => {
    const v = prompt(`Số thứ tự biên bản (mẫu ${unit.reportFormat}):`, String(s.reportNo ?? ''));
    if (v === null) return;
    const n = Number(v.trim());
    if (!Number.isInteger(n) || n < 1 || n > 99999) return toast('Số không hợp lệ');
    const clash = duplicateReportNo({ ...s, reportNo: n }, await db.sessions.toArray());
    if (clash.length && !confirm(`Số này đã dùng cho phiên ngày ${fmtDate(clash[0].date)}. Vẫn dùng?`)) return;
    await db.sessions.update(s.id, { reportNo: n });
    go(location.hash);
  });
  el.querySelector('#act')?.addEventListener('click', () => {
    setActiveSession(s.id);
    toast('Đã đặt làm phiên đang làm');
    go(location.hash);
  });
  el.querySelector('#resnap')?.addEventListener('click', async () => {
    const cur = await db.profiles.get(s.profileId);
    if (!cur) return toast('Hồ sơ giàn không còn trong danh mục');
    if (!confirm('Áp ngưỡng hiện tại của hồ sơ ' + cur.bank + ' và hạn kiểm định máy TN hiện tại cho phiên này? Kết quả Đạt/Không đạt sẽ được tính lại.')) return;
    const inst = (await db.instruments.bulkGet(s.instruments)).filter((x) => !!x);
    await db.sessions.update(s.id, { profileSnap: cur, instrumentSnap: inst });
    go(location.hash);
  });
  el.querySelector('#deact')?.addEventListener('click', () => {
    setActiveSession(null);
    go(location.hash);
  });
  el.querySelector('[data-need-active]')?.addEventListener('click', (e) => {
    // cổng an toàn ghi vào phiên đang làm – đặt phiên này trước
    e.preventDefault();
    setActiveSession(s.id);
    go('#/gate/gate-platform');
  });
  const saveConcl = debounce(async (v: string) => {
    await db.sessions.update(s.id, { conclusion: v });
  }, 500);
  el.querySelector<HTMLTextAreaElement>('#concl')!.addEventListener('input', (e) => saveConcl((e.target as HTMLTextAreaElement).value));
  el.querySelector<HTMLInputElement>('#done')!.addEventListener('change', async (e) => {
    await db.sessions.update(s.id, { status: (e.target as HTMLInputElement).checked ? 'done' : 'open' });
  });
  el.querySelectorAll<HTMLButtonElement>('[data-exp]').forEach((b) =>
    b.addEventListener('click', async () => {
      b.disabled = true;
      try {
        // kết luận vừa gõ (chưa qua debounce) phải có trong biên bản
        if (editable) await db.sessions.update(s.id, { conclusion: el.querySelector<HTMLTextAreaElement>('#concl')!.value });
        const fresh = (await loadSessionData(s.id))!;
        const ex = await import('../../export/exporters');
        await ex.exportSession(fresh, b.dataset.exp as 'pdf' | 'xlsx' | 'json' | 'share');
      } catch (err) {
        console.error(err);
        toast('Xuất thất bại: ' + (err as Error).message);
      } finally {
        b.disabled = false;
      }
    }),
  );
  el.querySelector('#del')?.addEventListener('click', async () => {
    if (!confirm('Xóa phiên này cùng toàn bộ số đo và ảnh? Không thể hoàn tác.')) return;
    await deleteSession(s.id);
    go('#/sessions');
  });
};

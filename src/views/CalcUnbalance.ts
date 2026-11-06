import { setTop } from '../components/Chrome';
import { FORMS, paintRows, PHASES, type Phase, type Values } from '../forms';
import { activeProfile } from './Item';
import { activeSessionId, db, getValues, measId, setActiveSession } from '../store/db';
import { seedProfiles } from '../content';
import { bankCapacitance } from '../calc/unbalance';
import { esc, fmtDate, table, toast } from '../ui';
import { fmt } from '../calc/units';
import { can } from '../auth/roles';
import { isLocked } from '../sign/sign';
import { go, type View } from '../router';
import { openOcrScanner } from '../components/OcrModal';

const KEY = 'tbd.calc.unbalance';
const load = (): Values => {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) || '{}');
  } catch {
    return {};
  }
};

export const CalcUnbalance: View = async (_r, el) => {
  setTop('Máy tính mất cân bằng', { back: true });
  const profiles = await db.profiles.toArray();
  const sessions = (await db.sessions.toArray()).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  let sid = activeSessionId() ?? (sessions.length > 0 ? sessions[0].id : null);
  const activeS = sessions.find((s) => s.id === sid);

  let profile = (activeS ? profiles.find((p) => p.id === activeS.profileId) : null)
    ?? (await activeProfile())
    ?? profiles.find((p) => p.id === 'TBD503-PLEIKU2')
    ?? seedProfiles()[0];

  const values = load();
  if (Object.keys(values).length === 0 && sid) {
    const saved = await getValues(sid, '4.1', 'unbalance');
    for (const [k, v] of Object.entries(saved)) values[k] = v;
  }

  let phase: Phase = 'A';
  const form = FORMS.unbalance;

  el.innerHTML = `
    ${
      sessions.length
        ? `<label class="field"><span>Phiên thí nghiệm (điền vào mục 1.B)</span><select id="ses">${sessions
            .map((s) => `<option value="${esc(s.id)}"${s.id === sid ? ' selected' : ''}>${esc(s.profileId)} · ${esc(fmtDate(s.date))} · ${esc(s.leader)}${s.id === activeSessionId() ? ' (Đang làm)' : ''}</option>`)
            .join('')}</select></label>`
        : ''
    }
    <label class="field"><span>Hồ sơ giàn (ngưỡng)</span><select id="prof">${profiles
      .map((p) => `<option value="${esc(p.id)}"${p.id === profile.id ? ' selected' : ''}>${esc(p.bank)} – ${esc(p.station)}</option>`)
      .join('')}</select></label>
    <div class="row"><div class="seg" role="group" aria-label="Pha">${PHASES.map((x) => `<button type="button" data-ph="${x}" aria-pressed="${x === phase}">${x}</button>`).join('')}</div>
      <button class="btn secondary" type="button" id="clr">Xóa số</button></div>
    <div id="body"></div>
    <details class="card"><summary>Dung lượng danh định theo hồ sơ</summary><div id="nom"></div></details>
    <div class="btn-row" style="margin:16px 0 6px">
      <button class="btn big block" type="button" id="save">💾 Lưu</button>
    </div>
    <div id="save-msg"></div>
    <p class="small muted">Để ghi biên bản, bấm lưu, số liệu sẽ tự điền vào mục 1.B.</p>`;
  const body = el.querySelector<HTMLElement>('#body')!;
  const draw = () => {
    body.innerHTML = form.render(values, profile, phase);
    paintRows(body, values, profile);
    form.live!(body, values, profile, phase);
    const b = bankCapacitance(profile);
    el.querySelector('#nom')!.innerHTML = table(
      ['Bước', 'Công thức', 'Kết quả'],
      [
        ['1 String', `${fmt(profile.unitCap_uF)} / ${profile.unitsPerString}`, `${fmt(b.string_uF)} µF`],
        ['1 Group', `× ${profile.stringsPerGroup}`, `${fmt(b.group_uF, 2)} µF`],
        ['Tổng 1 pha', `× ${profile.groupsPerPhase}`, `**${fmt(b.total_uF, 2)} µF**`],
        ['Trở kháng', '1/(2π·50·C)', `**≈ ${fmt(b.X_ohm, 2)} Ω**`],
      ],
    );
  };
  body.addEventListener('input', (e) => {
    const t = e.target as HTMLInputElement;
    if (!t.dataset.k) return;
    values[t.dataset.k] = t.value;
    try {
      sessionStorage.setItem(KEY, JSON.stringify(values));
    } catch {
      /* bỏ qua */
    }
    paintRows(body, values, profile);
    form.live!(body, values, profile, phase);
  });
  body.addEventListener('click', (e) => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('.btn-ocr-scan');
    if (!btn) return;
    const targetKey = btn.dataset.scanFor;
    if (!targetKey) return;
    const input = body.querySelector<HTMLInputElement>(`input[data-k="${targetKey}"]`);
    if (!input) return;
    openOcrScanner({
      targetFieldLabel: input.getAttribute('aria-label') || targetKey,
      initialValue: input.value,
      onApply: (val) => {
        input.value = val;
        values[targetKey] = val;
        try {
          sessionStorage.setItem(KEY, JSON.stringify(values));
        } catch {
          /* bỏ qua */
        }
        paintRows(body, values, profile);
        form.live!(body, values, profile, phase);
      },
    });
  });
  el.querySelectorAll<HTMLButtonElement>('[data-ph]').forEach((b) =>
    b.addEventListener('click', () => {
      phase = b.dataset.ph as Phase;
      el.querySelectorAll('[data-ph]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      draw();
    }),
  );
  el.querySelector('#ses')?.addEventListener('change', async (e) => {
    sid = (e.target as HTMLSelectElement).value;
    const targetSession = sessions.find((s) => s.id === sid);
    if (targetSession) {
      profile = profiles.find((p) => p.id === targetSession.profileId) ?? profile;
      const profSelect = el.querySelector<HTMLSelectElement>('#prof');
      if (profSelect) profSelect.value = profile.id;
      const saved = await getValues(sid, '4.1', 'unbalance');
      if (Object.keys(saved).length > 0) {
        for (const [k, v] of Object.entries(saved)) values[k] = v;
        sessionStorage.setItem(KEY, JSON.stringify(values));
      }
      draw();
    }
  });
  el.querySelector('#prof')!.addEventListener('change', (e) => {
    profile = profiles.find((p) => p.id === (e.target as HTMLSelectElement).value) ?? profile;
    draw();
  });
  el.querySelector('#clr')!.addEventListener('click', () => {
    for (const k of Object.keys(values)) if (k.startsWith(phase + '.')) delete values[k];
    sessionStorage.setItem(KEY, JSON.stringify(values));
    draw();
  });

  el.querySelector('#save')?.addEventListener('click', async () => {
    const entries = Object.entries(values).filter(([k, v]) => !k.startsWith('__') && v !== '' && v !== undefined);
    if (entries.length === 0) {
      toast('Chưa có số liệu tính toán để lưu.');
      return;
    }

    if (!sid) {
      if (sessions.length === 0) {
        toast('Chưa có phiên thí nghiệm nào. Hãy tạo phiên trước.');
        go('#/session-new');
        return;
      }
      sid = sessions[0].id;
      setActiveSession(sid);
    }

    if (await isLocked(sid)) {
      toast('Biên bản của phiên này đã bị khóa (đã ký). Không thể ghi số liệu mới.');
      return;
    }
    if (!can('measure.edit')) {
      toast('Tài khoản không có quyền nhập số đo.');
      return;
    }

    await db.measurements.bulkPut(
      entries.map(([k, v]) => ({
        id: measId(sid!, '4.1', 'unbalance', k),
        sessionId: sid!,
        itemId: '4.1',
        testId: 'unbalance',
        key: k,
        value: String(v),
        ts: Date.now(),
      })),
    );

    if (!activeSessionId()) setActiveSession(sid);

    toast('✓ Đã điền kết quả vào mục 1.B của biên bản');
    const msg = el.querySelector('#save-msg');
    if (msg) {
      msg.innerHTML = `<div class="callout pass" style="margin:8px 0">
        ✓ <b>Đã điền thành công vào mục 1.B</b> của phiên thí nghiệm.<br>
        <a class="btn secondary" href="#/session/${esc(sid)}/form/4.1/unbalance" style="margin-top:6px;display:inline-block">📋 Xem mục 1.B trong biên bản →</a>
      </div>`;
    }
  });

  draw();
};

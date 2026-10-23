import { setTop } from '../components/Chrome';
import { FORMS, paintRows, PHASES, type Phase, type Values } from '../forms';
import { activeProfile } from './Item';
import { db } from '../store/db';
import { seedProfiles } from '../content';
import { bankCapacitance } from '../calc/unbalance';
import { esc, table } from '../ui';
import { fmt } from '../calc/units';
import type { View } from '../router';

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
  let profile = (await activeProfile()) ?? profiles.find((p) => p.id === 'TBD503-PLEIKU2') ?? seedProfiles()[0];
  const values = load();
  let phase: Phase = 'A';
  const form = FORMS.unbalance;

  el.innerHTML = `
    <label class="field"><span>Hồ sơ giàn (ngưỡng)</span><select id="prof">${profiles
      .map((p) => `<option value="${esc(p.id)}"${p.id === profile.id ? ' selected' : ''}>${esc(p.bank)} – ${esc(p.station)}</option>`)
      .join('')}</select></label>
    <div class="row"><div class="seg" role="group" aria-label="Pha">${PHASES.map((x) => `<button type="button" data-ph="${x}" aria-pressed="${x === phase}">${x}</button>`).join('')}</div>
      <button class="btn secondary" type="button" id="clr">Xóa số</button></div>
    <div id="body"></div>
    <details class="card"><summary>Dung lượng danh định theo hồ sơ</summary><div id="nom"></div></details>
    <p class="small muted">Máy tính nhanh – số liệu không lưu vào biên bản. Để ghi biên bản, nhập trong Phiên TN → 4.1.B.</p>`;
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
  el.querySelectorAll<HTMLButtonElement>('[data-ph]').forEach((b) =>
    b.addEventListener('click', () => {
      phase = b.dataset.ph as Phase;
      el.querySelectorAll('[data-ph]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      draw();
    }),
  );
  el.querySelector('#prof')!.addEventListener('change', (e) => {
    profile = profiles.find((p) => p.id === (e.target as HTMLSelectElement).value) ?? profile;
    draw();
  });
  el.querySelector('#clr')!.addEventListener('click', () => {
    for (const k of Object.keys(values)) if (k.startsWith(phase + '.')) delete values[k];
    sessionStorage.setItem(KEY, JSON.stringify(values));
    draw();
  });
  draw();
};

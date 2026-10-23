import { equipment, getEquipment, type EquipSection } from '../content';
import { setTop } from '../components/Chrome';
import { bindTimers, timerHtml, timerRemaining } from '../components/Timer';
import { callout, esc, gallery, rich, table } from '../ui';
import { fmt, gammaKv, gammaMa, parseNum } from '../calc/units';
import { params, type View } from '../router';

const TAB_LABEL: Record<string, string> = {
  specs: 'Thông số',
  controls: 'Mặt máy',
  tests: '4 phép thử',
  principle: 'CV/CC',
  quick: 'Thao tác',
  safety: 'An toàn',
  troubleshoot: 'Sự cố',
  maintenance: 'Bảo dưỡng',
};

function quickSteps(eqId: string, s: EquipSection): string {
  return `<div data-quick>${s
    .steps!.map((st, i) => {
      const prev = s.steps![i - 1];
      const waitOn = prev?.lock && prev.timer ? `data-wait="eq:${eqId}:${prev.n}" data-wait-sec="${prev.timer}"` : '';
      return `<div class="card" style="margin:8px 0">
        <label class="check" style="border:0"><input type="checkbox" data-n="${st.n}" ${waitOn}><span><b>${st.n}.</b> ${rich(st.text)}</span></label>
        ${st.timer ? timerHtml(`eq:${eqId}:${st.n}`, st.timer, st.lock ? 'Bước tiếp chỉ tích được khi hết giờ' : 'Đếm thời gian chờ') : ''}
      </div>`;
    })
    .join('')}</div>`;
}

function monitorTool(): string {
  return `<div class="card" id="monitor"><b>🧮 Quy đổi giám sát (TB-1)</b>
    <div class="inrow"><span class="lbl">Vôn kế kẹp 8–4 (V)<small>5 V = 10 kV</small></span><input inputmode="decimal" id="m8" placeholder="vd 5,0"></div>
    <div class="inrow"><span class="lbl">Vôn kế kẹp 7–4 (V)<small>5 V = 6 mA</small></span><input inputmode="decimal" id="m7" placeholder="vd 2,5"></div>
    <p class="calc-out" id="mout">—</p></div>`;
}

function section(eqId: string, s: EquipSection, monitor: boolean): string {
  return `<section data-sec="${esc(s.id)}" id="sec-${esc(s.id)}"><h2>${esc(s.title)}</h2>
    ${(s.points ?? []).map((p) => `<p>${rich(p)}</p>`).join('')}
    ${s.images ? gallery(s.images, 'eq-' + s.id) : ''}
    ${
      s.cards
        ? `<div class="grid2">${s.cards.map((c) => `<div class="card" style="margin:0"><div style="font-size:24px" aria-hidden="true">${esc(c.icon)}</div><b>${esc(c.name)}</b><div class="small">${rich(c.desc)}</div></div>`).join('')}</div>`
        : ''
    }
    ${s.table ? table(s.table.head, s.table.rows) : ''}
    ${s.tableImages ? gallery(s.tableImages, 'eq-t-' + s.id) : ''}
    ${(s.callouts ?? []).map(callout).join('')}
    ${s.steps ? quickSteps(eqId, s) : ''}
    ${monitor && s.id === 'controls' ? monitorTool() : ''}
  </section>`;
}

export const EquipmentView: View = (_r, el) => {
  const { eqId, section: secId } = params();
  if (!eqId) {
    setTop('Máy thí nghiệm chuyên dùng', { back: '#/' });
    el.innerHTML = `<p>Thư viện <b>2 máy thí nghiệm</b> dùng trong hạng mục 4.5.</p>
      ${equipment
        .map(
          (e) => `<a class="card" href="#/equipment/${e.id}" style="display:block;text-decoration:none;color:inherit">
          <b style="font-size:var(--fs-h2)">🔧 ${esc(e.name)}</b>
          <div class="small muted">Dùng ở: ${e.usedIn.map((u) => esc(u.label)).join('; ')}</div>
          <div class="small muted">Nguồn: ${esc(e.docRef)}</div></a>`,
        )
        .join('')}
      <a class="btn secondary block" href="#/instruments">Quản lý serial & hạn kiểm định</a>`;
    return;
  }
  const eq = getEquipment(eqId);
  if (!eq) {
    setTop('Không tìm thấy', { back: '#/equipment' });
    el.innerHTML = '<p>Không tìm thấy máy.</p>';
    return;
  }
  setTop(eq.short, { back: '#/equipment', sub: eq.name });
  el.innerHTML = `
    <div class="tabs" role="toolbar" aria-label="Mục">${eq.sections.map((s) => `<button type="button" data-tab="${s.id}" aria-pressed="${s.id === secId}">${esc(TAB_LABEL[s.id] ?? s.title)}</button>`).join('')}</div>
    <h1>${esc(eq.name)}</h1>
    <p class="small muted">Dùng ở: ${eq.usedIn.map((u) => `<a href="#/item/${u.item}?test=${u.test}">${esc(u.label)}</a>`).join('; ')}<br>Nguồn: ${esc(eq.docRef)}</p>
    ${gallery(eq.images.slice(0, 2), 'eq-top')}
    ${eq.sections.map((s) => section(eq.id, s, !!eq.monitor)).join('')}`;

  el.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) =>
    b.addEventListener('click', () => {
      el.querySelectorAll('[data-tab]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      el.querySelector(`#sec-${b.dataset.tab}`)?.scrollIntoView({ behavior: 'smooth' });
    }),
  );
  if (secId) requestAnimationFrame(() => el.querySelector(`#sec-${CSS.escape(secId)}`)?.scrollIntoView());

  // Bước có khóa: chỉ tích được khi đồng hồ của bước trước hết giờ
  const refreshLocks = () =>
    el.querySelectorAll<HTMLInputElement>('input[data-wait]').forEach((i) => {
      const locked = timerRemaining(i.dataset.wait!, Number(i.dataset.waitSec)) !== 0;
      i.disabled = locked && !i.checked;
      i.closest('.check')!.classList.toggle('disabled', i.disabled);
    });
  refreshLocks();
  bindTimers(el, refreshLocks);

  const m8 = el.querySelector<HTMLInputElement>('#m8');
  const m7 = el.querySelector<HTMLInputElement>('#m7');
  const out = el.querySelector('#mout');
  const calc = () => {
    const a = parseNum(m8!.value);
    const b = parseNum(m7!.value);
    out!.innerHTML = `${Number.isFinite(a) ? `U = <b>${fmt(gammaKv(a), 3)} kV</b>` : ''}${Number.isFinite(a) && Number.isFinite(b) ? ' · ' : ''}${Number.isFinite(b) ? `I = <b>${fmt(gammaMa(b), 3)} mA</b>` : ''}` || '—';
  };
  m8?.addEventListener('input', calc);
  m7?.addEventListener('input', calc);
};

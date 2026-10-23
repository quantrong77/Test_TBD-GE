import { getEquipment, getGate, getItem, getThreshold, gatesFor } from '../content';
import { setTop } from '../components/Chrome';
import { activeSessionId, db, isGateConfirmed } from '../store/db';
import { callout, esc, gallery, rich, table } from '../ui';
import { describeThreshold, resolveThreshold } from '../calc/evaluate';
import { params, type View } from '../router';
import type { Profile, Test } from '../types';
import { stepsOf } from './StepMode';

export async function activeProfile(): Promise<Profile | undefined> {
  const sid = activeSessionId();
  if (!sid) return undefined;
  const s = await db.sessions.get(sid);
  return s ? db.profiles.get(s.profileId) : undefined;
}

export function thresholdRows(ids: string[], profile?: Profile): string[][] {
  return ids
    .map((id) => getThreshold(id))
    .filter((t) => !!t)
    .map((t) => {
      const r = resolveThreshold(t!, profile);
      return [r.label, describeThreshold(r) + (r.note ? ` – ${r.note}` : ''), t!.profileOverride ? (profile ? `theo ${profile.bank}` : 'mẫu TBD503') : 'cố định'];
    });
}

function testBlock(itemId: string, t: Test, sid: string | null): string {
  const steps = t.steps
    ? `<ol class="steps">${t.steps
        .map((s) => {
          const eq = s.equip ? getEquipment(s.equip.split('/')[0]) : undefined;
          return `<li><span class="n">${s.n}</span><div>${rich(s.text)}
          ${s.note ? `<div class="small muted">ℹ️ ${rich(s.note)}</div>` : ''}
          ${s.record ? `<span class="rec">Ghi: ${esc(s.record)}</span> ` : ''}
          ${s.timer ? `<span class="rec">⏱ ${s.timer} s</span> ` : ''}
          ${eq ? `<a class="rec" href="#/equipment/${esc(s.equip!)}">🧰 Xem máy</a>` : ''}</div></li>`;
        })
        .join('')}</ol>`
    : '';
  const checklist = t.checklist ? `<ul class="clean">${t.checklist.map((c) => `<li>☐ ${rich(c)}</li>`).join('')}</ul>` : '';
  return `<div class="card" id="test-${esc(t.id)}">
    <h3 style="margin-top:0">${esc(t.title)}</h3>
    ${(t.purpose ?? []).map((p) => `<p>${rich(p)}</p>`).join('')}
    ${(t.callouts ?? []).map(callout).join('')}
    ${checklist}${steps}
    ${t.table ? table(t.table.head, t.table.rows) : ''}
    ${(t.extraTables ?? []).map((x) => `${x.title ? `<p class="small"><b>${esc(x.title)}</b></p>` : ''}${table(x.head, x.rows)}`).join('')}
    ${(t.tips ?? []).map((x) => callout({ level: 'info', text: x })).join('')}
    <div class="btn-row">
      ${stepsOf(t).length ? `<a class="btn big" href="#/item/${itemId}/test/${esc(t.id)}/step/1">▶ BẮT ĐẦU TỪNG BƯỚC</a>` : ''}
      ${sid ? `<a class="btn secondary" href="#/session/${esc(sid)}/form/${itemId}/${esc(t.id)}">📝 Nhập kết quả</a>` : ''}
    </div>
  </div>`;
}

export const ItemView: View = async (_r, el) => {
  const item = getItem(params().itemId);
  if (!item) {
    setTop('Không tìm thấy', { back: '#/' });
    el.innerHTML = '<p>Hạng mục không tồn tại.</p>';
    return;
  }
  setTop(`${item.id} ${item.title}`, { back: '#/items', sub: item.tab || undefined });
  const sid = activeSessionId();
  const profile = await activeProfile();
  const gateIds = [...new Set(item.tests.flatMap((t) => gatesFor(item.id, t.id)))];
  const gateStatus = await Promise.all(gateIds.map(async (g) => [g, await isGateConfirmed(g)] as const));
  const tabs: [string, string][] = [
    ['purpose', 'Mục đích'],
    ['tools', 'Dụng cụ'],
    ['safety', 'An toàn'],
    ['steps', 'Trình tự'],
    ['thr', 'Ngưỡng'],
    ['img', 'Hình ảnh'],
  ];
  const thr = thresholdRows(item.thresholds, profile);
  el.innerHTML = `
    <div class="tabs" role="toolbar" aria-label="Mục trong hạng mục">${tabs
      .map(([k, l], i) => `<button type="button" data-tab="${k}" aria-pressed="${i === 0}">${l}</button>`)
      .join('')}</div>
    ${item.danger ? callout({ level: 'danger', text: item.id === '4.5' ? 'Hạng mục **phức tạp và nguy hiểm nhất** – bắt buộc qua cổng an toàn riêng.' : 'Có phép thử cấp điện áp **có thể gây chết người**.' }) : ''}
    <section data-sec="purpose"><h2>Mục đích</h2><ul class="clean">${item.purpose.map((p) => `<li>${rich(p)}</li>`).join('')}</ul>
      <p class="small muted">Phép thử: ${item.tests.map((t) => `<a href="#/item/${item.id}" data-jump="test-${esc(t.id)}">${esc(t.title)}</a>`).join(' · ')}</p></section>
    <section data-sec="tools"><h2>Dụng cụ</h2><ul class="clean">${item.tools.map((p) => `<li>${rich(p)}</li>`).join('')}</ul></section>
    <section data-sec="safety"><h2>An toàn</h2>
      ${(item.callouts ?? []).map(callout).join('')}
      ${gateStatus
        .map(
          ([g, ok]) => `<a class="card row" href="#/gate/${g}" style="text-decoration:none;color:inherit"><span>${ok ? '✅' : '⚠️'} ${esc(getGate(g)?.title ?? g)}</span><span class="pill">${ok ? 'Đã xác nhận' : 'Chưa'}</span></a>`,
        )
        .join('')}
    </section>
    <section data-sec="steps"><h2>Trình tự</h2>${item.tests.map((t) => testBlock(item.id, t, sid)).join('')}</section>
    <section data-sec="thr"><h2>Ngưỡng</h2>${thr.length ? table(['Đại lượng', 'Khoảng Đạt', 'Nguồn'], thr) : '<p class="muted">So sánh với lần trước / giá trị nhà sản xuất (xem biểu mẫu).</p>'}
      ${profile ? '' : '<p class="small muted">Chưa chọn phiên/hồ sơ giàn – đang hiển thị ngưỡng mẫu TBD503 T500 Pleiku 2.</p>'}</section>
    <section data-sec="img"><h2>Hình ảnh</h2>${gallery(item.images, 'item')}</section>`;

  const btns = [...el.querySelectorAll<HTMLButtonElement>('[data-tab]')];
  btns.forEach((b) =>
    b.addEventListener('click', () => {
      btns.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      el.querySelector(`[data-sec="${b.dataset.tab}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }),
  );
  el.querySelectorAll<HTMLAnchorElement>('[data-jump]').forEach((a) =>
    a.addEventListener('click', (e) => {
      e.preventDefault();
      el.querySelector('#' + a.dataset.jump)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }),
  );
  const focus = _r.query.get('test');
  if (focus) requestAnimationFrame(() => el.querySelector('#test-' + CSS.escape(focus))?.scrollIntoView());
};

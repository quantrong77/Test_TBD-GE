// Biểu mẫu nhập số đo của một phép thử trong phiên.
import { getItem, getTest, gatesFor, getGate } from '../content';
import { setTop } from '../components/Chrome';
import { db, getGateCheck, getValues, measId, previousSession, putValue } from '../store/db';
import { formFor, paintRows, PHASES, type Phase, type Values } from '../forms';
import { callout, debounce, esc, fmtDate, resBadge, toast } from '../ui';
import { go, params, type View } from '../router';
import { getFontScale } from '../settings';
import { stepsOf } from './StepMode';
import { can } from '../auth/roles';
import { isLocked } from '../sign/sign';
import { openOcrScanner } from '../components/OcrModal';
import { bindVoice } from '../components/Voice';
import { photosBlock } from './session/photos';
import { itemOn, loadSessionData } from '../domain/session';

// ---------- Biểu mẫu nhập số đo ----------
const PHASE_KEY = 'tbd.phase';

/** Số đo lần trước → ô so sánh lần này: MOV/kháng `A.Z` → `A.Z_prev`; sứ `A.C1` → `A.C1base`. */
function prevTarget(form: string, key: string): string | null {
  const m = /^([ABC])\.([A-Za-z0-9]+)$/.exec(key);
  if (!m || m[2] === 'note' || m[2] === 't') return null;
  if (form === 'bushing') return m[2] === 'C1' ? `${key}base` : null;
  return `${key}_prev`;
}

export const SessionForm: View = async (_r, el) => {
  const { id, itemId, testId } = params();
  const d = await loadSessionData(id);
  const item = getItem(itemId);
  const test = getTest(itemId, testId);
  const form = formFor(itemId, testId);
  if (!d || !item || !test || !form) {
    setTop('Không tìm thấy', { back: '#/sessions' });
    el.innerHTML = '<p>Không tìm thấy biểu mẫu.</p>';
    return;
  }
  const { session: s, profile: p } = d;
  setTop(`${item.id.slice(2)} ${test.title.replace(/^[A-D]\.\s*/, '')}`, { back: `#/session/${s.id}`, sub: `${p.bank} · ${fmtDate(s.date)}` });
  if (!itemOn(s, itemId)) {
    const canOn = can('session.edit') && !(await isLocked(s.id));
    el.innerHTML = `${callout({ level: 'info', text: `Hạng mục **${item.id.slice(2)}. ${item.title}** không thực hiện trong phiên này nên vùng nhập số liệu đang ẩn.` })}
      <div class="btn-row">${canOn ? '<button class="btn" type="button" id="on">✓ Thực hiện hạng mục này</button>' : ''}<a class="btn secondary" href="#/session/${esc(s.id)}">← Về phiên</a></div>`;
    el.querySelector('#on')?.addEventListener('click', async () => {
      await db.sessions.update(s.id, { items: [...(s.items ?? []), itemId] });
      go(location.hash);
    });
    return;
  }
  const values: Values = { ...(await getValues(s.id, itemId, testId)), __item: itemId, __test: testId };
  let phase: Phase = ((sessionStorage.getItem(PHASE_KEY) as Phase) || 'A') as Phase;
  if (!PHASES.includes(phase)) phase = 'A';
  const prevS = await previousSession(s, itemId, testId);
  const prev = prevS ? await getValues(prevS.id, itemId, testId) : undefined;
  const canPrev = !!prevS && ['mov', 'reactor', 'bushing'].includes(test.form!);
  const ctrlRoom = test.form === 'inject';
  const locked = await isLocked(s.id);
  const readOnly = locked || !can('measure.edit');
  const gateMissing = [];
  if (!s.historical) for (const g of gatesFor(itemId, testId)) if (!(await getGateCheck(g, s.id)).confirmedBy) gateMissing.push(getGate(g)?.title ?? g);

  el.innerHTML = `
    ${locked ? callout({ level: 'info', text: '🔒 **Biên bản đã khóa** do Chỉ huy trực tiếp đã ký. Chỉ xem, không sửa được.' }) : !can('measure.edit') ? callout({ level: 'info', text: 'Tài khoản này **chỉ xem**, không nhập được số đo.' }) : ''}
    ${gateMissing.length && !readOnly ? callout({ level: 'warn', text: `Chưa xác nhận: ${gateMissing.join('; ')}.` }) : ''}
    <div class="row mt-12">
      ${form.phased ? `<div class="seg" role="group" aria-label="Pha">${PHASES.map((x) => `<button type="button" data-ph="${x}" aria-pressed="${x === phase}">${x}</button>`).join('')}</div>` : '<span></span>'}
      ${stepsOf(test).length ? `<a class="btn secondary" href="#/item/${itemId}/test/${testId}/step/1">▶ Từng bước</a>` : ''}
    </div>
    <div class="btn-row">
      ${canPrev && !readOnly ? `<button class="btn secondary" type="button" id="prev">↺ Lấy số lần trước (${esc(fmtDate(prevS!.date))})</button>` : ''}
      ${ctrlRoom ? '<button class="btn secondary" type="button" id="ctrl" aria-pressed="false">🖥 Phòng điều khiển</button>' : ''}
      ${readOnly ? '' : '<button class="btn secondary voice-only" type="button" id="voice-run">🎤 Đọc số liên tiếp</button>'}
    </div>
    <div id="body"></div>
    <h2>Kết quả</h2><div id="rows"></div>
    <h2>Ảnh hiện trường – Hạng mục ${item.id.slice(2)}</h2><div data-photos></div>
    <div class="btn-row"><a class="btn block" href="#/session/${esc(s.id)}">✓ Xong – về phiên</a></div>`;

  const body = el.querySelector<HTMLElement>('#body')!;
  bindVoice(body, el.querySelector<HTMLButtonElement>('#voice-run'));
  const rowsEl = el.querySelector<HTMLElement>('#rows')!;
  const pending = new Map<string, string>();
  const writeNow = () => {
    const batch = [...pending];
    pending.clear();
    if (batch.length) db.measurements.bulkPut(batch.map(([k, v]) => ({ id: measId(s.id, itemId, testId, k), sessionId: s.id, itemId, testId, key: k, value: v, ts: Date.now() })));
  };
  const flush = debounce(writeNow, 500);
  // lưu ngay khi rời trang, khóa máy hoặc chuyển app (NF5 – không mất số khi hệ điều hành tắt tab)
  const onHide = () => document.visibilityState === 'hidden' && writeNow();
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', writeNow);
  window.addEventListener(
    'route:leave',
    () => {
      writeNow();
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', writeNow);
    },
    { once: true },
  );

  const refresh = () => {
    paintRows(body, values, p);
    form.live?.(body, values, p, phase);
    const rows = form.rows(values, p, testId, itemId);
    rowsEl.innerHTML = rows.length
      ? `<div class="table-wrap"><table><thead><tr><th>Nội dung</th><th>Giá trị</th><th>Yêu cầu</th><th>KQ</th></tr></thead><tbody>${rows
          .map((r) => `<tr><td>${esc(r.group ? r.group + ' · ' : '')}${esc(r.label)}</td><td>${esc(r.value)}</td><td class="small">${esc(r.expected)}</td><td>${r.result === 'na' ? '' : resBadge(r.result)}</td></tr>`)
          .join('')}</tbody></table></div>`
      : '<p class="muted">Chưa có số liệu.</p>';
  };
  const draw = () => {
    body.innerHTML = form.render(values, p, phase, prev);
    if (readOnly) body.querySelectorAll<HTMLInputElement>('input, select, textarea').forEach((x) => (x.disabled = true));
    refresh();
  };
  body.addEventListener('input', (e) => {
    const t = e.target as HTMLInputElement;
    const k = t.dataset.k;
    if (!k) return;
    values[k] = t.value;
    pending.set(k, t.value);
    flush();
    refresh();
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
        pending.set(targetKey, val);
        flush();
        refresh();
      },
    });
  });
  el.querySelectorAll<HTMLButtonElement>('[data-ph]').forEach((b) =>
    b.addEventListener('click', () => {
      phase = b.dataset.ph as Phase;
      sessionStorage.setItem(PHASE_KEY, phase);
      el.querySelectorAll('[data-ph]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      draw();
    }),
  );
  el.querySelector('#prev')?.addEventListener('click', async () => {
    let c = 0;
    for (const [k, v] of Object.entries(prev!)) {
      const tk = prevTarget(test.form!, k);
      if (!tk || !(v ?? '').trim()) continue;
      values[tk] = v;
      await putValue(s.id, itemId, testId, tk, v);
      c++;
    }
    toast(c ? `Đã lấy ${c} giá trị từ phiên ${fmtDate(prevS!.date)}` : 'Phiên trước không có số liệu');
    draw();
  });
  el.querySelector('#ctrl')?.addEventListener('click', (e) => {
    const b = e.currentTarget as HTMLButtonElement;
    const on = b.getAttribute('aria-pressed') !== 'true';
    b.setAttribute('aria-pressed', String(on));
    b.textContent = on ? '🖥 Phòng điều khiển: BẬT' : '🖥 Phòng điều khiển';
    document.documentElement.style.setProperty('--fs-scale', String(on ? 1.25 : getFontScale()));
    window.addEventListener('route:leave', () => document.documentElement.style.setProperty('--fs-scale', String(getFontScale())), { once: true });
  });
  draw();
  await photosBlock(el, s.id, itemId, readOnly, {
    station: p.station,
    bank: p.bank,
    get phase() {
      return phase;
    },
    itemTitle: `${item.id.slice(2)} ${item.short}`,
  });
};

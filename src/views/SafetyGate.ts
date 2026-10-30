import { getGate } from '../content';
import { can } from '../auth/roles';
import { setTop } from '../components/Chrome';
import { bindTimers, clearTimers, setTimerStart, timerHtml, timerRemaining } from '../components/Timer';
import { parseIsolationTime } from '../calc/isolation';
import { activeSessionId, db, gateScope, getGateCheck, isGateConfirmed, LOCAL_SESSION, saveGateCheck } from '../store/db';
import { callout, esc, fmtTime, rich, toast, vibrate } from '../ui';
import { go, params, type View } from '../router';

const timerKey = (scope: string, gateId: string, checkId: string) => `gate:${scope}:${gateId}:${checkId}`;
export const hhmm = (ts: number) => new Date(ts).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

export const SafetyGate: View = async (r, el) => {
  const gate = getGate(params().gateId);
  // chỉ chấp nhận route nội bộ (chặn javascript:/https: qua ?next=)
  const rawNext = r.query.get('next') || '';
  const next = /^#\/[A-Za-z0-9\-_/?=&%.]*$/.test(rawNext) ? rawNext : '';
  setTop('Cổng an toàn', { back: true });
  if (!gate) {
    el.innerHTML = '<p>Không tìm thấy cổng an toàn.</p>';
    return;
  }
  const scope = gateScope();
  if (gate.id !== 'gate-platform' && !(await isGateConfirmed('gate-platform', scope))) {
    const self = `#/gate/${gate.id}${next ? `?next=${encodeURIComponent(next)}` : ''}`;
    el.innerHTML = `${callout({ level: 'danger', text: 'Phải hoàn tất **cổng an toàn lên sàn tụ** trước.' })}
      <a class="btn block big" href="#/gate/gate-platform?next=${encodeURIComponent(self)}">⚠️ Mở cổng an toàn lên sàn tụ</a>`;
    return;
  }

  if (!can('gate.confirm')) {
    el.innerHTML = `<h1>⚠️ ${esc(gate.title)}</h1>
      ${callout({ level: 'info', text: 'Tài khoản này không xác nhận được cổng an toàn. Trình tự và ngưỡng vẫn xem được ở trang hạng mục.' })}
      <ul class="clean">${gate.checks.map((c) => `<li>☐ ${rich(c.text)}</li>`).join('')}</ul>`;
    return;
  }
  const state = await getGateCheck(gate.id, scope);
  const session = scope !== LOCAL_SESSION ? await db.sessions.get(scope) : undefined;
  const people = session ? [session.leader, ...session.members].filter(Boolean) : [];

  const draw = () => {
    const confirmed = !!state.confirmedBy;
    el.innerHTML = `
      <h1>⚠️ ${esc(gate.title)}</h1>
      ${scope === LOCAL_SESSION ? '<p class="small muted">Chế độ tra cứu (chưa chọn phiên TN) – xác nhận có hiệu lực 12 giờ trên máy này.</p>' : `<p class="small muted">Phiên: <b>${esc(session?.profileId ?? '')}</b></p>`}
      ${confirmed ? callout({ level: 'info', text: `Đã xác nhận bởi **${state.confirmedBy}** lúc ${fmtTime(state.timestamp!)}.` }) : ''}
      <div id="checks">${gate.checks
        .map((c) => {
          const tk = timerKey(scope, gate.id, c.id);
          const locked = !!c.timer && timerRemaining(tk, c.timer) !== 0 && !state.items[c.id];
          const tm = state.timed?.[c.id];
          const since = tm && timerRemaining(tk, c.timer ?? 0) != null ? `<p class="small">⏱ Cô lập từ <b>${esc(hhmm(tm.at))}</b>${tm.manual ? ' (nhập tay theo phiếu công tác/nhật ký vận hành)' : ''}</p>` : '';
          return `<div><label class="check${locked ? ' disabled' : ''}"><input type="checkbox" data-id="${c.id}"${state.items[c.id] ? ' checked' : ''}${locked || confirmed ? ' disabled' : ''}><span>${rich(c.text)}${c.timer ? ' <span class="small muted">(tích được khi hết giờ)</span>' : ''}</span></label>
          ${since}
          ${c.timer && !confirmed ? timerHtml(tk, c.timer, 'Bấm "Bắt đầu" ngay khi đã cô lập tụ') : ''}
          ${
            c.timer && !confirmed && !state.items[c.id]
              ? `<details class="card"><summary>Tụ đã cô lập từ trước?</summary>
                  <p class="small">Nhập <b>giờ cô lập thực tế</b> theo phiếu công tác / nhật ký vận hành. Đủ ${Math.round(c.timer / 60)} phút thì mở khóa ngay, chưa đủ thì đếm phần còn lại. Giờ này được ghi vào biên bản.</p>
                  <div style="display:grid;grid-template-columns:1fr auto;gap:8px"><input type="time" data-iso-time="${c.id}" aria-label="Giờ cô lập"><button class="btn secondary" type="button" data-iso="${c.id}">Dùng giờ này</button></div>
                </details>`
              : ''
          }</div>`;
        })
        .join('')}</div>
      <label class="field"><span>Người xác nhận</span>
        ${
          people.length
            ? `<select id="who"${confirmed ? ' disabled' : ''}><option value="">— Chọn —</option>${people.map((p) => `<option${p === state.confirmedBy ? ' selected' : ''}>${esc(p)}</option>`).join('')}</select>`
            : `<input id="who" type="text" placeholder="Tên chỉ huy trực tiếp" value="${esc(state.confirmedBy ?? '')}"${confirmed ? ' disabled' : ''} autocomplete="name">`
        }
      </label>
      ${
        confirmed
          ? `<div class="btn-row">${next ? `<a class="btn big" href="${esc(next)}">TIẾP TỤC ▶</a>` : ''}<button class="btn secondary" type="button" id="reset">Làm lại checklist</button></div>`
          : `<button class="btn block big" type="button" id="confirm" disabled>XÁC NHẬN – VÀO TRÌNH TỰ</button>
             <p class="small muted" id="hint"></p>`
      }`;
    wire();
  };

  const allOk = () => gate.checks.every((c) => state.items[c.id]);
  const refreshBtn = () => {
    const btn = el.querySelector<HTMLButtonElement>('#confirm');
    if (!btn) return;
    const who = (el.querySelector<HTMLInputElement | HTMLSelectElement>('#who')?.value ?? '').trim();
    const missing = gate.checks.filter((c) => !state.items[c.id]).length;
    btn.disabled = !(allOk() && who);
    el.querySelector('#hint')!.textContent = missing ? `Còn ${missing} mục chưa tích.` : who ? '' : 'Nhập/chọn người xác nhận.';
  };

  const wire = () => {
    el.querySelector('#checks')?.addEventListener('change', async (e) => {
      const t = e.target as HTMLInputElement;
      if (!t.dataset.id) return;
      state.items[t.dataset.id] = t.checked;
      await saveGateCheck(state);
      refreshBtn();
    });
    el.querySelector('#who')?.addEventListener('input', refreshBtn);
    el.querySelector('#who')?.addEventListener('change', refreshBtn);
    el.querySelector('#confirm')?.addEventListener('click', async () => {
      if (!allOk()) return;
      state.confirmedBy = (el.querySelector<HTMLInputElement | HTMLSelectElement>('#who')!.value ?? '').trim();
      state.timestamp = Date.now();
      await saveGateCheck(state);
      vibrate(80);
      toast('✓ Đã xác nhận cổng an toàn');
      if (next) go(next);
      else draw();
    });
    el.querySelector('#reset')?.addEventListener('click', async () => {
      if (!confirm('Làm lại checklist? Toàn bộ mục đã tích sẽ bị xóa.')) return;
      state.items = {};
      delete state.confirmedBy;
      delete state.timestamp;
      delete state.timed;
      clearTimers(`gate:${scope}:${gate.id}:`);
      await saveGateCheck(state);
      draw();
    });
    el.querySelectorAll<HTMLButtonElement>('[data-iso]').forEach((b) =>
      b.addEventListener('click', async () => {
        const c = gate.checks.find((x) => x.id === b.dataset.iso)!;
        const val = el.querySelector<HTMLInputElement>(`[data-iso-time="${c.id}"]`)!.value;
        const r = parseIsolationTime(val);
        if (!r.ok) return toast(r.error);
        const enough = r.agoMin >= Math.round(c.timer! / 60);
        if (!confirm(`Xác nhận tụ đã cô lập từ ${hhmm(r.at)} (${r.agoMin} phút trước)?\n${enough ? 'Đã đủ thời gian – mục sẽ được mở khóa.' : 'Chưa đủ – app đếm phần còn lại.'}\nGiờ này được ghi vào biên bản là "nhập tay".`)) return;
        setTimerStart(timerKey(scope, gate.id, c.id), r.at);
        state.timed = { ...state.timed, [c.id]: { at: r.at, manual: true } };
        await saveGateCheck(state);
        if (enough) toast('⏱ Đủ thời gian cô lập – có thể tích mục này');
        draw();
      }),
    );
    bindTimers(el, (key) => {
      // hết giờ → mở khóa ô tích tương ứng; đặt lại → khóa lại
      const reset = key.startsWith('reset:');
      const k = reset ? key.slice(6) : key;
      const c = gate.checks.find((x) => timerKey(scope, gate.id, x.id) === k);
      if (!c) return;
      const box = el.querySelector<HTMLInputElement>(`input[data-id="${c.id}"]`)!;
      if (reset) {
        // bấm Bắt đầu/Đặt lại → mốc cô lập = bây giờ (không phải nhập tay)
        state.items[c.id] = false;
        box.checked = false;
        state.timed = { ...state.timed, [c.id]: { at: Date.now(), manual: false } };
        saveGateCheck(state);
      }
      box.disabled = reset;
      box.closest('.check')!.classList.toggle('disabled', reset);
      if (!reset) toast('⏱ Đủ thời gian cô lập – có thể tích mục này');
      refreshBtn();
    });
    refreshBtn();
  };
  draw();
};

/** Trả về cổng chưa xác nhận đầu tiên trong danh sách (hoặc null). */
export async function firstOpenGate(gateIds: string[]): Promise<string | null> {
  const scope = activeSessionId() ?? LOCAL_SESSION;
  for (const g of gateIds) if (!(await isGateConfirmed(g, scope))) return g;
  return null;
}

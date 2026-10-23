import { getGate } from '../content';
import { setTop } from '../components/Chrome';
import { bindTimers, clearTimers, timerHtml, timerRemaining } from '../components/Timer';
import { activeSessionId, db, gateScope, getGateCheck, isGateConfirmed, LOCAL_SESSION, saveGateCheck } from '../store/db';
import { callout, esc, fmtTime, rich, toast, vibrate } from '../ui';
import { go, params, type View } from '../router';

const timerKey = (scope: string, gateId: string, checkId: string) => `gate:${scope}:${gateId}:${checkId}`;

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
          return `<div><label class="check${locked ? ' disabled' : ''}"><input type="checkbox" data-id="${c.id}"${state.items[c.id] ? ' checked' : ''}${locked || confirmed ? ' disabled' : ''}><span>${rich(c.text)}${c.timer ? ' <span class="small muted">(tích được khi hết giờ)</span>' : ''}</span></label>
          ${c.timer && !confirmed ? timerHtml(tk, c.timer, 'Bấm "Bắt đầu" ngay khi đã cô lập tụ') : ''}</div>`;
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
      clearTimers(`gate:${scope}:${gate.id}:`);
      await saveGateCheck(state);
      draw();
    });
    bindTimers(el, (key) => {
      // hết giờ → mở khóa ô tích tương ứng; đặt lại → khóa lại
      const reset = key.startsWith('reset:');
      const k = reset ? key.slice(6) : key;
      const c = gate.checks.find((x) => timerKey(scope, gate.id, x.id) === k);
      if (!c) return;
      const box = el.querySelector<HTMLInputElement>(`input[data-id="${c.id}"]`)!;
      if (reset) {
        state.items[c.id] = false;
        box.checked = false;
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

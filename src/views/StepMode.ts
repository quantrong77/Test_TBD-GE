import { getItem, getTest, gatesFor } from '../content';
import { setTop } from '../components/Chrome';
import { bindTimers, timerHtml, timerRemaining } from '../components/Timer';
import { activeSessionId, gateScope } from '../store/db';
import { callout, esc, figure, rich, vibrate } from '../ui';
import { go, params, type View } from '../router';
import { firstOpenGate } from './SafetyGate';
import type { Step, Test } from '../types';

export const stepsOf = (t: Test): (Step & { lock?: boolean })[] =>
  t.steps ?? (t.checklist ?? []).map((c, i) => ({ n: i + 1, text: `Kiểm tra: ${c}` }));

const progressKey = (item: string, test: string) => `tbd.steps.${gateScope()}.${item}.${test}`;
function loadDone(k: string): number[] {
  try {
    return JSON.parse(localStorage.getItem(k) || '[]');
  } catch {
    return [];
  }
}
function saveDone(k: string, v: number[]) {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* bỏ qua */
  }
}

export const StepMode: View = async (_r, el) => {
  const { itemId, testId } = params();
  const item = getItem(itemId);
  const test = getTest(itemId, testId);
  if (!item || !test) {
    setTop('Không tìm thấy', { back: '#/' });
    el.innerHTML = '<p>Phép thử không tồn tại.</p>';
    return;
  }
  const here = location.hash;
  const open = await firstOpenGate(gatesFor(itemId, testId));
  if (open) {
    history.replaceState(null, '', `#/gate/${open}?next=${encodeURIComponent(here)}`);
    go(location.hash);
    return;
  }

  const steps = stepsOf(test);
  if (!steps.length) {
    const sid0 = activeSessionId();
    setTop(test.title, { back: `#/item/${itemId}` });
    el.innerHTML = `<p>Phép thử này không có trình tự từng bước – xem bảng tra cứu và nhập kết quả.</p>
      <div class="btn-row"><a class="btn" href="#/item/${itemId}?test=${testId}">Xem hạng mục</a>${sid0 ? `<a class="btn secondary" href="#/session/${esc(sid0)}/form/${itemId}/${testId}">📝 Nhập kết quả</a>` : ''}</div>`;
    return;
  }
  const idx = Math.min(Math.max(Number(params().n) || 1, 1), steps.length) - 1;
  const step = steps[idx];
  const base = `#/item/${itemId}/test/${testId}/step/`;
  const pk = progressKey(itemId, testId);
  const done = new Set(loadDone(pk));
  const sid = activeSessionId();
  const isLast = idx === steps.length - 1;
  const finish = sid ? `#/session/${sid}/form/${itemId}/${testId}` : `#/item/${itemId}?test=${testId}`;
  const tKey = `step:${gateScope()}:${itemId}:${testId}:${step.n}`;

  document.body.classList.add('immersive');
  setTop(test.title.replace(/^[A-D]\.\s*/, ''), { close: `#/item/${itemId}`, sub: `${item.id} · Bước ${idx + 1}/${steps.length}` });
  const eqLink = step.equip ? `<a class="btn secondary" href="#/equipment/${esc(step.equip)}">🧰 Xem máy</a>` : '';
  el.innerHTML = `
    <div class="stepbar" role="progressbar" aria-valuemin="1" aria-valuemax="${steps.length}" aria-valuenow="${idx + 1}"><i style="width:${((idx + 1) / steps.length) * 100}%"></i></div>
    ${idx === 0 ? (test.callouts ?? []).map(callout).join('') : ''}
    <p class="step-text">${done.has(step.n) ? '✅ ' : ''}${rich(step.text)}</p>
    ${step.img ? figure(step.img, 'step') : ''}
    ${step.note ? callout({ level: 'info', text: step.note }) : ''}
    ${step.timer ? timerHtml(tKey, step.timer, step.lock ? 'Nút tiếp chỉ bấm được khi hết giờ' : 'Đếm thời gian chờ') : ''}
    ${step.record ? `<p><span class="rec">Ghi: ${esc(step.record)}</span></p>` : ''}
    <div class="btn-row">${eqLink}${step.record && sid ? `<a class="btn secondary" href="#/session/${esc(sid)}/form/${itemId}/${testId}">📝 Nhập số đo</a>` : ''}</div>
    ${step.record && !sid ? '<p class="small muted">Tạo/chọn phiên TN (tab Phiên TN) để ghi số đo vào biên bản.</p>' : ''}
    <div class="step-foot">
      <a class="btn secondary big" ${idx === 0 ? 'aria-disabled="true" tabindex="-1"' : `href="${base}${idx}"`}>◀ Trước</a>
      <button class="btn big" type="button" id="next">${isLast ? '✓ HOÀN THÀNH' : '✓ XONG – TIẾP ▶'}</button>
    </div>`;

  const nextBtn = el.querySelector<HTMLButtonElement>('#next')!;
  const lockOn = () => !!step.lock && !!step.timer && timerRemaining(tKey, step.timer) !== 0;
  nextBtn.disabled = lockOn();
  bindTimers(el, () => (nextBtn.disabled = lockOn()));
  nextBtn.addEventListener('click', () => {
    if (lockOn()) return;
    done.add(step.n);
    saveDone(pk, [...done]);
    vibrate(30);
    go(isLast ? finish : `${base}${idx + 2}`);
  });
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight' && !nextBtn.disabled) nextBtn.click();
    if (e.key === 'ArrowLeft' && idx > 0) go(`${base}${idx}`);
  };
  document.addEventListener('keydown', onKey);
  window.addEventListener('route:leave', () => document.removeEventListener('keydown', onKey), { once: true });
};

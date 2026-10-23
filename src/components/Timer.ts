import { esc, vibrate } from '../ui';

/**
 * Đồng hồ đếm ngược tính theo timestamp (không theo số lần setInterval),
 * nên vẫn đúng khi khóa màn hình hoặc tải lại trang. Mốc bắt đầu lưu ở localStorage theo `key`.
 */
const PREFIX = 'tbd.timer.';

export function timerStart(key: string): number | null {
  try {
    const v = localStorage.getItem(PREFIX + key);
    return v ? Number(v) : null;
  } catch {
    return null;
  }
}

export function setTimerStart(key: string, ts: number | null) {
  try {
    if (ts == null) localStorage.removeItem(PREFIX + key);
    else localStorage.setItem(PREFIX + key, String(ts));
  } catch {
    /* bỏ qua */
  }
}

/** Mốc bắt đầu quá 12 giờ coi như chưa bắt đầu – không cho đồng hồ cũ mở khóa cổng an toàn. */
const STALE_MS = 12 * 3600 * 1000;

export function timerRemaining(key: string, seconds: number): number | null {
  const s = timerStart(key);
  if (s == null || Date.now() - s > STALE_MS || s > Date.now()) return null;
  return Math.max(0, seconds * 1000 - (Date.now() - s));
}

/** Xóa mọi đồng hồ có khóa bắt đầu bằng prefix (vd khi làm lại cổng an toàn). */
export function clearTimers(prefix: string) {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith(PREFIX + prefix)) localStorage.removeItem(k);
  } catch {
    /* bỏ qua */
  }
}

const mmss = (ms: number) => {
  const t = Math.ceil(ms / 1000);
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};

export function timerHtml(key: string, seconds: number, label: string): string {
  return `<div class="timer" data-timer="${esc(key)}" data-seconds="${seconds}">
    <span aria-hidden="true">⏱</span><span class="t" aria-live="off">${mmss(seconds * 1000)}</span>
    <span class="small lbl">${esc(label)}</span>
    <button type="button" class="btn secondary" data-act="start">Bắt đầu</button>
  </div>`;
}

let ticker: number | undefined;
window.addEventListener('route:leave', () => window.clearInterval(ticker));

/** Kích hoạt mọi [data-timer] trong root. onDone(key) gọi một lần khi hết giờ. */
export function bindTimers(root: HTMLElement, onDone?: (key: string) => void) {
  const els = [...root.querySelectorAll<HTMLElement>('[data-timer]')];
  if (!els.length) return;
  const fired = new Set<string>();
  const update = () => {
    for (const el of els) {
      const key = el.dataset.timer!;
      const sec = Number(el.dataset.seconds);
      const rem = timerRemaining(key, sec);
      const t = el.querySelector('.t')!;
      const btn = el.querySelector<HTMLButtonElement>('[data-act="start"]')!;
      if (rem == null) {
        t.textContent = mmss(sec * 1000);
        btn.textContent = 'Bắt đầu';
        el.classList.remove('done');
        continue;
      }
      btn.textContent = 'Đặt lại';
      t.textContent = rem > 0 ? mmss(rem) : '✓ Hết giờ';
      el.classList.toggle('done', rem === 0);
      if (rem === 0 && !fired.has(key)) {
        fired.add(key);
        vibrate([200, 100, 200]);
        onDone?.(key);
      }
    }
  };
  for (const el of els) {
    el.querySelector('[data-act="start"]')!.addEventListener('click', () => {
      const key = el.dataset.timer!;
      fired.delete(key);
      setTimerStart(key, Date.now());
      onDone?.('reset:' + key);
      update();
    });
  }
  // hết giờ từ trước khi render → coi như đã báo
  for (const el of els) {
    if (timerRemaining(el.dataset.timer!, Number(el.dataset.seconds)) === 0) fired.add(el.dataset.timer!);
  }
  update();
  window.clearInterval(ticker);
  ticker = window.setInterval(update, 500);
}

export type Theme = 'auto' | 'light' | 'dark' | 'contrast' | 'nightred';
export type EffectiveTheme = Exclude<Theme, 'auto'>;

/** Màu thanh trạng thái hệ điều hành (meta theme-color) – khớp --c-bar của từng chủ đề. */
export const THEME_BAR: Record<EffectiveTheme, string> = {
  light: '#0b4f8a',
  dark: '#16232f',
  contrast: '#ffd600',
  nightred: '#140404',
};

const get = (k: string) => {
  try {
    return localStorage.getItem('tbd.' + k);
  } catch {
    return null;
  }
};
const set = (k: string, v: string) => {
  try {
    localStorage.setItem('tbd.' + k, v);
  } catch {
    /* bỏ qua */
  }
};

export const getTheme = (): Theme => (get('theme') as Theme) || 'auto';
export const getFontScale = (): number => Number(get('fontScale')) || 1;

const mqDark = window.matchMedia('(prefers-color-scheme: dark)');
const mqMore = window.matchMedia('(prefers-contrast: more)');

/** "Theo máy": bật tăng tương phản trong hệ điều hành → Nắng gắt; chế độ tối → Ca đêm. */
export function effectiveTheme(t: Theme = getTheme()): EffectiveTheme {
  if (t !== 'auto') return t;
  if (mqMore.matches) return 'contrast';
  return mqDark.matches ? 'dark' : 'light';
}

// Giữ đồng bộ với public/theme-boot.js (chạy trước khi vẽ trang để tránh nháy màu)
export function applySettings() {
  const eff = effectiveTheme();
  document.documentElement.dataset.theme = eff;
  document.documentElement.style.setProperty('--fs-scale', String(getFontScale()));
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_BAR[eff]);
}
mqDark.addEventListener?.('change', applySettings);
mqMore.addEventListener?.('change', applySettings);

export function setTheme(t: Theme) {
  set('theme', t);
  applySettings();
}
export function setFontScale(s: number) {
  set('fontScale', String(s));
  applySettings();
}

export const isOfflineReady = () => get('offlineReady') === '1' || !!navigator.serviceWorker?.controller;
export const markOfflineReady = () => set('offlineReady', '1');

/**
 * Trạng thái bộ nhớ offline (service worker đã lưu toàn bộ app + ảnh), dùng ở Trang chủ và Cài đặt.
 * Không liên quan tới đồng bộ dữ liệu với máy chủ.
 */
export function offlineStatus(): { ok: boolean; text: string } {
  if (import.meta.env.DEV) return { ok: true, text: 'Bản phát triển (npm run dev) – không bật bộ nhớ offline; bản đã triển khai thì có' };
  if (isOfflineReady()) return { ok: true, text: 'Sẵn sàng offline' };
  if (!('serviceWorker' in navigator)) return { ok: false, text: 'Trình duyệt không hỗ trợ dùng offline' };
  return navigator.onLine
    ? { ok: false, text: 'Đang tải dữ liệu offline… (giữ app mở khi có mạng)' }
    : { ok: false, text: 'Chưa tải xong dữ liệu offline – mở app khi có mạng' };
}

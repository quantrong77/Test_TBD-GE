export type Theme = 'auto' | 'light' | 'dark' | 'contrast';

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

const mq = window.matchMedia('(prefers-color-scheme: dark)');

export function applySettings() {
  const t = getTheme();
  const eff = t === 'auto' ? (mq.matches ? 'dark' : 'light') : t;
  document.documentElement.dataset.theme = eff;
  document.documentElement.style.setProperty('--fs-scale', String(getFontScale()));
  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute('content', eff === 'contrast' ? '#000000' : eff === 'dark' ? '#0e1116' : '#0B4F8A');
}
mq.addEventListener?.('change', applySettings);

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

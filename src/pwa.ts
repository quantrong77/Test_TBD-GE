import { registerSW } from 'virtual:pwa-register';
import { toast } from './ui';
import { markOfflineReady } from './settings';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferred = e as BeforeInstallPromptEvent;
  listeners.forEach((f) => f());
});
window.addEventListener('appinstalled', () => {
  deferred = null;
  toast('Đã cài app vào màn hình chính');
});

export const canInstall = () => !!deferred;
export const onInstallable = (f: () => void) => listeners.add(f);
export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

export async function promptInstall() {
  if (!deferred) return false;
  await deferred.prompt();
  const r = await deferred.userChoice;
  deferred = null;
  return r.outcome === 'accepted';
}

export function initPwa() {
  if (!('serviceWorker' in navigator)) return;
  const update = registerSW({
    onNeedRefresh() {
      toast('Có phiên bản mới', { label: 'Tải lại', run: () => update(true) });
    },
    onOfflineReady() {
      markOfflineReady();
      toast('✓ Sẵn sàng dùng offline');
      window.dispatchEvent(new Event('offline-ready'));
    },
  });
}

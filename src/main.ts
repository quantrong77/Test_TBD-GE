import './polyfills';
import './styles/tokens.css';
import './styles/base.css';
import { go, onRendered, onRoute, render, route, setGuard, setNotFound, start } from './router';
import { renderNav, setTop } from './components/Chrome';
import { bindViewer } from './components/ImageViewer';
import { applySettings } from './settings';
import { initPwa } from './pwa';
import { Home, ItemsList } from './views/Home';
import { About, Cycle, Overview, Safety, Tools } from './views/Lookup';
import { ItemView } from './views/Item';
import { StepMode } from './views/StepMode';
import { SafetyGate } from './views/SafetyGate';
import { EquipmentView } from './views/Equipment';
import { Thresholds } from './views/Thresholds';
import { Search } from './views/Search';
import { Instruments, ProfileEdit, Profiles, Sessions } from './views/Sessions';
import { SessionNew } from './views/SessionNew';
import { StaffList, Units } from './views/Org';
import { SessionForm } from './views/Session';
import { SessionView } from './views/session/SessionView';
import { CalcUnbalance } from './views/CalcUnbalance';
import { TrendView } from './views/Trend';
import { Settings } from './views/Settings';
import { Help, Info } from './views/Info';
import { Users } from './views/Users';
import { Admin } from './views/Admin';
import { Account, Login, Register } from './views/Auth';
import { AUTH_PAGES, authState, guard } from './auth/gate';
import { initAuthNotifications } from './auth/notify';
import { initUserMenu } from './components/UserMenu';
import { isMember } from './auth/roles';
import { bootSync } from './sync/status';
import { toast } from './ui';

applySettings();

route('', Home);
route('items', ItemsList);
route('overview/:deviceId?', Overview);
route('safety', Safety);
route('tools', Tools);
route('cycle', Cycle);
route('about', About);
route('item/:itemId', ItemView);
route('item/:itemId/test/:testId/step/:n', StepMode);
route('gate/:gateId', SafetyGate);
route('thresholds', Thresholds);
route('search', Search);
route('equipment/:eqId?/:section?', EquipmentView);
route('sessions', Sessions);
route('session-new', SessionNew);
route('session/:id', SessionView);
route('session/:id/form/:itemId/:testId', SessionForm);
route('profiles', Profiles);
route('profile/:id', ProfileEdit);
route('instruments', Instruments);
route('units', Units);
route('staff', StaffList);
route('calc/unbalance', CalcUnbalance);
route('trend/:profileId?', TrendView);
route('settings', Settings);
route('help', Help);
route('info', Info);
route('users', Users);
route('admin', Admin);
route('login', Login);
route('register', Register);
route('account', Account);
setNotFound((_r, el) => {
  setTop('Không tìm thấy', { back: '#/' });
  el.innerHTML = '<p>Trang không tồn tại. <a href="#/">Về trang chủ</a></p>';
});

// Bắt buộc đăng nhập (khi đã cấu hình máy chủ): mọi trang đi qua cổng trước khi hiển thị
setGuard(guard);
onRoute((r) => {
  const auth = AUTH_PAGES.includes(r.path[0] ?? '');
  document.body.classList.toggle('auth-mode', auth);
  if (!auth) renderNav(r.raw);
});
// trình xem ảnh phải gắn khi trang mới đã nằm trong DOM
onRendered(() => bindViewer());
initUserMenu();
start();
initPwa();
void bootSync();
// Thông báo đăng nhập / đăng xuất / được duyệt / bị khóa / mất mạng (auth/notify.ts) – đăng ký trước để chạy trước khi vẽ lại
initAuthNotifications();
// Trạng thái tài khoản đổi (đăng nhập, gửi đăng ký, được duyệt, bị khóa, đăng xuất, phiên hết hạn) → vẽ lại qua cổng
let lastAuth = authState();
window.addEventListener('auth:changed', () => {
  const st = authState();
  if (st === lastAuth) return;
  const was = lastAuth;
  lastAuth = st;
  if (st === 'ok' && was !== 'ok') {
    void import('./sync/backend').then(async ({ loadBackend }) => {
      const m = await loadBackend();
      const { getMe } = await import('./auth/roles');
      if (isMember(getMe())) m.startAuto();
    });
  } else if (was === 'ok') {
    void import('./sync/backend').then(async ({ loadBackend }) => (await loadBackend()).stopAuto());
  }
  void render();
});
window.addEventListener('auth:error', (e) => toast('Đăng nhập không thành công: ' + (e as CustomEvent<string>).detail, undefined, 6000));
window.addEventListener('sync:applied', (e) => {
  const n = (e as CustomEvent<number>).detail;
  toast(`Đã nhận ${n} thay đổi từ đội`, { label: 'Xem', run: () => go(location.hash) });
});
navigator.storage?.persist?.().catch(() => undefined);

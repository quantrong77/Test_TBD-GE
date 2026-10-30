import './styles/tokens.css';
import './styles/base.css';
import { go, onRendered, onRoute, route, setNotFound, start } from './router';
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
import { Instruments, ProfileEdit, Profiles, SessionNew, Sessions } from './views/Sessions';
import { SessionForm, SessionView } from './views/Session';
import { CalcUnbalance } from './views/CalcUnbalance';
import { Settings } from './views/Settings';
import { Help, Info } from './views/Info';
import { Users } from './views/Users';
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
route('calc/unbalance', CalcUnbalance);
route('settings', Settings);
route('help', Help);
route('info', Info);
route('users', Users);
setNotFound((_r, el) => {
  setTop('Không tìm thấy', { back: '#/' });
  el.innerHTML = '<p>Trang không tồn tại. <a href="#/">Về trang chủ</a></p>';
});

onRoute((r) => renderNav(r.raw));
// trình xem ảnh phải gắn khi trang mới đã nằm trong DOM
onRendered(() => bindViewer());
start();
initPwa();
void bootSync();
window.addEventListener('auth:error', (e) => toast('Đăng nhập không thành công: ' + (e as CustomEvent<string>).detail, undefined, 6000));
window.addEventListener('sync:applied', (e) => {
  const n = (e as CustomEvent<number>).detail;
  toast(`Đã nhận ${n} thay đổi từ đội`, { label: 'Xem', run: () => go(location.hash) });
});
navigator.storage?.persist?.().catch(() => undefined);

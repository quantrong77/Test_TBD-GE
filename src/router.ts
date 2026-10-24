export interface Route {
  path: string[];
  query: URLSearchParams;
  raw: string;
}

export type View = (r: Route, el: HTMLElement) => void | Promise<void>;

interface Entry {
  pattern: string[];
  view: View;
}

const routes: Entry[] = [];
let notFound: View = () => {};
let onChange: (r: Route) => void = () => {};

/** Đăng ký route dạng 'item/:id/test/:tid'. Tham số đọc qua params(). */
export function route(pattern: string, view: View) {
  routes.push({ pattern: pattern.split('/').filter(Boolean), view });
}
export const setNotFound = (v: View) => (notFound = v);
export const onRoute = (fn: (r: Route) => void) => (onChange = fn);

export function parse(hash = location.hash): Route {
  const raw = hash.replace(/^#\/?/, '');
  const [p, q = ''] = raw.split('?');
  return { path: p.split('/').filter(Boolean).map(decodeURIComponent), query: new URLSearchParams(q), raw };
}

let current: Record<string, string> = {};
export const params = () => current;

function match(r: Route): Entry | undefined {
  for (const e of routes) {
    // phân đoạn cuối có thể tùy chọn khi viết ':name?'
    const req = e.pattern.filter((s) => !s.endsWith('?')).length;
    if (r.path.length < req || r.path.length > e.pattern.length) continue;
    const ps: Record<string, string> = {};
    let ok = true;
    for (let i = 0; i < e.pattern.length; i++) {
      const seg = e.pattern[i];
      const val = r.path[i];
      if (seg.startsWith(':')) {
        if (val != null) ps[seg.slice(1).replace('?', '')] = val;
      } else if (seg !== val) {
        ok = false;
        break;
      }
    }
    if (ok) {
      current = ps;
      return e;
    }
  }
  return undefined;
}

async function doRender() {
  const app = document.getElementById('app')!;
  const r = parse();
  const samePage = r.raw === lastRaw;
  const y = samePage ? window.scrollY : popY ?? 0;
  popY = null;
  document.body.classList.remove('immersive');
  window.dispatchEvent(new Event('route:leave'));
  const e = match(r);
  onChange(r);
  // Dựng trang mới vào khung riêng; trang cũ vẫn hiển thị cho tới khi xong → không chớp trống
  const host = document.createElement('div');
  await (e ? e.view(r, host) : notFound(r, host));
  app.replaceChildren(host);
  lastRaw = r.raw;
  // trang mới → lên đầu; quay lại → về vị trí cũ; vẽ lại cùng trang → giữ nguyên
  window.scrollTo(0, y);
  afterRender.forEach((f) => f(host));
}

let lastRaw: string | null = null;
let popY: number | null = null;
const afterRender: ((host: HTMLElement) => void)[] = [];
/** Chạy sau khi trang mới đã gắn vào DOM (vd gắn trình xem ảnh). */
export const onRendered = (f: (host: HTMLElement) => void) => afterRender.push(f);

function rememberScroll() {
  try {
    history.replaceState({ ...(history.state ?? {}), y: Math.round(window.scrollY) }, '');
  } catch {
    /* bỏ qua */
  }
}

// Render tuần tự: view async (đọc IndexedDB) của trang cũ không được ghi đè trang mới
let chain: Promise<void> = Promise.resolve();
export function render(): Promise<void> {
  chain = chain.then(doRender).catch((err) => console.error(err));
  return chain;
}

export function go(hash: string) {
  if (location.hash === hash) render();
  else {
    rememberScroll();
    location.hash = hash;
  }
}

export function start() {
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  // lưu vị trí cuộn vào mục lịch sử hiện tại; nút Quay lại (popstate) đọc lại
  let t: number | undefined;
  window.addEventListener('scroll', () => {
    window.clearTimeout(t);
    t = window.setTimeout(rememberScroll, 120);
  }, { passive: true });
  document.addEventListener('click', (e) => {
    if ((e.target as Element).closest?.('a[href^="#"]')) rememberScroll();
  }, true);
  window.addEventListener('popstate', (e) => {
    popY = typeof e.state?.y === 'number' ? e.state.y : null;
  });
  window.addEventListener('hashchange', render);
  if (!location.hash) history.replaceState(null, '', '#/');
  render();
}

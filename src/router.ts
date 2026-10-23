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
  const el = document.getElementById('app')!;
  const r = parse();
  document.body.classList.remove('immersive');
  window.dispatchEvent(new Event('route:leave'));
  const e = match(r);
  onChange(r);
  el.innerHTML = '';
  await (e ? e.view(r, el) : notFound(r, el));
  window.scrollTo(0, 0);
}

// Render tuần tự: view async (đọc IndexedDB) của trang cũ không được ghi đè trang mới
let chain: Promise<void> = Promise.resolve();
export function render(): Promise<void> {
  chain = chain.then(doRender).catch((err) => console.error(err));
  return chain;
}

export function go(hash: string) {
  if (location.hash === hash) render();
  else location.hash = hash;
}

export function start() {
  window.addEventListener('hashchange', render);
  if (!location.hash) history.replaceState(null, '', '#/');
  render();
}

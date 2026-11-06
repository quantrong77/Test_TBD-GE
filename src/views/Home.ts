import { items } from '../content';
import { setTop } from '../components/Chrome';
import { Icons } from '../components/Icons';
import { isOfflineReady } from '../settings';
import { activeSessionId, db } from '../store/db';
import { esc, fmtDate } from '../ui';
import type { View } from '../router';

export const Home: View = async (_r, el) => {
  setTop('Sổ tay TN Tụ bù dọc GE', { sub: 'TBD-GE Field' });
  const sid = activeSessionId();
  const s = sid ? await db.sessions.get(sid) : undefined;
  const ready = isOfflineReady();
  el.innerHTML = `
    <p class="status-line" id="offline-status"><span class="dot ${ready ? 'ok' : 'warn'}"></span>${ready ? 'Sẵn sàng offline' : 'Đang tải dữ liệu offline… (mở app có mạng lần đầu)'}</p>
    <a class="banner-danger" href="#/safety"><span aria-hidden="true" style="display:flex;align-items:center;font-size:22px">${Icons.hvDanger}</span> AN TOÀN TRƯỚC KHI LÊN SÀN</a>
    ${s ? `<a class="card row" href="#/session/${esc(s.id)}" style="text-decoration:none;color:inherit"><span style="display:flex;align-items:center;gap:6px">${Icons.report} Phiên đang làm: <b>${esc(s.profileId)}</b> · ${esc(fmtDate(s.date))}</span><span class="pill">Mở</span></a>` : ''}
    <div class="grid2">
      ${items
        .map(
          (it, i) => `<a class="tile${it.danger ? ' danger' : ''}${i === items.length - 1 && items.length % 2 ? ' wide' : ''}" href="#/item/${it.id}">
            <span class="code">${i + 1}</span><span class="name">${esc(it.short)}</span></a>`,
        )
        .join('')}
    </div>
    <div class="shortcuts">
      <a href="#/overview"><span class="ico">${Icons.diagram}</span>Tổng quan</a>
      <a href="#/thresholds"><span class="ico">${Icons.gauge}</span>Ngưỡng nhanh</a>
      <a href="#/tools"><span class="ico">${Icons.clamp}</span>Dụng cụ</a>
      <a href="#/equipment"><span class="ico">${Icons.testSet}</span>Máy TN</a>
      <a href="#/cycle"><span class="ico">${Icons.cycle}</span>Chu kỳ</a>
      <a href="#/calc/unbalance"><span class="ico">${Icons.calc}</span>Máy tính ΔC</a>
    </div>`;
  const onReady = () => {
    const st = el.querySelector('#offline-status');
    if (st) st.innerHTML = '<span class="dot ok"></span>Sẵn sàng offline';
  };
  window.addEventListener('offline-ready', onReady, { once: true });
};

export const ItemsList: View = (_r, el) => {
  setTop('7 hạng mục thí nghiệm', { back: '#/' });
  el.innerHTML = `<p class="small muted">Trình tự theo TAB của GE Field Installation Test Plan.</p>
    <ol class="steps">${items
      .map(
        (it) => `<li><span class="n">${it.id.slice(2)}</span><div><a href="#/item/${it.id}"><b>${esc(it.title)}</b></a>${it.danger ? ' <span class="pill danger">⚡ Nguy hiểm</span>' : ''}
        <div class="small muted">${it.tests.map((t) => esc(t.title)).join(' · ')}</div></div></li>`,
      )
      .join('')}</ol>`;
};

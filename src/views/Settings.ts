import { setTop } from '../components/Chrome';
import { getFontScale, getTheme, isOfflineReady, setFontScale, setTheme, type Theme } from '../settings';
import { canInstall, isStandalone, onInstallable, promptInstall } from '../pwa';
import { download } from '../export/report';
import { storageWarning } from '../store/db';
import { CONTENT_VERSION } from '../content';
import { callout, esc, toast } from '../ui';
import type { View } from '../router';
import { fmtFixed } from '../calc/units';

const THEMES: [Theme, string][] = [
  ['auto', 'Theo máy'],
  ['light', 'Sáng'],
  ['dark', 'Tối'],
  ['contrast', 'Tương phản cao'],
];
const SCALES: [number, string][] = [
  [1, 'Chuẩn'],
  [1.15, 'Lớn'],
  [1.3, 'Rất lớn'],
];

export const Settings: View = async (_r, el) => {
  setTop('Cài đặt', { back: true });
  const ready = isOfflineReady();
  let usage = '';
  try {
    const e = await navigator.storage?.estimate?.();
    if (e?.usage != null) usage = `${fmtFixed(e.usage / 1048576, 1)} MB${e.quota ? ` / ${fmtFixed(e.quota / 1048576, 0)} MB` : ''}`;
  } catch {
    /* bỏ qua */
  }
  const warn = await storageWarning();
  el.innerHTML = `
    <h2>Hiển thị</h2>
    <div class="seg" role="group" aria-label="Chủ đề" style="flex-wrap:wrap">${THEMES.map(([t, l]) => `<button type="button" data-theme-btn="${t}" aria-pressed="${getTheme() === t}" style="padding:0 12px">${l}</button>`).join('')}</div>
    <p class="small muted">"Tương phản cao" dùng khi đọc dưới nắng gắt.</p>
    <h3>Cỡ chữ</h3>
    <div class="seg" role="group" aria-label="Cỡ chữ">${SCALES.map(([s, l]) => `<button type="button" data-scale="${s}" aria-pressed="${getFontScale() === s}" style="padding:0 12px">${l}</button>`).join('')}</div>

    <h2>Offline & cài đặt app</h2>
    <p><span class="dot ${ready ? 'ok' : 'warn'}"></span>${ready ? 'Toàn bộ nội dung và hình ảnh đã sẵn sàng offline.' : 'Chưa sẵn sàng offline – mở app khi có mạng và chờ thông báo.'}</p>
    <div id="install"></div>

    <h2>Dữ liệu trên máy</h2>
    ${warn ? callout({ level: 'warn', text: warn }) : ''}
    <p class="small muted">Dữ liệu chỉ nằm trên máy này cho tới khi bạn chủ động xuất. ${usage ? `Đang dùng: ${esc(usage)}.` : ''}</p>
    <div class="btn-row">
      <button class="btn" type="button" id="backup">💾 Sao lưu toàn bộ</button>
      <label class="btn secondary">📂 Khôi phục / nhập JSON<input type="file" accept="application/json,.json" hidden id="restore"></label>
    </div>

    <h2>Thông tin</h2>
    <p class="small">Nội dung v${esc(CONTENT_VERSION)} · Nguồn: bài giảng "Thí nghiệm các thiết bị trên sàn tụ GE", HDSD VAP GE 31F246 (GEK-32329B), QT GAMMA RR10-6R (QT-TNLĐ-VHMTN).</p>
    <p><a href="#/about">Các điểm cần rà soát lại nội dung nguồn →</a></p>
    ${callout({ level: 'warn', text: 'Hình ảnh, sơ đồ có nguồn từ tài liệu kỹ thuật GE và tài liệu đào tạo nội bộ. Chỉ triển khai trên máy chủ nội bộ hoặc trang có kiểm soát truy cập.' })}`;

  el.querySelectorAll<HTMLButtonElement>('[data-theme-btn]').forEach((b) =>
    b.addEventListener('click', () => {
      setTheme(b.dataset.themeBtn as Theme);
      el.querySelectorAll('[data-theme-btn]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    }),
  );
  el.querySelectorAll<HTMLButtonElement>('[data-scale]').forEach((b) =>
    b.addEventListener('click', () => {
      setFontScale(Number(b.dataset.scale));
      el.querySelectorAll('[data-scale]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    }),
  );

  const inst = el.querySelector('#install')!;
  const drawInstall = () => {
    if (isStandalone()) inst.innerHTML = '<p>✓ Đang chạy như app đã cài.</p>';
    else if (canInstall()) {
      inst.innerHTML = '<button class="btn block" type="button" id="inst">📲 Thêm vào màn hình chính</button>';
      inst.querySelector('#inst')!.addEventListener('click', async () => {
        if (await promptInstall()) drawInstall();
      });
    } else
      inst.innerHTML =
        '<p class="small">Để cài: Chrome Android → menu ⋮ → <b>Thêm vào màn hình chính</b>; Safari iOS → nút Chia sẻ → <b>Thêm vào MH chính</b>.</p>';
  };
  drawInstall();
  onInstallable(drawInstall);

  el.querySelector('#backup')!.addEventListener('click', async () => {
    const { backupJson } = await import('../export/json');
    const d = new Date();
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    download(new Blob([JSON.stringify(await backupJson())], { type: 'application/json' }), `tbdge-backup-${stamp}.json`);
  });
  el.querySelector<HTMLInputElement>('#restore')!.addEventListener('change', async (e) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    if (!confirm(`Nhập "${f.name}"? Bản ghi trùng mã sẽ bị ghi đè.`)) return;
    try {
      const { importJson } = await import('../export/json');
      toast(await importJson(await f.text()), undefined, 5000);
    } catch (err) {
      toast('Lỗi: ' + (err as Error).message, undefined, 6000);
    }
  });
};

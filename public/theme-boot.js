// Áp chủ đề + cỡ chữ trước khi trang được vẽ (tránh nháy màu sáng khi mở app ban đêm).
// Giữ đồng bộ với src/settings.ts. File ngoài (không inline) để tuân thủ CSP script-src 'self'.
(function () {
  var BAR = { light: '#0b4f8a', dark: '#16232f', contrast: '#ffd600', nightred: '#140404' };
  var t = 'auto';
  var scale = 1;
  try {
    t = localStorage.getItem('tbd.theme') || 'auto';
    scale = Number(localStorage.getItem('tbd.fontScale')) || 1;
  } catch (e) {}
  if (!BAR[t]) {
    t = matchMedia('(prefers-contrast: more)').matches ? 'contrast' : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  var root = document.documentElement;
  root.setAttribute('data-theme', t);
  root.style.setProperty('--fs-scale', String(scale));
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', BAR[t]);
})();

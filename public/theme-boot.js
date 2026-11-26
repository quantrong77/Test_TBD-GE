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

// Màn hình dự phòng: app không khởi động được (trình duyệt quá cũ, trình duyệt nhúng của Zalo/Facebook chặn…)
// → hiện hướng dẫn thay vì trang trắng. ES5 thuần để chạy được cả trên trình duyệt cũ.
(function () {
  var firstError = '';
  function note(msg) {
    if (!firstError && msg) firstError = String(msg).slice(0, 300);
  }
  window.addEventListener('error', function (e) {
    note(e && (e.message || (e.target && e.target.src && 'Không tải được ' + e.target.src)));
  }, true);
  window.addEventListener('unhandledrejection', function (e) {
    note(e && e.reason && (e.reason.message || e.reason));
  });
  var ua = navigator.userAgent || '';
  var app = /Zalo/i.test(ua) ? 'Zalo' : /FBAN|FBAV|FB_IAB|FBIOS|Messenger/i.test(ua) ? 'Facebook' : /Instagram/i.test(ua) ? 'Instagram' : /TikTok|musical_ly/i.test(ua) ? 'TikTok' : '';
  var android = /Android/i.test(ua);
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function show() {
    var el = document.getElementById('app');
    if (!el || el.children.length) return; // app đã vẽ → không làm gì
    var href = location.href.split('#')[0];
    var intent = 'intent://' + location.host + location.pathname + '#Intent;scheme=' + location.protocol.replace(':', '') + ';package=com.android.chrome;end';
    el.innerHTML =
      '<div class="card" style="margin:16px">' +
      '<h1>Không mở được ứng dụng</h1>' +
      (app
        ? '<p>Bạn đang mở link trong <b>' + app + '</b>. Hãy bấm nút <b>ba chấm</b> (' + (android ? '⋮' : '•••') + ') góc trên bên phải → <b>Mở bằng trình duyệt</b> (' + (android ? 'Chrome' : 'Safari') + ').</p>'
        : '<p>Trình duyệt này không chạy được ứng dụng. Hãy mở bằng <b>Chrome</b> (Android) hoặc <b>Safari</b> (iPhone) bản mới.</p>') +
      (android ? '<p><a class="btn" href="' + esc(intent) + '">Mở bằng Chrome</a></p>' : '') +
      '<p>Hoặc sao chép đường link này và dán vào trình duyệt:</p>' +
      '<input readonly style="width:100%" value="' + esc(href) + '">' +
      (firstError ? '<p style="font-size:13px;opacity:.75">Chi tiết lỗi (gửi cho người phát triển): ' + esc(firstError) + '</p>' : '') +
      '</div>';
  }
  window.addEventListener('load', function () {
    // có lỗi → báo sớm; không lỗi mà vẫn trống (máy chậm) → chờ lâu hơn
    setTimeout(function () {
      if (firstError) show();
    }, 2500);
    setTimeout(show, 9000);
  });
})();

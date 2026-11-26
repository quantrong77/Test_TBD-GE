// Nhận diện trình duyệt nhúng trong app chat/mạng xã hội (mở link từ Zalo, Facebook…).
// Google cấm đăng nhập OAuth trong trình duyệt nhúng (lỗi 403 disallowed_useragent) → hướng dẫn mở bằng Chrome/Safari
// hoặc đăng nhập bằng mã email. Logic giống public/theme-boot.js (màn hình dự phòng khi app không khởi động được).

const APPS: [RegExp, string][] = [
  [/Zalo/i, 'Zalo'],
  [/FBAN|FBAV|FB_IAB|FBIOS/i, 'Facebook'],
  [/Messenger|MessengerForiOS/i, 'Messenger'],
  [/Instagram/i, 'Instagram'],
  [/\bLine\//i, 'LINE'],
  [/musical_ly|TikTok|BytedanceWebview/i, 'TikTok'],
];

/** Tên app chứa trình duyệt nhúng ("Zalo", "Facebook"…) hoặc null. */
export function inAppBrowser(ua: string = typeof navigator === 'undefined' ? '' : navigator.userAgent): string | null {
  for (const [re, name] of APPS) if (re.test(ua)) return name;
  return null;
}

export const isAndroid = (ua: string = typeof navigator === 'undefined' ? '' : navigator.userAgent) => /Android/i.test(ua);

/** Link mở trang hiện tại bằng Chrome trên Android (intent://). iOS không có cách mở Safari bằng mã. */
export function chromeIntentUrl(href: string): string {
  const u = new URL(href);
  return `intent://${u.host}${u.pathname}${u.search}${u.hash}#Intent;scheme=${u.protocol.replace(':', '')};package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(href)};end`;
}

/** Hướng dẫn mở bằng trình duyệt ngoài theo từng app (chữ hỗ trợ **đậm**). */
export function openOutsideHint(_app: string, android: boolean): string {
  const menu = `nút **ba chấm** (${android ? '⋮' : '•••'}) góc trên bên phải`;
  return `Bấm ${menu} → **Mở bằng trình duyệt** (${android ? 'Chrome' : 'Safari'}).`;
}

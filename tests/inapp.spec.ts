// Nhận diện trình duyệt nhúng (mở link từ Zalo, Facebook…) và link mở bằng Chrome.
import { describe, it, expect } from 'vitest';
import { chromeIntentUrl, inAppBrowser, isAndroid, openOutsideHint } from '../src/inapp';

const ZALO_ANDROID = 'Mozilla/5.0 (Linux; Android 10; SM-A505F; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/79.0 Mobile Safari/537.36 Zalo android/12100710 ZaloTheme/light';
const ZALO_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Zalo iOS/23.10.01';
const FB = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/440.0.0.31.105;]';
const CHROME = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36';

describe('trình duyệt nhúng', () => {
  it('nhận ra Zalo (Android, iPhone), Facebook; Chrome thường thì không', () => {
    expect(inAppBrowser(ZALO_ANDROID)).toBe('Zalo');
    expect(inAppBrowser(ZALO_IOS)).toBe('Zalo');
    expect(inAppBrowser(FB)).toBe('Facebook');
    expect(inAppBrowser(CHROME)).toBeNull();
    expect(isAndroid(ZALO_ANDROID)).toBe(true);
    expect(isAndroid(ZALO_IOS)).toBe(false);
  });
  it('link intent mở đúng trang bằng Chrome, giữ http/https và đường dẫn', () => {
    expect(chromeIntentUrl('https://quantrong77.github.io/Test_TBD-GE/#/login')).toBe(
      'intent://quantrong77.github.io/Test_TBD-GE/#/login#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=https%3A%2F%2Fquantrong77.github.io%2FTest_TBD-GE%2F%23%2Flogin;end',
    );
    expect(chromeIntentUrl('http://10.0.0.5:4173/')).toContain('scheme=http;');
  });
  it('hướng dẫn theo hệ điều hành', () => {
    expect(openOutsideHint('Zalo', true)).toContain('Chrome');
    expect(openOutsideHint('Zalo', false)).toContain('Safari');
  });
});

// Không bao giờ để trang trắng: app không khởi động được (WebView cũ, trình duyệt nhúng chặn…) → hiện hướng dẫn.
import { test, expect } from '@playwright/test';

const ZALO = 'Mozilla/5.0 (Linux; Android 10; SM-A505F; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/79.0.3945.136 Mobile Safari/537.36 Zalo android/12100710';

test.use({ userAgent: ZALO });

test('WebView cũ thiếu API mới vẫn mở được app (polyfill)', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    const E = Element.prototype as unknown as Record<string, unknown>;
    delete E.replaceChildren;
    delete (Array.prototype as unknown as Record<string, unknown>).at;
    delete (Object as unknown as Record<string, unknown>).hasOwn;
  });
  await page.goto('./');
  await expect(page.locator('#app')).toContainText('AN TOÀN TRƯỚC KHI LÊN SÀN');
  await page.locator('#bottomnav a', { hasText: 'Phiên TN' }).click();
  await expect(page).toHaveURL(/#\/sessions/);
  expect(errors).toEqual([]);
});

test('mã app không tải được → màn hình hướng dẫn mở bằng trình duyệt, kèm chi tiết lỗi', async ({ page }) => {
  await page.route(/assets\/index-.*\.js$/, (r) => r.abort());
  await page.goto('./');
  const app = page.locator('#app');
  await expect(app).toContainText('Không mở được ứng dụng', { timeout: 15_000 });
  await expect(app).toContainText('Zalo');
  await expect(app).toContainText('Mở bằng Chrome');
  await expect(app).toContainText('Chi tiết lỗi');
});

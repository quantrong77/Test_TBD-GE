// Đơn vị & số biên bản, nhân viên, tạo phiên chọn nhân sự từ danh sách, hạng mục thực hiện, xuất PDF.
import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

test('đơn vị → nhân viên → tạo phiên (số BB, nhân sự, hạng mục) → bỏ/chọn hạng mục → PDF', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  const year = new Date().getFullYear();

  // 1. Khai đơn vị (mặc định) với số bắt đầu 7
  await page.goto('#/units');
  await expect(page.locator('input[name=name]')).toHaveValue('Đội Sửa chữa, thí nghiệm điện Lâm Đồng');
  await page.locator('input[name=numberStart]').fill('7');
  await page.getByRole('button', { name: 'Lưu' }).click();
  await expect(page.locator('#app')).toContainText(`07/${year}/BB-TN`);

  // 2. Nhân viên
  await page.goto('#/staff');
  for (const [name, title, grade] of [
    ['Nguyễn Văn A', 'Kỹ sư', '4'],
    ['Trần Văn B', 'Đội phó', '5'],
  ]) {
    await page.getByRole('button', { name: '＋ Thêm nhân viên' }).click();
    await page.locator('form[data-sid="new"] input[name=name]').fill(name);
    await page.locator('form[data-sid="new"] input[name=title]').fill(title);
    await page.locator('form[data-sid="new"] select[name=safetyGrade]').selectOption(grade);
    await page.locator('form[data-sid="new"]').getByRole('button', { name: 'Lưu' }).click();
    await expect(page.locator('#app')).toContainText(name);
  }
  await expect(page.locator('#app')).toContainText('2 người đang làm việc');

  // 3. Tạo phiên: chọn từ danh sách
  await page.goto('#/session-new');
  await expect(page.locator('input[name=reportNo]')).toHaveValue('7');
  await expect(page.locator('#noPreview')).toContainText(`07/${year}/BB-TN`);
  await page.locator('select[name=leaderId]').selectOption({ label: 'Trần Văn B (Đội phó, bậc 5/5)' });
  await page.locator('label.check', { hasText: 'Nguyễn Văn A' }).locator('input').check();
  await expect(page.locator('select[name=responsible]')).toContainText('Nguyễn Văn A (Kỹ sư, bậc 4/5)');
  await page.locator('input[name=item][value="4.7"]').uncheck();
  await page.getByRole('button', { name: 'Tạo phiên' }).click();
  await expect(page).toHaveURL(/#\/session\/[^/]+$/);
  const url = page.url();

  // 4. Chi tiết phiên
  const app = page.locator('#app');
  await expect(app).toContainText(`Biên bản số 07/${year}/BB-TN`);
  await expect(app).toContainText('Chịu trách nhiệm thí nghiệm: Nguyễn Văn A (Kỹ sư, bậc 4/5)');
  await expect(page.locator('.phase-matrix')).not.toContainText('Bơm dòng');
  await expect(page.locator('.item-off')).toContainText('Không thực hiện');

  // hạng mục bỏ chọn: biểu mẫu ẩn vùng nhập, bật lại được
  await page.goto(url + '/form/4.7/inject');
  await expect(app).toContainText('không thực hiện trong phiên này');
  await page.getByRole('button', { name: '✓ Thực hiện hạng mục này' }).click();
  await expect(page.locator('#body')).toBeVisible();

  // bỏ chọn lại từ trang phiên
  await page.goto(url);
  await page.locator('[data-item="4.7"]').uncheck();
  await expect(page.locator('.item-off')).toContainText('Bơm dòng');

  // 5. Phiên kế tiếp tự lấy số 08
  await page.goto('#/session-new');
  await expect(page.locator('input[name=reportNo]')).toHaveValue('8');

  // 6. Xuất PDF
  await page.goto(url);
  await page.evaluate(() => {
    const w = window as unknown as { __dl?: { name: string; b64: string } | null };
    w.__dl = null;
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
      fetch(this.href)
        .then((r) => r.arrayBuffer())
        .then((buf) => {
          let s = '';
          new Uint8Array(buf).forEach((c) => (s += String.fromCharCode(c)));
          w.__dl = { name: this.download, b64: btoa(s) };
        });
    };
  });
  await page.getByRole('button', { name: '📄 PDF' }).click();
  const got = await page.waitForFunction(() => (window as unknown as { __dl: unknown }).__dl, null, { timeout: 30_000 });
  const { b64 } = (await got.jsonValue()) as { b64: string };
  mkdirSync('test-results/export', { recursive: true });
  writeFileSync('test-results/export/org-session.pdf', Buffer.from(b64, 'base64'));
  expect(errors).toEqual([]);
});

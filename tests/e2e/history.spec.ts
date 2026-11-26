// Số liệu lịch sử cho xu hướng: phiên nhập lại biên bản giấy, tải file mẫu, nhập nhiều mốc từ Excel/CSV.
import { test, expect } from '@playwright/test';

test('phiên nhập lại biên bản giấy → số liệu lên xu hướng; nhập mốc từ CSV có xem trước', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  const app = page.locator('#app');

  // 1. Phiên nhập lại biên bản giấy năm 2022: không số biên bản, không cần Chỉ huy / người chịu trách nhiệm
  await page.goto('#/session-new');
  await page.locator('#historical').check();
  await expect(page.locator('input[name=reportNo]')).toBeHidden();
  await page.locator('input[name=paperRef]').fill('12/BB-TN 2022');
  await page.locator('input[name=date]').fill('2022-03-15');
  await page.getByRole('button', { name: 'Tạo phiên' }).click();
  await expect(page).toHaveURL(/#\/session\/[^/]+$/);
  const url = page.url();
  await expect(app).toContainText('Phiên nhập lại từ biên bản giấy');
  await expect(app).not.toContainText('Cổng an toàn lên sàn tụ');
  await expect(app).not.toContainText('Ký biên bản');

  // nhập Rcd MOV pha A (đã ở 20 °C) – biểu mẫu không đòi cổng an toàn
  await page.goto(url + '/form/4.2/measure');
  await expect(app).not.toContainText('Chưa xác nhận');
  await page.locator('[data-k="A.t"]').fill('20');
  await page.locator('[data-k="A.Rmov"]').fill('3200');
  await page.waitForTimeout(800);

  // 2. Xu hướng: điểm từ phiên 2022
  await page.goto('#/trend/TBD503-PLEIKU2');
  await page.locator('#trend-met-sel').selectOption('mov_rcd');
  await expect(app).toContainText('Lịch sử số liệu (1 đợt)');
  await expect(app).toContainText('3.200');

  // 3. File mẫu tải được
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: '⬇ Tải file mẫu' }).click();
  expect((await dl).suggestedFilename()).toMatch(/^Mau_moc_lich_su_xu_huong_.*\.xlsx$/);

  // 4. Nhập CSV: 2 dòng hợp lệ + 1 dòng lỗi → xem trước → ghi
  const csv = [
    'Ngay,Ma ho so gian,Chi so,Loai dot,Pha A,Pha B,Pha C,Ten dot,Ghi chu',
    '10/03/2020,TBD503-PLEIKU2,mov_rcd,Dinh ky,3500,3400,3300,,BB 05/2020',
    '12/03/2021,TBD503-PLEIKU2,mov_rcd,Dinh ky,3350,,,,',
    '12/03/2021,KHONG-CO,mov_rcd,,1,1,1,,',
  ].join('\n');
  await page.locator('#hist-file').setInputFiles({ name: 'moc.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await expect(page.locator('#hist-preview')).toContainText('2 mốc hợp lệ');
  await expect(page.locator('#hist-preview')).toContainText('Dòng 4');
  // 10/03/2020 = ngày 10 tháng 3 (không bị đọc kiểu Mỹ thành 3 tháng 10)
  await expect(page.locator('#hist-preview')).toContainText('2020-03-10');
  await page.getByRole('button', { name: 'Ghi 2 mốc' }).click();
  await expect(app).toContainText('Lịch sử số liệu (3 đợt)');
  await expect(app).toContainText('Tốc độ biến thiên');

  // nhập lại cùng file: thay mốc cũ cùng ngày, không nhân đôi
  await page.locator('#hist-file').setInputFiles({ name: 'moc.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await expect(page.locator('#hist-preview')).toContainText('2 mốc thay mốc cũ cùng ngày');
  await page.getByRole('button', { name: 'Ghi 2 mốc' }).click();
  await expect(app).toContainText('Lịch sử số liệu (3 đợt)');

  // 5. Danh sách phiên: phiên nhập lại có nhãn riêng
  await page.goto('#/sessions');
  await expect(app).toContainText('Nhập lại BB giấy');
  expect(errors).toEqual([]);
});

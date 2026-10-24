import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const errors: string[] = [];
function watch(page: Page) {
  errors.length = 0;
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
}

async function passPlatformGate(page: Page) {
  await page.goto('#/gate/gate-platform');
  // giả lập đã cô lập tụ 16 phút trước (đồng hồ tính theo timestamp)
  await page.evaluate(() => {
    for (const k of Object.keys(localStorage)) if (k.startsWith('tbd.timer.gate:')) localStorage.removeItem(k);
  });
  await page.getByRole('button', { name: 'Bắt đầu' }).click();
  await page.evaluate(() => {
    for (const k of Object.keys(localStorage)) if (k.startsWith('tbd.timer.gate:')) localStorage.setItem(k, String(Date.now() - 16 * 60 * 1000));
  });
  await expect(page.locator('.timer.done')).toBeVisible();
  for (const box of await page.locator('#checks input[type=checkbox]').all()) await box.check();
  // trong phiên: chọn từ danh sách đội (chỉ huy + thành viên)
  await page.locator('#who').selectOption('Trần Văn C');
  await page.getByRole('button', { name: /XÁC NHẬN/ }).click();
  await expect(page.getByText('Đã xác nhận bởi')).toBeVisible();
}

test('home renders 7 items, no console errors', async ({ page }) => {
  watch(page);
  await page.goto('./');
  await expect(page.locator('.tile')).toHaveCount(7);
  await expect(page.getByText('AN TOÀN TRƯỚC KHI LÊN SÀN')).toBeVisible();
  for (const r of ['#/overview', '#/safety', '#/thresholds', '#/tools', '#/cycle', '#/equipment', '#/equipment/gamma-rr10/quick', '#/settings', '#/about', '#/sessions', '#/calc/unbalance']) {
    await page.goto(r);
    await expect(page.locator('#app')).not.toBeEmpty();
  }
  expect(errors).toEqual([]);
});

test('works offline after first load (airplane mode)', async ({ page, context }) => {
  await page.goto('./');
  await page.waitForFunction(async () => (await navigator.serviceWorker.ready).active?.state === 'activated');
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  // chờ precache xong
  await page.waitForFunction(async () => {
    const keys = await caches.keys();
    for (const k of keys) if ((await (await caches.open(k)).keys()).length > 80) return true;
    return false;
  });
  await context.setOffline(true);
  await page.reload();
  for (const id of ['4.1', '4.2', '4.3', '4.4', '4.5', '4.6', '4.7']) {
    await page.goto(`#/item/${id}`);
    await expect(page.locator('h2', { hasText: 'Trình tự' })).toBeVisible();
    const imgs = page.locator('[data-sec="img"] img');
    const n = await imgs.count();
    for (let i = 0; i < n; i++) {
      await imgs.nth(i).scrollIntoViewIfNeeded();
      await expect.poll(() => imgs.nth(i).evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
    }
  }
  await context.setOffline(false);
});

test('safety gate blocks until all checks + 15-minute timer', async ({ page }) => {
  await page.goto('#/item/4.1/test/unbalance/step/1');
  await expect(page).toHaveURL(/#\/gate\/gate-platform/);
  const confirm = page.getByRole('button', { name: /XÁC NHẬN/ });
  await expect(confirm).toBeDisabled();
  const timed = page.locator('input[data-id="isolated-15min"]');
  await expect(timed).toBeDisabled();
  await page.getByRole('button', { name: 'Bắt đầu' }).click();
  await expect(timed).toBeDisabled(); // vừa bắt đầu đếm – vẫn khóa
  await page.evaluate(() => {
    for (const k of Object.keys(localStorage)) if (k.startsWith('tbd.timer.gate:')) localStorage.setItem(k, String(Date.now() - 15 * 60 * 1000 - 1000));
  });
  await expect(timed).toBeEnabled();
  for (const box of await page.locator('#checks input[type=checkbox]').all()) await box.check();
  await expect(confirm).toBeDisabled(); // chưa có người xác nhận
  await page.locator('#who').fill('Chỉ huy B');
  await expect(confirm).toBeEnabled();
  await confirm.click();
  // tiếp theo là cổng điện áp thử của 4.1.B
  await expect(page).toHaveURL(/#\/gate\/gate-hv/);
  for (const box of await page.locator('#checks input[type=checkbox]').all()) await box.check();
  await page.locator('#who').fill('Chỉ huy B');
  await page.getByRole('button', { name: /XÁC NHẬN/ }).click();
  await expect(page).toHaveURL(/step\/1/);
  await expect(page.locator('.step-text')).toContainText('cuộn dây 10 vòng');
  await page.getByRole('button', { name: /XONG – TIẾP/ }).click();
  await expect(page).toHaveURL(/step\/2/);
});

test('session: measurements autosave, survive reload, compute %ΔC, export', async ({ page }) => {
  watch(page);
  await page.goto('#/session-new');
  await page.locator('input[name=leader]').fill('Trần Văn C');
  await page.locator('textarea[name=members]').fill('Lê D (ATVSV)\nPhạm E');
  await page.getByRole('button', { name: 'Tạo phiên' }).click();
  await expect(page).toHaveURL(/#\/session\/[^/]+$/);
  const sessionUrl = page.url();
  await passPlatformGate(page);
  await page.goto(sessionUrl);
  await page.getByRole('link', { name: /Thí nghiệm mất cân bằng/ }).click();
  await page.locator('[data-k="A.U"]').fill('250');
  await page.locator('[data-k="A.Isum"]').fill('8,2');
  await page.locator('[data-k="A.IG1"]').fill('4,1');
  await page.locator('[data-k="A.IG2"]').fill('4,1');
  await page.locator('[data-k="A.Idx10"]').fill('100');
  await expect(page.locator('[data-out="calc"]')).toContainText('0,122 %');
  await expect(page.locator('[data-out="calc"]')).toContainText('104,4');
  await page.waitForTimeout(800); // debounce 500 ms
  await page.reload();
  await expect(page.locator('[data-k="A.Isum"]')).toHaveValue('8,2');
  await expect(page.locator('#rows')).toContainText('Đạt');

  // VAP: 93,3 mC → không đạt
  await page.goto(sessionUrl.replace(/#.*/, '') + '#' + sessionUrl.split('#')[1] + '/form/4.5/vap-threshold');
  await page.locator('[data-k="A.VAP-A.mC"]').fill('93,3');
  await page.locator('[data-k="A.VAP-A.A"]').fill('-4,36');
  await expect(page.locator('[data-row="A.VAP-A.mC"]')).toHaveClass(/res-fail/);
  await expect(page.locator('[data-row="A.VAP-A.A"]')).toHaveClass(/res-pass/);
  await page.waitForTimeout(800);

  await page.goto(sessionUrl);
  await expect(page.locator('.progress-items')).toContainText('4.5 ❌');
  for (const [btn, ext] of [
    ['📄 PDF', '.pdf'],
    ['📊 Excel', '.xlsx'],
    ['{ } JSON', '.json'],
  ]) {
    // Chromium trên máy CI/Windows này hủy mọi blob download → bắt Blob ngay trong trang
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
    await page.getByRole('button', { name: btn }).click();
    const got = await page.waitForFunction(() => (window as unknown as { __dl: unknown }).__dl, null, { timeout: 30_000 });
    const { name, b64 } = (await got.jsonValue()) as { name: string; b64: string };
    expect(name).toMatch(new RegExp(`^BB_TBD_TBD503_.*\\${ext}$`));
    const bytes = Buffer.from(b64, 'base64');
    expect(bytes.length).toBeGreaterThan(500);
    mkdirSync('test-results/export', { recursive: true });
    writeFileSync(`test-results/export/${name}`, bytes);
  }
  expect(errors).toEqual([]);
});

test('search is diacritic-insensitive', async ({ page }) => {
  await page.goto('#/search');
  await page.locator('#q').fill('khang can diu');
  await expect(page.locator('#res .card').first()).toContainText('Kháng cản dịu');
  await page.locator('#q').fill('vap fired');
  await expect(page.locator('#res')).toContainText('VAP FIRED');
});

test('equipment step lock: next step only after 60 s timer', async ({ page }) => {
  await page.goto('#/equipment/vap-tester-31f246/quick');
  const after = page.locator('[data-quick] input[type=checkbox]');
  await expect(after).toHaveCount(6);
  // bước 6 có đồng hồ 60 s nhưng không có bước sau → GAMMA: bước 9.1 khóa theo bước 9
  await page.goto('#/equipment/gamma-rr10/quick');
  const s91 = page.locator('input[data-n="9.1"]');
  await expect(s91).toBeDisabled();
  await page.locator('[data-timer="eq:gamma-rr10:9"] [data-act=start]').click();
  await page.evaluate(() => localStorage.setItem('tbd.timer.eq:gamma-rr10:9', String(Date.now() - 31_000)));
  await expect(s91).toBeEnabled();
});

test('import rejects malicious JSON (XSS in date, SVG photo) and unsafe ?next=', async ({ page }) => {
  await page.goto('#/settings');
  page.on('dialog', (d) => d.accept());
  const bad = {
    format: 'tbd-ge-session',
    session: { id: 'x', profileId: 'TBD503-PLEIKU2', date: '<img src=x onerror=alert(1)>', type: 'periodic', status: 'open', leader: 'a', members: [], instruments: [], createdAt: 1 },
    measurements: [],
    checks: [],
    photos: [],
  };
  await page.locator('#restore').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(bad)) });
  await expect(page.locator('#toast')).toContainText('không hợp lệ');
  const svg = { ...bad, session: { ...bad.session, date: '2026-01-01' }, photos: [{ id: 'p', sessionId: 'x', itemId: '4.1', caption: '', ts: 1, dataUrl: 'data:image/svg+xml;base64,PHN2Zy8+' }] };
  await page.locator('#restore').setInputFiles({ name: 'svg.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(svg)) });
  await expect(page.locator('#toast')).toContainText('ảnh – định dạng');
  await page.goto('#/session/x');
  await expect(page.locator('#app')).toContainText('Không tìm thấy');
  await page.goto('#/gate/gate-platform?next=javascript:alert(1)');
  await expect(page.locator('a[href^="javascript"]')).toHaveCount(0);
});

test('review #1: stale 15-min timer (>12 h) or reset does not unlock the isolation check', async ({ page }) => {
  await page.goto('#/gate/gate-platform');
  await page.evaluate(() => {
    for (const k of Object.keys(localStorage)) if (k.startsWith('tbd.timer.gate:')) localStorage.removeItem(k);
    localStorage.setItem('tbd.timer.gate:_local:gate-platform:isolated-15min', String(Date.now() - 24 * 3600 * 1000));
  });
  await page.reload();
  await expect(page.locator('input[data-id="isolated-15min"]')).toBeDisabled();
  await expect(page.locator('.timer .t')).toHaveText('15:00');
});

test('review #3: stepless test (4.5.A gap) shows guidance instead of crashing', async ({ page }) => {
  watch(page);
  await page.goto('#/item/4.5');
  await expect(page.locator('#test-gap a', { hasText: 'BẮT ĐẦU TỪNG BƯỚC' })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('isolation time entered manually: ≥15 min unlocks, <15 min counts the remainder', async ({ page }) => {
  page.on('dialog', (d) => d.accept());
  const hm = (minAgo: number) => {
    const d = new Date(Date.now() - minAgo * 60000);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };
  await page.goto('#/gate/gate-platform');
  const box = page.locator('input[data-id="isolated-15min"]');
  await expect(box).toBeDisabled();
  // mới cô lập 5 phút → vẫn khóa, đồng hồ còn ~10 phút
  await page.getByText('Tụ đã cô lập từ trước?').click();
  await page.locator('[data-iso-time="isolated-15min"]').fill(hm(5));
  await page.locator('[data-iso="isolated-15min"]').click();
  await expect(box).toBeDisabled();
  await expect(page.locator('.timer .t')).toHaveText(/^(09|10):\d\d$/);
  await expect(page.getByText(/Cô lập từ .*nhập tay/)).toBeVisible();
  // nhập lại: đã cô lập 20 phút → mở khóa ngay
  await page.getByText('Tụ đã cô lập từ trước?').click();
  await page.locator('[data-iso-time="isolated-15min"]').fill(hm(20));
  await page.locator('[data-iso="isolated-15min"]').click();
  await expect(box).toBeEnabled();
  await box.check();
  await expect(box).toBeChecked();
});

test.describe('layout stability when switching tabs', () => {
  test('bottom nav is not re-created and title does not shift', async ({ page }) => {
    await page.goto('./');
    await expect(page.locator('.tile')).toHaveCount(7);
    await page.evaluate(() => ((document.querySelector('#bottomnav a') as HTMLElement & { __mark?: number }).__mark = 1));
    const titleX = () => page.locator('#topbar .title').evaluate((e) => Math.round(e.getBoundingClientRect().left));
    const homeX = await titleX();
    for (const tab of ['Phiên TN', 'Hạng mục', 'Ngưỡng', 'Tìm', 'Trang chủ']) {
      await page.locator('#bottomnav a', { hasText: tab }).click();
      await expect(page.locator('#bottomnav a[aria-current="page"]')).toHaveText(new RegExp(tab));
      expect(await titleX()).toBe(homeX);
    }
    expect(await page.evaluate(() => (document.querySelector('#bottomnav a') as HTMLElement & { __mark?: number }).__mark)).toBe(1);
  });

  test('content area never goes blank between pages', async ({ page }) => {
    await page.goto('./');
    await expect(page.locator('.tile')).toHaveCount(7);
    await page.evaluate(() => {
      const w = window as unknown as { __blank: number };
      w.__blank = 0;
      new MutationObserver(() => {
        if (!document.querySelector('#app')!.textContent!.trim()) w.__blank++;
      }).observe(document.querySelector('#app')!, { childList: true, subtree: true });
    });
    for (const tab of ['Phiên TN', 'Hạng mục', 'Ngưỡng', 'Trang chủ']) {
      await page.locator('#bottomnav a', { hasText: tab }).click();
      await expect(page.locator('#bottomnav a[aria-current="page"]')).toHaveText(new RegExp(tab));
    }
    expect(await page.evaluate(() => (window as unknown as { __blank: number }).__blank)).toBe(0);
  });

  test('back restores scroll position; going to a new page starts at top', async ({ page }) => {
    await page.goto('#/thresholds');
    await expect(page.locator('h2', { hasText: 'Lực xiết' })).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 400));
    await page.waitForTimeout(250);
    const before = await page.evaluate(() => Math.round(window.scrollY));
    expect(before).toBeGreaterThan(100);
    await page.locator('h2 a[href="#/item/4.5"]').click();
    await expect(page.locator('h2', { hasText: 'Trình tự' })).toBeVisible();
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    await page.goBack();
    await expect(page.locator('h2', { hasText: 'Lực xiết' })).toBeVisible();
    await expect.poll(() => page.evaluate(() => Math.round(window.scrollY))).toBe(before);
  });
});

test('top bar: help and about icons next to settings; about shows developer contact', async ({ page }) => {
  for (const r of ['./', '#/item/4.5', '#/sessions']) {
    await page.goto(r);
    await expect(page.locator('#topbar a[aria-label="Hướng dẫn sử dụng"]')).toBeVisible();
    await expect(page.locator('#topbar a[aria-label="Giới thiệu"]')).toBeVisible();
    await expect(page.locator('#topbar a[aria-label="Cài đặt"]')).toBeVisible();
  }
  await page.locator('#topbar a[aria-label="Giới thiệu"]').click();
  await expect(page.locator('#app')).toContainText('Hoàng Trọng');
  await expect(page.locator('#app')).toContainText('PTC3');
  await expect(page.locator('#app')).toContainText('App là tiện ích để Nhân viên thí nghiệm tra cứu nhanh');
  await expect(page.locator('a[href="tel:0909813284"]')).toHaveText(/0909 813 284/);
  await expect(page.locator('a[href^="mailto:quantrong77@gmail.com"]')).toBeVisible();
  await expect(page.locator('#app')).toContainText(/Phiên bản \d+\.\d+\.\d+/);
  await page.locator('#topbar a[aria-label="Hướng dẫn sử dụng"]').click();
  await expect(page.locator('details.card')).toHaveCount(7);
  // nội dung hướng dẫn tìm được, mở đúng mục
  await page.goto('#/search');
  await page.locator('#q').fill('json');
  await page.locator('#res a', { hasText: 'File JSON: sao lưu' }).click();
  await expect(page.locator('#help-data')).toHaveAttribute('open', '');
});

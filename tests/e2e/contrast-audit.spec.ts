import { test, expect, type Page } from '@playwright/test';

/**
 * Rà soát tương phản THỰC TẾ trên màn hình: với mỗi chủ đề, đo mọi phần tử có chữ đang hiển thị
 * so với nền thật phía sau (đi ngược lên cây DOM tới nền không trong suốt).
 * Ngưỡng WCAG AA: 4.5 cho chữ thường; 3 cho chữ lớn (≥ 24px, hoặc ≥ 18.66px và đậm ≥ 700).
 */
const THEMES = ['light', 'dark', 'contrast', 'nightred'];
const PAGES = ['#/', '#/sessions', '#/session-new', '#/items', '#/item/4.5', '#/thresholds', '#/search?q=vap', '#/settings', '#/help', '#/info', '#/gate/gate-platform', '#/equipment/gamma-rr10', '#/calc/unbalance', '#/safety', '#/tools'];

async function audit(page: Page) {
  return page.evaluate(() => {
    const parse = (c: string) => {
      const m = c.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const [r, g, b, a = 1] = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
      return { r, g, b, a };
    };
    const lum = ({ r, g, b }: { r: number; g: number; b: number }) => {
      const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const bgOf = (el: Element | null): { r: number; g: number; b: number } => {
      for (let e = el; e; e = e.parentElement) {
        const c = parse(getComputedStyle(e).backgroundColor);
        if (c && c.a > 0.5) return c;
      }
      return { r: 255, g: 255, b: 255 };
    };
    const out: string[] = [];
    const seen = new Set<string>();
    for (const el of document.querySelectorAll<HTMLElement>('body *')) {
      // chỉ phần tử có chữ trực tiếp (bỏ emoji/ký hiệu thuần)
      const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent!.trim()).join(' ');
      if (!/[\p{L}\p{N}]/u.test(own)) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity < 0.2) continue;
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      if (el.closest('[aria-hidden="true"], .pswp, input, select, textarea, [disabled], .disabled, [aria-disabled="true"]')) continue;
      const fg = parse(cs.color);
      if (!fg) continue;
      const bg = bgOf(el);
      const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x);
      const ratio = (a + 0.05) / (b + 0.05);
      const size = parseFloat(cs.fontSize);
      const large = size >= 24 || (size >= 18.66 && +cs.fontWeight >= 700);
      const min = large ? 3 : 4.5;
      if (ratio < min) {
        const key = `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}|${cs.color}|${own.slice(0, 30)}`;
        if (!seen.has(key)) {
          seen.add(key);
          out.push(`${ratio.toFixed(2)} < ${min}  <${el.tagName.toLowerCase()} class="${el.className}"> "${own.slice(0, 40)}"  ${cs.color} trên rgb(${bg.r},${bg.g},${bg.b})`);
        }
      }
    }
    return out;
  });
}

for (const theme of THEMES) {
  test(`text contrast on screen – theme ${theme}`, async ({ page }) => {
    await page.addInitScript((t) => localStorage.setItem('tbd.theme', t), theme);
    const problems: string[] = [];
    for (const p of PAGES) {
      await page.goto(p);
      await expect(page.locator('#app')).not.toBeEmpty();
      await page.waitForTimeout(150);
      for (const x of await audit(page)) problems.push(`${p}  ${x}`);
    }
    expect(problems, problems.join('\n')).toEqual([]);
  });

  test(`text contrast with real data (session, forms, step mode) – theme ${theme}`, async ({ page }) => {
    await page.addInitScript((t) => localStorage.setItem('tbd.theme', t), theme);
    page.on('dialog', (d) => d.accept());
    const problems: string[] = [];
    const check = async (label: string) => {
      await page.waitForTimeout(150);
      for (const x of await audit(page)) problems.push(`${label}  ${x}`);
    };
    // phiên + cổng an toàn
    await page.goto('#/session-new');
    await page.locator('input[name=leader]').fill('Trần Văn C');
    await page.getByRole('button', { name: 'Tạo phiên' }).click();
    await expect(page).toHaveURL(/#\/session\/[^/]+$/);
    const sessionUrl = page.url();
    await page.goto('#/gate/gate-platform');
    await page.getByRole('button', { name: 'Bắt đầu' }).click();
    await page.evaluate(() => {
      for (const k of Object.keys(localStorage)) if (k.startsWith('tbd.timer.gate:')) localStorage.setItem(k, String(Date.now() - 16 * 60000));
    });
    await expect(page.locator('input[data-id="isolated-15min"]')).toBeEnabled();
    for (const b of await page.locator('#checks input[type=checkbox]').all()) await b.check();
    await page.locator('#who').selectOption('Trần Văn C');
    await check('#/gate (đủ tích)');
    await page.getByRole('button', { name: /XÁC NHẬN/ }).click();
    await check('#/gate (đã xác nhận)');
    // biểu mẫu có Đạt / Cảnh báo / Không đạt
    await page.goto(sessionUrl + '/form/4.1/unbalance');
    for (const [k, v] of [['A.U', '250'], ['A.Isum', '8,2'], ['A.IG1', '3,9'], ['A.IG2', '4,1'], ['A.Idx10', '150']]) await page.locator(`[data-k="${k}"]`).fill(v);
    await check('form 4.1.B (cảnh báo + lưu ý)');
    await page.goto(sessionUrl + '/form/4.5/vap-threshold');
    await page.locator('[data-k="A.VAP-A.mC"]').fill('93,3');
    await page.locator('[data-k="A.VAP-A.A"]').fill('4,5');
    await page.locator('[data-k="A.VAP-A.fired"]').selectOption('nok');
    await check('form 4.5.B (đạt + không đạt)');
    await page.waitForTimeout(700);
    await page.goto(sessionUrl);
    await expect(page.locator('.progress-items')).toBeVisible();
    await check('trang phiên (tổng kết)');
    // chế độ từng bước (gate-visual cho 4.2)
    await page.goto('#/gate/gate-visual');
    for (const b of await page.locator('#checks input[type=checkbox]').all()) await b.check();
    await page.locator('#who').selectOption('Trần Văn C');
    await page.getByRole('button', { name: /XÁC NHẬN/ }).click();
    await page.goto('#/item/4.2/test/measure/step/2');
    await expect(page.locator('.step-text')).toBeVisible();
    await check('step mode');
    expect(problems, problems.join('\n')).toEqual([]);
  });
}

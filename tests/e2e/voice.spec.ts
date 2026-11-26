// Nhập số đo bằng giọng nói – bộ nhận dạng giả (đọc kịch bản câu nói) thay cho micro thật.
import { test, expect, type Page } from '@playwright/test';

/** Giả lập webkitSpeechRecognition: mỗi lần start() lấy 1 câu trong window.__say (null = im lặng). */
async function fakeSpeech(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __say: (string | null)[]; __heard: number; webkitSpeechRecognition: unknown; SpeechRecognition: unknown };
    w.__say = [];
    w.__heard = 0;
    class FakeRecog {
      lang = '';
      interimResults = false;
      continuous = false;
      maxAlternatives = 1;
      onresult: ((e: unknown) => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      private t = 0;
      start() {
        this.t = window.setTimeout(() => {
          const s = w.__say.length ? w.__say.shift()! : null;
          if (s === null) this.onerror?.({ error: 'no-speech' });
          else {
            w.__heard++;
            this.onresult?.({ results: [[{ transcript: s }]] });
          }
          this.onend?.();
        }, 60);
      }
      abort() {
        clearTimeout(this.t);
        this.onerror?.({ error: 'aborted' });
        this.onend?.();
      }
    }
    // Chrome mới có cả bản không tiền tố – thay cả hai
    w.webkitSpeechRecognition = FakeRecog;
    w.SpeechRecognition = FakeRecog;
    try {
      localStorage.setItem('tbd.voice.readback', '0'); // không đọc lại (máy test không có loa)
    } catch {
      /* bỏ qua */
    }
  });
}
const say = (page: Page, ...lines: (string | null)[]) => page.evaluate((l) => (window as unknown as { __say: (string | null)[] }).__say.push(...l), lines);

async function newSession(page: Page) {
  await page.goto('#/session-new');
  await page.locator('input[name=leaderText]').fill('Trần Văn C');
  await page.locator('textarea[name=extra]').fill('Lê D, Kỹ sư, 4');
  await page.getByRole('button', { name: 'Tạo phiên' }).click();
  await expect(page).toHaveURL(/#\/session\/[^/]+$/);
  return page.url();
}

test('đọc liên tiếp: điền lần lượt các ô, lệnh "dừng", số được lưu và đánh giá', async ({ page }) => {
  await fakeSpeech(page);
  const url = await newSession(page);
  await page.goto(url + '/form/4.1/unbalance');
  await say(page, 'hai trăm năm mươi', 'tám phẩy hai', 'bốn phẩy một', '4,1', 'một trăm', 'dừng');
  await page.locator('[data-k="A.U"]').focus();
  await page.getByRole('button', { name: '🎤 Đọc số liên tiếp' }).click();
  await expect(page.locator('#voice-panel')).toBeHidden({ timeout: 10_000 });
  await expect(page.locator('[data-k="A.U"]')).toHaveValue('250');
  await expect(page.locator('[data-k="A.Isum"]')).toHaveValue('8,2');
  await expect(page.locator('[data-k="A.IG1"]')).toHaveValue('4,1');
  await expect(page.locator('[data-k="A.IG2"]')).toHaveValue('4,1');
  await expect(page.locator('[data-k="A.Idx10"]')).toHaveValue('100');
  await expect(page.locator('[data-out="calc"]')).toContainText('0,122 %');
  await page.waitForTimeout(800); // tự lưu sau 500 ms
  await page.reload();
  await expect(page.locator('[data-k="A.Isum"]')).toHaveValue('8,2');
});

test('đọc liên tiếp: chưa hiểu thì nghe lại, "bỏ qua" sang ô kế, nút Dừng', async ({ page }) => {
  await fakeSpeech(page);
  const url = await newSession(page);
  await page.goto(url + '/form/4.1/unbalance');
  await say(page, 'xin chào', 'hai trăm', 'bỏ qua', 'năm');
  await page.locator('[data-k="A.U"]').focus();
  await page.getByRole('button', { name: '🎤 Đọc số liên tiếp' }).click();
  // "xin chào" không phải số → hỏi lại cùng ô; "hai trăm" → U; "bỏ qua" I∑; "năm" → IG1
  await expect(page.locator('[data-k="A.IG1"]')).toHaveValue('5', { timeout: 10_000 });
  await expect(page.locator('[data-k="A.U"]')).toHaveValue('200');
  await expect(page.locator('[data-k="A.Isum"]')).toHaveValue('');
  await page.locator('#voice-panel').getByRole('button', { name: '■ Dừng' }).click();
  await expect(page.locator('#voice-panel')).toBeHidden();
});

test('nút 🎤 cạnh ô: nói một số → điền đúng ô', async ({ page }) => {
  await fakeSpeech(page);
  const url = await newSession(page);
  await page.goto(url + '/form/4.4/measure');
  await say(page, 'ba trăm linh năm');
  await page.locator('.btn-voice[data-voice-for="A.C1"]').click();
  await expect(page.locator('[data-k="A.C1"]')).toHaveValue('305');
});

test('trình duyệt không nhận giọng nói → ẩn nút 🎤', async ({ page }) => {
  await page.addInitScript(() => {
    delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
    delete (window as unknown as Record<string, unknown>).SpeechRecognition;
  });
  const url = await newSession(page);
  await page.goto(url + '/form/4.4/measure');
  await expect(page.locator('[data-k="A.C1"]')).toBeVisible();
  await expect(page.locator('.btn-voice').first()).toBeHidden();
  await expect(page.getByRole('button', { name: '🎤 Đọc số liên tiếp' })).toBeHidden();
});

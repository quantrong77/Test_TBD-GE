// Vẽ icon PWA từ SVG bằng Chromium (Playwright): icon-192, icon-512, icon-maskable-512.
import { chromium } from '@playwright/test';

const svg = (pad) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" fill="#0B4F8A"/>
  <g transform="translate(256 256) scale(${1 - pad}) translate(-256 -256)">
    <!-- tụ nối tiếp trên đường dây -->
    <path d="M60 230 H214 M298 230 H452" stroke="#fff" stroke-width="26" stroke-linecap="round"/>
    <path d="M214 140 V320 M298 140 V320" stroke="#fff" stroke-width="30" stroke-linecap="round"/>
    <!-- tia sét: TAG -->
    <path d="M276 330 L226 410 H268 L236 480 L318 382 H274 L306 330 Z" fill="#F9A825"/>
    <text x="256" y="110" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-weight="800" font-size="78" fill="#fff">TBD</text>
  </g>
</svg>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 512, height: 512 } });
for (const [name, size, pad] of [
  ['icon-512', 512, 0.04],
  ['icon-192', 192, 0.04],
  ['icon-maskable-512', 512, 0.22],
]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0">${svg(pad).replace('width="512" height="512"', `width="${size}" height="${size}"`)}</body></html>`);
  await page.screenshot({ path: `public/icons/${name}.png`, omitBackground: false, clip: { x: 0, y: 0, width: size, height: size } });
}
await browser.close();
console.log('icons ok');

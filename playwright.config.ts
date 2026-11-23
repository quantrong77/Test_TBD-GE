import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:4173/',
    ...devices['Pixel 7'],
    locale: 'vi-VN',
  },
  webServer: {
    // Build riêng ở chế độ dùng một mình (không máy chủ, không bắt buộc đăng nhập): biến môi trường rỗng
    // được ưu tiên hơn giá trị trong .env.local
    command: 'npx vite build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173/',
    reuseExistingServer: false,
    env: { VITE_GAS_URL: '', VITE_GOOGLE_CLIENT_ID: '' },
    timeout: 180_000,
  },
});

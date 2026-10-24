# TBD-GE Field – Sổ tay TN Tụ bù dọc GE

PWA offline cho thí nghiệm nhất thứ giàn tụ bù dọc 500 kV GE, dựng theo `../TRIEN_KHAI_WEBAPP_THI_NGHIEM_TBD_GE.md` (giai đoạn 1 + 2).

## Lệnh

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # unit test tính toán (vitest)
npm run build        # → dist/  (tsc + vite + service worker)
npm run test:e2e     # Playwright (cần build trước; tự chạy vite preview)
node scripts/image-manifest.mjs   # chạy lại khi thêm/đổi ảnh trong public/images
node scripts/make-icons.mjs       # vẽ lại icon PWA
```

Triển khai: chép `dist/` lên IIS/Nginx nội bộ **có HTTPS** (service worker bắt buộc HTTPS). Ảnh có nguồn từ tài liệu GE/đào tạo nội bộ – **không công khai ra Internet**.

## Sửa nội dung (không cần lập trình)

| File | Nội dung |
| --- | --- |
| `content/items.json` | 7 hạng mục: mục đích, dụng cụ, phép thử, bước, bảng, mẹo, ảnh, biểu mẫu (`form`), cổng an toàn (`gate`) |
| `content/thresholds.json` | Ngưỡng đánh giá (`profileOverride` = lấy theo hồ sơ giàn) |
| `content/safety.json` | Cổng an toàn (checklist; `timer` tính bằng giây) và rủi ro |
| `content/equipment.json` | VAP Tester 31F246, nguồn GAMMA RR10-6R |
| `content/profiles.seed.json` | Hồ sơ giàn mẫu (khe hở TAG); ngưỡng khác mặc định theo TBD503 Pleiku 2 |
| `content/overview.json`, `tools.json`, `cycle.json`, `review.json` | Tổng quan, dụng cụ, chu kỳ, điểm cần rà soát |

Văn bản hỗ trợ `**đậm**`. Sau khi sửa: `npm run build`; app trên điện thoại sẽ báo "Có phiên bản mới – Tải lại".

## Cấu trúc

- `src/calc/` – công thức thuần (mất cân bằng, đánh giá ngưỡng, quy đổi) – có unit test `tests/calc.spec.ts`
- `src/forms.ts` – biểu mẫu nhập số đo: render + tính trực tiếp + dòng kết quả cho biên bản
- `src/views/` – các màn hình; `src/router.ts` – hash router (render tuần tự)
- `src/store/db.ts` – IndexedDB (Dexie): sessions, measurements, checks, photos, profiles, instruments
- `src/export/` – PDF (jsPDF + font Be Vietnam Pro), XLSX (SheetJS), JSON sao lưu/khôi phục

## Chủ đề hiển thị

Đặt theo điều kiện làm việc, chọn ở ⚙️ Cài đặt (thẻ xem trước vẽ đúng màu từng chủ đề):

| Chủ đề | Dùng khi |
| --- | --- |
| Theo máy | Theo chế độ tối / tăng tương phản của điện thoại |
| Tiêu chuẩn | Trong nhà, ban ngày (xanh EVN NPT) |
| Ca đêm | Ngoài trời buổi tối – nền thép sẫm, điểm nhấn hổ phách |
| Nắng gắt | Nắng trực tiếp – đen/trắng thuần + vàng an toàn |
| Đêm đỏ | Vào chỗ tối (TAG house, sân trạm ban đêm) – chữ đỏ trên nền đen, ảnh và biểu tượng nhuộm đỏ, giữ thị lực thích nghi bóng tối |

Màu nằm trong `src/styles/tokens.css`. Sau khi sửa màu, chạy `npm run contrast` (kiểm tra WCAG, CI cũng chạy bước này). `public/theme-boot.js` áp chủ đề trước khi vẽ trang để không nháy màu.

## Ghi chú kỹ thuật

- Đồng hồ (15 phút cô lập, 60 s VAP, 30 s/5 s đảo cực GAMMA) tính theo timestamp lưu localStorage → đúng cả khi khóa màn hình.
- Cổng an toàn ở chế độ tra cứu (chưa chọn phiên) có hiệu lực 12 giờ; trong phiên thì lưu theo phiên và vào biên bản.
- Font PDF không có glyph Hy Lạp: trong PDF `Δ`→`Delta`, `∑`→`(tổng)`.
- CT3 & CT30 cùng 1 vòng "≈ 0": app tạm dùng |x| ≤ 0,2 A – cần chuyên gia xác nhận (xem `#/about`).

# TBD-GE Field – Knowledge Base & Kế hoạch refactor

> **Mục đích:** Nguồn tri thức duy nhất (Single Source of Truth) về nghiệp vụ, kiến trúc, quy tắc an toàn của **TBD-GE Field**, kèm **luồng sử dụng mục tiêu** và **kế hoạch refactor toàn bộ**. Dành cho kỹ sư phát triển, chuyên gia thí nghiệm và AI agent.
>
> **Cập nhật:** 26/11/2026 – nhánh `refactor/field-workflow` (tách từ `main` @ `54bb83d`), app `1.1.0`. Đã xong R0–R3.
>
> **Cách đọc:** Phần A = hiện trạng (đúng với mã nguồn). Phần B = đích đến (luồng, nhập liệu, mẫu BBTN). Phần C = kế hoạch refactor theo giai đoạn, mỗi giai đoạn có tiêu chí nghiệm thu.

---

# PHẦN A – HIỆN TRẠNG

## A1. Tổng quan

* **Tên:** Sổ tay TN Tụ bù dọc GE (`TBD-GE Field`). Phát triển: Hoàng Trọng – Công ty Truyền tải điện 3 (PTC3) – EVNNPT.
* **Bản chất:** PWA **offline-first** cho điện thoại/máy tính bảng, dùng tại sàn tụ (xe gàu), buồng TAG house, phòng điều khiển; nắng gắt, ban đêm, đeo găng, thường không có sóng.
* **Triển khai:** GitHub Pages `https://quantrong77.github.io/Test_TBD-GE/` (repo `quantrong77/Test_TBD-GE`, nhánh `main`, GitHub Actions tự deploy).
* **Mục tiêu:**
  1. Số hóa 7 hạng mục thí nghiệm nhất thứ giàn tụ bù dọc 500 kV GE (tài liệu GE + QĐ 1901/QĐ-EVNNPT).
  2. Cổng an toàn bắt buộc, đếm ngược 15 phút xả điện tích dư.
  3. Tự động tính toán và đánh giá Đạt / Cảnh báo / Không đạt.
  4. Biên bản thí nghiệm (BBTN) điện tử: số đo, ảnh có dấu kỹ thuật, ký xác nhận, xuất PDF/Excel/JSON, đồng bộ cả đội qua Google Drive.
  5. Theo dõi xu hướng nhiều kỳ.
  6. Dùng làm tài liệu **đào tạo** nhân viên mới (trình tự từng bước, ngưỡng, ảnh sơ đồ).
* **Tuyên bố bắt buộc (không được xóa khỏi UI/PDF):** *Ứng dụng chỉ hỗ trợ tra cứu và tính toán, không thay thế Phiếu công tác, Quy trình an toàn điện, Biện pháp kỹ thuật và mệnh lệnh của Chỉ huy trực tiếp.*

## A2. Nghiệp vụ – giàn tụ bù dọc 500 kV GE

### A2.1. Cấu trúc
* 3 pha A/B/C; mỗi pha 2 Group song song (G1 = Stack 1+2, G2 = Stack 3+4).
* Mỗi Group 24 chuỗi song song; mỗi chuỗi 6 bình nối tiếp. Stack 72 bình (12 chuỗi) chia theo Rack.
* Mẫu TBD503 Pleiku 2: C_unit = 13,05 µF → C_string = 2,175 µF → C_group = 52,2 µF → C∑ = 104,4 µF/pha; X_C ≈ 30,49 Ω ở 50 Hz.

### A2.2. 7 hạng mục (UI đánh số 1–7, mã nội bộ 4.1–4.7 – **không đổi `itemId`**)

| UI | Mã | Hạng mục | Phép thử `testId` → form / gate | Vị trí làm việc* |
| :-: | :-: | :-- | :-- | :-- |
| 1 | 4.1 | Tụ & Group tụ | `visual` → checklist / gate-visual; `unbalance` → unbalance / gate-hv | Sàn tụ |
| 2 | 4.2 | Chống sét van MOV | `install` → checklist / gate-visual; `measure` → mov / gate-visual | Sàn tụ |
| 3 | 4.3 | Kháng cản dịu | `measure` → reactor / gate-visual | Sàn tụ |
| 4 | 4.4 | Sứ xuyên TAG house | `measure` → bushing / gate-visual | Sàn tụ / TAG house |
| 5 | 4.5 | Tủ VAP & khe hở TAG ⚡ | `gap` → gap / gate-visual; `vap-threshold` → vap / gate-tag; `trigger` → trigger / gate-tag; `ct10` → ct10 / gate-inject | TAG house |
| 6 | 4.6 | Biến dòng CT rack | `inspect` → checklist / gate-visual | Sàn tụ |
| 7 | 4.7 | Bơm dòng nhất thứ CT | `inject` → inject / gate-inject | Sàn tụ + phòng điều khiển (HMI) |

\* Cột "Vị trí làm việc" là đề xuất cho luồng hiện trường (Phần B), **cần chuyên gia giàn tụ xác nhận**.

### A2.3. Thiết bị chuyên dụng
* **VAP Tester GE 31F246:** ENERGY (V/mC), CURRENT (A – DPM có thể âm → lấy trị tuyệt đối), EXT TRIG.
* **Nguồn GAMMA RR10-6R:** 0–10 kV DC đảo cực, thử đánh thủng khe TAG (theo dõi qua kẹp chia áp số 8: 5 V = 10 kV).
* **Cuộn vi sai 10 vòng + ampe kìm:** đo I_Δ giữa 2 Group.

## A3. Tính toán & đánh giá (`src/calc/`, hàm thuần, có test)

* **Mất cân bằng (`unbalance.ts`):** k = 10⁶/(2πf) ≈ 3183,1; C = k·I/U (µF) cho ∑, G1, G2; I_Δ = I_Δ×10 / 10; **%ΔC = I_Δ / I∑ × 100**; ΔC = |C_G1 − C_G2|.
* **Kết luận %ΔC** theo hồ sơ giàn: Đạt < `unbAlarm_pct` (0,16 %) ≤ Cảnh báo < `unbBypass_pct` (0,22 %) ≤ Không đạt.
* **Kiểm tra hợp lệ số đo:** lệch (I_G1 + I_G2) so với I∑ > 2 % → kiểm tra kẹp; C∑ lệch định mức > 5 % → nghi bình hỏng; chuỗi > x̄ + 2σ (≥ 3 chuỗi) → "String nghi ngờ"; so lần trước |Δ| > 20 % → "Bất thường".
* **Quy đổi nhiệt độ (`temp-correction.ts`):** Rcd về 20 °C: R20 = Rt·1,5^((t−20)/10); Rdc về 75 °C: R = Rt·(K+75)/(K+t), K = 228 (nhôm) / 234,5 (đồng). Dòng quy đổi ghi vào biên bản với kết luận `na`.
* **Số tiếng Việt (`units.ts`):** `parseNum` nhận cả `,` và `.`; hiển thị luôn dùng dấu phẩy; `foldVi` bỏ dấu để tìm kiếm.
* **Ngưỡng:** `content/thresholds.json` (op `<`, `<=`, `>=`, `range`, `approx0`; `profileOverride`; `abs`).

## A4. Quy tắc an toàn bất khả xâm phạm

1. **Cổng an toàn cưỡng bức:** 5 cổng trong `content/safety.json` (`gate-platform` 7 mục, `gate-hv` 4, `gate-tag` 4, `gate-visual` 2, `gate-inject` 3). Mọi phép thử gắn 1 cổng. Phải tích đủ + chọn người xác nhận; hiệu lực **12 giờ**.
2. **Cô lập 15 phút:** timer lưu mốc thực vào `localStorage` (`tbd.timer.*`), đếm đúng khi khóa máy/tải lại; cho nhập giờ cô lập thực tế (≥ 15 phút, ≤ 12 giờ trước).
3. **Bản chụp hồ sơ giàn (`profileSnap`, `instrumentSnap`)** khi tạo phiên – sửa hồ sơ sau không đổi kết quả cũ.
4. **Không mất số đo:** debounce 500 ms + ép lưu khi `visibilitychange`/`pagehide`/`route:leave`.
5. **Cực tính CT:** giá trị âm = đấu ngược → Không đạt. Chỉ DPM tủ VAP dùng `abs`.
6. **`FormDef.rows()` là nguồn duy nhất cho kết quả:** UI, tổng kết, PDF, Excel, xu hướng đều gọi qua `rows()`; không chép logic sang nơi khác.

## A5. Kiến trúc

### A5.1. Công nghệ
* Vanilla TypeScript, render template string vào `innerHTML`; Vite 8 + `vite-plugin-pwa` (precache toàn bộ).
* Dexie/IndexedDB: `sessions`, `measurements`, `checks`, `photos`, `signatures`, `profiles`, `instruments`, `trendHistory` (v3, chưa đồng bộ).
* MiniSearch (tìm không dấu), PhotoSwipe, jsPDF + autotable (font Be Vietnam Pro, ký tự Hy Lạp được thay chữ), SheetJS 0.20.3 (bản CDN).
* OCR 7 đoạn và watermark ảnh bằng Canvas, chạy trên máy.
* 5 chủ đề màu (Theo máy, Tiêu chuẩn, Ca đêm, Nắng gắt, Đêm đỏ); vùng chạm ≥ 48 px, chữ ≥ 16 px; thanh điều hướng đáy.

### A5.2. Máy chủ & đăng nhập
* **Google Apps Script** (`gas/`): `Core.gs` (logic thuần, test được bằng vm), `Code.gs` (Sheets/Drive/Mail, `setup()`), `appsscript.json`. Một file Google Sheets (mỗi bảng 1 tab `data_<table>`: team_id, id, data JSON, deleted, updated_at, updated_by) + thư mục ảnh Drive. `SERVER_VERSION = 2`.
* Gọi POST `text/plain` (tránh preflight). Đăng nhập Google Identity Services (popup) hoặc mã 6 số qua email → phiên HMAC 30 ngày, tự gia hạn ở mỗi `me`.
* Biến build: `VITE_GAS_URL`, `VITE_GOOGLE_CLIENT_ID` (GitHub repository variables; `.env.local` không commit). Không có `VITE_GAS_URL` → **chế độ dùng một mình** (không đăng nhập, không ký điện tử; dùng cho dev và e2e).
* **Cổng đăng nhập** (`auth/gate.ts` + `router.setGuard`): đăng nhập → khai hồ sơ (họ tên, chức danh, đơn vị) → chờ Quản trị duyệt → vào app. Trang công khai: Hướng dẫn, Giới thiệu.
* **Sửa `gas/*.gs` ⇒ phải dán lại vào Apps Script và Deploy → Manage deployments → New version.**

### A5.3. Đồng bộ offline-first (`src/sync/`)
* Luôn ghi IndexedDB trước; hook Dexie (`meta.ts`) gắn `_dirty`, `_mt`; xóa mềm (tombstone); thay đổi cục bộ chưa đẩy thắng bản kéo về.
* `engine.ts` (push/pull qua interface `Remote`), `runner.ts` (tự đồng bộ), `gas.ts` (client máy chủ, phát hiện máy chủ cũ → thông báo cập nhật), `status.ts`.

### A5.4. Vai trò (`auth/roles.ts`, máy chủ kiểm tra lại)

| Hành động | Quản trị | Chỉ huy | Nhân viên TN | Chỉ xem |
| :-- | :-: | :-: | :-: | :-: |
| Tạo/sửa phiên | ✓ | ✓ | | |
| Nhập số đo, cổng an toàn, ảnh | ✓ | ✓ | ✓ | |
| Ký ô **Người thí nghiệm** | | ✓ | ✓ | |
| Ký ô **Chỉ huy trực tiếp** (khóa biên bản) | | ✓ | | |
| Cấu hình: hồ sơ giàn, máy TN, mốc xu hướng, nhập JSON | ✓ | | | |
| Quản lý người dùng, thu hồi chữ ký | ✓ | | | |

### A5.5. Ký biên bản (`sign/sign.ts`) – **đã bỏ ô Đơn vị QLVH (26/11/2026)**
* Chỉ còn **2 ô**: Người thí nghiệm (`tester`, ký số liệu – không gồm kết luận) và Chỉ huy trực tiếp (`leader`, ký toàn bộ gồm kết luận; mỗi phiên 1 chữ ký; ký xong → **khóa** phiên trên máy và máy chủ; chỉ Quản trị thu hồi).
* Mã SHA-256 trên nội dung chuẩn hóa; khi xuất kiểm tra lại "Khớp nội dung lúc ký" / "NỘI DUNG ĐÃ THAY ĐỔI SAU KHI KÝ".
* Dữ liệu cũ có ô `qlvh`: vẫn nhập được từ JSON nhưng bị bỏ qua khi hiển thị/xuất; máy chủ mới từ chối ghi ô `qlvh`.
* Khối ký trên PDF/Excel do `export/signers.ts` dựng: cột trái Người thí nghiệm, cột phải Chỉ huy trực tiếp, "(Ký, ghi rõ họ tên)". Người đã ký điện tử in kèm thời điểm; người chưa ký vẫn in sẵn tên (thành viên/Chỉ huy của phiên) chừa chỗ **ký tay** trên bản in. Có bảng mã kiểm tra chữ ký điện tử nếu có.

### A5.6. Màn hình (`src/main.ts`)

| Route | Chức năng |
| :-- | :-- |
| `#/` | Trang chủ: 7 hạng mục, an toàn, công cụ |
| `#/items`, `#/item/:itemId`, `#/item/:itemId/test/:testId/step/:n` | Hạng mục, chi tiết, làm từng bước |
| `#/gate/:gateId` | Cổng an toàn + timer 15 phút |
| `#/overview`, `#/safety`, `#/tools`, `#/cycle`, `#/about`, `#/thresholds`, `#/equipment/...`, `#/search` | Tra cứu |
| `#/sessions`, `#/session-new`, `#/session/:id`, `#/session/:id/form/:itemId/:testId` | Phiên TN, nhập số đo, ký, xuất |
| `#/calc/unbalance` | Máy tính %ΔC (OCR, ghi vào mục 1.B) |
| `#/trend/:profileId?` | Xu hướng nhiều kỳ |
| `#/profiles`, `#/profile/:id`, `#/instruments` | Cấu hình (Quản trị) |
| `#/settings`, `#/help`, `#/info` | Cài đặt, hướng dẫn, giới thiệu |
| `#/login`, `#/register`, `#/account`, `#/admin`, `#/users` | Đăng nhập/đăng ký/chờ duyệt, quản trị, người dùng |

### A5.7. Thư mục chính
```text
content/   items, thresholds, safety, equipment, overview, tools, cycle, review, images, profiles.seed, help (.json)
src/
  main.ts router.ts content.ts types.ts ui.ts settings.ts pwa.ts
  domain/session.ts   # SessionData, loadSessionData, testState, itemState, TYPE_LABEL (R1)
  forms/              # index (FORMS, formFor, evaluateTest), types, inputs, checklist, unbalance,
                      # compare (mov, reactor), bushing, tag (gap, vap, trigger, ct10), inject (R2)
  auth/               # roles, session, gate, notify
  calc/               # unbalance, evaluate, isolation, units, temp-correction, trend, ocr, watermark
  components/         # Chrome, Icons, Timer, OcrModal, ImageViewer, UserMenu
  export/             # report (mô hình biên bản), signers (khối ký), pdf, xlsx, json, exporters
  sign/ store/ sync/ styles/ views/
gas/       Core.gs Code.gs appsscript.json README.md
tests/     calc, sync, gas-core, auth-ui, signers, architecture, forms (snapshot) (.spec.ts) + e2e/ (Playwright Pixel 7)
```

### A5.8. Lệnh
```bash
npm run dev        # http://localhost:5173
npm test           # vitest – 7 file, 122 test (26/11/2026)
npm run build      # tsc + vite build PWA
npm run test:e2e   # Playwright tự build bản dùng-một-mình (VITE_GAS_URL rỗng); 25 test
npm run contrast   # kiểm tra tương phản WCAG các chủ đề
```

### A5.9. Nợ kỹ thuật đã thấy (đầu vào cho Phần C)
1. ~~Phân tầng ngược `export/` → `views/`~~ – đã sửa ở R1; `tests/architecture.spec.ts` chặn tái phát.
2. **File lớn:** ~~`forms.ts` 620~~ (đã tách ở R2); còn `calc/trend.ts` 592, `views/Session.ts` ~460 (gộp chi tiết phiên + biểu mẫu + ảnh + ký → R5).
3. ~~CSS nội tuyến~~ – R3 đã chuyển sang class trong `base.css` (chỉ còn 2 kích thước tính động: thanh tiến độ, cột biểu đồ chuỗi).
4. **Con người là chuỗi tự do:** `session.leader`, `session.members`, `gate.confirmedBy` là text; không liên kết tài khoản ký → tên trên chữ ký điện tử và tên in có thể lệch.
5. **Thứ tự nhập theo tài liệu GE (1→7)**, không theo vị trí làm việc thực tế; không có chỉ báo "còn thiếu ô nào" cho từng pha.
6. **Ngưỡng xu hướng viết cứng** trong `METRIC_DEFS`; `trendHistory` chưa đồng bộ máy chủ.
7. **Mẫu BBTN** chưa có tiêu đề đơn vị / quốc hiệu / số biên bản.

---

# PHẦN B – ĐÍCH ĐẾN

## B1. Luồng sử dụng theo vai trò

```text
QUẢN TRỊ (văn phòng, có mạng)
  1. Duyệt tài khoản, gán vai trò (Chỉ huy / Nhân viên TN / Chỉ xem)
  2. Hồ sơ giàn: số bình, C định mức, ngưỡng alarm/bypass, khe TAG
  3. Danh mục máy TN + hạn kiểm định
        │
CHỈ HUY TRỰC TIẾP (trước khi đi, có mạng → đồng bộ)
  4. Tạo phiên: giàn tụ, ngày, loại (sau lắp đặt / sau 1 năm / định kỳ)
     chọn Chỉ huy + thành viên TỪ DANH SÁCH TÀI KHOẢN đã duyệt (ghi chú ATVSV)
     chọn máy TN (cảnh báo quá hạn kiểm định)
  5. Đồng bộ → mọi máy trong đội có phiên, dùng được offline
        │
HIỆN TRƯỜNG (offline)
  6. Cổng "Lên sàn tụ" + timer 15 phút (hoặc nhập giờ cô lập theo phiếu)
  7. Màn hình "Làm việc" theo VỊ TRÍ: Sàn tụ → TAG house → Phòng điều khiển
     mỗi phép thử: cổng riêng → (tùy chọn) xem từng bước → nhập theo pha A/B/C
  8. Nhập số: bàn phím số, OCR 📷, tự sang ô kế, kết quả tô màu ngay,
     cảnh báo nghi nhập sai; chụp ảnh có dấu kỹ thuật
  9. Thanh tiến độ: hạng mục × pha (○ chưa / ⏳ dở / ✅ ⚠️ ❌)
        │
KẾT THÚC
 10. Rà soát: danh sách Không đạt / Cảnh báo / ô còn trống
 11. Kết luận, kiến nghị: app GỢI Ý bản nháp từ các dòng ❌/⚠️, Chỉ huy sửa
 12. Người thí nghiệm ký (số liệu) → Chỉ huy trực tiếp ký (toàn bộ) → KHÓA
 13. Xuất BBTN PDF/Excel, chia sẻ; đồng bộ khi có mạng
        │
SAU ĐÓ
 14. Xu hướng giàn tụ tự cập nhật từ phiên mới; Quản trị sao lưu định kỳ
```

## B2. Nguyên tắc nhập liệu & đánh giá cho hiện trường

| # | Nguyên tắc | Cụ thể |
| :-: | :-- | :-- |
| 1 | Một tay, đeo găng | Ô nhập và nút ≥ 48 px, ô số `inputmode="decimal"`, nút chính ở nửa dưới màn hình |
| 2 | Theo pha, theo vị trí | Chọn pha 1 lần, cố định trên đầu; nhóm phép thử theo vị trí làm việc thay vì thứ tự tài liệu |
| 3 | Nhập nhanh | Enter/“Tiếp” nhảy ô kế; OCR xác nhận trước khi điền; “Lấy số lần trước” cho ô so sánh |
| 4 | Bắt lỗi nhập sai sớm | Ngoài ngưỡng Đạt/Không đạt, thêm cảnh báo **“nghi nhập sai”**: lệch ≥ 10× so với định mức/lần trước, sai đơn vị (mA ↔ A), dấu âm bất thường |
| 5 | Đánh giá minh bạch | Mỗi dòng kết quả hiện: giá trị → yêu cầu → kết luận và **lý do** (ngưỡng nào, từ hồ sơ giàn nào) |
| 6 | Biết còn thiếu gì | Mỗi phép thử/pha báo “còn N ô trống”; không chặn lưu, nhưng nhắc trước khi ký |
| 7 | Không mất số | Giữ cơ chế lưu tức thì; khóa sau khi Chỉ huy ký |
| 8 | Nhìn được mọi điều kiện ánh sáng | Không CSS nội tuyến; mọi màu qua token theme; e2e tương phản phủ mọi màn hình |
| 9 | An toàn trước số liệu | Chưa qua cổng → vẫn xem được, nhưng hiện cảnh báo đỏ cố định trên biểu mẫu |

## B3. Mẫu BBTN xuất ra (PDF & Excel cùng một mô hình `buildReport`)

```text
CÔNG TY TRUYỀN TẢI ĐIỆN 3            CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM      ← (C5)
<ĐỘI / ĐƠN VỊ thí nghiệm>              Độc lập – Tự do – Hạnh phúc
Số: …/BB-TN                                                                   ← (C5)
          BIÊN BẢN THÍ NGHIỆM NHẤT THỨ GIÀN TỤ BÙ DỌC 500 kV – HÃNG GE
I.   Thông tin chung: trạm, giàn, ngày, loại TN, Chỉ huy, thành viên, thông số hồ sơ giàn
II.  Thiết bị thí nghiệm: model, serial, hạn kiểm định (QUÁ HẠN in đỏ)
III. Điều kiện an toàn: cổng, người xác nhận, thời điểm, giờ cô lập
IV.  Kết quả theo hạng mục 1–7: Nhóm | Nội dung | Giá trị | Yêu cầu | Kết quả
V.   Tổng kết Đạt / Cảnh báo / Không đạt + Kết luận, kiến nghị
VI.  Ảnh hiện trường (có dấu kỹ thuật)
VII. Xác nhận                                   <Trạm>, ngày …
       NGƯỜI THÍ NGHIỆM                 CHỈ HUY TRỰC TIẾP
      (Ký, ghi rõ họ tên)               (Ký, ghi rõ họ tên)
      [Đã ký điện tử hh:mm]             [Đã ký điện tử hh:mm]
        Họ tên từng người                    Họ tên
     Bảng mã kiểm tra chữ ký điện tử (SHA-256) – chỉ khi có ký điện tử
```
* **Không có ô Đại diện đơn vị QLVH.** (Đã làm – mục VII.)
* Người chưa ký điện tử (hoặc chế độ dùng một mình) → in tên, chừa chỗ ký tay.

---

# PHẦN C – KẾ HOẠCH REFACTOR

**Nhánh:** `refactor/field-workflow`. Mỗi giai đoạn: một hoặc vài commit, `npm test` + `npm run build` + `npm run test:e2e` xanh, không đổi `itemId`/`testId`/khóa số đo, dữ liệu cũ đọc được (Dexie tăng version + migration nếu đổi schema). Đổi `gas/*.gs` → tăng `SERVER_VERSION` khi thêm thao tác, ghi rõ cần deploy lại.

| GĐ | Nội dung | Tệp chính | Nghiệm thu |
| :-: | :-- | :-- | :-- |
| **R0** ✅ | Bỏ ô ký QLVH; khối ký 2 cột Người TN – CHTT, in tên để ký tay | `types`, `roles`, `sign`, `export/signers|pdf|xlsx|report`, `gas/Core.gs` | `tests/signers.spec.ts`; e2e xuất PDF; máy chủ từ chối `qlvh` |
| **R1** ✅ | **Tầng domain:** chuyển `loadSessionData`, `testState`, `itemState`, `sessionInstruments`, `TYPE_LABEL` sang `src/domain/session.ts`; `export/` và `views/` chỉ phụ thuộc `domain/` | `views/Session.ts`, `views/Sessions.ts`, `export/*` | Không còn import `../views/` ngoài `main.ts`; test hiện có xanh |
| **R2** ✅ | **Tách biểu mẫu:** `src/forms/` – `inputs.ts` (numRow/selRow/textRow/paintRows), mỗi form 1 file, `index.ts` giữ `FORMS`, `formFor`, `evaluateTest`; test `rows()` cho từng form | `forms.ts` | Mỗi file < 200 dòng; test snapshot `rows()` 9 form |
| **R3** ✅ | **Bỏ CSS nội tuyến:** class + token trong `base.css`; helper `html`/`attr` tự escape | views, forms, components | `grep 'style="'` ≈ 0; e2e tương phản xanh |
| **R4** | **Con người gắn tài khoản:** phiên lưu `crew: {userId?, name, role: 'leader'|'tester', atvsv?}[]` (giữ `leader`/`members` cho dữ liệu cũ); tạo phiên chọn từ danh sách tài khoản đã duyệt (dùng một mình: gõ tay); cổng an toàn chọn từ `crew` | `types`, `views/Sessions`, `SafetyGate`, `signers`, `gas/Core.gs` (thao tác `teamMembers`) | Tên in BBTN = tên tài khoản ký; phiên cũ hiển thị đúng |
| **R5** | **Luồng hiện trường:** màn hình “Làm việc” nhóm theo vị trí; tiến độ hạng mục × pha; “còn N ô trống”; Enter → ô kế; cảnh báo nghi nhập sai; tách `views/Session.ts` thành `SessionHome`, `SessionForm`, `SessionSign`, `photos` | `views/session/*`, `content/items.json` (thêm `location`), `calc/sanity.ts` | e2e: làm trọn 1 phiên bằng bàn phím; unit test sanity |
| **R6** | **Kết luận & BBTN chuẩn:** gợi ý kết luận từ dòng ❌/⚠️; tiêu đề đơn vị + quốc hiệu + số biên bản (cấu hình trong hồ sơ đội/Quản trị); nhắc ô trống trước khi ký | `export/*`, `views/session/SessionSign` | PDF đúng mẫu B3; Excel cùng nội dung |
| **R7** | **Xu hướng & ngưỡng:** ngưỡng `METRIC_DEFS` → `thresholds.json`/hồ sơ giàn; đồng bộ `trendHistory` (thêm vào `TABLES` + `SYNC_TABLES`); tách `calc/trend.ts` (tính) và vẽ SVG | `calc/trend*`, `gas/Core.gs`, `sync/` | Hai máy thấy cùng mốc lịch sử; test xu hướng xanh |
| **R8** | **Dọn & tài liệu:** `/simplify`, `/code-review`, cập nhật `AGENTS.md`, `knowledge.md`, `content/help.json` theo luồng mới | toàn bộ | Review không còn lỗi mức quan trọng |

**Thứ tự khuyến nghị:** R1 → R2 → R3 (thuần kỹ thuật, không đổi hành vi) rồi R4 → R5 → R6 (đổi trải nghiệm, cần người dùng thử ngoài hiện trường) → R7 → R8.

**Câu hỏi cần chuyên gia/đơn vị chốt trước R4–R6:**
1. Vị trí làm việc của từng phép thử (cột * ở A2.2) và thứ tự làm thực tế.
2. Mẫu tiêu đề BBTN: tên đơn vị cấp trên/cấp dưới, cách đánh số biên bản.
3. Người thí nghiệm ký: từng người hay chỉ người chịu trách nhiệm chính?
4. Ngưỡng “nghi nhập sai” cho từng loại số đo.

## Phụ lục – Điểm kỹ thuật cần rà soát (từ `content/review.json`)
1. CT3 & CT30 (mục 7) cùng vòng dây kỳ vọng ≈ 0 – tạm ngưỡng |x| ≤ 0,2 A, chờ chuyên gia duyệt.
2. GAMMA tối đa 10 kV, thử Trigger cần ±10,0 kV – giám sát qua kẹp chia áp số 8.
3. Trigger: đọc ENERGY (mC) trong 0,5 s sau xung; các lần thử cách nhau ≥ 1 phút.
4. Bắt buộc chọn đúng hồ sơ giàn trước khi thí nghiệm.
5. OCR chỉ gợi ý; luôn đối chiếu màn hình đồng hồ; chưa có bộ ảnh thử thực tế.

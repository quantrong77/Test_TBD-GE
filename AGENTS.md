# AGENTS.md – Ngữ cảnh dự án cho AI agent

> Đọc file này trước khi sửa code. Mô tả **app làm gì, vì sao làm vậy, và những gì không được phá**.
> Chi tiết lệnh chạy, cách sửa nội dung: `README.md`. Đặc tả gốc (ngoài repo): `../TRIEN_KHAI_WEBAPP_THI_NGHIEM_TBD_GE.md`.

## 1. App là gì

**TBD-GE Field – Sổ tay TN Tụ bù dọc GE**: PWA chạy trên điện thoại, **offline-first**, giúp nhân viên thí nghiệm EVN NPT tra cứu nhanh và ghi kết quả khi thí nghiệm nhất thứ **giàn tụ bù dọc (TBD) 500 kV hãng GE**.

- Người dùng: chỉ huy trực tiếp + nhân viên thí nghiệm (có ATVSV), làm việc trên sàn tụ (xe gàu), trong TAG house, ngoài nắng, ban đêm, **đeo găng tay**, **thường không có sóng**.
- Hệ quả thiết kế: chữ ≥ 16 px, nút ≥ 48×48 px, điều hướng ở đáy, không dựa vào âm thanh, chủ đề màu theo điều kiện làm việc, mọi thứ chạy offline.
- **App chỉ là tài liệu tham khảo**, không thay thế phiếu công tác, quy trình an toàn, mệnh lệnh chỉ huy. Câu này phải còn trên giao diện (Giới thiệu, Hướng dẫn, An toàn, chân PDF).
- Triển khai: GitHub Pages `https://quantrong77.github.io/Test_TBD-GE/` (repo `quantrong77/Test_TBD-GE`, nhánh `main`, tự deploy qua Actions).
- Người phát triển: Hoàng Trọng – PTC3 (thông tin liên hệ trong `src/views/Info.ts`).

## 2. Thuật ngữ nghiệp vụ

| Thuật ngữ | Nghĩa |
| --- | --- |
| TBD | Tụ bù dọc (series capacitor) mắc nối tiếp đường dây 500 kV |
| Giàn / sàn tụ (platform) | Sàn thép trên cột sứ, **mang điện áp đường dây** khi vận hành |
| Group, String, Unit | Mỗi pha 2 group; mỗi group 24 string × 6 bình nối tiếp (bình 13,05 µF → 104,4 µF/pha) |
| MOV | Điện trở phi tuyến ZnO bảo vệ tụ (hạng mục 4.2) |
| TAG / Triggered Air Gap | Khe phóng điện có kích, bảo vệ MOV; nằm trong TAG house cùng tụ C1, C2 |
| VAP (VAP-A, VAP-B) | Tủ giám sát dòng/năng lượng MOV và phát lệnh kích TAG; 2 tủ mỗi pha |
| VAP Tester GE 31F246 | Máy thử VAP (TEST SELECT: ENERGY V / mC, CURRENT A, EXT TRIG) |
| GAMMA RR10-6R | Nguồn cao áp DC 0–10 kV đảo cực tính, nạp C1/C2 cho thử Trigger ±10 kV |
| CT rack, PFOI, GFOI, HMI | Biến dòng trên sàn → truyền quang → tủ dưới đất → PLC → màn hình HMI |
| Mất cân bằng điện dung (%ΔC) | Thử 4.1.B: cấp 200–300 Vac, đo I∑, IG1, IG2, IΔ×10 (cuộn 10 vòng) |
| Hồ sơ giàn (profile) | Bộ ngưỡng riêng từng giàn (ΔC alarm/bypass, VAP, khe hở TAG…) |
| Phiên thí nghiệm (session) | Một đợt thí nghiệm một giàn: thành viên, máy TN, số đo, ảnh, biên bản |

7 hạng mục (mã dùng khắp nơi): **4.1** Tụ & group · **4.2** MOV · **4.3** Kháng cản dịu · **4.4** Sứ xuyên TAG house · **4.5** VAP & TAG ⚡ (nguy hiểm nhất) · **4.6** CT rack · **4.7** Bơm dòng nhất thứ.

## 3. Công nghệ

Vite 8 + **TypeScript thuần (không framework)**, render bằng template string vào `innerHTML`. Dexie (IndexedDB), vite-plugin-pwa (Workbox precache), MiniSearch, PhotoSwipe v5, jsPDF + jspdf-autotable (font Be Vietnam Pro nhúng), SheetJS xlsx (bản CDN 0.20.3, không phải npm 0.18). Test: Vitest (calc) + Playwright (e2e, thiết bị Pixel 7).

## 4. Bản đồ mã nguồn

```text
content/            NỘI DUNG (sửa không cần lập trình) – JSON, chữ hỗ trợ **đậm**
  items.json        7 hạng mục → tests → steps/checklist/table/tips; field `form` chọn biểu mẫu, `gate` chọn cổng an toàn
  thresholds.json   ngưỡng: op < <= >= range approx0; profileOverride; abs
  safety.json       5 cổng an toàn (checks, timer giây) + rủi ro + disclaimer
  equipment.json    2 máy TN; section `quick` có steps với timer/lock
  help.json         Hướng dẫn sử dụng (7 mục); overview/tools/cycle/review/profiles.seed/images.json
src/
  main.ts           đăng ký route
  router.ts         hash router, render TUẦN TỰ vào khung tách rời, quản lý cuộn
  content.ts        nạp JSON, gatesFor(), seedProfiles(), PROFILE_DEFAULTS (TBD503 Pleiku 2)
  types.ts          kiểu dữ liệu
  ui.ts             esc(), rich(), callout(), gallery(), toast()…
  settings.ts       chủ đề + cỡ chữ (đồng bộ với public/theme-boot.js)
  forms.ts          FORMS: render / live / rows cho từng biểu mẫu – nguồn duy nhất cho đánh giá + biên bản
  calc/             hàm THUẦN có unit test: unbalance, evaluate, units (parseNum, foldVi), isolation
  store/db.ts       Dexie: sessions, measurements, checks, photos, profiles, instruments
  views/            mỗi màn hình một View(route, el)
  components/       Chrome (topbar/nav), Timer, ImageViewer
  export/           report.ts (dữ liệu biên bản) → pdf.ts / xlsx.ts / json.ts (sao lưu, nhập)
  store/validate.ts kiểm tra kiểu dữ liệu từ nguồn ngoài (file JSON, Supabase) – dùng chung
  sync/             đồng bộ Supabase: meta.ts (hook Dexie đánh dấu thay đổi), engine.ts (đẩy/kéo, độc lập Supabase),
                    status.ts (cấu hình + trạng thái, luôn tải), supabase.ts (client, đăng nhập, chạy tự động – tải lười)
supabase/           migrations/0001_init.sql (bảng + RLS + Storage), seed-team.sql, README.md (hướng dẫn cài)
  styles/           tokens.css (chủ đề), base.css
public/             images/ (34 ảnh), fonts/, icons/, theme-boot.js
scripts/            contrast.mjs (WCAG), image-manifest.mjs, make-icons.mjs
tests/              calc.spec.ts, e2e/app.spec.ts, e2e/contrast-audit.spec.ts
```

Route chính: `#/`, `#/items`, `#/item/:id`, `#/item/:id/test/:tid/step/:n`, `#/gate/:gateId?next=`, `#/thresholds`, `#/search?q=`, `#/equipment/:eqId/:section`, `#/sessions`, `#/session-new`, `#/session/:id`, `#/session/:id/form/:item/:test`, `#/profiles`, `#/profile/:id`, `#/instruments`, `#/calc/unbalance`, `#/settings`, `#/help?s=`, `#/info`, `#/about` (= ghi chú rà soát nội dung, không phải trang giới thiệu).

## 5. Tính năng

**Tra cứu (offline):** trang chủ 7 thẻ + băng đỏ "An toàn trước khi lên sàn"; trang hạng mục có tab dính (Mục đích, Dụng cụ, An toàn, Trình tự, Ngưỡng, Hình ảnh); ảnh pinch-zoom; ngưỡng nhanh theo hồ sơ giàn của phiên đang làm; tìm kiếm không dấu ("khang can diu"); thư viện 2 máy TN có thao tác nhanh kèm đồng hồ; dụng cụ (checklist lưu máy), chu kỳ, tổng quan thiết bị; máy tính mất cân bằng độc lập.

**Cổng an toàn + chế độ từng bước:** bấm "Bắt đầu từng bước" → app buộc qua `gate-platform` rồi cổng riêng của phép thử (`gate-hv`, `gate-tag`, `gate-visual`, `gate-inject`) mới vào trình tự. Bước chữ to, nút đáy, đồng hồ chờ; bước có `lock` khóa nút tiếp tới khi hết giờ.

**Phiên thí nghiệm:** tạo phiên (hồ sơ giàn, loại, ngày, chỉ huy, thành viên, máy TN – cảnh báo quá hạn kiểm định); biểu mẫu theo pha A/B/C, tự tô Đạt/Cảnh báo/Không đạt; phân tích string (> TB + 2σ); so sánh lần trước; ảnh hiện trường (nén ≤ 1600 px); tiến độ 4.1 ✅ 4.2 ⏳; kết luận; xuất **PDF / Excel / JSON**, chia sẻ PDF (Web Share).

**Tài khoản, đồng bộ, ký (Supabase, đồng bộ TẮT mặc định):** ⚙️ → Tài khoản và đồng bộ → Google hoặc mã 6 số qua email (dự phòng cho iOS PWA) → admin duyệt ở `#/users` → bật đồng bộ. 4 vai trò: admin, leader, tester, viewer. Đồng bộ toàn bộ kể cả ảnh (Storage). Ký xác nhận điện tử ở trang phiên, Chỉ huy ký thì khóa biên bản; chữ ký in vào PDF/Excel. Không đăng nhập vẫn dùng được như trước, trừ ký. Cài đặt máy chủ: `supabase/README.md`.

**Khác:** 5 chủ đề (Theo máy, Tiêu chuẩn, Ca đêm, Nắng gắt, Đêm đỏ) chọn bằng thẻ xem trước; cỡ chữ; sao lưu/khôi phục JSON; Hướng dẫn (📖) và Giới thiệu (ℹ️) cạnh ⚙️; báo "Có phiên bản mới – Tải lại".

## 6. Quy tắc KHÔNG được phá (an toàn & tính đúng)

1. **Cổng an toàn không được bỏ qua.** Nút xác nhận chỉ bật khi đủ tích + có người xác nhận. Xác nhận hết hiệu lực **12 giờ** ở mọi phạm vi (`getGateCheck`). Trong phiên, tên người xác nhận chọn từ danh sách đội.
2. **Đồng hồ 15 phút cô lập tụ tính theo timestamp** (localStorage `tbd.timer.*`), không theo số lần setInterval; mốc > 12 h coi như chưa bắt đầu; "Làm lại checklist" và hết hạn cổng phải xóa đồng hồ (`clearTimers`). Cho phép **nhập giờ cô lập thực tế** (`calc/isolation.ts`): đủ 15 phút mới mở khóa, giờ tương lai = hôm trước, > 12 h bị từ chối, ghi vào biên bản là "nhập tay".
3. **Ngưỡng lấy theo hồ sơ giàn**; phiên lưu **bản chụp** `profileSnap`/`instrumentSnap` lúc tạo → sửa hồ sơ không đổi kết quả cũ (có nút áp lại có chủ đích).
4. **Công thức mất cân bằng** (mục 9.1 đặc tả): C[µF] = 10⁶/(2πf)·I/U = 3183,1·I/U ở 50 Hz; IΔ thực = IΔ×10 / 10 (có bộ chọn A/mA/µA); %ΔC = IΔ/I∑·100; < alarm → Đạt, alarm ≤ x < bypass → Cảnh báo, ≥ bypass → Không đạt. Có unit test – đổi công thức phải sửa test có lý do.
5. `abs: true` chỉ cho VAP CURRENT (DPM hiển thị số âm). Số CT âm (đảo cực) **phải** là Không đạt.
6. `parseNum`: "4,36" và "4.36" = 4,36; một dấu chấm = thập phân (bàn phím Android); nhiều dấu chấm hoặc có cả `.` lẫn `,` = phân cách nghìn.
7. `forms.ts` là **nguồn duy nhất** cho đánh giá: giao diện, trang tổng kết, PDF, Excel đều đi qua `FormDef.rows()`. Đừng tính lại ở chỗ khác.
8. **Không mất số đo** (NF5): ghi debounce 500 ms + ghi ngay khi `visibilitychange`/`pagehide`/rời trang.
9. **Đồng bộ là offline-first và tắt mặc định.** App luôn ghi IndexedDB trước. Đơn vị phải cho phép trước khi bật (dữ liệu rời máy, máy chủ Singapore) – giữ công tắc, cảnh báo và hộp xác nhận.
10. **Theo dõi thay đổi bằng hook Dexie** (`sync/meta.ts`): mọi ghi của người dùng tự có `_dirty/_mt`; ghi từ máy chủ mang `_rv` nên không bị đánh dấu lại; xóa → tombstone. Không ghi DB bằng đường vòng né hook. Xóa cờ sau khi đẩy chỉ khi `_mt` không đổi (sửa trong lúc đẩy không mất). Bản ghi chưa gửi thắng bản kéo về.
11. **Không xóa cứng trên máy chủ** (chỉ `deleted = true`); RLS không có chính sách DELETE. Dữ liệu kéo về **phải** qua `store/validate.ts`; ảnh chỉ nhận jpeg/png/webp và đường dẫn trong thư mục đội.
12. **Chỉ anon/publishable key** trong app (biến `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, GitHub repository variables). Không bao giờ dùng service_role. File JSON xuất/nhập bỏ trường `_dirty/_mt/_rv` (`stripMeta`).
13. Cổng an toàn chế độ tra cứu (`sessionId = '_local'`) không bao giờ gửi lên.
14. **Quyền thật nằm ở RLS** (`supabase/migrations/0002`), `src/auth/roles.ts` chỉ để ẩn nút; đổi quyền phải sửa cả hai và test `tests/supabase-schema.spec.ts`. Tài khoản mới luôn `pending`, trừ email trong `team_members`. Admin không sửa được chính mình.
15. **Chữ ký:** `signSession` băm nội dung bằng SHA-256 (ô `tester` không gồm kết luận). Chữ ký Chỉ huy còn hiệu lực = biên bản khóa (`session_locked` trên máy chủ, `isLocked` trên máy). Chỉ admin thu hồi. Chữ ký gửi sau cùng trong `SYNC_TABLES`. Ký cần tài khoản đã duyệt; đây là xác nhận nội bộ, không phải chữ ký số pháp lý.
16. Dữ liệu mẫu mang `_rv: 'seed'`, không tự gửi lên. Thay đổi bị máy chủ từ chối (`RefusedError`) thì bỏ và kéo lại bản máy chủ, không thử lại mãi.

## 7. Quyết định kỹ thuật cần biết

- **Router render tuần tự, vào khung tách rời rồi mới thay** (`app.replaceChildren(host)`). View nhận `el` là khung chưa gắn DOM → **không** gọi `focus()`, đo kích thước hay truy vấn `#app` trong lúc dựng; việc cần DOM thật dùng `requestAnimationFrame` hoặc `onRendered()`. Sự kiện `route:leave` phát **trước** khi dựng trang mới.
- Cuộn: `history.scrollRestoration = 'manual'`; quay lại → vị trí cũ, trang mới → đầu trang, vẽ lại cùng trang → giữ nguyên.
- Topbar luôn giữ chỗ nút ←; bottom nav dựng một lần, chỉ đổi `aria-current`.
- **Bảo mật:** mọi giá trị động vào HTML phải qua `esc()` (`rich()` = esc + `**đậm**`). Có CSP trong `index.html` (`script-src 'self'` → không dùng script inline; vì vậy `theme-boot.js` là file ngoài). `?next=` của cổng chỉ nhận route nội bộ `#/…`. Nhập JSON kiểm tra kiểu từng bản ghi trước khi ghi; ảnh chỉ nhận jpeg/png/webp (không SVG).
- **Chủ đề:** màu chỉ khai báo trong `src/styles/tokens.css` dưới dạng biến; selector `[data-theme]` dùng được trên phần tử con (thẻ xem trước). Thêm màu mới → thêm cặp vào `scripts/contrast.mjs`. Không viết rule có độ ưu tiên cao đè màu chữ (lỗi cũ: `[data-theme='contrast'] a` làm nút chữ vàng trên nền vàng) – dùng `:where()`.
- **PDF:** font Be Vietnam Pro không có Δ ∑ σ Ω → `pdfText()` trong `export/pdf.ts` thay thế. Mọi chữ vào PDF phải qua đó.
- `base: './'` + đường dẫn tương đối để chạy dưới đường dẫn con GitHub Pages. Phụ thuộc tùy chọn của jsPDF (html2canvas, purify, canvg) bị loại khỏi precache. Ngân sách tải lần đầu ≤ 5 MB (hiện ~4,4 MB).
- Phiên bản app (`__APP_VERSION__` từ package.json) và ngày build (`__BUILD_DATE__`) gắn lúc build.

## 8. Lệnh & kiểm thử

```bash
npm run dev          # phát triển
npm test             # 60 test: calc (34), lược đồ + RLS Supabase trên PGlite (12), đồng bộ + vai trò + ký với IndexedDB giả (14)
npm run contrast     # WCAG cho mọi chủ đề – CI chạy bước này
npm run build        # tsc + vite build → dist/
npm run test:e2e     # Playwright, chạy trên bản build (nhớ build trước)
```

E2E gồm: offline (chế độ máy bay), cổng an toàn & đồng hồ, tự lưu + tính %ΔC + xuất file, tìm không dấu, khóa bước, nhập JSON độc hại bị từ chối, ổn định bố cục, **đo tương phản thật trên màn hình ở 4 chủ đề** (`contrast-audit.spec.ts`).

**Quy ước làm việc:** viết test trước khi sửa logic (calc → Vitest, hành vi UI → Playwright); chạy cả 3 bộ (test, contrast, e2e) trước khi commit. Giao diện, comment và nội dung bằng **tiếng Việt**, giọng ngắn gọn, động từ chủ động.

## 9. Bẫy môi trường (máy Windows của chủ dự án)

- Playwright Chromium **luôn hủy (canceled) mọi file tải xuống**, kể cả blob 5 byte → test bắt Blob ngay trong trang (patch `HTMLAnchorElement.prototype.click`). Không phải lỗi app.
- Không có poppler; xem PDF bằng Python `pymupdf`.
- Không có GitHub CLI; push qua Git Credential Manager (`GCM_INTERACTIVE=always`). PowerShell làm hỏng commit message nhiều dòng qua stdin → dùng `git commit -F file`.

## 10. Việc còn mở / cần chuyên gia xác nhận

- Ngưỡng các giàn khác ngoài TBD503 Pleiku 2 mới có khe hở TAG đúng; còn lại lấy mặc định TBD503 – phải nhập theo biên bản.
- CT3 & CT30 cùng 1 vòng "≈ 0": app tạm dùng |x| ≤ 0,2 A.
- Tiêu chí đánh giá bơm CT10/CT11 (4.5.D) chưa có trong nguồn.
- Danh sách đầy đủ: `content/review.json` (hiện ở `#/about`).
- **Bản quyền:** ảnh/sơ đồ từ tài liệu GE và đào tạo nội bộ; đặc tả yêu cầu chỉ triển khai nội bộ – bản GitHub Pages hiện công khai theo quyết định của chủ dự án.
- Supabase (đồng bộ, Google, duyệt, ký): code + SQL đã có và có test, nhưng **chưa có project thật** nên chưa thử luồng Google và đồng bộ với máy chủ thật.
- Đổi tài khoản sang đội khác trên cùng máy: dữ liệu đang có trên máy sẽ được gửi lên đội mới; chưa xử lý.
- Chưa làm (giai đoạn 3 đặc tả): quét QR thiết bị, trắc nghiệm đào tạo, quản lý thành viên trong app (hiện làm bằng SQL).

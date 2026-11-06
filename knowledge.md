# TBD-GE Field – Knowledge Base (Cơ sở tri thức dự án)

> **Mục đích:** Tài liệu này là nguồn tri thức tập trung (Single Source of Truth) tổng hợp toàn bộ nghiệp vụ thí nghiệm điện cao thế, kiến trúc kỹ thuật, quy tắc an toàn và hướng dẫn vận hành của dự án **TBD-GE Field**. Dành cho kỹ sư phát triển, chuyên gia thí nghiệm và các AI agent.

---

## 1. TỔNG QUAN DỰ ÁN

* **Tên ứng dụng:** Sổ tay TN Tụ bù dọc GE (Tên ngắn: `TBD-GE Field`).
* **Đơn vị phát triển:** Hoàng Trọng – Công ty Truyền tải điện 3 (PTC3) – EVNNPT.
* **Bản chất:** Ứng dụng web tiến bộ (**PWA - Progressive Web App**), hoạt động theo triết lý **Offline-First**, được thiết kế chuyên biệt cho thiết bị di động (smartphone/tablet).
* **Mục tiêu cốt lõi:**
  1. **Số hóa quy trình thí nghiệm nhất thứ:** 7 hạng mục thí nghiệm giàn tụ bù dọc 500 kV hãng GE theo tiêu chuẩn GE và quy trình ngành điện (QĐ 1901/QĐ-EVNNPT).
  2. **Tra cứu & thao tác hiện trường:** Nhân viên thao tác trên sàn tụ (xe gàu), trong buồng TAG house, ngoài trời nắng gắt hoặc ban đêm, nơi không có sóng viễn thông và không thể mang vác laptop hay tài liệu giấy.
  3. **Bảo đảm an toàn nghiêm ngặt:** Cổng kiểm tra an toàn (Safety Gates) bắt buộc trước mọi phép thử nguy hiểm; đếm ngược thời gian xả điện tích dư giàn tụ.
  4. **Tự động hóa tính toán & đánh giá:** Loại bỏ sai sót tính toán thủ công; tự động tính $C_\sum, C_{G1}, C_{G2}, \Delta C, \%\Delta C$ và đối chiếu ngưỡng Đạt / Cảnh báo / Không đạt.
  5. **Biên bản điện tử & Đồng bộ:** Ghi nhận số đo, lưu ảnh hiện trường, ký số điện tử (SHA-256), xuất báo cáo PDF/Excel/JSON và hỗ trợ đồng bộ đám mây (Supabase).
* **Tuyên bố an toàn (Disclaimer):** *Ứng dụng chỉ đóng vai trò hỗ trợ tra cứu và tính toán kỹ thuật tại hiện trường, không thay thế cho Phiếu công tác, Quy trình an toàn điện, Biện pháp kỹ thuật hay Mệnh lệnh của Chỉ huy trực tiếp.*

---

## 2. NGHIỆP VỤ ĐIỆN CAO THẾ – GIÀN TỤ BÙ DỌC 500 kV GE

### 2.1. Cấu trúc vật lý của giàn tụ bù dọc (Platform Circuit)
Giàn tụ bù dọc được lắp đặt nối tiếp trên đường dây 500 kV nhằm bù điện kháng cảm, nâng cao khả năng tải và ổn định hệ thống. Toàn bộ giàn tụ nằm trên sàn thép cách điện với đất bằng các cột sứ đỡ mang điện áp 500 kV.

* **Pha (Phase):** Gồm 3 pha độc lập (Pha A, B, C).
* **Group:** Mỗi pha được chia thành **2 Group** song song đối xứng (Group 1 và Group 2) để so sánh điện dung và đo dòng mất cân bằng.
* **String & Unit:**
  * Mỗi Group gồm **24 chuỗi (strings)** mắc song song.
  * Mỗi String gồm **6 bình tụ (units)** mắc nối tiếp.
  * Thông số bình tụ mẫu (TBD503 Pleiku 2): Dung lượng $C_{\text{unit}} = 13,05\ \mu\text{F}$.
  * Dung lượng mỗi String: $C_{\text{string}} = \frac{13,05}{6} = 2,175\ \mu\text{F}$.
  * Dung lượng mỗi Group: $C_{\text{group}} = 2,175 \times 24 = 52,2\ \mu\text{F}$.
  * Dung lượng tổng 1 pha: $C_\sum = C_{\text{group 1}} + C_{\text{group 2}} = 104,4\ \mu\text{F}$.
  * Điện kháng tổng ở tần số 50 Hz: $X_C = \frac{1}{2\pi f C_\sum} \approx 30,49\ \Omega$.

### 2.2. Danh mục 7 hạng mục thí nghiệm kỹ thuật

| Mã | Hạng mục | Thiết bị & Đối tượng | Nội dung thí nghiệm chính | Mức độ rủi ro |
| :---: | :--- | :--- | :--- | :---: |
| **4.1** | **Hệ thống tụ & Group tụ** | Bình tụ, giàn tụ, mối nối | 1. Kiểm tra mắt & lực xiết bu-lông (ASTM A-307).<br>2. Đo điện dung từng bình/chuỗi.<br>3. Đo mất cân bằng ($200-300\ \text{Vac}$). | ⚠️ Cao |
| **4.2** | **Chống sét van MOV** | Cột ZnO bảo vệ quá áp | 1. Kiểm tra mắt, sứ đỡ, đĩa van.<br>2. Đo điện trở cách điện bằng Megohmmeter $2,5-5\ \text{kV}$. | Bình thường |
| **4.3** | **Kháng cản dịu** | Discharge Reactor | 1. Kiểm tra mắt cuộn cản dịu.<br>2. Đo điện trở cách điện cuộn kháng.<br>3. Đo điện trở một chiều (DC Resistance). | Bình thường |
| **4.4** | **Sứ xuyên TAG House** | Wall Bushings | 1. Vệ sinh & kiểm tra nứt vỡ sứ.<br>2. Đo điện trở cách điện sứ xuyên đưa thanh cái vào buồng TAG. | Bình thường |
| **4.5** | **Tủ VAP & Khe hở TAG** | Tủ VAP-A/B, khe hở TAG, tụ C1/C2 | 1. Kiểm tra mắt & đo khe hở cơ khí TAG (chỉnh shim).<br>2. Thử nghiệm máy VAP Tester 31F246 (ENERGY, CURRENT, TRIG).<br>3. Thử nghiệm đánh lửa Trigger bằng nguồn cao áp GAMMA RR10-6R ($\pm 10\ \text{kV DC}$). | ⚡ Cực kỳ nguy hiểm |
| **4.6** | **Biến dòng trên CT rack** | Biến dòng đo lường & bảo vệ | 1. Kiểm tra tỷ số biến dòng.<br>2. Kiểm tra cực tính các cuộn CT trên sàn. | Bình thường |
| **4.7** | **Bơm dòng nhất thứ CT** | Mạch bảo vệ & HMI | 1. Bơm dòng sơ cấp qua các CT rack.<br>2. Đọc giá trị thứ cấp truyền qua cáp quang PFOI/GFOI về màn hình HMI phòng điều khiển. | Cần phối hợp |

### 2.3. Các thiết bị thí nghiệm chuyên dụng
1. **VAP Tester GE 31F246:** Máy chuyên dụng kiểm tra bộ bảo vệ VAP (Varistor Protection). Các phép thử:
   - `ENERGY V / mC`: Kiểm tra bộ tích phân năng lượng MOV.
   - `CURRENT A`: Kiểm tra dòng điện qua MOV (lưu ý: đồng hồ DPM có thể hiện giá trị âm, cần xử lý trị tuyệt đối).
   - `EXT TRIG`: Kiểm tra mạch kích hoạt ngoài.
2. **Nguồn cao thế GAMMA RR10-6R:** Nguồn cao áp DC $0 - 10\ \text{kV}$ có khả năng đảo cực tính ($\pm$), dùng để nạp cho các tụ kích hoạt C1, C2 bên trong nhà TAG để thử đánh thủng khe hở TAG.
3. **Cuộn dây vi sai 10 vòng & Ampe kìm:** Đo dòng mất cân bằng vi sai $I_\Delta$ giữa 2 group tụ.

---

## 3. CÔNG THỨC TÍNH TOÁN & LOGIC ĐÁNH GIÁ THUẦN (`src/calc/`)

Mọi công thức tính toán đều là hàm thuần túy (**pure functions**), độc lập với UI và được kiểm thử 100% bằng Vitest (`tests/calc.spec.ts`).

### 3.1. Tính toán mất cân bằng điện dung (`unbalance.ts`)
* **Hệ số tần số:**
  $$k = \frac{10^6}{2\pi f} \approx 3183,09886\quad (\text{với } f = 50\ \text{Hz})$$
* **Điện dung tổng & từng Group:**
  $$C_\sum = k \times \frac{I_\sum}{U}\quad (\mu\text{F})$$
  $$C_{G1} = k \times \frac{I_{G1}}{U},\quad C_{G2} = k \times \frac{I_{G2}}{U}\quad (\mu\text{F})$$
* **Dòng lệch vi sai thực tế:**
  $$I_\Delta = \frac{I_{\Delta\times 10}}{10}\quad (\text{đổi về cùng đơn vị A})$$
* **Phần trăm mất cân bằng (%ΔC):**
  $$\%\Delta C = \frac{I_\Delta}{I_\sum} \times 100\ \%$$
* **Chênh lệch điện dung tuyệt đối:**
  $$\Delta C = |C_{G1} - C_{G2}|\quad (\mu\text{F})$$

### 3.2. Tiêu chuẩn đánh giá kết quả (Verdict)
* **Đạt (`pass`):** $\%\Delta C < \text{Ngưỡng Cảnh báo (Alarm, mặc định } 0,16\%)$
* **Cảnh báo (`warn`):** $\text{Alarm } (0,16\%) \le \%\Delta C < \text{Ngưỡng Bypass/Trip (mặc định } 0,22\%)$
* **Không đạt (`fail`):** $\%\Delta C \ge \text{Bypass } (0,22\%)$

### 3.3. Các kiểm tra hợp lệ số đo (Sanity Checks)
1. **Lệch tổng dòng kẹp:** So sánh $(I_{G1} + I_{G2})$ với $I_\sum$. Nếu lệch vượt quá **2%**, cảnh báo người dùng kiểm tra lại vị trí và chiều kẹp ampe kìm.
2. **Lệch định mức:** So sánh $C_\sum$ đo được với $C_{\text{nominal}}$ hồ sơ giàn. Nếu lệch vượt quá **5%**, cảnh báo số lượng bình tụ sự cố.
3. **Phát hiện chuỗi tụ bất thường (Outliers):** Sử dụng phân phối thống kê để tìm các chuỗi tụ có dòng lệch bất thường:
   $$\text{Outlier} > \text{Mean} + 2\sigma$$

### 3.4. Chuẩn hóa định dạng số tiếng Việt
* Sử dụng hàm `parseNum` linh hoạt: Hỗ trợ cả bàn phím số Android (dấu chấm) và chuẩn văn bản kỹ thuật Việt Nam (dấu phẩy thập phân `,`).
* Tất cả chuỗi hiển thị số trên giao diện và cảnh báo bắt buộc dùng dấu phẩy `,` (ví dụ `0,127 µF`, `4,9 %`).

---

## 4. QUY TẮC AN TOÀN BẤT KHẢ XÂM PHẠM (GOLDEN SAFETY RULES)

Hệ thống đặt ra 6 nguyên tắc an toàn cốt lõi không bao giờ được phép tắt hoặc bỏ qua trong mã nguồn:

1. **Cổng an toàn (Safety Gates) có tính cưỡng bức:**
   - Trước khi vào xem trình tự từng bước hoặc nhập số đo của các hạng mục nguy hiểm (4.1, 4.5), người dùng bắt buộc phải hoàn thành checklist an toàn và chọn Người xác nhận (chọn từ danh sách thành viên đội).
   - Nút mở khóa chỉ sáng khi tất cả các mục đã được tích chọn.
   - Thời hạn hiệu lực của cổng an toàn là **12 giờ**. Quá 12 giờ tự động khóa lại để đảm bảo tính an toàn ca làm việc.
2. **Thời gian cô lập 15 phút chống xả tàn dư:**
   - Tụ điện 500 kV tích trữ năng lượng khổng lồ. Bắt buộc phải chờ tối thiểu 15 phút sau khi cắt điện và tiếp địa để điện trở xả nội bộ giải phóng điện tích.
   - **Cơ chế Timer:** Lưu mốc thời gian thực (`timestamp`) vào `localStorage` (`tbd.timer.*`). Đồng hồ đếm lùi tính toán dựa trên độ lệch thời gian thực tế, đảm bảo đếm đúng ngay cả khi điện thoại bị tắt màn hình, khóa máy hoặc tải lại trang.
   - Hỗ trợ nhập thời gian cô lập thực tế nếu đơn vị quản lý vận hành đã bàn giao hiện trường cô lập từ trước. Thời gian nhập phải hợp lệ ($\ge 15$ phút và không quá 12 giờ trước).
3. **Bản chụp hồ sơ giàn (Profile Snapshots):**
   - Khi tạo một Phiên thí nghiệm (Session), toàn bộ cấu hình giàn tụ và ngưỡng đánh giá được sao chép thành bản chụp tĩnh (`profileSnap`). Việc chỉnh sửa hồ sơ giàn chung sau này sẽ **không làm thay đổi kết quả đánh giá của các phiên trong quá khứ**.
4. **Không mất số liệu hiện trường (Debounce & Pagehide persistence):**
   - Số đo được tự động lưu sau mỗi 500 ms (debounce).
   - Bắt sự kiện `visibilitychange` và `pagehide` để ép lưu tức thì vào IndexedDB ngay khi người dùng chuyển ứng dụng hoặc tắt màn hình.
5. **Cực tính biến dòng (CT Polarity):**
   - Giá trị biến dòng âm thể hiện đấu ngược cực tính $\to$ Bắt buộc kết luận **Không đạt (Fail)**. Chỉ áp dụng trị tuyệt đối `abs: true` cho chỉ số dòng rò hiển thị trên đồng hồ số DPM của tủ VAP.
6. ** forms.ts là nguồn duy nhất cho biên bản:**
   - Mọi kết luận Đạt/Hỏng, bảng hiển thị trên UI, file xuất PDF, file Excel đều phải gọi qua phương thức `FormDef.rows()`. Không được duplicate logic tính toán ở các view khác nhau.

---

## 5. KIẾN TRÚC KỸ THUẬT & CÔNG NGHỆ

### 5.1. Tech Stack
* **Ngôn ngữ:** TypeScript thuần (**Vanilla TypeScript**), không dùng framework (React/Vue/Angular) để đảm bảo tốc độ tải siêu tốc, dung lượng bundle cực nhẹ và không có rủi ro vỡ layout.
* **Build Tool:** Vite 8 + `vite-plugin-pwa` (Workbox) quản lý precache toàn bộ mã nguồn, font chữ và hình ảnh để chạy offline 100%.
* **Cơ sở dữ liệu cục bộ:** **Dexie.js (IndexedDB wrapper)** quản lý các bảng:
  - `sessions`: Các phiên thí nghiệm.
  - `measurements`: Số liệu đo theo từng hạng mục và pha.
  - `checks`: Trạng thái các cổng an toàn.
  - `photos`: Ảnh chụp hiện trường (tự động nén $\le 1600\ \text{px}$).
  - `profiles`: Hồ sơ thông số kỹ thuật từng giàn tụ.
  - `instruments`: Danh mục thiết bị thí nghiệm và thời hạn kiểm định.
* **Đồng bộ Đám mây & Phân quyền:** **Supabase** (PostgreSQL + Row Level Security + Storage).
* **Xuất báo cáo:**
  - PDF: `jspdf` + `jspdf-autotable`, nhúng sẵn font tiếng Việt Unicode **Be Vietnam Pro**. Ký tự Hy Lạp không có glyph được tự động chuẩn hóa ($\Delta \to \text{Delta}, \sum \to \text{(tổng)}$).
  - Excel: SheetJS (`xlsx` v0.20.3 CDN).
  - JSON: Sao lưu dự phòng và chuyển đổi dữ liệu giữa các máy.
* **UI/UX hiện trường:**
  - Kích thước chạm tối thiểu $48 \times 48\ \text{px}$, cỡ chữ $\ge 16\ \text{px}$.
  - Thanh điều hướng cố định dưới đáy màn hình (Bottom Navigation) thuận tiện thao tác 1 tay trên xe gàu.
  - 5 chủ đề màu: **Theo máy**, **Tiêu chuẩn (Xanh EVN NPT)**, **Ca đêm (Steel/Amber)**, **Nắng gắt (High Contrast)**, và **Đêm đỏ (Red Night - bảo vệ thị lực ban đêm)**.

### 5.2. Bản đồ cấu trúc thư mục (`tbd-ge-field/`)

```text
tbd-ge-field/
├── content/                     # DỮ LIỆU NỘI DUNG (JSON - không cần sửa code)
│   ├── items.json               # 7 hạng mục thí nghiệm, các bước, checklist, bảng tra
│   ├── thresholds.json          # Ngưỡng đánh giá tiêu chuẩn
│   ├── safety.json              # Nội dung checklist cổng an toàn & rủi ro
│   ├── equipment.json           # Hướng dẫn máy VAP Tester & nguồn GAMMA
│   ├── profiles.seed.json       # Hồ sơ giàn mẫu (TBD503 Pleiku 2,...)
│   └── help.json                # Hướng dẫn sử dụng chi tiết trong app
├── public/                      # TÀI NGUYÊN TĨNH
│   ├── fonts/                   # Font BeVietnamPro (Regular, Bold)
│   ├── icons/                   # Icon PWA cho màn hình Home điện thoại
│   ├── images/                  # 34 ảnh kỹ thuật (sơ đồ nguyên lý, đấu nối, thiết bị)
│   └── theme-boot.js            # Áp theme trước paint để chống nháy màn hình (FOUC)
├── src/
│   ├── main.ts                  # Điểm khởi đầu ứng dụng, đăng ký routes
│   ├── router.ts                # Hash router tuần tự, quản lý cuộn trang
│   ├── content.ts               # Nạp JSON, khởi tạo cấu hình giàn tụ
│   ├── types.ts                 # Định nghĩa toàn bộ kiểu dữ liệu TypeScript
│   ├── forms.ts                 # TRUNG TÂM BIỂU MẪU: Render form, tính trực tiếp, xuất dòng kết quả
│   ├── auth/
│   │   └── roles.ts             # Quản lý 4 vai trò người dùng (admin, leader, tester, viewer)
│   ├── calc/                    # TOÁN THUẦN TÚY (Pure logic)
│   │   ├── unbalance.ts         # Tính toán mất cân bằng điện dung
│   │   ├── evaluate.ts          # Đánh giá ngưỡng kỹ thuật
│   │   ├── isolation.ts         # Logic thời gian cô lập an toàn
│   │   └── units.ts             # Chuyển đổi đơn vị (ft-lbs sang N.m, mA sang uA,...)
│   ├── components/
│   │   ├── Chrome.ts            # Khung giao diện (Top bar, Bottom nav)
│   │   ├── Timer.ts             # Bộ đếm lùi thời gian
│   │   └── ImageViewer.ts       # Trình xem ảnh phóng to pinch-zoom (PhotoSwipe)
│   ├── export/                  # XUẤT BIÊN BẢN & BÁO CÁO
│   │   ├── report.ts            # Gom dữ liệu hoàn chỉnh của một phiên
│   │   ├── pdf.ts               # Tạo file PDF biên bản thí nghiệm
│   │   ├── xlsx.ts              # Tạo file bảng tính Excel
│   │   └── json.ts              # Sao lưu và khôi phục dữ liệu phiên
│   ├── sign/
│   │   └── sign.ts              # Ký số xác nhận điện tử (SHA-256 hash khóa biên bản)
│   ├── store/
│   │   ├── db.ts                # Khởi tạo Dexie IndexedDB
│   │   └── validate.ts          # Kiểm định dữ liệu đầu vào (từ file hoặc Supabase)
│   ├── sync/                    # ĐỒNG BỘ ĐÁM MÂY (OFFLINE-FIRST)
│   │   ├── engine.ts            # Động cơ đẩy (push) và kéo (pull) dữ liệu
│   │   ├── meta.ts              # Hook Dexie đánh dấu bản ghi thay đổi (_dirty, _mt)
│   │   ├── status.ts            # Trạng thái kết nối và cấu hình đồng bộ
│   │   └── supabase.ts          # Client Supabase kết nối máy chủ
│   ├── styles/
│   │   ├── tokens.css           # Bảng màu các theme, biến kích thước
│   │   └── base.css             # CSS giao diện cơ sở
│   └── views/                   # CÁC MÀN HÌNH ỨNG DỤNG
│       ├── Home.ts              # Màn hình chính (7 thẻ hạng mục, nút an toàn)
│       ├── Item.ts              # Chi tiết hạng mục (Mục đích, Dụng cụ, Trình tự, Ngưỡng)
│       ├── StepMode.ts          # Chế độ làm từng bước (chữ to, nút next lớn)
│       ├── SafetyGate.ts        # Màn hình Cổng an toàn
│       ├── Session.ts           # Màn hình làm việc trong một phiên thí nghiệm
│       ├── Sessions.ts          # Danh sách quản lý các phiên
│       ├── Thresholds.ts        # Bảng tra cứu ngưỡng nhanh
│       ├── Equipment.ts         # Hướng dẫn thao tác nhanh 2 máy thí nghiệm
│       ├── Search.ts            # Tìm kiếm toàn văn tiếng Việt không dấu
│       ├── SyncPanel.ts         # Bảng điều khiển đồng bộ và tài khoản
│       ├── Users.ts             # Quản lý tài khoản (phê duyệt bởi Admin)
│       └── Settings.ts          # Cài đặt giao diện, cỡ chữ, sao lưu dữ liệu
├── supabase/
│   ├── migrations/              # Kịch bản SQL tạo bảng, RLS và Storage
│   └── seed-team.sql            # Dữ liệu khởi tạo thành viên mẫu
└── tests/
    ├── calc.spec.ts             # Unit test công thức tính toán (34 tests)
    ├── sync.spec.ts             # Test cơ chế đồng bộ offline-first (14 tests)
    ├── supabase-schema.spec.ts  # Test phân quyền RLS trên PostgreSQL ảo PGlite (12 tests)
    └── e2e/                     # Kịch bản kiểm thử E2E Playwright & WCAG contrast
```

---

## 6. CƠ CHẾ ĐỒNG BỘ OFFLINE-FIRST & KÝ SỐ

1. **Nguyên tắc hoạt động:**
   - Ứng dụng **luôn luôn ghi vào IndexedDB trước**. Việc đồng bộ đám mây là tùy chọn (mặc định TẮT để bảo vệ dữ liệu nhạy cảm của ngành điện).
   - Khi bật đồng bộ: Hệ thống dùng Dexie hooks (`sync/meta.ts`) để tự động gán cờ `_dirty = 1` và mốc thời gian sửa đổi `_mt`.
   - **Xóa mềm (Soft Delete):** Không bao giờ xóa cứng trên cơ sở dữ liệu (`deleted = true`), đảm bảo không thất thoát dữ liệu lịch sử.
   - **Giải quyết xung đột:** Thay đổi cục bộ tại hiện trường luôn có độ ưu tiên cao hơn bản kéo về từ máy chủ nếu chưa được đẩy lên.
2. **Ký số điện tử (E-Signatures):**
   - Khi Chỉ huy trực tiếp ký số, hệ thống tính toán mã băm SHA-256 trên toàn bộ nội dung số đo của phiên.
   - Khi đã có chữ ký Chỉ huy, biên bản bị khóa trên máy chủ (chỉ có Admin mới có quyền hủy chữ ký).
   - Thông tin chữ ký và mã băm được in trực tiếp vào chân trang của biên bản PDF và file Excel.

---

## 7. QUY TRÌNH KIỂM THỬ & LỆNH ĐIỀU HÀNH

Tất cả lệnh chạy từ thư mục `tbd-ge-field/` (hoặc dùng `npm --prefix tbd-ge-field <lệnh>`):

```bash
# Cài đặt thư viện phụ thuộc
npm install

# Khởi chạy môi trường phát triển (Dev server)
npm run dev              # Truy cập tại http://localhost:5173

# Chạy toàn bộ Unit Tests (Tính toán + Đồng bộ + RLS DB)
npm test                 # vitest run (60/60 tests)

# Kiểm tra độ tương phản màu sắc đạt chuẩn WCAG
npm run contrast         # node scripts/contrast.mjs

# Build đóng gói bản Production (Kiểm tra kiểu TypeCheck + Vite build PWA)
npm run build            # Xuất ra thư mục dist/

# Kiểm thử tự động E2E với Playwright
npm run test:e2e

# Cập nhật manifest khi thay đổi hình ảnh trong public/images
node scripts/image-manifest.mjs

# Tự động tạo lại bộ icon PWA
node scripts/make-icons.mjs
```

---

## 8. CÁC ĐIỂM CẦN RÀ SOÁT KỸ THUẬT (REVIEW NOTES)

Trích xuất từ `content/review.json` và phản hồi thực tế từ chuyên gia:
1. **CT3 & CT30 (Bơm dòng nhất thứ 4.7):** Khi cùng một vòng dây, giá trị dòng kỳ vọng là $\approx 0$. Hiện tại app tạm đặt ngưỡng dung sai $|x| \le 0,2\ \text{A}$. Cần chuyên gia giàn tụ phê duyệt chính thức giá trị này.
2. **Nguồn cao thế GAMMA (4.5):** Máy phát điện áp tối đa $10\ \text{kV}$, trong khi phép thử kích hoạt TAG yêu cầu đúng $\pm 10,0\ \text{kV}$. Khuyến nghị kỹ sư đo giám sát qua kẹp chia áp số 8 ($5\ \text{V} = 10\ \text{kV}$) để tránh quá tải nguồn.
3. **Thử nghiệm Trigger:** Đọc giá trị năng lượng tích lũy `ENERGY (mC)` trên VAP Tester phải ghi nhận ngay trong vòng **0,5 giây** sau khi kích xung; giữa các lần thử đánh lửa phải cách nhau tối thiểu **1 phút**.
4. **Hồ sơ giàn (Profile Override):** Mỗi giàn tụ (Pleiku 2, Đắk Nông, Di Linh, Cầu Bông...) có số lượng bình tụ và giá trị đặt rơ le bảo vệ khác nhau. Bắt buộc phải chọn đúng Hồ sơ giàn trước khi tiến hành thí nghiệm và xuất biên bản.


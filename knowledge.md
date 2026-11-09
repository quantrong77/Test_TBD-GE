# TBD-GE Field – Knowledge Base (Cơ sở tri thức dự án)

> **Mục đích:** Tài liệu này là nguồn tri thức tập trung (Single Source of Truth) tổng hợp toàn bộ nghiệp vụ thí nghiệm điện cao thế, kiến trúc kỹ thuật, quy tắc an toàn và hướng dẫn vận hành của dự án **TBD-GE Field**. Dành cho kỹ sư phát triển, chuyên gia thí nghiệm và các AI agent.
>
> **Cập nhật lần cuối:** 09/11/2026 – đồng bộ với mã nguồn `main` tại commit `e1f3269` (phase-2), phiên bản app `1.1.0`.

---

## 1. TỔNG QUAN DỰ ÁN

* **Tên ứng dụng:** Sổ tay TN Tụ bù dọc GE (Tên ngắn: `TBD-GE Field`).
* **Đơn vị phát triển:** Hoàng Trọng – Công ty Truyền tải điện 3 (PTC3) – EVNNPT.
* **Bản chất:** Ứng dụng web tiến bộ (**PWA - Progressive Web App**), hoạt động theo triết lý **Offline-First**, được thiết kế chuyên biệt cho thiết bị di động (smartphone/tablet).
* **Triển khai:** GitHub Pages `https://quantrong77.github.io/Test_TBD-GE/` (repo `quantrong77/Test_TBD-GE`, nhánh `main`, tự deploy qua GitHub Actions).
* **Mục tiêu cốt lõi:**
  1. **Số hóa quy trình thí nghiệm nhất thứ:** 7 hạng mục thí nghiệm giàn tụ bù dọc 500 kV hãng GE theo tiêu chuẩn GE và quy trình ngành điện (QĐ 1901/QĐ-EVNNPT).
  2. **Tra cứu & thao tác hiện trường:** Nhân viên thao tác trên sàn tụ (xe gàu), trong buồng TAG house, ngoài trời nắng gắt hoặc ban đêm, đeo găng tay, nơi không có sóng viễn thông và không thể mang vác laptop hay tài liệu giấy.
  3. **Bảo đảm an toàn nghiêm ngặt:** Cổng kiểm tra an toàn (Safety Gates) bắt buộc trước mọi phép thử; đếm ngược thời gian xả điện tích dư giàn tụ.
  4. **Tự động hóa tính toán & đánh giá:** Loại bỏ sai sót tính toán thủ công; tự động tính $C_\sum, C_{G1}, C_{G2}, \Delta C, \%\Delta C$, quy đổi nhiệt độ, phát hiện chuỗi tụ bất thường và đối chiếu ngưỡng Đạt / Cảnh báo / Không đạt.
  5. **Biên bản điện tử & Đồng bộ:** Ghi nhận số đo (nhập tay hoặc quét OCR), lưu ảnh hiện trường có đóng dấu kỹ thuật, ký số điện tử (SHA-256), xuất báo cáo PDF/Excel/JSON và hỗ trợ đồng bộ đám mây (Supabase).
  6. **Theo dõi xu hướng thiết bị:** Phân tích biến thiên các thông số qua nhiều kỳ thí nghiệm để cảnh báo sớm.
* **Tuyên bố an toàn (Disclaimer):** *Ứng dụng chỉ đóng vai trò hỗ trợ tra cứu và tính toán kỹ thuật tại hiện trường, không thay thế cho Phiếu công tác, Quy trình an toàn điện, Biện pháp kỹ thuật hay Mệnh lệnh của Chỉ huy trực tiếp.* Câu này bắt buộc phải còn trên giao diện (Giới thiệu, Hướng dẫn, An toàn, chân PDF).

---

## 2. NGHIỆP VỤ ĐIỆN CAO THẾ – GIÀN TỤ BÙ DỌC 500 kV GE

### 2.1. Cấu trúc vật lý của giàn tụ bù dọc (Platform Circuit)

Giàn tụ bù dọc được lắp đặt nối tiếp trên đường dây 500 kV nhằm bù điện kháng cảm, nâng cao khả năng tải và ổn định hệ thống. Toàn bộ giàn tụ nằm trên sàn thép cách điện với đất bằng các cột sứ đỡ mang điện áp 500 kV.

* **Pha (Phase):** Gồm 3 pha độc lập (Pha A, B, C).
* **Group:** Mỗi pha được chia thành **2 Group** song song đối xứng (Group 1 = Stack 1+2, Group 2 = Stack 3+4) để so sánh điện dung và đo dòng mất cân bằng.
* **Stack / Rack:** Mỗi Stack gồm 72 bình (12 chuỗi) chia theo các Rack (tầng) – dùng cho ma trận trực quan bình tụ (mục 7.1).
* **String & Unit:**
  * Mỗi Group gồm **24 chuỗi (strings)** mắc song song.
  * Mỗi String gồm **6 bình tụ (units)** mắc nối tiếp.
  * Thông số bình tụ mẫu (TBD503 Pleiku 2): Dung lượng $C_{\text{unit}} = 13,05\ \mu\text{F}$.
  * Dung lượng mỗi String: $C_{\text{string}} = \frac{13,05}{6} = 2,175\ \mu\text{F}$.
  * Dung lượng mỗi Group: $C_{\text{group}} = 2,175 \times 24 = 52,2\ \mu\text{F}$.
  * Dung lượng tổng 1 pha: $C_\sum = C_{\text{group 1}} + C_{\text{group 2}} = 104,4\ \mu\text{F}$.
  * Điện kháng tổng ở tần số 50 Hz: $X_C = \frac{1}{2\pi f C_\sum} \approx 30,49\ \Omega$.

### 2.2. Danh mục 7 hạng mục thí nghiệm kỹ thuật

> **Quy ước đánh số:** Trên giao diện, trợ giúp và biên bản, hạng mục được đánh số **1 – 7** (mục con như **1.B** = thử mất cân bằng). Trong mã nguồn và dữ liệu (`items.json`, `itemId` trong IndexedDB, route `#/item/4.1`) vẫn giữ mã gốc **4.1 – 4.7** theo tài liệu GE. **Không đổi `itemId`** vì sẽ làm mất liên kết với số đo đã lưu.

| STT (UI) | Mã nội bộ | Hạng mục | Các phép thử (`testId` → biểu mẫu `form` / cổng `gate`) | Mức độ rủi ro |
| :---: | :---: | :--- | :--- | :---: |
| **1** | 4.1 | **Hệ thống tụ & Group tụ** | `visual` → checklist / gate-visual (kiểm tra mắt, lực xiết bu-lông ASTM A-307)<br>`unbalance` → unbalance / gate-hv (đo mất cân bằng, cấp 200–300 Vac) | ⚠️ Cao |
| **2** | 4.2 | **Chống sét van MOV** | `install` → checklist / gate-visual<br>`measure` → mov / gate-visual (điện trở cách điện bằng Megohmmeter 2,5–5 kV) | Bình thường |
| **3** | 4.3 | **Kháng cản dịu** (Discharge Reactor) | `measure` → reactor / gate-visual (điện trở cách điện, điện trở một chiều Rdc) | Bình thường |
| **4** | 4.4 | **Sứ xuyên TAG House** (Wall Bushings) | `measure` → bushing / gate-visual (vệ sinh, kiểm tra nứt vỡ, điện trở cách điện, C1, tan δ) | Bình thường |
| **5** | 4.5 | **Tủ VAP & Khe hở TAG** | `gap` → gap / gate-visual (khe hở cơ khí TAG, chỉnh shim)<br>`vap-threshold` → vap / gate-tag (VAP Tester 31F246: ENERGY, CURRENT)<br>`trigger` → trigger / gate-tag (đánh lửa Trigger bằng GAMMA ±10 kV DC)<br>`ct10` → ct10 / gate-inject | ⚡ Cực kỳ nguy hiểm |
| **6** | 4.6 | **Biến dòng trên CT rack** | `inspect` → checklist / gate-visual (tỷ số, cực tính CT) | Bình thường |
| **7** | 4.7 | **Bơm dòng nhất thứ CT** | `inject` → inject / gate-inject (bơm dòng sơ cấp, đọc thứ cấp qua cáp quang PFOI/GFOI về HMI) | Cần phối hợp |

### 2.3. Các thiết bị thí nghiệm chuyên dụng

1. **VAP Tester GE 31F246:** Máy chuyên dụng kiểm tra bộ bảo vệ VAP (Varistor Protection). Các phép thử:
   - `ENERGY V / mC`: Kiểm tra bộ tích phân năng lượng MOV.
   - `CURRENT A`: Kiểm tra dòng điện qua MOV (lưu ý: đồng hồ DPM có thể hiện giá trị âm, cần xử lý trị tuyệt đối).
   - `EXT TRIG`: Kiểm tra mạch kích hoạt ngoài.
2. **Nguồn cao thế GAMMA RR10-6R:** Nguồn cao áp DC $0 - 10\ \text{kV}$ có khả năng đảo cực tính ($\pm$), dùng để nạp cho các tụ kích hoạt C1, C2 bên trong nhà TAG để thử đánh thủng khe hở TAG.
3. **Cuộn dây vi sai 10 vòng & Ampe kìm:** Đo dòng mất cân bằng vi sai $I_\Delta$ giữa 2 group tụ.

---

## 3. CÔNG THỨC TÍNH TOÁN & LOGIC ĐÁNH GIÁ THUẦN (`src/calc/`)

Mọi công thức tính toán đều là hàm thuần túy (**pure functions**), độc lập với UI và được kiểm thử bằng Vitest (`tests/calc.spec.ts`).

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

Ngưỡng lấy từ hồ sơ giàn (`unbAlarm_pct`, `unbBypass_pct`; mặc định TBD503 Pleiku 2 trong `content.ts` → `PROFILE_DEFAULTS`):

* **Đạt (`pass`):** $\%\Delta C < \text{Ngưỡng Cảnh báo (Alarm, mặc định } 0,16\%)$
* **Cảnh báo (`warn`):** $\text{Alarm } (0,16\%) \le \%\Delta C < \text{Ngưỡng Bypass/Trip (mặc định } 0,22\%)$
* **Không đạt (`fail`):** $\%\Delta C \ge \text{Bypass } (0,22\%)$

### 3.3. Các kiểm tra hợp lệ số đo (Sanity Checks)

1. **Lệch tổng dòng kẹp:** So sánh $(I_{G1} + I_{G2})$ với $I_\sum$. Nếu lệch vượt quá **2%**, cảnh báo người dùng kiểm tra lại vị trí và chiều kẹp ampe kìm.
2. **Lệch định mức:** So sánh $C_\sum$ đo được với $C_{\text{nominal}}$ hồ sơ giàn. Nếu lệch vượt quá **5%**, cảnh báo số lượng bình tụ sự cố.
3. **Phát hiện chuỗi tụ bất thường (Outliers):** Cần tối thiểu 3 chuỗi có số đo. Dải bình thường là $\bar{I} \pm 2\sigma$; chuỗi bị đánh dấu khi:
   $$I_{\text{string}} > \text{Mean} + 2\sigma$$
   Kết quả được đưa vào biên bản thành dòng *"String nghi ngờ G1/G2"* với kết luận `warn`.
4. **So sánh với lần đo trước:** Các biểu mẫu đo điện trở (MOV, kháng, sứ) cho nhập giá trị lần trước (`*_prev`); nếu $|\Delta| >$ `flagPct` (mặc định **20%**) → `warn` "Bất thường".

### 3.4. Quy đổi nhiệt độ (`temp-correction.ts`)

Áp dụng theo QĐ 1901/QĐ-EVNNPT, IEEE Std 43, IEEE 62, IEC 60076. Người dùng nhập nhiệt độ môi trường `t` theo từng pha; kết quả quy đổi hiển thị trực tiếp và được ghi thêm thành dòng `→ … (quy đổi)` trong biên bản (kết luận `na`, chỉ tham khảo).

* **Điện trở cách điện Rcd** (MOV, sứ xuyên – các trường `Rcd*`, `Rmov*`, `Rsu*`) về 20 °C:
  $$R_{20} = R_t \times 1,5^{\frac{t - 20}{10}}$$
* **Điện trở một chiều Rdc cuộn kháng** về 75 °C (và 20 °C):
  $$R_{\text{ref}} = R_t \times \frac{K + t_{\text{ref}}}{K + t}$$
  Với cuộn kháng cản dịu GE dây nhôm hoán vị bọc epoxy: $K = 228$; dây đồng: $K = 234,5$.
* `rDevPct(meas, base)`: phần trăm sai lệch so với giá trị gốc (xuất xưởng / lần đầu).

### 3.5. Chuẩn hóa định dạng số tiếng Việt (`units.ts`)

* Sử dụng hàm `parseNum` linh hoạt: Hỗ trợ cả bàn phím số Android (dấu chấm) và chuẩn văn bản kỹ thuật Việt Nam (dấu phẩy thập phân `,`).
* Tất cả chuỗi hiển thị số trên giao diện và cảnh báo bắt buộc dùng dấu phẩy `,` (ví dụ `0,127 µF`, `4,9 %`).
* `foldVi`: bỏ dấu tiếng Việt phục vụ tìm kiếm không dấu.
* Chuyển đổi đơn vị: ft-lbs ↔ N.m, mA ↔ µA, …

---

## 4. QUY TẮC AN TOÀN BẤT KHẢ XÂM PHẠM (GOLDEN SAFETY RULES)

Hệ thống đặt ra 6 nguyên tắc an toàn cốt lõi không bao giờ được phép tắt hoặc bỏ qua trong mã nguồn:

1. **Cổng an toàn (Safety Gates) có tính cưỡng bức:**
   - Có **5 cổng** định nghĩa trong `content/safety.json`; **mọi phép thử** đều gắn một cổng (trường `gate` trong `items.json`):

     | Cổng | Nội dung | Số mục kiểm |
     | :--- | :--- | :---: |
     | `gate-platform` | Điều kiện bắt buộc trước khi lên sàn tụ (cô lập DCL, tiếp địa, cắt nguồn, cô lập 15 phút, …) | 7 |
     | `gate-hv` | Điều kiện an toàn khi cấp điện thử 200–300 Vac | 4 |
     | `gate-tag` | Cổng riêng – VAP & Triggered Air Gap ⚡ | 4 |
     | `gate-visual` | Kiểm tra, đo không cấp điện thử | 2 |
     | `gate-inject` | Bơm dòng nhất thứ | 3 |

   - Trước khi vào xem trình tự từng bước hoặc nhập số đo, người dùng bắt buộc phải hoàn thành checklist và chọn Người xác nhận (chọn từ danh sách thành viên đội).
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
6. **`forms.ts` là nguồn duy nhất cho biên bản:**
   - Mọi kết luận Đạt/Hỏng, bảng hiển thị trên UI, file xuất PDF, file Excel đều phải gọi qua phương thức `FormDef.rows()`. Không được duplicate logic tính toán ở các view khác nhau (kể cả quy đổi nhiệt độ và phát hiện chuỗi bất thường – đều nằm trong `rows()`).

---

## 5. KIẾN TRÚC KỸ THUẬT & CÔNG NGHỆ

### 5.1. Tech Stack

* **Ngôn ngữ:** TypeScript thuần (**Vanilla TypeScript**), không dùng framework (React/Vue/Angular); render bằng template string vào `innerHTML` để đảm bảo tốc độ tải nhanh, bundle nhẹ và không có rủi ro vỡ layout.
* **Build Tool:** Vite 8 + `vite-plugin-pwa` (Workbox) quản lý precache toàn bộ mã nguồn, font chữ và hình ảnh để chạy offline 100%.
* **Cơ sở dữ liệu cục bộ:** **Dexie.js (IndexedDB wrapper)** quản lý các bảng:
  - `sessions`: Các phiên thí nghiệm.
  - `measurements`: Số liệu đo theo từng hạng mục và pha.
  - `checks`: Trạng thái các cổng an toàn.
  - `photos`: Ảnh chụp hiện trường (đã đóng dấu watermark, tự động nén $\le 1600\ \text{px}$).
  - `profiles`: Hồ sơ thông số kỹ thuật từng giàn tụ.
  - `instruments`: Danh mục thiết bị thí nghiệm và thời hạn kiểm định.
  - `trendHistory` (v3): Mốc lịch sử xu hướng nhập tay theo hồ sơ giàn + chỉ số; chỉ lưu trên máy và trong file sao lưu JSON (chưa đồng bộ Supabase).
* **Tìm kiếm:** MiniSearch (toàn văn, không dấu).
* **Xem ảnh:** PhotoSwipe v5 (pinch-zoom).
* **Đồng bộ Đám mây & Phân quyền:** **Supabase** (PostgreSQL + Row Level Security + Storage, đăng nhập Google).
* **Xuất báo cáo:**
  - PDF: `jspdf` + `jspdf-autotable`, nhúng sẵn font tiếng Việt Unicode **Be Vietnam Pro**. Ký tự Hy Lạp không có glyph được tự động chuẩn hóa ($\Delta \to \text{Delta}, \sum \to \text{(tổng)}$).
  - Excel: SheetJS (`xlsx` v0.20.3 bản CDN, **không** dùng bản npm 0.18).
  - JSON: Sao lưu dự phòng và chuyển đổi dữ liệu giữa các máy.
* **Xử lý ảnh trên máy (không cần mạng):** Canvas API cho OCR đồng hồ đo và đóng dấu watermark; Geolocation API cho tọa độ GPS.
* **UI/UX hiện trường:**
  - Kích thước chạm tối thiểu $48 \times 48\ \text{px}$, cỡ chữ $\ge 16\ \text{px}$, không dựa vào âm thanh.
  - Thanh điều hướng cố định dưới đáy màn hình (Bottom Navigation; tab "Phiên TN" đặt ngay sau "Trang chủ") thuận tiện thao tác 1 tay trên xe gàu.
  - Bộ icon kỹ thuật thống nhất (`components/Icons.ts`).
  - 5 chủ đề màu: **Theo máy**, **Tiêu chuẩn (Xanh EVN NPT)**, **Ca đêm (Steel/Amber)**, **Nắng gắt (High Contrast)**, và **Đêm đỏ (Red Night - bảo vệ thị lực ban đêm)**; có xem trước trực tiếp khi chọn.

### 5.2. Bản đồ màn hình (routes – `src/main.ts`)

| Route | View | Chức năng |
| :--- | :--- | :--- |
| `#/` | `Home` | Trang chủ: 7 thẻ hạng mục, lối vào an toàn & công cụ |
| `#/items` | `ItemsList` | Danh sách hạng mục |
| `#/item/:itemId` | `ItemView` | Chi tiết hạng mục (Mục đích, Dụng cụ, Trình tự, Ngưỡng, ảnh) |
| `#/item/:itemId/test/:testId/step/:n` | `StepMode` | Làm từng bước (chữ to, nút next lớn) |
| `#/gate/:gateId` | `SafetyGate` | Cổng an toàn + timer 15 phút |
| `#/overview/:deviceId?` | `Lookup.Overview` | Tổng quan cấu tạo giàn / thiết bị |
| `#/safety` | `Lookup.Safety` | Rủi ro & quy định an toàn, disclaimer |
| `#/tools` | `Lookup.Tools` | Danh mục dụng cụ, thiết bị thí nghiệm |
| `#/cycle` | `Lookup.Cycle` | Chu kỳ thí nghiệm |
| `#/about` | `Lookup.About` | Giới thiệu |
| `#/thresholds` | `Thresholds` | Bảng tra ngưỡng nhanh |
| `#/equipment/:eqId?/:section?` | `EquipmentView` | Hướng dẫn nhanh VAP Tester & GAMMA (bước có timer/khóa) |
| `#/search` | `Search` | Tìm kiếm toàn văn không dấu |
| `#/sessions`, `#/session-new` | `Sessions`, `SessionNew` | Danh sách & tạo phiên thí nghiệm |
| `#/session/:id` | `SessionView` | Làm việc trong phiên: số đo, ảnh, ký, xuất biên bản |
| `#/session/:id/form/:itemId/:testId` | `SessionForm` | Biểu mẫu nhập số đo của một phép thử |
| `#/profiles`, `#/profile/:id` | `Profiles`, `ProfileEdit` | Hồ sơ giàn |
| `#/instruments` | `Instruments` | Thiết bị thí nghiệm & hạn kiểm định |
| `#/calc/unbalance` | `CalcUnbalance` | Máy tính mất cân bằng nhanh (OCR + điền vào biên bản mục 1.B) |
| `#/trend/:profileId?` | `TrendView` | Phân tích xu hướng nhiều kỳ |
| `#/settings` | `Settings` | Giao diện, cỡ chữ, sao lưu/khôi phục, dung lượng |
| `#/help`, `#/info` | `Info.Help`, `Info.Info` | Hướng dẫn sử dụng, thông tin liên hệ |
| `#/users` | `Users` | Quản lý tài khoản (Admin duyệt) |

### 5.3. Bản đồ cấu trúc thư mục (`tbd-ge-field/`)

```text
tbd-ge-field/
├── content/                     # DỮ LIỆU NỘI DUNG (JSON - không cần sửa code; chữ hỗ trợ **đậm**)
│   ├── items.json               # 7 hạng mục → tests → steps/checklist/table/tips; field `form`, `gate`
│   ├── thresholds.json          # Ngưỡng đánh giá: op < <= >= range approx0; profileOverride; abs
│   ├── safety.json              # 5 cổng an toàn (checks, timer) + rủi ro + disclaimer
│   ├── equipment.json           # Hướng dẫn máy VAP Tester & nguồn GAMMA (section `quick`)
│   ├── overview.json            # Tổng quan cấu tạo giàn / thiết bị
│   ├── tools.json               # Danh mục dụng cụ thí nghiệm
│   ├── cycle.json               # Chu kỳ thí nghiệm
│   ├── review.json              # Các điểm cần chuyên gia rà soát
│   ├── images.json              # Manifest ảnh (sinh bởi scripts/image-manifest.mjs)
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
│   ├── content.ts               # Nạp JSON, gatesFor(), seedProfiles(), PROFILE_DEFAULTS
│   ├── types.ts                 # Định nghĩa toàn bộ kiểu dữ liệu TypeScript
│   ├── ui.ts                    # esc(), rich(), callout(), gallery(), toast()…
│   ├── settings.ts              # Chủ đề + cỡ chữ (đồng bộ với public/theme-boot.js)
│   ├── pwa.ts                   # Đăng ký service worker, thông báo cập nhật
│   ├── forms.ts                 # TRUNG TÂM BIỂU MẪU: render / live / rows cho từng biểu mẫu
│   ├── auth/
│   │   └── roles.ts             # 4 vai trò, ma trận quyền, ô ký theo vai trò
│   ├── calc/                    # TOÁN THUẦN TÚY (Pure logic)
│   │   ├── unbalance.ts         # Mất cân bằng điện dung, thống kê chuỗi (2σ)
│   │   ├── evaluate.ts          # Đánh giá ngưỡng kỹ thuật
│   │   ├── isolation.ts         # Logic thời gian cô lập an toàn
│   │   ├── units.ts             # parseNum, foldVi, chuyển đổi đơn vị
│   │   ├── temp-correction.ts   # Quy đổi nhiệt độ Rcd (20°C) và Rdc (75°C)
│   │   ├── trend.ts             # Phân tích xu hướng nhiều kỳ + vẽ biểu đồ SVG
│   │   ├── ocr.ts               # OCR màn hình 7 đoạn (Otsu + connected components)
│   │   └── watermark.ts         # Đóng dấu kỹ thuật + GPS lên ảnh, nén ảnh
│   ├── components/
│   │   ├── Chrome.ts            # Khung giao diện (Top bar, Bottom nav)
│   │   ├── Icons.ts             # Bộ icon kỹ thuật thống nhất
│   │   ├── Timer.ts             # Bộ đếm lùi thời gian
│   │   ├── OcrModal.ts          # Hộp thoại chụp ảnh & quét số đo
│   │   └── ImageViewer.ts       # Trình xem ảnh phóng to pinch-zoom (PhotoSwipe)
│   ├── export/                  # XUẤT BIÊN BẢN & BÁO CÁO
│   │   ├── report.ts            # Gom dữ liệu hoàn chỉnh của một phiên
│   │   ├── exporters.ts         # Điểm vào chung cho các định dạng xuất
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
│   │   └── base.css             # CSS giao diện cơ sở (gồm ma trận bình tụ)
│   └── views/                   # CÁC MÀN HÌNH ỨNG DỤNG (xem bảng 5.2)
│       ├── Home.ts, Item.ts, StepMode.ts, SafetyGate.ts
│       ├── Lookup.ts            # Overview, Safety, Tools, Cycle, About
│       ├── Session.ts, Sessions.ts
│       ├── CalcUnbalance.ts, Trend.ts
│       ├── Thresholds.ts, Equipment.ts, Search.ts
│       ├── SyncPanel.ts, Users.ts
│       ├── Info.ts              # Hướng dẫn sử dụng + thông tin liên hệ
│       └── Settings.ts
├── scripts/                     # contrast.mjs, image-manifest.mjs, make-icons.mjs
├── supabase/
│   ├── migrations/              # 0001_init.sql, 0002_roles_signatures.sql (bảng, RLS, Storage, chữ ký)
│   └── seed-team.sql            # Dữ liệu khởi tạo thành viên mẫu
└── tests/
    ├── calc.spec.ts             # Unit test công thức tính toán
    ├── sync.spec.ts             # Test cơ chế đồng bộ offline-first
    ├── supabase-schema.spec.ts  # Test phân quyền RLS trên PostgreSQL ảo PGlite
    └── e2e/                     # app.spec.ts, contrast-audit.spec.ts (Playwright, Pixel 7)
```

---

## 6. CƠ CHẾ ĐỒNG BỘ OFFLINE-FIRST, PHÂN QUYỀN & KÝ SỐ

1. **Nguyên tắc hoạt động:**
   - Ứng dụng **luôn luôn ghi vào IndexedDB trước**. Việc đồng bộ đám mây là tùy chọn (mặc định TẮT để bảo vệ dữ liệu nhạy cảm của ngành điện).
   - Khi bật đồng bộ: Hệ thống dùng Dexie hooks (`sync/meta.ts`) để tự động gán cờ `_dirty = 1` và mốc thời gian sửa đổi `_mt`.
   - **Xóa mềm (Soft Delete):** Không bao giờ xóa cứng trên cơ sở dữ liệu (`deleted = true`), đảm bảo không thất thoát dữ liệu lịch sử.
   - **Giải quyết xung đột:** Thay đổi cục bộ tại hiện trường luôn có độ ưu tiên cao hơn bản kéo về từ máy chủ nếu chưa được đẩy lên.
   - Khi nhận thay đổi từ đội, app hiển thị thông báo "Đã nhận N thay đổi từ đội" kèm nút Xem.
2. **Vai trò & ma trận quyền (`auth/roles.ts`):**

   | Hành động | admin | leader | tester | viewer |
   | :--- | :---: | :---: | :---: | :---: |
   | Tạo / sửa phiên (`session.create/edit`) | ✓ | ✓ | | |
   | Nhập số đo (`measure.edit`) | ✓ | ✓ | ✓ | |
   | Xác nhận cổng an toàn (`gate.confirm`) | ✓ | ✓ | ✓ | |
   | Sửa hồ sơ giàn, thiết bị TN, nhập dữ liệu | ✓ | ✓ | | |
   | Quản lý tài khoản, hủy chữ ký | ✓ | | | |

   - **Chế độ dùng một mình (chưa đăng nhập):** mọi thao tác trên máy như bình thường, trừ ký số và quản lý tài khoản.
   - Tài khoản đã đăng nhập nhưng chờ duyệt / bị khóa: chỉ xem.
3. **Ký số điện tử (E-Signatures):**
   - Biên bản có **3 ô ký**: Người thí nghiệm (`tester`), Chỉ huy trực tiếp (`leader`), Đại diện đơn vị QLVH (`qlvh`).
   - Ô được ký theo vai trò (khớp hàm `can_sign` trên máy chủ): leader → cả 3 ô; tester → tester, qlvh; admin, viewer → qlvh.
   - Khi ký, hệ thống tính mã băm SHA-256 trên toàn bộ nội dung số đo của phiên.
   - Khi đã có chữ ký Chỉ huy, biên bản bị khóa trên máy chủ (chỉ Admin mới có quyền hủy chữ ký).
   - Thông tin chữ ký và mã băm được in trực tiếp vào chân trang của biên bản PDF và file Excel.

---

## 7. TÍNH NĂNG NÂNG CAO (PHASE 1 – 2)

### 7.1. Ma trận trực quan bình tụ (Capacitor Matrix / Heatmap) – phase 1

* Nằm trong biểu mẫu `unbalance` (mục 1.B), cho từng Group: G1 = Stack 1+2, G2 = Stack 3+4.
* Người dùng nhập dòng điện từng chuỗi S1–S24; ma trận hiển thị theo Stack → Rack (tầng) → chuỗi, tô màu theo phân bố dòng.
* Hộp thống kê hiển thị dải bình thường $\bar{I} \pm 2\sigma$ và liệt kê chuỗi lệch $> \bar{I} + 2\sigma$ (cần tối thiểu 3 chuỗi). Chạm vào ô để định vị chuỗi cần kiểm tra.

### 7.2. Quy đổi nhiệt độ tự động – phase 1

* Xem công thức mục 3.4. Hiển thị ngay dưới ô nhập (hộp 🌡️) và ghi vào biên bản.

### 7.3. Phân tích xu hướng (Trend Analytics) – phase 2 (`#/trend`)

* Theo dõi theo hồ sơ giàn, qua các kỳ: Sau lắp đặt (Commissioning) → Sau 1 năm → Định kỳ hàng năm.
* 5 chỉ số (`METRIC_DEFS` trong `calc/trend.ts`):

  | Chỉ số | Mục | Đơn vị | Hướng cảnh báo | Ngưỡng |
  | :--- | :---: | :---: | :--- | :--- |
  | `unbalance` – %ΔC qua TAG | 1.B | % | tăng | lấy theo hồ sơ giàn (`unbAlarm_pct` / `unbBypass_pct`); dự phòng 0,40 / 0,65 % |
  | `mov_rcd` – Rcd MOV quy đổi 20°C | 2 | MΩ | giảm | chuẩn ≥ 2000 MΩ, cảnh báo < 1000 MΩ |
  | `reactor_rdc` – Rdc kháng quy đổi 75°C | 3 | mΩ | sai lệch | ≤ 2 % so với xuất xưởng |
  | `bushing_c1` – Điện dung sứ C1 | 4 | pF | sai lệch | ≤ 5 % so với ban đầu |
  | `bushing_tan` – tan δ sứ xuyên | 4 | % | tăng | 0,50 / 0,70 % |

* Kết quả phân tích: giá trị mới nhất từng pha A/B/C, tốc độ biến thiên trung bình/năm, dự báo số năm còn lại tới ngưỡng Alarm, kết luận và khuyến nghị. Biểu đồ vẽ bằng SVG (không dùng thư viện ngoài).
* **Chỉ dùng số liệu thật, không có dữ liệu mẫu viết cứng.** Có 2 nguồn, gộp và sắp theo ngày (`mergeTrendPoints`):
  1. **Tự động từ phiên TN** (`extractTrendFromSessions`): đọc số đo của đúng biểu mẫu nguồn (`METRIC_SOURCE`: %ΔC ← 4.1/unbalance, Rcd MOV ← 4.2/measure `Rmov`, Rdc ← 4.3/measure `Rdc`, C1 và tan δ ← 4.4/measure) trong các phiên cùng hồ sơ giàn. Thiếu nhiệt độ → giữ giá trị gốc, đánh dấu "chưa quy đổi".
  2. **Mốc lịch sử nhập tay** (bảng `trendHistory`): số liệu từ biên bản giấy các năm trước, riêng cho từng hồ sơ giàn + chỉ số; admin/leader (hoặc chế độ dùng một mình) được thêm/xóa.
* Hành vi theo số đợt: 0 đợt → hướng dẫn cách có số liệu; 1 đợt → 1 điểm, chưa tính tốc độ; ≥ 2 đợt → tự vẽ đường xu hướng, tính tốc độ biến thiên/năm và dự báo.
* Chỉ số 'deviation' (Rdc, C1) so sánh đợt mới nhất với **đợt đầu tiên của từng pha** (baseline); vượt giới hạn → `warn` (kết luận chính thức vẫn theo biểu mẫu trong phiên).

### 7.4. Nhận diện số đo từ ảnh đồng hồ (On-device OCR) – phase 2

* Chạy 100 % offline trên trình duyệt, không gửi ảnh đi đâu.
* Tối ưu cho màn hình LCD/LED 7 đoạn (Fluke, Hioki, Chauvin Arnoux, Megger, Omicron; ampe kìm, VAP tester, micro-ohmmeter).
* Thuật toán: ảnh xám → ngưỡng Otsu → tách vùng liên thông → phân loại 7 đoạn (A–G) + nhận dấu thập phân → danh sách ứng viên kèm độ tin cậy.
* Giao diện (`OcrModal.ts`): nút 📷 cạnh ô nhập → chụp/chọn ảnh → xem trước, tùy chọn "Đảo phân cực" (chữ sáng nền tối), "Quét lại" → người dùng **xác nhận** trước khi điền giá trị vào ô.
* Đã gắn vào: màn hình Phiên (biểu mẫu nhập số đo) và Máy tính mất cân bằng.

### 7.5. Ảnh hiện trường có đóng dấu kỹ thuật (Watermark) – phase 2

* Khi chụp/chọn ảnh trong phiên, app tự đóng dải thông tin lên ảnh: Trạm, Giàn tụ, Pha, Hạng mục TN, tọa độ GPS (timeout ~2 giây, không có GPS vẫn chụp được), thời gian thực.
* Ảnh được nén ≤ 1600 px rồi lưu vào bảng `photos` kèm chú thích (gợi ý sẵn "Pha X · mục – giờ").

### 7.6. Máy tính mất cân bằng nhanh (`#/calc/unbalance`)

* Tính %ΔC độc lập, có OCR cho từng ô.
* Chọn phiên thí nghiệm → nạp số đo đã có; nút Lưu **tự điền kết quả vào mục 1.B** (`4.1/unbalance`) của biên bản phiên đó, kèm liên kết mở thẳng biểu mẫu.

---

## 8. QUY TRÌNH KIỂM THỬ & LỆNH ĐIỀU HÀNH

Tất cả lệnh chạy từ thư mục `tbd-ge-field/` (hoặc dùng `npm --prefix tbd-ge-field <lệnh>`):

```bash
# Cài đặt thư viện phụ thuộc
npm install

# Khởi chạy môi trường phát triển (Dev server)
npm run dev              # Truy cập tại http://localhost:5173

# Chạy toàn bộ Unit Tests (Tính toán + Đồng bộ + RLS DB)
npm test                 # vitest run – 3 file, 86/86 tests (09/11/2026)

# Kiểm tra độ tương phản màu sắc đạt chuẩn WCAG
npm run contrast         # node scripts/contrast.mjs

# Build đóng gói bản Production (Kiểm tra kiểu TypeCheck + Vite build PWA)
npm run build            # Xuất ra thư mục dist/

# Kiểm thử tự động E2E với Playwright
npm run test:e2e

# Cập nhật manifest khi thay đổi hình ảnh trong public/images
node scripts/image-manifest.mjs

# Tự động tạo lại bộ icon PWA
npm run icons            # node scripts/make-icons.mjs
```

**Nhánh git:** `main` (bản phát hành, tự deploy), `feat/phase-1`, `feat/phase-2` (đã gộp vào `main`), `feat/phase-3`, `feat/experiment` (đang phát triển).

---

## 9. CÁC ĐIỂM CẦN RÀ SOÁT KỸ THUẬT (REVIEW NOTES)

Trích xuất từ `content/review.json` và phản hồi thực tế từ chuyên gia:

1. **CT3 & CT30 (Bơm dòng nhất thứ – mục 7):** Khi cùng một vòng dây, giá trị dòng kỳ vọng là $\approx 0$. Hiện tại app tạm đặt ngưỡng dung sai $|x| \le 0,2\ \text{A}$. Cần chuyên gia giàn tụ phê duyệt chính thức giá trị này.
2. **Nguồn cao thế GAMMA (mục 5):** Máy phát điện áp tối đa $10\ \text{kV}$, trong khi phép thử kích hoạt TAG yêu cầu đúng $\pm 10,0\ \text{kV}$. Khuyến nghị kỹ sư đo giám sát qua kẹp chia áp số 8 ($5\ \text{V} = 10\ \text{kV}$) để tránh quá tải nguồn.
3. **Thử nghiệm Trigger:** Đọc giá trị năng lượng tích lũy `ENERGY (mC)` trên VAP Tester phải ghi nhận ngay trong vòng **0,5 giây** sau khi kích xung; giữa các lần thử đánh lửa phải cách nhau tối thiểu **1 phút**.
4. **Hồ sơ giàn (Profile Override):** Mỗi giàn tụ (Pleiku 2, Đắk Nông, Di Linh, Cầu Bông...) có số lượng bình tụ và giá trị đặt rơ le bảo vệ khác nhau. Bắt buộc phải chọn đúng Hồ sơ giàn trước khi tiến hành thí nghiệm và xuất biên bản.
5. **Đồng bộ mốc lịch sử xu hướng:** Bảng `trendHistory` hiện chỉ lưu trên máy và trong file sao lưu JSON, chưa có bảng Supabase. Muốn cả đội dùng chung cần thêm migration + đưa vào `SYNC_TABLES`. (Dữ liệu mẫu viết cứng `getBenchmarkHistory` đã bị loại bỏ ngày 09/11/2026.)
6. **Ngưỡng tham chiếu trong Trend:** Ngưỡng tan δ (0,50 / 0,70 %), sai lệch Rdc (2 %), C1 (5 %), Rcd MOV (≥ 2000 MΩ / cảnh báo 1000 MΩ) đang viết cứng trong `METRIC_DEFS`, chưa nằm trong `thresholds.json` / hồ sơ giàn. Cần chuyên gia đối chiếu với QĐ 1901 và cân nhắc chuyển vào nội dung JSON.
7. **Độ tin cậy OCR:** OCR chỉ là công cụ gợi ý; người dùng luôn phải đối chiếu giá trị với màn hình đồng hồ trước khi xác nhận. Chưa có bộ ảnh kiểm thử thực tế cho từng loại đồng hồ.

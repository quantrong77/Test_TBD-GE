# Máy chủ đồng bộ trên Google Drive (Apps Script + Google Sheets)

Máy chủ duy nhất của app (thay Supabase từ 23/11/2026). Khi đã cấu hình, app **bắt buộc đăng nhập**: người mới đăng nhập Google → khai hồ sơ đăng ký → chờ Quản trị phê duyệt và gán vai trò → mới vào được app. Toàn bộ dữ liệu nằm trong **Google Drive của tài khoản cài đặt** (nên dùng tài khoản Google của đơn vị, không dùng tài khoản cá nhân):

- **1 file Google Sheets** “TBD-GE Field – Cơ sở dữ liệu”: mỗi bảng một tab (`data_sessions`, `data_measurements`, …), tài khoản người dùng (`users`), đội (`teams`), danh sách thành viên được duyệt sẵn (`members`).
- **1 thư mục Drive** “TBD-GE Field – Ảnh hiện trường”: ảnh của mỗi đội trong một thư mục con.
- **Mã máy chủ** (thư mục này): `Core.gs` – phân quyền, khóa biên bản (có kiểm thử tự động `tests/gas-core.spec.ts`); `Code.gs` – nối với Sheets/Drive/Gmail.

App vẫn **offline-first**: mọi thao tác ghi vào điện thoại trước; có mạng và đã bật đồng bộ thì tự gửi lên / nhận về. Đồng bộ **tắt mặc định**.

## 1. Tạo dự án Apps Script

1. Đăng nhập Google bằng tài khoản sẽ giữ dữ liệu → mở <https://script.google.com> → **New project**, đặt tên `TBD-GE Field Server`.
2. **Project Settings** (⚙️) → tích **Show "appsscript.json" manifest file in editor**.
3. Trong trình soạn:
   - Mở `appsscript.json`, thay toàn bộ bằng nội dung file [`appsscript.json`](appsscript.json).
   - Đổi tên `Code.gs` có sẵn, dán toàn bộ nội dung [`Code.gs`](Code.gs).
   - **+ → Script**, đặt tên `Core`, dán toàn bộ nội dung [`Core.gs`](Core.gs).
   - Bấm 💾 Lưu.
4. Chọn hàm **`setup`** trên thanh công cụ → **Run** → cấp quyền khi Google hỏi (Sheets, Drive, gửi email, gọi dịch vụ ngoài). Màn hình “Google hasn’t verified this app” → **Advanced → Go to … (unsafe)**: đây là tập lệnh của chính bạn.
5. Xem **Execution log**: có đường dẫn file Sheets vừa tạo và dòng `Quản trị: <email của bạn>`. Tài khoản đang chạy `setup` được ghi vào tab `members` với vai trò `admin`.

> Thêm người được **duyệt sẵn**: mở file Sheets → tab `members` → thêm dòng `email | team_id (chép từ tab teams) | vai trò` (vai trò: `admin`, `leader`, `tester`, `viewer`; để trống = `tester`). Người khác đăng nhập sẽ phải gửi hồ sơ và **chờ duyệt**; Quản trị duyệt trong app (⚙️ Cài đặt → 🛡️ Quản trị hệ thống → Quản lý người dùng).

## 2. Tạo Client ID cho nút “Đăng nhập bằng Google”

1. <https://console.cloud.google.com> → tạo project (vd. `tbd-ge-field`) → **Google Auth Platform**:
   - **Branding**: tên app “Sổ tay TN Tụ bù dọc GE”, email hỗ trợ.
   - **Audience**: *External* → **Publish app** (chỉ dùng phạm vi email/hồ sơ cơ bản nên không cần Google thẩm định).
2. **Clients → Create client → Web application**:
   - *Authorized JavaScript origins*: `https://quantrong77.github.io` và (để thử trên máy) `http://localhost:5173`.
   - Không cần *redirect URI*, **không dùng Client secret**.
3. Chép **Client ID** (dạng `xxxx.apps.googleusercontent.com`).
4. Quay lại Apps Script → **Project Settings → Script properties → Add script property**: `GOOGLE_CLIENT_ID` = Client ID vừa chép → Save.

## 3. Triển khai web app

1. Apps Script → **Deploy → New deployment** → ⚙️ chọn **Web app**:
   - *Execute as*: **Me**
   - *Who has access*: **Anyone** (bắt buộc để app gọi được; an toàn do máy chủ tự kiểm tra đăng nhập và phân quyền ở mọi lệnh).
2. **Deploy** → chép **Web app URL** (kết thúc bằng `/exec`).
3. Kiểm tra: mở URL đó trên trình duyệt → thấy `{"ok":true,"app":"TBD-GE Field",…}`.

> **Cập nhật mã máy chủ** (mỗi khi `Core.gs` / `Code.gs` trong repo thay đổi): dán lại 2 file vào trình soạn Apps Script → 💾 → **Deploy → Manage deployments → ✏️ → Version: New version → Deploy** để giữ nguyên URL. Tạo *New deployment* sẽ ra URL mới. Các cột mới của tab `users` được tự bổ sung, không cần chạy lại `setup`.

## 4. Gắn vào app

GitHub repo → **Settings → Secrets and variables → Actions → Variables** → New repository variable:

| Tên | Giá trị |
| --- | --- |
| `GAS_URL` | Web app URL `https://script.google.com/macros/s/…/exec` |
| `GOOGLE_CLIENT_ID` | `xxxx.apps.googleusercontent.com` |

Rồi chạy lại workflow (**Actions → Deploy GitHub Pages → Run workflow**). Có `GAS_URL` thì app dùng máy chủ Google, bỏ qua cấu hình Supabase. Chạy trên máy: chép `.env.example` thành `.env.local`, điền `VITE_GAS_URL`, `VITE_GOOGLE_CLIENT_ID`.

Cả hai giá trị này **công khai được** (nằm trong mã app). Thứ bí mật duy nhất là khóa ký phiên `SECRET` trong Script properties do `setup()` tự tạo – không chép đi đâu.

## 5. Dùng trong app

1. **Đăng nhập / Đăng ký**: mở app → trang Đăng nhập → **Tiếp tục với Google** (hoặc **mã gửi qua email**). Lần đầu: khai **họ tên, chức danh, đơn vị** (bắt buộc), số điện thoại, ghi chú → **Gửi đăng ký**.
2. **Chờ duyệt**: trang “Chờ phê duyệt” tự kiểm tra mỗi 30 giây; được duyệt là vào app ngay.
3. **Quản trị** (⚙️ Cài đặt → 🛡️ Quản trị hệ thống):
   - **Quản lý người dùng**: lọc Chờ duyệt / Hoạt động / Đã khóa, tìm theo tên/email/đơn vị; **Phê duyệt** kèm vai trò, **Từ chối**, đổi vai trò, **Khóa** (ghi lý do – người bị khóa thấy lý do), **Mở khóa**.
   - **Cấu hình**: hồ sơ giàn tụ, máy thí nghiệm, mốc lịch sử xu hướng.
   - **Dữ liệu**: đồng bộ ngay, sao lưu, khôi phục / nhập JSON.
   - **Máy chủ**: số tài khoản theo trạng thái, mở nhanh file Google Sheets và thư mục ảnh.
4. Tài khoản đã duyệt **tự đồng bộ** với cả đội mỗi khi có mạng. Phiên đăng nhập giữ **30 ngày** trên máy và **tự gia hạn** mỗi lần mở app có mạng, nên dùng offline ngoài hiện trường bình thường.

## Nâng cấp lên máy chủ bản 3 (đơn vị, nhân viên)

Dán lại `Core.gs` và `Code.gs` rồi **Deploy → Manage deployments → New version**. Tab `data_units`, `data_staff` tự tạo ở lần ghi đầu, không cần chạy lại `setup()`. Trước khi nâng cấp, app vẫn đồng bộ bình thường các bảng cũ; đơn vị và nhân viên chỉ lưu trên máy và tự gửi lên sau khi máy chủ được nâng cấp.

## Phân quyền (máy chủ kiểm tra ở mọi lệnh)

| | Quản trị | Chỉ huy | Nhân viên TN | Người xem |
| --- | :-: | :-: | :-: | :-: |
| Xem dữ liệu của đội | ✓ | ✓ | ✓ | ✓ |
| Tạo / sửa phiên thí nghiệm | ✓ | ✓ | | |
| Số đo, cổng an toàn, ảnh | ✓ | ✓ | ✓ | |
| Ký ô Người thí nghiệm / Chỉ huy trực tiếp (mỗi ô 1 chữ ký) | | cả 2 | Người TN | |
| **Cấu hình**: hồ sơ giàn, máy TN, mốc xu hướng, nhập JSON, đơn vị & số biên bản | ✓ | | | |
| Danh sách nhân viên đơn vị thí nghiệm | ✓ | ✓ | | |
| Quản lý người dùng, hủy chữ ký | ✓ | | | |

- Chữ ký **Chỉ huy trực tiếp** khóa biên bản: máy chủ từ chối mọi sửa/xóa phiên, số đo, cổng an toàn, ảnh của phiên đó; mỗi phiên chỉ 1 chữ ký Chỉ huy.
- Tài khoản bị khóa mất quyền ngay ở lần gọi kế tiếp (kể cả còn hạn phiên).
- Không nên sửa tay các tab dữ liệu trong file Sheets. Nếu cần, chỉ sửa cột `data` (JSON) và **đổi `updated_at`** thành thời điểm hiện tại để các máy nhận bản mới.

## Giới hạn cần biết

- **Tốc độ**: mỗi lần đồng bộ gọi máy chủ ~8 lần, mỗi lần 1–3 giây (Apps Script chậm hơn Supabase). Đủ cho một đội vài chục người; không dùng cho hàng trăm máy cùng lúc (Apps Script tối đa 30 lượt chạy đồng thời).
- **Dung lượng**: Google Sheets tối đa 10 triệu ô (~1,6 triệu dòng dữ liệu); ảnh tính vào dung lượng Drive của tài khoản (15 GB miễn phí).
- **Email mã đăng nhập**: gửi bằng Gmail của tài khoản cài đặt – tài khoản Gmail thường **100 email/ngày**, Google Workspace 1.500/ngày.
- **iPhone đã “Thêm vào MH chính”**: nút Google có thể mở cửa sổ riêng; nếu không quay về được app, dùng **mã email**.
- **Sao lưu**: File Sheets có *Version history* của Google; định kỳ nên **File → Make a copy**. Trong app vẫn dùng được *Sao lưu toàn bộ* ra JSON.

## Xử lý lỗi thường gặp

| Hiện tượng | Nguyên nhân / cách xử lý |
| --- | --- |
| App báo “Máy chủ trả về dữ liệu không đúng” | URL sai (phải là `/exec`, không phải `/dev`), hoặc *Who has access* chưa là **Anyone**. |
| Máy chủ báo “Chưa chạy setup()” | Chạy hàm `setup` (mục 1 bước 4). |
| Nút Google báo `origin_mismatch` / không hiện | Thiếu *Authorized JavaScript origins* `https://quantrong77.github.io` (mục 2), hoặc chưa đặt biến `GOOGLE_CLIENT_ID` cho app (mục 4). |
| “Mã Google không dành cho ứng dụng này” | `GOOGLE_CLIENT_ID` trong Script properties khác Client ID gắn vào app. |
| “Máy chủ chưa khai báo GOOGLE_CLIENT_ID” | Thêm Script property `GOOGLE_CLIENT_ID` (mục 2 bước 4). |
| Đăng nhập được nhưng **Chờ duyệt** | Đúng thiết kế – Quản trị duyệt, hoặc thêm email vào tab `members` trước khi người đó đăng nhập. |
| Sửa `Code.gs`/`Core.gs` mà app không đổi | Chưa tạo **New version** cho deployment (mục 3). |
| “Máy chủ đang bận” | Nhiều người ghi cùng lúc; app tự thử lại ở lần đồng bộ sau. |

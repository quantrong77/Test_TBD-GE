# Cài đặt đồng bộ Supabase

App vẫn **offline-first**: mọi thao tác ghi vào điện thoại trước; có mạng và đã bật đồng bộ thì tự gửi lên / nhận về. Đồng bộ **tắt mặc định**, người dùng tự bật trong ⚙️ Cài đặt → Đồng bộ đám mây.

## 1. Tạo project

1. Vào <https://supabase.com> → New project. **Region: Southeast Asia (Singapore)**.
2. Lưu lại mật khẩu database (không cần cho app).

## 2. Tạo bảng và phân quyền

Supabase → **SQL Editor** → New query:

1. Dán toàn bộ `migrations/0001_init.sql` → Run.
2. Dán toàn bộ `migrations/0002_roles_signatures.sql` → Run.
3. Mở `seed-team.sql`, giữ email quản trị (email đăng nhập của bạn) → Run. **Chạy trước khi đăng nhập lần đầu** để tài khoản đó tự thành Quản trị.

Người khác đăng nhập xong ở trạng thái **Chờ duyệt**, không thấy dữ liệu. Quản trị mở ⚙️ Cài đặt → **Quản lý tài khoản** để duyệt, gán vai trò hoặc khóa. Email có sẵn trong `seed-team.sql` được duyệt tự động (quyền `admin` → Quản trị, còn lại → Nhân viên TN).

## 3a. Đăng nhập Google

1. <https://console.cloud.google.com> → tạo project → **Google Auth Platform**: khai báo tên app, email hỗ trợ; để User type **External** và bấm Publish nếu người dùng không thuộc tổ chức Google Workspace của bạn.
2. **Clients → Create client → Web application**. Mục *Authorized redirect URIs* điền: `https://<project-ref>.supabase.co/auth/v1/callback`.
3. Supabase → **Authentication → Sign In / Providers → Google**: bật, dán Client ID và Client Secret. (Client Secret chỉ đặt ở đây, không đưa vào app hay GitHub.)
4. Supabase → **Authentication → URL Configuration**: *Site URL* và *Redirect URLs* đều có `https://quantrong77.github.io/Test_TBD-GE/`.

## 3b. Đăng nhập bằng mã email (dự phòng)

Dùng cho iPhone đã cài app (đăng nhập Google hay bị đẩy ra Safari, phiên không về app) và người không dùng Google.

Supabase → **Authentication**:

- **Sign In / Providers → Email**: bật Email.
- **Emails → Templates**: sửa cả **Magic Link** và **Confirm signup** để email có mã, ví dụ:
  ```html
  <h2>Mã đăng nhập Sổ tay TN Tụ bù dọc GE</h2>
  <p>Mã của bạn: <b style="font-size:24px">{{ .Token }}</b></p>
  <p>Mã hết hạn sau 1 giờ. Không chia sẻ mã này.</p>
  ```
- **URL Configuration → Site URL**: `https://quantrong77.github.io/Test_TBD-GE/`
- **Emails → SMTP Settings**: máy chủ email có sẵn của Supabase chỉ gửi **vài email mỗi giờ** – đủ để thử, không đủ cho cả đội. Dùng SMTP riêng (Gmail ứng dụng, Resend, SendGrid…).

## 4. Gắn vào app

Supabase → **Project Settings → API**: chép **Project URL** và **anon / publishable key**.

> ⚠️ **Chỉ** dùng anon/publishable key. **Không bao giờ** đặt `service_role` / secret key vào app hay GitHub variables – key đó bỏ qua mọi phân quyền.

GitHub repo → **Settings → Secrets and variables → Actions → Variables** → New repository variable:

| Tên | Giá trị |
| --- | --- |
| `SUPABASE_URL` | `https://xxxx.supabase.co` |
| `SUPABASE_ANON_KEY` | khóa anon / publishable |

Rồi chạy lại workflow (Actions → Deploy GitHub Pages → Run workflow). Chạy trên máy: chép `.env.example` thành `.env.local` và điền 2 giá trị.

## 5. Dùng trong app

⚙️ Cài đặt → **Tài khoản và đồng bộ** → **Tiếp tục với Google** (hoặc mã email) → chờ duyệt → **Bật đồng bộ**. Lần bật đầu tiên app gửi dữ liệu trên máy lên đội; phần nào vai trò không được ghi sẽ bị máy chủ từ chối và app báo số lượng.

**Vai trò:** Quản trị (duyệt tài khoản, thu hồi chữ ký) · Chỉ huy trực tiếp (phiên, hồ sơ giàn, máy TN, ký khóa biên bản) · Nhân viên TN (số đo, ảnh, cổng an toàn) · Chỉ xem. Quyền được kiểm soát trên máy chủ bằng RLS.

**Ký:** ký xác nhận điện tử gắn tài khoản, kèm mã SHA-256 của nội dung. Chỉ huy ký xong biên bản khóa trên máy chủ; chỉ Quản trị thu hồi được. Đây là xác nhận nội bộ, **không phải chữ ký số có giá trị pháp lý** theo quy định về giao dịch điện tử.

## Ghi chú

- **Gói miễn phí tự tạm dừng project sau 7 ngày không có truy cập**; vào Supabase bấm Restore. Dùng thường xuyên thì không bị.
- Dung lượng miễn phí: 500 MB database, 1 GB ảnh.
- Xóa trên app = đánh dấu `deleted = true` trên máy chủ (không xóa hẳn); có thể khôi phục bằng SQL.
- Xung đột: bản đang sửa trên máy mà chưa gửi được giữ lại và gửi đè lên; còn lại bản mới nhất trên máy chủ thắng.
- Cổng an toàn ở chế độ tra cứu (chưa chọn phiên) không gửi lên – chỉ thuộc về máy đó.
- Kiểm thử phân quyền: `npm test` chạy `tests/supabase-schema.spec.ts` trên Postgres thật (PGlite).

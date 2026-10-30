-- Tạo đội và thêm thành viên. Chạy trong Supabase → SQL Editor SAU 0001_init.sql.
-- Thành viên đăng nhập bằng đúng email này (nhận mã 6 số qua mail) là thấy dữ liệu của đội.

with t as (
  insert into public.teams (name) values ('Đội Thí nghiệm PTC3') returning id
)
insert into public.team_members (team_id, email, role)
select t.id, e.email, e.role
from t,
  (values
    ('quantrong77@gmail.com', 'admin')
    -- , ('ten.nhanvien@evn.com.vn', 'member')   -- thêm từng người, mỗi dòng một email
  ) as e(email, role);

-- Thêm người vào đội đã có:
-- insert into public.team_members (team_id, email)
-- select id, 'email.moi@evn.com.vn' from public.teams where name = 'Đội Thí nghiệm PTC3';

-- Bớt người (họ mất quyền xem ngay ở lần đồng bộ sau):
-- delete from public.team_members where email = 'email.cu@evn.com.vn';

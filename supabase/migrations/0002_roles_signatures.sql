-- TBD-GE Field – tài khoản cần admin duyệt, 4 vai trò, chữ ký điện tử + khóa biên bản.
-- Chạy SAU 0001_init.sql. Chạy lại nhiều lần không lỗi.
--
-- Vai trò:  admin   – duyệt tài khoản, gán vai trò, thu hồi chữ ký; mọi quyền ghi
--           leader  – chỉ huy trực tiếp: tạo/sửa phiên, hồ sơ giàn, máy TN; ký "Chỉ huy" (khóa biên bản)
--           tester  – nhân viên TN: nhập số đo, ảnh, cổng an toàn; ký "Người thí nghiệm"
--           viewer  – chỉ xem (cán bộ kỹ thuật, vận hành); ký "Đại diện QLVH"
-- Tài khoản mới (Google hoặc mã email) ở trạng thái 'pending' – không thấy dữ liệu tới khi admin duyệt.
-- Email có trong team_members (danh sách mời, seed-team.sql) được duyệt tự động khi đăng nhập lần đầu.

-- ---------- Tài khoản ứng dụng ----------
create table if not exists public.app_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  provider text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'disabled')),
  role text check (role in ('admin', 'leader', 'tester', 'viewer')),
  team_id uuid references public.teams (id) on delete set null,
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid,
  constraint approved_needs_role_team check (status <> 'approved' or (role is not null and team_id is not null))
);
create index if not exists app_users_team_idx on public.app_users (team_id);

-- Tạo tài khoản ứng dụng khi có người đăng nhập lần đầu
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  inv record;
begin
  select m.team_id, m.role into inv
  from public.team_members m
  where lower(m.email) = lower(new.email)
  order by m.added_at
  limit 1;
  insert into public.app_users (user_id, email, full_name, provider, status, role, team_id, decided_at)
  values (
    new.id,
    lower(new.email),
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    coalesce(new.raw_app_meta_data ->> 'provider', 'email'),
    case when inv.team_id is not null then 'approved' else 'pending' end,
    case when inv.team_id is null then null when inv.role = 'admin' then 'admin' else 'tester' end,
    inv.team_id,
    case when inv.team_id is not null then now() end
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Bổ sung cho người đã đăng nhập trước khi chạy file này
insert into public.app_users (user_id, email, provider)
select u.id, lower(u.email), coalesce(u.raw_app_meta_data ->> 'provider', 'email')
from auth.users u
where u.email is not null
on conflict (user_id) do nothing;

-- ---------- Hàm quyền (dùng trong mọi chính sách) ----------
-- Vai trò của người đang gọi trong đội t; null nếu chưa duyệt / bị khóa / khác đội
create or replace function public.my_role(t uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select u.role from public.app_users u
  where u.user_id = auth.uid() and u.status = 'approved' and u.team_id = t;
$$;

-- Thay định nghĩa của 0001: thành viên = tài khoản ĐÃ DUYỆT của đội (không còn dựa vào email)
create or replace function public.is_team_member(t uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.my_role(t) is not null;
$$;

create or replace function public.has_role(t uuid, roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.my_role(t) = any (roles), false);
$$;

-- ---------- Chữ ký điện tử ----------
create table if not exists public.signatures (
  team_id uuid not null references public.teams (id) on delete cascade,
  id text not null,
  data jsonb not null,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  primary key (team_id, id)
);
create index if not exists signatures_pull_idx on public.signatures (team_id, updated_at);
create index if not exists signatures_session_idx on public.signatures (team_id, (data ->> 'sessionId'));
-- mỗi biên bản chỉ một chữ ký Chỉ huy còn hiệu lực
create unique index if not exists signatures_one_leader on public.signatures (team_id, (data ->> 'sessionId'))
  where data ->> 'slot' = 'leader' and not deleted;
drop trigger if exists touch_signatures on public.signatures;
create trigger touch_signatures before insert or update on public.signatures
  for each row execute function public.touch_row();
alter table public.signatures enable row level security;

-- Biên bản đã khóa = có chữ ký Chỉ huy còn hiệu lực
create or replace function public.session_locked(t uuid, sid text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select sid is not null and exists (
    select 1 from public.signatures s
    where s.team_id = t and s.data ->> 'sessionId' = sid and s.data ->> 'slot' = 'leader' and not s.deleted
  );
$$;

-- Ký đúng tài khoản mình, đúng ô theo vai trò
create or replace function public.can_sign(t uuid, d jsonb)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select d ->> 'userId' = auth.uid()::text
    and case d ->> 'slot'
      when 'tester' then public.has_role(t, array['tester', 'leader'])
      when 'leader' then public.has_role(t, array['leader'])
      when 'qlvh' then public.is_team_member(t)
      else false
    end;
$$;

drop policy if exists "signatures_select" on public.signatures;
create policy "signatures_select" on public.signatures for select to authenticated
  using (public.is_team_member(team_id));
drop policy if exists "signatures_insert" on public.signatures;
create policy "signatures_insert" on public.signatures for insert to authenticated
  with check (not deleted and public.can_sign(team_id, data));
-- người ký được gửi lại chữ ký của chính mình (thử lại khi mất mạng); không tự hủy được
drop policy if exists "signatures_update_own" on public.signatures;
create policy "signatures_update_own" on public.signatures for update to authenticated
  using (data ->> 'userId' = auth.uid()::text and public.is_team_member(team_id))
  with check (not deleted and public.can_sign(team_id, data));
-- chỉ admin thu hồi chữ ký (đặt deleted = true) → mở khóa biên bản
drop policy if exists "signatures_revoke_admin" on public.signatures;
create policy "signatures_revoke_admin" on public.signatures for update to authenticated
  using (public.has_role(team_id, array['admin']))
  with check (public.has_role(team_id, array['admin']));

-- ---------- Quyền ghi theo vai trò (thay chính sách "thành viên ghi tất cả" của 0001) ----------
do $$
declare
  t text;
  roles text;
  lock_expr text;
begin
  foreach t in array array['profiles', 'instruments', 'sessions', 'gate_checks', 'measurements', 'photos'] loop
    roles := case
      when t in ('profiles', 'instruments', 'sessions') then 'array[''admin'',''leader'']'
      else 'array[''admin'',''leader'',''tester'']'
    end;
    -- biên bản đã ký Chỉ huy thì không sửa được phiên và dữ liệu của phiên
    lock_expr := case
      when t = 'sessions' then 'public.session_locked(team_id, id)'
      when t in ('gate_checks', 'measurements', 'photos') then 'public.session_locked(team_id, data ->> ''sessionId'')'
      else 'false'
    end;
    execute format($f$
      drop policy if exists "%1$s_insert" on public.%1$I;
      create policy "%1$s_insert" on public.%1$I for insert to authenticated
        with check (public.has_role(team_id, %2$s) and not %3$s);
      drop policy if exists "%1$s_update" on public.%1$I;
      create policy "%1$s_update" on public.%1$I for update to authenticated
        using (public.has_role(team_id, %2$s) and not %3$s)
        with check (public.has_role(team_id, %2$s) and not %3$s);
    $f$, t, roles, lock_expr);
  end loop;
end $$;

-- ---------- Quản lý tài khoản ----------
-- Đội mà người gọi là admin (security definer: tránh chính sách tự truy vấn lại bảng app_users → đệ quy)
create or replace function public.admin_team()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select a.team_id from public.app_users a
  where a.user_id = auth.uid() and a.status = 'approved' and a.role = 'admin';
$$;

alter table public.app_users enable row level security;
-- ai cũng xem được tài khoản của mình (để biết đang chờ duyệt / vai trò)
drop policy if exists "app_users_self" on public.app_users;
create policy "app_users_self" on public.app_users for select to authenticated
  using (user_id = auth.uid());
-- admin xem tài khoản của đội mình và tài khoản đang chờ (chưa thuộc đội nào)
drop policy if exists "app_users_admin_select" on public.app_users;
create policy "app_users_admin_select" on public.app_users for select to authenticated
  using (public.admin_team() is not null and (team_id is null or team_id = public.admin_team()));
-- admin duyệt / đổi vai trò / khóa – chỉ trong đội mình, không sửa chính mình
drop policy if exists "app_users_admin_update" on public.app_users;
create policy "app_users_admin_update" on public.app_users for update to authenticated
  using (user_id <> auth.uid() and public.admin_team() is not null and (team_id is null or team_id = public.admin_team()))
  with check (user_id <> auth.uid() and (team_id is null or team_id = public.admin_team()));

-- ---------- Ảnh: chỉ vai trò được nhập liệu mới tải lên ----------
drop policy if exists "photos_write" on storage.objects;
create policy "photos_write" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and public.has_role(((storage.foldername(name))[1])::uuid, array['admin', 'leader', 'tester']));
drop policy if exists "photos_update" on storage.objects;
create policy "photos_update" on storage.objects for update to authenticated
  using (bucket_id = 'photos' and public.has_role(((storage.foldername(name))[1])::uuid, array['admin', 'leader', 'tester']));
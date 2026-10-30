-- TBD-GE Field – lược đồ đồng bộ Supabase
-- Chạy một lần trong Supabase → SQL Editor (hoặc `supabase db push`).
--
-- Mô hình: dữ liệu thuộc về một ĐỘI (team). Ai có email trong team_members thì đọc/ghi
-- toàn bộ dữ liệu của đội đó. App ghi vào điện thoại trước (IndexedDB), có mạng mới đồng bộ.
-- Mỗi bảng lưu bản ghi gốc của app trong cột `data` (jsonb) + vài cột khóa để truy vấn/báo cáo.
-- Không xóa cứng: xóa = đặt deleted = true (tombstone) để máy khác biết mà xóa theo.

-- ---------- Đội và thành viên ----------
create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.team_members (
  team_id uuid not null references public.teams (id) on delete cascade,
  email text not null,
  role text not null default 'member' check (role in ('member', 'admin')),
  added_at timestamptz not null default now(),
  primary key (team_id, email)
);
create index if not exists team_members_email_idx on public.team_members (lower(email));

-- Thành viên của đội? (dùng trong mọi chính sách RLS)
create or replace function public.is_team_member(t uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.team_members m
    where m.team_id = t
      and lower(m.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- ---------- Bảng dữ liệu đồng bộ ----------
-- Cùng một khuôn cho 6 loại bản ghi của app.
do $$
declare
  t text;
begin
  foreach t in array array['sessions', 'measurements', 'gate_checks', 'photos', 'profiles', 'instruments'] loop
    execute format($f$
      create table if not exists public.%1$I (
        team_id uuid not null references public.teams (id) on delete cascade,
        id text not null,
        data jsonb not null,
        deleted boolean not null default false,
        updated_at timestamptz not null default now(),
        updated_by uuid default auth.uid(),
        primary key (team_id, id)
      );
      create index if not exists %1$s_pull_idx on public.%1$I (team_id, updated_at);
      alter table public.%1$I enable row level security;

      drop policy if exists "%1$s_select" on public.%1$I;
      create policy "%1$s_select" on public.%1$I for select to authenticated
        using (public.is_team_member(team_id));
      drop policy if exists "%1$s_insert" on public.%1$I;
      create policy "%1$s_insert" on public.%1$I for insert to authenticated
        with check (public.is_team_member(team_id));
      drop policy if exists "%1$s_update" on public.%1$I;
      create policy "%1$s_update" on public.%1$I for update to authenticated
        using (public.is_team_member(team_id)) with check (public.is_team_member(team_id));
      -- không có chính sách DELETE: app chỉ đánh dấu deleted = true
    $f$, t);
  end loop;
end $$;

-- Giờ cập nhật luôn lấy theo máy chủ (con trỏ kéo dữ liệu dựa vào cột này)
create or replace function public.touch_row()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['sessions', 'measurements', 'gate_checks', 'photos', 'profiles', 'instruments'] loop
    execute format('drop trigger if exists touch_%1$s on public.%1$I', t);
    execute format('create trigger touch_%1$s before insert or update on public.%1$I for each row execute function public.touch_row()', t);
  end loop;
end $$;

-- Cột khóa để báo cáo/truy vấn (sinh từ data, không phải ghi riêng)
alter table public.sessions add column if not exists profile_id text generated always as (data ->> 'profileId') stored;
-- ngày dạng 'YYYY-MM-DD' (text: phép ép kiểu sang date không bất biến nên không dùng được trong cột sinh)
alter table public.sessions add column if not exists test_date text generated always as (data ->> 'date') stored;
alter table public.measurements add column if not exists session_id text generated always as (data ->> 'sessionId') stored;
create index if not exists measurements_session_idx on public.measurements (team_id, session_id);

-- ---------- Đội và thành viên: chỉ xem được đội của mình ----------
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
drop policy if exists "teams_select" on public.teams;
create policy "teams_select" on public.teams for select to authenticated using (public.is_team_member(id));
drop policy if exists "members_select" on public.team_members;
create policy "members_select" on public.team_members for select to authenticated using (public.is_team_member(team_id));
-- Thêm/bớt thành viên: làm trong SQL Editor (xem supabase/seed-team.sql), không qua app.

-- ---------- Ảnh hiện trường: Storage bucket riêng tư ----------
-- Đường dẫn: <team_id>/<photo_id>.jpg
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "photos_read" on storage.objects;
create policy "photos_read" on storage.objects for select to authenticated
  using (bucket_id = 'photos' and public.is_team_member(((storage.foldername(name))[1])::uuid));
drop policy if exists "photos_write" on storage.objects;
create policy "photos_write" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and public.is_team_member(((storage.foldername(name))[1])::uuid));
drop policy if exists "photos_update" on storage.objects;
create policy "photos_update" on storage.objects for update to authenticated
  using (bucket_id = 'photos' and public.is_team_member(((storage.foldername(name))[1])::uuid));

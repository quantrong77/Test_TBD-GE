/// <reference types="node" />
import { describe, it, expect, beforeAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

/**
 * Chạy supabase/migrations/*.sql trên Postgres thật (PGlite) với phần auth/storage của Supabase
 * được giả lập, rồi kiểm tra: duyệt tài khoản, 4 vai trò, chữ ký điện tử, khóa biên bản, cô lập giữa các đội.
 */
const STUB = `
create schema if not exists auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}', raw_app_meta_data jsonb default '{}');
create or replace function auth.jwt() returns jsonb language sql stable as
  $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create or replace function auth.uid() returns uuid language sql stable as
  $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
create role authenticated nologin;
create schema if not exists storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
create or replace function storage.foldername(name text) returns text[] language sql immutable as
  $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
`;
const MIGRATIONS = ['0001_init.sql', '0002_roles_signatures.sql'].map((f) => readFileSync(`supabase/migrations/${f}`, 'utf8'));

const T1 = '11111111-1111-1111-1111-111111111111';
const T2 = '22222222-2222-2222-2222-222222222222';
let db: PGlite;
type U = { id: string; email: string };
const users: Record<string, U> = {};

/** Đăng nhập lần đầu (Google/email) → trigger tạo app_users. */
async function signup(email: string, provider = 'google'): Promise<U> {
  const id = randomUUID();
  await db.query(`insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data) values ($1, $2, $3, $4)`, [id, email, { full_name: email.split('@')[0] }, { provider }]);
  return { id, email };
}

/** Chạy câu lệnh với tư cách người dùng đã đăng nhập (role authenticated). */
async function as<T = Record<string, unknown>>(u: U | null, sql: string, params: unknown[] = []) {
  const claims = u ? JSON.stringify({ sub: u.id, email: u.email }) : '';
  await db.exec(`reset role; select set_config('request.jwt.claims', '${claims}', false); set role authenticated;`);
  try {
    return (await db.query<T>(sql, params)).rows;
  } finally {
    await db.exec('reset role;');
  }
}
const RLS = /row-level security|violates/;
const sig = (u: U, sessionId: string, slot: string, id = `${sessionId}|${slot}|${u.id}`) => [T1, id, { id, sessionId, slot, userId: u.id, email: u.email, hash: 'abc' }];
const measure = (sessionId: string, id = `${sessionId}|4.1|unbalance|A.U`) => [T1, id, { id, sessionId, itemId: '4.1', testId: 'unbalance', key: 'A.U', value: '250', ts: 1 }];

beforeAll(async () => {
  db = new PGlite();
  await db.exec(STUB);
  for (const m of MIGRATIONS) await db.exec(m);
  await db.exec(`
    grant usage on schema public, auth, storage to authenticated;
    grant all on all tables in schema public to authenticated;
    grant all on all tables in schema storage to authenticated;
    insert into public.teams (id, name) values ('${T1}', 'Đội 1'), ('${T2}', 'Đội 2');
    insert into public.team_members (team_id, email, role) values ('${T1}', 'admin1@evn.vn', 'admin'), ('${T2}', 'admin2@evn.vn', 'admin');
  `);
  users.admin1 = await signup('ADMIN1@evn.vn');
  users.admin2 = await signup('admin2@evn.vn', 'email');
  for (const n of ['leader', 'tester', 'viewer', 'stranger']) users[n] = await signup(`${n}@gmail.com`);
  // admin1 duyệt 3 người vào đội 1
  for (const [n, role] of [['leader', 'leader'], ['tester', 'tester'], ['viewer', 'viewer']]) {
    await as(users.admin1, `update public.app_users set status = 'approved', role = $2, team_id = $3 where user_id = $1`, [users[n].id, role, T1]);
  }
});

describe('Supabase: tài khoản, vai trò, chữ ký (0001 + 0002)', () => {
  it('chạy lại cả 2 file SQL không lỗi (idempotent)', async () => {
    for (const m of MIGRATIONS) await db.exec(m);
  });

  it('email trong danh sách mời được duyệt tự động làm admin; người khác ở trạng thái chờ', async () => {
    const me = await as<{ status: string; role: string; provider: string }>(users.admin1, 'select status, role, provider from public.app_users where user_id = auth.uid()');
    expect(me[0]).toMatchObject({ status: 'approved', role: 'admin', provider: 'google' });
    const s = await as<{ status: string; role: string | null }>(users.stranger, 'select status, role from public.app_users where user_id = auth.uid()');
    expect(s[0]).toEqual({ status: 'pending', role: null });
  });

  it('tài khoản chờ duyệt không thấy và không ghi được gì', async () => {
    await as(users.admin1, `insert into public.sessions (team_id, id, data) values ($1, 's0', '{"profileId":"P","date":"2026-10-24"}')`, [T1]);
    expect(await as(users.stranger, 'select id from public.sessions')).toHaveLength(0);
    expect(await as(users.stranger, 'select id from public.teams')).toHaveLength(0);
    await expect(as(users.stranger, `insert into public.measurements (team_id, id, data) values ($1, 'x', '{}')`, [T1])).rejects.toThrow(RLS);
  });

  it('admin thấy người chờ duyệt và người trong đội mình; không thấy đội khác', async () => {
    const seen = (await as<{ email: string }>(users.admin1, 'select email from public.app_users order by email')).map((r) => r.email);
    expect(seen).toContain('stranger@gmail.com');
    expect(seen).toContain('tester@gmail.com');
    expect(seen).not.toContain('admin2@evn.vn');
    expect(await as(users.tester, 'select email from public.app_users')).toHaveLength(1); // chỉ chính mình
  });

  it('admin không tự sửa mình, không kéo người sang đội khác, không sửa người đội khác', async () => {
    expect(await as(users.admin1, `update public.app_users set role = 'viewer' where user_id = $1 returning user_id`, [users.admin1.id])).toHaveLength(0);
    await expect(as(users.admin1, `update public.app_users set status = 'approved', role = 'tester', team_id = $2 where user_id = $1`, [users.stranger.id, T2])).rejects.toThrow(RLS);
    expect(await as(users.admin2, `update public.app_users set status = 'disabled' where user_id = $1 returning user_id`, [users.tester.id])).toHaveLength(0);
    expect(await as(users.tester, `update public.app_users set role = 'admin' where user_id = $1 returning user_id`, [users.tester.id])).toHaveLength(0);
  });

  it('duyệt mà thiếu vai trò bị từ chối (ràng buộc)', async () => {
    await expect(as(users.admin1, `update public.app_users set status = 'approved', team_id = $2 where user_id = $1`, [users.stranger.id, T1])).rejects.toThrow(/approved_needs_role_team/);
  });

  it('quyền ghi theo vai trò', async () => {
    // tạo phiên, hồ sơ giàn: chỉ admin / chỉ huy
    await as(users.leader, `insert into public.sessions (team_id, id, data) values ($1, 's1', '{"profileId":"P","date":"2026-10-24"}')`, [T1]);
    await expect(as(users.tester, `insert into public.sessions (team_id, id, data) values ($1, 's2', '{}')`, [T1])).rejects.toThrow(RLS);
    await expect(as(users.tester, `insert into public.profiles (team_id, id, data) values ($1, 'P', '{}')`, [T1])).rejects.toThrow(RLS);
    // số đo: admin / chỉ huy / nhân viên; chỉ xem thì không
    await as(users.tester, `insert into public.measurements (team_id, id, data) values ($1, $2, $3)`, measure('s1'));
    await expect(as(users.viewer, `insert into public.measurements (team_id, id, data) values ($1, $2, $3)`, measure('s1', 'v1'))).rejects.toThrow(RLS);
    expect(await as(users.viewer, 'select id from public.measurements')).toHaveLength(1); // nhưng xem được
  });

  it('ký: đúng tài khoản mình, đúng ô theo vai trò', async () => {
    await as(users.tester, `insert into public.signatures (team_id, id, data) values ($1, $2, $3)`, sig(users.tester, 's1', 'tester'));
    await expect(as(users.tester, `insert into public.signatures (team_id, id, data) values ($1, $2, $3)`, sig(users.tester, 's1', 'leader'))).rejects.toThrow(RLS);
    // giả mạo người khác
    await expect(as(users.tester, `insert into public.signatures (team_id, id, data) values ($1, $2, $3)`, sig(users.leader, 's1', 'tester', 'fake'))).rejects.toThrow(RLS);
    await expect(as(users.viewer, `insert into public.signatures (team_id, id, data) values ($1, $2, $3)`, sig(users.viewer, 's1', 'tester'))).rejects.toThrow(RLS);
    await as(users.viewer, `insert into public.signatures (team_id, id, data) values ($1, $2, $3)`, sig(users.viewer, 's1', 'qlvh'));
    // người ký không tự hủy chữ ký của mình
    await expect(as(users.tester, `update public.signatures set deleted = true where id = $1`, [`s1|tester|${users.tester.id}`])).rejects.toThrow(RLS);
  });

  it('Chỉ huy ký → biên bản khóa trên máy chủ; admin thu hồi → mở khóa', async () => {
    await as(users.leader, `insert into public.signatures (team_id, id, data) values ($1, $2, $3)`, sig(users.leader, 's1', 'leader'));
    // không sửa / thêm / xóa (tombstone) số đo, không sửa phiên
    await expect(as(users.tester, `update public.measurements set data = data || '{"value":"999"}' where id = 's1|4.1|unbalance|A.U' returning id`).then((r) => (r.length ? 'updated' : 'blocked'))).resolves.toBe('blocked');
    await expect(as(users.leader, `insert into public.measurements (team_id, id, data) values ($1, $2, $3)`, measure('s1', 'new'))).rejects.toThrow(RLS);
    expect(await as(users.tester, `update public.measurements set deleted = true, data = '{}' where id = 's1|4.1|unbalance|A.U' returning id`)).toHaveLength(0);
    expect(await as(users.leader, `update public.sessions set data = data || '{"conclusion":"sửa"}' where id = 's1' returning id`)).toHaveLength(0);
    // chỉ một chữ ký Chỉ huy còn hiệu lực
    await expect(as(users.leader, `insert into public.signatures (team_id, id, data) values ($1, $2, $3)`, sig(users.leader, 's1', 'leader', 'second'))).rejects.toThrow(/unique|duplicate/);
    // chỉ huy không tự thu hồi; admin thu hồi được
    await expect(as(users.leader, `update public.signatures set deleted = true where id = $1`, [`s1|leader|${users.leader.id}`])).rejects.toThrow(RLS);
    await as(users.admin1, `update public.signatures set deleted = true where id = $1`, [`s1|leader|${users.leader.id}`]);
    expect(await as(users.tester, `update public.measurements set data = data || '{"value":"251"}' where id = 's1|4.1|unbalance|A.U' returning id`)).toHaveLength(1);
  });

  it('khóa tài khoản → mất quyền ngay', async () => {
    await as(users.admin1, `update public.app_users set status = 'disabled' where user_id = $1`, [users.viewer.id]);
    expect(await as(users.viewer, 'select id from public.sessions')).toHaveLength(0);
    await as(users.admin1, `update public.app_users set status = 'approved' where user_id = $1`, [users.viewer.id]);
    expect((await as(users.viewer, 'select id from public.sessions')).length).toBeGreaterThan(0);
  });

  it('cô lập giữa các đội; ảnh chỉ vai trò nhập liệu được tải lên, đúng thư mục đội', async () => {
    expect(await as(users.admin2, 'select id from public.sessions')).toHaveLength(0);
    await expect(as(users.admin2, `insert into public.measurements (team_id, id, data) values ($1, $2, $3)`, measure('s1', 'x2'))).rejects.toThrow(RLS);
    await as(users.tester, `insert into storage.objects (bucket_id, name) values ('photos', $1)`, [`${T1}/p1.jpg`]);
    await expect(as(users.viewer, `insert into storage.objects (bucket_id, name) values ('photos', $1)`, [`${T1}/p2.jpg`])).rejects.toThrow(RLS);
    await expect(as(users.tester, `insert into storage.objects (bucket_id, name) values ('photos', $1)`, [`${T2}/p3.jpg`])).rejects.toThrow(RLS);
    expect(await as(users.viewer, `select name from storage.objects`)).toHaveLength(1);
    expect(await as(users.admin2, `select name from storage.objects`)).toHaveLength(0);
  });

  it('kho ảnh không công khai; giờ cập nhật do máy chủ đặt', async () => {
    expect((await db.query<{ public: boolean }>(`select public from storage.buckets where id = 'photos'`)).rows[0].public).toBe(false);
    const r = await as<{ updated_by: string }>(users.tester, `select updated_by from public.measurements where id = 's1|4.1|unbalance|A.U'`);
    expect(r[0].updated_by).toBe(users.tester.id);
  });
});

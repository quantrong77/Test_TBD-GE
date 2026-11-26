// Kiểm thử lõi máy chủ Google Apps Script (gas/Core.gs) trên kho dữ liệu trong bộ nhớ.
// Bộ quy tắc phải tương đương Row Level Security của bản Supabase (tests/supabase-schema.spec.ts).
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import vm from 'node:vm';

type Res = { ok: boolean; code?: string; message?: string; [k: string]: unknown };
const code = readFileSync(new URL('../gas/Core.gs', import.meta.url), 'utf8');
const mod = { exports: {} as { coreHandle: (req: unknown, env: unknown) => Res } };
vm.runInNewContext(code, { module: mod, encodeURIComponent, decodeURIComponent, JSON, Date, Number, String, Array, Error });
const { coreHandle } = mod.exports;

const CLIENT = 'client-123.apps.googleusercontent.com';
const TEAM = 'team-1';
const OTHER = 'team-2';

function makeEnv() {
  let t = Date.parse('2026-11-23T08:00:00Z');
  let n = 0;
  const users: Record<string, unknown>[] = [];
  const data: Record<string, Record<string, unknown>[]> = {};
  const photos: Record<string, { base64: string; mime: string }> = {};
  const cache = new Map<string, string>();
  const mails: { to: string; html: string }[] = [];
  const members = [
    { email: 'admin@evn.vn', team_id: TEAM, role: 'admin' },
    { email: 'tn@evn.vn', team_id: TEAM, role: 'member' },
    { email: 'khac@evn.vn', team_id: OTHER, role: 'admin' },
  ];
  const env = {
    clientId: CLIENT,
    now: () => t,
    uuid: () => `u${++n}`,
    hmac: (s: string) => createHmac('sha256', 'test-secret').update(s).digest('hex'),
    randomDigits: () => '123456',
    verifyIdToken: (tok: string) => JSON.parse(tok),
    sendMail: (to: string, _s: string, html: string) => mails.push({ to, html }),
    cache: { get: (k: string) => cache.get(k) ?? null, put: (k: string, v: string) => void cache.set(k, v), remove: (k: string) => void cache.delete(k) },
    store: {
      getUserByEmail: (e: string) => (users.find((u) => u.email === e.toLowerCase()) as never) ?? null,
      getUserById: (id: string) => (users.find((u) => u.user_id === id) as never) ?? null,
      listUsers: () => users.map((u) => ({ ...u })),
      putUser: (u: Record<string, unknown>) => {
        const i = users.findIndex((x) => x.user_id === u.user_id);
        if (i >= 0) users[i] = { ...u };
        else users.push({ ...u });
      },
      listMembers: () => members,
      getTeam: (id: string) => ({ id, name: id === TEAM ? 'Đội PTC3' : 'Đội khác' }),
      readRows: (tb: string) => (data[tb] ?? []).map((r) => ({ ...r })),
      writeRows: (tb: string, rows: Record<string, unknown>[]) => {
        const cur = (data[tb] ??= []);
        for (const r of rows) {
          const i = cur.findIndex((x) => x.team_id === r.team_id && x.id === r.id);
          if (i >= 0) cur[i] = { ...r };
          else cur.push({ ...r });
        }
      },
      putPhoto: (p: string, b: string, m: string) => void (photos[p] = { base64: b, mime: m }),
      getPhoto: (p: string) => photos[p] ?? null,
    },
  };
  return { env, users, data, mails, tick: (ms = 1000) => (t += ms), setNow: (x: number) => (t = x) };
}

let E: ReturnType<typeof makeEnv>;
const call = (req: Record<string, unknown>) => coreHandle(req, E.env);
const idTok = (email: string, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ aud: CLIENT, email, email_verified: 'true', name: email.split('@')[0], exp: Math.floor(E.env.now() / 1000) + 3600, ...extra });
const login = (email: string) => {
  const r = call({ action: 'loginGoogle', idToken: idTok(email) });
  expect(r.ok).toBe(true);
  return r as Res & { token: string; me: { userId: string; status: string; role: string; teamId: string } };
};
/** Đăng nhập rồi để Quản trị duyệt với vai trò cho trước. */
const member = (email: string, role: string) => {
  const admin = login('admin@evn.vn');
  const u = login(email);
  if (u.me.status !== 'approved' || u.me.role !== role) {
    const d = call({ action: 'decideUser', token: admin.token, userId: u.me.userId, patch: { status: 'approved', role, team_id: TEAM } });
    expect(d.ok).toBe(true);
  }
  return login(email);
};
const up = (token: string, table: string, rows: Record<string, unknown>[]) => call({ action: 'upsert', token, table, rows });

beforeEach(() => {
  E = makeEnv();
});

describe('phiên bản máy chủ', () => {
  it('ping báo phiên bản khớp với bản app cần (src/sync/gas.ts)', async () => {
    const r = call({ action: 'ping' });
    const src = readFileSync(new URL('../src/sync/gas.ts', import.meta.url), 'utf8');
    const need = Number(/REQUIRED_SERVER_VERSION = (\d+)/.exec(src)?.[1]);
    expect(r.version).toBe(need);
  });
  it('lệnh lạ trả bad_request "Thao tác không hỗ trợ" (app dựa vào câu này để nhận ra máy chủ cũ)', () => {
    expect(call({ action: 'khongco' })).toMatchObject({ ok: false, code: 'bad_request', message: 'Thao tác không hỗ trợ: khongco' });
  });
});

describe('đăng nhập', () => {
  it('email trong danh sách thành viên được duyệt sẵn; Quản trị theo vai trò admin', () => {
    expect(login('admin@evn.vn').me).toMatchObject({ status: 'approved', role: 'admin', teamId: TEAM });
    expect(login('tn@evn.vn').me).toMatchObject({ status: 'approved', role: 'tester', teamId: TEAM });
  });

  it('người lạ ở trạng thái chờ duyệt, không đọc được dữ liệu', () => {
    const u = login('la@gmail.com');
    expect(u.me).toMatchObject({ status: 'pending', role: null, teamId: null });
    expect(call({ action: 'pull', token: u.token, table: 'sessions' })).toMatchObject({ ok: false, code: 'forbidden' });
  });

  it('từ chối mã Google sai ứng dụng, email chưa xác minh hoặc hết hạn', () => {
    expect(call({ action: 'loginGoogle', idToken: idTok('a@x.vn', { aud: 'khac' }) }).code).toBe('auth');
    expect(call({ action: 'loginGoogle', idToken: idTok('a@x.vn', { email_verified: 'false' }) }).code).toBe('auth');
    expect(call({ action: 'loginGoogle', idToken: idTok('a@x.vn', { exp: 1 }) }).code).toBe('auth');
  });

  it('token bị sửa hoặc hết hạn 30 ngày thì bị từ chối', () => {
    const a = login('admin@evn.vn');
    const forged = a.token.replace(encodeURIComponent('admin@evn.vn'), encodeURIComponent('tn@evn.vn'));
    expect(call({ action: 'me', token: forged }).code).toBe('auth');
    expect(call({ action: 'me', token: a.token }).ok).toBe(true);
    E.tick(31 * 86400000);
    expect(call({ action: 'me', token: a.token }).code).toBe('auth');
  });

  it('mã email: gửi mail, sai quá 5 lần thì hủy mã, đúng mã thì đăng nhập', () => {
    expect(call({ action: 'sendCode', email: 'tn@evn.vn' }).ok).toBe(true);
    expect(E.mails[0].html).toContain('123456');
    expect(call({ action: 'verifyCode', email: 'tn@evn.vn', code: '000000' }).code).toBe('auth');
    const r = call({ action: 'verifyCode', email: 'tn@evn.vn', code: ' 123456 ' });
    expect(r.ok).toBe(true);
    expect((r as Res & { me: { role: string } }).me.role).toBe('tester');
    // mã đã dùng không dùng lại được
    expect(call({ action: 'verifyCode', email: 'tn@evn.vn', code: '123456' }).code).toBe('auth');

    call({ action: 'sendCode', email: 'b@evn.vn' });
    for (let i = 0; i < 5; i++) call({ action: 'verifyCode', email: 'b@evn.vn', code: '999999' });
    expect(call({ action: 'verifyCode', email: 'b@evn.vn', code: '123456' }).code).toBe('auth');
  });

  it('giới hạn số lần gửi mã', () => {
    for (let i = 0; i < 5; i++) expect(call({ action: 'sendCode', email: 'c@evn.vn' }).ok).toBe(true);
    expect(call({ action: 'sendCode', email: 'c@evn.vn' }).code).toBe('rate');
  });
});

describe('dữ liệu theo đội và vai trò', () => {
  it('chỉ đọc được dữ liệu của đội mình; pull theo mốc updated_at', () => {
    const a = login('admin@evn.vn');
    const k = login('khac@evn.vn');
    expect(up(a.token, 'profiles', [{ id: 'p1', data: { id: 'p1' }, deleted: false }]).ok).toBe(true);
    E.tick();
    expect(up(k.token, 'profiles', [{ id: 'p9', data: { id: 'p9' }, deleted: false }]).ok).toBe(true);
    const rows = call({ action: 'pull', token: a.token, table: 'profiles' }).rows as { id: string; updated_at: string }[];
    expect(rows.map((r) => r.id)).toEqual(['p1']);
    E.tick();
    up(a.token, 'profiles', [{ id: 'p2', data: { id: 'p2' }, deleted: false }]);
    const since = rows[0].updated_at;
    E.tick();
    const later = call({ action: 'pull', token: a.token, table: 'profiles', since: new Date(E.env.now() - 1500).toISOString() }).rows as { id: string }[];
    expect(later.map((r) => r.id)).toEqual(['p2']);
    expect((call({ action: 'pull', token: a.token, table: 'profiles', since }).rows as unknown[]).length).toBe(2);
  });

  it('Nhân viên TN ghi được số đo nhưng không tạo phiên; Người xem không ghi gì', () => {
    const t = member('tn@evn.vn', 'tester');
    expect(up(t.token, 'measurements', [{ id: 'm1', data: { sessionId: 's1' }, deleted: false }]).ok).toBe(true);
    expect(up(t.token, 'sessions', [{ id: 's2', data: {}, deleted: false }]).code).toBe('refused');
    const v = member('xem@evn.vn', 'viewer');
    expect(up(v.token, 'measurements', [{ id: 'm2', data: { sessionId: 's1' }, deleted: false }]).code).toBe('refused');
    expect(call({ action: 'pull', token: v.token, table: 'measurements' }).ok).toBe(true);
  });

  it('một dòng không hợp lệ → từ chối cả nhóm (máy khách gửi lại từng dòng)', () => {
    const t = member('tn@evn.vn', 'tester');
    const r = up(t.token, 'measurements', [
      { id: 'ok', data: { sessionId: 's1' }, deleted: false },
      { id: '', data: {}, deleted: false },
    ]);
    expect(r.ok).toBe(false);
    expect(E.data.measurements).toBeUndefined();
  });
});

describe('đơn vị & nhân viên', () => {
  it('đơn vị: chỉ Quản trị ghi; nhân viên: Quản trị và Chỉ huy ghi', () => {
    const a = member('qt@evn.vn', 'admin');
    const l = member('ch@evn.vn', 'leader');
    const t = member('tn@evn.vn', 'tester');
    const unit = { id: 'u1', data: { id: 'u1', orgName: 'TT', name: 'Đội' }, deleted: false };
    const staff = { id: 'st1', data: { id: 'st1', unitId: 'u1', name: 'A' }, deleted: false };
    expect(up(a.token, 'units', [unit]).ok).toBe(true);
    expect(up(l.token, 'units', [unit]).code).toBe('refused');
    expect(up(l.token, 'staff', [staff]).ok).toBe(true);
    expect(up(t.token, 'staff', [staff]).code).toBe('refused');
  });
  it('mốc lịch sử xu hướng: Quản trị và Chỉ huy ghi, Nhân viên TN không', () => {
    const l = member('ch@evn.vn', 'leader');
    const t = member('tn@evn.vn', 'tester');
    const h = { id: 'h1', data: { id: 'h1', profileId: 'p', metric: 'mov_rcd' }, deleted: false };
    expect(up(l.token, 'trend_history', [h]).ok).toBe(true);
    expect(up(t.token, 'trend_history', [h]).code).toBe('refused');
  });
});

describe('chữ ký và khóa biên bản', () => {
  const sig = (id: string, userId: string, slot: string, sessionId = 's1') => ({ id, data: { id, sessionId, slot, userId }, deleted: false });

  it('ký đúng tài khoản, đúng ô theo vai trò', () => {
    const t = member('tn@evn.vn', 'tester');
    const l = member('ch@evn.vn', 'leader');
    expect(up(t.token, 'signatures', [sig('x1', t.me.userId, 'tester')]).ok).toBe(true);
    expect(up(t.token, 'signatures', [sig('x2', t.me.userId, 'leader')]).code).toBe('refused');
    expect(up(t.token, 'signatures', [sig('x3', l.me.userId, 'tester')]).code).toBe('refused'); // ký hộ người khác
    expect(up(l.token, 'signatures', [sig('x4', l.me.userId, 'leader')]).ok).toBe(true);
    expect(up(t.token, 'signatures', [sig('x5', t.me.userId, 'qlvh')]).code).toBe('refused'); // ô QLVH đã bỏ
    // ô Người thí nghiệm chỉ 1 chữ ký (người chịu trách nhiệm)
    const t2 = member('tn2@evn.vn', 'tester');
    expect(up(t2.token, 'signatures', [sig('x6', t2.me.userId, 'tester')]).code).toBe('refused');
  });

  it('chữ ký Chỉ huy khóa phiên, số đo, kể cả lệnh xóa; mỗi phiên chỉ 1 chữ ký Chỉ huy', () => {
    const l = member('ch@evn.vn', 'leader');
    expect(up(l.token, 'sessions', [{ id: 's1', data: { id: 's1' }, deleted: false }]).ok).toBe(true);
    expect(up(l.token, 'measurements', [{ id: 'm1', data: { sessionId: 's1' }, deleted: false }]).ok).toBe(true);
    expect(up(l.token, 'signatures', [sig('L1', l.me.userId, 'leader')]).ok).toBe(true);

    expect(up(l.token, 'sessions', [{ id: 's1', data: { id: 's1', conclusion: 'sửa' }, deleted: false }]).code).toBe('refused');
    expect(up(l.token, 'measurements', [{ id: 'm1', data: { sessionId: 's1', value: '9' }, deleted: false }]).code).toBe('refused');
    expect(up(l.token, 'measurements', [{ id: 'm1', data: {}, deleted: true }]).code).toBe('refused'); // xóa qua tombstone
    expect(up(l.token, 'signatures', [sig('L2', l.me.userId, 'leader')]).code).toBe('refused');
    // phiên khác vẫn sửa bình thường
    expect(up(l.token, 'measurements', [{ id: 'm2', data: { sessionId: 's2' }, deleted: false }]).ok).toBe(true);
  });

  it('chỉ Quản trị hủy được chữ ký; hủy xong phiên mở khóa', () => {
    const l = member('ch@evn.vn', 'leader');
    const a = login('admin@evn.vn');
    up(l.token, 'signatures', [sig('L1', l.me.userId, 'leader')]);
    expect(up(l.token, 'signatures', [{ id: 'L1', data: {}, deleted: true }]).code).toBe('refused');
    expect(up(a.token, 'signatures', [{ id: 'L1', data: {}, deleted: true }]).ok).toBe(true);
    expect(up(l.token, 'measurements', [{ id: 'm1', data: { sessionId: 's1' }, deleted: false }]).ok).toBe(true);
  });
});

describe('quản trị tài khoản', () => {
  it('chỉ Quản trị xem danh sách; không thấy tài khoản đội khác', () => {
    const a = login('admin@evn.vn');
    login('la@gmail.com');
    login('khac@evn.vn');
    const list = call({ action: 'listUsers', token: a.token }).users as { email: string }[];
    expect(list.map((u) => u.email).sort()).toEqual(['admin@evn.vn', 'la@gmail.com']);
    expect(call({ action: 'listUsers', token: login('tn@evn.vn').token }).code).toBe('forbidden');
  });

  it('không tự sửa mình, không sửa đội khác, không gán vào đội khác', () => {
    const a = login('admin@evn.vn');
    const k = login('khac@evn.vn');
    const la = login('la@gmail.com');
    expect(call({ action: 'decideUser', token: a.token, userId: a.me.userId, patch: { role: 'viewer' } }).code).toBe('forbidden');
    expect(call({ action: 'decideUser', token: a.token, userId: k.me.userId, patch: { status: 'disabled' } }).code).toBe('forbidden');
    expect(call({ action: 'decideUser', token: a.token, userId: la.me.userId, patch: { status: 'approved', role: 'tester', team_id: OTHER } }).code).toBe('forbidden');
    expect(call({ action: 'decideUser', token: a.token, userId: la.me.userId, patch: { status: 'approved', role: 'tester', team_id: TEAM } }).ok).toBe(true);
    expect(login('la@gmail.com').me).toMatchObject({ status: 'approved', role: 'tester', teamId: TEAM });
  });

  it('tài khoản bị khóa mất quyền ngay ở lệnh kế tiếp', () => {
    const a = login('admin@evn.vn');
    const t = login('tn@evn.vn');
    expect(call({ action: 'pull', token: t.token, table: 'sessions' }).ok).toBe(true);
    call({ action: 'decideUser', token: a.token, userId: t.me.userId, patch: { status: 'disabled' } });
    expect(call({ action: 'pull', token: t.token, table: 'sessions' }).code).toBe('forbidden');
  });
});

describe('đăng ký, gia hạn phiên, khóa có lý do', () => {
  const profile = { name: 'Nguyễn Văn A', title: 'Kỹ sư', unit: 'Đội TN Lâm Đồng', phone: '0909 123 456', note: 'Xin tham gia đội' };

  it('người mới gửi hồ sơ đăng ký: lưu thông tin, vẫn chờ duyệt', () => {
    const u = login('la@gmail.com');
    expect(u.me).toMatchObject({ registered: false, status: 'pending' });
    const r = call({ action: 'register', token: u.token, profile }) as Res & { me: Record<string, unknown> };
    expect(r.ok).toBe(true);
    expect(r.me).toMatchObject({ registered: true, status: 'pending', role: null, name: 'Nguyễn Văn A', title: 'Kỹ sư', unit: 'Đội TN Lâm Đồng' });
    const a = login('admin@evn.vn');
    const list = call({ action: 'listUsers', token: a.token }).users as Record<string, unknown>[];
    expect(list.find((x) => x.email === 'la@gmail.com')).toMatchObject({ title: 'Kỹ sư', phone: '0909 123 456', note: 'Xin tham gia đội' });
  });

  it('kiểm tra hồ sơ: bắt buộc họ tên/chức danh/đơn vị, số điện thoại hợp lệ, không đổi được vai trò', () => {
    const u = login('la@gmail.com');
    expect(call({ action: 'register', token: u.token, profile: { ...profile, name: ' ' } }).code).toBe('bad_request');
    expect(call({ action: 'register', token: u.token, profile: { ...profile, unit: '' } }).code).toBe('bad_request');
    expect(call({ action: 'register', token: u.token, profile: { ...profile, phone: 'gọi tôi' } }).code).toBe('bad_request');
    const r = call({ action: 'register', token: u.token, profile: { ...profile, role: 'admin', status: 'approved' } }) as Res & { me: Record<string, unknown> };
    expect(r.me).toMatchObject({ status: 'pending', role: null });
  });

  it('gọi "me" trả token mới (gia hạn 30 ngày) và ghi lần truy cập cuối', () => {
    const a = login('admin@evn.vn');
    E.tick(20 * 86400000);
    const r = call({ action: 'me', token: a.token }) as Res & { token: string };
    expect(r.ok).toBe(true);
    E.tick(20 * 86400000); // token cũ đã quá 30 ngày, token mới thì chưa
    expect(call({ action: 'me', token: a.token }).code).toBe('auth');
    expect(call({ action: 'me', token: r.token }).ok).toBe(true);
    expect(E.users.find((u) => u.email === 'admin@evn.vn')?.last_seen).toBeTruthy();
  });

  it('duyệt không ghi vai trò → mặc định Nhân viên TN, vào đội của Quản trị', () => {
    const a = login('admin@evn.vn');
    const la = login('la@gmail.com');
    expect(call({ action: 'decideUser', token: a.token, userId: la.me.userId, patch: { status: 'approved' } }).ok).toBe(true);
    expect(login('la@gmail.com').me).toMatchObject({ status: 'approved', role: 'tester', teamId: TEAM });
  });

  it('khóa có lý do; người bị khóa thấy lý do, không gửi được hồ sơ; mở khóa xóa lý do', () => {
    const a = login('admin@evn.vn');
    const t = login('tn@evn.vn');
    call({ action: 'decideUser', token: a.token, userId: t.me.userId, patch: { status: 'disabled', ban_reason: 'Nghỉ việc' } });
    expect((call({ action: 'me', token: t.token }) as Res & { me: Record<string, unknown> }).me).toMatchObject({ status: 'disabled', banReason: 'Nghỉ việc' });
    expect(call({ action: 'register', token: t.token, profile }).code).toBe('forbidden');
    call({ action: 'decideUser', token: a.token, userId: t.me.userId, patch: { status: 'approved' } });
    expect((call({ action: 'me', token: t.token }) as Res & { me: Record<string, unknown> }).me).toMatchObject({ status: 'approved', banReason: '' });
  });

  it('cấu hình (hồ sơ giàn, máy TN) chỉ Quản trị sửa; thông tin máy chủ chỉ Quản trị xem', () => {
    const l = member('ch@evn.vn', 'leader');
    expect(up(l.token, 'profiles', [{ id: 'p1', data: { id: 'p1' }, deleted: false }]).code).toBe('refused');
    expect(up(l.token, 'instruments', [{ id: 'i1', data: { id: 'i1' }, deleted: false }]).code).toBe('refused');
    expect(up(l.token, 'sessions', [{ id: 's1', data: { id: 's1' }, deleted: false }]).ok).toBe(true);
    const a = login('admin@evn.vn');
    expect(up(a.token, 'instruments', [{ id: 'i1', data: { id: 'i1' }, deleted: false }]).ok).toBe(true);
    expect(call({ action: 'serverInfo', token: l.token }).code).toBe('forbidden');
    expect(call({ action: 'serverInfo', token: a.token })).toMatchObject({ ok: true, clientIdSet: true, users: { approved: 2 } });
  });
});

describe('ảnh hiện trường', () => {
  it('chỉ gửi/tải ảnh trong thư mục của đội mình, đúng định dạng', () => {
    const t = login('tn@evn.vn');
    expect(call({ action: 'uploadPhoto', token: t.token, path: `${TEAM}/p1.jpg`, data: 'AAAA', mime: 'image/jpeg' }).ok).toBe(true);
    expect(call({ action: 'downloadPhoto', token: t.token, path: `${TEAM}/p1.jpg` })).toMatchObject({ ok: true, data: 'AAAA' });
    expect(call({ action: 'uploadPhoto', token: t.token, path: `${OTHER}/p1.jpg`, data: 'AAAA', mime: 'image/jpeg' }).code).toBe('refused');
    expect(call({ action: 'uploadPhoto', token: t.token, path: `${TEAM}/../x.jpg`, data: 'AAAA', mime: 'image/jpeg' }).code).toBe('refused');
    expect(call({ action: 'uploadPhoto', token: t.token, path: `${TEAM}/p2.svg`, data: 'AAAA', mime: 'image/svg+xml' }).code).toBe('refused');
  });
});

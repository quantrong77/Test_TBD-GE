/**
 * TBD-GE Field – máy chủ đồng bộ trên Google Apps Script (lõi nghiệp vụ).
 *
 * File này KHÔNG gọi API của Google (SpreadsheetApp, DriveApp…): mọi thứ bên ngoài đi qua `env`
 * do Code.gs cung cấp. Nhờ vậy cùng một mã chạy được trong Apps Script và trong bộ kiểm thử
 * (tests/gas-core.spec.ts). Quy tắc phân quyền ở đây thay cho Row Level Security của bản Supabase:
 *   - Chỉ tài khoản đã được duyệt mới đọc/ghi dữ liệu của đội mình.
 *   - Cấu hình (hồ sơ giàn, máy TN): chỉ Quản trị. Phiên: Quản trị + Chỉ huy. Số đo, cổng an toàn, ảnh: thêm Nhân viên TN.
 *   - Người mới đăng nhập → Chờ duyệt, phải gửi hồ sơ đăng ký (họ tên, chức danh, đơn vị); Quản trị duyệt / gán vai trò / khóa.
 *   - Chữ ký Chỉ huy trực tiếp khóa phiên: không ai sửa/xóa phiên, số đo, cổng an toàn, ảnh của phiên đó.
 *   - Ký đúng tài khoản mình, đúng ô theo vai trò; mỗi phiên chỉ 1 chữ ký Chỉ huy; chỉ Quản trị hủy chữ ký.
 *   - Quản trị không tự sửa tài khoản của mình, không sửa tài khoản đội khác.
 *
 * env = {
 *   store: {
 *     getUserByEmail(email), getUserById(id), listUsers(), putUser(user),
 *     listMembers() -> [{ email, team_id, role }], getTeam(id) -> { id, name } | null,
 *     readRows(table) -> [{ team_id, id, data, deleted, updated_at, updated_by }],
 *     writeRows(table, rows),            // ghi đè theo (team_id, id)
 *     putPhoto(path, base64, mime), getPhoto(path) -> { base64, mime } | null
 *   },
 *   clientId, now() -> ms, uuid(), hmac(str) -> hex, randomDigits(n),
 *   info() -> { dbUrl, photoFolderUrl }   (tùy chọn – trang Quản trị),
 *   verifyIdToken(idToken) -> { aud, email, email_verified, name, exp },
 *   sendMail(to, subject, html), cache: { get(k), put(k, v, seconds), remove(k) }
 * }
 */

/** Tăng mỗi khi thêm/đổi lệnh máy chủ; app báo "máy chủ cần cập nhật" nếu thấp hơn số app cần (gas.ts). */
var SERVER_VERSION = 2;

var TABLES = ['profiles', 'instruments', 'sessions', 'gate_checks', 'measurements', 'photos', 'signatures'];
// Cấu hình (hồ sơ giàn, máy thí nghiệm) chỉ Quản trị sửa
var WRITE_ROLES = {
  profiles: ['admin'],
  instruments: ['admin'],
  sessions: ['admin', 'leader'],
  gate_checks: ['admin', 'leader', 'tester'],
  measurements: ['admin', 'leader', 'tester'],
  photos: ['admin', 'leader', 'tester'],
};
var ROLES = ['admin', 'leader', 'tester', 'viewer'];
var STATUSES = ['pending', 'approved', 'disabled'];
var SESSION_DAYS = 30;
var OTP_TTL_S = 600;
var OTP_MAX_TRIES = 5;
var OTP_MAX_SENDS = 5; // mỗi 15 phút / email
var MAX_CELL = 45000; // Google Sheets: tối đa 50.000 ký tự mỗi ô
var MAX_PHOTO_B64 = 12 * 1024 * 1024;

function fail(code, message) {
  var e = new Error(message);
  e.code = code;
  throw e;
}

function coreHandle(req, env) {
  try {
    if (!req || typeof req !== 'object') fail('bad_request', 'Yêu cầu không hợp lệ');
    switch (req.action) {
      case 'ping':
        return { ok: true, app: 'TBD-GE Field', version: SERVER_VERSION, time: new Date(env.now()).toISOString() };
      case 'loginGoogle':
        return ok(loginGoogle(req, env));
      case 'sendCode':
        return ok(sendCode(req, env));
      case 'verifyCode':
        return ok(verifyCode(req, env));
      case 'me':
        return ok(me(req, env));
      case 'register':
        return ok(register(req, env));
      case 'serverInfo':
        return ok(serverInfo(req, env));
      case 'pull':
        return ok({ rows: pull(req, env) });
      case 'upsert':
        return ok({ rows: upsert(req, env) });
      case 'uploadPhoto':
        return ok(uploadPhoto(req, env));
      case 'downloadPhoto':
        return ok(downloadPhoto(req, env));
      case 'listUsers':
        return ok({ users: listUsers(req, env) });
      case 'decideUser':
        return ok(decideUser(req, env));
      default:
        fail('bad_request', 'Thao tác không hỗ trợ: ' + req.action);
    }
  } catch (e) {
    return { ok: false, code: (e && e.code) || 'error', message: String((e && e.message) || e) };
  }
}

function ok(x) {
  x.ok = true;
  return x;
}

// ---------------- Phiên đăng nhập (token ký HMAC, hạn 30 ngày) ----------------
function issueToken(email, env) {
  var payload = email + '|' + (env.now() + SESSION_DAYS * 86400000);
  return encodeURIComponent(payload) + '.' + env.hmac('tok:' + payload);
}

function authUser(req, env) {
  var t = String(req.token || '');
  var dot = t.lastIndexOf('.');
  if (dot < 1) fail('auth', 'Chưa đăng nhập');
  var payload;
  try {
    payload = decodeURIComponent(t.slice(0, dot));
  } catch (e) {
    fail('auth', 'Phiên đăng nhập không hợp lệ');
  }
  if (env.hmac('tok:' + payload) !== t.slice(dot + 1)) fail('auth', 'Phiên đăng nhập không hợp lệ');
  var bar = payload.lastIndexOf('|');
  var email = payload.slice(0, bar);
  var exp = Number(payload.slice(bar + 1));
  if (!(exp > env.now())) fail('auth', 'Phiên đăng nhập đã hết hạn – đăng nhập lại');
  var u = env.store.getUserByEmail(email);
  if (!u) fail('auth', 'Tài khoản không tồn tại');
  return u;
}

function meOf(u, env) {
  var team = u.team_id ? env.store.getTeam(u.team_id) : null;
  return {
    userId: u.user_id,
    email: u.email,
    name: u.full_name || u.email,
    status: u.status,
    role: u.role || null,
    teamId: u.team_id || null,
    teamName: team ? team.name : null,
    registered: !!u.registered_at,
    title: u.title || '',
    unit: u.unit || '',
    phone: u.phone || '',
    banReason: u.status === 'disabled' ? u.ban_reason || '' : '',
  };
}

/** Đọc tài khoản + gia hạn phiên (dùng thường xuyên thì không bao giờ phải đăng nhập lại). */
function me(req, env) {
  var u = authUser(req, env);
  var now = env.now();
  var seen = u.last_seen ? Date.parse(u.last_seen) : 0;
  if (!(now - seen < 3600000)) {
    u.last_seen = new Date(now).toISOString();
    env.store.putUser(u);
  }
  return session(u, env);
}

function clean(v, max, label, required) {
  var s = String(v == null ? '' : v)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .trim();
  if (required && s.length < 2) fail('bad_request', 'Vui lòng nhập ' + label);
  if (s.length > max) fail('bad_request', label + ' quá dài (tối đa ' + max + ' ký tự)');
  return s;
}

/** Đăng ký / cập nhật hồ sơ của chính mình. Không đổi trạng thái duyệt, vai trò, đội. */
function register(req, env) {
  var u = authUser(req, env);
  if (u.status === 'disabled') fail('forbidden', 'Tài khoản đã bị khóa');
  var p = req.profile || {};
  u.full_name = clean(p.name, 100, 'họ và tên', true);
  u.title = clean(p.title, 100, 'chức danh', true);
  u.unit = clean(p.unit, 150, 'đơn vị công tác', true);
  u.phone = clean(p.phone, 30, 'số điện thoại', false);
  if (u.phone && !/^[0-9+().\s-]{6,30}$/.test(u.phone)) fail('bad_request', 'Số điện thoại không hợp lệ');
  u.note = clean(p.note, 500, 'ghi chú', false);
  if (!u.registered_at) u.registered_at = new Date(env.now()).toISOString();
  env.store.putUser(u);
  return { me: meOf(u, env) };
}

/** Thông tin máy chủ cho trang Quản trị. */
function serverInfo(req, env) {
  var a = requireAdmin(req, env);
  var counts = { pending: 0, approved: 0, disabled: 0 };
  env.store.listUsers().forEach(function (x) {
    if ((!x.team_id || x.team_id === a.team_id) && counts[x.status] !== undefined) counts[x.status]++;
  });
  var info = env.info ? env.info() : {};
  return { users: counts, dbUrl: info.dbUrl || '', photoFolderUrl: info.photoFolderUrl || '', clientIdSet: !!env.clientId, version: SERVER_VERSION };
}

/** Tạo tài khoản lần đăng nhập đầu: email có trong danh sách thành viên → duyệt sẵn, còn lại chờ duyệt. */
function ensureUser(email, name, provider, env) {
  email = String(email).toLowerCase();
  var u = env.store.getUserByEmail(email);
  if (u) {
    if (!u.full_name && name) {
      u.full_name = name;
      env.store.putUser(u);
    }
    return u;
  }
  var members = env.store.listMembers().filter(function (m) {
    return String(m.email).toLowerCase() === email;
  });
  var m = members[0];
  var nowIso = new Date(env.now()).toISOString();
  u = {
    user_id: env.uuid(),
    email: email,
    full_name: name || '',
    provider: provider,
    status: m ? 'approved' : 'pending',
    role: m ? (ROLES.indexOf(m.role) >= 0 ? m.role : 'tester') : null,
    team_id: m ? m.team_id : null,
    requested_at: nowIso,
    decided_at: m ? nowIso : '',
    decided_by: '',
  };
  env.store.putUser(u);
  return u;
}

function session(u, env) {
  return { token: issueToken(u.email, env), me: meOf(u, env), expiresAt: env.now() + SESSION_DAYS * 86400000 };
}

function loginGoogle(req, env) {
  if (!env.clientId) fail('config', 'Máy chủ chưa khai báo GOOGLE_CLIENT_ID');
  var info;
  try {
    info = env.verifyIdToken(String(req.idToken || ''));
  } catch (e) {
    fail('auth', 'Không xác thực được tài khoản Google');
  }
  if (!info || info.aud !== env.clientId) fail('auth', 'Mã Google không dành cho ứng dụng này');
  if (String(info.email_verified) !== 'true') fail('auth', 'Email Google chưa được xác minh');
  if (!(Number(info.exp) * 1000 > env.now())) fail('auth', 'Mã Google đã hết hạn – thử lại');
  return session(ensureUser(info.email, info.name || '', 'google', env), env);
}

var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function sendCode(req, env) {
  var email = String(req.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) fail('bad_request', 'Email không hợp lệ');
  var nKey = 'otpn:' + email;
  var n = Number(env.cache.get(nKey) || 0);
  if (n >= OTP_MAX_SENDS) fail('rate', 'Gửi mã quá nhiều lần – chờ 15 phút rồi thử lại');
  env.cache.put(nKey, String(n + 1), 900);
  var code = env.randomDigits(6);
  env.cache.put('otp:' + email, JSON.stringify({ h: env.hmac('otp:' + email + ':' + code), tries: 0 }), OTP_TTL_S);
  env.sendMail(
    email,
    'Mã đăng nhập Sổ tay TN Tụ bù dọc GE',
    '<h2>Mã đăng nhập Sổ tay TN Tụ bù dọc GE</h2><p>Mã của bạn: <b style="font-size:24px">' +
      code +
      '</b></p><p>Mã hết hạn sau 10 phút. Không chia sẻ mã này.</p>',
  );
  return { sent: true };
}

function verifyCode(req, env) {
  var email = String(req.email || '').trim().toLowerCase();
  var key = 'otp:' + email;
  var raw = env.cache.get(key);
  if (!raw) fail('auth', 'Mã không đúng hoặc đã hết hạn – gửi lại mã mới');
  var st = JSON.parse(raw);
  if (st.tries >= OTP_MAX_TRIES) {
    env.cache.remove(key);
    fail('auth', 'Nhập sai quá nhiều lần – gửi lại mã mới');
  }
  if (env.hmac('otp:' + email + ':' + String(req.code || '').trim()) !== st.h) {
    st.tries++;
    env.cache.put(key, JSON.stringify(st), OTP_TTL_S);
    fail('auth', 'Mã không đúng hoặc đã hết hạn – gửi lại mã mới');
  }
  env.cache.remove(key);
  return session(ensureUser(email, '', 'email', env), env);
}

// ---------------- Dữ liệu ----------------
function requireMember(u) {
  if (u.status !== 'approved' || !u.team_id || ROLES.indexOf(u.role) < 0) fail('forbidden', 'Tài khoản chưa được duyệt hoặc đã bị khóa');
  return u;
}

function checkTable(t) {
  if (TABLES.indexOf(t) < 0) fail('bad_request', 'Bảng không hợp lệ: ' + t);
}

function pull(req, env) {
  var u = requireMember(authUser(req, env));
  checkTable(req.table);
  var since = req.since ? String(req.since) : null;
  return env.store
    .readRows(req.table)
    .filter(function (r) {
      return r.team_id === u.team_id && (!since || r.updated_at >= since);
    })
    .sort(function (a, b) {
      return a.updated_at < b.updated_at ? -1 : a.updated_at > b.updated_at ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    })
    .map(function (r) {
      return { id: r.id, data: r.data, deleted: !!r.deleted, updated_at: r.updated_at };
    });
}

/** Phiên đã có chữ ký Chỉ huy trực tiếp (chưa hủy) → khóa. */
function lockedSessions(team, env) {
  var s = {};
  env.store.readRows('signatures').forEach(function (r) {
    if (r.team_id === team && !r.deleted && r.data && r.data.slot === 'leader' && r.data.sessionId) s[r.data.sessionId] = true;
  });
  return s;
}

function canSign(u, d) {
  if (!d || d.userId !== u.user_id) return false;
  if (d.slot === 'tester') return u.role === 'tester' || u.role === 'leader';
  if (d.slot === 'leader') return u.role === 'leader';
  return false;
}

/** Ghi một nhóm dòng. Một dòng không hợp lệ → từ chối cả nhóm (máy khách sẽ gửi lại từng dòng). */
function upsert(req, env) {
  var u = requireMember(authUser(req, env));
  var table = req.table;
  checkTable(table);
  var rows = req.rows;
  if (!Array.isArray(rows) || !rows.length) return [];
  if (rows.length > 500) fail('bad_request', 'Quá nhiều dòng trong một lần gửi');

  var existing = {};
  var all = env.store.readRows(table);
  all.forEach(function (r) {
    if (r.team_id === u.team_id) existing[r.id] = r;
  });
  var locked = table === 'signatures' ? null : lockedSessions(u.team_id, env);

  rows.forEach(function (r) {
    if (!r || typeof r.id !== 'string' || !r.id || r.id.length > 300) fail('bad_request', 'Mã bản ghi không hợp lệ');
    if (!r.data || typeof r.data !== 'object') fail('bad_request', 'Dữ liệu không hợp lệ');
    if (JSON.stringify(r.data).length > MAX_CELL) fail('refused', 'Bản ghi quá lớn để lưu vào Google Sheets');
    var old = existing[r.id];
    if (table === 'signatures') {
      if (u.role === 'admin') {
        // Quản trị: sửa/hủy chữ ký đã có (như chính sách cũ); ký mới thì phải đúng ô của mình
        if (!old && (r.deleted || !canSign(u, r.data))) fail('refused', 'Không có quyền ký ô này');
      } else {
        if (r.deleted) fail('refused', 'Chỉ Quản trị được hủy chữ ký');
        if (old && old.data && old.data.userId !== u.user_id) fail('refused', 'Không sửa được chữ ký của người khác');
        if (!canSign(u, r.data)) fail('refused', 'Không có quyền ký ô này');
      }
      if (!r.deleted && r.data.slot === 'leader') {
        var dup = all.some(function (s) {
          return s.team_id === u.team_id && s.id !== r.id && !s.deleted && s.data && s.data.slot === 'leader' && s.data.sessionId === r.data.sessionId;
        });
        if (dup) fail('refused', 'Phiên đã có chữ ký Chỉ huy trực tiếp');
      }
      return;
    }
    if (WRITE_ROLES[table].indexOf(u.role) < 0) fail('refused', 'Vai trò không được ghi dữ liệu này');
    var sids = table === 'sessions' ? [r.id] : [r.data.sessionId, old && old.data ? old.data.sessionId : null];
    sids.forEach(function (sid) {
      if (sid && locked[sid]) fail('refused', 'Biên bản đã có chữ ký Chỉ huy – đã khóa');
    });
  });

  var stamp = new Date(env.now()).toISOString();
  var out = rows.map(function (r) {
    return { team_id: u.team_id, id: r.id, data: r.deleted ? {} : r.data, deleted: !!r.deleted, updated_at: stamp, updated_by: u.email };
  });
  env.store.writeRows(table, out);
  return out.map(function (r) {
    return { id: r.id, updated_at: r.updated_at };
  });
}

function checkPhotoPath(u, path) {
  path = String(path || '');
  if (path.indexOf(u.team_id + '/') !== 0 || path.indexOf('..') >= 0 || !/^[\w.\-|/]+$/.test(path)) fail('refused', 'Đường dẫn ảnh không hợp lệ');
  return path;
}

function uploadPhoto(req, env) {
  var u = requireMember(authUser(req, env));
  if (WRITE_ROLES.photos.indexOf(u.role) < 0) fail('refused', 'Vai trò không được gửi ảnh');
  var path = checkPhotoPath(u, req.path);
  var mime = String(req.mime || 'image/jpeg');
  if (!/^image\/(jpeg|png|webp)$/.test(mime)) fail('refused', 'Chỉ nhận ảnh JPEG/PNG/WebP');
  var b64 = String(req.data || '');
  if (!b64 || b64.length > MAX_PHOTO_B64) fail('refused', 'Ảnh rỗng hoặc quá lớn');
  env.store.putPhoto(path, b64, mime);
  return { path: path };
}

function downloadPhoto(req, env) {
  var u = requireMember(authUser(req, env));
  var path = checkPhotoPath(u, req.path);
  var p = env.store.getPhoto(path);
  if (!p) fail('not_found', 'Không tìm thấy ảnh');
  return { data: p.base64, mime: p.mime };
}

// ---------------- Quản trị tài khoản ----------------
function requireAdmin(req, env) {
  var u = requireMember(authUser(req, env));
  if (u.role !== 'admin') fail('forbidden', 'Chỉ Quản trị được quản lý tài khoản');
  return u;
}

function listUsers(req, env) {
  var a = requireAdmin(req, env);
  return env.store
    .listUsers()
    .filter(function (x) {
      return !x.team_id || x.team_id === a.team_id;
    })
    .sort(function (x, y) {
      return x.requested_at < y.requested_at ? 1 : x.requested_at > y.requested_at ? -1 : 0;
    })
    .map(function (x) {
      return {
        user_id: x.user_id,
        email: x.email,
        full_name: x.full_name || null,
        provider: x.provider || null,
        status: x.status,
        role: x.role || null,
        team_id: x.team_id || null,
        requested_at: x.requested_at,
        registered_at: x.registered_at || null,
        title: x.title || '',
        unit: x.unit || '',
        phone: x.phone || '',
        note: x.note || '',
        last_seen: x.last_seen || null,
        decided_at: x.decided_at || null,
        ban_reason: x.ban_reason || '',
      };
    });
}

function decideUser(req, env) {
  var a = requireAdmin(req, env);
  var t = env.store.getUserById(String(req.userId || ''));
  if (!t) fail('not_found', 'Không tìm thấy tài khoản');
  if (t.user_id === a.user_id) fail('forbidden', 'Không tự sửa được tài khoản của mình');
  if (t.team_id && t.team_id !== a.team_id) fail('forbidden', 'Tài khoản thuộc đội khác');
  var p = req.patch || {};
  if (p.status !== undefined) {
    if (STATUSES.indexOf(p.status) < 0) fail('bad_request', 'Trạng thái không hợp lệ');
    t.status = p.status;
  }
  if (p.role !== undefined) {
    if (p.role !== null && ROLES.indexOf(p.role) < 0) fail('bad_request', 'Vai trò không hợp lệ');
    t.role = p.role;
  }
  if (p.team_id !== undefined) {
    if (p.team_id !== null && p.team_id !== a.team_id) fail('forbidden', 'Chỉ gán được vào đội của mình');
    t.team_id = p.team_id;
  }
  if (t.status === 'approved') {
    // duyệt = phải có vai trò và thuộc đội của Quản trị
    if (!t.role) t.role = 'tester';
    if (!t.team_id) t.team_id = a.team_id;
    t.ban_reason = '';
  }
  if (t.status === 'disabled' && (p.status === 'disabled' || p.ban_reason !== undefined)) t.ban_reason = clean(p.ban_reason, 300, 'lý do khóa', false);
  t.decided_at = new Date(env.now()).toISOString();
  t.decided_by = a.user_id;
  env.store.putUser(t);
  return { user_id: t.user_id };
}

// cho bộ kiểm thử Node (Apps Script bỏ qua)
if (typeof module !== 'undefined') module.exports = { coreHandle: coreHandle, TABLES: TABLES, SERVER_VERSION: SERVER_VERSION };

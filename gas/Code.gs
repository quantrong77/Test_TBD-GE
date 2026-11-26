/**
 * TBD-GE Field – máy chủ đồng bộ trên Google Apps Script (lớp nối với Google).
 * Dữ liệu: 1 file Google Sheets (mỗi bảng 1 tab) + 1 thư mục Drive chứa ảnh hiện trường.
 * Hướng dẫn cài đặt: gas/README.md. Lõi nghiệp vụ, phân quyền: Core.gs.
 *
 * Thuộc tính tập lệnh (Project Settings → Script properties):
 *   GOOGLE_CLIENT_ID  – OAuth Client ID (Web) dùng cho nút "Đăng nhập bằng Google"   (bạn điền)
 *   DB_ID, PHOTO_FOLDER_ID, SECRET                                                     (setup() tự tạo)
 */

var DATA_HEADER = ['team_id', 'id', 'data', 'deleted', 'updated_at', 'updated_by'];
// Cột mới luôn thêm vào CUỐI (file Sheets đang dùng được tự bổ sung cột, không cần chạy lại setup)
var USER_HEADER = [
  'user_id', 'email', 'full_name', 'provider', 'status', 'role', 'team_id', 'requested_at', 'decided_at', 'decided_by',
  'title', 'unit', 'phone', 'note', 'registered_at', 'last_seen', 'ban_reason',
];
var TEAM_NAME = 'Đội Thí nghiệm PTC3';

function props_() {
  return PropertiesService.getScriptProperties();
}

/** Chạy MỘT LẦN trong trình soạn Apps Script (Run → setup). Tạo file Sheets, thư mục ảnh, khóa bí mật, đội và Quản trị. */
function setup() {
  var p = props_();
  var ss;
  if (p.getProperty('DB_ID')) {
    ss = SpreadsheetApp.openById(p.getProperty('DB_ID'));
  } else {
    ss = SpreadsheetApp.create('TBD-GE Field – Cơ sở dữ liệu');
    p.setProperty('DB_ID', ss.getId());
  }
  if (!p.getProperty('PHOTO_FOLDER_ID')) {
    var folder = DriveApp.createFolder('TBD-GE Field – Ảnh hiện trường');
    p.setProperty('PHOTO_FOLDER_ID', folder.getId());
  }
  if (!p.getProperty('SECRET')) p.setProperty('SECRET', Utilities.getUuid() + Utilities.getUuid());

  ensureSheet_(ss, 'users', USER_HEADER);
  ensureSheet_(ss, 'teams', ['id', 'name']);
  ensureSheet_(ss, 'members', ['email', 'team_id', 'role']);
  ensureSheet_(ss, 'photo_files', ['path', 'file_id', 'mime']);
  TABLES.forEach(function (t) {
    ensureSheet_(ss, 'data_' + t, DATA_HEADER);
  });
  var first = ss.getSheetByName('Sheet1') || ss.getSheetByName('Trang tính1');
  if (first && ss.getSheets().length > 1) ss.deleteSheet(first);

  var teams = ss.getSheetByName('teams');
  var teamId;
  if (teams.getLastRow() < 2) {
    teamId = Utilities.getUuid();
    teams.appendRow([teamId, TEAM_NAME]);
  } else {
    teamId = teams.getRange(2, 1).getValue();
  }
  var owner = Session.getEffectiveUser().getEmail().toLowerCase();
  var members = ss.getSheetByName('members');
  var has = members.getLastRow() >= 2 && members.getRange(2, 1, members.getLastRow() - 1, 1).getValues().some(function (r) {
    return String(r[0]).toLowerCase() === owner;
  });
  if (!has) members.appendRow([owner, teamId, 'admin']);

  Logger.log('Đã cài đặt. File dữ liệu: ' + ss.getUrl());
  Logger.log('Quản trị: ' + owner + ' – đội ' + TEAM_NAME + ' (' + teamId + ')');
  if (!p.getProperty('GOOGLE_CLIENT_ID')) Logger.log('⚠️ Chưa có GOOGLE_CLIENT_ID trong Script properties – nút Google sẽ chưa dùng được (mã email vẫn dùng được).');
}

function ensureSheet_(ss, name, header) {
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight('bold');
    sh.setFrozenRows(1);
  } else {
    ensureHeader_(sh, header);
  }
  return sh;
}

/** Bổ sung các cột còn thiếu ở cuối dòng tiêu đề (nâng cấp file Sheets cũ). */
function ensureHeader_(sh, header) {
  var n = sh.getLastColumn();
  if (n >= header.length) return;
  sh.getRange(1, n + 1, 1, header.length - n).setValues([header.slice(n)]).setFontWeight('bold');
}

// ---------------- HTTP ----------------
function doGet() {
  return json_({ ok: true, app: 'TBD-GE Field', note: 'Máy chủ đồng bộ – dùng POST' });
}

var WRITE_ACTIONS = { loginGoogle: 1, sendCode: 1, verifyCode: 1, upsert: 1, uploadPhoto: 1, decideUser: 1 };

function doPost(e) {
  var req;
  try {
    req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json_({ ok: false, code: 'bad_request', message: 'JSON không hợp lệ' });
  }
  var lock = null;
  if (WRITE_ACTIONS[req.action]) {
    lock = LockService.getScriptLock();
    if (!lock.tryLock(25000)) return json_({ ok: false, code: 'busy', message: 'Máy chủ đang bận – thử lại sau' });
  }
  try {
    return json_(coreHandle(req, env_()));
  } finally {
    if (lock) lock.releaseLock();
  }
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

// ---------------- Môi trường cho Core.gs ----------------
var ENV_ = null;
function env_() {
  if (ENV_) return ENV_;
  var p = props_();
  var secret = p.getProperty('SECRET');
  if (!secret || !p.getProperty('DB_ID')) throw new Error('Chưa chạy setup()');
  var ss = SpreadsheetApp.openById(p.getProperty('DB_ID'));
  ensureHeader_(ss.getSheetByName('users'), USER_HEADER);
  var folderId = p.getProperty('PHOTO_FOLDER_ID');
  ENV_ = {
    store: sheetStore_(ss, folderId),
    clientId: p.getProperty('GOOGLE_CLIENT_ID') || '',
    info: function () {
      return { dbUrl: ss.getUrl(), photoFolderUrl: folderId ? 'https://drive.google.com/drive/folders/' + folderId : '' };
    },
    now: function () {
      return Date.now();
    },
    uuid: function () {
      return Utilities.getUuid();
    },
    hmac: function (s) {
      return hex_(Utilities.computeHmacSha256Signature(s, secret, Utilities.Charset.UTF_8));
    },
    randomDigits: function (n) {
      var d = Utilities.getUuid().replace(/\D/g, '') + Utilities.getUuid().replace(/\D/g, '');
      return d.slice(0, n);
    },
    verifyIdToken: function (tok) {
      var r = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(tok), { muteHttpExceptions: true });
      if (r.getResponseCode() !== 200) throw new Error('tokeninfo ' + r.getResponseCode());
      var info = JSON.parse(r.getContentText());
      if (info.iss !== 'accounts.google.com' && info.iss !== 'https://accounts.google.com') throw new Error('iss');
      return info;
    },
    sendMail: function (to, subject, html) {
      MailApp.sendEmail({ to: to, subject: subject, htmlBody: html, name: 'Sổ tay TN Tụ bù dọc GE' });
    },
    cache: (function () {
      var c = CacheService.getScriptCache();
      return {
        get: function (k) {
          return c.get(k);
        },
        put: function (k, v, s) {
          c.put(k, v, s);
        },
        remove: function (k) {
          c.remove(k);
        },
      };
    })(),
  };
  return ENV_;
}

function hex_(bytes) {
  return bytes
    .map(function (b) {
      return ('0' + (b & 0xff).toString(16)).slice(-2);
    })
    .join('');
}

// ---------------- Lưu trữ trên Google Sheets / Drive ----------------
function sheetStore_(ss, photoFolderId) {
  var rowsCache = {};

  function sheet(name) {
    var sh = ss.getSheetByName(name);
    // bảng dữ liệu mới (sau khi nâng cấp mã) tự tạo, không cần chạy lại setup()
    if (!sh && name.indexOf('data_') === 0) sh = ensureSheet_(ss, name, DATA_HEADER);
    if (!sh) throw new Error('Thiếu tab ' + name + ' – chạy lại setup()');
    return sh;
  }
  function values(name) {
    var sh = sheet(name);
    var n = sh.getLastRow() - 1;
    if (n < 1) return [];
    return sh.getRange(2, 1, n, sh.getLastColumn()).getValues();
  }
  function iso(v) {
    return v instanceof Date ? v.toISOString() : String(v);
  }

  // ---- tài khoản ----
  function users() {
    return values('users').map(function (r) {
      var u = {};
      USER_HEADER.forEach(function (h, i) {
        var v = r[i];
        u[h] = v instanceof Date ? v.toISOString() : v === '' || v === undefined || v === null ? null : String(v);
      });
      u._row = null;
      return u;
    });
  }
  function putUser(u) {
    var sh = sheet('users');
    var list = values('users');
    var row = USER_HEADER.map(function (h) {
      return u[h] === null || u[h] === undefined ? '' : String(u[h]);
    });
    for (var i = 0; i < list.length; i++) {
      if (String(list[i][0]) === u.user_id) {
        sh.getRange(i + 2, 1, 1, row.length).setNumberFormat('@').setValues([row]);
        return;
      }
    }
    sh.getRange(sh.getLastRow() + 1, 1, 1, row.length).setNumberFormat('@').setValues([row]);
  }

  // ---- dữ liệu đồng bộ ----
  function readRows(table) {
    if (rowsCache[table]) return rowsCache[table];
    var out = values('data_' + table).map(function (r, i) {
      var data = {};
      try {
        data = r[2] ? JSON.parse(r[2]) : {};
      } catch (e) {
        data = {};
      }
      return { team_id: String(r[0]), id: String(r[1]), data: data, deleted: r[3] === true || r[3] === 'TRUE', updated_at: iso(r[4]), updated_by: String(r[5]), _row: i + 2 };
    });
    rowsCache[table] = out;
    return out;
  }
  function writeRows(table, rows) {
    var sh = sheet('data_' + table);
    var cur = readRows(table);
    var idx = {};
    cur.forEach(function (r) {
      idx[r.team_id + '|' + r.id] = r;
    });
    var appends = [];
    var updates = [];
    rows.forEach(function (r) {
      var line = [r.team_id, r.id, JSON.stringify(r.data), r.deleted ? 'TRUE' : 'FALSE', r.updated_at, r.updated_by];
      var old = idx[r.team_id + '|' + r.id];
      if (old) updates.push({ row: old._row, line: line });
      else appends.push(line);
    });
    if (updates.length > 40) {
      // nhiều dòng sửa: ghi lại cả bảng một lần cho nhanh
      var all = values('data_' + table);
      updates.forEach(function (u) {
        all[u.row - 2] = u.line;
      });
      if (all.length) sh.getRange(2, 1, all.length, DATA_HEADER.length).setNumberFormat('@').setValues(all);
    } else {
      updates.forEach(function (u) {
        sh.getRange(u.row, 1, 1, DATA_HEADER.length).setNumberFormat('@').setValues([u.line]);
      });
    }
    if (appends.length) sh.getRange(sh.getLastRow() + 1, 1, appends.length, DATA_HEADER.length).setNumberFormat('@').setValues(appends);
    delete rowsCache[table];
  }

  // ---- ảnh: mỗi đội 1 thư mục con, bảng photo_files tra đường dẫn → file ----
  function photoIndex() {
    return values('photo_files');
  }
  function teamFolder(team) {
    var root = DriveApp.getFolderById(photoFolderId);
    var it = root.getFoldersByName(team);
    return it.hasNext() ? it.next() : root.createFolder(team);
  }
  function putPhoto(path, b64, mime) {
    var parts = path.split('/');
    var name = parts.slice(1).join('_');
    var blob = Utilities.newBlob(Utilities.base64Decode(b64), mime, name);
    var idx = photoIndex();
    for (var i = 0; i < idx.length; i++) {
      if (String(idx[i][0]) === path) {
        try {
          DriveApp.getFileById(String(idx[i][1])).setTrashed(true);
        } catch (e) {
          /* file cũ đã mất */
        }
        var f = teamFolder(parts[0]).createFile(blob);
        sheet('photo_files').getRange(i + 2, 1, 1, 3).setValues([[path, f.getId(), mime]]);
        return;
      }
    }
    var file = teamFolder(parts[0]).createFile(blob);
    sheet('photo_files').appendRow([path, file.getId(), mime]);
  }
  function getPhoto(path) {
    var idx = photoIndex();
    for (var i = 0; i < idx.length; i++) {
      if (String(idx[i][0]) === path) {
        var bytes = DriveApp.getFileById(String(idx[i][1])).getBlob().getBytes();
        return { base64: Utilities.base64Encode(bytes), mime: String(idx[i][2] || 'image/jpeg') };
      }
    }
    return null;
  }

  return {
    getUserByEmail: function (email) {
      email = String(email).toLowerCase();
      return (
        users().filter(function (u) {
          return String(u.email).toLowerCase() === email;
        })[0] || null
      );
    },
    getUserById: function (id) {
      return (
        users().filter(function (u) {
          return u.user_id === id;
        })[0] || null
      );
    },
    listUsers: users,
    putUser: putUser,
    listMembers: function () {
      return values('members').map(function (r) {
        return { email: String(r[0]).toLowerCase(), team_id: String(r[1]), role: String(r[2] || 'member') };
      });
    },
    getTeam: function (id) {
      var t = values('teams').filter(function (r) {
        return String(r[0]) === id;
      })[0];
      return t ? { id: String(t[0]), name: String(t[1]) } : null;
    },
    readRows: readRows,
    writeRows: writeRows,
    putPhoto: putPhoto,
    getPhoto: getPhoto,
  };
}

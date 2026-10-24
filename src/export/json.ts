import { db } from '../store/db';
import { blobToDataUrl, dataUrlToBlob } from './report';
import { CONTENT_VERSION } from '../content';
import type { Photo } from '../types';

type PhotoJson = Omit<Photo, 'blob'> & { dataUrl: string };

async function photosToJson(list: Photo[]): Promise<PhotoJson[]> {
  return Promise.all(list.map(async ({ blob, ...rest }) => ({ ...rest, dataUrl: await blobToDataUrl(blob) })));
}

/** Một phiên: dùng để chuyển máy / nhập vào hệ thống quản lý TN (Trạm → Giàn → Lần TN). */
export async function sessionJson(sessionId: string) {
  const session = await db.sessions.get(sessionId);
  if (!session) throw new Error('Không tìm thấy phiên');
  const [profile, measurements, checks, photos, instruments] = await Promise.all([
    db.profiles.get(session.profileId),
    db.measurements.where('sessionId').equals(sessionId).toArray(),
    db.checks.where('sessionId').equals(sessionId).toArray(),
    db.photos.where('sessionId').equals(sessionId).toArray(),
    db.instruments.bulkGet(session.instruments),
  ]);
  return {
    format: 'tbd-ge-session',
    version: 1,
    contentVersion: CONTENT_VERSION,
    exportedAt: new Date().toISOString(),
    station: profile?.station,
    bank: profile?.bank,
    session,
    profile,
    instruments: instruments.filter(Boolean),
    measurements,
    checks,
    photos: await photosToJson(photos),
  };
}

export async function backupJson() {
  const [sessions, measurements, checks, photos, profiles, instruments] = await Promise.all([
    db.sessions.toArray(),
    db.measurements.toArray(),
    db.checks.toArray(),
    db.photos.toArray(),
    db.profiles.toArray(),
    db.instruments.toArray(),
  ]);
  return {
    format: 'tbd-ge-backup',
    version: 1,
    contentVersion: CONTENT_VERSION,
    exportedAt: new Date().toISOString(),
    sessions,
    measurements,
    checks,
    photos: await photosToJson(photos),
    profiles,
    instruments,
  };
}

const isArr = (x: unknown): x is unknown[] => Array.isArray(x);

// ---------- Kiểm tra kiểu dữ liệu khi nhập (file có thể do người khác gửi) ----------
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^[\p{L}\p{N}_.\-|]{1,120}$/u;
const isStr = (x: unknown, max = 2000): x is string => typeof x === 'string' && x.length <= max;
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const isId = (x: unknown) => isStr(x) && ID.test(x);
const isDate = (x: unknown, allowEmpty = false) => isStr(x) && (DATE.test(x) || (allowEmpty && x === ''));
const isPair = (x: unknown) => isArr(x) && x.length === 2 && x.every(isNum);

function check(ok: boolean, what: string) {
  if (!ok) throw new Error(`Dữ liệu không hợp lệ: ${what}`);
}

const PROFILE_NUMS = ['unitCap_uF', 'unitsPerString', 'stringsPerGroup', 'groupsPerPhase', 'nominalTotal_uF', 'tagGap_mm', 'unbAlarm_pct', 'unbBypass_pct'];
function vProfile(p: unknown) {
  const o = p as Record<string, unknown>;
  check(!!o && isId(o.id) && isStr(o.station, 200) && isStr(o.bank, 100), 'hồ sơ giàn');
  for (const k of PROFILE_NUMS) check(isNum(o[k]), `hồ sơ giàn – ${k}`);
  check(o.gapTol_mm === undefined || isNum(o.gapTol_mm), 'hồ sơ giàn – gapTol_mm');
  const v = o.vap as Record<string, unknown>;
  check(!!v && isPair(v.mC) && isNum(v.Vmin) && isPair(v.A), 'hồ sơ giàn – VAP');
  check(o.note === undefined || isStr(o.note), 'hồ sơ giàn – ghi chú');
}
function vSession(s: unknown) {
  const o = s as Record<string, unknown>;
  check(!!o && isId(o.id) && isId(o.profileId) && isDate(o.date), 'phiên');
  check(['after_install', 'after_1y', 'periodic'].includes(o.type as string) && ['open', 'done'].includes(o.status as string), 'phiên – loại/trạng thái');
  check(isStr(o.leader, 200) && isArr(o.members) && o.members.every((m) => isStr(m, 200)), 'phiên – nhân sự');
  check(isArr(o.instruments) && o.instruments.every(isId) && isNum(o.createdAt), 'phiên – máy TN');
  check(o.conclusion === undefined || isStr(o.conclusion, 20000), 'phiên – kết luận');
  if (o.profileSnap !== undefined) vProfile(o.profileSnap);
  if (o.instrumentSnap !== undefined) {
    check(isArr(o.instrumentSnap), 'phiên – máy TN (bản chụp)');
    (o.instrumentSnap as unknown[]).forEach(vInstrument);
  }
}
function vInstrument(i: unknown) {
  const o = i as Record<string, unknown>;
  check(!!o && isId(o.id) && isStr(o.model, 200) && isStr(o.serial, 200) && isDate(o.calibDue, true), 'máy thí nghiệm');
}
function vMeasurement(m: unknown) {
  const o = m as Record<string, unknown>;
  check(!!o && isStr(o.id, 400) && isId(o.sessionId) && isStr(o.itemId, 10) && isStr(o.testId, 60) && isStr(o.key, 120) && isStr(o.value, 2000) && isNum(o.ts), 'số đo');
}
function vCheck(c: unknown) {
  const o = c as Record<string, unknown>;
  check(!!o && isId(o.sessionId) && isId(o.gateId) && !!o.items && typeof o.items === 'object', 'cổng an toàn');
  check(Object.values(o.items as object).every((x) => typeof x === 'boolean'), 'cổng an toàn – mục');
  check(o.confirmedBy === undefined || isStr(o.confirmedBy, 200), 'cổng an toàn – người xác nhận');
  check(o.timestamp === undefined || isNum(o.timestamp), 'cổng an toàn – thời điểm');
  check(
    o.timed === undefined ||
      (!!o.timed && typeof o.timed === 'object' && Object.values(o.timed as object).every((x) => !!x && isNum((x as { at: unknown }).at) && typeof (x as { manual: unknown }).manual === 'boolean')),
    'cổng an toàn – mốc đồng hồ',
  );
}
function vPhoto(p: unknown) {
  const o = p as Record<string, unknown>;
  check(!!o && isId(o.id) && isId(o.sessionId) && isStr(o.itemId, 10) && isStr(o.caption, 500) && isNum(o.ts), 'ảnh');
  // chỉ ảnh raster: SVG có thể chứa script khi mở bằng blob URL
  check(isStr(o.dataUrl, 20_000_000) && /^data:image\/(jpeg|png|webp);base64,/.test(o.dataUrl), 'ảnh – định dạng');
}
const each = (arr: unknown, f: (x: unknown) => void) => (isArr(arr) ? arr.forEach(f) : undefined);

/** Nhập file sao lưu toàn bộ hoặc file 1 phiên. Ghi đè bản ghi trùng khóa. */
export async function importJson(text: string): Promise<string> {
  let j: Record<string, unknown>;
  try {
    j = JSON.parse(text);
  } catch {
    throw new Error('File không phải JSON hợp lệ');
  }
  // kiểm tra toàn bộ trước khi ghi – lỗi thì không ghi gì
  if (j.format === 'tbd-ge-backup') each(j.profiles, vProfile);
  else if (j.profile) vProfile(j.profile);
  if (j.format === 'tbd-ge-backup') each(j.sessions, vSession);
  else if (j.session) vSession(j.session);
  each(j.instruments, vInstrument);
  each(j.measurements, vMeasurement);
  each(j.checks, vCheck);
  each(j.photos, vPhoto);
  const photos = async (arr: unknown) =>
    Promise.all((isArr(arr) ? (arr as PhotoJson[]) : []).map(async ({ dataUrl, ...rest }) => ({ ...rest, blob: await dataUrlToBlob(dataUrl) }) as Photo));
  if (j.format === 'tbd-ge-backup') {
    const ph = await photos(j.photos);
    await db.transaction('rw', [db.sessions, db.measurements, db.checks, db.photos, db.profiles, db.instruments], async () => {
      if (isArr(j.profiles)) await db.profiles.bulkPut(j.profiles as never[]);
      if (isArr(j.instruments)) await db.instruments.bulkPut(j.instruments as never[]);
      if (isArr(j.sessions)) await db.sessions.bulkPut(j.sessions as never[]);
      if (isArr(j.measurements)) await db.measurements.bulkPut(j.measurements as never[]);
      if (isArr(j.checks)) await db.checks.bulkPut(j.checks as never[]);
      await db.photos.bulkPut(ph);
    });
    return `Đã khôi phục ${isArr(j.sessions) ? j.sessions.length : 0} phiên, ${isArr(j.profiles) ? j.profiles.length : 0} hồ sơ giàn.`;
  }
  if (j.format === 'tbd-ge-session') {
    const s = j.session as { id?: string } | undefined;
    if (!s?.id) throw new Error('Thiếu thông tin phiên');
    const ph = await photos(j.photos);
    await db.transaction('rw', [db.sessions, db.measurements, db.checks, db.photos, db.profiles, db.instruments], async () => {
      if (j.profile && !(await db.profiles.get((j.profile as { id: string }).id))) await db.profiles.put(j.profile as never);
      if (isArr(j.instruments)) for (const i of j.instruments as { id: string }[]) if (!(await db.instruments.get(i.id))) await db.instruments.put(i as never);
      await db.sessions.put(j.session as never);
      if (isArr(j.measurements)) await db.measurements.bulkPut(j.measurements as never[]);
      if (isArr(j.checks)) await db.checks.bulkPut(j.checks as never[]);
      await db.photos.bulkPut(ph);
    });
    return 'Đã nhập 1 phiên thí nghiệm.';
  }
  throw new Error('Không nhận dạng được định dạng file (cần tbd-ge-backup hoặc tbd-ge-session)');
}

import { db } from '../store/db';
import { blobToDataUrl, dataUrlToBlob } from './report';
import { CONTENT_VERSION } from '../content';
import { vCheck, vInstrument, vMeasurement, vPhoto, vProfile, vSession, vSignature } from '../store/validate';
import { stripMeta } from '../sync/meta';

/** Trường đồng bộ (_dirty, _rv…) không đi theo file: bản nhập vào máy khác phải được coi là thay đổi mới. */
const clean = <T extends object>(arr: T[]) => arr.map((x) => stripMeta(x));
const cleanArr = (x: unknown) => (Array.isArray(x) ? clean(x as object[]) : x);
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
    session: stripMeta(session),
    profile: profile && stripMeta(profile),
    instruments: clean(instruments.filter((x) => !!x)),
    measurements: clean(measurements),
    checks: clean(checks),
    photos: clean(await photosToJson(photos)),
    signatures: clean(await db.signatures.where('sessionId').equals(sessionId).toArray()),
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
    sessions: clean(sessions),
    measurements: clean(measurements),
    checks: clean(checks),
    photos: clean(await photosToJson(photos)),
    profiles: clean(profiles),
    instruments: clean(instruments),
    signatures: clean(await db.signatures.toArray()),
  };
}

const isArr = (x: unknown): x is unknown[] => Array.isArray(x);

const each = (arr: unknown, f: (x: unknown) => void) => (isArr(arr) ? arr.forEach(f) : undefined);

/** Nhập file sao lưu toàn bộ hoặc file 1 phiên. Ghi đè bản ghi trùng khóa. */
export async function importJson(text: string): Promise<string> {
  let j: Record<string, unknown>;
  try {
    j = JSON.parse(text);
  } catch {
    throw new Error('File không phải JSON hợp lệ');
  }
  if (!j || typeof j !== 'object') throw new Error('File không phải JSON hợp lệ');
  for (const k of ['sessions', 'measurements', 'checks', 'photos', 'profiles', 'instruments', 'signatures']) j[k] = cleanArr(j[k]);
  for (const k of ['session', 'profile']) if (j[k] && typeof j[k] === 'object') j[k] = stripMeta(j[k] as object);
  // kiểm tra toàn bộ trước khi ghi – lỗi thì không ghi gì
  if (j.format === 'tbd-ge-backup') each(j.profiles, vProfile);
  else if (j.profile) vProfile(j.profile);
  if (j.format === 'tbd-ge-backup') each(j.sessions, vSession);
  else if (j.session) vSession(j.session);
  each(j.instruments, vInstrument);
  each(j.measurements, vMeasurement);
  each(j.checks, vCheck);
  each(j.photos, vPhoto);
  each(j.signatures, vSignature);
  const photos = async (arr: unknown) =>
    Promise.all((isArr(arr) ? (arr as PhotoJson[]) : []).map(async ({ dataUrl, ...rest }) => ({ ...rest, blob: await dataUrlToBlob(dataUrl) }) as Photo));
  if (j.format === 'tbd-ge-backup') {
    const ph = await photos(j.photos);
    await db.transaction('rw', [db.sessions, db.measurements, db.checks, db.photos, db.profiles, db.instruments, db.signatures], async () => {
      if (isArr(j.profiles)) await db.profiles.bulkPut(j.profiles as never[]);
      if (isArr(j.instruments)) await db.instruments.bulkPut(j.instruments as never[]);
      if (isArr(j.sessions)) await db.sessions.bulkPut(j.sessions as never[]);
      if (isArr(j.measurements)) await db.measurements.bulkPut(j.measurements as never[]);
      if (isArr(j.checks)) await db.checks.bulkPut(j.checks as never[]);
      await db.photos.bulkPut(ph);
      if (isArr(j.signatures)) await db.signatures.bulkPut(j.signatures as never[]);
    });
    return `Đã khôi phục ${isArr(j.sessions) ? j.sessions.length : 0} phiên, ${isArr(j.profiles) ? j.profiles.length : 0} hồ sơ giàn.`;
  }
  if (j.format === 'tbd-ge-session') {
    const s = j.session as { id?: string } | undefined;
    if (!s?.id) throw new Error('Thiếu thông tin phiên');
    const ph = await photos(j.photos);
    await db.transaction('rw', [db.sessions, db.measurements, db.checks, db.photos, db.profiles, db.instruments, db.signatures], async () => {
      if (j.profile && !(await db.profiles.get((j.profile as { id: string }).id))) await db.profiles.put(j.profile as never);
      if (isArr(j.instruments)) for (const i of j.instruments as { id: string }[]) if (!(await db.instruments.get(i.id))) await db.instruments.put(i as never);
      await db.sessions.put(j.session as never);
      if (isArr(j.measurements)) await db.measurements.bulkPut(j.measurements as never[]);
      if (isArr(j.checks)) await db.checks.bulkPut(j.checks as never[]);
      await db.photos.bulkPut(ph);
      if (isArr(j.signatures)) await db.signatures.bulkPut(j.signatures as never[]);
    });
    return 'Đã nhập 1 phiên thí nghiệm.';
  }
  throw new Error('Không nhận dạng được định dạng file (cần tbd-ge-backup hoặc tbd-ge-session)');
}

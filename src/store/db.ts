import Dexie, { type Table } from 'dexie';
import type { GateCheck, Instrument, Measurement, Photo, Profile, Session } from '../types';
import { seedProfiles } from '../content';
import { clearTimers } from '../components/Timer';

class TbdDb extends Dexie {
  sessions!: Table<Session, string>;
  measurements!: Table<Measurement, string>;
  checks!: Table<GateCheck, [string, string]>;
  photos!: Table<Photo, string>;
  profiles!: Table<Profile, string>;
  instruments!: Table<Instrument, string>;

  constructor() {
    super('tbd-ge-field');
    this.version(1).stores({
      sessions: 'id, profileId, date, status',
      measurements: 'id, sessionId, [sessionId+itemId+testId]',
      checks: '[sessionId+gateId], sessionId',
      photos: 'id, sessionId, [sessionId+itemId]',
      profiles: 'id',
      instruments: 'id',
    });
    this.on('populate', (tx) => {
      tx.table('profiles').bulkAdd(seedProfiles());
      tx.table('instruments').bulkAdd([
        { id: 'vap-tester-31f246', model: 'VAP Tester GE 31F246', serial: '', calibDue: '', note: 'Nhập số serial và hạn hiệu chuẩn' },
        { id: 'gamma-rr10', model: 'Nguồn cao thế GAMMA RR10-6R/220/M851', serial: '', calibDue: '', note: 'Nhập số serial và hạn kiểm định' },
      ]);
    });
  }
}

export const db = new TbdDb();

/** Phiên "tra cứu" khi chưa chọn phiên TN – cổng an toàn lưu tạm tại đây. */
export const LOCAL_SESSION = '_local';
/** Cổng an toàn hết hiệu lực sau 12 giờ. */
const LOCAL_GATE_TTL = 12 * 3600 * 1000;

const ACTIVE_KEY = 'tbd.activeSession';
export function activeSessionId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}
export function setActiveSession(id: string | null) {
  try {
    if (id) localStorage.setItem(ACTIVE_KEY, id);
    else localStorage.removeItem(ACTIVE_KEY);
  } catch {
    /* bỏ qua */
  }
}

export const gateScope = () => activeSessionId() ?? LOCAL_SESSION;

/**
 * Cổng an toàn hết hiệu lực sau 12 giờ kể từ lần xác nhận/tích cuối (mọi phạm vi):
 * phiên kéo dài nhiều ngày phải xác nhận lại mỗi ngày. Trong phiên, bản ghi cũ được giữ
 * làm lịch sử (vào biên bản) cho tới khi bị ghi đè; ở chế độ tra cứu thì xóa.
 */
export async function getGateCheck(gateId: string, sessionId = gateScope()): Promise<GateCheck> {
  const g = await db.checks.get([sessionId, gateId]);
  const last = g ? Math.max(g.timestamp ?? 0, g.updatedAt ?? 0) : 0;
  if (g && (!last || Date.now() - last > LOCAL_GATE_TTL)) {
    if (sessionId === LOCAL_SESSION) await db.checks.delete([sessionId, gateId]);
    clearTimers(`gate:${sessionId}:${gateId}:`);
    return { sessionId, gateId, items: {} };
  }
  return g ?? { sessionId, gateId, items: {} };
}

export const saveGateCheck = (g: GateCheck) => db.checks.put({ ...g, updatedAt: Date.now() });

export async function isGateConfirmed(gateId: string, sessionId = gateScope()) {
  return !!(await getGateCheck(gateId, sessionId)).confirmedBy;
}

export const measId = (sessionId: string, itemId: string, testId: string, key: string) => `${sessionId}|${itemId}|${testId}|${key}`;

export async function getValues(sessionId: string, itemId: string, testId: string): Promise<Record<string, string>> {
  const rows = await db.measurements.where('[sessionId+itemId+testId]').equals([sessionId, itemId, testId]).toArray();
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export function putValue(sessionId: string, itemId: string, testId: string, key: string, value: string) {
  return db.measurements.put({ id: measId(sessionId, itemId, testId, key), sessionId, itemId, testId, key, value, ts: Date.now() });
}

export async function deleteSession(id: string) {
  await db.transaction('rw', [db.sessions, db.measurements, db.checks, db.photos], async () => {
    await db.measurements.where('sessionId').equals(id).delete();
    await db.checks.where('sessionId').equals(id).delete();
    await db.photos.where('sessionId').equals(id).delete();
    await db.sessions.delete(id);
  });
  if (activeSessionId() === id) setActiveSession(null);
}

export async function getProfile(id: string) {
  return db.profiles.get(id);
}

/** Phiên trước gần nhất (cùng hồ sơ giàn, sớm hơn) có số liệu của phép thử này. */
export async function previousSession(s: Session, itemId: string, testId: string): Promise<Session | undefined> {
  const all = await db.sessions.where('profileId').equals(s.profileId).toArray();
  const earlier = all
    .filter((x) => x.id !== s.id && (x.date < s.date || (x.date === s.date && x.createdAt < s.createdAt)))
    .sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt : b.date.localeCompare(a.date)));
  for (const x of earlier) {
    if (await db.measurements.where('[sessionId+itemId+testId]').equals([x.id, itemId, testId]).count()) return x;
  }
  return undefined;
}

export async function storageWarning(): Promise<string | null> {
  try {
    const e = await navigator.storage?.estimate?.();
    if (e?.quota && e.usage && e.usage / e.quota > 0.8) {
      return `Bộ nhớ app đã dùng ${Math.round((e.usage / e.quota) * 100)} % – hãy xuất sao lưu và xóa bớt ảnh.`;
    }
  } catch {
    /* không hỗ trợ */
  }
  return null;
}

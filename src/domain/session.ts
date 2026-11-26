// Dữ liệu một phiên thí nghiệm & trạng thái từng phép thử – dùng chung cho màn hình và xuất biên bản.
import { getItem } from '../content';
import { db } from '../store/db';
import { evaluateTest, formFor, type Phase, type ResultRow, type Values } from '../forms';
import { combine } from '../calc/evaluate';
import type { Profile, Result, Session, Unit } from '../types';
import { DEFAULT_UNIT } from './units';

export const TYPE_LABEL: Record<Session['type'], string> = {
  after_install: 'Sau lắp đặt',
  after_1y: 'Sau 1 năm',
  periodic: 'Định kỳ',
};

export interface SessionData {
  session: Session;
  profile: Profile;
  values: Map<string, Values>; // key `${itemId}|${testId}`
}

export async function loadSessionData(id: string): Promise<SessionData | null> {
  const session = await db.sessions.get(id);
  if (!session) return null;
  const profile = session.profileSnap ?? (await db.profiles.get(session.profileId));
  if (!profile) return null;
  const values = new Map<string, Values>();
  for (const m of await db.measurements.where('sessionId').equals(id).toArray()) {
    const k = `${m.itemId}|${m.testId}`;
    if (!values.has(k)) values.set(k, {});
    values.get(k)![m.key] = m.value;
  }
  return { session, profile, values };
}

/** Máy TN của phiên: bản chụp lúc tạo phiên (nếu có), nếu không thì đọc danh mục hiện tại. */
export async function sessionInstruments(s: Session) {
  return s.instrumentSnap ?? (await db.instruments.bulkGet(s.instruments)).filter((x) => !!x);
}

export type State = 'todo' | 'progress' | Result;
export function testState(d: SessionData, itemId: string, testId: string): { state: State; rows: ResultRow[] } {
  const v = d.values.get(`${itemId}|${testId}`) ?? {};
  if (!Object.values(v).some((x) => (x ?? '').trim() !== '')) return { state: 'todo', rows: [] };
  const rows = evaluateTest(itemId, testId, v, d.profile);
  const r = combine(rows.map((x) => x.result));
  return { state: r === 'na' ? 'progress' : r, rows };
}
function combineStates(st: State[]): State {
  if (st.includes('fail')) return 'fail';
  if (st.every((s) => s === 'todo')) return 'todo';
  if (st.some((s) => s === 'todo' || s === 'progress')) return 'progress';
  return st.includes('warn') ? 'warn' : 'pass';
}
export function itemState(d: SessionData, itemId: string): State {
  return combineStates(getItem(itemId)!.tests.map((t) => testState(d, itemId, t.id).state));
}

/**
 * Trạng thái một hạng mục của riêng một pha – để 3 nhóm làm song song theo pha cùng theo dõi.
 * Chỉ xét số đo của pha đó (khóa "A.…"); phép thử không chia pha (checklist) dùng chung cho cả 3 pha.
 */
export function phaseState(d: SessionData, itemId: string, ph: Phase): State {
  return combineStates(
    getItem(itemId)!.tests.map((t) => {
      if (!formFor(itemId, t.id)?.phased) return testState(d, itemId, t.id).state;
      const v = d.values.get(`${itemId}|${t.id}`) ?? {};
      const mine = Object.entries(v).filter(([k]) => k.startsWith(`${ph}.`));
      if (!mine.some(([, x]) => (x ?? '').trim() !== '')) return 'todo';
      const own = Object.fromEntries(Object.entries(v).filter(([k]) => k.startsWith(`${ph}.`) || !/^[ABC]\./.test(k)));
      const r = combine(evaluateTest(itemId, t.id, own, d.profile).map((x) => x.result));
      return r === 'na' ? 'progress' : r;
    }),
  );
}

/** Hạng mục có thực hiện trong phiên? Phiên cũ (chưa khai) = thực hiện tất cả. */
export const itemOn = (s: Pick<Session, 'items'>, itemId: string) => !s.items || s.items.includes(itemId);

export const STATE_ICON: Record<State, string> = { todo: '○', progress: '⏳', pass: '✅', fail: '❌', warn: '⚠️', na: '⏳' };

/**
 * Đơn vị in trên biên bản: bản chụp lúc tạo phiên; phiên cũ (trước khi có đơn vị) lấy đơn vị đã khai
 * (đúng mã, hoặc đơn vị duy nhất), chỉ dùng mặc định khi đội chưa khai đơn vị nào.
 */
export async function sessionUnit(s: Session): Promise<Pick<Unit, 'orgName' | 'name' | 'reportFormat'>> {
  if (s.unitSnap) return s.unitSnap;
  const units = await db.units.toArray();
  return units.find((u) => u.id === s.unitId) ?? (units.length === 1 ? units[0] : DEFAULT_UNIT);
}

/** Mã đơn vị duy nhất của đội (để đánh số phiên tạo khi chưa khai đơn vị) – nhiều đơn vị thì null. */
export async function primaryUnitId(): Promise<string | null> {
  const units = await db.units.toArray();
  return units.length === 1 ? units[0].id : units.length ? null : DEFAULT_UNIT.id;
}

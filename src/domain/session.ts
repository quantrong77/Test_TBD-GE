// Dữ liệu một phiên thí nghiệm & trạng thái từng phép thử – dùng chung cho màn hình và xuất biên bản.
import { getItem } from '../content';
import { db } from '../store/db';
import { evaluateTest, type ResultRow, type Values } from '../forms';
import { combine } from '../calc/evaluate';
import type { Profile, Result, Session } from '../types';

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
export function itemState(d: SessionData, itemId: string): State {
  const st = getItem(itemId)!.tests.map((t) => testState(d, itemId, t.id).state);
  if (st.includes('fail')) return 'fail';
  if (st.every((s) => s === 'todo')) return 'todo';
  if (st.some((s) => s === 'todo' || s === 'progress')) return 'progress';
  return st.includes('warn') ? 'warn' : 'pass';
}
export const STATE_ICON: Record<State, string> = { todo: '○', progress: '⏳', pass: '✅', fail: '❌', warn: '⚠️', na: '⏳' };

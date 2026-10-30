import { db } from '../store/db';
import { canSign, getMe, isMember } from '../auth/roles';
import type { SignSlot, Signature } from '../types';

/** JSON chuẩn hóa: khóa sắp xếp → cùng nội dung luôn ra cùng chuỗi. */
function canonical(x: unknown): string {
  if (Array.isArray(x)) return `[${x.map(canonical).join(',')}]`;
  if (x && typeof x === 'object') {
    return `{${Object.keys(x)
      .filter((k) => !k.startsWith('_') && (x as Record<string, unknown>)[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical((x as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(x ?? null);
}

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Mã kiểm tra nội dung biên bản (SHA-256).
 * Người thí nghiệm ký số liệu (không gồm kết luận – Chỉ huy viết sau);
 * Chỉ huy và QLVH ký toàn bộ, gồm kết luận.
 */
export async function contentHash(sessionId: string, slot: SignSlot): Promise<string> {
  const s = await db.sessions.get(sessionId);
  if (!s) throw new Error('Không tìm thấy phiên');
  const [ms, photos, checks] = await Promise.all([
    db.measurements.where('sessionId').equals(sessionId).toArray(),
    db.photos.where('sessionId').equals(sessionId).toArray(),
    db.checks.where('sessionId').equals(sessionId).toArray(),
  ]);
  const doc = {
    session: {
      id: s.id,
      profileId: s.profileId,
      date: s.date,
      type: s.type,
      leader: s.leader,
      members: s.members,
      instruments: s.instruments,
      profileSnap: s.profileSnap,
      instrumentSnap: s.instrumentSnap,
      conclusion: slot === 'tester' ? undefined : (s.conclusion ?? ''),
    },
    measurements: ms
      .filter((m) => (m.value ?? '').trim() !== '')
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((m) => [m.itemId, m.testId, m.key, m.value]),
    photos: photos.sort((a, b) => a.id.localeCompare(b.id)).map((p) => [p.id, p.itemId, p.caption]),
    gates: checks
      .filter((c) => c.confirmedBy)
      .sort((a, b) => a.gateId.localeCompare(b.gateId))
      .map((c) => ({ gateId: c.gateId, confirmedBy: c.confirmedBy, timestamp: c.timestamp, items: c.items, timed: c.timed })),
  };
  return sha256(canonical(doc));
}

export const sessionSignatures = (sessionId: string) => db.signatures.where('sessionId').equals(sessionId).toArray();

/** Biên bản đã khóa: có chữ ký Chỉ huy (khớp hàm session_locked trên máy chủ). */
export async function isLocked(sessionId: string): Promise<boolean> {
  return (await sessionSignatures(sessionId)).some((x) => x.slot === 'leader');
}

export interface SignatureCheck {
  sig: Signature;
  valid: boolean;
}
/** So mã nội dung hiện tại với lúc ký – phát hiện sửa sau khi ký. */
export async function verifySignatures(sessionId: string): Promise<SignatureCheck[]> {
  const sigs = (await sessionSignatures(sessionId)).sort((a, b) => a.signedAt - b.signedAt);
  const cache = new Map<SignSlot, string>();
  const out: SignatureCheck[] = [];
  for (const sig of sigs) {
    if (!cache.has(sig.slot)) cache.set(sig.slot, await contentHash(sessionId, sig.slot));
    out.push({ sig, valid: cache.get(sig.slot) === sig.hash });
  }
  return out;
}

/** Ký xác nhận điện tử bằng tài khoản đang đăng nhập. Chỉ huy ký → biên bản khóa. */
export async function signSession(sessionId: string, slot: SignSlot): Promise<Signature> {
  const me = getMe();
  if (!isMember(me) || !canSign(slot, me)) throw new Error('Tài khoản này không được ký ô này');
  const existing = await sessionSignatures(sessionId);
  if (existing.some((x) => x.slot === slot && x.userId === me.userId)) throw new Error('Bạn đã ký ô này');
  if (slot === 'leader' && existing.some((x) => x.slot === 'leader')) throw new Error('Biên bản đã có chữ ký Chỉ huy');
  if (slot === 'leader') await db.sessions.update(sessionId, { status: 'done' });
  const sig: Signature = {
    id: `${sessionId}|${slot}|${me.userId}`,
    sessionId,
    slot,
    userId: me.userId,
    email: me.email,
    name: me.name || me.email,
    role: me.role,
    signedAt: Date.now(),
    hash: await contentHash(sessionId, slot),
  };
  await db.signatures.put(sig);
  return sig;
}

/** Admin thu hồi chữ ký (xóa → gửi lên như tombstone; máy chủ chỉ cho admin). */
export async function revokeSignature(id: string) {
  await db.signatures.delete(id);
}

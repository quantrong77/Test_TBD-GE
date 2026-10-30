import { db } from '../store/db';
import { vCheck, vInstrument, vMeasurement, vPhotoMeta, vProfile, vSession, vSignature } from '../store/validate';
import {
  idToKey,
  isLocalOnly,
  keyToId,
  REMOTE_TABLE,
  remoteDeletes,
  removeTombstones,
  stripMeta,
  SYNC_TABLES,
  tombstones,
  type SyncMeta,
  type SyncTable,
} from './meta';
import type { Photo } from '../types';

/** Một dòng trên máy chủ. */
export interface RemoteRow {
  id: string;
  data: Record<string, unknown>;
  deleted: boolean;
  updated_at: string;
}

/** Máy chủ đồng bộ (Supabase, hoặc bản giả trong test). Mọi lệnh đã giới hạn trong một đội. */
export interface Remote {
  /** Các dòng có updated_at ≥ since, tăng dần. */
  pull(table: string, since: string | null): Promise<RemoteRow[]>;
  /** Ghi đè theo id; trả về updated_at do máy chủ đặt. */
  upsert(table: string, rows: { id: string; data: Record<string, unknown>; deleted: boolean }[]): Promise<{ id: string; updated_at: string }[]>;
  uploadPhoto(path: string, blob: Blob): Promise<void>;
  downloadPhoto(path: string): Promise<Blob>;
}

export interface SyncResult {
  pushed: number;
  pulled: number;
  /** bản ghi từ máy chủ bị bỏ vì dữ liệu không hợp lệ */
  rejected: number;
  /** thay đổi trên máy bị máy chủ từ chối (không có quyền / biên bản đã khóa) – đã bỏ, lấy lại bản của máy chủ */
  refused: number;
}

/** Máy chủ từ chối vì quyền / ràng buộc (không phải lỗi mạng): bỏ thay đổi đó, không thử lại mãi. */
export class RefusedError extends Error {}

const VALIDATE: Record<SyncTable, (x: unknown) => void> = {
  profiles: vProfile,
  instruments: vInstrument,
  sessions: vSession,
  checks: vCheck,
  measurements: vMeasurement,
  photos: vPhotoMeta,
  signatures: vSignature,
};

const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const CHUNK = 200;
type Rec = Record<string, unknown> & SyncMeta;

const tableOf = (t: SyncTable) => db.table<Rec>(t);
const photoPath = (team: string, id: string) => `${team}/${id}.jpg`;

/** Khóa cục bộ của bản ghi (cổng an toàn: [sessionId, gateId]). */
function localKey(t: SyncTable, r: Rec): unknown {
  return t === 'checks' ? [r.sessionId, r.gateId] : r.id;
}

// ---------- con trỏ kéo dữ liệu (theo đội, theo bảng) ----------
const cursorKey = (team: string, t: SyncTable) => `tbd.sync.cursor.${team}.${t}`;
function getCursor(team: string, t: SyncTable): string | null {
  try {
    return localStorage.getItem(cursorKey(team, t));
  } catch {
    return null;
  }
}
function setCursor(team: string, t: SyncTable, v: string) {
  try {
    localStorage.setItem(cursorKey(team, t), v);
  } catch {
    /* bỏ qua */
  }
}

/** Số thay đổi chưa gửi lên (bản ghi chưa đồng bộ + xóa chờ gửi). */
export async function pendingCount(): Promise<number> {
  let n = tombstones().length;
  for (const t of SYNC_TABLES) {
    n += await tableOf(t)
      .filter((r) => r._dirty !== 0 && !isLocalOnly(t, keyToId(t, localKey(t, r))))
      .count();
  }
  return n;
}

type Row = { id: string; data: Record<string, unknown>; deleted: boolean };

/** Gửi một nhóm; nếu máy chủ từ chối thì gửi từng dòng để biết đúng dòng nào bị từ chối. */
async function upsertSafe(remote: Remote, table: string, rows: Row[]): Promise<{ ok: Map<string, string>; refused: Set<string> }> {
  try {
    const res = await remote.upsert(table, rows);
    const ok = new Map(res.map((x) => [x.id, x.updated_at]));
    return { ok, refused: new Set(rows.filter((r) => !ok.has(r.id)).map((r) => r.id)) };
  } catch (e) {
    if (!(e instanceof RefusedError)) throw e; // lỗi mạng: dừng, lần sau thử lại
    if (rows.length === 1) return { ok: new Map(), refused: new Set([rows[0].id]) };
    const ok = new Map<string, string>();
    const refused = new Set<string>();
    for (const r of rows) {
      const x = await upsertSafe(remote, table, [r]);
      x.ok.forEach((v, k) => ok.set(k, v));
      x.refused.forEach((k) => refused.add(k));
    }
    return { ok, refused };
  }
}

async function push(remote: Remote, team: string): Promise<{ pushed: number; refused: number }> {
  let pushed = 0;
  let refused = 0;
  // 1. xóa chờ gửi – trước, để bản tạo lại (nếu có) thắng
  const tombs = tombstones();
  for (const t of SYNC_TABLES) {
    const mine = tombs.filter((x) => x.table === t);
    for (let i = 0; i < mine.length; i += CHUNK) {
      const part = mine.slice(i, i + CHUNK);
      const r = await upsertSafe(remote, REMOTE_TABLE[t], part.map((x) => ({ id: x.id, data: {}, deleted: true })));
      removeTombstones(part); // bị từ chối cũng bỏ: kéo lại bản của máy chủ
      if (r.refused.size) setCursor(team, t, '');
      pushed += r.ok.size;
      refused += r.refused.size;
    }
  }
  // 2. bản ghi đã sửa
  for (const t of SYNC_TABLES) {
    const dirty = (await tableOf(t).filter((r) => r._dirty !== 0).toArray()).filter((r) => !isLocalOnly(t, keyToId(t, localKey(t, r))));
    for (let i = 0; i < dirty.length; i += CHUNK) {
      const part = dirty.slice(i, i + CHUNK);
      const rows: Row[] = [];
      const photoRefused = new Set<string>();
      for (const r of part) {
        const id = keyToId(t, localKey(t, r));
        let data = stripMeta(r) as Record<string, unknown>;
        if (t === 'photos') {
          const { blob, ...rest } = data as unknown as Photo;
          try {
            await remote.uploadPhoto(photoPath(team, id), blob);
          } catch (e) {
            if (!(e instanceof RefusedError)) throw e;
            photoRefused.add(id);
            continue;
          }
          data = { ...rest, path: photoPath(team, id) };
        }
        rows.push({ id, data, deleted: false });
      }
      const res = rows.length ? await upsertSafe(remote, REMOTE_TABLE[t], rows) : { ok: new Map<string, string>(), refused: new Set<string>() };
      photoRefused.forEach((id) => res.refused.add(id));
      // xóa cờ chỉ khi bản ghi không bị sửa tiếp trong lúc đang gửi;
      // bị từ chối → bỏ thay đổi (_rv 'refused' ≠ bản máy chủ → lần kéo sau thay bằng bản của máy chủ)
      await db.transaction('rw', tableOf(t), async () => {
        for (const r of part) {
          const k = localKey(t, r);
          const id = keyToId(t, k);
          const cur = await tableOf(t).get(k as never);
          if (!cur || cur._mt !== r._mt) continue;
          const v = res.ok.get(id);
          if (v) await tableOf(t).update(k as never, { _dirty: 0, _rv: v } as never);
          else if (res.refused.has(id)) await tableOf(t).update(k as never, { _dirty: 0, _rv: 'refused' } as never);
        }
      });
      if (res.refused.size) setCursor(team, t, '');
      pushed += res.ok.size;
      refused += res.refused.size;
    }
  }
  return { pushed, refused };
}

async function pull(remote: Remote, team: string): Promise<{ pulled: number; rejected: number }> {
  let pulled = 0;
  let rejected = 0;
  for (const t of SYNC_TABLES) {
    const rows = await remote.pull(REMOTE_TABLE[t], getCursor(team, t));
    let max = getCursor(team, t);
    for (const row of rows) {
      if (!max || row.updated_at > max) max = row.updated_at;
      if (isLocalOnly(t, row.id)) continue;
      const key = idToKey(t, row.id);
      const local = await tableOf(t).get(key as never);
      if (local && local._rv === row.updated_at) continue; // đã có bản này
      if (local && local._dirty !== 0) continue; // sửa trên máy chưa gửi → máy thắng, lần sau gửi đè
      if (row.deleted) {
        if (local) {
          remoteDeletes.add(`${t}|${row.id}`);
          await tableOf(t).delete(key as never);
          pulled++;
        }
        continue;
      }
      try {
        VALIDATE[t](row.data);
      } catch {
        rejected++;
        continue;
      }
      let rec: Rec = { ...row.data, _rv: row.updated_at, _dirty: 0 };
      if (t === 'photos') {
        const path = String(row.data.path ?? '');
        if (!path.startsWith(`${team}/`)) {
          rejected++;
          continue;
        }
        const blob = await remote.downloadPhoto(path);
        if (!PHOTO_TYPES.includes(blob.type)) {
          rejected++;
          continue;
        }
        const { path: _p, ...rest } = rec;
        rec = { ...rest, blob };
      }
      await tableOf(t).put(rec);
      pulled++;
    }
    if (max) setCursor(team, t, max);
  }
  return { pulled, rejected };
}

/** Một vòng đồng bộ: gửi lên trước, kéo về sau. */
export async function syncOnce(remote: Remote, team: string): Promise<SyncResult> {
  const { pushed, refused } = await push(remote, team);
  const { pulled, rejected } = await pull(remote, team);
  if (pulled && typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('sync:applied', { detail: pulled }));
  return { pushed, pulled, rejected, refused };
}

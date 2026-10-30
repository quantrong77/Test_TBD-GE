import type Dexie from 'dexie';

/**
 * Theo dõi thay đổi cục bộ để đồng bộ (offline-first).
 * Gắn vào Dexie qua hook nên mọi chỗ ghi trong app đều được theo dõi, không cần sửa từng view:
 *   - ghi/sửa bởi người dùng  → _dirty = 1, _mt = mốc sửa (trong CÙNG thao tác ghi)
 *   - ghi từ máy chủ / sau khi đẩy xong → mang _rv (phiên bản máy chủ) → không bị đánh dấu lại
 *   - xóa → thêm tombstone (localStorage) để báo máy khác xóa theo
 */
// thứ tự gửi: chữ ký sau cùng – để số đo/ảnh lên trước khi chữ ký Chỉ huy khóa biên bản trên máy chủ
export const SYNC_TABLES = ['profiles', 'instruments', 'sessions', 'checks', 'measurements', 'photos', 'signatures'] as const;
export type SyncTable = (typeof SYNC_TABLES)[number];

/** Tên bảng trên Supabase. */
export const REMOTE_TABLE: Record<SyncTable, string> = {
  profiles: 'profiles',
  instruments: 'instruments',
  sessions: 'sessions',
  checks: 'gate_checks',
  measurements: 'measurements',
  photos: 'photos',
  signatures: 'signatures',
};

export interface SyncMeta {
  _dirty?: 0 | 1;
  _mt?: number;
  _rv?: string;
}
export const META_KEYS = ['_dirty', '_mt', '_rv'] as const;

/** Bỏ trường đồng bộ trước khi gửi đi / xuất file. */
export function stripMeta<T extends object>(o: T): Omit<T, '_dirty' | '_mt' | '_rv'> {
  const c = { ...(o as Record<string, unknown>) };
  for (const k of META_KEYS) delete c[k];
  return c as Omit<T, '_dirty' | '_mt' | '_rv'>;
}

/** Cổng an toàn có khóa kép [sessionId, gateId] → mã chuỗi "sessionId|gateId". */
export function keyToId(_table: SyncTable, key: unknown): string {
  return Array.isArray(key) ? key.join('|') : String(key);
}
export function idToKey(table: SyncTable, id: string): string | [string, string] {
  if (table !== 'checks') return id;
  const i = id.indexOf('|');
  return [id.slice(0, i), id.slice(i + 1)];
}

/** Cổng an toàn ở chế độ tra cứu (chưa chọn phiên) chỉ thuộc về máy này. */
export const isLocalOnly = (table: SyncTable, id: string) => table === 'checks' && id.startsWith('_local|');

// ---------- tombstone (xóa chờ gửi) ----------
const TOMB_KEY = 'tbd.sync.tombstones';
function readTombs(): string[] {
  try {
    return JSON.parse(localStorage.getItem(TOMB_KEY) || '[]');
  } catch {
    return [];
  }
}
function writeTombs(v: string[]) {
  try {
    localStorage.setItem(TOMB_KEY, JSON.stringify(v));
  } catch {
    /* bỏ qua */
  }
}
export function tombstones(): { table: SyncTable; id: string }[] {
  return readTombs().map((s) => {
    const i = s.indexOf('|');
    return { table: s.slice(0, i) as SyncTable, id: s.slice(i + 1) };
  });
}
export function addTombstone(table: SyncTable, id: string) {
  const k = `${table}|${id}`;
  const all = readTombs();
  if (!all.includes(k)) writeTombs([...all, k]);
}
export function removeTombstones(done: { table: SyncTable; id: string }[]) {
  const drop = new Set(done.map((d) => `${d.table}|${d.id}`));
  writeTombs(readTombs().filter((k) => !drop.has(k)));
}

/** Xóa do máy chủ báo về: không tạo tombstone. */
export const remoteDeletes = new Set<string>();

let seq = 0;
const nextMt = () => Date.now() * 1000 + (seq++ % 1000);

let notifyTimer: ReturnType<typeof setTimeout> | undefined;
function notifyLocalChange() {
  if (typeof window === 'undefined') return;
  clearTimeout(notifyTimer);
  notifyTimer = setTimeout(() => window.dispatchEvent(new Event('tbd:local-change')), 50);
}

export function installTracking(db: Dexie) {
  for (const name of SYNC_TABLES) {
    const t = db.table(name);
    t.hook('creating', (_pk, obj: SyncMeta) => {
      if (obj._rv !== undefined && obj._dirty === 0) return; // bản từ máy chủ
      obj._dirty = 1;
      obj._mt = nextMt();
      notifyLocalChange();
    });
    t.hook('updating', function (modifications: object) {
      const mods = modifications as Record<string, unknown>;
      if (!Object.keys(mods).length) return undefined;
      if ('_rv' in mods || '_dirty' in mods) return undefined; // ghi của bộ đồng bộ
      notifyLocalChange();
      return { _dirty: 1, _mt: nextMt() };
    });
    t.hook('deleting', function (pk) {
      const id = keyToId(name, pk);
      if (remoteDeletes.delete(`${name}|${id}`) || isLocalOnly(name, id)) return;
      this.onsuccess = () => {
        addTombstone(name, id);
        notifyLocalChange();
      };
    });
  }
}

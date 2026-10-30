/// <reference types="node" />
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import type { Remote, RemoteRow } from '../src/sync/engine';

// --- môi trường trình duyệt tối thiểu cho các module của app ---
const mem = new Map<string, string>();
const bus = new EventTarget();
Object.assign(globalThis, {
  localStorage: {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, String(v)),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => mem.clear(),
    key: (i: number) => [...mem.keys()][i] ?? null,
    get length() {
      return mem.size;
    },
  },
  window: globalThis,
  addEventListener: bus.addEventListener.bind(bus),
  removeEventListener: bus.removeEventListener.bind(bus),
  dispatchEvent: bus.dispatchEvent.bind(bus),
});

/** Máy chủ giả: giữ dữ liệu theo bảng, tự đặt updated_at tăng dần. */
class FakeRemote implements Remote {
  tables = new Map<string, Map<string, RemoteRow>>();
  files = new Map<string, Blob>();
  clock = 0;
  onUpsert?: (table: string) => Promise<void>;
  /** giả lập RLS: dòng nào bị từ chối */
  deny?: (table: string, row: { id: string; data: Record<string, unknown>; deleted: boolean }) => boolean;
  t(name: string) {
    if (!this.tables.has(name)) this.tables.set(name, new Map());
    return this.tables.get(name)!;
  }
  ts() {
    return new Date(Date.UTC(2026, 9, 1, 0, 0, ++this.clock)).toISOString();
  }
  async pull(table: string, since: string | null) {
    return [...this.t(table).values()].filter((r) => !since || r.updated_at >= since).sort((a, b) => a.updated_at.localeCompare(b.updated_at));
  }
  async upsert(table: string, rows: { id: string; data: Record<string, unknown>; deleted: boolean }[]) {
    await this.onUpsert?.(table);
    if (this.deny && rows.some((r) => this.deny!(table, r))) throw new E.RefusedError('new row violates row-level security policy');
    return rows.map((r) => {
      const updated_at = this.ts();
      this.t(table).set(r.id, { id: r.id, data: JSON.parse(JSON.stringify(r.data)), deleted: r.deleted, updated_at });
      return { id: r.id, updated_at };
    });
  }
  async uploadPhoto(path: string, blob: Blob) {
    this.files.set(path, blob);
  }
  async downloadPhoto(path: string) {
    return this.files.get(path)!;
  }
  /** Đồng đội sửa trên máy họ. */
  teammate(table: string, id: string, data: Record<string, unknown>, deleted = false) {
    this.t(table).set(id, { id, data, deleted, updated_at: this.ts() });
  }
}

type Db = typeof import('../src/store/db');
type Engine = typeof import('../src/sync/engine');
type Meta = typeof import('../src/sync/meta');
let D: Db;
let E: Engine;
let M: Meta;
let remote: FakeRemote;
const TEAM = '11111111-1111-1111-1111-111111111111';

const session = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  profileId: 'TBD503-PLEIKU2',
  date: '2026-10-24',
  type: 'periodic' as const,
  leader: 'Trần Văn C',
  members: [],
  instruments: [],
  status: 'open' as const,
  createdAt: 1,
  ...extra,
});

beforeAll(async () => {
  D = await import('../src/store/db');
  E = await import('../src/sync/engine');
  M = await import('../src/sync/meta');
  await D.db.open();
});

beforeEach(async () => {
  remote = new FakeRemote();
  mem.clear();
  await Promise.all(D.db.tables.map((t) => t.clear()));
  mem.clear(); // clear() ở trên tạo tombstone cho dữ liệu cũ – bỏ đi
});

describe('sync engine', () => {
  it('gửi bản ghi mới; lần sau không gửi lại (không vòng lặp)', async () => {
    await D.db.sessions.put(session('s1'));
    expect(await E.pendingCount()).toBe(1);
    const r1 = await E.syncOnce(remote, TEAM);
    expect(r1.pushed).toBe(1);
    expect(await E.pendingCount()).toBe(0);
    const row = remote.t('sessions').get('s1')!;
    expect(row.data).toMatchObject({ id: 's1', leader: 'Trần Văn C' });
    expect(Object.keys(row.data).some((k) => k.startsWith('_'))).toBe(false);
    const r2 = await E.syncOnce(remote, TEAM);
    expect(r2).toEqual({ pushed: 0, pulled: 0, rejected: 0, refused: 0 });
  });

  it('nhận sửa của đồng đội; bản nhận về không bị đánh dấu chưa đồng bộ', async () => {
    remote.teammate('sessions', 's2', session('s2', { leader: 'Đồng đội' }));
    const r = await E.syncOnce(remote, TEAM);
    expect(r.pulled).toBe(1);
    expect((await D.db.sessions.get('s2'))?.leader).toBe('Đồng đội');
    expect(await E.pendingCount()).toBe(0);
  });

  it('sửa trên máy chưa gửi không bị bản trên máy chủ đè', async () => {
    await D.db.sessions.put(session('s3'));
    await E.syncOnce(remote, TEAM);
    await D.db.sessions.update('s3', { conclusion: 'của tôi' });
    remote.teammate('sessions', 's3', session('s3', { conclusion: 'của đồng đội' }));
    await E.syncOnce(remote, TEAM);
    expect((await D.db.sessions.get('s3'))?.conclusion).toBe('của tôi');
    expect(remote.t('sessions').get('s3')!.data.conclusion).toBe('của tôi');
  });

  it('xóa trên máy → máy chủ đánh dấu deleted', async () => {
    await D.db.instruments.put({ id: 'i1', model: 'VAP Tester', serial: '', calibDue: '' });
    await E.syncOnce(remote, TEAM);
    await D.db.instruments.delete('i1');
    expect(await E.pendingCount()).toBe(1);
    await E.syncOnce(remote, TEAM);
    expect(remote.t('instruments').get('i1')!.deleted).toBe(true);
    expect(await E.pendingCount()).toBe(0);
  });

  it('đồng đội xóa → máy xóa theo, không tạo dấu xóa ngược lại', async () => {
    remote.teammate('profiles', 'P1', { id: 'P1', station: 'T500', bank: 'TBD1', unitCap_uF: 13.05, unitsPerString: 6, stringsPerGroup: 24, groupsPerPhase: 2, nominalTotal_uF: 104.4, tagGap_mm: 161, unbAlarm_pct: 0.16, unbBypass_pct: 0.22, vap: { mC: [91.8, 1.4], Vmin: 900, A: [4.5, 0.14] } });
    await E.syncOnce(remote, TEAM);
    expect(await D.db.profiles.get('P1')).toBeTruthy();
    remote.teammate('profiles', 'P1', {}, true);
    await E.syncOnce(remote, TEAM);
    expect(await D.db.profiles.get('P1')).toBeUndefined();
    expect(M.tombstones()).toEqual([]);
  });

  it('dữ liệu độc hại từ máy chủ bị loại, không ghi vào máy', async () => {
    remote.teammate('sessions', 'x', session('x', { date: '<img src=x onerror=alert(1)>' }));
    const r = await E.syncOnce(remote, TEAM);
    expect(r.rejected).toBe(1);
    expect(await D.db.sessions.get('x')).toBeUndefined();
  });

  it('cổng an toàn chế độ tra cứu (_local) không bao giờ gửi lên', async () => {
    await D.db.checks.put({ sessionId: '_local', gateId: 'gate-platform', items: { a: true } });
    await D.db.checks.put({ sessionId: 's1', gateId: 'gate-platform', items: { a: true }, confirmedBy: 'C', timestamp: 5 });
    expect(await E.pendingCount()).toBe(1);
    await E.syncOnce(remote, TEAM);
    expect([...remote.t('gate_checks').keys()]).toEqual(['s1|gate-platform']);
  });

  it('sửa trong lúc đang gửi vẫn giữ trạng thái chưa đồng bộ', async () => {
    await D.db.measurements.put({ id: 's1|4.1|unbalance|A.U', sessionId: 's1', itemId: '4.1', testId: 'unbalance', key: 'A.U', value: '250', ts: 1 });
    remote.onUpsert = async () => {
      remote.onUpsert = undefined;
      await D.db.measurements.update('s1|4.1|unbalance|A.U', { value: '251' });
    };
    await E.syncOnce(remote, TEAM);
    expect(await E.pendingCount()).toBe(1);
    await E.syncOnce(remote, TEAM);
    expect(remote.t('measurements').get('s1|4.1|unbalance|A.U')!.data.value).toBe('251');
    expect(await E.pendingCount()).toBe(0);
  });

  it('ảnh: tải lên Storage theo thư mục đội; ảnh SVG từ máy chủ bị chặn', async () => {
    const blob = new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: 'image/jpeg' });
    await D.db.photos.put({ id: 'p1', sessionId: 's1', itemId: '4.1', blob, caption: 'Tủ VAP', ts: 1 });
    await E.syncOnce(remote, TEAM);
    expect(remote.files.has(`${TEAM}/p1.jpg`)).toBe(true);
    const row = remote.t('photos').get('p1')!;
    expect(row.data.path).toBe(`${TEAM}/p1.jpg`);
    expect('blob' in row.data).toBe(false);

    remote.files.set(`${TEAM}/p2.jpg`, new Blob(['<svg onload=alert(1)>'], { type: 'image/svg+xml' }));
    remote.teammate('photos', 'p2', { id: 'p2', sessionId: 's1', itemId: '4.1', caption: 'x', ts: 2, path: `${TEAM}/p2.jpg` });
    remote.teammate('photos', 'p3', { id: 'p3', sessionId: 's1', itemId: '4.1', caption: 'x', ts: 2, path: `other-team/p3.jpg` });
    const r = await E.syncOnce(remote, TEAM);
    expect(r.rejected).toBe(2);
    expect(await D.db.photos.get('p2')).toBeUndefined();
  });

  it('máy chủ từ chối (không quyền / biên bản đã khóa) → bỏ thay đổi, lấy lại bản máy chủ; dòng khác vẫn gửi', async () => {
    remote.teammate('measurements', 'm1', { id: 'm1', sessionId: 's1', itemId: '4.1', testId: 'unbalance', key: 'A.U', value: '250', ts: 1 });
    await E.syncOnce(remote, TEAM);
    await D.db.measurements.update('m1', { value: '999' });
    await D.db.measurements.put({ id: 'm2', sessionId: 's2', itemId: '4.1', testId: 'unbalance', key: 'A.U', value: '1', ts: 1 });
    remote.deny = (_t, r) => r.data.sessionId === 's1'; // s1 đã khóa
    const r = await E.syncOnce(remote, TEAM);
    expect(r.refused).toBe(1);
    expect(r.pushed).toBe(1);
    expect(remote.t('measurements').has('m2')).toBe(true);
    expect((await D.db.measurements.get('m1'))?.value).toBe('250'); // bản của máy chủ
    expect(await E.pendingCount()).toBe(0); // không thử lại mãi
  });

  it('xóa bị từ chối → bản ghi được trả lại từ máy chủ', async () => {
    remote.teammate('signatures', 'sg1', { id: 'sg1', sessionId: 's1', slot: 'leader', userId: 'u1', email: 'a@b.c', name: 'A', role: 'leader', signedAt: 1, hash: 'a'.repeat(64) });
    await E.syncOnce(remote, TEAM);
    await D.db.signatures.delete('sg1');
    remote.deny = (t) => t === 'signatures';
    const r = await E.syncOnce(remote, TEAM);
    expect(r.refused).toBe(1);
    expect(await D.db.signatures.get('sg1')).toBeTruthy();
    expect(M.tombstones()).toEqual([]);
  });
});

describe('phân quyền và ký xác nhận điện tử', () => {
  type Roles = typeof import('../src/auth/roles');
  type Sign = typeof import('../src/sign/sign');
  let R: Roles;
  let S: Sign;
  const me = (role: 'admin' | 'leader' | 'tester' | 'viewer' | null, status: 'pending' | 'approved' | 'disabled' = 'approved') =>
    ({ userId: `u-${role}`, email: `${role}@evn.vn`, name: `Người ${role}`, status, role, teamId: role ? 'T1' : null, teamName: 'Đội 1' }) as const;

  beforeAll(async () => {
    R = await import('../src/auth/roles');
    S = await import('../src/sign/sign');
  });

  it('ma trận quyền khớp máy chủ', () => {
    // chưa đăng nhập: dùng một mình như trước, trừ quản lý tài khoản và thu hồi chữ ký
    expect(R.can('session.create', null)).toBe(true);
    expect(R.can('users.manage', null)).toBe(false);
    expect(R.canSign('tester', null)).toBe(false);
    // chờ duyệt / bị khóa: không làm gì được
    expect(R.can('measure.edit', me('tester', 'pending'))).toBe(false);
    expect(R.can('measure.edit', me('tester', 'disabled'))).toBe(false);
    // theo vai trò
    expect(R.can('session.create', me('tester'))).toBe(false);
    expect(R.can('measure.edit', me('tester'))).toBe(true);
    expect(R.can('measure.edit', me('viewer'))).toBe(false);
    expect(R.can('session.create', me('leader'))).toBe(true);
    expect(R.can('users.manage', me('leader'))).toBe(false);
    expect(R.can('users.manage', me('admin'))).toBe(true);
    expect(R.canSign('leader', me('tester'))).toBe(false);
    expect(R.canSign('leader', me('leader'))).toBe(true);
    expect(R.canSign('qlvh', me('viewer'))).toBe(true);
    expect(R.canSign('tester', me('admin'))).toBe(false);
  });

  it('ký: mã nội dung phát hiện sửa sau khi ký; kết luận không ảnh hưởng chữ ký Người thí nghiệm', async () => {
    await D.db.sessions.put(session('sg'));
    await D.db.measurements.put({ id: 'sg|4.1|unbalance|A.U', sessionId: 'sg', itemId: '4.1', testId: 'unbalance', key: 'A.U', value: '250', ts: 1 });
    R.setMe(null);
    await expect(S.signSession('sg', 'tester')).rejects.toThrow(/không được ký/);
    R.setMe(me('tester'));
    const sig = await S.signSession('sg', 'tester');
    expect(sig.hash).toMatch(/^[0-9a-f]{64}$/);
    await expect(S.signSession('sg', 'tester')).rejects.toThrow(/đã ký/);
    await expect(S.signSession('sg', 'leader')).rejects.toThrow(/không được ký/);
    expect((await S.verifySignatures('sg'))[0].valid).toBe(true);
    await D.db.sessions.update('sg', { conclusion: 'Đạt' });
    expect((await S.verifySignatures('sg'))[0].valid).toBe(true);
    await D.db.measurements.update('sg|4.1|unbalance|A.U', { value: '251' });
    expect((await S.verifySignatures('sg'))[0].valid).toBe(false);
  });

  it('Chỉ huy ký → khóa biên bản, phiên chuyển "đã kết thúc"; chỉ một chữ ký Chỉ huy', async () => {
    await D.db.sessions.put(session('sl'));
    expect(await S.isLocked('sl')).toBe(false);
    R.setMe(me('leader'));
    await S.signSession('sl', 'leader');
    expect(await S.isLocked('sl')).toBe(true);
    expect((await D.db.sessions.get('sl'))?.status).toBe('done');
    R.setMe({ ...me('leader'), userId: 'u-leader2' });
    await expect(S.signSession('sl', 'leader')).rejects.toThrow(/đã có chữ ký Chỉ huy/);
    // chữ ký được gửi lên như mọi bản ghi khác
    expect(await E.pendingCount()).toBeGreaterThan(0);
    await E.syncOnce(remote, TEAM);
    expect(remote.t('signatures').get('sl|leader|u-leader')!.data.slot).toBe('leader');
    R.setMe(null);
  });
});
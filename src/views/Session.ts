import { getItem, getTest, items, gatesFor, getGate } from '../content';
import { setTop } from '../components/Chrome';
import { activeSessionId, db, deleteSession, getGateCheck, getValues, measId, previousSession, putValue, setActiveSession, storageWarning } from '../store/db';
import { evaluateTest, formFor, paintRows, PHASES, type Phase, type ResultRow, type Values } from '../forms';
import { calibOverdue, combine } from '../calc/evaluate';
import { callout, debounce, esc, fmtDate, fmtTime, resBadge, toast, uid } from '../ui';
import { go, params, type View } from '../router';
import { bindViewer } from '../components/ImageViewer';
import { TYPE_LABEL } from './Sessions';
import { getFontScale } from '../settings';
import { stepsOf } from './StepMode';
import { can, canSign, getMe, SLOT_LABEL } from '../auth/roles';
import { isLocked, revokeSignature, signSession, verifySignatures, type SignatureCheck } from '../sign/sign';
import type { SignSlot } from '../types';
import type { Profile, Result, Session } from '../types';

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

// ---------- Ảnh hiện trường ----------
async function compress(file: File, max = 1600): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('toBlob'))), 'image/jpeg', 0.8));
}

const urls: string[] = [];
window.addEventListener('route:leave', () => urls.splice(0).forEach((u) => URL.revokeObjectURL(u)));

async function photosBlock(root: HTMLElement, sessionId: string, itemId: string, readOnly: boolean) {
  const box = root.querySelector<HTMLElement>('[data-photos]')!;
  const draw = async () => {
    const list = await db.photos.where('[sessionId+itemId]').equals([sessionId, itemId]).toArray();
    box.innerHTML = `<div class="thumbs" data-gallery="photos">${list
      .map((p) => {
        const u = URL.createObjectURL(p.blob);
        urls.push(u);
        return `<figure><a href="${u}" data-pswp-width="1600" data-pswp-height="1200" data-caption="${esc(p.caption)}"><img src="${u}" alt="${esc(p.caption)}"></a><figcaption>${esc(p.caption)} ${readOnly ? '' : `<button class="icon-btn" type="button" data-del="${esc(p.id)}" aria-label="Xóa ảnh" style="min-width:36px;min-height:36px;font-size:16px">🗑</button>`}</figcaption></figure>`;
      })
      .join('')}</div>
      ${readOnly ? '' : '<label class="btn secondary block" style="margin-top:10px">📷 Chụp / chọn ảnh<input type="file" accept="image/*" capture="environment" multiple hidden data-file></label>'}`;
    // kích thước thật cho trình xem
    box.querySelectorAll<HTMLAnchorElement>('a[data-pswp-width]').forEach((a) => {
      const img = a.querySelector('img')!;
      const set = () => {
        a.dataset.pswpWidth = String(img.naturalWidth);
        a.dataset.pswpHeight = String(img.naturalHeight);
      };
      if (img.complete) set();
      else img.addEventListener('load', set, { once: true });
    });
    box.querySelector<HTMLInputElement>('[data-file]')?.addEventListener('change', async (e) => {
      const files = [...((e.target as HTMLInputElement).files ?? [])];
      for (const f of files) {
        try {
          const blob = await compress(f);
          const caption = prompt('Chú thích ảnh:', `${itemId} – ${new Date().toLocaleTimeString('vi-VN')}`) ?? '';
          await db.photos.add({ id: uid(), sessionId, itemId, blob, caption, ts: Date.now() });
        } catch {
          toast('Không đọc được ảnh ' + f.name);
        }
      }
      const w = await storageWarning();
      if (w) toast(w);
      draw();
    });
    box.querySelectorAll<HTMLButtonElement>('[data-del]').forEach((b) =>
      b.addEventListener('click', async () => {
        if (!confirm('Xóa ảnh này?')) return;
        await db.photos.delete(b.dataset.del!);
        draw();
      }),
    );
    bindViewer();
  };
  await draw();
}

// ---------- Ký biên bản ----------
const SLOTS: SignSlot[] = ['tester', 'leader', 'qlvh'];

function signBlock(sigs: SignatureCheck[]): string {
  const me = getMe();
  return SLOTS.map((slot) => {
    const mine = sigs.filter((x) => x.sig.slot === slot);
    const already = mine.some((x) => x.sig.userId === me?.userId) || (slot === 'leader' && mine.length > 0);
    return `<div class="card"><b>${esc(SLOT_LABEL[slot])}</b>
      ${mine
        .map(
          ({ sig, valid }) => `<div class="small" style="margin-top:6px">✍️ <b>${esc(sig.name)}</b> (${esc(sig.email)})<br>${esc(fmtTime(sig.signedAt))} · mã ${esc(sig.hash.slice(0, 12))}
            <br>${valid ? resBadge('pass', '✓ Nội dung khớp lúc ký') : resBadge('fail', '⚠️ Nội dung đã thay đổi sau khi ký')}
            ${can('sign.revoke') ? `<button class="btn secondary" type="button" data-revoke="${esc(sig.id)}" style="margin-top:6px">Thu hồi chữ ký</button>` : ''}</div>`,
        )
        .join('')}
      ${!mine.length ? '<div class="small muted">Chưa ký</div>' : ''}
      ${canSign(slot) && !already ? `<button class="btn block" type="button" data-sign="${slot}" style="margin-top:8px">✍️ Ký xác nhận</button>` : ''}
    </div>`;
  }).join('') + (me ? '' : '<p class="small muted">Đăng nhập tài khoản đã được duyệt (⚙️ Cài đặt) để ký biên bản.</p>');
}

// ---------- Chi tiết phiên ----------
export const SessionView: View = async (_r, el) => {
  const id = params().id;
  const d = await loadSessionData(id);
  if (!d) {
    setTop('Không tìm thấy', { back: '#/sessions' });
    el.innerHTML = '<p>Không tìm thấy phiên hoặc hồ sơ giàn của phiên.</p>';
    return;
  }
  const { session: s, profile: p } = d;
  setTop(`Phiên ${p.bank}`, { back: '#/sessions', sub: `${fmtDate(s.date)} · ${TYPE_LABEL[s.type]}` });
  const isActive = activeSessionId() === s.id;
  const insts = await sessionInstruments(s);
  const gp = await getGateCheck('gate-platform', s.id);
  const all = items.flatMap((it) => it.tests.map((t) => ({ it, t, ...testState(d, it.id, t.id) })));
  const counts = { pass: 0, fail: 0, warn: 0 };
  for (const x of all) for (const r of x.rows) if (r.result in counts) counts[r.result as keyof typeof counts]++;
  const sigs = await verifySignatures(s.id);
  const locked = sigs.some((x) => x.sig.slot === 'leader');
  const editable = !locked && can('session.edit');

  el.innerHTML = `
    <div class="card">
      <div class="row"><b>${esc(p.bank)} – ${esc(p.station)}</b>${isActive ? '<span class="pill">● Đang làm</span>' : ''}</div>
      <div class="small">Ngày: ${esc(fmtDate(s.date))} · ${esc(TYPE_LABEL[s.type])}<br>Chỉ huy: <b>${esc(s.leader)}</b>${s.members.length ? `<br>Thành viên: ${s.members.map(esc).join(', ')}` : ''}</div>
      ${insts.map((i) => `<div class="small">🔧 ${esc(i!.model)}${i!.serial ? ` · SN ${esc(i!.serial)}` : ''}${calibOverdue(i!.calibDue, s.date) ? ` <span class="res fail">QUÁ HẠN ${esc(fmtDate(i!.calibDue))}</span>` : ''}</div>`).join('')}
      <div class="btn-row">${isActive ? '<button class="btn secondary" type="button" id="deact">Bỏ chọn phiên</button>' : '<button class="btn" type="button" id="act">Đặt làm phiên đang làm</button>'}${editable ? '<button class="btn secondary" type="button" id="resnap">↻ Cập nhật ngưỡng từ hồ sơ giàn</button>' : ''}</div>
    </div>
    <a class="card row" href="#/gate/gate-platform" style="text-decoration:none;color:inherit" ${isActive ? '' : 'data-need-active'}>
      <span>${gp.confirmedBy ? '✅' : '⚠️'} Cổng an toàn lên sàn tụ</span><span class="small">${gp.confirmedBy ? `${esc(gp.confirmedBy)} · ${esc(fmtTime(gp.timestamp!))}` : 'Chưa xác nhận'}</span></a>
    <h2>Tiến độ</h2>
    <div class="progress-items">${items.map((it) => `<a href="#/session/${esc(s.id)}/form/${it.id}/${it.tests[0].id}">${it.id} ${STATE_ICON[itemState(d, it.id)]}</a>`).join('')}</div>
    ${items
      .map(
        (it) => `<div class="card"><b>${it.id} ${esc(it.short)}</b>
        ${it.tests
          .map((t) => {
            const st = testState(d, it.id, t.id).state;
            return `<a class="row" href="#/session/${esc(s.id)}/form/${it.id}/${t.id}" style="min-height:44px;color:inherit;text-decoration:none;border-top:1px solid var(--c-border)"><span>${esc(t.title)}</span><span>${STATE_ICON[st]}</span></a>`;
          })
          .join('')}</div>`,
      )
      .join('')}
    <h2>Tổng kết</h2>
    <p>${resBadge('pass', `✅ Đạt: ${counts.pass}`)} ${resBadge('warn', `⚠️ Cảnh báo: ${counts.warn}`)} ${resBadge('fail', `❌ Không đạt: ${counts.fail}`)}</p>
    ${
      counts.fail + counts.warn
        ? `<div class="table-wrap"><table><thead><tr><th>Hạng mục</th><th>Nội dung</th><th>Giá trị</th><th>KQ</th></tr></thead><tbody>${all
            .flatMap((x) => x.rows.filter((r) => r.result === 'fail' || r.result === 'warn').map((r) => `<tr><td>${x.it.id}</td><td>${esc(r.group)} ${esc(r.label)}</td><td>${esc(r.value)}</td><td>${resBadge(r.result)}</td></tr>`))
            .join('')}</tbody></table></div>`
        : ''
    }
    <label class="field"><span>Kết luận, kiến nghị</span><textarea id="concl" rows="4"${editable ? '' : ' disabled'}>${esc(s.conclusion ?? '')}</textarea></label>
    <label class="check"><input type="checkbox" id="done"${s.status === 'done' ? ' checked' : ''}${editable ? '' : ' disabled'}><span>Đã kết thúc phiên</span></label>
    <h2>Ký biên bản</h2>
    ${locked ? callout({ level: 'info', text: '🔒 **Biên bản đã khóa** do Chỉ huy trực tiếp đã ký. Không sửa được số liệu.' }) : ''}
    ${signBlock(sigs)}
    <h2>Xuất biên bản</h2>
    <div class="btn-row">
      <button class="btn" type="button" data-exp="pdf">📄 PDF</button>
      <button class="btn" type="button" data-exp="xlsx">📊 Excel</button>
      <button class="btn secondary" type="button" data-exp="json">{ } JSON</button>
      ${'share' in navigator ? '<button class="btn secondary" type="button" data-exp="share">📤 Chia sẻ PDF</button>' : ''}
    </div>
    ${editable ? '<button class="btn danger block" type="button" id="del" style="margin-top:24px">Xóa phiên</button>' : ''}`;

  el.querySelectorAll<HTMLButtonElement>('[data-sign]').forEach((b) =>
    b.addEventListener('click', async () => {
      const slot = b.dataset.sign as SignSlot;
      const warn = slot === 'leader' ? '\nSau khi ký, biên bản bị KHÓA: không sửa được số liệu, chỉ Quản trị mới thu hồi được chữ ký.' : '';
      if (!confirm(`Ký xác nhận "${SLOT_LABEL[slot]}" bằng tài khoản ${getMe()?.email}?${warn}`)) return;
      try {
        // kết luận vừa gõ phải nằm trong nội dung được ký
        const concl = el.querySelector<HTMLTextAreaElement>('#concl')!;
        if (!concl.disabled && concl.value !== (s.conclusion ?? '')) await db.sessions.update(s.id, { conclusion: concl.value });
        await signSession(s.id, slot);
        toast('✓ Đã ký xác nhận');
        go(location.hash);
      } catch (err) {
        toast((err as Error).message, undefined, 6000);
      }
    }),
  );
  el.querySelectorAll<HTMLButtonElement>('[data-revoke]').forEach((b) =>
    b.addEventListener('click', async () => {
      if (!confirm('Thu hồi chữ ký này? Nếu là chữ ký Chỉ huy, biên bản sẽ mở khóa.')) return;
      await revokeSignature(b.dataset.revoke!);
      go(location.hash);
    }),
  );
  el.querySelector('#act')?.addEventListener('click', () => {
    setActiveSession(s.id);
    toast('Đã đặt làm phiên đang làm');
    go(location.hash);
  });
  el.querySelector('#resnap')?.addEventListener('click', async () => {
    const cur = await db.profiles.get(s.profileId);
    if (!cur) return toast('Hồ sơ giàn không còn trong danh mục');
    if (!confirm('Áp ngưỡng hiện tại của hồ sơ ' + cur.bank + ' và hạn kiểm định máy TN hiện tại cho phiên này? Kết quả Đạt/Không đạt sẽ được tính lại.')) return;
    const inst = (await db.instruments.bulkGet(s.instruments)).filter((x) => !!x);
    await db.sessions.update(s.id, { profileSnap: cur, instrumentSnap: inst });
    go(location.hash);
  });
  el.querySelector('#deact')?.addEventListener('click', () => {
    setActiveSession(null);
    go(location.hash);
  });
  el.querySelector('[data-need-active]')?.addEventListener('click', (e) => {
    // cổng an toàn ghi vào phiên đang làm – đặt phiên này trước
    e.preventDefault();
    setActiveSession(s.id);
    go('#/gate/gate-platform');
  });
  const saveConcl = debounce(async (v: string) => {
    await db.sessions.update(s.id, { conclusion: v });
  }, 500);
  el.querySelector<HTMLTextAreaElement>('#concl')!.addEventListener('input', (e) => saveConcl((e.target as HTMLTextAreaElement).value));
  el.querySelector<HTMLInputElement>('#done')!.addEventListener('change', async (e) => {
    await db.sessions.update(s.id, { status: (e.target as HTMLInputElement).checked ? 'done' : 'open' });
  });
  el.querySelectorAll<HTMLButtonElement>('[data-exp]').forEach((b) =>
    b.addEventListener('click', async () => {
      b.disabled = true;
      try {
        // kết luận vừa gõ (chưa qua debounce) phải có trong biên bản
        if (editable) await db.sessions.update(s.id, { conclusion: el.querySelector<HTMLTextAreaElement>('#concl')!.value });
        const fresh = (await loadSessionData(s.id))!;
        const ex = await import('../export/exporters');
        await ex.exportSession(fresh, b.dataset.exp as 'pdf' | 'xlsx' | 'json' | 'share');
      } catch (err) {
        console.error(err);
        toast('Xuất thất bại: ' + (err as Error).message);
      } finally {
        b.disabled = false;
      }
    }),
  );
  el.querySelector('#del')?.addEventListener('click', async () => {
    if (!confirm('Xóa phiên này cùng toàn bộ số đo và ảnh? Không thể hoàn tác.')) return;
    await deleteSession(s.id);
    go('#/sessions');
  });
};

// ---------- Biểu mẫu nhập số đo ----------
const PHASE_KEY = 'tbd.phase';

/** Số đo lần trước → ô so sánh lần này: MOV/kháng `A.Z` → `A.Z_prev`; sứ `A.C1` → `A.C1base`. */
function prevTarget(form: string, key: string): string | null {
  const m = /^([ABC])\.([A-Za-z0-9]+)$/.exec(key);
  if (!m || m[2] === 'note' || m[2] === 't') return null;
  if (form === 'bushing') return m[2] === 'C1' ? `${key}base` : null;
  return `${key}_prev`;
}

export const SessionForm: View = async (_r, el) => {
  const { id, itemId, testId } = params();
  const d = await loadSessionData(id);
  const item = getItem(itemId);
  const test = getTest(itemId, testId);
  const form = formFor(itemId, testId);
  if (!d || !item || !test || !form) {
    setTop('Không tìm thấy', { back: '#/sessions' });
    el.innerHTML = '<p>Không tìm thấy biểu mẫu.</p>';
    return;
  }
  const { session: s, profile: p } = d;
  setTop(`${item.id} ${test.title.replace(/^[A-D]\.\s*/, '')}`, { back: `#/session/${s.id}`, sub: `${p.bank} · ${fmtDate(s.date)}` });
  const values: Values = { ...(await getValues(s.id, itemId, testId)), __item: itemId, __test: testId };
  let phase: Phase = ((sessionStorage.getItem(PHASE_KEY) as Phase) || 'A') as Phase;
  if (!PHASES.includes(phase)) phase = 'A';
  const prevS = await previousSession(s, itemId, testId);
  const prev = prevS ? await getValues(prevS.id, itemId, testId) : undefined;
  const canPrev = !!prevS && ['mov', 'reactor', 'bushing'].includes(test.form!);
  const ctrlRoom = test.form === 'inject';
  const locked = await isLocked(s.id);
  const readOnly = locked || !can('measure.edit');
  const gateMissing = [];
  for (const g of gatesFor(itemId, testId)) if (!(await getGateCheck(g, s.id)).confirmedBy) gateMissing.push(getGate(g)?.title ?? g);

  el.innerHTML = `
    ${locked ? callout({ level: 'info', text: '🔒 **Biên bản đã khóa** do Chỉ huy trực tiếp đã ký. Chỉ xem, không sửa được.' }) : !can('measure.edit') ? callout({ level: 'info', text: 'Tài khoản này **chỉ xem**, không nhập được số đo.' }) : ''}
    ${gateMissing.length && !readOnly ? callout({ level: 'warn', text: `Chưa xác nhận: ${gateMissing.join('; ')}.` }) : ''}
    <div class="row" style="margin-top:12px">
      ${form.phased ? `<div class="seg" role="group" aria-label="Pha">${PHASES.map((x) => `<button type="button" data-ph="${x}" aria-pressed="${x === phase}">${x}</button>`).join('')}</div>` : '<span></span>'}
      ${stepsOf(test).length ? `<a class="btn secondary" href="#/item/${itemId}/test/${testId}/step/1">▶ Từng bước</a>` : ''}
    </div>
    <div class="btn-row">
      ${canPrev && !readOnly ? `<button class="btn secondary" type="button" id="prev">↺ Lấy số lần trước (${esc(fmtDate(prevS!.date))})</button>` : ''}
      ${ctrlRoom ? '<button class="btn secondary" type="button" id="ctrl" aria-pressed="false">🖥 Phòng điều khiển</button>' : ''}
    </div>
    <div id="body"></div>
    <h2>Kết quả</h2><div id="rows"></div>
    <h2>Ảnh hiện trường – ${item.id}</h2><div data-photos></div>
    <div class="btn-row"><a class="btn block" href="#/session/${esc(s.id)}">✓ Xong – về phiên</a></div>`;

  const body = el.querySelector<HTMLElement>('#body')!;
  const rowsEl = el.querySelector<HTMLElement>('#rows')!;
  const pending = new Map<string, string>();
  const writeNow = () => {
    const batch = [...pending];
    pending.clear();
    if (batch.length) db.measurements.bulkPut(batch.map(([k, v]) => ({ id: measId(s.id, itemId, testId, k), sessionId: s.id, itemId, testId, key: k, value: v, ts: Date.now() })));
  };
  const flush = debounce(writeNow, 500);
  // lưu ngay khi rời trang, khóa máy hoặc chuyển app (NF5 – không mất số khi hệ điều hành tắt tab)
  const onHide = () => document.visibilityState === 'hidden' && writeNow();
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', writeNow);
  window.addEventListener(
    'route:leave',
    () => {
      writeNow();
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', writeNow);
    },
    { once: true },
  );

  const refresh = () => {
    paintRows(body, values, p);
    form.live?.(body, values, p, phase);
    const rows = form.rows(values, p, testId, itemId);
    rowsEl.innerHTML = rows.length
      ? `<div class="table-wrap"><table><thead><tr><th>Nội dung</th><th>Giá trị</th><th>Yêu cầu</th><th>KQ</th></tr></thead><tbody>${rows
          .map((r) => `<tr><td>${esc(r.group ? r.group + ' · ' : '')}${esc(r.label)}</td><td>${esc(r.value)}</td><td class="small">${esc(r.expected)}</td><td>${r.result === 'na' ? '' : resBadge(r.result)}</td></tr>`)
          .join('')}</tbody></table></div>`
      : '<p class="muted">Chưa có số liệu.</p>';
  };
  const draw = () => {
    body.innerHTML = form.render(values, p, phase, prev);
    if (readOnly) body.querySelectorAll<HTMLInputElement>('input, select, textarea').forEach((x) => (x.disabled = true));
    refresh();
  };
  body.addEventListener('input', (e) => {
    const t = e.target as HTMLInputElement;
    const k = t.dataset.k;
    if (!k) return;
    values[k] = t.value;
    pending.set(k, t.value);
    flush();
    refresh();
  });
  el.querySelectorAll<HTMLButtonElement>('[data-ph]').forEach((b) =>
    b.addEventListener('click', () => {
      phase = b.dataset.ph as Phase;
      sessionStorage.setItem(PHASE_KEY, phase);
      el.querySelectorAll('[data-ph]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      draw();
    }),
  );
  el.querySelector('#prev')?.addEventListener('click', async () => {
    let c = 0;
    for (const [k, v] of Object.entries(prev!)) {
      const tk = prevTarget(test.form!, k);
      if (!tk || !(v ?? '').trim()) continue;
      values[tk] = v;
      await putValue(s.id, itemId, testId, tk, v);
      c++;
    }
    toast(c ? `Đã lấy ${c} giá trị từ phiên ${fmtDate(prevS!.date)}` : 'Phiên trước không có số liệu');
    draw();
  });
  el.querySelector('#ctrl')?.addEventListener('click', (e) => {
    const b = e.currentTarget as HTMLButtonElement;
    const on = b.getAttribute('aria-pressed') !== 'true';
    b.setAttribute('aria-pressed', String(on));
    b.textContent = on ? '🖥 Phòng điều khiển: BẬT' : '🖥 Phòng điều khiển';
    document.documentElement.style.setProperty('--fs-scale', String(on ? 1.25 : getFontScale()));
    window.addEventListener('route:leave', () => document.documentElement.style.setProperty('--fs-scale', String(getFontScale())), { once: true });
  });
  draw();
  await photosBlock(el, s.id, itemId, readOnly);
};

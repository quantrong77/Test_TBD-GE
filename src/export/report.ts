import { items, CONTENT_VERSION, getGate } from '../content';
import { calibOverdue } from '../calc/evaluate';
import { itemOn, sessionInstruments, testState, TYPE_LABEL, type SessionData } from '../domain/session';
import { crewLabel, DEFAULT_UNIT, formatReportNo } from '../domain/units';
import { db } from '../store/db';
import { verifySignatures } from '../sign/sign';
import { SLOT_LABEL } from '../auth/roles';
import { fmtDate, fmtTime, resText } from '../ui';
import type { ResultRow } from '../forms';
import { signerBlocks } from './signers';
import type { GateCheck } from '../types';
export type { SignerBlock } from './signers';

export interface ReportSection {
  itemId: string;
  itemTitle: string;
  testTitle: string;
  rows: ResultRow[];
}

/** Ghi chú mốc đồng hồ của cổng (vd cô lập tụ từ 08:30 – nhập tay). */
function timedNote(c: GateCheck): string {
  return Object.entries(c.timed ?? {})
    .map(([id, t]) => `Cô lập từ ${fmtTime(t.at)}${t.manual ? ' (nhập tay theo phiếu công tác)' : ''}${id === 'isolated-15min' ? '' : ' [' + id + ']'}`)
    .join('; ');
}

export async function buildReport(d: SessionData) {
  const { session: s, profile: p } = d;
  const insts = await sessionInstruments(s);
  const checks = await db.checks.where('sessionId').equals(s.id).toArray();
  const info: [string, string][] = [
    ['Trạm', p.station],
    ['Giàn tụ', p.bank],
    ['Ngày thí nghiệm', fmtDate(s.date)],
    ['Loại thí nghiệm', TYPE_LABEL[s.type]],
    ['Chỉ huy trực tiếp', crewLabel(s.crew?.leader ?? { name: s.leader })],
    ...(s.crew?.responsible ? [['Người chịu trách nhiệm thí nghiệm', crewLabel(s.crew.responsible)] as [string, string]] : []),
    ['Thành viên', (s.crew ? s.crew.members.map(crewLabel) : s.members).join('; ')],
    ['Điện dung danh định 1 pha', `${p.nominalTotal_uF} µF`],
    ['Ngưỡng ΔC alarm / bypass', `${p.unbAlarm_pct} % / ${p.unbBypass_pct} %`],
    ['Khe hở TAG (hồ sơ)', `${p.tagGap_mm} mm`],
  ];
  const instruments = insts.map((i) => [i!.model, i!.serial || '—', i!.calibDue ? fmtDate(i!.calibDue) + (calibOverdue(i!.calibDue, s.date) ? ' (QUÁ HẠN)' : '') : '—']);
  const gates = checks
    .filter((c) => c.confirmedBy)
    .map((c) => [getGate(c.gateId)?.title ?? c.gateId, c.confirmedBy!, fmtTime(c.timestamp!), timedNote(c)]);
  const notDone = items.filter((it) => !itemOn(s, it.id));
  if (notDone.length) info.push(['Hạng mục không thực hiện', notDone.map((it) => `${it.id.slice(2)}. ${it.short}`).join('; ')]);
  const sections: ReportSection[] = [];
  for (const it of items.filter((x) => itemOn(s, x.id)))
    for (const t of it.tests) {
      const { rows } = testState(d, it.id, t.id);
      if (rows.length) sections.push({ itemId: it.id, itemTitle: `${it.id} ${it.title}`, testTitle: t.title, rows });
    }
  const all = sections.flatMap((x) => x.rows);
  const summary = {
    pass: all.filter((r) => r.result === 'pass').length,
    warn: all.filter((r) => r.result === 'warn').length,
    fail: all.filter((r) => r.result === 'fail').length,
  };
  const signatures = (await verifySignatures(s.id))
    .filter(({ sig }) => sig.slot in SLOT_LABEL) // bỏ ô QLVH của dữ liệu cũ
    .map(({ sig, valid }) => ({
      slot: sig.slot,
      label: SLOT_LABEL[sig.slot],
      name: sig.name,
      email: sig.email,
      time: fmtTime(sig.signedAt),
      hash: sig.hash,
      check: valid ? 'Khớp nội dung lúc ký' : 'NỘI DUNG ĐÃ THAY ĐỔI SAU KHI KÝ',
    }));
  const unit = s.unitSnap ?? DEFAULT_UNIT;
  const header = { orgName: unit.orgName, unitName: unit.name, reportNo: formatReportNo(unit.reportFormat, s.reportNo, s.date) };
  return { s, p, header, info, instruments, gates, sections, summary, signatures, signers: signerBlocks(s, signatures), resText, contentVersion: CONTENT_VERSION };
}

export const fileBase = (d: SessionData) => `BB_TBD_${d.profile.bank}_${d.profile.station}_${d.session.date}`.replace(/[^\p{L}\p{N}_-]+/gu, '_');

export function download(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // thu hồi muộn: trình duyệt di động có thể hủy tải nếu blob URL bị thu hồi sớm
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
}

export const blobToDataUrl = (b: Blob) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = rej;
    r.readAsDataURL(b);
  });

export async function dataUrlToBlob(u: string): Promise<Blob> {
  return (await fetch(u)).blob();
}

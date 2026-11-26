import * as XLSX from 'xlsx';
import { buildReport, type SignerBlock } from './report';
import { items } from '../content';
import type { SessionData } from '../domain/session';

/** Bảng ký: mỗi cột một ô ký, mỗi dòng một người ("Họ tên – đã ký điện tử lúc …" hoặc để trống ký tay). */
function signerRows(bs: SignerBlock[]): string[][] {
  const n = Math.max(0, ...bs.map((b) => b.people.length));
  return Array.from({ length: n }, (_, i) => [
    i === 0 ? '(Ký, ghi rõ họ tên)' : '',
    ...bs.map((b) => {
      const p = b.people[i];
      return p ? (p.signedAt ? `${p.name} – đã ký điện tử ${p.signedAt}` : p.name) : '';
    }),
  ]);
}

const sheetName =(s: string) => s.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31);

export async function buildXlsx(d: SessionData): Promise<Blob> {
  const r = await buildReport(d);
  const wb = XLSX.utils.book_new();
  const res = (x: string) => (x === 'na' ? '' : r.resText(x as never).replace(/^[^\p{L}]+/u, ''));

  const info = XLSX.utils.aoa_to_sheet([
    [r.header.orgName.toUpperCase()],
    [r.header.unitName.toUpperCase()],
    ...(r.header.reportNo ? [[`Số: ${r.header.reportNo}`]] : []),
    ...(r.header.note ? [[r.header.note]] : []),
    [],
    ['BIÊN BẢN THÍ NGHIỆM NHẤT THỨ GIÀN TỤ BÙ DỌC 500 kV – HÃNG GE'],
    [],
    ...r.info,
    [],
    ['Máy thí nghiệm', 'Số serial', 'Hạn kiểm định'],
    ...r.instruments,
    [],
    ['Cổng an toàn', 'Người xác nhận', 'Thời điểm', 'Ghi chú'],
    ...r.gates,
    [],
    ['Đạt', 'Cảnh báo', 'Không đạt'],
    [r.summary.pass, r.summary.warn, r.summary.fail],
    [],
    ['Kết luận, kiến nghị', r.s.conclusion ?? ''],
    [],
    ['XÁC NHẬN', ...r.signers.map((b) => b.title)],
    ...signerRows(r.signers),
    ...(r.signatures.length
      ? [[], ['Ô ký', 'Người ký', 'Thời điểm', 'Mã kiểm tra nội dung (SHA-256)', 'Kiểm tra'], ...r.signatures.map((g) => [g.label, `${g.name} (${g.email})`, g.time, g.hash, g.check])]
      : []),
  ]);
  info['!cols'] = [{ wch: 30 }, { wch: 50 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, info, 'Thông tin');

  for (const it of items) {
    const secs = r.sections.filter((s) => s.itemId === it.id);
    if (!secs.length) continue;
    const ws = XLSX.utils.aoa_to_sheet([
      [`${it.id} ${it.title}`],
      [],
      ['Phép thử', 'Nhóm', 'Nội dung', 'Giá trị', 'Yêu cầu', 'Kết quả'],
      ...secs.flatMap((s) => s.rows.map((x) => [s.testTitle, x.group, x.label, x.value, x.expected, res(x.result)])),
    ]);
    ws['!cols'] = [{ wch: 34 }, { wch: 22 }, { wch: 40 }, { wch: 26 }, { wch: 38 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws, sheetName(`${it.id} ${it.short}`));
  }

  const raw: (string | number)[][] = [['Hạng mục', 'Phép thử', 'Khóa', 'Giá trị']];
  for (const [k, v] of d.values) {
    const [itemId, testId] = k.split('|');
    for (const [key, value] of Object.entries(v)) raw.push([itemId, testId, key, value]);
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(raw), 'Số liệu thô');

  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

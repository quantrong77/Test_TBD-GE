import * as XLSX from 'xlsx';
import { buildReport } from './report';
import { items } from '../content';
import type { SessionData } from '../views/Session';

const sheetName = (s: string) => s.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31);

export async function buildXlsx(d: SessionData): Promise<Blob> {
  const r = await buildReport(d);
  const wb = XLSX.utils.book_new();
  const res = (x: string) => (x === 'na' ? '' : r.resText(x as never).replace(/^[^\p{L}]+/u, ''));

  const info = XLSX.utils.aoa_to_sheet([
    ['BIÊN BẢN THÍ NGHIỆM NHẤT THỨ GIÀN TỤ BÙ DỌC GE'],
    [],
    ...r.info,
    [],
    ['Máy thí nghiệm', 'Số serial', 'Hạn kiểm định'],
    ...r.instruments,
    [],
    ['Cổng an toàn', 'Người xác nhận', 'Thời điểm'],
    ...r.gates,
    [],
    ['Đạt', 'Cảnh báo', 'Không đạt'],
    [r.summary.pass, r.summary.warn, r.summary.fail],
    [],
    ['Kết luận, kiến nghị', r.s.conclusion ?? ''],
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

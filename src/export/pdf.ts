import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import { buildReport, blobToDataUrl } from './report';
import { db } from '../store/db';
import { fmtDate } from '../ui';
import { getItem } from '../content';
import type { SessionData } from '../views/Session';

const FONT = 'BVP';

async function loadFont(doc: jsPDF) {
  // font Be Vietnam Pro đã được service worker cache (public/fonts)
  for (const [file, style] of [
    ['BeVietnamPro-Regular.ttf', 'normal'],
    ['BeVietnamPro-Bold.ttf', 'bold'],
  ] as const) {
    const buf = await (await fetch(`fonts/${file}`)).arrayBuffer();
    let bin = '';
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    doc.addFileToVFS(file, btoa(bin));
    doc.addFont(file, FONT, style);
  }
  doc.setFont(FONT, 'normal');
}

type Doc = jsPDF & { lastAutoTable?: { finalY: number } };

// Be Vietnam Pro không có glyph Hy Lạp, ∑, →, √ – thay bằng chữ đọc được
const GLYPH: [RegExp, string][] = [
  [/∑/g, '(tổng)'],
  [/Δ/g, 'Delta '],
  [/δ/g, 'delta'],
  [/σ/g, 'sigma'],
  [/Ω/g, 'Ohm'],
  [/ω/g, 'omega'],
  [/→/g, '->'],
  [/√/g, 'sqrt'],
];
export const pdfText = (s: unknown) => GLYPH.reduce((t, [re, r]) => t.replace(re, r), String(s ?? '')).replace(/Delta (?=[×\s)]|$)/g, 'Delta');

export async function buildPdf(d: SessionData): Promise<Blob> {
  const r = await buildReport(d);
  const doc = new jsPDF({ unit: 'mm', format: 'a4' }) as Doc;
  await loadFont(doc);
  const clean = (rows: unknown[][]) => rows.map((row) => row.map(pdfText));
  const rawText = doc.text.bind(doc);
  doc.text = ((txt: string | string[], ...rest: unknown[]) =>
    (rawText as (...a: unknown[]) => jsPDF)(Array.isArray(txt) ? txt.map(pdfText) : pdfText(txt), ...rest)) as typeof doc.text;
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 14;
  const base = { styles: { font: FONT, fontSize: 9, cellPadding: 1.6 }, headStyles: { font: FONT, fontStyle: 'bold' as const, fillColor: [11, 79, 138] as [number, number, number] }, margin: { left: M, right: M } };
  const y = () => (doc.lastAutoTable?.finalY ?? 20) + 6;
  const ensure = (need: number, at: number) => {
    if (at + need > H - 16) {
      doc.addPage();
      return 18;
    }
    return at;
  };

  doc.setFont(FONT, 'bold').setFontSize(14);
  doc.text('BIÊN BẢN THÍ NGHIỆM NHẤT THỨ', W / 2, 16, { align: 'center' });
  doc.text('GIÀN TỤ BÙ DỌC 500 kV – HÃNG GE', W / 2, 23, { align: 'center' });
  doc.setFont(FONT, 'normal').setFontSize(10);
  doc.text(`${r.p.bank} – ${r.p.station} · Ngày ${fmtDate(r.s.date)}`, W / 2, 30, { align: 'center' });

  autoTable(doc, { ...base, startY: 36, head: [['Thông tin', '']], body: clean(r.info), columnStyles: { 0: { cellWidth: 55, fontStyle: 'bold' } } });
  if (r.instruments.length) autoTable(doc, { ...base, startY: y(), head: [['Máy thí nghiệm', 'Số serial', 'Hạn kiểm định']], body: clean(r.instruments) });
  if (r.gates.length) autoTable(doc, { ...base, startY: y(), head: [['Cổng an toàn', 'Người xác nhận', 'Thời điểm', 'Ghi chú']], body: clean(r.gates) });

  let lastItem = '';
  for (const sec of r.sections) {
    let at = ensure(20, y());
    if (sec.itemId !== lastItem) {
      doc.setFont(FONT, 'bold').setFontSize(11).text(sec.itemTitle, M, at);
      at += 6;
      lastItem = sec.itemId;
    }
    doc.setFont(FONT, 'bold').setFontSize(10).text(sec.testTitle, M, at);
    autoTable(doc, {
      ...base,
      startY: at + 2,
      head: [['Nhóm', 'Nội dung', 'Giá trị', 'Yêu cầu', 'Kết quả']],
      body: clean(sec.rows.map((x) => [x.group, x.label, x.value, x.expected, x.result === 'na' ? '' : r.resText(x.result).replace(/^[^\p{L}]+/u, '')])),
      columnStyles: { 0: { cellWidth: 26 }, 4: { cellWidth: 22 } },
      didParseCell: (c) => {
        if (c.section === 'body' && c.column.index === 4) {
          const v = String(c.cell.raw);
          if (v.startsWith('Không')) c.cell.styles.textColor = [198, 40, 40];
          else if (v.startsWith('Cảnh')) c.cell.styles.textColor = [180, 110, 0];
          else if (v.startsWith('Đạt')) c.cell.styles.textColor = [46, 125, 50];
        }
      },
    });
  }

  let at = ensure(40, y());
  doc.setFont(FONT, 'bold').setFontSize(11).text('TỔNG KẾT', M, at);
  autoTable(doc, { ...base, startY: at + 2, head: [['Đạt', 'Cảnh báo', 'Không đạt']], body: [[r.summary.pass, r.summary.warn, r.summary.fail]] });
  if (r.s.conclusion) {
    // bảng tự sang trang khi kết luận dài
    autoTable(doc, { ...base, startY: y(), head: [['Kết luận, kiến nghị']], body: [[pdfText(r.s.conclusion)]], styles: { ...base.styles, fontSize: 10 } });
  }

  // Ảnh hiện trường
  const photos = await db.photos.where('sessionId').equals(r.s.id).sortBy('ts');
  if (photos.length) {
    doc.addPage();
    doc.setFont(FONT, 'bold').setFontSize(11).text('ẢNH HIỆN TRƯỜNG', M, 18);
    const cw = (W - 2 * M - 6) / 2;
    let px = M;
    let py = 24;
    for (const ph of photos) {
      const url = await blobToDataUrl(ph.blob);
      const props = doc.getImageProperties(url);
      const h = Math.min(cw * (props.height / props.width), 80);
      const w = h * (props.width / props.height);
      if (py + h + 10 > H - 16) {
        doc.addPage();
        py = 18;
        px = M;
      }
      doc.addImage(url, 'JPEG', px, py, w, h);
      doc.setFont(FONT, 'normal').setFontSize(8).text(`${getItem(ph.itemId)?.id ?? ph.itemId} – ${ph.caption}`.slice(0, 80), px, py + h + 4);
      if (px === M) px = M + cw + 6;
      else {
        px = M;
        py += 90;
      }
    }
  }

  // Chữ ký
  doc.addPage();
  doc.setFont(FONT, 'bold').setFontSize(10);
  const cols = ['CHỈ HUY TRỰC TIẾP', 'NGƯỜI THÍ NGHIỆM', 'ĐẠI DIỆN ĐƠN VỊ QLVH'];
  cols.forEach((c, i) => doc.text(c, M + ((W - 2 * M) / 3) * (i + 0.5), 30, { align: 'center' }));
  doc.setFont(FONT, 'normal').setFontSize(9);
  doc.text(r.s.leader, M + (W - 2 * M) / 6, 60, { align: 'center' });

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont(FONT, 'normal').setFontSize(7).setTextColor(110);
    doc.text(`TBD-GE Field · nội dung v${r.contentVersion} · App chỉ dùng tham khảo, không thay thế quy trình đã phê duyệt`, M, H - 8);
    doc.text(`Trang ${i}/${pages}`, W - M, H - 8, { align: 'right' });
    doc.setTextColor(0);
  }
  return doc.output('blob');
}

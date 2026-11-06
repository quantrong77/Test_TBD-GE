/**
 * Bộ biểu tượng kỹ thuật vector chuẩn chuyên ngành điện & thí nghiệm điện cao thế.
 * Định dạng SVG kế thừa màu theo CSS currentColor (tự thích ứng hoàn hảo với mọi theme).
 */
export const Icons = {
  /** Cột điện cao thế 500 kV / Trạm biến áp (dùng cho Trang chủ) */
  tower: `<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="svg-ico"><path d="M4 22L10 3h4l6 19"/><path d="M12 3v19"/><path d="M2 8h20"/><path d="M6 8l4 5"/><path d="M18 8l-4 5"/><path d="M1 13h22"/><path d="M7 13l5 4.5 5-4.5"/><path d="M5 18h14"/></svg>`,

  /** Phiếu thí nghiệm / Biên bản kỹ thuật điện (dùng cho Phiên TN) */
  report: `<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="svg-ico"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><path d="M13 10.5l-2.5 3h3l-1.5 4" stroke-width="1.5"/><path d="M8 12h1"/><path d="M8 16h1"/></svg>`,

  /** Giàn tụ bù dọc / Ký hiệu tụ điện cao thế chuẩn IEC —||— (dùng cho Hạng mục) */
  capacitor: `<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svg-ico"><path d="M2 12h7"/><path d="M15 12h7"/><path d="M9 5v14"/><path d="M15 5v14"/><path d="M6 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" stroke-width="1" stroke-dasharray="2 2" opacity="0.45"/></svg>`,

  /** Đồng hồ đo chỉ thị kim / Vạch ngưỡng định mức (dùng cho Ngưỡng) */
  gauge: `<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="svg-ico"><path d="M3.5 15.5A9 9 0 1 1 20.5 15.5"/><circle cx="12" cy="14" r="2" fill="currentColor"/><path d="M12 14l4-5" stroke-width="2.2"/><path d="M12 5v2"/><path d="M6.5 7.5l1.4 1.4"/><path d="M17.5 7.5l-1.4 1.4" stroke-width="2.5"/></svg>`,

  /** Kính lúp tra cứu kỹ thuật */
  search: `<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svg-ico"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></svg>`,

  /** Sơ đồ nhất thứ / Sơ đồ nguyên lý mạch Platform Circuit (Tổng quan) */
  diagram: `<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="svg-ico"><path d="M3 5h18" stroke-width="2.4"/><path d="M7 5v5"/><path d="M17 5v5"/><rect x="5" y="10" width="4" height="6" rx="1"/><rect x="15" y="10" width="4" height="6" rx="1"/><path d="M7 16v3"/><path d="M17 16v3"/><path d="M3 19h18" stroke-width="2.4"/></svg>`,

  /** Ampe kìm đo dòng rò mất cân bằng (Dụng cụ thí nghiệm) */
  clamp: `<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="svg-ico"><path d="M8 8a4 4 0 1 1 8 0"/><path d="M7 8V4.5a5 5 0 0 1 10 0V8"/><rect x="7" y="8" width="10" height="13" rx="2"/><rect x="9.5" y="10.5" width="5" height="3" rx="0.5" fill="currentColor" opacity="0.3"/><circle cx="12" cy="17" r="1.5"/></svg>`,

  /** Máy thí nghiệm chuyên dùng VAP Tester / Nguồn cao áp GAMMA (Máy TN) */
  testSet: `<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="svg-ico"><path d="M9 3h6v2H9z"/><rect x="3" y="5" width="18" height="16" rx="2"/><rect x="5.5" y="8" width="6" height="4" rx="0.5" fill="currentColor" opacity="0.3"/><circle cx="16" cy="10" r="1.5" fill="currentColor"/><circle cx="8.5" cy="16.5" r="2"/><circle cx="15.5" cy="16.5" r="1.5"/></svg>`,

  /** Thư mục hồ sơ giàn tụ / Dữ liệu trạm */
  folder: `<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="svg-ico"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>`,

  /** Máy tính cầm tay / Bỏ túi (tính toán điện dung và mất cân bằng ΔC) */
  calculator: `<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="svg-ico"><rect x="4" y="2" width="16" height="20" rx="2"/><rect x="7" y="4.5" width="10" height="3.5" rx="0.5" fill="currentColor" opacity="0.25"/><line x1="8" x2="16" y1="6.2" y2="6.2" stroke-width="1.2"/><path d="M8 11h.01"/><path d="M12 11h.01"/><path d="M16 11h.01"/><path d="M8 14.5h.01"/><path d="M12 14.5h.01"/><line x1="16" y1="14.5" x2="16" y2="18" stroke-width="2"/><path d="M8 18h.01"/><path d="M12 18h.01"/></svg>`,

  /** Chu kỳ kiểm định định kỳ thiết bị điện EVN (Chu kỳ) */
  cycle: `<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="svg-ico"><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M12 7v5l3 2"/></svg>`,

  /** Máy tính chuyên dụng tính toán điện dung và mất cân bằng ΔC (alias) */
  calc: `<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="svg-ico"><rect x="4" y="2" width="16" height="20" rx="2"/><rect x="7" y="4.5" width="10" height="3.5" rx="0.5" fill="currentColor" opacity="0.25"/><line x1="8" x2="16" y1="6.2" y2="6.2" stroke-width="1.2"/><path d="M8 11h.01"/><path d="M12 11h.01"/><path d="M16 11h.01"/><path d="M8 14.5h.01"/><path d="M12 14.5h.01"/><line x1="16" y1="14.5" x2="16" y2="18" stroke-width="2"/><path d="M8 18h.01"/><path d="M12 18h.01"/></svg>`,

  /** Cảnh báo an toàn điện cao áp nguy hiểm */
  hvDanger: `<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="svg-ico"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 8.5l-1.5 4h3l-1.5 4.5 3.5-5.5h-3l1.5-3z" fill="currentColor" stroke="none"/></svg>`,

  /** Sổ tay quy trình kỹ thuật / Hướng dẫn sử dụng */
  manual: `<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="svg-ico"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/><path d="M8 7h7"/><path d="M8 11h5"/></svg>`,

  /** Thông tin trạm / Đơn vị quản lý vận hành */
  info: `<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="svg-ico"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8" stroke-width="2.5"/></svg>`,

  /** Cài đặt thông số kỹ thuật */
  settings: `<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="svg-ico"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,

  /** Đồ thị phân tích xu hướng qua các năm (Trend Analytics) */
  chart: `<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="svg-ico"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="3" y1="20" x2="21" y2="20"/><path d="M4 12l5-5 4 4 7-7" stroke-width="2"/></svg>`,

  /** Quét nhận diện số đo OCR từ đồng hồ thí nghiệm */
  ocr: `<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="svg-ico"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/><path d="M9 13h6"/><path d="M12 10v6"/></svg>`,
};


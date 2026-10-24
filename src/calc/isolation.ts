/** Mốc cô lập nhập tay quá 12 giờ không được dùng (khớp hạn hiệu lực cổng an toàn). */
export const ISOLATION_MAX_AGE_MS = 12 * 3600 * 1000;

export type IsolationParse = { ok: true; at: number; agoMin: number } | { ok: false; error: string };

/**
 * Đổi giờ cô lập "HH:MM" (theo phiếu công tác / nhật ký vận hành) thành timestamp.
 * Giờ lớn hơn hiện tại được hiểu là của hôm trước (cô lập qua nửa đêm).
 */
export function parseIsolationTime(hhmm: string, now: number = Date.now()): IsolationParse {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(hhmm.trim());
  if (!m) return { ok: false, error: 'Nhập giờ dạng HH:MM' };
  const d = new Date(now);
  d.setHours(Number(m[1]), Number(m[2]), 0, 0);
  let at = d.getTime();
  if (at > now) at -= 24 * 3600 * 1000;
  if (now - at > ISOLATION_MAX_AGE_MS) return { ok: false, error: 'Giờ cô lập cách đây quá 12 giờ – kiểm tra lại giờ hoặc đếm mới' };
  return { ok: true, at, agoMin: Math.floor((now - at) / 60000) };
}

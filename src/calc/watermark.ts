/**
 * Module đóng dấu Watermark kỹ thuật lên ảnh hiện trường.
 * Tiêu chuẩn: EVNNPT / PTC3 - TBD-GE Field
 * Tự động ghi: Trạm, Giàn tụ, Pha, Hạng mục TN, Tọa độ GPS, Thời gian thực.
 */

export interface WatermarkMeta {
  station?: string;
  bank?: string;
  phase?: string;
  itemTitle?: string;
  timestamp?: string;
  gps?: string;
  note?: string;
}

export function formatWatermarkLines(meta: WatermarkMeta): {
  headline: string;
  subtitle: string;
  timeText: string;
  locText: string;
  brandText: string;
} {
  const station = meta.station?.trim() || 'Trạm 500 kV';
  const bank = meta.bank?.trim() || 'TBD-GE';
  const phase = meta.phase ? ` · Pha ${meta.phase}` : '';
  const headline = `⚡ ${station} · ${bank}${phase}`;

  const subtitle = meta.itemTitle ? `📋 ${meta.itemTitle}` : '📋 Biên bản thí nghiệm hiện trường';
  const timeText = meta.timestamp || new Date().toLocaleString('vi-VN');
  const locText = meta.gps ? `📍 ${meta.gps}` : '📍 EVNNPT · PTC3';
  const brandText = 'TBD-GE Field · EVNNPT PTC3';

  return { headline, subtitle, timeText, locText, brandText };
}

/** Lấy tọa độ GPS thiết bị với timeout an toàn */
export async function getGpsCoordinates(timeoutMs = 2500): Promise<string> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return 'EVNNPT · PTC3 · TBD-GE';
  }

  return new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => {
      if (!done) {
        done = true;
        resolve('EVNNPT · PTC3 · TBD-GE');
      }
    }, timeoutMs);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        const latStr = `${Math.abs(lat).toFixed(5)}° ${lat >= 0 ? 'N' : 'S'}`;
        const lonStr = `${Math.abs(lon).toFixed(5)}° ${lon >= 0 ? 'E' : 'W'}`;
        const acc = pos.coords.accuracy ? ` (±${Math.round(pos.coords.accuracy)}m)` : '';
        resolve(`${latStr}, ${lonStr}${acc}`);
      },
      () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve('EVNNPT · PTC3 · TBD-GE');
      },
      { timeout: timeoutMs, enableHighAccuracy: true, maximumAge: 60000 },
    );
  });
}

/** Vẽ dải đóng dấu kỹ thuật lên Canvas */
export function drawWatermarkBanner(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  meta: WatermarkMeta,
): void {
  const lines = formatWatermarkLines(meta);
  const isNarrow = width < 680;
  const barH = isNarrow
    ? Math.max(90, Math.min(180, Math.round(height * 0.16)))
    : Math.max(72, Math.min(140, Math.round(height * 0.11)));
  const topY = height - barH;

  ctx.save();

  // Nền bán trong suốt tối màu
  ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
  ctx.fillRect(0, topY, width, barH);

  // Đường viền chỉ tiêu kỹ thuật EVN màu cam & xanh cyan
  const grad = ctx.createLinearGradient(0, topY, width, topY);
  grad.addColorStop(0, '#f59e0b'); // EVN amber
  grad.addColorStop(0.5, '#38bdf8'); // Sky cyan
  grad.addColorStop(1, '#10b981'); // Green ok
  ctx.fillStyle = grad;
  ctx.fillRect(0, topY, width, Math.max(3, Math.round(height * 0.003)));

  // Cấu hình font chữ
  const baseSize = isNarrow
    ? Math.max(11, Math.min(18, Math.round(width / 36)))
    : Math.max(13, Math.min(22, Math.round(width / 52)));
  const pad = Math.max(10, Math.round(width * 0.02));

  ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetX = 1;
  ctx.shadowOffsetY = 1;

  if (isNarrow) {
    // Bố cục hẹp: xếp tầng dọc
    const lineSpacing = baseSize * 1.35;
    let currY = topY + pad + baseSize;

    ctx.font = `bold ${baseSize + 1}px sans-serif`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(lines.headline, pad, currY);

    currY += lineSpacing;
    ctx.font = `${baseSize}px sans-serif`;
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText(lines.subtitle, pad, currY);

    currY += lineSpacing;
    ctx.font = `${baseSize - 1}px sans-serif`;
    ctx.fillStyle = '#fbbf24';
    ctx.fillText(`🕒 ${lines.timeText}`, pad, currY);

    currY += lineSpacing;
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(lines.locText, pad, currY);
  } else {
    // Bố cục rộng: 2 cột trái - phải
    const col2X = Math.round(width * 0.58);
    const lineSpacing = baseSize * 1.45;
    const y1 = topY + pad + baseSize;
    const y2 = y1 + lineSpacing;

    // Cột trái: Trạm, Giàn, Pha, Hạng mục
    ctx.font = `bold ${baseSize + 2}px sans-serif`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(lines.headline, pad, y1);

    ctx.font = `${baseSize}px sans-serif`;
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText(lines.subtitle, pad, y2);

    // Cột phải: Thời gian, GPS, Đơn vị
    ctx.font = `${baseSize}px sans-serif`;
    ctx.fillStyle = '#fbbf24';
    ctx.fillText(`🕒 ${lines.timeText}`, col2X, y1);

    ctx.font = `${baseSize - 1}px sans-serif`;
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(lines.locText, col2X, y2);
  }

  ctx.restore();
}

/** Nén ảnh và áp dụng Watermark kỹ thuật */
export async function compressWithWatermark(
  file: File,
  meta?: WatermarkMeta,
  max = 1600,
): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('Không thể khởi tạo Canvas 2D');

  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();

  if (meta) {
    drawWatermarkBanner(ctx, c.width, c.height, meta);
  }

  return new Promise((res, rej) =>
    c.toBlob((b) => (b ? res(b) : rej(new Error('toBlob failed'))), 'image/jpeg', 0.85),
  );
}

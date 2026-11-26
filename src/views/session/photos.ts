// Ảnh hiện trường của một hạng mục trong phiên (đóng dấu kỹ thuật + GPS, xem phóng to).
import { db, storageWarning } from '../../store/db';
import { esc, toast, uid } from '../../ui';
import { bindViewer } from '../../components/ImageViewer';
import { compressWithWatermark, getGpsCoordinates, type WatermarkMeta } from '../../calc/watermark';

// ---------- Ảnh hiện trường ----------
const urls: string[] = [];
window.addEventListener('route:leave', () => urls.splice(0).forEach((u) => URL.revokeObjectURL(u)));

export interface PhotoMetaContext {
  station?: string;
  bank?: string;
  phase?: string;
  itemTitle?: string;
}

export async function photosBlock(
  root: HTMLElement,
  sessionId: string,
  itemId: string,
  readOnly: boolean,
  metaContext?: PhotoMetaContext,
) {
  const box = root.querySelector<HTMLElement>('[data-photos]')!;
  const draw = async () => {
    const list = await db.photos.where('[sessionId+itemId]').equals([sessionId, itemId]).toArray();
    box.innerHTML = `<div class="thumbs" data-gallery="photos">${list
      .map((p) => {
        const u = URL.createObjectURL(p.blob);
        urls.push(u);
        return `<figure><a href="${u}" data-pswp-width="1600" data-pswp-height="1200" data-caption="${esc(p.caption)}"><img src="${u}" alt="${esc(p.caption)}"></a><figcaption>${esc(p.caption)} ${readOnly ? '' : `<button class="icon-btn photo-del" type="button" data-del="${esc(p.id)}" aria-label="Xóa ảnh">🗑</button>`}</figcaption></figure>`;
      })
      .join('')}</div>
      ${readOnly ? '' : '<label class="btn secondary block mt-12">📷 Chụp / chọn ảnh (Tự động đóng dấu Watermark kỹ thuật)<input type="file" accept="image/*" capture="environment" multiple hidden data-file></label>'}`;
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
      if (!files.length) return;
      toast('Đang xử lý ảnh & đóng dấu tọa độ GPS...');
      const gps = await getGpsCoordinates(2000);
      for (const f of files) {
        try {
          const watermarkMeta: WatermarkMeta = {
            station: metaContext?.station,
            bank: metaContext?.bank,
            phase: metaContext?.phase,
            itemTitle: metaContext?.itemTitle || `Hạng mục ${itemId.slice(2)}`,
            timestamp: new Date().toLocaleString('vi-VN'),
            gps,
          };
          const blob = await compressWithWatermark(f, watermarkMeta);
          const defaultCap = `${metaContext?.phase ? `Pha ${metaContext.phase} · ` : ''}${itemId.slice(2)} – ${new Date().toLocaleTimeString('vi-VN')}`;
          const caption = prompt('Chú thích ảnh (đã đóng dấu kỹ thuật):', defaultCap) ?? '';
          await db.photos.add({ id: uid(), sessionId, itemId, blob, caption, ts: Date.now() });
        } catch (err) {
          console.error(err);
          toast('Không xử lý được ảnh ' + f.name);
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

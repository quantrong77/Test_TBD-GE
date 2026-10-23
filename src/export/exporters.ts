import { download, fileBase } from './report';
import { toast } from '../ui';
import type { SessionData } from '../views/Session';

export async function exportSession(d: SessionData, kind: 'pdf' | 'xlsx' | 'json' | 'share') {
  const name = fileBase(d);
  if (kind === 'pdf' || kind === 'share') {
    toast('Đang tạo PDF…');
    const { buildPdf } = await import('./pdf');
    const blob = await buildPdf(d);
    if (kind === 'share') {
      const file = new File([blob], `${name}.pdf`, { type: 'application/pdf' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: name }).catch(() => undefined);
        return;
      }
      toast('Thiết bị không hỗ trợ chia sẻ file – đã tải xuống');
    }
    download(blob, `${name}.pdf`);
    return;
  }
  if (kind === 'xlsx') {
    const { buildXlsx } = await import('./xlsx');
    download(await buildXlsx(d), `${name}.xlsx`);
    return;
  }
  const { sessionJson } = await import('./json');
  download(new Blob([JSON.stringify(await sessionJson(d.session.id), null, 1)], { type: 'application/json' }), `${name}.json`);
}

import helpJson from '../../content/help.json';
import { CONTENT_VERSION, safety } from '../content';
import { setTop } from '../components/Chrome';
import { callout, esc, rich } from '../ui';
import type { View } from '../router';

export interface HelpSection {
  id: string;
  title: string;
  steps?: string[];
  points?: string[];
}
export const help = helpJson as HelpSection[];

export const DEVELOPER = {
  name: 'Hoàng Trọng',
  org: 'PTC',
  phone: '0909813284',
  email: 'quantrong77@gmail.com',
};

const fmtPhone = (p: string) => p.replace(/^(\d{4})(\d{3})(\d{3})$/, '$1 $2 $3');

export const Help: View = (r, el) => {
  setTop('Hướng dẫn sử dụng', { back: true });
  el.innerHTML = `
    <p class="small muted">Chạm vào từng mục để mở. Nội dung này cũng tìm được ở tab Tìm.</p>
    ${help
      .map(
        (s, i) => `<details class="card" id="help-${esc(s.id)}"${i === 0 ? ' open' : ''}>
          <summary>${esc(s.title)}</summary>
          ${s.steps ? `<ol class="clean">${s.steps.map((x) => `<li>${rich(x)}</li>`).join('')}</ol>` : ''}
          ${s.points ? `<ul class="clean">${s.points.map((x) => `<li>${rich(x)}</li>`).join('')}</ul>` : ''}
        </details>`,
      )
      .join('')}
    ${callout({ level: 'warn', text: safety.disclaimer })}`;
  // mở đúng mục khi đi từ kết quả tìm kiếm (#/help?s=session)
  const s = r.query.get('s');
  const target = s ? el.querySelector<HTMLDetailsElement>(`#help-${CSS.escape(s)}`) : null;
  if (target) {
    el.querySelectorAll('details').forEach((d) => (d.open = d === target));
    requestAnimationFrame(() => target.scrollIntoView());
  }
};

export const Info: View = (_r, el) => {
  setTop('Giới thiệu', { back: true });
  el.innerHTML = `
    <div class="about-head">
      <img src="icons/icon-192.png" alt="" width="72" height="72">
      <div><h1>Sổ tay TN Tụ bù dọc GE</h1>
      <p class="muted">Phiên bản ${esc(__APP_VERSION__)} · nội dung v${esc(CONTENT_VERSION)} · cập nhật ${esc(__BUILD_DATE__)}</p></div>
    </div>
    <p>App giúp đội thí nghiệm tra cứu nhanh và ghi kết quả ngay tại hiện trường khi thí nghiệm nhất thứ <b>giàn tụ bù dọc 500 kV hãng GE</b>: 7 hạng mục từ hệ thống tụ tới bơm dòng nhất thứ, cổng an toàn bắt buộc, máy tính mất cân bằng điện dung, xuất biên bản PDF/Excel. Dùng được khi không có sóng.</p>

    <h2>Người phát triển</h2>
    <div class="card dev-card">
      <b>${esc(DEVELOPER.name)}</b><span class="muted">${esc(DEVELOPER.org)}</span>
      <div class="btn-row">
        <a class="btn" href="tel:${esc(DEVELOPER.phone)}">📞 ${esc(fmtPhone(DEVELOPER.phone))}</a>
        <a class="btn secondary" href="mailto:${esc(DEVELOPER.email)}?subject=${encodeURIComponent('Góp ý app Sổ tay TN Tụ bù dọc GE v' + __APP_VERSION__)}">✉️ ${esc(DEVELOPER.email)}</a>
      </div>
      <p class="small muted">Góp ý nội dung, báo lỗi: ghi rõ màn hình, thao tác và phiên bản ở trên.</p>
    </div>

    <h2>Nguồn nội dung</h2>
    <ul class="clean">
      <li>Bài giảng "Thí nghiệm các thiết bị trên sàn tụ GE"</li>
      <li>HDSD máy thí nghiệm VAP GE 31F246 (GEK-32329B)</li>
      <li>Quy trình sử dụng bộ nguồn cao thế GAMMA RR10-6R/220/M851 (QT-TNLĐ-VHMTN)</li>
      <li>QĐ 1901/QĐ-EVNNPT về khối lượng, chu kỳ thí nghiệm</li>
    </ul>
    <p><a href="#/about">Các điểm cần rà soát lại nội dung nguồn</a></p>

    ${callout({ level: 'warn', text: safety.disclaimer })}
    ${callout({ level: 'info', text: 'Hình ảnh, sơ đồ có nguồn từ tài liệu kỹ thuật GE và tài liệu đào tạo nội bộ, chỉ dùng cho mục đích đào tạo và công tác.' })}`;
};

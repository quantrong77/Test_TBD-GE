import { setTop } from '../components/Chrome';
import { db } from '../store/db';
import { esc, resBadge, toast } from '../ui';
import { params, type View } from '../router';
import type { Profile } from '../types';
import { can } from '../auth/roles';
import { fmt, parseNum } from '../calc/units';
import {
  METRIC_DEFS,
  METRIC_SOURCE,
  SESSION_TYPE_LABEL,
  type TrendHistoryRecord,
  type TrendMetricKey,
  type TrendSessionType,
  analyzeTrendSeries,
  extractTrendFromSessions,
  historyToPoints,
  mergeTrendPoints,
  renderTrendSvg,
  validateHistoryInput,
} from '../calc/trend';

const METRIC_TABS: [TrendMetricKey, string][] = [
  ['unbalance', '1. %ΔC Mất C/B'],
  ['mov_rcd', '2. MOV Rcd'],
  ['reactor_rdc', '3. Kháng Rdc'],
  ['bushing_c1', '4. Sứ C1'],
  ['bushing_tan', '4. Sứ tan δ'],
];

const showNum = (x: number | null | undefined) => (x === null || x === undefined ? '—' : fmt(x));
const signed = (x: number) => (x > 0 ? '+' : '') + fmt(x);
const uid = () => `hist-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const TrendView: View = async (_r, el) => {
  const [profiles, sessions, measurements] = await Promise.all([db.profiles.toArray(), db.sessions.toArray(), db.measurements.toArray()]);

  if (!profiles.length) {
    setTop('Phân tích xu hướng', { back: '#/sessions' });
    el.innerHTML = '<p>Chưa có hồ sơ giàn. <a href="#/profiles">Tạo hồ sơ giàn</a> trước khi xem xu hướng.</p>';
    return;
  }

  const urlProfileId = params().profileId;
  let activeProfile: Profile = profiles.find((p) => p.id === urlProfileId) ?? profiles[0];
  let selectedMetric: TrendMetricKey = 'unbalance';
  const editable = can('profile.edit');

  const setTitle = () => setTop('Phân tích xu hướng', { back: '#/sessions', sub: `${activeProfile.bank} – ${activeProfile.station}` });
  setTitle();

  const renderContent = async () => {
    const metric = METRIC_DEFS[selectedMetric];
    const src = METRIC_SOURCE[selectedMetric];
    const history = await db.trendHistory.where('[profileId+metric]').equals([activeProfile.id, selectedMetric]).toArray();

    // Chỉ số liệu thật: phiên TN của giàn + mốc lịch sử nhập tay. Không có dữ liệu mẫu.
    const sessionPoints = extractTrendFromSessions(sessions, measurements, selectedMetric, activeProfile);
    const manualPoints = historyToPoints(history, activeProfile.id, selectedMetric);
    const points = mergeTrendPoints(sessionPoints, manualPoints);
    const analysis = analyzeTrendSeries(points, metric, activeProfile);
    const hasUncorrected = points.some((p) => p.uncorrected);

    const chart = points.length
      ? renderTrendSvg(points, metric, activeProfile)
      : `<div class="card" style="text-align:center; padding:24px 12px;">
          <p style="margin:0 0 6px;"><b>Chưa có số liệu ${esc(metric.shortTitle)} cho giàn này</b></p>
          <p class="small muted" style="margin:0;">Đồ thị tự vẽ khi có số liệu:<br>
          • Nhập kết quả mục ${esc(metric.itemCode)} trong một <a href="#/sessions">phiên thí nghiệm</a> của giàn ${esc(activeProfile.bank)}, hoặc<br>
          • Thêm mốc lịch sử từ biên bản giấy các năm trước (nút bên dưới).<br>
          Từ 2 đợt trở lên app tự tính tốc độ biến thiên và dự báo.</p>
        </div>`;

    el.innerHTML = `
      <div class="card" style="margin-bottom: 12px;">
        <label class="field" style="margin:0;">
          <span style="font-weight:600">Chọn Hồ sơ Giàn tụ:</span>
          <select id="trend-prof-sel">
            ${profiles.map((p) => `<option value="${esc(p.id)}"${p.id === activeProfile.id ? ' selected' : ''}>${esc(p.bank)} – ${esc(p.station)}</option>`).join('')}
          </select>
        </label>
        <div class="seg" role="group" aria-label="Thông số theo dõi" style="display:grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap:4px; margin-top:8px;">
          ${METRIC_TABS.map(([k, l]) => `<button type="button" data-met="${k}" aria-pressed="${selectedMetric === k}">${esc(l)}</button>`).join('')}
        </div>
      </div>

      <div style="margin-bottom: 14px;">${chart}</div>
      ${hasUncorrected ? '<p class="small muted" style="margin:-6px 0 12px;">⚠️ Có đợt thiếu nhiệt độ môi trường nên giá trị chưa được quy đổi nhiệt độ – so sánh giữa các đợt có thể chưa chính xác.</p>' : ''}

      ${
        points.length
          ? `<div class="card" style="margin-bottom: 14px; border-left: 4px solid ${analysis.verdict === 'fail' ? '#ef4444' : analysis.verdict === 'warn' ? '#f59e0b' : analysis.verdict === 'pass' ? '#10b981' : '#64748b'};">
        <div class="row" style="margin-bottom: 6px;">
          <b>Chẩn đoán trạng thái & Xu hướng</b>
          ${resBadge(analysis.verdict, analysis.verdictText)}
        </div>
        <p class="small" style="margin: 4px 0 8px;">${esc(metric.description)}</p>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 8px; margin: 10px 0; background: rgba(0,0,0,0.15); padding: 8px; border-radius: 6px;">
          <div>
            <div class="small muted">Số đợt có số liệu:</div>
            <b style="font-size: 15px;">${analysis.pointCount}</b>
          </div>
          <div>
            <div class="small muted">Tốc độ biến thiên:</div>
            <b style="font-size: 15px;">${analysis.annualDriftRate !== null ? `${signed(analysis.annualDriftRate)} ${esc(metric.unit)}/năm` : '— (cần ≥ 2 đợt)'}</b>
          </div>
          <div>
            <div class="small muted">${esc(analysis.headline.label)}:</div>
            <b style="font-size: 15px;">${analysis.headline.value !== null ? `${analysis.headline.unit === '%' && metric.warningDirection === 'deviation' ? signed(analysis.headline.value) : fmt(analysis.headline.value)} ${esc(analysis.headline.unit)}` : '—'}</b>
          </div>
          ${analysis.projectedAlarmYears ? `<div><div class="small muted">Dự báo chạm ngưỡng:</div><b style="font-size:15px; color:#f59e0b;">~ ${fmt(analysis.projectedAlarmYears)} năm</b></div>` : ''}
        </div>
        <div class="small" style="padding-top: 6px; border-top: 1px solid var(--c-border);">💡 <b>Khuyến nghị:</b> ${esc(analysis.recommendation)}</div>
      </div>`
          : ''
      }

      <div class="card" style="margin-bottom: 14px;">
        <div class="row" style="margin-bottom: 8px;">
          <b>Lịch sử số liệu (${points.length} đợt)</b>
          ${editable ? '<button type="button" class="btn secondary small" id="btn-add-hist">＋ Thêm mốc lịch sử</button>' : ''}
        </div>
        ${
          points.length
            ? `<div class="table-wrap"><table>
          <thead><tr><th>Đợt / Ngày</th><th>Pha A (${esc(metric.unit)})</th><th>Pha B (${esc(metric.unit)})</th><th>Pha C (${esc(metric.unit)})</th><th>Nguồn / Ghi chú</th></tr></thead>
          <tbody>
            ${points
              .map(
                (p) => `<tr>
              <td><b>${esc(p.yearLabel)}</b><br><span class="small muted">${esc(p.date)}</span></td>
              <td style="font-weight:600">${showNum(p.phaseA)}</td>
              <td style="font-weight:600">${showNum(p.phaseB)}</td>
              <td style="font-weight:600">${showNum(p.phaseC)}</td>
              <td class="small">${
                p.source === 'session'
                  ? `<a href="#/session/${esc(p.sessionId!)}/form/${esc(src.itemId)}/${esc(src.testId)}">📋 Phiên TN</a>`
                  : `✎ Nhập tay${editable ? ` <button type="button" class="btn secondary small" data-del-hist="${esc(p.id)}" aria-label="Xóa mốc ${esc(p.yearLabel)}">Xóa</button>` : ''}`
              }${p.note ? `<br>${esc(p.note)}` : ''}</td>
            </tr>`,
              )
              .join('')}
          </tbody></table></div>`
            : '<p class="small muted" style="margin:0;">Chưa có đợt nào.</p>'
        }
      </div>

      ${
        editable
          ? `<div id="hist-modal" class="modal-backdrop" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.75); z-index:9999; align-items:center; justify-content:center; padding:12px;">
        <div class="card" style="max-width:440px; width:100%; max-height:90vh; overflow-y:auto; background:var(--c-surface, #1e293b);">
          <div class="row" style="margin-bottom:8px;">
            <b>＋ Mốc lịch sử – ${esc(metric.shortTitle)}</b>
            <button type="button" class="icon-btn" id="hist-close" aria-label="Đóng">✕</button>
          </div>
          <p class="small muted" style="margin:0 0 10px;">Nhập số liệu từ biên bản giấy của giàn ${esc(activeProfile.bank)}. ${
            selectedMetric === 'mov_rcd' ? 'Giá trị đã quy đổi về 20°C.' : selectedMetric === 'reactor_rdc' ? 'Giá trị đã quy đổi về 75°C.' : ''
          } Để trống pha không có số liệu.</p>
          <form id="hist-form" novalidate>
            <label class="field"><span>Ngày thí nghiệm:</span><input type="date" name="date" required max="${new Date().toISOString().slice(0, 10)}"></label>
            <label class="field"><span>Loại đợt:</span>
              <select name="type">${(Object.keys(SESSION_TYPE_LABEL) as TrendSessionType[]).map((t) => `<option value="${t}"${t === 'periodic' ? ' selected' : ''}>${SESSION_TYPE_LABEL[t]}</option>`).join('')}</select>
            </label>
            <label class="field"><span>Tên đợt (để trống = năm + loại):</span><input type="text" name="label" maxlength="60" placeholder="vd: Định kỳ 2022"></label>
            <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:6px;">
              ${(['A', 'B', 'C'] as const).map((ph) => `<label class="field"><span>Pha ${ph}:</span><input type="text" inputmode="decimal" name="phase${ph}"></label>`).join('')}
            </div>
            <label class="field"><span>Ghi chú / số biên bản:</span><input type="text" name="note" maxlength="200"></label>
            <p class="small" data-hist-err style="color:#ef4444; margin:4px 0 0;"></p>
            <div class="btn-row" style="margin-top:12px;">
              <button type="submit" class="btn">Lưu mốc này</button>
              <button type="button" class="btn secondary" id="hist-cancel">Hủy</button>
            </div>
          </form>
        </div>
      </div>`
          : ''
      }
    `;

    el.querySelector('#trend-prof-sel')?.addEventListener('change', (e) => {
      const pid = (e.target as HTMLSelectElement).value;
      activeProfile = profiles.find((p) => p.id === pid) ?? activeProfile;
      setTitle();
      void renderContent();
    });

    el.querySelectorAll<HTMLButtonElement>('[data-met]').forEach((b) =>
      b.addEventListener('click', () => {
        selectedMetric = b.dataset.met as TrendMetricKey;
        void renderContent();
      }),
    );

    el.querySelectorAll<HTMLButtonElement>('[data-del-hist]').forEach((b) =>
      b.addEventListener('click', async () => {
        const rec = history.find((h) => h.id === b.dataset.delHist);
        if (!rec || !confirm(`Xóa mốc lịch sử "${rec.label}" (${rec.date})?`)) return;
        await db.trendHistory.delete(rec.id);
        toast('Đã xóa mốc lịch sử');
        void renderContent();
      }),
    );

    const modal = el.querySelector<HTMLElement>('#hist-modal');
    if (!modal) return;
    const closeModal = () => (modal.style.display = 'none');
    el.querySelector('#btn-add-hist')?.addEventListener('click', () => (modal.style.display = 'flex'));
    el.querySelector('#hist-close')?.addEventListener('click', closeModal);
    el.querySelector('#hist-cancel')?.addEventListener('click', closeModal);

    el.querySelector<HTMLFormElement>('#hist-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target as HTMLFormElement);
      const errEl = el.querySelector<HTMLElement>('[data-hist-err]')!;
      const date = String(fd.get('date') ?? '');
      const type = String(fd.get('type') ?? 'periodic') as TrendSessionType;
      const read = (k: string) => {
        const raw = String(fd.get(k) ?? '').trim();
        return raw === '' ? null : parseNum(raw);
      };
      const values = [read('phaseA'), read('phaseB'), read('phaseC')];
      const err = validateHistoryInput(date, values);
      if (err) {
        errEl.textContent = err;
        return;
      }
      const rec: TrendHistoryRecord = {
        id: uid(),
        profileId: activeProfile.id,
        metric: selectedMetric,
        date,
        label: String(fd.get('label') ?? '').trim() || `${date.slice(0, 4)} (${SESSION_TYPE_LABEL[type]})`,
        sessionType: type,
        phaseA: values[0],
        phaseB: values[1],
        phaseC: values[2],
        note: String(fd.get('note') ?? '').trim() || undefined,
        createdAt: Date.now(),
      };
      await db.trendHistory.add(rec);
      toast('✓ Đã lưu mốc lịch sử');
      closeModal();
      void renderContent();
    });
  };

  await renderContent();
};

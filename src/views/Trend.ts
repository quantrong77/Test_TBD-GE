import { setTop } from '../components/Chrome';
import { db } from '../store/db';
import { esc, resBadge, toast } from '../ui';
import { params, type View } from '../router';
import type { Profile } from '../types';
import {
  METRIC_DEFS,
  type TrendMetricKey,
  type TrendDataPoint,
  extractTrendFromSessions,
  getBenchmarkHistory,
  analyzeTrendSeries,
  renderTrendSvg,
} from '../calc/trend';

const HIST_STORAGE_KEY = 'tbd.trend.custom_history';

function loadCustomHistory(profileId: string): TrendDataPoint[] {
  try {
    const raw = localStorage.getItem(`${HIST_STORAGE_KEY}.${profileId}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveCustomHistory(profileId: string, list: TrendDataPoint[]): void {
  try {
    localStorage.setItem(`${HIST_STORAGE_KEY}.${profileId}`, JSON.stringify(list));
  } catch {
    /* bỏ qua */
  }
}

export const TrendView: View = async (_r, el) => {
  const profiles = await db.profiles.toArray();
  const sessions = await db.sessions.toArray();
  const measurements = await db.measurements.toArray();

  const urlProfileId = params().profileId;
  let activeProfile: Profile =
    profiles.find((p) => p.id === urlProfileId) ??
    profiles.find((p) => p.id === 'TBD503-PLEIKU2') ??
    profiles[0];

  let selectedMetric: TrendMetricKey = 'unbalance';

  setTop('Phân tích xu hướng', {
    back: '#/sessions',
    sub: `${activeProfile.bank} – ${activeProfile.station}`,
  });

  const renderContent = () => {
    const metric = METRIC_DEFS[selectedMetric];

    // Trích xuất từ các phiên thực tế
    const sessionPoints = extractTrendFromSessions(sessions, measurements, selectedMetric, activeProfile);
    const customPoints = loadCustomHistory(activeProfile.id);
    const benchmarkPoints = getBenchmarkHistory(activeProfile.id);

    // Hợp nhất dữ liệu: Ưu tiên phiên thực tế + mốc thủ công, nếu ít hơn 2 mốc thì bổ sung mốc xuất xưởng/lắp đặt
    let points: TrendDataPoint[] = [...sessionPoints, ...customPoints];
    if (points.length < 2) {
      // Bổ sung benchmark để biểu đồ có đường dốc xu hướng tham chiếu
      benchmarkPoints.forEach((bp) => {
        if (!points.some((p) => p.date === bp.date)) {
          points.push(bp);
        }
      });
    }

    points.sort((a, b) => a.date.localeCompare(b.date));

    const analysis = analyzeTrendSeries(points, metric, activeProfile);

    el.innerHTML = `
      <div class="card" style="margin-bottom: 12px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <label class="field" style="margin:0; flex:1;">
            <span style="font-weight:600">Chọn Hồ sơ Giàn tụ:</span>
            <select id="trend-prof-sel">
              ${profiles
                .map(
                  (p) =>
                    `<option value="${esc(p.id)}"${p.id === activeProfile.id ? ' selected' : ''}>${esc(p.bank)} – ${esc(p.station)}</option>`,
                )
                .join('')}
            </select>
          </label>
        </div>

        <!-- Metric tabs -->
        <div class="seg" role="group" aria-label="Thông số theo dõi" style="display:grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap:4px; margin-top:8px;">
          <button type="button" data-met="unbalance" aria-pressed="${selectedMetric === 'unbalance'}">1. %ΔC Mất C/B</button>
          <button type="button" data-met="mov_rcd" aria-pressed="${selectedMetric === 'mov_rcd'}">2. MOV Rcd</button>
          <button type="button" data-met="reactor_rdc" aria-pressed="${selectedMetric === 'reactor_rdc'}">3. Kháng Rdc</button>
          <button type="button" data-met="bushing_c1" aria-pressed="${selectedMetric === 'bushing_c1'}">4. Sứ C1</button>
          <button type="button" data-met="bushing_tan" aria-pressed="${selectedMetric === 'bushing_tan'}">4. Sứ tan δ</button>
        </div>
      </div>

      <!-- Đồ thị xu hướng -->
      <div style="margin-bottom: 14px;">
        ${renderTrendSvg(points, metric, activeProfile)}
      </div>

      <!-- Thẻ chẩn đoán chuyên sâu -->
      <div class="card" style="margin-bottom: 14px; border-left: 4px solid ${analysis.verdict === 'fail' ? '#ef4444' : analysis.verdict === 'warn' ? '#f59e0b' : '#10b981'};">
        <div class="row" style="margin-bottom: 6px;">
          <b>Chẩn đoán trạng thái & Xu hướng già hóa</b>
          ${resBadge(analysis.verdict, analysis.verdictText)}
        </div>
        <p class="small" style="margin: 4px 0 8px;">
          ${metric.description}
        </p>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 8px; margin: 10px 0; background: rgba(0,0,0,0.15); padding: 8px; border-radius: 6px;">
          <div>
            <div class="small muted">Tốc độ biến thiên:</div>
            <b style="font-size: 15px; color: ${analysis.annualDriftRate && analysis.annualDriftRate > 0.04 ? '#f59e0b' : '#38bdf8'};">
              ${analysis.annualDriftRate !== null ? (analysis.annualDriftRate > 0 ? `+${analysis.annualDriftRate}` : analysis.annualDriftRate) : '—'} ${metric.unit}/năm
            </b>
          </div>
          <div>
            <div class="small muted">Điểm mới nhất (Max):</div>
            <b style="font-size: 15px;">
              ${Math.max(analysis.latestA ?? 0, analysis.latestB ?? 0, analysis.latestC ?? 0)} ${metric.unit}
            </b>
          </div>
          ${
            analysis.projectedAlarmYears
              ? `<div><div class="small muted">Dự báo chạm Alarm:</div><b style="font-size:15px; color:#f59e0b;">~ ${analysis.projectedAlarmYears} năm</b></div>`
              : ''
          }
        </div>

        <div class="small" style="padding-top: 6px; border-top: 1px solid var(--c-border);">
          💡 <b>Khuyến nghị:</b> ${esc(analysis.recommendation)}
        </div>
      </div>

      <!-- Bảng lịch sử các đợt đo -->
      <div class="card" style="margin-bottom: 14px;">
        <div class="row" style="margin-bottom: 8px;">
          <b>Lịch sử số liệu thí nghiệm (${points.length} đợt)</b>
          <button type="button" class="btn secondary small" id="btn-add-hist">＋ Thêm mốc lịch sử</button>
        </div>

        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Đợt / Ngày</th>
                <th>Pha A (${metric.unit})</th>
                <th>Pha B (${metric.unit})</th>
                <th>Pha C (${metric.unit})</th>
                <th>Ghi chú</th>
              </tr>
            </thead>
            <tbody>
              ${points
                .map(
                  (p) => `
                <tr>
                  <td><b>${esc(p.yearLabel)}</b><br><span class="small muted">${esc(p.date)}</span></td>
                  <td style="color:#f59e0b; font-weight:600">${p.phaseA !== null ? p.phaseA : '—'}</td>
                  <td style="color:#10b981; font-weight:600">${p.phaseB !== null ? p.phaseB : '—'}</td>
                  <td style="color:#ef4444; font-weight:600">${p.phaseC !== null ? p.phaseC : '—'}</td>
                  <td class="small">${esc(p.note || '—')}</td>
                </tr>
              `,
                )
                .join('')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Modal nhập mốc lịch sử -->
      <div id="hist-modal" class="modal-backdrop" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.75); z-index:9999; align-items:center; justify-content:center; padding:12px;">
        <div class="card" style="max-width:440px; width:100%; background:var(--c-surface, #1e293b);">
          <div class="row" style="margin-bottom:12px;">
            <b>＋ Thêm mốc số liệu lịch sử</b>
            <button type="button" class="icon-btn" id="hist-close">✕</button>
          </div>
          <form id="hist-form">
            <label class="field"><span>Ngày thí nghiệm:</span><input type="date" name="date" required value="${new Date().toISOString().slice(0, 10)}"></label>
            <label class="field"><span>Tên đợt (vd: Định kỳ 2022):</span><input type="text" name="label" required placeholder="Năm 2022"></label>
            <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:6px;">
              <label class="field"><span>Pha A (${metric.unit}):</span><input type="text" inputmode="decimal" name="phaseA" required></label>
              <label class="field"><span>Pha B (${metric.unit}):</span><input type="text" inputmode="decimal" name="phaseB" required></label>
              <label class="field"><span>Pha C (${metric.unit}):</span><input type="text" inputmode="decimal" name="phaseC" required></label>
            </div>
            <label class="field"><span>Ghi chú:</span><input type="text" name="note" placeholder="Biên bản nghiệm thu PTC3"></label>
            <div class="btn-row" style="margin-top:12px;">
              <button type="submit" class="btn">Lưu mốc này</button>
              <button type="button" class="btn secondary" id="hist-cancel">Hủy</button>
            </div>
          </form>
        </div>
      </div>
    `;

    // Event listeners
    el.querySelector('#trend-prof-sel')?.addEventListener('change', (e) => {
      const pid = (e.target as HTMLSelectElement).value;
      activeProfile = profiles.find((p) => p.id === pid) ?? activeProfile;
      setTop('Phân tích xu hướng', {
        back: '#/sessions',
        sub: `${activeProfile.bank} – ${activeProfile.station}`,
      });
      renderContent();
    });

    el.querySelectorAll<HTMLButtonElement>('[data-met]').forEach((b) => {
      b.addEventListener('click', () => {
        selectedMetric = b.dataset.met as TrendMetricKey;
        renderContent();
      });
    });

    const modal = el.querySelector<HTMLElement>('#hist-modal')!;
    el.querySelector('#btn-add-hist')?.addEventListener('click', () => {
      modal.style.display = 'flex';
    });
    const closeModal = () => (modal.style.display = 'none');
    el.querySelector('#hist-close')?.addEventListener('click', closeModal);
    el.querySelector('#hist-cancel')?.addEventListener('click', closeModal);

    el.querySelector('#hist-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const form = e.target as HTMLFormElement;
      const fd = new FormData(form);
      const d = String(fd.get('date'));
      const lbl = String(fd.get('label'));
      const pA = parseFloat(String(fd.get('phaseA')).replace(',', '.'));
      const pB = parseFloat(String(fd.get('phaseB')).replace(',', '.'));
      const pC = parseFloat(String(fd.get('phaseC')).replace(',', '.'));
      const note = String(fd.get('note') || '');

      const newPoint: TrendDataPoint = {
        id: `custom-${Date.now()}`,
        date: d,
        yearLabel: lbl,
        sessionType: 'periodic',
        phaseA: Number.isFinite(pA) ? pA : null,
        phaseB: Number.isFinite(pB) ? pB : null,
        phaseC: Number.isFinite(pC) ? pC : null,
        note,
      };

      const curCustom = loadCustomHistory(activeProfile.id);
      curCustom.push(newPoint);
      saveCustomHistory(activeProfile.id, curCustom);
      toast('✓ Đã lưu mốc số liệu lịch sử');
      closeModal();
      renderContent();
    });
  };

  renderContent();
};

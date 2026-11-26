import { setTop } from '../components/Chrome';
import { db } from '../store/db';
import { esc, resBadge, toast } from '../ui';
import { params, type View } from '../router';
import type { Profile } from '../types';
import { can } from '../auth/roles';
import { historyKey, parseTrendTable, templateSheets, type ImportResult } from '../domain/trend-import';
import { download } from '../export/report';
import { fmt, parseNum } from '../calc/units';
import {
  METRIC_DEFS,
  METRIC_GROUPS,
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
  const editable = can('trend.edit');

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
      : `<div class="card empty-state">
          <p class="mt-0 mb-6"><b>Chưa có số liệu ${esc(metric.shortTitle)} cho giàn này</b></p>
          <p class="small muted m-0">Đồ thị tự vẽ khi có số liệu:<br>
          • Nhập kết quả mục ${esc(metric.itemCode)} trong một <a href="#/sessions">phiên thí nghiệm</a> của giàn ${esc(activeProfile.bank)}, hoặc<br>
          • Thêm mốc lịch sử từ biên bản giấy các năm trước (nút bên dưới).<br>
          Từ 2 đợt trở lên app tự tính tốc độ biến thiên và dự báo.</p>
        </div>`;

    el.innerHTML = `
      <div class="card mb-12">
        <label class="field m-0">
          <span class="fw-6">Chọn Hồ sơ Giàn tụ:</span>
          <select id="trend-prof-sel">
            ${profiles.map((p) => `<option value="${esc(p.id)}"${p.id === activeProfile.id ? ' selected' : ''}>${esc(p.bank)} – ${esc(p.station)}</option>`).join('')}
          </select>
        </label>
        <label class="field mt-8 mb-0">
          <span class="fw-6">Chỉ số theo dõi:</span>
          <select id="trend-met-sel">${METRIC_GROUPS.map(
            ([g, ks]) => `<optgroup label="${esc(g)}">${ks.map((k) => `<option value="${k}"${k === selectedMetric ? ' selected' : ''}>${esc(METRIC_DEFS[k].shortTitle)} (${esc(METRIC_DEFS[k].unit)})</option>`).join('')}</optgroup>`,
          ).join('')}</select>
        </label>
      </div>

      <div class="mb-12">${chart}</div>
      ${hasUncorrected ? '<p class="small muted trend-note">⚠️ Có đợt thiếu nhiệt độ môi trường nên giá trị chưa được quy đổi nhiệt độ – so sánh giữa các đợt có thể chưa chính xác.</p>' : ''}

      ${
        points.length
          ? `<div class="card mb-12 trend-verdict v-${analysis.verdict}">
        <div class="row mb-6">
          <b>Chẩn đoán trạng thái & Xu hướng</b>
          ${resBadge(analysis.verdict, analysis.verdictText)}
        </div>
        <p class="small mt-4 mb-8">${esc(metric.description)}</p>
        <div class="trend-stats">
          <div>
            <div class="small muted">Số đợt có số liệu:</div>
            <b class="stat-val">${analysis.pointCount}</b>
          </div>
          <div>
            <div class="small muted">Tốc độ biến thiên:</div>
            <b class="stat-val">${analysis.annualDriftRate !== null ? `${signed(analysis.annualDriftRate)} ${esc(metric.unit)}/năm` : '— (cần ≥ 2 đợt)'}</b>
          </div>
          <div>
            <div class="small muted">${esc(analysis.headline.label)}:</div>
            <b class="stat-val">${analysis.headline.value !== null ? `${analysis.headline.unit === '%' && metric.warningDirection === 'deviation' ? signed(analysis.headline.value) : fmt(analysis.headline.value)} ${esc(analysis.headline.unit)}` : '—'}</b>
          </div>
          ${analysis.projectedAlarmYears ? `<div><div class="small muted">Dự báo chạm ngưỡng:</div><b class="stat-val text-warn">~ ${fmt(analysis.projectedAlarmYears)} năm</b></div>` : ''}
        </div>
        <div class="small divider-top">💡 <b>Khuyến nghị:</b> ${esc(analysis.recommendation)}</div>
      </div>`
          : ''
      }

      <div class="card mb-12">
        <div class="row mb-8">
          <b>Lịch sử số liệu (${points.length} đợt)</b>
          ${editable ? '<button type="button" class="btn secondary small" id="btn-add-hist">＋ Thêm mốc lịch sử</button>' : ''}
        </div>
        ${
          editable
            ? `<div class="btn-row mt-0 mb-8">
                <label class="btn secondary">📥 Nhập nhiều mốc từ Excel<input type="file" id="hist-file" accept=".xlsx,.xls,.csv" hidden></label>
                <button type="button" class="btn secondary" id="hist-template">⬇ Tải file mẫu</button>
              </div>
              <p class="small mt-0"><a href="#/help?s=trend">❓ Hướng dẫn nhập số liệu lịch sử (3 cách)</a></p>
              <div id="hist-preview"></div>`
            : ''
        }
        ${
          points.length
            ? `<div class="table-wrap"><table>
          <thead><tr><th>Đợt / Ngày</th><th>Pha A (${esc(metric.unit)})</th><th>Pha B (${esc(metric.unit)})</th><th>Pha C (${esc(metric.unit)})</th><th>Nguồn / Ghi chú</th></tr></thead>
          <tbody>
            ${points
              .map(
                (p) => `<tr>
              <td><b>${esc(p.yearLabel)}</b><br><span class="small muted">${esc(p.date)}</span></td>
              <td class="fw-6">${showNum(p.phaseA)}</td>
              <td class="fw-6">${showNum(p.phaseB)}</td>
              <td class="fw-6">${showNum(p.phaseC)}</td>
              <td class="small">${
                p.source === 'session'
                  ? `<a href="#/session/${esc(p.sessionId!)}/form/${esc(src.itemId)}/${esc(src.testId)}">📋 Phiên TN</a>`
                  : `✎ Nhập tay${editable ? ` <button type="button" class="btn secondary small" data-del-hist="${esc(p.id)}" aria-label="Xóa mốc ${esc(p.yearLabel)}">Xóa</button>` : ''}`
              }${p.note ? `<br>${esc(p.note)}` : ''}</td>
            </tr>`,
              )
              .join('')}
          </tbody></table></div>`
            : '<p class="small muted m-0">Chưa có đợt nào.</p>'
        }
      </div>

      ${
        editable
          ? `<div id="hist-modal" class="modal-backdrop" hidden>
        <div class="card modal-card">
          <div class="modal-head">
            <b>＋ Mốc lịch sử – ${esc(metric.shortTitle)}</b>
            <button type="button" class="icon-btn" id="hist-close" aria-label="Đóng">✕</button>
          </div>
          <p class="small muted mt-0 mb-8">Nhập số liệu từ biên bản giấy của giàn ${esc(activeProfile.bank)}. ${
            ['mov_rcd', 'mov_rsu', 'reactor_rcd'].includes(selectedMetric) ? 'Giá trị đã quy đổi về 20°C.' : selectedMetric === 'reactor_rdc' ? 'Giá trị đã quy đổi về 75°C.' : selectedMetric === 'vap_A' ? 'Ghi trị tuyệt đối.' : ''
          } Để trống pha không có số liệu.</p>
          <form id="hist-form" novalidate>
            <label class="field"><span>Ngày thí nghiệm:</span><input type="date" name="date" required max="${new Date().toISOString().slice(0, 10)}"></label>
            <label class="field"><span>Loại đợt:</span>
              <select name="type">${(Object.keys(SESSION_TYPE_LABEL) as TrendSessionType[]).map((t) => `<option value="${t}"${t === 'periodic' ? ' selected' : ''}>${SESSION_TYPE_LABEL[t]}</option>`).join('')}</select>
            </label>
            <label class="field"><span>Tên đợt (để trống = năm + loại):</span><input type="text" name="label" maxlength="60" placeholder="vd: Định kỳ 2022"></label>
            <div class="grid-3">
              ${(['A', 'B', 'C'] as const).map((ph) => `<label class="field"><span>Pha ${ph}:</span><input type="text" inputmode="decimal" name="phase${ph}"></label>`).join('')}
            </div>
            <label class="field"><span>Ghi chú / số biên bản:</span><input type="text" name="note" maxlength="200"></label>
            <p class="small text-danger mt-4 mb-0" data-hist-err></p>
            <div class="btn-row mt-12">
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

    el.querySelector<HTMLSelectElement>('#trend-met-sel')?.addEventListener('change', (e) => {
      selectedMetric = (e.target as HTMLSelectElement).value as TrendMetricKey;
      void renderContent();
    });
    bindImport(el, profiles, activeProfile, () => void renderContent());

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
    const closeModal = () => (modal.hidden = true);
    el.querySelector('#btn-add-hist')?.addEventListener('click', () => (modal.hidden = false));
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

// ---------- Nhập nhiều mốc lịch sử từ Excel ----------
function bindImport(el: HTMLElement, profiles: Profile[], active: Profile, done: () => void) {
  el.querySelector('#hist-template')?.addEventListener('click', async () => {
    const XLSX = await import('xlsx');
    const t = templateSheets(profiles);
    const wb = XLSX.utils.book_new();
    const data = XLSX.utils.aoa_to_sheet(t.data);
    data['!cols'] = [14, 20, 16, 12, 10, 10, 10, 18, 28].map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(wb, data, 'Mốc lịch sử');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(t.metrics), 'Danh mục chỉ số');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(t.profiles), 'Hồ sơ giàn');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(t.guide), 'Hướng dẫn');
    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    download(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `Mau_moc_lich_su_xu_huong_${active.bank}.xlsx`.replace(/[^\p{L}\p{N}._-]+/gu, '_'));
  });

  el.querySelector<HTMLInputElement>('#hist-file')?.addEventListener('change', async (e) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const box = el.querySelector<HTMLElement>('#hist-preview')!;
    let res: ImportResult;
    try {
      const XLSX = await import('xlsx');
      // raw: ô chữ trong CSV giữ nguyên (không tự đoán ngày kiểu Mỹ mm/dd) – app đọc dd/mm/yyyy; ô ngày thật của Excel vẫn là Date
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true, raw: true });
      const ws = wb.Sheets['Mốc lịch sử'] ?? wb.Sheets[wb.SheetNames[0]];
      res = parseTrendTable(XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: '' }), profiles);
    } catch (err) {
      toast('Không đọc được file: ' + (err as Error).message, undefined, 6000);
      return;
    }
    const existing = new Map((await db.trendHistory.toArray()).map((r) => [historyKey(r), r]));
    const replaced = res.rows.filter((r) => existing.has(historyKey(r.rec))).length;
    const prof = (id: string) => profiles.find((p) => p.id === id)?.bank ?? id;
    box.innerHTML = `<div class="card">
      <b>Xem trước: ${res.rows.length} mốc hợp lệ${replaced ? ` (${replaced} mốc thay mốc cũ cùng ngày)` : ''}${res.errors.length ? `, ${res.errors.length} dòng lỗi` : ''}</b>
      ${res.errors.length ? `<ul class="small text-danger">${res.errors.slice(0, 20).map((x) => `<li>Dòng ${x.line}: ${esc(x.message)}</li>`).join('')}${res.errors.length > 20 ? `<li>… và ${res.errors.length - 20} dòng khác</li>` : ''}</ul>` : ''}
      ${
        res.rows.length
          ? `<div class="table-wrap"><table><thead><tr><th>Dòng</th><th>Ngày</th><th>Giàn</th><th>Chỉ số</th><th>A</th><th>B</th><th>C</th></tr></thead><tbody>${res.rows
              .slice(0, 50)
              .map(
                ({ line, rec }) =>
                  `<tr><td>${line}</td><td>${esc(rec.date)}</td><td>${esc(prof(rec.profileId))}</td><td>${esc(METRIC_DEFS[rec.metric].shortTitle)}</td><td>${showNum(rec.phaseA)}</td><td>${showNum(rec.phaseB)}</td><td>${showNum(rec.phaseC)}</td></tr>`,
              )
              .join('')}</tbody></table></div>${res.rows.length > 50 ? `<p class="small muted">Hiển thị 50 / ${res.rows.length} dòng.</p>` : ''}`
          : ''
      }
      <div class="btn-row">${res.rows.length ? `<button class="btn" type="button" id="hist-import-ok">Ghi ${res.rows.length} mốc</button>` : ''}<button class="btn secondary" type="button" id="hist-import-cancel">Hủy</button></div>
    </div>`;
    box.querySelector('#hist-import-cancel')!.addEventListener('click', () => (box.innerHTML = ''));
    box.querySelector('#hist-import-ok')?.addEventListener('click', async () => {
      const now = Date.now();
      await db.trendHistory.bulkPut(res.rows.map(({ rec }, i) => ({ ...rec, id: existing.get(historyKey(rec))?.id ?? uid(), createdAt: now + i })));
      toast(`✓ Đã ghi ${res.rows.length} mốc lịch sử`);
      box.innerHTML = '';
      done();
    });
  });
}

// Khối "Cảnh báo & đề xuất xử lý" + nút "Gợi ý kết luận" ở trang phiên.
import { gatesFor, getGate, items } from '../../content';
import { db } from '../../store/db';
import { calibOverdue } from '../../calc/evaluate';
import { analyzeTrendSeries, extractTrendFromSessions, historyToPoints, mergeTrendPoints, METRIC_DEFS, METRIC_SOURCE, TREND_METRICS } from '../../calc/trend';
import { itemOn, type SessionData } from '../../domain/session';
import { conclusionDraft, NO_DATA_TITLE, type ReviewContext, type ReviewIssue } from '../../domain/review';
import { esc } from '../../ui';
import type { Instrument } from '../../types';

/** Ngữ cảnh rà soát: máy quá hạn, cổng an toàn chưa xác nhận, cảnh báo xu hướng tại đợt này. */
export async function reviewContext(d: SessionData, insts: (Instrument | undefined)[]): Promise<ReviewContext> {
  const s = d.session;
  const overdueInstruments = insts.filter((i): i is Instrument => !!i && calibOverdue(i.calibDue, s.date)).map((i) => i.model);

  // cổng an toàn: lịch sử xác nhận trong phiên (không xét hạn 12 giờ – phiên cũ vẫn đúng)
  const missingGates: string[] = [];
  if (!s.historical) {
    const confirmed = new Set((await db.checks.where('sessionId').equals(s.id).toArray()).filter((c) => c.confirmedBy).map((c) => c.gateId));
    const needed = new Set<string>(['gate-platform']);
    for (const it of items.filter((x) => itemOn(s, x.id))) for (const t of it.tests) if (d.values.has(`${it.id}|${t.id}`)) gatesFor(it.id, t.id).forEach((g) => needed.add(g));
    for (const g of needed) if (!confirmed.has(g)) missingGates.push(getGate(g)?.title ?? g);
  }

  // xu hướng: chỉ báo khi đợt mới nhất của chỉ số chính là phiên này
  const trendAlerts: ReviewContext['trendAlerts'] = [];
  const sessions = (await db.sessions.where('profileId').equals(s.profileId).toArray()).filter((x) => x.date <= s.date);
  const ids = sessions.map((x) => x.id);
  const [measurements, history] = await Promise.all([db.measurements.where('sessionId').anyOf(ids).toArray(), db.trendHistory.where('profileId').equals(s.profileId).toArray()]);
  for (const k of TREND_METRICS) {
    if (!itemOn(s, METRIC_SOURCE[k].itemId)) continue;
    const pts = mergeTrendPoints(
      extractTrendFromSessions(sessions, measurements, k, d.profile),
      historyToPoints(history.filter((h) => h.date <= s.date), s.profileId, k),
    );
    if (pts.length < 2 || pts[pts.length - 1].sessionId !== s.id) continue;
    const a = analyzeTrendSeries(pts, METRIC_DEFS[k], d.profile);
    if (a.verdict === 'warn' || a.verdict === 'fail') trendAlerts.push({ level: a.verdict, metric: METRIC_DEFS[k].shortTitle, text: a.verdictText, advice: a.recommendation });
  }
  return { overdueInstruments, missingGates, trendAlerts };
}

const ICON = { fail: '❌', warn: '⚠️', info: 'ℹ️' } as const;

export function reviewHtml(issues: ReviewIssue[], editable: boolean): string {
  return `<h2>Cảnh báo & đề xuất xử lý</h2>
    ${
      issues.length
        ? issues
            .map(
              (x) => `<div class="card issue issue-${x.level}"><b>${ICON[x.level]} ${esc(x.title)}</b>
                <ul class="small">${x.details.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>
                <p class="small mb-0">👉 <b>Đề xuất:</b> ${esc(x.advice)}</p></div>`,
            )
            .join('')
        : '<p class="small muted">Không có nội dung không đạt hay cảnh báo.</p>'
    }
    ${editable ? '<button class="btn secondary block mt-8" type="button" id="draft">💡 Gợi ý kết luận, kiến nghị</button><div id="draftBox"></div>' : ''}`;
}

/** Bản nháp kết luận: xem trước → Thay / Thêm vào cuối. Không tự ghi khi chưa bấm. */
export function bindDraft(el: HTMLElement, d: SessionData, issues: ReviewIssue[], save: (text: string) => Promise<void>) {
  el.querySelector('#draft')?.addEventListener('click', () => {
    const box = el.querySelector<HTMLElement>('#draftBox')!;
    const text = conclusionDraft(d, issues);
    box.innerHTML = `<div class="card">
      <p class="small muted mt-0">Bản gợi ý từ số liệu – <b>Chỉ huy trực tiếp xem xét, sửa</b> trước khi ký.</p>
      <textarea id="draftText" rows="10">${esc(text)}</textarea>
      <div class="btn-row"><button class="btn" type="button" data-use="replace">Thay kết luận</button><button class="btn secondary" type="button" data-use="append">Thêm vào cuối</button><button class="btn secondary" type="button" data-use="close">Đóng</button></div>
    </div>`;
    box.querySelectorAll<HTMLButtonElement>('[data-use]').forEach((b) =>
      b.addEventListener('click', async () => {
        const how = b.dataset.use;
        if (how !== 'close') {
          const concl = el.querySelector<HTMLTextAreaElement>('#concl')!;
          const draft = box.querySelector<HTMLTextAreaElement>('#draftText')!.value.trim();
          concl.value = how === 'append' && concl.value.trim() ? `${concl.value.trimEnd()}\n\n${draft}` : draft;
          await save(concl.value);
          concl.focus();
        }
        box.innerHTML = '';
      }),
    );
  });
}

/** Nhắc trước khi ký: còn hạng mục chưa có số liệu / có nội dung không đạt mà kết luận trống. */
export function signReminder(issues: ReviewIssue[], conclusion: string): string {
  const msgs: string[] = [];
  const empty = issues.find((x) => x.title === NO_DATA_TITLE);
  if (empty) msgs.push(`Chưa có số liệu: ${empty.details.join('; ')}.`);
  if (issues.some((x) => x.level === 'fail') && !conclusion.trim()) msgs.push('Có nội dung KHÔNG ĐẠT nhưng chưa ghi Kết luận, kiến nghị (dùng nút 💡 Gợi ý).');
  return msgs.length ? '\n\n⚠️ ' + msgs.join('\n⚠️ ') : '';
}

import MiniSearch from 'minisearch';
import { cycle, equipment, gates, items, overview, safety, thresholds, tools } from '../content';
import { setTop } from '../components/Chrome';
import { foldVi } from '../calc/units';
import { describeThreshold } from '../calc/evaluate';
import { esc, plain } from '../ui';
import type { View } from '../router';
import { help } from './Info';

interface Doc {
  id: string;
  title: string;
  text: string;
  href: string;
  kind: string;
}

let index: MiniSearch<Doc> | null = null;
const docs = new Map<string, Doc>();

function add(d: Doc) {
  d.text = plain(d.text);
  docs.set(d.id, d);
}

export function buildDocs(): Doc[] {
  if (docs.size) return [...docs.values()];
  for (const it of items) {
    add({ id: `item-${it.id}`, title: `${it.id} ${it.title}`, text: [...it.purpose, ...it.tools, ...(it.callouts ?? []).map((c) => c.text)].join(' '), href: `#/item/${it.id}`, kind: 'Hạng mục' });
    for (const t of it.tests) {
      add({
        id: `test-${it.id}-${t.id}`,
        title: `${it.id} · ${t.title}`,
        text: [...(t.purpose ?? []), ...(t.checklist ?? []), ...(t.tips ?? []), ...(t.callouts ?? []).map((c) => c.text), ...(t.table?.rows.flat() ?? []), ...(t.extraTables ?? []).flatMap((x) => x.rows.flat())].join(' '),
        href: `#/item/${it.id}?test=${t.id}`,
        kind: 'Phép thử',
      });
      for (const s of t.steps ?? []) {
        add({ id: `step-${it.id}-${t.id}-${s.n}`, title: `${it.id} · ${t.title} – bước ${s.n}`, text: `${s.text} ${s.note ?? ''} ${s.record ?? ''}`, href: `#/item/${it.id}/test/${t.id}/step/${t.steps!.indexOf(s) + 1}`, kind: 'Bước' });
      }
    }
  }
  for (const d of overview.devices) add({ id: `dev-${d.id}`, title: d.name, text: d.role, href: `#/overview/${d.id}`, kind: 'Thiết bị' });
  add({ id: 'ov-role', title: overview.role.title, text: overview.role.points.join(' ') + ' ' + overview.role.formula, href: '#/overview', kind: 'Tổng quan' });
  add({ id: 'ov-circuit', title: overview.circuit.title, text: overview.circuit.points.join(' '), href: '#/overview', kind: 'Tổng quan' });
  add({ id: 'ov-config', title: overview.config.title, text: overview.config.points.join(' ') + ' ' + overview.config.formulaRows.flat().join(' '), href: '#/overview', kind: 'Tổng quan' });
  for (const t of thresholds) add({ id: `thr-${t.id}`, title: t.label, text: `${describeThreshold(t)} ${t.note ?? ''}`, href: '#/thresholds', kind: 'Ngưỡng' });
  for (const g of gates) add({ id: `gate-${g.id}`, title: g.title, text: g.checks.map((c) => c.text).join(' '), href: `#/gate/${g.id}`, kind: 'An toàn' });
  add({ id: 'safety-risks', title: 'Rủi ro và biện pháp', text: safety.risks.map((r) => `${r.risk} ${r.measure}`).join(' '), href: '#/safety', kind: 'An toàn' });
  add({ id: 'tools', title: 'Dụng cụ & nhân lực', text: [...tools.staff, ...tools.prep, ...tools.equipment.map((e) => e.name)].join(' '), href: '#/tools', kind: 'Dụng cụ' });
  add({ id: 'cycle', title: 'Chu kỳ thí nghiệm', text: cycle.rows.flat().join(' ') + ' ' + cycle.note, href: '#/cycle', kind: 'Chu kỳ' });
  for (const e of equipment) {
    for (const s of e.sections) {
      add({
        id: `eq-${e.id}-${s.id}`,
        title: `${e.short} · ${s.title}`,
        text: [...(s.points ?? []), ...(s.table?.rows.flat() ?? []), ...(s.cards ?? []).map((c) => `${c.name} ${c.desc}`), ...(s.steps ?? []).map((x) => x.text), ...(s.callouts ?? []).map((c) => c.text)].join(' '),
        href: `#/equipment/${e.id}/${s.id}`,
        kind: 'Máy TN',
      });
    }
  }
  for (const h of help) add({ id: `help-${h.id}`, title: h.title, text: [...(h.steps ?? []), ...(h.points ?? [])].join(' '), href: `#/help?s=${h.id}`, kind: 'Hướng dẫn' });
  return [...docs.values()];
}

function getIndex() {
  if (index) return index;
  index = new MiniSearch<Doc>({
    fields: ['title', 'text'],
    storeFields: ['title', 'href', 'kind'],
    processTerm: (t) => foldVi(t),
    searchOptions: { prefix: true, fuzzy: 0.15, boost: { title: 2 }, combineWith: 'AND' },
  });
  index.addAll(buildDocs());
  return index;
}

/** Trích đoạn quanh từ khóa đầu tiên khớp (so khớp không dấu, giữ nguyên chữ gốc). */
function snippet(text: string, q: string): string {
  const folded = foldVi(text); // bỏ dấu giữ nguyên độ dài với tiếng Việt dựng sẵn (NFC)
  const words = foldVi(q).split(/\s+/).filter(Boolean);
  let pos = -1;
  for (const w of words) {
    pos = folded.indexOf(w);
    if (pos >= 0) break;
  }
  const start = Math.max(0, pos - 40);
  let s = esc((start > 0 ? '…' : '') + text.slice(start, start + 160) + (text.length > start + 160 ? '…' : ''));
  for (const w of words) {
    if (w.length < 2) continue;
    // tô sáng: dò trên bản bỏ dấu của chính đoạn trích
    const raw = (start > 0 ? '…' : '') + text.slice(start, start + 160);
    const f = foldVi(raw);
    const i = f.indexOf(w);
    if (i >= 0) {
      const hit = raw.slice(i, i + w.length);
      s = s.replace(esc(hit), `<mark class="hl">${esc(hit)}</mark>`);
    }
  }
  return s;
}

export function search(q: string) {
  if (!q.trim()) return [];
  let res = getIndex().search(q);
  if (!res.length) res = getIndex().search(q, { combineWith: 'OR' });
  return res.slice(0, 40).map((r) => ({ ...docs.get(r.id as string)!, score: r.score }));
}

export const Search: View = (r, el) => {
  setTop('Tìm kiếm', { back: '#/' });
  const q0 = r.query.get('q') ?? '';
  el.innerHTML = `<form id="sf" role="search" style="margin-top:12px"><input type="search" id="q" value="${esc(q0)}" placeholder="vd: khang can diu, VAP mC, CT6…" autocomplete="off" aria-label="Từ khóa"></form>
    <p class="small muted">Tìm không phân biệt dấu, hoạt động offline.</p><div id="res"></div>`;
  const input = el.querySelector<HTMLInputElement>('#q')!;
  const out = el.querySelector('#res')!;
  const run = () => {
    const q = input.value;
    history.replaceState(null, '', `#/search${q ? `?q=${encodeURIComponent(q)}` : ''}`);
    const res = search(q);
    out.innerHTML = q.trim()
      ? res.length
        ? `<p class="small muted">${res.length} kết quả</p>` +
          res
            .map(
              (d) => `<a class="card" href="${esc(d.href)}" style="display:block;text-decoration:none;color:inherit"><span class="pill">${esc(d.kind)}</span> <b>${esc(d.title)}</b><div class="small">${snippet(d.text, q)}</div></a>`,
            )
            .join('')
        : '<p>Không tìm thấy kết quả.</p>'
      : '';
  };
  input.addEventListener('input', run);
  el.querySelector('#sf')!.addEventListener('submit', (e) => {
    e.preventDefault();
    input.blur();
  });
  run();
  // trang được dựng ngoài DOM rồi mới gắn vào → focus ở khung hình kế tiếp
  if (!q0) requestAnimationFrame(() => input.focus());
};

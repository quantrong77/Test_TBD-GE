import { cycle, gates, items, overview, safety, tools, review } from '../content';
import { setTop } from '../components/Chrome';
import { callout, esc, gallery, rich, table } from '../ui';
import { params, type View } from '../router';

export const Overview: View = (_r, el) => {
  const devId = params().deviceId;
  if (devId) {
    const d = overview.devices.find((x) => x.id === devId);
    setTop(d?.name ?? 'Thiết bị', { back: '#/overview' });
    if (!d) {
      el.innerHTML = '<p>Không tìm thấy thiết bị.</p>';
      return;
    }
    el.innerHTML = `<h1>${esc(d.name)}</h1><p>${rich(d.role)}</p>
      <a class="btn block" href="#/item/${d.item}">🧪 Hạng mục thí nghiệm ${d.item}</a>
      ${gallery(d.images, 'dev')}`;
    return;
  }
  setTop('Tổng quan TBD & thiết bị', { back: '#/' });
  const o = overview;
  el.innerHTML = `
    <h2>${esc(o.role.title)}</h2>
    <ul class="clean">${o.role.points.map((p) => `<li>${rich(p)}</li>`).join('')}</ul>
    <div class="formula">${esc(o.role.formula)}</div>
    ${gallery(o.role.images, 'role')}
    <h2>${esc(o.circuit.title)}</h2>
    <ul class="clean">${o.circuit.points.map((p) => `<li>${rich(p)}</li>`).join('')}</ul>
    ${gallery(o.circuit.images, 'circuit')}
    <h2>Các thiết bị trên sàn tụ</h2>
    <div class="grid2">${o.devices
      .map((d) => `<a class="tile" href="#/overview/${d.id}"><span class="name">${esc(d.name)}</span><span class="small muted">Hạng mục ${d.item}</span></a>`)
      .join('')}</div>
    <h2>${esc(o.config.title)}</h2>
    <ul class="clean">${o.config.points.map((p) => `<li>${rich(p)}</li>`).join('')}</ul>
    <div class="card"><b>Thẻ công thức – dung lượng</b>${table(['Bước', 'Công thức', 'Kết quả'], o.config.formulaRows)}</div>
    ${gallery(o.config.images, 'config')}
    <h2>Tổng kết</h2>
    <ul class="clean">${o.summary.map((p) => `<li>${rich(p)}</li>`).join('')}</ul>`;
};

export const Safety: View = (_r, el) => {
  setTop('An toàn chung', { back: '#/' });
  const platform = gates.find((g) => g.id === 'gate-platform')!;
  el.innerHTML = `
    ${callout({ level: 'danger', text: 'Sàn tụ mang điện áp đường dây 500 kV khi vận hành. Chỉ lên sàn khi đã cô lập, tiếp địa và qua **cổng an toàn**.' })}
    <h2>Điều kiện bắt buộc trước khi lên sàn</h2>
    <ul class="clean">${platform.checks.map((c) => `<li>☐ ${rich(c.text)}</li>`).join('')}</ul>
    <a class="btn block big" href="#/gate/gate-platform">⚠️ Mở cổng an toàn lên sàn tụ</a>
    <h2>Rủi ro và biện pháp</h2>
    ${safety.risks.map((r) => callout({ level: r.level, text: `**${r.risk}:** ${r.measure}` })).join('')}
    ${callout({ level: 'info', text: safety.command })}
    <h2>Các cổng an toàn riêng</h2>
    ${gates
      .filter((g) => g.id !== 'gate-platform')
      .map(
        (g) => `<details class="card"><summary>${esc(g.title)}</summary><ul class="clean">${g.checks.map((c) => `<li>☐ ${rich(c.text)}</li>`).join('')}</ul></details>`,
      )
      .join('')}
    <h2>Trình tự 7 hạng mục</h2>
    <ol class="clean">${items.map((i) => `<li><a href="#/item/${i.id}">${i.id} ${esc(i.title)}</a></li>`).join('')}</ol>
    <p class="small muted">${rich(safety.disclaimer)}</p>`;
};

const TOOLS_KEY = 'tbd.toolsChecked';
const loadChecked = (): Record<string, boolean> => {
  try {
    return JSON.parse(localStorage.getItem(TOOLS_KEY) || '{}');
  } catch {
    return {};
  }
};

export const Tools: View = (_r, el) => {
  setTop('Dụng cụ & nhân lực', { back: '#/' });
  const checked = loadChecked();
  const count = () => tools.equipment.filter((e) => checked[e.id]).length;
  el.innerHTML = `
    <h2>Nhân lực (1 đơn vị công tác = 7 người)</h2>
    <ul class="clean">${tools.staff.map((s) => `<li>${rich(s)}</li>`).join('')}</ul>
    <h2>Phương tiện</h2><ul class="clean">${tools.vehicles.map((s) => `<li>${rich(s)}</li>`).join('')}</ul>
    <h2>Chuẩn bị</h2><ul class="clean">${tools.prep.map((s) => `<li>${rich(s)}</li>`).join('')}</ul>
    <div class="row"><h2>Checklist dụng cụ</h2><span class="pill" id="tcount">${count()}/${tools.equipment.length}</span></div>
    <p class="small muted">Tích trước khi xuất phát. Lưu trên máy này.</p>
    <div id="tlist">${tools.equipment
      .map(
        (e) => `<label class="check"><input type="checkbox" data-id="${e.id}"${checked[e.id] ? ' checked' : ''}><span><b>${esc(e.name)}</b> <span class="muted">· SL ${esc(e.qty)}</span>${'equip' in e && e.equip ? ` · <a href="#/equipment/${e.equip}">xem máy</a>` : ''}</span></label>`,
      )
      .join('')}</div>
    <div class="btn-row"><button class="btn secondary" type="button" id="tclear">Bỏ tích tất cả</button></div>`;
  const save = () => {
    try {
      localStorage.setItem(TOOLS_KEY, JSON.stringify(checked));
    } catch {
      /* bỏ qua */
    }
    el.querySelector('#tcount')!.textContent = `${count()}/${tools.equipment.length}`;
  };
  el.querySelector('#tlist')!.addEventListener('change', (e) => {
    const t = e.target as HTMLInputElement;
    checked[t.dataset.id!] = t.checked;
    save();
  });
  el.querySelector('#tclear')!.addEventListener('click', () => {
    for (const k of Object.keys(checked)) delete checked[k];
    el.querySelectorAll<HTMLInputElement>('#tlist input').forEach((i) => (i.checked = false));
    save();
  });
};

export const Cycle: View = (_r, el) => {
  setTop('Chu kỳ thí nghiệm', { back: '#/' });
  el.innerHTML = `<h2>Khối lượng và chu kỳ</h2>${table(cycle.head, cycle.rows)}
    ${callout({ level: 'info', text: cycle.note })}
    ${callout({ level: 'warn', text: cycle.review })}`;
};

export const About: View = (_r, el) => {
  setTop('Ghi chú rà soát nội dung', { back: '#/settings' });
  el.innerHTML = `<p>Các điểm phát hiện khi trích nội dung slide – <b>cần chuyên gia xác nhận</b> (mục 14 đặc tả).</p>
    ${table(['Vị trí', 'Nội dung nguồn', 'Vấn đề / đề xuất'], review)}`;
};

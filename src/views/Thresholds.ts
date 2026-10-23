import { items, getItem } from '../content';
import { setTop } from '../components/Chrome';
import { callout, esc, table } from '../ui';
import { activeProfile, thresholdRows } from './Item';
import type { View } from '../router';

export const Thresholds: View = async (_r, el) => {
  setTop('Ngưỡng nhanh', { back: '#/' });
  const profile = await activeProfile();
  const groups = items.filter((i) => i.thresholds.length);
  const torque = getItem('4.1')!.tests[0].extraTables![0];
  const ctTable = getItem('4.7')!.tests[0].table!;
  const gapTable = getItem('4.5')!.tests[0].table!;
  el.innerHTML = `
    ${
      profile
        ? callout({ level: 'info', text: `Ngưỡng theo hồ sơ giàn **${profile.bank} – ${profile.station}** (phiên đang làm).` })
        : callout({ level: 'warn', text: 'Chưa chọn phiên/hồ sơ giàn – hiển thị **ngưỡng mẫu TBD503 T500 Pleiku 2**. Mỗi giàn có ngưỡng riêng.' })
    }
    ${groups.map((g) => `<h2><a href="#/item/${g.id}">${g.id} ${esc(g.short)}</a></h2>${table(['Đại lượng', 'Khoảng Đạt', 'Nguồn'], thresholdRows(g.thresholds, profile))}`).join('')}
    <h2>Mất cân bằng điện dung – công thức</h2>
    <div class="formula">C[µF] = 3183,1 × I[A] / U[V]   (f = 50 Hz)<br>IΔ thực = IΔ×10 / 10<br>%ΔC = IΔ thực / I∑ × 100</div>
    <p><a class="btn secondary" href="#/calc/unbalance">🧮 Mở máy tính mất cân bằng</a></p>
    <h2>4.7 Bơm dòng nhất thứ – bảng kỳ vọng</h2>${table(ctTable.head, ctTable.rows)}
    <h2>4.5.A Khe hở điện cực TAG</h2>${table(gapTable.head, gapTable.rows)}
    <h2>Lực xiết bu-lông (ASTM A-307)</h2>${table(torque.head, torque.rows)}
    <h2>Nguồn GAMMA – quy đổi giám sát</h2>
    <div class="formula">Kẹp 8: kV = V × 2  (5 V = 10 kV)<br>Kẹp 7: mA = V × 1,2  (5 V = 6 mA)</div>`;
};

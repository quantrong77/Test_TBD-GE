// Sinh content/images.json: kích thước (cho PhotoSwipe) + chú thích (mục 15 đặc tả).
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'public/images';
const CAPTIONS = {
  '01_power_transfer.png': 'Power Transfer – sơ đồ, công thức',
  '02_platform_circuit.png': 'Platform Circuit – nguyên lý',
  '03_so_do_mot_soi.png': 'Sơ đồ một sợi chi tiết, CT, nhị thứ',
  '04_dan_tu_thuc_te.jpg': 'Dàn tụ lắp hoàn chỉnh',
  '05_bo_tri_stack.png': 'Bố trí S1–S4, R, TAG',
  '06_dau_day_stack.png': 'Đấu dây 1 Stack – 3 Rack',
  '07_so_do_group_string.png': 'Sơ đồ bình tụ pha – trung tính',
  '08_mov_cot_su.jpg': 'Cột sứ MOV',
  '09_mov_dia_zno.jpg': 'Đĩa ZnO bên trong MOV',
  '10_tag_nguyen_ly.png': 'Nguyên lý Triggered Air Gap',
  '11_tu_vap_dau_noi.jpg': 'Tủ VAP-A/VAP-B, C1, C2',
  '12_khang_can_diu.jpg': 'Cuộn kháng cản dịu',
  '13_ct_rack.jpg': 'CT rack',
  '14_tu_pfoi.jpg': 'Tủ PFOI',
  '15_tong_the_1_pha.jpg': 'Tổng thể 1 pha giàn tụ',
  '16_so_do_thu_mat_can_bang.png': 'Fig.1 – mạch thử mất cân bằng',
  '17_4_diem_do_dong.png': '4 điểm đo dòng',
  '18_mov_thuc_te.jpg': 'MOV trên sàn tụ',
  '19_tag_house_su_xuyen.jpg': 'Sứ xuyên, thiết bị TAG house',
  '20_dien_cuc_tag.jpg': 'Điện cực khe hở TAG',
  '21_vap_tester_nguyen_ly.png': 'Simplified VAP Tester',
  '22_vap_tester_ket_noi.jpg': 'Kết nối VAP Tester',
  '23_nguon_cao_ap_10kv.jpg': 'Nguồn cao áp DC',
  '24_gap_injector_circuit.png': 'Simplified Gap Injector Circuit',
  '25_tag_house_c1_c2.jpg': 'Tụ C1, C2 trong TAG house',
  '26_so_do_mach_kich_hoat.png': 'Test Circuit Diagram – GE',
  '27_ct_rack_cua_so.jpg': 'CT cửa sổ trên rack',
  '28_so_do_bom_dong.png': 'Sơ đồ bơm dòng nhất thứ',
  '29_bang_bom_dong_ct.png': 'Bảng bơm dòng CT gốc GE',
  '30_bang_ct9_pfoi.png': 'Bảng CT9 – PFOI gốc GE',
  '31_gamma_mat_may.jpg': 'Mặt máy nguồn GAMMA RR10-6R',
  '32_gamma_hang_kep_tb1.png': 'Hàng kẹp TB-1',
  '33_gamma_dac_tuyen_cvcc.png': 'Đặc tuyến CV/CC',
  '34_gamma_so_do_khoi.png': 'Sơ đồ khối chức năng',
};

function size(buf, name) {
  if (name.endsWith('.png')) return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const m = buf[i + 1];
    const len = buf.readUInt16BE(i + 2);
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  throw new Error('no SOF in ' + name);
}

const out = {};
for (const f of readdirSync(DIR).sort()) {
  out[f] = { ...size(readFileSync(join(DIR, f)), f), caption: CAPTIONS[f] ?? f };
}
writeFileSync('content/images.json', JSON.stringify(out, null, 1) + '\n');
console.log(Object.keys(out).length, 'images');

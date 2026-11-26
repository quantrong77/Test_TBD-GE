// Khối ký cuối biên bản: Người thí nghiệm – Chỉ huy trực tiếp (không còn ô QLVH).
import { describe, it, expect } from 'vitest';
import { memberName, signerBlocks } from '../src/export/signers';

const s = { leader: 'Trần Văn Chỉ', members: ['Nguyễn Văn A (ATVSV)', 'Lê Thị B', ''] };

describe('khối ký biên bản', () => {
  it('chỉ 2 ô: Người thí nghiệm, Chỉ huy trực tiếp', () => {
    expect(signerBlocks(s, []).map((b) => b.slot)).toEqual(['tester', 'leader']);
  });
  it('chưa ký điện tử: in sẵn tên thành viên và Chỉ huy để ký tay', () => {
    const [t, l] = signerBlocks(s, []);
    expect(t.people).toEqual([{ name: 'Nguyễn Văn A' }, { name: 'Lê Thị B' }]);
    expect(l.people).toEqual([{ name: 'Trần Văn Chỉ' }]);
  });
  it('đã ký điện tử: ghi thời điểm, không in trùng tên; người chưa ký vẫn còn chỗ ký tay', () => {
    const [t, l] = signerBlocks(s, [
      { slot: 'tester', name: 'Nguyen Van A', time: '08:30 24/11/2026' },
      { slot: 'leader', name: 'Trần Văn Chỉ', time: '10:00 24/11/2026' },
    ]);
    expect(t.people).toEqual([{ name: 'Nguyen Van A', signedAt: '08:30 24/11/2026' }, { name: 'Lê Thị B' }]);
    expect(l.people).toEqual([{ name: 'Trần Văn Chỉ', signedAt: '10:00 24/11/2026' }]);
  });
  it('tên thành viên bỏ ghi chú chức danh', () => {
    expect(memberName('Phạm C – ATVSV')).toBe('Phạm C');
    expect(memberName('  Hoàng D  ')).toBe('Hoàng D');
  });
});

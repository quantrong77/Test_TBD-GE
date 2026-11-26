import { foldVi } from '../calc/units';
import type { Session, SignSlot } from '../types';

export interface SignerBlock {
  slot: SignSlot;
  title: string;
  /** Đã ký điện tử: tên + thời điểm; chưa ký: tên in sẵn để ký tay. */
  people: { name: string; signedAt?: string }[];
}

/**
 * Khối ký cuối biên bản: Người thí nghiệm (trái) – Chỉ huy trực tiếp (phải).
 * Ô chưa ký điện tử vẫn in tên (thành viên / Chỉ huy của phiên) để ký tay trên bản in.
 */
export function signerBlocks(s: Pick<Session, 'leader' | 'members'>, sigs: { slot: SignSlot; name: string; time: string }[]): SignerBlock[] {
  const of = (slot: SignSlot, fallback: string[]) => {
    const signed = sigs.filter((g) => g.slot === slot).map((g) => ({ name: g.name, signedAt: g.time }));
    const unsigned = fallback.filter((n) => n && !signed.some((x) => samePerson(x.name, n))).map((name) => ({ name }));
    return [...signed, ...unsigned];
  };
  return [
    { slot: 'tester', title: 'NGƯỜI THÍ NGHIỆM', people: of('tester', s.members.map(memberName)) },
    { slot: 'leader', title: 'CHỈ HUY TRỰC TIẾP', people: sigs.some((g) => g.slot === 'leader') ? of('leader', []) : of('leader', [s.leader]) },
  ];
}

/** "Nguyễn Văn A (ATVSV)" → "Nguyễn Văn A". */
export const memberName = (m: string) => m.replace(/\s*[([–-].*$/, '').trim();
const samePerson = (a: string, b: string) => foldVi(a).trim() === foldVi(b).trim();

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
 * Ô chưa ký điện tử vẫn in tên (người chịu trách nhiệm / Chỉ huy của phiên) để ký tay trên bản in.
 * Đã ký điện tử thì chỉ in người đã ký (không in thêm tên dự kiến).
 */
export function signerBlocks(s: Pick<Session, 'leader' | 'members' | 'crew'>, sigs: { slot: SignSlot; name: string; time: string }[]): SignerBlock[] {
  const of = (slot: SignSlot, fallback: string[]) => {
    const signed = sigs.filter((g) => g.slot === slot).map((g) => ({ name: g.name, signedAt: g.time }));
    if (signed.length && (slot === 'leader' || s.crew?.responsible)) return signed;
    const unsigned = fallback.filter((n) => n && !signed.some((x) => samePerson(x.name, n))).map((name) => ({ name }));
    return [...signed, ...unsigned];
  };
  return [
    // ô Người thí nghiệm: chỉ người chịu trách nhiệm ký (phiên cũ chưa khai → in tên các thành viên)
    { slot: 'tester', title: 'NGƯỜI THÍ NGHIỆM', people: of('tester', s.crew?.responsible ? [s.crew.responsible.name] : s.members.map(memberName)) },
    { slot: 'leader', title: 'CHỈ HUY TRỰC TIẾP', people: of('leader', [s.crew?.leader?.name || s.leader]) },
  ];
}

/** "Nguyễn Văn A (ATVSV)" → "Nguyễn Văn A". */
export const memberName = (m: string) => m.replace(/\s*[([–-].*$/, '').trim();
const samePerson = (a: string, b: string) => foldVi(a).trim() === foldVi(b).trim();

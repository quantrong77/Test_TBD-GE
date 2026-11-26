// Ký biên bản: ô Người thí nghiệm (chỉ người chịu trách nhiệm) và ô Chỉ huy trực tiếp (ký → khóa).
import { can, canSign, getMe, SLOT_LABEL } from '../../auth/roles';
import { revokeSignature, signSession, type SignatureCheck } from '../../sign/sign';
import { foldVi } from '../../calc/units';
import { db } from '../../store/db';
import { esc, fmtTime, resBadge, toast } from '../../ui';
import { go } from '../../router';
import type { Session, SignSlot } from '../../types';

const SLOTS: SignSlot[] = ['tester', 'leader'];

/** Người phải ký từng ô theo phiên (để nhắc và cảnh báo ký nhầm người). */
const expectedSigner = (s: Session, slot: SignSlot) => (slot === 'leader' ? s.crew?.leader?.name || s.leader : s.crew?.responsible?.name);

export function signBlock(s: Session, sigs: SignatureCheck[]): string {
  const me = getMe();
  return (
    SLOTS.map((slot) => {
      const mine = sigs.filter((x) => x.sig.slot === slot);
      const who = expectedSigner(s, slot);
      return `<div class="card"><b>${esc(SLOT_LABEL[slot])}</b>${who ? `<span class="small muted"> – ${esc(who)}</span>` : ''}
      ${mine
        .map(
          ({ sig, valid }) => `<div class="small mt-6">✍️ <b>${esc(sig.name)}</b> (${esc(sig.email)})<br>${esc(fmtTime(sig.signedAt))} · mã ${esc(sig.hash.slice(0, 12))}
            <br>${valid ? resBadge('pass', '✓ Nội dung khớp lúc ký') : resBadge('fail', '⚠️ Nội dung đã thay đổi sau khi ký')}
            ${can('sign.revoke') ? `<button class="btn secondary mt-6" type="button" data-revoke="${esc(sig.id)}">Thu hồi chữ ký</button>` : ''}</div>`,
        )
        .join('')}
      ${mine.length ? '' : '<div class="small muted">Chưa ký</div>'}
      ${canSign(slot) && !mine.length ? `<button class="btn block mt-8" type="button" data-sign="${slot}">✍️ Ký xác nhận</button>` : ''}
    </div>`;
    }).join('') + (me ? '' : '<p class="small muted">Đăng nhập tài khoản đã được duyệt (⚙️ Cài đặt) để ký biên bản. Bản in PDF luôn có chỗ ký tay.</p>')
  );
}

/** Gắn nút Ký / Thu hồi. `beforeSign` lưu kết luận đang gõ để nằm trong nội dung được ký. */
export function bindSignActions(el: HTMLElement, s: Session, beforeSign: () => Promise<void>) {
  el.querySelectorAll<HTMLButtonElement>('[data-sign]').forEach((b) =>
    b.addEventListener('click', async () => {
      const slot = b.dataset.sign as SignSlot;
      const me = getMe();
      const who = expectedSigner(s, slot);
      const other = who && me && foldVi(who).trim() !== foldVi(me.name || '').trim();
      const warn = [
        other ? `\n⚠️ Phiên ghi ${slot === 'leader' ? 'Chỉ huy trực tiếp' : 'người chịu trách nhiệm'} là "${who}", tài khoản đang ký là "${me!.name}".` : '',
        slot === 'leader' ? '\nSau khi ký, biên bản bị KHÓA: không sửa được số liệu, chỉ Quản trị mới thu hồi được chữ ký.' : '',
      ].join('');
      if (!confirm(`Ký xác nhận "${SLOT_LABEL[slot]}" bằng tài khoản ${me?.email}?${warn}`)) return;
      try {
        await beforeSign();
        await signSession(s.id, slot);
        toast('✓ Đã ký xác nhận');
        go(location.hash);
      } catch (err) {
        toast((err as Error).message, undefined, 6000);
      }
    }),
  );
  el.querySelectorAll<HTMLButtonElement>('[data-revoke]').forEach((b) =>
    b.addEventListener('click', async () => {
      if (!confirm('Thu hồi chữ ký này? Nếu là chữ ký Chỉ huy, biên bản sẽ mở khóa.')) return;
      await revokeSignature(b.dataset.revoke!);
      go(location.hash);
    }),
  );
}

/** Kết luận đang gõ (chưa qua debounce) → lưu ngay. */
export async function saveConclusionNow(el: HTMLElement, s: Session) {
  const c = el.querySelector<HTMLTextAreaElement>('#concl');
  if (c && !c.disabled && c.value !== (s.conclusion ?? '')) await db.sessions.update(s.id, { conclusion: c.value });
}

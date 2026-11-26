// Nhập số đo bằng giọng nói (Web Speech API, tiếng Việt).
// - Nút 🎤 cạnh từng ô số: nói một giá trị → điền ô.
// - "Đọc liên tiếp": app lần lượt đi qua từng ô của biểu mẫu, nghe → điền → (đọc lại) → sang ô kế; tay không cần chạm
//   (đeo găng, trên xe gàu). Lệnh: "tiếp/bỏ qua", "quay lại", "xóa", "dừng". Ô Đạt/Không đạt: nói "đạt" / "không đạt".
// Giá trị được ghi như khi gõ phím (sự kiện input) → tự lưu, tự đánh giá như bình thường.
// Lưu ý: Chrome Android nhận giọng nói qua máy chủ Google → CẦN MẠNG; Safari iPhone có thể nhận trên máy.
import { parseCommand, parseOkNok, parseSpokenNumber, speakableNumber, type VoiceCommand } from '../calc/speech';
import { foldVi } from '../calc/units';
import { esc, toast } from '../ui';

interface Recog {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  start(): void;
  abort(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type RecogCtor = new () => Recog;

const Ctor = (): RecogCtor | undefined => {
  const w = window as unknown as { SpeechRecognition?: RecogCtor; webkitSpeechRecognition?: RecogCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
};
export const voiceSupported = () => typeof window !== 'undefined' && !!Ctor();

const READBACK_KEY = 'tbd.voice.readback';
export function getReadback(): boolean {
  try {
    return localStorage.getItem(READBACK_KEY) !== '0';
  } catch {
    return true;
  }
}
export function setReadback(on: boolean) {
  try {
    localStorage.setItem(READBACK_KEY, on ? '1' : '0');
  } catch {
    /* bỏ qua */
  }
}

export class VoiceError extends Error {
  constructor(public code: string) {
    super(code);
  }
}
const ERROR_TEXT: Record<string, string> = {
  'not-allowed': 'Chưa cho phép dùng micro – bấm biểu tượng 🔒 trên thanh địa chỉ → cho phép Micro.',
  'service-not-allowed': 'Trình duyệt chặn nhận giọng nói (thường gặp trong Zalo/Facebook) – mở bằng Chrome/Safari.',
  network: 'Nhận giọng nói cần có mạng (Chrome gửi âm thanh tới Google). Hãy nhập bằng bàn phím khi không có sóng.',
  'audio-capture': 'Không tìm thấy micro.',
  'language-not-supported': 'Máy chưa hỗ trợ nhận giọng nói tiếng Việt.',
};
export const voiceErrorText = (code: string) => ERROR_TEXT[code] ?? `Không nhận được giọng nói (${code}).`;

let active: Recog | null = null;

/** Nghe một câu → các phương án nhận dạng (tốt nhất trước). Lỗi → VoiceError(code). */
export function recognizeOnce(): Promise<string[]> {
  const C = Ctor();
  if (!C) return Promise.reject(new VoiceError('unsupported'));
  active?.abort();
  return new Promise((resolve, reject) => {
    const r = new C();
    active = r;
    r.lang = 'vi-VN';
    r.interimResults = false;
    r.continuous = false;
    r.maxAlternatives = 4;
    let done = false;
    r.onresult = (e) => {
      done = true;
      const res = e.results[0];
      resolve(Array.from({ length: res.length }, (_, i) => res[i].transcript));
    };
    r.onerror = (e) => {
      done = true;
      reject(new VoiceError(e.error));
    };
    r.onend = () => {
      if (active === r) active = null;
      if (!done) reject(new VoiceError('no-speech'));
    };
    try {
      r.start();
    } catch {
      reject(new VoiceError('busy'));
    }
  });
}
export const stopListening = () => {
  active?.abort();
  active = null;
};

/** Đọc lại cho người dùng nghe (tiếng Việt nếu máy có giọng vi). Không hỗ trợ → bỏ qua. */
export function speak(text: string): Promise<void> {
  const s = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
  if (!s || typeof SpeechSynthesisUtterance === 'undefined') return Promise.resolve();
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'vi-VN';
    u.rate = 1.1;
    const t = setTimeout(resolve, 4000); // một số máy không báo onend
    u.onend = u.onerror = () => {
      clearTimeout(t);
      resolve();
    };
    s.cancel();
    s.speak(u);
  });
}

// ---------- Hiểu câu nói theo loại ô ----------
type Field = HTMLInputElement | HTMLSelectElement;
export type Heard = { kind: 'command'; cmd: VoiceCommand } | { kind: 'value'; value: string; say: string } | { kind: 'none' };

/** Phương án nhận dạng → lệnh hoặc giá trị hợp với loại ô (số / chữ / chọn). */
export function interpret(alts: string[], field: { tag: 'number' | 'text' | 'select'; options?: [string, string][] }): Heard {
  for (const a of alts) {
    const cmd = parseCommand(a);
    if (cmd) return { kind: 'command', cmd };
  }
  if (field.tag === 'text') return alts[0]?.trim() ? { kind: 'value', value: alts[0].trim(), say: alts[0].trim() } : { kind: 'none' };
  if (field.tag === 'select') {
    const opts = field.options ?? [];
    for (const a of alts) {
      const ok = parseOkNok(a);
      if (ok && opts.some(([v]) => v === ok)) return { kind: 'value', value: ok, say: ok === 'ok' ? 'đạt' : 'không đạt' };
      // ô chọn khác (đơn vị mA/A/µA, FIRE…): khớp theo chữ hiển thị
      const f = foldVi(a).replace(/[^a-z0-9]/g, '');
      const hit = opts.find(([v, l]) => v && (foldVi(l).replace(/[^a-z0-9]/g, '') === f || foldVi(v).replace(/[^a-z0-9]/g, '') === f));
      if (hit) return { kind: 'value', value: hit[0], say: hit[1] };
    }
    return { kind: 'none' };
  }
  for (const a of alts) {
    const v = parseSpokenNumber(a);
    if (v !== null) return { kind: 'value', value: v, say: speakableNumber(v) };
  }
  return { kind: 'none' };
}

const kindOf = (f: Field): 'number' | 'text' | 'select' => (f instanceof HTMLSelectElement ? 'select' : f.inputMode === 'decimal' || f.inputMode === 'numeric' ? 'number' : 'text');
const optionsOf = (f: Field): [string, string][] => (f instanceof HTMLSelectElement ? Array.from(f.options).map((o) => [o.value, o.text] as [string, string]) : []);
const labelOf = (f: Field) => f.getAttribute('aria-label') || f.dataset.k || 'ô nhập';

/** Ghi giá trị như người dùng gõ → các trình nghe 'input' của màn hình tự lưu + đánh giá. */
function fill(f: Field, value: string) {
  f.value = value;
  f.dispatchEvent(new Event('input', { bubbles: true }));
  f.dispatchEvent(new Event('change', { bubbles: true }));
  const row = f.closest('.inrow');
  row?.classList.add('voice-filled');
  setTimeout(() => row?.classList.remove('voice-filled'), 1200);
}

// ---------- Gắn vào màn hình nhập số ----------
/**
 * Gắn giọng nói cho vùng biểu mẫu `root`: nút 🎤 từng ô (.btn-voice[data-voice-for]) và nút "Đọc liên tiếp" (`runBtn`).
 * Gọi lại sau mỗi lần vẽ lại biểu mẫu là không cần – dùng ủy quyền sự kiện trên `root`.
 */
export function bindVoice(root: HTMLElement, runBtn?: HTMLButtonElement | null) {
  if (!voiceSupported()) return;
  root.addEventListener('click', async (e) => {
    const b = (e.target as Element).closest<HTMLButtonElement>('.btn-voice');
    if (!b) return;
    const f = root.querySelector<Field>(`[data-k="${CSS.escape(b.dataset.voiceFor ?? '')}"]`);
    if (!f || f.disabled) return;
    b.classList.add('listening');
    try {
      const h = interpret(await recognizeOnce(), { tag: kindOf(f), options: optionsOf(f) });
      if (h.kind === 'value') {
        fill(f, h.value);
        toast(`🎤 ${labelOf(f)}: ${h.value}`);
        if (getReadback()) void speak(h.say);
      } else if (h.kind === 'none') toast('🎤 Chưa nghe rõ số – nói lại, vd "bốn phẩy ba sáu"');
    } catch (err) {
      const code = (err as VoiceError).code;
      if (code !== 'no-speech' && code !== 'aborted') toast(voiceErrorText(code), undefined, 6000);
      else toast('🎤 Không nghe thấy gì – bấm 🎤 rồi nói ngay');
    } finally {
      b.classList.remove('listening');
    }
  });
  runBtn?.addEventListener('click', () => void runSequence(root));
}

/** Đọc liên tiếp: đi qua các ô theo thứ tự trên màn hình, bắt đầu ở ô đang chọn hoặc ô trống đầu tiên. */
async function runSequence(root: HTMLElement) {
  const fields = () => Array.from(root.querySelectorAll<Field>('input[data-k], select[data-k]')).filter((f) => !f.disabled && f.offsetParent !== null);
  let list = fields();
  if (!list.length) return toast('Không có ô nào để nhập');
  const focused = list.indexOf(document.activeElement as Field);
  let i = focused >= 0 ? focused : Math.max(0, list.findIndex((f) => !f.value));
  let misses = 0;
  let running = true;

  const panel = document.createElement('div');
  panel.id = 'voice-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Nhập bằng giọng nói');
  panel.innerHTML = `<div class="voice-head"><span class="voice-dot" aria-hidden="true"></span><b id="vp-label"></b></div>
    <div class="small" id="vp-heard" aria-live="polite">Đang nghe…</div>
    <div class="voice-btns">
      <button class="btn secondary" type="button" data-v="back">⏮ Lùi</button>
      <button class="btn secondary" type="button" data-v="next">⏭ Bỏ qua</button>
      <button class="btn secondary" type="button" data-v="again">🎤 Nghe lại</button>
      <button class="btn danger" type="button" data-v="stop">■ Dừng</button>
    </div>
    <p class="small muted m-0">Nói số (vd "bốn phẩy ba sáu"), "đạt / không đạt", hoặc lệnh: tiếp · quay lại · xóa · dừng.</p>`;
  document.body.appendChild(panel);
  const heard = panel.querySelector<HTMLElement>('#vp-heard')!;
  const label = panel.querySelector<HTMLElement>('#vp-label')!;
  let wake: (() => void) | null = null; // nút bấm trong lúc đang nghe → dừng nghe để xử lý ngay
  let pressed: 'back' | 'next' | 'again' | 'stop' | null = null;
  panel.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLButtonElement>('[data-v]');
    if (!b) return;
    pressed = b.dataset.v as typeof pressed;
    stopListening();
    wake?.();
  });
  const end = () => {
    running = false;
    stopListening();
    window.speechSynthesis?.cancel();
    root.querySelectorAll('.voice-target').forEach((x) => x.classList.remove('voice-target'));
    panel.remove();
  };
  window.addEventListener('route:leave', end, { once: true });
  /** Xử lý nút vừa bấm (Lùi / Bỏ qua / Nghe lại / Dừng); trả về nút đó. */
  const applyPress = () => {
    const p = pressed;
    pressed = null;
    if (p === 'next') i++;
    if (p === 'back') i--;
    misses = 0;
    return p;
  };

  while (running) {
    if (pressed) {
      // bấm nút lúc app đang đọc lại / tạm dừng
      if (applyPress() === 'stop') break;
      continue;
    }
    list = fields(); // biểu mẫu có thể vẽ lại (đổi pha…)
    if (i >= list.length) {
      heard.textContent = '✓ Đã hết các ô của trang này';
      if (getReadback()) await speak('Đã hết các ô');
      break;
    }
    if (i < 0) i = 0;
    const f = list[i];
    root.querySelectorAll('.voice-target').forEach((x) => x.classList.remove('voice-target'));
    (f.closest('.inrow') ?? f).classList.add('voice-target');
    f.scrollIntoView({ block: 'center', behavior: 'smooth' });
    label.textContent = `${i + 1}/${list.length} · ${labelOf(f)}${f.value ? ` (đang là ${f.value})` : ''}`;
    heard.textContent = '🎤 Đang nghe…';
    panel.classList.add('listening');
    let alts: string[] = [];
    try {
      alts = await Promise.race([recognizeOnce(), new Promise<string[]>((r) => (wake = () => r([])))]);
    } catch (err) {
      const code = (err as VoiceError).code;
      if (code !== 'no-speech' && code !== 'aborted') {
        heard.textContent = voiceErrorText(code);
        toast(voiceErrorText(code), undefined, 6000);
        break;
      }
    } finally {
      wake = null;
      panel.classList.remove('listening');
    }
    if (!running) break;
    if (pressed) {
      if (applyPress() === 'stop') break;
      continue;
    }
    if (!alts.length) {
      // im lặng: thử lại vài lần rồi tạm dừng để không nghe mãi
      if (++misses >= 3) {
        heard.textContent = 'Tạm dừng vì không nghe thấy – bấm 🎤 Nghe lại';
        await new Promise<void>((r) => (wake = r));
        wake = null;
      }
      continue;
    }
    misses = 0;
    const h = interpret(alts, { tag: kindOf(f), options: optionsOf(f) });
    if (h.kind === 'command') {
      if (h.cmd === 'stop') break;
      if (h.cmd === 'next') i++;
      if (h.cmd === 'back') i--;
      if (h.cmd === 'clear') {
        fill(f, '');
        heard.textContent = `🗑 Đã xóa ${labelOf(f)}`;
      }
      continue;
    }
    if (h.kind === 'none') {
      heard.innerHTML = `Nghe được "<b>${esc(alts[0])}</b>" – chưa hiểu, nói lại`;
      if (getReadback()) await speak('Nói lại');
      continue;
    }
    fill(f, h.value);
    heard.innerHTML = `✓ "${esc(alts[0])}" → <b>${esc(h.value)}</b>`;
    if (getReadback()) await speak(h.say);
    i++;
  }
  end();
}

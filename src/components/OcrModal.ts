import { esc } from '../ui';
import { recognizeDisplayFromImageData, type OcrResult } from '../calc/ocr';

export interface OcrModalOptions {
  title?: string;
  targetFieldLabel?: string;
  initialValue?: string;
  onApply: (val: string) => void;
}

let activeModal: HTMLElement | null = null;

export function openOcrScanner(opts: OcrModalOptions): void {
  if (activeModal) {
    activeModal.remove();
    activeModal = null;
  }

  const modal = document.createElement('div');
  modal.className = 'modal-backdrop';
  modal.style.cssText = `
    position: fixed; inset: 0; background: rgba(0,0,0,0.78);
    display: flex; align-items: center; justify-content: center;
    z-index: 9999; padding: 12px; backdrop-filter: blur(4px);
  `;

  modal.innerHTML = `
    <div class="card" style="width: 100%; max-width: 480px; max-height: 90vh; overflow-y: auto; background: var(--c-surface, #1e293b); color: var(--c-text, #f8fafc); border-radius: 12px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5); padding: 16px;">
      <div class="row" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
        <b style="font-size: 16px;">📷 Quét số đo đồng hồ (OCR)</b>
        <button type="button" class="icon-btn" data-close style="font-size: 20px; line-height: 1; min-width: 36px; min-height: 36px; cursor: pointer;">✕</button>
      </div>

      <p class="small muted" style="margin-bottom: 12px;">
        Chụp hoặc chọn ảnh màn hình hiển thị số của đồng hồ đo (Vôn kế, Ampe kìm, Micro-ohm, Megger...).
      </p>

      <div style="margin-bottom: 14px;">
        <label class="btn block" style="display: flex; align-items: center; justify-content: center; gap: 8px; cursor: pointer; padding: 12px; font-weight: 600;">
          <span>📸 Chụp ảnh / Chọn ảnh</span>
          <input type="file" accept="image/*" capture="environment" data-file hidden>
        </label>
      </div>

      <!-- Preview container -->
      <div id="ocr-preview-wrap" style="display: none; margin-bottom: 14px; text-align: center;">
        <div style="position: relative; display: inline-block; max-width: 100%; border-radius: 8px; overflow: hidden; border: 2px dashed #38bdf8;">
          <canvas id="ocr-canvas" style="display: block; max-width: 100%; max-height: 240px; margin: 0 auto;"></canvas>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px;">
          <label class="check small" style="display: flex; align-items: center; gap: 6px; cursor: pointer; user-select: none;">
            <input type="checkbox" id="ocr-invert">
            <span>Đảo phân cực (Chữ sáng trên nền tối)</span>
          </label>
          <button type="button" class="btn secondary small" id="ocr-rescan">🔍 Quét lại</button>
        </div>
      </div>

      <!-- Result section -->
      <div id="ocr-result-wrap" style="margin-bottom: 14px; background: rgba(0,0,0,0.25); border-radius: 8px; padding: 12px; border: 1px solid var(--c-border, #334155);">
        <label class="field" style="margin-bottom: 8px;">
          <span style="font-weight: 600; display: block; margin-bottom: 4px;">Giá trị nhận diện được:</span>
          <input type="text" id="ocr-val-input" inputmode="decimal" value="${esc(opts.initialValue ?? '')}" style="font-size: 20px; font-weight: 700; text-align: center; color: #38bdf8; font-family: monospace; letter-spacing: 1px;" placeholder="Chưa có ảnh">
        </label>
        <div id="ocr-candidates" style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px;"></div>
      </div>

      <div class="btn-row" style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
        <button type="button" class="btn" id="ocr-apply" style="font-weight: 600;">✅ Áp dụng vào ô</button>
        <button type="button" class="btn secondary" data-close>Hủy</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  activeModal = modal;

  const close = () => {
    modal.remove();
    activeModal = null;
  };

  modal.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
  modal.addEventListener('click', (e) => {
    if (e.target === modal) close();
  });

  const fileInput = modal.querySelector<HTMLInputElement>('[data-file]')!;
  const canvas = modal.querySelector<HTMLCanvasElement>('#ocr-canvas')!;
  const previewWrap = modal.querySelector<HTMLElement>('#ocr-preview-wrap')!;
  const valInput = modal.querySelector<HTMLInputElement>('#ocr-val-input')!;
  const candWrap = modal.querySelector<HTMLElement>('#ocr-candidates')!;
  const invertCheck = modal.querySelector<HTMLInputElement>('#ocr-invert')!;
  const rescanBtn = modal.querySelector<HTMLButtonElement>('#ocr-rescan')!;
  const applyBtn = modal.querySelector<HTMLButtonElement>('#ocr-apply')!;

  let currentImg: HTMLImageElement | null = null;

  const runOcr = () => {
    if (!currentImg) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Kích thước xử lý tối ưu: max width 640px
    const maxDim = 640;
    const scale = Math.min(1, maxDim / Math.max(currentImg.width, currentImg.height));
    canvas.width = Math.round(currentImg.width * scale);
    canvas.height = Math.round(currentImg.height * scale);

    ctx.drawImage(currentImg, 0, 0, canvas.width, canvas.height);
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    const res: OcrResult = recognizeDisplayFromImageData(imgData, {
      invert: invertCheck.checked,
    });

    if (res.value !== null) {
      valInput.value = String(res.value);
    } else if (res.rawText) {
      valInput.value = res.rawText;
    }

    // Hiển thị các candidates
    candWrap.innerHTML = '';
    if (res.candidates.length > 0) {
      const label = document.createElement('span');
      label.className = 'small muted';
      label.textContent = 'Gợi ý:';
      candWrap.appendChild(label);

      res.candidates.forEach((c) => {
        const pill = document.createElement('button');
        pill.type = 'button';
        pill.className = 'pill';
        pill.style.cursor = 'pointer';
        pill.textContent = c.text;
        pill.addEventListener('click', () => {
          valInput.value = c.text;
        });
        candWrap.appendChild(pill);
      });
    }
  };

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        currentImg = img;
        previewWrap.style.display = 'block';
        runOcr();
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });

  invertCheck.addEventListener('change', runOcr);
  rescanBtn.addEventListener('click', runOcr);

  applyBtn.addEventListener('click', () => {
    const v = valInput.value.trim();
    if (v) {
      opts.onApply(v);
    }
    close();
  });
}

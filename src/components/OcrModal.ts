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
  
  modal.innerHTML = `
    <div class="card modal-card">
      <div class="row modal-head">
        <b>📷 Quét số đo đồng hồ (OCR)</b>
        <button type="button" class="icon-btn modal-close" data-close>✕</button>
      </div>

      <p class="small muted mb-12">
        Chụp hoặc chọn ảnh màn hình hiển thị số của đồng hồ đo (Vôn kế, Ampe kìm, Micro-ohm, Megger...).
      </p>

      <div class="mb-12">
        <label class="btn block ocr-pick">
          <span>📸 Chụp ảnh / Chọn ảnh</span>
          <input type="file" accept="image/*" capture="environment" data-file hidden>
        </label>
      </div>

      <!-- Preview container -->
      <div id="ocr-preview-wrap" class="ocr-preview" hidden>
        <div class="ocr-frame">
          <canvas class="ocr-canvas" id="ocr-canvas"></canvas>
        </div>
        <div class="ocr-tools">
          <label class="check small ocr-toggle">
            <input type="checkbox" id="ocr-invert">
            <span>Đảo phân cực (Chữ sáng trên nền tối)</span>
          </label>
          <button type="button" class="btn secondary small" id="ocr-rescan">🔍 Quét lại</button>
        </div>
      </div>

      <!-- Result section -->
      <div class="ocr-result" id="ocr-result-wrap">
        <label class="field mb-8">
          <span class="fw-6 block mb-4">Giá trị nhận diện được:</span>
          <input class="ocr-value" type="text" id="ocr-val-input" inputmode="decimal" value="${esc(opts.initialValue ?? '')}" placeholder="Chưa có ảnh">
        </label>
        <div class="ocr-cands" id="ocr-candidates"></div>
      </div>

      <div class="btn-row grid-2">
        <button type="button" class="btn fw-6" id="ocr-apply">✅ Áp dụng vào ô</button>
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
        previewWrap.hidden = false;
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

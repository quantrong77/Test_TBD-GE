/**
 * Module nhận diện số đo từ đồng hồ thí nghiệm (On-device OCR).
 * Hoạt động 100% Offline trên trình duyệt / thiết bị di động.
 * Tối ưu chuyên biệt cho đồng hồ vạn năng, ampe kìm, VAP tester, micro-ohmmeter:
 * - Màn hình LCD 7 đoạn (Fluke, Hioki, Chauvin Arnoux, Megger, Omicron)
 * - Màn hình LED / OLED kỹ thuật số
 * - Tự động cân bằng ngưỡng tương phản (Otsu Binarization)
 * - Phân tích phân đoạn 7-segment và đối sánh mẫu (Template Match)
 */

export interface OcrCandidate {
  value: number;
  text: string;
  confidence: number;
}

export interface OcrResult {
  value: number | null;
  rawText: string;
  confidence: number;
  candidates: OcrCandidate[];
  polarity: 'dark_on_light' | 'light_on_dark';
  debugStats?: {
    totalBlobs: number;
    detectedDigits: number;
  };
}

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
  area: number;
  pixelCount: number;
}

/** 7 phân đoạn chuẩn: A(trên), B(trên-phải), C(dưới-phải), D(dưới), E(dưới-trái), F(trên-trái), G(giữa) */
const SEGMENT_TRUTH: Record<string, string> = {
  '1111110': '0',
  '0110000': '1',
  '1101101': '2',
  '1111001': '3',
  '0110011': '4',
  '1011011': '5',
  '1011111': '6',
  '0011111': '6', // 6 không có vạch trên A
  '1110000': '7',
  '1110010': '7', // 7 có vạch F nhỏ
  '1111111': '8',
  '1111011': '9',
  '1110011': '9', // 9 không có vạch đáy D
  '0000001': '-', // Dấu trừ
};

/** Tính toán ngưỡng Otsu tối ưu phân chia foreground / background */
export function computeOtsuThreshold(gray: Uint8Array): number {
  const hist = new Int32Array(256);
  const total = gray.length;
  for (let i = 0; i < total; i++) hist[gray[i]]++;

  let sumAll = 0;
  for (let t = 0; t < 256; t++) sumAll += t * hist[t];

  let sumBack = 0;
  let weightBack = 0;
  let maxVar = -1;
  let bestThreshold = 128;

  for (let t = 0; t < 256; t++) {
    weightBack += hist[t];
    if (weightBack === 0) continue;
    const weightFore = total - weightBack;
    if (weightFore === 0) break;

    sumBack += t * hist[t];
    const meanBack = sumBack / weightBack;
    const meanFore = (sumAll - sumBack) / weightFore;

    // Between-class variance: wB * wF * (uB - uF)^2
    const variance = weightBack * weightFore * (meanBack - meanFore) ** 2;
    if (variance > maxVar) {
      maxVar = variance;
      bestThreshold = t;
    }
  }

  return bestThreshold;
}

/** Tìm các vùng liên thông (Connected Component Analysis) */
export function findConnectedComponents(
  bin: Uint8Array,
  w: number,
  h: number,
): BoundingBox[] {
  const visited = new Uint8Array(w * h);
  const boxes: BoundingBox[] = [];

  const queueX = new Int32Array(w * h);
  const queueY = new Int32Array(w * h);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (bin[idx] === 0 || visited[idx] === 1) continue;

      let minX = x, maxX = x;
      let minY = y, maxY = y;
      let count = 0;

      let head = 0;
      let tail = 0;
      queueX[tail] = x;
      queueY[tail] = y;
      tail++;
      visited[idx] = 1;

      while (head < tail) {
        const cx = queueX[head];
        const cy = queueY[head];
        head++;
        count++;

        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;

        // Kiểm tra 4 hướng lân cận
        const neighbors = [
          [cx + 1, cy],
          [cx - 1, cy],
          [cx, cy + 1],
          [cx, cy - 1],
        ];

        for (let i = 0; i < 4; i++) {
          const nx = neighbors[i][0];
          const ny = neighbors[i][1];
          if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
            const nidx = ny * w + nx;
            if (bin[nidx] === 1 && visited[nidx] === 0) {
              visited[nidx] = 1;
              queueX[tail] = nx;
              queueY[tail] = ny;
              tail++;
            }
          }
        }
      }

      const boxW = maxX - minX + 1;
      const boxH = maxY - minY + 1;
      const area = boxW * boxH;

      // Lọc bỏ nhiễu cực nhỏ và khối nền bao phủ toàn khung
      if (boxH >= 7 && count >= 6 && boxW < w * 0.92 && boxH < h * 0.95) {
        boxes.push({ minX, minY, maxX, maxY, width: boxW, height: boxH, area, pixelCount: count });
      }
    }
  }

  return boxes;
}

/** Nhận diện một chữ số 7 đoạn từ vùng bounding box */
export function classify7Segment(
  bin: Uint8Array,
  w: number,
  box: BoundingBox,
): { char: string; confidence: number } | null {
  const { minX, minY, width: bw, height: bh } = box;

  // Nếu ký tự quá hẹp (tỷ lệ width/height < 0.40) -> Thường là số '1'
  const aspect = bw / bh;
  if (aspect <= 0.42 && bh >= 10) {
    return { char: '1', confidence: 0.92 };
  }

  // Nếu ký tự có dạng thanh ngang (chiều cao thấp, chiều rộng lớn) -> Dấu '-'
  if (aspect >= 1.6 && bh <= bw * 0.5) {
    return { char: '-', confidence: 0.90 };
  }

  // Lấy mật độ pixel tại 7 vùng cảm biến của số 7 đoạn
  const sampleZone = (x0: number, x1: number, y0: number, y1: number): number => {
    const px0 = Math.floor(minX + x0 * bw);
    const px1 = Math.ceil(minX + x1 * bw);
    const py0 = Math.floor(minY + y0 * bh);
    const py1 = Math.ceil(minY + y1 * bh);

    let active = 0;
    let total = 0;
    for (let y = py0; y <= py1; y++) {
      for (let x = px0; x <= px1; x++) {
        active += bin[y * w + x];
        total++;
      }
    }
    return total > 0 ? active / total : 0;
  };

  // 7 vùng tỷ lệ
  const densA = sampleZone(0.25, 0.75, 0.02, 0.22); // Top horizontal
  const densB = sampleZone(0.68, 0.98, 0.15, 0.46); // Top-right vertical
  const densC = sampleZone(0.68, 0.98, 0.54, 0.85); // Bottom-right vertical
  const densD = sampleZone(0.25, 0.75, 0.78, 0.98); // Bottom horizontal
  const densE = sampleZone(0.02, 0.32, 0.54, 0.85); // Bottom-left vertical
  const densF = sampleZone(0.02, 0.32, 0.15, 0.46); // Top-left vertical
  const densG = sampleZone(0.25, 0.75, 0.40, 0.60); // Middle horizontal

  const THRESH = 0.30;
  const bits = [
    densA >= THRESH ? '1' : '0',
    densB >= THRESH ? '1' : '0',
    densC >= THRESH ? '1' : '0',
    densD >= THRESH ? '1' : '0',
    densE >= THRESH ? '1' : '0',
    densF >= THRESH ? '1' : '0',
    densG >= THRESH ? '1' : '0',
  ].join('');

  // Đối sánh chính xác
  if (SEGMENT_TRUTH[bits]) {
    return { char: SEGMENT_TRUTH[bits], confidence: 0.95 };
  }

  // Đối sánh mờ (Hamming distance nhỏ nhất)
  let bestChar = '';
  let minDiff = 99;
  for (const [canonBits, ch] of Object.entries(SEGMENT_TRUTH)) {
    let diff = 0;
    for (let i = 0; i < 7; i++) {
      if (bits[i] !== canonBits[i]) diff++;
    }
    if (diff < minDiff) {
      minDiff = diff;
      bestChar = ch;
    }
  }

  if (minDiff <= 1) {
    return { char: bestChar, confidence: 0.75 };
  }

  return null;
}

/** Kiểm tra dấu chấm thập phân giữa 2 chữ số hoặc phía sau chữ số */
export function isDecimalDot(
  box: BoundingBox,
  refHeight: number,
  refBaseY: number,
): boolean {
  // Dấu chấm thập phân có diện tích nhỏ, nằm sát đáy chữ số
  const isSmall = box.width <= refHeight * 0.38 && box.height <= refHeight * 0.38;
  const isNearBottom = Math.abs(box.maxY - refBaseY) <= refHeight * 0.35;
  return isSmall && isNearBottom;
}

/** Nhận diện toàn diện từ dữ liệu ImageData của Canvas */
export function recognizeDisplayFromImageData(
  imgData: ImageData,
  options?: { invert?: boolean },
): OcrResult {
  const { width: w, height: h, data } = imgData;
  const totalPixels = w * h;

  // 1. Chuyển đổi sang Grayscale
  const gray = new Uint8Array(totalPixels);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    gray[j] = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
  }

  // 2. Ngưỡng tương phản Otsu
  const otsu = computeOtsuThreshold(gray);

  // 3. Phân cực (LCD nền sáng chữ tối hay LED nền tối chữ sáng)
  let borderSum = 0;
  let borderCount = 0;
  for (let x = 0; x < w; x++) {
    borderSum += gray[x] + gray[(h - 1) * w + x];
    borderCount += 2;
  }
  for (let y = 0; y < h; y++) {
    borderSum += gray[y * w] + gray[y * w + (w - 1)];
    borderCount += 2;
  }
  const avgBorder = borderSum / borderCount;

  // Mặc định: Nền sáng chữ đen (LCD) thì pixel < otsu là chữ.
  // Nếu nền tối chữ sáng (LED) hoặc người dùng chọn invert thì pixel >= otsu là chữ.
  let isDarkOnLight = avgBorder >= otsu;
  if (options?.invert) isDarkOnLight = !isDarkOnLight;

  const bin = new Uint8Array(totalPixels);
  for (let i = 0; i < totalPixels; i++) {
    bin[i] = isDarkOnLight ? (gray[i] < otsu ? 1 : 0) : (gray[i] >= otsu ? 1 : 0);
  }

  // 4. Tìm các vùng liên thông
  const boxes = findConnectedComponents(bin, w, h);

  // Lọc lấy các khối tiềm năng là chữ số
  // Chữ số màn hình đo đạc thường có chiều cao tương đối đồng đều
  const candidateDigits = boxes.filter(
    (b) => b.height >= Math.max(10, Math.round(h * 0.12)) && b.width >= 3,
  );

  if (!candidateDigits.length) {
    return {
      value: null,
      rawText: '',
      confidence: 0,
      candidates: [],
      polarity: isDarkOnLight ? 'dark_on_light' : 'light_on_dark',
      debugStats: { totalBlobs: boxes.length, detectedDigits: 0 },
    };
  }

  // Xác định chiều cao và đường cơ sở trung bình của các chữ số chính
  const heights = candidateDigits.map((b) => b.height).sort((a, b) => a - b);
  const medianHeight = heights[Math.floor(heights.length / 2)];
  const mainDigits = candidateDigits.filter(
    (b) => Math.abs(b.height - medianHeight) <= medianHeight * 0.45,
  );
  const refBaseY = Math.max(...mainDigits.map((b) => b.maxY));

  // 5. Tìm dấu chấm thập phân
  const dots = boxes.filter((b) => isDecimalDot(b, medianHeight, refBaseY));

  // Ghép chung chữ số và dấu chấm, sắp xếp thứ tự trái qua phải (theo minX)
  interface ItemToClassify {
    box: BoundingBox;
    isDot: boolean;
  }
  const allItems: ItemToClassify[] = [
    ...mainDigits.map((b) => ({ box: b, isDot: false })),
    ...dots.map((b) => ({ box: b, isDot: true })),
  ].sort((a, b) => a.box.minX - b.box.minX);

  // 6. Nhận diện từng ký tự
  let resultStr = '';
  let confSum = 0;
  let charCount = 0;

  for (let i = 0; i < allItems.length; i++) {
    const item = allItems[i];
    if (item.isDot) {
      // Tránh lặp liên tiếp 2 dấu chấm
      if (!resultStr.endsWith('.')) {
        resultStr += '.';
      }
    } else {
      const cls = classify7Segment(bin, w, item.box);
      if (cls) {
        resultStr += cls.char;
        confSum += cls.confidence;
        charCount++;
      }
    }
  }

  // Chuẩn hóa chuỗi số thu được
  // Loại bỏ các dấu chấm ở đầu hoặc cuối thừa
  let cleaned = resultStr.replace(/^[^\d\-]+/, '').replace(/[^\d]+$/, '');
  const parsedVal = parseFloat(cleaned);
  const validNum = Number.isFinite(parsedVal) ? parsedVal : null;
  const avgConf = charCount > 0 ? confSum / charCount : 0;

  const candidates: OcrCandidate[] = [];
  if (validNum !== null) {
    candidates.push({ value: validNum, text: cleaned, confidence: avgConf });

    // Tạo các candidate biến thể nếu có dấu chấm thập phân (phòng trường hợp bỏ sót dot hoặc nhận nhầm)
    if (cleaned.includes('.')) {
      const noDot = cleaned.replace(/\./g, '');
      const numNoDot = parseFloat(noDot);
      if (Number.isFinite(numNoDot)) {
        candidates.push({ value: numNoDot, text: noDot, confidence: avgConf * 0.8 });
      }
    }
  }

  return {
    value: validNum,
    rawText: resultStr,
    confidence: avgConf,
    candidates,
    polarity: isDarkOnLight ? 'dark_on_light' : 'light_on_dark',
    debugStats: {
      totalBlobs: boxes.length,
      detectedDigits: charCount,
    },
  };
}

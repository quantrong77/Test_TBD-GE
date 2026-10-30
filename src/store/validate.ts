// Kiểm tra kiểu dữ liệu từ nguồn ngoài (file JSON người khác gửi, dữ liệu kéo về từ Supabase).
// Sai một trường là từ chối cả bản ghi – dữ liệu này được vẽ ra giao diện.

const isArr = (x: unknown): x is unknown[] => Array.isArray(x);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^[\p{L}\p{N}_.\-|]{1,120}$/u;
const isStr = (x: unknown, max = 2000): x is string => typeof x === 'string' && x.length <= max;
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const isId = (x: unknown) => isStr(x) && ID.test(x);
const isDate = (x: unknown, allowEmpty = false) => isStr(x) && (DATE.test(x) || (allowEmpty && x === ''));
const isPair = (x: unknown) => isArr(x) && x.length === 2 && x.every(isNum);

function check(ok: boolean, what: string) {
  if (!ok) throw new Error(`Dữ liệu không hợp lệ: ${what}`);
}

const PROFILE_NUMS = ['unitCap_uF', 'unitsPerString', 'stringsPerGroup', 'groupsPerPhase', 'nominalTotal_uF', 'tagGap_mm', 'unbAlarm_pct', 'unbBypass_pct'];
export function vProfile(p: unknown) {
  const o = p as Record<string, unknown>;
  check(!!o && isId(o.id) && isStr(o.station, 200) && isStr(o.bank, 100), 'hồ sơ giàn');
  for (const k of PROFILE_NUMS) check(isNum(o[k]), `hồ sơ giàn – ${k}`);
  check(o.gapTol_mm === undefined || isNum(o.gapTol_mm), 'hồ sơ giàn – gapTol_mm');
  const v = o.vap as Record<string, unknown>;
  check(!!v && isPair(v.mC) && isNum(v.Vmin) && isPair(v.A), 'hồ sơ giàn – VAP');
  check(o.note === undefined || isStr(o.note), 'hồ sơ giàn – ghi chú');
}
export function vSession(s: unknown) {
  const o = s as Record<string, unknown>;
  check(!!o && isId(o.id) && isId(o.profileId) && isDate(o.date), 'phiên');
  check(['after_install', 'after_1y', 'periodic'].includes(o.type as string) && ['open', 'done'].includes(o.status as string), 'phiên – loại/trạng thái');
  check(isStr(o.leader, 200) && isArr(o.members) && o.members.every((m) => isStr(m, 200)), 'phiên – nhân sự');
  check(isArr(o.instruments) && o.instruments.every(isId) && isNum(o.createdAt), 'phiên – máy TN');
  check(o.conclusion === undefined || isStr(o.conclusion, 20000), 'phiên – kết luận');
  if (o.profileSnap !== undefined) vProfile(o.profileSnap);
  if (o.instrumentSnap !== undefined) {
    check(isArr(o.instrumentSnap), 'phiên – máy TN (bản chụp)');
    (o.instrumentSnap as unknown[]).forEach(vInstrument);
  }
}
export function vInstrument(i: unknown) {
  const o = i as Record<string, unknown>;
  check(!!o && isId(o.id) && isStr(o.model, 200) && isStr(o.serial, 200) && isDate(o.calibDue, true), 'máy thí nghiệm');
}
export function vMeasurement(m: unknown) {
  const o = m as Record<string, unknown>;
  check(!!o && isStr(o.id, 400) && isId(o.sessionId) && isStr(o.itemId, 10) && isStr(o.testId, 60) && isStr(o.key, 120) && isStr(o.value, 2000) && isNum(o.ts), 'số đo');
}
export function vCheck(c: unknown) {
  const o = c as Record<string, unknown>;
  check(!!o && isId(o.sessionId) && isId(o.gateId) && !!o.items && typeof o.items === 'object', 'cổng an toàn');
  check(Object.values(o.items as object).every((x) => typeof x === 'boolean'), 'cổng an toàn – mục');
  check(o.confirmedBy === undefined || isStr(o.confirmedBy, 200), 'cổng an toàn – người xác nhận');
  check(o.timestamp === undefined || isNum(o.timestamp), 'cổng an toàn – thời điểm');
  check(
    o.timed === undefined ||
      (!!o.timed && typeof o.timed === 'object' && Object.values(o.timed as object).every((x) => !!x && isNum((x as { at: unknown }).at) && typeof (x as { manual: unknown }).manual === 'boolean')),
    'cổng an toàn – mốc đồng hồ',
  );
}
export function vPhoto(p: unknown) {
  const o = p as Record<string, unknown>;
  check(!!o && isId(o.id) && isId(o.sessionId) && isStr(o.itemId, 10) && isStr(o.caption, 500) && isNum(o.ts), 'ảnh');
  // chỉ ảnh raster: SVG có thể chứa script khi mở bằng blob URL
  check(isStr(o.dataUrl, 20_000_000) && /^data:image\/(jpeg|png|webp);base64,/.test(o.dataUrl), 'ảnh – định dạng');
}
export function vPhotoMeta(p: unknown) {
  const o = p as Record<string, unknown>;
  check(!!o && isId(o.id) && isId(o.sessionId) && isStr(o.itemId, 10) && isStr(o.caption, 500) && isNum(o.ts), 'ảnh');
}export function vSignature(s: unknown) {
  const o = s as Record<string, unknown>;
  check(!!o && isStr(o.id, 300) && isId(o.sessionId) && ['tester', 'leader', 'qlvh'].includes(o.slot as string), 'chữ ký');
  check(isStr(o.userId, 64) && isStr(o.email, 200) && isStr(o.name, 200) && ['admin', 'leader', 'tester', 'viewer'].includes(o.role as string), 'chữ ký – người ký');
  check(isNum(o.signedAt) && isStr(o.hash, 128) && /^[0-9a-f]{64}$/.test(o.hash as string), 'chữ ký – mã nội dung');
}

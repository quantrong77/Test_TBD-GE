export type Result = 'pass' | 'fail' | 'warn' | 'na';

export interface Threshold {
  id: string;
  label: string;
  op: '<' | '<=' | '>=' | 'range' | 'approx0';
  value?: number;
  min?: number;
  max?: number;
  nominal?: number;
  tol?: number;
  unit: string;
  profileOverride?: boolean;
  /** đánh giá theo trị tuyệt đối */
  abs?: boolean;
  item?: string;
  note?: string;
}

export interface ProfileLimits {
  unbAlarm_pct: number;
  unbBypass_pct: number;
  vap: { mC: [number, number]; Vmin: number; A: [number, number] };
}

export interface Profile extends ProfileLimits {
  id: string;
  station: string;
  bank: string;
  unitCap_uF: number;
  unitsPerString: number;
  stringsPerGroup: number;
  groupsPerPhase: number;
  nominalTotal_uF: number;
  tagGap_mm: number;
  gapTol_mm?: number;
  note?: string;
}

/** Inline rich text: supports **bold** only; rendered escaped. */
export type Text = string;

export interface Callout {
  level: 'danger' | 'warn' | 'info';
  text: Text;
}

export interface Step {
  n: number;
  text: Text;
  img?: string | null;
  record?: string;
  note?: Text;
  timer?: number;
  equip?: string;
}

export interface Test {
  id: string;
  title: string;
  purpose?: Text[];
  tools?: Text[];
  callouts?: Callout[];
  checklist?: Text[];
  steps?: Step[];
  table?: { head: string[]; rows: string[][] };
  tips?: Text[];
  thresholds?: string[];
  images?: string[];
  form?: string;
  gate?: string;
  extraTables?: { title?: string; head: string[]; rows: string[][] }[];
}

export interface Item {
  id: string;
  tab: string;
  title: string;
  short: string;
  danger?: boolean;
  purpose: Text[];
  tools: Text[];
  safetyGate: string;
  callouts?: Callout[];
  tests: Test[];
  thresholds: string[];
  images: string[];
}

export interface GateDef {
  id: string;
  title: string;
  checks: { id: string; text: Text; timer?: number }[];
}

/** Đơn vị thí nghiệm (đầu biên bản) + cách đánh số biên bản. Quản trị thêm/sửa/xóa. */
export interface Unit {
  id: string;
  /** Tên đơn vị cấp trên, vd "Trung tâm Sửa chữa, thí nghiệm điện 3" */
  orgName: string;
  /** Tên đơn vị thí nghiệm, vd "Đội Sửa chữa, thí nghiệm điện Lâm Đồng" */
  name: string;
  /** Mẫu số biên bản: {nn} = số thứ tự 2 chữ số, {yyyy} = năm */
  reportFormat: string;
  /** Số bắt đầu do Quản trị đặt, áp dụng cho năm numberYear; năm khác tự bắt đầu lại từ 01 */
  numberStart: number;
  numberYear: number;
}

/** Nhân viên thuộc đơn vị thí nghiệm – để chọn khi chuẩn bị phiên. */
export interface Staff {
  id: string;
  unitId: string;
  name: string;
  title: string;
  /** Bậc an toàn điện 1–5 */
  safetyGrade: number;
  /** Đã nghỉ / chuyển đơn vị: ẩn khỏi danh sách chọn, phiên cũ vẫn giữ tên */
  inactive?: boolean;
}

/** Người trong phiên (bản chụp lúc tạo phiên – sửa danh sách nhân viên sau này không đổi biên bản cũ). */
export interface CrewMember {
  staffId?: string;
  name: string;
  title?: string;
  safetyGrade?: number;
}

export interface Session {
  id: string;
  profileId: string;
  date: string;
  type: 'after_install' | 'after_1y' | 'periodic';
  leader: string;
  members: string[];
  instruments: string[];
  status: 'open' | 'done';
  conclusion?: string;
  createdAt: number;
  /** bản chụp hồ sơ giàn & máy TN lúc tạo phiên – sửa hồ sơ sau này không đổi kết quả cũ */
  profileSnap?: Profile;
  instrumentSnap?: Instrument[];
  /** Đơn vị thí nghiệm (bản chụp đầu biên bản) */
  unitId?: string;
  unitSnap?: Pick<Unit, 'orgName' | 'name' | 'reportFormat'>;
  /** Số thứ tự biên bản trong năm (theo đơn vị) */
  reportNo?: number;
  /** Nhân sự chi tiết; `leader`/`members` vẫn giữ tên để tương thích dữ liệu cũ */
  crew?: { leader?: CrewMember; responsible?: CrewMember; members: CrewMember[] };
  /** Hạng mục thực hiện (itemId); không có = tất cả (phiên cũ) */
  items?: string[];
  /** Phiên nhập lại số liệu từ biên bản giấy cũ: không cấp số biên bản, không ký, không cần cổng an toàn */
  historical?: boolean;
  /** Số / ký hiệu biên bản giấy gốc (phiên nhập lại) */
  paperRef?: string;
}

export interface Measurement {
  id: string; // `${sessionId}|${itemId}|${testId}|${key}`
  sessionId: string;
  itemId: string;
  testId: string;
  key: string;
  value: string;
  result?: Result;
  ts: number;
}

export interface GateCheck {
  sessionId: string;
  gateId: string;
  items: Record<string, boolean>;
  confirmedBy?: string;
  timestamp?: number;
  /** lần tích/lưu cuối – dùng cho hạn hiệu lực 12 giờ */
  updatedAt?: number;
  /** mốc bắt đầu của mục có đồng hồ (vd cô lập tụ 15 phút); manual = nhập giờ tay theo phiếu công tác */
  timed?: Record<string, { at: number; manual: boolean }>;
}

export interface Photo {
  id: string;
  sessionId: string;
  itemId: string;
  blob: Blob;
  caption: string;
  ts: number;
}

export interface Instrument {
  id: string;
  model: string;
  serial: string;
  calibDue: string;
  note?: string;
}

export type Role = 'admin' | 'leader' | 'tester' | 'viewer';
/** Ô ký trên biên bản: Người thí nghiệm, Chỉ huy trực tiếp (ký xong → khóa). Ô QLVH cũ đã bỏ (dữ liệu cũ bị bỏ qua khi xuất). */
export type SignSlot = 'tester' | 'leader';

/** Chữ ký xác nhận điện tử – gắn tài khoản đã duyệt, kèm mã kiểm tra nội dung (SHA-256). */
export interface Signature {
  id: string; // `${sessionId}|${slot}|${userId}`
  sessionId: string;
  slot: SignSlot;
  userId: string;
  email: string;
  name: string;
  role: Role;
  signedAt: number;
  hash: string;
}

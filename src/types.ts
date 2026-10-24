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

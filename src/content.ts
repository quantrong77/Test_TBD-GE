import itemsJson from '../content/items.json';
import thresholdsJson from '../content/thresholds.json';
import safetyJson from '../content/safety.json';
import overviewJson from '../content/overview.json';
import toolsJson from '../content/tools.json';
import cycleJson from '../content/cycle.json';
import equipmentJson from '../content/equipment.json';
import profilesSeed from '../content/profiles.seed.json';
import reviewJson from '../content/review.json';
import type { Callout, GateDef, Item, Profile, Step, Threshold } from './types';

export const CONTENT_VERSION = itemsJson.version;
export const items = itemsJson.items as Item[];
export const thresholds = thresholdsJson as Threshold[];
export const gates = safetyJson.gates as GateDef[];
export const safety = safetyJson as { risks: { level: 'warn' | 'danger'; risk: string; measure: string }[]; command: string; disclaimer: string };
export const overview = overviewJson;
export const tools = toolsJson;
export const cycle = cycleJson;
export const review = reviewJson as string[][];

export interface EquipSection {
  id: string;
  title: string;
  table?: { head: string[]; rows: string[][] };
  cards?: { name: string; icon: string; desc: string }[];
  steps?: (Step & { lock?: boolean })[];
  callouts?: Callout[];
  points?: string[];
  images?: string[];
  tableImages?: string[];
}
export interface Equipment {
  id: string;
  name: string;
  short: string;
  usedIn: { item: string; test: string; label: string }[];
  docRef: string;
  images: string[];
  monitor?: boolean;
  sections: EquipSection[];
}
export const equipment = equipmentJson as Equipment[];

export const getItem = (id: string) => items.find((i) => i.id === id);
export const getTest = (itemId: string, testId: string) => getItem(itemId)?.tests.find((t) => t.id === testId);
export const getGate = (id: string) => gates.find((g) => g.id === id);
export const getThreshold = (id: string) => thresholds.find((t) => t.id === id);
export const getEquipment = (id: string) => equipment.find((e) => e.id === id);

/** Hồ sơ mẫu TBD503 T500 Pleiku 2 (mục 7.3) – các giàn khác kế thừa, phải đối chiếu biên bản. */
export const PROFILE_DEFAULTS: Omit<Profile, 'id' | 'station' | 'bank' | 'tagGap_mm'> = {
  unitCap_uF: 13.05,
  unitsPerString: 6,
  stringsPerGroup: 24,
  groupsPerPhase: 2,
  nominalTotal_uF: 104.4,
  gapTol_mm: 2,
  unbAlarm_pct: 0.16,
  unbBypass_pct: 0.22,
  vap: { mC: [91.8, 1.4], Vmin: 900, A: [4.5, 0.14] },
  note: 'Số liệu theo biên bản mẫu – luôn đối chiếu biên bản/data sheet của giàn đang thí nghiệm',
};

export const seedProfiles = (): Profile[] =>
  (profilesSeed as { id: string; station: string; bank: string; tagGap_mm: number; note?: string; sample?: boolean }[]).map((p) => ({
    ...PROFILE_DEFAULTS,
    id: p.id,
    station: p.station,
    bank: p.bank,
    tagGap_mm: p.tagGap_mm,
    note: p.sample
      ? PROFILE_DEFAULTS.note
      : `${p.note ? p.note + '. ' : ''}Khe hở TAG theo đặc tả; ngưỡng khác lấy mặc định của TBD503 Pleiku 2 – PHẢI nhập lại theo biên bản giàn.`,
  }));

/** Các cổng phải qua trước khi vào trình tự của 1 phép thử (theo thứ tự). */
export function gatesFor(itemId: string, testId?: string): string[] {
  const item = getItem(itemId);
  if (!item) return [];
  const out = ['gate-platform'];
  if (item.safetyGate && !out.includes(item.safetyGate)) out.push(item.safetyGate);
  const t = testId ? getTest(itemId, testId) : undefined;
  if (t?.gate && !out.includes(t.gate)) out.push(t.gate);
  return out;
}

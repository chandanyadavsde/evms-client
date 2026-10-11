/**
 * Plugin state in chrome.storage.local — shared by the background worker and the side panel.
 * The VMS token lives here; AI keys never do (they stay on the VMS server).
 */

export interface Settings {
  /** VMS API, e.g. http://localhost:4100 */
  apiBase: string;
  /** VMS web app, for "Review in VMS", e.g. http://localhost:5180 */
  webBase: string;
  token: string | null;
  user: { name: string; email: string | null } | null;
}

/** Same shape as the server's IntakeDraft (packages/contracts/src/intake.ts). */
export interface IntakeField {
  text: string | null;
  value: string | null;
  label: string | null;
  status: 'found' | 'unsure' | 'missing';
  note?: string;
}
export interface DraftMove {
  client: IntakeField;
  jobType: IntakeField;
  size: IntakeField;
  containerNumber: IntakeField;
  from: IntakeField;
  to: IntakeField;
  readyAt: IntakeField;
  cutoffAt: IntakeField;
  duplicateOf?: string;
}
export interface IntakeDraft {
  sourceKind: 'customer_order' | 'portal_pendency' | 'other';
  detectedAs: string;
  summary: string;
  moves: DraftMove[];
  pendency: {
    group: string;
    size: string;
    allocated: number | null;
    done: number | null;
    balance: number | null;
  }[];
  questions: string[];
  notes: string;
}

/** One copied area and what VMS made of it. */
export interface Snip {
  id: string;
  at: number;
  url: string;
  title: string;
  /** Text found on the page inside the box (exact, no OCR). */
  text: string;
  /** Cropped screenshot as a data URL. */
  image: string;
  status: 'reading' | 'done' | 'failed' | 'created';
  error?: string;
  intakeId?: string;
  provider?: string;
  draft?: IntakeDraft;
  createdMoves?: number;
}

export const DEFAULT_SETTINGS: Settings = {
  apiBase: 'http://localhost:4100',
  webBase: 'http://localhost:5180',
  token: null,
  user: null,
};

const SETTINGS = 'vms.settings';
const SNIPS = 'vms.snips';
/** The plugin clipboard keeps the last few snips. */
export const MAX_SNIPS = 10;

export async function getSettings(): Promise<Settings> {
  const got = await chrome.storage.local.get(SETTINGS);
  return { ...DEFAULT_SETTINGS, ...(got[SETTINGS] as Partial<Settings> | undefined) };
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch };
  await chrome.storage.local.set({ [SETTINGS]: next });
  return next;
}

export async function getSnips(): Promise<Snip[]> {
  const got = await chrome.storage.local.get(SNIPS);
  return (got[SNIPS] as Snip[] | undefined) ?? [];
}

export async function putSnip(snip: Snip): Promise<void> {
  const others = (await getSnips()).filter((s) => s.id !== snip.id);
  await chrome.storage.local.set({ [SNIPS]: [snip, ...others].slice(0, MAX_SNIPS) });
}

export async function updateSnip(id: string, patch: Partial<Snip>): Promise<void> {
  const snips = await getSnips();
  await chrome.storage.local.set({
    [SNIPS]: snips.map((s) => (s.id === id ? { ...s, ...patch } : s)),
  });
}

export async function removeSnip(id: string | 'all'): Promise<void> {
  const snips = id === 'all' ? [] : (await getSnips()).filter((s) => s.id !== id);
  await chrome.storage.local.set({ [SNIPS]: snips });
}

export const STORAGE_KEYS = { SETTINGS, SNIPS };

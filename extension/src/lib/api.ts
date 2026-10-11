import { type DraftMove, getSettings, type IntakeDraft, saveSettings } from './store';

/** Calls to the VMS API with the signed-in manager's token. */

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const s = await getSettings();
  const headers = new Headers(init.headers);
  if (s.token) headers.set('authorization', `Bearer ${s.token}`);
  let body = init.body;
  if (init.json !== undefined) {
    headers.set('content-type', 'application/json');
    body = JSON.stringify(init.json);
  }
  let res: Response;
  try {
    res = await fetch(`${s.apiBase.replace(/\/$/, '')}${path}`, { ...init, headers, body });
  } catch {
    throw new ApiError(0, `Cannot reach VMS at ${s.apiBase} — is the server running?`);
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    if (res.status === 401 && s.token) await saveSettings({ token: null, user: null });
    throw new ApiError(res.status, data?.error ?? res.statusText);
  }
  return data as T;
}

export const requestCode = (identifier: string) =>
  call<{ sent: boolean; devHint?: string }>('/v1/auth/otp/request', {
    method: 'POST',
    json: { identifier },
  });

export async function verifyCode(identifier: string, code: string) {
  const res = await call<{
    token: string;
    user: { name: string; email: string | null; roles: string[] };
  }>('/v1/auth/otp/verify', { method: 'POST', json: { identifier, code } });
  if (!res.user.roles.some((r) => r === 'manager' || r === 'admin')) {
    throw new ApiError(403, 'The plugin is for managers — sign in with a manager account');
  }
  await saveSettings({ token: res.token, user: { name: res.user.name, email: res.user.email } });
  return res;
}

export const intakeStatus = () =>
  call<{ reader: string; readsImages: boolean; testDataOnly: boolean; spentUsd: number | null }>(
    '/v1/intake/status',
  );

export async function uploadImage(png: Blob): Promise<string> {
  const form = new FormData();
  form.append('file', png, 'snip.png');
  const { key } = await call<{ key: string }>('/v1/files', { method: 'POST', body: form });
  return key;
}

export const readIntake = (input: {
  text: string;
  fileKeys: string[];
  source: { kind: 'plugin'; url: string; title: string };
}) =>
  call<{ id: string; provider: string; draft: IntakeDraft }>('/v1/intake/read', {
    method: 'POST',
    json: input,
  });

const REQUIRED: (keyof DraftMove)[] = ['client', 'jobType', 'size', 'from', 'to'];

/** A draft can be created straight from the plugin only when nothing required is in doubt. */
export const readyToCreate = (d: IntakeDraft) =>
  d.moves.length > 0 &&
  d.moves.every((m) =>
    REQUIRED.every((k) => {
      const f = m[k];
      return typeof f === 'object' && f.status === 'found' && !!f.value;
    }),
  ) &&
  d.moves.every((m) => m.containerNumber.status !== 'unsure' && !m.duplicateOf);

export const confirmIntake = (id: string, d: IntakeDraft) =>
  call<{ moveIds: string[] }>(`/v1/intake/${id}/confirm`, {
    method: 'POST',
    json: {
      moves: d.moves.map((m) => ({
        clientId: m.client.value,
        jobTypeId: m.jobType.value,
        cargoTypeId: m.size.value,
        fromLocationId: m.from.value,
        toLocationId: m.to.value,
        ...(m.containerNumber.value ? { containerNumber: m.containerNumber.value } : {}),
        ...(m.readyAt.value ? { readyAt: m.readyAt.value } : {}),
        ...(m.cutoffAt.value ? { cutoffAt: m.cutoffAt.value } : {}),
      })),
    },
  });

// ─── Smart paste ───────────────────────────────────────────────────────────

/** Data a form can be filled from: a planned VMS job, or a copied snip. */
export interface PasteSource {
  id: string;
  label: string;
  data: Record<string, string>;
  legId?: string;
}

export async function pasteSources(): Promise<PasteSource[]> {
  const rows =
    await call<{ legId: string; status: string; label: string; data: Record<string, string> }[]>(
      '/v1/assist/sources',
    );
  return rows.map((r) => ({
    id: `leg:${r.legId}`,
    legId: r.legId,
    label: `${r.status === 'active' ? 'On trip' : 'Planned'} · ${r.label}`,
    data: r.data,
  }));
}

export interface FormField {
  key: string;
  label: string;
  kind: string;
  options?: string[];
  maxLength?: number;
}

export const mapForm = (url: string, fields: FormField[], data: Record<string, string>) =>
  call<{
    values: { key: string; dataKey: string; value: string; status: 'fill' | 'unknown' }[];
    learned: boolean;
    by: string;
  }>('/v1/assist/map', { method: 'POST', json: { url, fields, data } });

export const formFilled = (input: {
  url: string;
  title: string;
  legId?: string;
  fields: { key: string; label: string; dataKey: string }[];
}) => call<{ ok: boolean }>('/v1/assist/filled', { method: 'POST', json: input });

/** Small fetch wrapper: adds the token, turns API errors into ApiError with field details. */

const TOKEN_KEY = 'vms.token';

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // storage unavailable (private mode): session works until reload
  }
}

export interface FieldError {
  field: string;
  message: string;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
  get fieldErrors(): FieldError[] {
    return Array.isArray(this.details) &&
      this.details.every((d) => d && typeof d === 'object' && 'field' in d)
      ? (this.details as FieldError[])
      : [];
  }
}

export async function api<T>(
  path: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  const token = getToken();
  if (token) headers.set('authorization', `Bearer ${token}`);
  let body = init.body;
  if (init.json !== undefined) {
    headers.set('content-type', 'application/json');
    body = JSON.stringify(init.json);
  }
  const res = await fetch(path, { ...init, headers, body });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    if (res.status === 401 && token) {
      setToken(null);
      window.location.assign('/login');
    }
    throw new ApiError(res.status, data?.error ?? res.statusText, data?.details);
  }
  return data as T;
}

export async function uploadFile(file: Blob, name: string): Promise<string> {
  const form = new FormData();
  form.append('file', file, name);
  const { key } = await api<{ key: string }>('/v1/files', { method: 'POST', body: form });
  return key;
}

export const fileUrl = (key: string) =>
  `/v1/files/${key}?token=${encodeURIComponent(getToken() ?? '')}`;

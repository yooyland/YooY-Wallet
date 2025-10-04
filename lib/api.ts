import { Config } from '@/constants/config';

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string; status?: number };

async function request<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  try {
    if (!Config.baseURL) {
      return { ok: false, error: 'API base URL not configured' };
    }
    const res = await fetch(`${Config.baseURL}${path}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
      ...init,
    });
    const text = await res.text();
    const json = text ? JSON.parse(text) : undefined;
    if (!res.ok) {
      return { ok: false, error: json?.message ?? res.statusText, status: res.status };
    }
    return { ok: true, data: json as T };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'Network error' };
  }
}

export const api = {
  post: <T>(path: string, body?: any, init?: RequestInit) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined, ...init }),
  get: <T>(path: string, init?: RequestInit) => request<T>(path, { method: 'GET', ...init }),
};



import { Config } from '@/constants/config';

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string; status?: number };

async function request<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  try {
    if (!Config.baseURL) {
      return { ok: false, error: 'API base URL not configured' };
    }
    // Timeout 제어
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Config.requestTimeoutMs);

    const started = Date.now();
    const res = await fetch(`${Config.baseURL}${path}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
      signal: controller.signal,
      cache: 'no-store',
      // Android에서 연결이 길게 유지되며 블로킹되는 현상 방지
      keepalive: false as any,
      ...init,
    });

    clearTimeout(timeout);

    const text = await res.text();
    const json = text ? JSON.parse(text) : undefined;
    if (!res.ok) {
      return { ok: false, error: json?.message ?? res.statusText, status: res.status };
    }
    return { ok: true, data: json as T };
  } catch (e: any) {
    const msg = e?.name === 'AbortError' ? 'Network timeout' : (e?.message ?? 'Network error');
    return { ok: false, error: msg };
  }
}

export const api = {
  post: <T>(path: string, body?: any, init?: RequestInit) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined, ...init }),
  get: <T>(path: string, init?: RequestInit) => request<T>(path, { method: 'GET', ...init }),
};



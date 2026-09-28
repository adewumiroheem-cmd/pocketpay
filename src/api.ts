type ApiResult<T = unknown> = { data: T };

async function request<T>(method: string, path: string, payload?: Record<string, unknown>): Promise<ApiResult<T>> {
  const url = new URL(path, window.location.origin);
  const options: RequestInit = { method, headers: { Accept: 'application/json' } };

  if (method === 'GET') {
    for (const [key, value] of Object.entries(payload || {})) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    }
  } else {
    options.headers = { ...options.headers, 'Content-Type': 'application/json' };
    options.body = JSON.stringify(payload || {});
  }

  const response = await fetch(url.toString(), options);
  let data: any = null;
  try {
    data = await response.json();
  } catch {
    data = { error: response.statusText || 'Request failed' };
  }
  if (!response.ok) {
    const error = new Error(data?.error || 'Request failed');
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }
  return { data };
}

export const api = {
  get: <T = any>(path: string, query?: Record<string, unknown>) => request<T>('GET', path, query),
  post: <T = any>(path: string, body?: Record<string, unknown>) => request<T>('POST', path, body),
  put: <T = any>(path: string, body?: Record<string, unknown>) => request<T>('PUT', path, body),
};

export type Role = 'system_admin' | 'admin' | 'manager' | 'sales';
export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: string;
  teamId: string | null;
};

function csrfToken(): string {
  return (
    document.cookie
      .split('; ')
      .find((item) => item.startsWith('sales_ai_csrf='))
      ?.split('=')[1] ?? ''
  );
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set('content-type', 'application/json');
  if (init.method && init.method !== 'GET')
    headers.set('x-csrf-token', decodeURIComponent(csrfToken()));
  const response = await fetch(`/backend${path}`, {
    ...init,
    headers,
    credentials: 'same-origin',
    cache: 'no-store',
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    throw new Error(body?.error?.message ?? '処理に失敗しました');
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

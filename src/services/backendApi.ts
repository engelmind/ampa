import { AppUser, Family, SystemSettings } from '../types/family';

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body?.error || `HTTP_${response.status}`);
    (error as any).status = response.status;
    (error as any).body = body;
    throw error;
  }
  return body as T;
}

export const backendApi = {
  health: () => request<{ ok: boolean; database: string; mode: string }>('/api/health'),
  login: (username: string, password: string) =>
    request<{ user: AppUser }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  logout: () => request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),
  me: () => request<{ user: AppUser }>('/api/auth/me'),
  getFamilies: () => request<{ families: Family[] }>('/api/families'),
  createFamily: (family: Family) =>
    request<{ id: string }>('/api/families', { method: 'POST', body: JSON.stringify(family) }),
  renewFamily: (familyId: string, academicYear: string, status: 'renewed' | 'pending' | 'inactive') =>
    request<{ ok: boolean }>('/api/renewals', { method: 'POST', body: JSON.stringify({ familyId, academicYear, status }) }),
  getSettings: () => request<{ settings: SystemSettings }>('/api/settings'),
  saveSettings: (settings: SystemSettings) =>
    request<{ settings: SystemSettings }>('/api/settings', { method: 'PUT', body: JSON.stringify(settings) }),
};

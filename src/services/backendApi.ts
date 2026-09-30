import { ActivityLogEntry, AppUser, Family, SystemSettings } from '../types/family';

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
  health: () => request<{ ok: boolean; database: string; mode: string; users?: number }>('/api/health'),

  bootstrap: (payload: { code: string; username: string; email?: string; name: string; password: string }) =>
    request<{ user: AppUser }>('/api/setup/bootstrap', { method: 'POST', body: JSON.stringify(payload) }),

  login: (username: string, password: string) =>
    request<{ user: AppUser }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  logout: () => request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),
  me: () => request<{ user: AppUser }>('/api/auth/me'),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ ok: boolean }>('/api/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) }),

  getFamilies: () => request<{ families: Family[] }>('/api/families'),
  createFamily: (family: Family) =>
    request<{ id: string }>('/api/families', { method: 'POST', body: JSON.stringify(family) }),
  updateFamily: (family: Family) =>
    request<{ ok: boolean }>(`/api/families/${family.id}`, { method: 'PUT', body: JSON.stringify(family) }),
  deleteFamily: (familyId: string) =>
    request<{ ok: boolean }>(`/api/families/${familyId}`, { method: 'DELETE' }),

  renewFamily: (familyId: string, academicYear: string, status: 'renewed' | 'pending' | 'inactive') =>
    request<{ ok: boolean }>('/api/renewals', { method: 'POST', body: JSON.stringify({ familyId, academicYear, status }) }),

  getSettings: () => request<{ settings: SystemSettings }>('/api/settings'),
  saveSettings: (settings: SystemSettings) =>
    request<{ settings: SystemSettings }>('/api/settings', { method: 'PUT', body: JSON.stringify(settings) }),

  getActivity: (entityId?: string) =>
    request<{ activity: ActivityLogEntry[] }>(`/api/activity${entityId ? `?entityId=${encodeURIComponent(entityId)}` : ''}`),

  getUsers: () => request<{ users: AppUser[] }>('/api/users'),
  createUser: (user: Pick<AppUser, 'username' | 'email' | 'name' | 'role' | 'password'>) =>
    request<{ user: AppUser }>('/api/users', { method: 'POST', body: JSON.stringify(user) }),
  updateUser: (id: string, patch: Partial<Pick<AppUser, 'name' | 'email' | 'role' | 'isActive' | 'password'>>) =>
    request<{ user: AppUser }>(`/api/users/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
};

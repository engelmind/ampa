import { ActivityLogEntry, AppUser } from '../types/family';

const ACTIVITY_STORAGE_KEY = 'ampa_activity_log_v1';

export function getActivityLog(): ActivityLogEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(ACTIVITY_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function addActivity(
  user: AppUser,
  entry: Omit<ActivityLogEntry, 'id' | 'userId' | 'userName' | 'timestamp'>
): ActivityLogEntry[] {
  const next: ActivityLogEntry = {
    ...entry,
    id: crypto.randomUUID(),
    userId: user.id,
    userName: user.name,
    timestamp: new Date().toISOString(),
  };
  const updated = [next, ...getActivityLog()].slice(0, 500);
  if (typeof window !== 'undefined') localStorage.setItem(ACTIVITY_STORAGE_KEY, JSON.stringify(updated));
  return updated;
}

export function clearActivityLog(): void {
  if (typeof window !== 'undefined') localStorage.removeItem(ACTIVITY_STORAGE_KEY);
}

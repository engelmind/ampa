import { AppUser } from '../types/family';

const USERS_STORAGE_KEY = 'ampa_users_db_v2';
const SESSION_STORAGE_KEY = 'ampa_current_session_v2';

export const INITIAL_USERS: AppUser[] = [
  {
    id: 'usr-superadmin-demo',
    username: 'demo_super',
    name: 'Superadministración · Demo',
    email: 'superadmin@demo.invalid',
    role: 'superadmin',
    password: 'demo-super-2026',
    isActive: true,
  },
  {
    id: 'usr-admin-demo',
    username: 'demo_admin',
    name: 'Administración · Demo',
    email: 'admin@demo.invalid',
    role: 'admin',
    password: 'demo-admin-2026',
    isActive: true,
  },
  {
    id: 'usr-user-demo',
    username: 'demo_consulta',
    name: 'Consulta · Demo',
    email: 'consulta@demo.invalid',
    role: 'user',
    password: 'demo-consulta-2026',
    isActive: true,
  },
];

export function getUsers(): AppUser[] {
  if (typeof window === 'undefined') return INITIAL_USERS;
  try {
    const raw = localStorage.getItem(USERS_STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(INITIAL_USERS));
      return INITIAL_USERS;
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(INITIAL_USERS));
      return INITIAL_USERS;
    }
    return parsed;
  } catch {
    return INITIAL_USERS;
  }
}

export function saveUser(user: AppUser): AppUser[] {
  const users = getUsers();
  const index = users.findIndex((u) => u.id === user.id);
  const updated = index >= 0 ? users.map((u, i) => i === index ? user : u) : [...users, user];
  if (typeof window !== 'undefined') {
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(updated));
  }
  return updated;
}

export function deleteUser(id: string): AppUser[] {
  const users = getUsers();
  const target = users.find((u) => u.id === id);
  const superadmins = users.filter((u) => u.role === 'superadmin');
  if (target?.role === 'superadmin' && superadmins.length <= 1) {
    throw new Error('Debe existir al menos una cuenta de Superadministración.');
  }
  const remaining = users.filter((u) => u.id !== id);
  if (typeof window !== 'undefined') {
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(remaining));
  }
  return remaining;
}

export function getCurrentUser(): AppUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setCurrentUserSession(user: AppUser | null): void {
  if (typeof window === 'undefined') return;
  if (!user) localStorage.removeItem(SESSION_STORAGE_KEY);
  else localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(user));
}

export function logout(): void {
  setCurrentUserSession(null);
}

export function authenticate(usernameOrEmail: string, password: string): AppUser | null {
  const users = getUsers();
  const query = usernameOrEmail.trim().toLowerCase();
  const pass = password.trim();

  const found = users.find(
    (u) =>
      (u.username.toLowerCase() === query || u.email?.toLowerCase() === query) &&
      u.password === pass &&
      u.isActive !== false
  );

  if (found) {
    const updatedUser = { ...found, lastLoginAt: new Date().toISOString(), isActive: found.isActive !== false };
    saveUser(updatedUser);
    setCurrentUserSession(updatedUser);
    return updatedUser;
  }
  return null;
}

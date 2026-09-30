import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { VercelRequest } from '@vercel/node';
import { getCookie } from './http.js';
import { query } from './db.js';

export type ServerRole = 'superadmin' | 'admin' | 'user';

export interface ServerUser {
  id: string;
  username: string;
  email: string | null;
  name: string;
  role: ServerRole;
  isActive: boolean;
  lastLoginAt: string | null;
}

const SESSION_TTL_SECONDS = 60 * 60 * 12;

export function hashToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function createSession(userId: string) {
  const token = crypto.randomBytes(32).toString('base64url');
  await query(
    `insert into sessions(user_id, token_hash, expires_at)
     values ($1, $2, now() + interval '12 hours')`,
    [userId, hashToken(token)]
  );
  return { token, maxAgeSeconds: SESSION_TTL_SECONDS };
}

export async function deleteSessionToken(token: string | null) {
  if (!token) return;
  await query('delete from sessions where token_hash = $1', [hashToken(token)]);
}

export async function getSessionUser(req: VercelRequest): Promise<ServerUser | null> {
  const token = getCookie(req, 'ampa_session');
  if (!token) return null;
  const result = await query(
    `select u.id, u.username, u.email, u.name, u.role, u.is_active, u.last_login_at
     from sessions s join app_users u on u.id = s.user_id
     where s.token_hash = $1 and s.expires_at > now() and u.is_active = true limit 1`,
    [hashToken(token)]
  );
  if (!result.rowCount) return null;
  const row = result.rows[0];
  return { id: row.id, username: row.username, email: row.email, name: row.name, role: row.role, isActive: row.is_active, lastLoginAt: row.last_login_at };
}

export async function requireUser(req: VercelRequest): Promise<ServerUser> {
  const user = await getSessionUser(req);
  if (!user) throw Object.assign(new Error('UNAUTHORIZED'), { statusCode: 401 });
  return user;
}

export async function requireRole(req: VercelRequest, roles: ServerRole[]): Promise<ServerUser> {
  const user = await requireUser(req);
  if (!roles.includes(user.role)) throw Object.assign(new Error('FORBIDDEN'), { statusCode: 403 });
  return user;
}

export async function logActivity(args: { userId?: string | null; entityType: string; entityId?: string | null; entityLabel?: string | null; action: string; summary: string; }) {
  await query(
    `insert into activity_log(user_id, entity_type, entity_id, entity_label, action, summary)
     values ($1,$2,$3,$4,$5,$6)`,
    [args.userId || null, args.entityType, args.entityId || null, args.entityLabel || null, args.action, args.summary]
  );
}

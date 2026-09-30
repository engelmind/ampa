import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createSession, logActivity, verifyPassword } from '../_lib/auth.js';
import { query } from '../_lib/db.js';
import { getBody, json, methodNotAllowed, setSessionCookie } from '../_lib/http.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  try {
    const { username, password } = getBody<{ username?: string; password?: string }>(req);
    if (!username || !password) return json(res, 400, { error: 'MISSING_CREDENTIALS' });

    const found = await query(
      `select id, username, email, name, role, password_hash, is_active
       from app_users where lower(username)=lower($1) or lower(coalesce(email,''))=lower($1) limit 1`,
      [username.trim()]
    );
    if (!found.rowCount || found.rows[0].is_active !== true) return json(res, 401, { error: 'INVALID_CREDENTIALS' });

    const row = found.rows[0];
    if (!(await verifyPassword(password, row.password_hash))) return json(res, 401, { error: 'INVALID_CREDENTIALS' });

    await query('update app_users set last_login_at=now(), updated_at=now() where id=$1', [row.id]);
    const session = await createSession(row.id);
    setSessionCookie(res, session.token, session.maxAgeSeconds);
    await logActivity({ userId: row.id, entityType: 'user', entityId: row.id, entityLabel: row.name, action: 'login', summary: 'Inicio de sesión' });

    return json(res, 200, { user: { id: row.id, username: row.username, email: row.email, name: row.name, role: row.role, isActive: true } });
  } catch (error: any) {
    if (error?.message === 'DATABASE_URL_NOT_CONFIGURED') return json(res, 503, { error: 'BACKEND_NOT_CONFIGURED' });
    console.error(error);
    return json(res, 500, { error: 'LOGIN_FAILED' });
  }
}

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { hashPassword, logActivity, requireRole } from '../_lib/auth.js';
import { query } from '../_lib/db.js';
import { getBody, json, methodNotAllowed } from '../_lib/http.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const current = await requireRole(req, ['superadmin']);
    if (req.method === 'GET') {
      const result = await query(`select id, username, email, name, role, is_active, last_login_at, created_at from app_users order by name`);
      return json(res, 200, { users: result.rows });
    }
    if (req.method === 'POST') {
      const body = getBody<any>(req);
      if (!body.username || !body.name || !body.password || !['superadmin','admin','user'].includes(body.role)) {
        return json(res, 400, { error: 'INVALID_USER' });
      }
      const passwordHash = await hashPassword(body.password);
      const created = await query(
        `insert into app_users(username,email,name,role,password_hash,is_active)
         values ($1,$2,$3,$4,$5,true)
         returning id, username, email, name, role, is_active, created_at`,
        [body.username.trim(), body.email?.trim() || null, body.name.trim(), body.role, passwordHash]
      );
      const user = created.rows[0];
      await logActivity({ userId: current.id, entityType: 'user', entityId: user.id, entityLabel: user.name, action: 'create', summary: `Usuario creado: ${user.name}` });
      return json(res, 201, { user });
    }
    return methodNotAllowed(res, ['GET','POST']);
  } catch (error: any) {
    return json(res, error?.statusCode || 500, { error: error?.message || 'USERS_FAILED' });
  }
}

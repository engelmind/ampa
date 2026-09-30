import type { VercelRequest, VercelResponse } from '@vercel/node';
import { hashPassword, logActivity } from '../_lib/auth.js';
import { query } from '../_lib/db.js';
import { getBody, json, methodNotAllowed } from '../_lib/http.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  if (!process.env.AMPA_BOOTSTRAP_TOKEN) return json(res, 404, { error: 'NOT_AVAILABLE' });

  const supplied = String(req.headers['x-bootstrap-token'] || '');
  if (supplied !== process.env.AMPA_BOOTSTRAP_TOKEN) return json(res, 403, { error: 'FORBIDDEN' });

  try {
    const existing = await query('select count(*)::int as count from app_users');
    if (existing.rows[0]?.count > 0) return json(res, 409, { error: 'ALREADY_INITIALIZED' });

    const body = getBody<{ username?: string; email?: string; name?: string; password?: string }>(req);
    if (!body.username || !body.name || !body.password || body.password.length < 12) {
      return json(res, 400, { error: 'INVALID_BOOTSTRAP_DATA', detail: 'La contraseña inicial debe tener al menos 12 caracteres.' });
    }

    const passwordHash = await hashPassword(body.password);
    const created = await query(
      `insert into app_users(username,email,name,role,password_hash,is_active)
       values ($1,$2,$3,'superadmin',$4,true)
       returning id, username, email, name, role`,
      [body.username.trim(), body.email?.trim() || null, body.name.trim(), passwordHash]
    );
    const user = created.rows[0];
    await logActivity({ userId: user.id, entityType: 'user', entityId: user.id, entityLabel: user.name, action: 'create', summary: 'Superadministrador inicial creado' });
    return json(res, 201, { user });
  } catch (error: any) {
    if (error?.message === 'DATABASE_URL_NOT_CONFIGURED') return json(res, 503, { error: 'BACKEND_NOT_CONFIGURED' });
    console.error(error);
    return json(res, 500, { error: 'BOOTSTRAP_FAILED' });
  }
}

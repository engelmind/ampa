import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireUser } from '../_lib/auth.js';
import { query } from '../_lib/db.js';
import { json, methodNotAllowed } from '../_lib/http.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  try {
    await requireUser(req);
    const entityId = typeof req.query.entityId === 'string' ? req.query.entityId : null;
    const result = entityId
      ? await query(`select a.*, u.name as user_name from activity_log a left join app_users u on u.id=a.user_id where a.entity_id=$1 order by a.created_at desc limit 200`, [entityId])
      : await query(`select a.*, u.name as user_name from activity_log a left join app_users u on u.id=a.user_id order by a.created_at desc limit 200`);
    return json(res, 200, { activity: result.rows });
  } catch (error: any) {
    return json(res, error?.statusCode || 500, { error: error?.message || 'ACTIVITY_FAILED' });
  }
}

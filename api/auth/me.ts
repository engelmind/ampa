import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSessionUser } from '../_lib/auth.js';
import { json, methodNotAllowed } from '../_lib/http.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  try {
    const user = await getSessionUser(req);
    if (!user) return json(res, 401, { error: 'UNAUTHORIZED' });
    return json(res, 200, { user });
  } catch (error: any) {
    if (error?.message === 'DATABASE_URL_NOT_CONFIGURED') return json(res, 503, { error: 'BACKEND_NOT_CONFIGURED' });
    return json(res, 500, { error: 'SESSION_CHECK_FAILED' });
  }
}

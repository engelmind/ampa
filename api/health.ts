import type { VercelRequest, VercelResponse } from '@vercel/node';
import { hasDatabase, query } from './_lib/db.js';
import { json } from './_lib/http.js';

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  if (!hasDatabase()) return json(res, 200, { ok: true, database: 'not-configured', mode: 'backend-ready' });
  try {
    await query('select 1');
    return json(res, 200, { ok: true, database: 'connected', mode: 'production-backend' });
  } catch {
    return json(res, 503, { ok: false, database: 'unreachable' });
  }
}

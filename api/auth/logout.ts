import type { VercelRequest, VercelResponse } from '@vercel/node';
import { deleteSessionToken } from '../_lib/auth.js';
import { clearSessionCookie, getCookie, json, methodNotAllowed } from '../_lib/http.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  try { await deleteSessionToken(getCookie(req, 'ampa_session')); } catch {}
  clearSessionCookie(res);
  return json(res, 200, { ok: true });
}

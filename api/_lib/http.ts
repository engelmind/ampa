import type { VercelRequest, VercelResponse } from '@vercel/node';

export function json(res: VercelResponse, status: number, body: unknown) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json(body);
}

export function methodNotAllowed(res: VercelResponse, methods: string[]) {
  res.setHeader('Allow', methods.join(', '));
  return json(res, 405, { error: 'METHOD_NOT_ALLOWED' });
}

export function getBody<T = any>(req: VercelRequest): T {
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body) as T; } catch { return {} as T; }
  }
  return (req.body || {}) as T;
}

export function getCookie(req: VercelRequest, name: string): string | null {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

export function setSessionCookie(res: VercelResponse, token: string, maxAgeSeconds: number) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `ampa_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}${secure}`);
}

export function clearSessionCookie(res: VercelResponse) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `ampa_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`);
}

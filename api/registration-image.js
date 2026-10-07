const SUPABASE_PUBLIC_EVENT_BASE = 'https://dpsautgagaclgxbhzoch.supabase.co/functions/v1/ampa-api-v2/public/events/';

export default async function handler(req, res) {
  const token = String(req.query?.token || '').trim();
  if (!token) {
    res.status(302).setHeader('Location', '/logo-ampa-corporate.png');
    return res.end();
  }

  try {
    const response = await fetch(SUPABASE_PUBLIC_EVENT_BASE + encodeURIComponent(token), {
      headers: { accept: 'application/json' },
    });
    if (!response.ok) throw new Error('EVENT_NOT_FOUND');

    const payload = await response.json();
    const dataUrl = payload?.event?.imageDataUrl;
    if (!dataUrl || typeof dataUrl !== 'string') {
      res.status(302).setHeader('Location', '/logo-ampa-corporate.png');
      return res.end();
    }

    const match = dataUrl.match(/^data:([^;,]+);base64,(.+)$/);
    if (!match) {
      res.status(302).setHeader('Location', '/logo-ampa-corporate.png');
      return res.end();
    }

    const mimeType = match[1] || 'image/jpeg';
    const buffer = Buffer.from(match[2], 'base64');
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Length', String(buffer.length));
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=86400');
    res.status(200).send(buffer);
  } catch {
    res.status(302).setHeader('Location', '/logo-ampa-corporate.png');
    res.end();
  }
}

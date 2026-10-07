const SUPABASE_PUBLIC_EVENT_BASE = 'https://dpsautgagaclgxbhzoch.supabase.co/functions/v1/ampa-api-v2/public/events/';

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function stripExistingSocialMeta(html) {
  return html
    .replace(/<title>[\s\S]*?<\/title>/i, '')
    .replace(/<meta\s+name=["']description["'][^>]*>/gi, '')
    .replace(/<meta\s+property=["']og:[^"']+["'][^>]*>/gi, '')
    .replace(/<meta\s+name=["']twitter:[^"']+["'][^>]*>/gi, '');
}

export default async function handler(req, res) {
  const token = String(req.query?.token || '').trim();
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const origin = host ? `${proto}://${host}` : 'https://ampa-rho.vercel.app';
  const canonicalUrl = `${origin}/inscripcion/${encodeURIComponent(token)}`;

  let event = null;
  if (token) {
    try {
      const response = await fetch(SUPABASE_PUBLIC_EVENT_BASE + encodeURIComponent(token), {
        headers: { accept: 'application/json' },
      });
      if (response.ok) {
        const payload = await response.json();
        event = payload?.event || null;
      }
    } catch {
      event = null;
    }
  }

  let html = '';
  try {
    const response = await fetch(origin + '/', { headers: { accept: 'text/html' } });
    html = await response.text();
  } catch {
    html = '<!doctype html><html lang="es"><head></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>';
  }

  const activity = event?.title ? String(event.title).trim() : 'Actividad';
  const title = `AMPA Agustinos Granada - Formulario de Inscripción "${activity}"`;
  const descriptionBase = event?.description
    ? String(event.description).trim()
    : `Formulario de inscripción para ${activity}, organizado por AMPA Agustinos Granada.`;
  const description = descriptionBase.slice(0, 220);
  const image = event?.imageDataUrl
    ? `${origin}/api/registration-image?token=${encodeURIComponent(token)}`
    : `${origin}/logo-ampa-corporate.png`;

  const meta = `
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <link rel="canonical" href="${escapeHtml(canonicalUrl)}" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${escapeHtml(canonicalUrl)}" />
    <meta property="og:site_name" content="AMPA Agustinos Granada" />
    <meta property="og:image" content="${escapeHtml(image)}" />
    <meta property="og:image:alt" content="${escapeHtml(activity)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${escapeHtml(image)}" />
  `;

  html = stripExistingSocialMeta(html);
  html = html.replace('</head>', meta + '\n  </head>');

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
  res.status(200).send(html);
}

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { logActivity, requireRole, requireUser } from './_lib/auth.js';
import { query } from './_lib/db.js';
import { getBody, json, methodNotAllowed } from './_lib/http.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method === 'GET') {
      await requireUser(req);
      const r = await query("select value from app_settings where key='general'");
      return json(res,200,{settings:r.rows[0]?.value || {}});
    }
    if (req.method === 'PUT') {
      const user = await requireRole(req,['superadmin','admin']);
      const settings = getBody<any>(req);
      await query(
        `insert into app_settings(key,value,updated_at) values('general',$1::jsonb,now())
         on conflict(key) do update set value=$1::jsonb,updated_at=now()`,
        [JSON.stringify(settings)]
      );
      await logActivity({userId:user.id,entityType:'settings',action:'settings',summary:`Ajustes actualizados. Curso: ${settings.activeAcademicYear || '—'}`});
      return json(res,200,{settings});
    }
    return methodNotAllowed(res,['GET','PUT']);
  } catch(error:any) {
    return json(res,error?.statusCode || 500,{error:error?.message || 'SETTINGS_FAILED'});
  }
}

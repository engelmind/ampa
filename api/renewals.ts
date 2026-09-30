import type { VercelRequest, VercelResponse } from '@vercel/node';
import { logActivity, requireRole } from './_lib/auth.js';
import { query } from './_lib/db.js';
import { getBody, json, methodNotAllowed } from './_lib/http.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res,['POST']);
  try {
    const user = await requireRole(req,['superadmin','admin']);
    const body = getBody<{familyId?:string;academicYear?:string;status?:'renewed'|'pending'|'inactive'}>(req);
    if (!body.familyId || !body.academicYear || !body.status) return json(res,400,{error:'INVALID_RENEWAL'});

    await query(
      `insert into renewals(family_id,academic_year,status,renewed_at,renewed_by)
       values($1,$2,$3,case when $3='renewed' then now() else null end,$4)
       on conflict(family_id,academic_year) do update set status=$3,renewed_at=case when $3='renewed' then now() else null end,renewed_by=$4,updated_at=now()`,
      [body.familyId,body.academicYear,body.status,user.id]
    );
    await query('update families set is_active_this_year=$1,updated_at=now() where id=$2',[body.status==='renewed',body.familyId]);
    await logActivity({userId:user.id,entityType:'family',entityId:body.familyId,action:body.status==='renewed'?'renew':'deactivate',summary:`Renovación ${body.status} para ${body.academicYear}`});
    return json(res,200,{ok:true});
  } catch(error:any) {
    return json(res,error?.statusCode || 500,{error:error?.message || 'RENEWAL_FAILED'});
  }
}

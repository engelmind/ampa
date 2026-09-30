import type { VercelRequest, VercelResponse } from '@vercel/node';
import { logActivity, requireRole, requireUser } from '../_lib/auth.js';
import { query, withTransaction } from '../_lib/db.js';
import { getBody, json, methodNotAllowed } from '../_lib/http.js';

function isoDateFromDDMMAAAA(raw?: string) {
  const d = String(raw || '').replace(/\D/g, '');
  if (d.length !== 8) return null;
  return `${d.slice(4,8)}-${d.slice(2,4)}-${d.slice(0,2)}`;
}

async function loadFamilies() {
  const [families, guardians, students, renewals] = await Promise.all([
    query('select * from families order by family_name'),
    query('select * from guardians order by created_at'),
    query('select * from students order by created_at'),
    query('select * from renewals order by academic_year'),
  ]);
  return families.rows.map((f:any) => ({
    id: f.id,
    membershipNumber: f.membership_number,
    familyName: f.family_name,
    isActiveThisYear: f.is_active_this_year,
    registrationAcademicYear: f.registration_academic_year,
    registrationDate: f.registration_date,
    address: { street: f.street, city: f.city, postalCode: f.postal_code },
    notes: f.notes,
    updatedAt: f.updated_at,
    activeYears: renewals.rows.filter((r:any)=>r.family_id===f.id && r.status==='renewed').map((r:any)=>r.academic_year),
    guardians: guardians.rows.filter((g:any)=>g.family_id===f.id).map((g:any)=>({
      id:g.id, fullName:[g.first_name,g.last_name].filter(Boolean).join(' '), firstName:g.first_name, lastName:g.last_name,
      relationship:g.relationship, dni:g.dni || '', phone:g.phone || '', email:g.email || '', isMainContact:g.is_main_contact,
      birthDate:g.birth_date, communicationsConsent:g.communications_consent, privacyConsent:g.privacy_consent
    })),
    students: students.rows.filter((s:any)=>s.family_id===f.id).map((s:any)=>({
      id:s.id, firstName:s.first_name, lastName:s.last_name, dni:s.dni || '', birthDate:s.birth_date, birthYear:s.birth_year || 0,
      courseOffset:s.course_offset, groupLetter:s.group_letter || '', academicYear:s.academic_year, school:s.school, className:s.class_name,
      allergies:s.allergies, specialNeeds:s.special_needs, authorizedPhoto:s.authorized_photo
    }))
  }));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method === 'GET') {
      await requireUser(req);
      return json(res, 200, { families: await loadFamilies() });
    }
    if (req.method !== 'POST') return methodNotAllowed(res, ['GET','POST']);

    const user = await requireRole(req, ['superadmin','admin']);
    const body = getBody<any>(req);
    if (!body.familyName || !body.membershipNumber) return json(res, 400, { error:'INVALID_FAMILY' });

    const familyId = await withTransaction(async (client) => {
      const inserted = await client.query(
        `insert into families(membership_number,family_name,is_active_this_year,registration_academic_year,registration_date,street,city,postal_code,notes)
         values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
        [body.membershipNumber,body.familyName,Boolean(body.isActiveThisYear),body.registrationAcademicYear || null,body.registrationDate || new Date().toISOString().slice(0,10),
         body.address?.street || '',body.address?.city || '',body.address?.postalCode || '',body.notes || null]
      );
      const id = inserted.rows[0].id;
      for (const g of body.guardians || []) {
        await client.query(
          `insert into guardians(family_id,first_name,last_name,relationship,dni,birth_date,phone,email,is_main_contact,communications_consent,privacy_consent)
           values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [id,g.firstName || String(g.fullName || '').split(' ')[0] || '',g.lastName || String(g.fullName || '').split(' ').slice(1).join(' '),g.relationship || 'otro',
           g.dni || null,isoDateFromDDMMAAAA(g.birthDateDDMMAAAA) || g.birthDate || null,g.phone || null,g.email || null,Boolean(g.isMainContact),
           g.communicationsConsent ?? null,g.privacyConsent ?? null]
        );
      }
      for (const s of body.students || []) {
        await client.query(
          `insert into students(family_id,first_name,last_name,dni,birth_date,birth_year,course_offset,group_letter,academic_year,school,class_name,allergies,special_needs,authorized_photo)
           values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
          [id,s.firstName,s.lastName || '',s.dni || null,isoDateFromDDMMAAAA(s.birthDateDDMMAAAA) || s.birthDate || null,s.birthYear || null,s.courseOffset || 0,
           s.groupLetter || '',s.academicYear || null,s.school || null,s.className || null,s.allergies || null,s.specialNeeds || null,Boolean(s.authorizedPhoto)]
        );
      }
      for (const year of body.activeYears || []) {
        await client.query(
          `insert into renewals(family_id,academic_year,status,renewed_at,renewed_by)
           values($1,$2,'renewed',now(),$3) on conflict(family_id,academic_year) do update set status='renewed',renewed_at=now(),renewed_by=$3,updated_at=now()`,
          [id,year,user.id]
        );
      }
      return id;
    });
    await logActivity({ userId:user.id,entityType:'family',entityId:familyId,entityLabel:body.familyName,action:'create',summary:`Familia dada de alta: ${body.familyName}` });
    return json(res, 201, { id: familyId });
  } catch (error:any) {
    if (error?.message === 'DATABASE_URL_NOT_CONFIGURED') return json(res,503,{error:'BACKEND_NOT_CONFIGURED'});
    console.error(error);
    return json(res,error?.statusCode || 500,{error:error?.message || 'FAMILIES_FAILED'});
  }
}

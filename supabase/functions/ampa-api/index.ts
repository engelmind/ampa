import postgres from 'npm:postgres@3.4.7';

const dbUrl = Deno.env.get('SUPABASE_DB_URL');
if (!dbUrl) throw new Error('SUPABASE_DB_URL missing');
const sql = postgres(dbUrl, { prepare: false, max: 1, idle_timeout: 10, connect_timeout: 10 });

const encoder = new TextEncoder();
const SESSION_SECONDS = 60 * 60 * 12;
const PBKDF2_ITERATIONS = 310000;

function reply(body: unknown, status = 200, extraHeaders: Record<string,string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extraHeaders },
  });
}
function pathOf(req: Request) {
  const p = new URL(req.url).pathname;
  const marker = '/functions/v1/';
  const i = p.indexOf(marker);
  if (i >= 0) {
    const rest = p.slice(i + marker.length);
    const slash = rest.indexOf('/');
    return slash >= 0 ? rest.slice(slash) || '/' : '/';
  }
  const parts = p.split('/').filter(Boolean);
  if (parts[0]?.startsWith('ampa-api')) {
    return '/' + parts.slice(1).join('/');
  }
  return p || '/';
}
function cookie(req: Request, name: string) {
  const raw = req.headers.get('cookie') || '';
  for (const part of raw.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}
function setCookie(token: string) {
  return `ampa_session=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_SECONDS}`;
}
function clearCookie() {
  return 'ampa_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0';
}
function base64url(bytes: Uint8Array) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function fromBase64url(s: string) {
  const padded = s.replace(/-/g,'+').replace(/_/g,'/') + '='.repeat((4 - s.length % 4) % 4);
  const bin = atob(padded);
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}
async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('');
}
function randomToken(bytes = 32) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return base64url(arr);
}
async function derive(password: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name:'PBKDF2', hash:'SHA-256', salt, iterations }, key, 256);
  return new Uint8Array(bits);
}
async function hashPassword(password: string) {
  const salt = new Uint8Array(16); crypto.getRandomValues(salt);
  const hash = await derive(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2_sha256$${PBKDF2_ITERATIONS}$${base64url(salt)}$${base64url(hash)}`;
}
async function verifyPassword(password: string, encoded: string) {
  const [algo, it, salt, expected] = encoded.split('$');
  if (algo !== 'pbkdf2_sha256' || !it || !salt || !expected) return false;
  const actual = await derive(password, fromBase64url(salt), Number(it));
  const exp = fromBase64url(expected);
  if (actual.length !== exp.length) return false;
  let diff = 0; for (let i=0;i<actual.length;i++) diff |= actual[i]^exp[i];
  return diff === 0;
}
async function createSession(userId: string) {
  const token = randomToken();
  const tokenHash = await sha256(token);
  await sql`insert into sessions(user_id, token_hash, expires_at) values(${userId}::uuid, ${tokenHash}, now() + interval '12 hours')`;
  return token;
}
async function currentUser(req: Request) {
  const token = cookie(req, 'ampa_session');
  if (!token) return null;
  const tokenHash = await sha256(token);
  const rows = await sql`
    select u.id, u.username, u.email, u.name, u.role, u.is_active, u.last_login_at
    from sessions s join app_users u on u.id=s.user_id
    where s.token_hash=${tokenHash} and s.expires_at>now() and u.is_active=true limit 1
  `;
  return rows[0] || null;
}
async function requireUser(req: Request) {
  const u = await currentUser(req);
  if (!u) throw Object.assign(new Error('UNAUTHORIZED'), { status: 401 });
  return u;
}
async function requireRole(req: Request, roles: string[]) {
  const u = await requireUser(req);
  if (!roles.includes(u.role)) throw Object.assign(new Error('FORBIDDEN'), { status: 403 });
  return u;
}
async function log(userId: string | null, entityType: string, action: string, summary: string, entityId?: string|null, entityLabel?: string|null) {
  await sql`insert into activity_log(user_id,entity_type,entity_id,entity_label,action,summary)
    values(${userId}::uuid,${entityType},${entityId || null},${entityLabel || null},${action},${summary})`;
}
function isoFromDDMMAAAA(raw?: string) {
  const d = String(raw || '').replace(/\D/g,'');
  return d.length===8 ? `${d.slice(4,8)}-${d.slice(2,4)}-${d.slice(0,2)}` : null;
}
function isoDateFromDb(v: any) {
  if (!v) return '';
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0,10);
  const raw = String(v).trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0,10);
}
function ddmmyyyyFromDb(v: any) {
  const iso = isoDateFromDb(v);
  if (!iso) return '';
  const [y,m,d] = iso.split('-');
  return `${d}${m}${y}`;
}
function birthYearFromDb(v: any, fallback?: any) {
  const iso = isoDateFromDb(v);
  if (iso) return Number(iso.slice(0,4));
  const n = Number(fallback);
  return Number.isFinite(n) && n > 1900 ? n : 0;
}
function safeUser(u:any) {
  return { id:u.id, username:u.username, email:u.email, name:u.name, role:u.role, isActive:u.is_active, lastLoginAt:u.last_login_at };
}
async function readBody(req: Request) {
  try { return await req.json(); } catch { return {}; }
}
function normalizeGeneralSettings(raw:any) {
  let value = raw;
  for (let i=0; i<3 && typeof value === 'string'; i++) {
    try { value = JSON.parse(value); } catch { break; }
  }
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    activeAcademicYear: String(source.activeAcademicYear || '2026/2027'),
    schoolName: String(source.schoolName || 'Colegio Santo Tomás de Villanueva'),
    associationName: String(source.associationName || 'AMPA Agustinos Granada'),
    nifCif: String(source.nifCif || ''),
    contactEmail: String(source.contactEmail || ''),
  };
}
async function loadFamilies(includeSensitive = false) {
  const [families, guardians, students, renewals] = await Promise.all([
    sql`select * from families order by family_name`,
    sql`select * from guardians order by created_at`,
    sql`select * from students order by created_at`,
    sql`select * from renewals order by academic_year`,
  ]);
  return families.map((f:any)=>({
    id:f.id, membershipNumber:f.membership_number, familyName:f.family_name,
    isActiveThisYear:f.is_active_this_year, registrationAcademicYear:f.registration_academic_year,
    registrationDate:isoDateFromDb(f.registration_date), address:{street:f.street,city:f.city,postalCode:f.postal_code},
    notes:f.notes || '', updatedAt:f.updated_at,
    activeYears:renewals.filter((r:any)=>r.family_id===f.id && r.status==='renewed').map((r:any)=>r.academic_year),
    guardians:guardians.filter((g:any)=>g.family_id===f.id).map((g:any)=>({
      id:g.id, fullName:[g.first_name,g.last_name].filter(Boolean).join(' '), firstName:g.first_name,lastName:g.last_name,
      relationship:g.relationship,dni:g.dni||'',phone:g.phone||'',email:g.email||'',isMainContact:g.is_main_contact,
      birthDateDDMMAAAA:ddmmyyyyFromDb(g.birth_date)
    })),
    students:students.filter((s:any)=>s.family_id===f.id).map((s:any)=>({
      id:s.id,firstName:s.first_name,lastName:s.last_name,dni:s.dni||'',birthDateDDMMAAAA:ddmmyyyyFromDb(s.birth_date),
      birthYear:birthYearFromDb(s.birth_date,s.birth_year),courseOffset:s.course_offset,groupLetter:s.group_letter||'',academicYear:s.academic_year,
      school:s.school||'',className:s.class_name||'',allergies:includeSensitive?(s.allergies||''):'',specialNeeds:includeSensitive?(s.special_needs||''):''
    }))
  }));
}
async function replaceMembers(tx:any, familyId:string, body:any) {
  await tx`delete from guardians where family_id=${familyId}::uuid`;
  await tx`delete from students where family_id=${familyId}::uuid`;
  for (const g of body.guardians || []) {
    await tx`insert into guardians(family_id,first_name,last_name,relationship,dni,birth_date,phone,email,is_main_contact)
      values(${familyId}::uuid,${g.firstName||''},${g.lastName||''},${g.relationship||'otro'},${g.dni||null},
      ${isoFromDDMMAAAA(g.birthDateDDMMAAAA)||g.birthDate||null}::date,${g.phone||null},${g.email||null},${!!g.isMainContact})`;
  }
  for (const s of body.students || []) {
    await tx`insert into students(family_id,first_name,last_name,dni,birth_date,birth_year,course_offset,group_letter,academic_year,school,class_name,allergies,special_needs)
      values(${familyId}::uuid,${s.firstName||''},${s.lastName||''},${s.dni||null},
      ${isoFromDDMMAAAA(s.birthDateDDMMAAAA)||s.birthDate||null}::date,${s.birthYear||null},${s.courseOffset||0},${s.groupLetter||''},
      ${s.academicYear||null},${s.school||null},${s.className||null},${s.allergies||null},${s.specialNeeds||null})`;
  }
}
async function replaceRenewals(tx:any, familyId:string, years:string[], userId:string) {
  await tx`delete from renewals where family_id=${familyId}::uuid`;
  for (const year of years || []) {
    await tx`insert into renewals(family_id,academic_year,status,renewed_at,renewed_by)
      values(${familyId}::uuid,${year},'renewed',now(),${userId}::uuid)`;
  }
}


async function upsertImportedFamily(tx:any, body:any, userId:string) {
  const existing = await tx`select id from families where membership_number=${body.membershipNumber} limit 1`;
  let id:string;
  if (existing.length) {
    id = existing[0].id;
    await tx`update families set family_name=${body.familyName},is_active_this_year=${!!body.isActiveThisYear},
      registration_academic_year=${body.registrationAcademicYear||null},registration_date=${body.registrationDate||new Date().toISOString().slice(0,10)}::date,
      street=${body.address?.street||''},city=${body.address?.city||''},postal_code=${body.address?.postalCode||''},
      notes=${body.notes||null},updated_at=now() where id=${id}::uuid`;
  } else {
    const created = await tx`insert into families(membership_number,family_name,is_active_this_year,registration_academic_year,registration_date,street,city,postal_code,notes)
      values(${body.membershipNumber},${body.familyName},${!!body.isActiveThisYear},${body.registrationAcademicYear||null},
      ${body.registrationDate||new Date().toISOString().slice(0,10)}::date,${body.address?.street||''},${body.address?.city||''},
      ${body.address?.postalCode||''},${body.notes||null}) returning id`;
    id = created[0].id;
  }
  await replaceMembers(tx,id,body);
  await replaceRenewals(tx,id,body.activeYears||[],userId);
  return id;
}

async function restoreSnapshot(snapshotId:string, userId:string) {
  const rows = await sql`select payload from ampa_private.backup_snapshots where id=${snapshotId}::uuid limit 1`;
  if (!rows.length) throw Object.assign(new Error('BACKUP_NOT_FOUND'), {status:404});
  const payload = rows[0].payload || {};
  await sql.begin(async tx => {
    await tx`delete from renewals`;
    await tx`delete from guardians`;
    await tx`delete from students`;
    await tx`delete from families`;

    for (const f of payload.families || []) {
      await tx`insert into families(id,membership_number,family_name,is_active_this_year,registration_academic_year,registration_date,street,city,postal_code,notes,created_at,updated_at)
        values(${f.id}::uuid,${f.membership_number},${f.family_name},${!!f.is_active_this_year},${f.registration_academic_year||null},
        ${f.registration_date}::date,${f.street||''},${f.city||''},${f.postal_code||''},${f.notes||null},
        ${f.created_at||new Date().toISOString()}::timestamptz,${f.updated_at||new Date().toISOString()}::timestamptz)`;
    }
    for (const g of payload.guardians || []) {
      await tx`insert into guardians(id,family_id,first_name,last_name,relationship,dni,birth_date,phone,email,is_main_contact,created_at,updated_at)
        values(${g.id}::uuid,${g.family_id}::uuid,${g.first_name},${g.last_name||''},${g.relationship},${g.dni||null},
        ${g.birth_date||null}::date,${g.phone||null},${g.email||null},${!!g.is_main_contact},
        ${g.created_at||new Date().toISOString()}::timestamptz,${g.updated_at||new Date().toISOString()}::timestamptz)`;
    }
    for (const s of payload.students || []) {
      await tx`insert into students(id,family_id,first_name,last_name,dni,birth_date,birth_year,course_offset,group_letter,academic_year,school,class_name,allergies,special_needs,created_at,updated_at)
        values(${s.id}::uuid,${s.family_id}::uuid,${s.first_name},${s.last_name||''},${s.dni||null},${s.birth_date||null}::date,
        ${s.birth_year||null},${s.course_offset||0},${s.group_letter||''},${s.academic_year||null},${s.school||null},${s.class_name||null},
        ${s.allergies||null},${s.special_needs||null},${s.created_at||new Date().toISOString()}::timestamptz,
        ${s.updated_at||new Date().toISOString()}::timestamptz)`;
    }
    for (const r of payload.renewals || []) {
      await tx`insert into renewals(id,family_id,academic_year,status,renewed_at,renewed_by,created_at,updated_at)
        values(${r.id}::uuid,${r.family_id}::uuid,${r.academic_year},${r.status},${r.renewed_at||null}::timestamptz,
        ${r.renewed_by||null}::uuid,${r.created_at||new Date().toISOString()}::timestamptz,${r.updated_at||new Date().toISOString()}::timestamptz)`;
    }
    if (payload.settings) {
      const cleanSettings = normalizeGeneralSettings(payload.settings);
      await tx`insert into app_settings(key,value,updated_at) values('general',${JSON.stringify(cleanSettings)}::jsonb,now())
        on conflict(key) do update set value=excluded.value,updated_at=now()`;
    }
  });
  await log(userId,'settings','import','Copia de seguridad restaurada',snapshotId,'backup');
}

async function getEmailProviderConfig() {
  let apiKey = Deno.env.get('RESEND_API_KEY') || '';
  let fromEmail = Deno.env.get('AMPA_MAIL_FROM') || '';
  let senderName = Deno.env.get('AMPA_MAIL_NAME') || 'AMPA Agustinos Granada';
  let domainVerified = false;

  if (!apiKey) {
    try {
      const secretRows = await sql`select decrypted_secret from vault.decrypted_secrets where name='ampa_resend_api_key' limit 1`;
      apiKey = secretRows[0]?.decrypted_secret || '';
    } catch {}
  }
  try {
    const cfg = await sql`select from_email, sender_name, domain_verified from ampa_private.email_config where singleton=true limit 1`;
    if (!fromEmail) fromEmail = cfg[0]?.from_email || '';
    senderName = cfg[0]?.sender_name || senderName;
    domainVerified = cfg[0]?.domain_verified === true;
  } catch {}

  return {
    apiKey,
    fromEmail,
    senderName,
    domainVerified,
    configured: Boolean(apiKey && fromEmail && domainVerified),
  };
}

Deno.serve(async (req: Request) => {
  const path = pathOf(req);
  try {
    if (req.method === 'GET' && path === '/health') {
      const rows = await sql`select count(*)::int as users from app_users`;
      return reply({ ok:true, database:'connected', users:rows[0]?.users || 0, mode:'supabase-edge' });
    }

    if (req.method === 'POST' && path === '/setup/bootstrap') {
      const body = await readBody(req);
      const count = await sql`select count(*)::int as count from app_users`;
      if ((count[0]?.count || 0) > 0) return reply({error:'ALREADY_INITIALIZED'},409);
      const cfg = await sql`select value from app_settings where key='bootstrap'`;
      const expected = cfg[0]?.value?.codeHash;
      if (!expected || !body.code || await sha256(String(body.code)) !== expected) return reply({error:'INVALID_SETUP_CODE'},403);
      if (!body.username || !body.name || !body.password || String(body.password).length < 12) return reply({error:'INVALID_SETUP_DATA'},400);
      const hash = await hashPassword(String(body.password));
      const [u] = await sql.begin(async tx => {
        const created = await tx`insert into app_users(username,email,name,role,password_hash,is_active)
          values(${String(body.username).trim()},${body.email ? String(body.email).trim() : null},${String(body.name).trim()},'superadmin',${hash},true)
          returning *`;
        await tx`delete from app_settings where key='bootstrap'`;
        return created;
      });
      await log(u.id,'user','create','Superadministrador inicial creado',u.id,u.name);
      const token = await createSession(u.id);
      return reply({user:safeUser(u)},201,{'set-cookie':setCookie(token)});
    }

    if (req.method === 'POST' && path === '/auth/login') {
      const body = await readBody(req);
      const q = String(body.username || '').trim();
      if (!q || !body.password) return reply({error:'MISSING_CREDENTIALS'},400);
      let rows = await sql`select * from app_users where lower(username)=lower(${q}) limit 1`;
      if (!rows.length) rows = await sql`select * from app_users where lower(coalesce(email,''))=lower(${q}) limit 1`;
      const u = rows[0];
      if (!u || !u.is_active || !await verifyPassword(String(body.password),u.password_hash)) return reply({error:'INVALID_CREDENTIALS'},401);
      await sql`update app_users set last_login_at=now(),updated_at=now() where id=${u.id}::uuid`;
      await sql`delete from sessions where expires_at < now()`;
      const token = await createSession(u.id);
      await log(u.id,'user','login','Inicio de sesión',u.id,u.name);
      return reply({user:safeUser({...u,last_login_at:new Date().toISOString()})},200,{'set-cookie':setCookie(token)});
    }

    if (req.method === 'GET' && path === '/auth/me') {
      const u = await requireUser(req); return reply({user:safeUser(u)});
    }
    if (req.method === 'POST' && path === '/auth/logout') {
      const token = cookie(req,'ampa_session');
      if (token) await sql`delete from sessions where token_hash=${await sha256(token)}`;
      return reply({ok:true},200,{'set-cookie':clearCookie()});
    }
    if (req.method === 'POST' && path === '/auth/change-password') {
      const u = await requireUser(req); const body = await readBody(req);
      const rows = await sql`select password_hash from app_users where id=${u.id}::uuid`;
      if (!body.currentPassword || !body.newPassword || String(body.newPassword).length < 12) return reply({error:'INVALID_PASSWORD'},400);
      if (!rows[0] || !await verifyPassword(String(body.currentPassword),rows[0].password_hash)) return reply({error:'INVALID_CREDENTIALS'},401);
      const hash = await hashPassword(String(body.newPassword));
      await sql`update app_users set password_hash=${hash},updated_at=now() where id=${u.id}::uuid`;
      await sql`delete from sessions where user_id=${u.id}::uuid`;
      return reply({ok:true},200,{'set-cookie':clearCookie()});
    }

    if (path === '/families' && req.method === 'GET') {
      const u=await requireUser(req);
      return reply({families:await loadFamilies(u.role==='superadmin'||u.role==='admin')});
    }
    if (path === '/families' && req.method === 'POST') {
      const u = await requireRole(req,['superadmin','admin']); const body = await readBody(req);
      if (!body.membershipNumber || !body.familyName) return reply({error:'INVALID_FAMILY'},400);
      const id = await sql.begin(async tx => {
        const created = await tx`insert into families(membership_number,family_name,is_active_this_year,registration_academic_year,registration_date,street,city,postal_code,notes)
          values(${body.membershipNumber},${body.familyName},${!!body.isActiveThisYear},${body.registrationAcademicYear||null},${body.registrationDate||new Date().toISOString().slice(0,10)}::date,
          ${body.address?.street||''},${body.address?.city||''},${body.address?.postalCode||''},${body.notes||null}) returning id`;
        const fid = created[0].id; await replaceMembers(tx,fid,body); await replaceRenewals(tx,fid,body.activeYears||[],u.id); return fid;
      });
      await log(u.id,'family','create',`Familia dada de alta: ${body.familyName}`,id,body.familyName);
      return reply({id},201);
    }
    const familyMatch = path.match(/^\/families\/([0-9a-f-]+)$/i);
    if (familyMatch && req.method === 'PUT') {
      const u = await requireRole(req,['superadmin','admin']); const body = await readBody(req); const id=familyMatch[1];
      await sql.begin(async tx => {
        await tx`update families set membership_number=${body.membershipNumber},family_name=${body.familyName},is_active_this_year=${!!body.isActiveThisYear},
          registration_academic_year=${body.registrationAcademicYear||null},registration_date=${body.registrationDate}::date,street=${body.address?.street||''},
          city=${body.address?.city||''},postal_code=${body.address?.postalCode||''},notes=${body.notes||null},updated_at=now() where id=${id}::uuid`;
        await replaceMembers(tx,id,body); await replaceRenewals(tx,id,body.activeYears||[],u.id);
      });
      await log(u.id,'family','update',`Ficha modificada: ${body.familyName}`,id,body.familyName); return reply({ok:true});
    }
    if (familyMatch && req.method === 'DELETE') {
      const u=await requireRole(req,['superadmin']); const id=familyMatch[1];
      const rows=await sql`delete from families where id=${id}::uuid returning family_name`;
      await log(u.id,'family','delete',`Familia eliminada: ${rows[0]?.family_name||id}`,id,rows[0]?.family_name||null); return reply({ok:true});
    }

    const activeFamilyMatch=path.match(/^\/families\/([0-9a-f-]+)\/active$/i);
    if (activeFamilyMatch && req.method === 'PATCH') {
      const u=await requireRole(req,['superadmin','admin']);
      const body=await readBody(req);
      if (typeof body.active !== 'boolean') return reply({error:'INVALID_ACTIVE_STATUS'},400);
      const id=activeFamilyMatch[1];
      const rows=await sql`update families set is_active_this_year=${body.active},updated_at=now() where id=${id}::uuid returning family_name`;
      if (!rows.length) return reply({error:'FAMILY_NOT_FOUND'},404);
      await log(u.id,'family',body.active?'activate':'deactivate',
        body.active ? 'Familia activada · cuota actual pagada' : 'Familia desactivada · cuota actual pendiente',
        id,rows[0].family_name);
      return reply({ok:true});
    }

    if (path === '/families/active/reset' && req.method === 'POST') {
      const u=await requireRole(req,['superadmin','admin']);
      const body=await readBody(req);
      if (typeof body.active !== 'boolean') return reply({error:'INVALID_ACTIVE_STATUS'},400);
      const rows=await sql`update families set is_active_this_year=${body.active},updated_at=now() returning id`;
      await log(u.id,'course','update',
        body.active ? 'Todas las familias marcadas activas' : 'Todas las familias marcadas inactivas para el nuevo curso');
      return reply({ok:true,updated:rows.length});
    }

    // Ruta histórica: conserva cursos previos, pero ya no gobierna el estado activo actual.
    if (path === '/renewals' && req.method === 'POST') {
      const u=await requireRole(req,['superadmin','admin']); const body=await readBody(req);
      if (!body.familyId || !body.academicYear || !['renewed','pending','inactive'].includes(body.status)) return reply({error:'INVALID_RENEWAL'},400);
      await sql`insert into renewals(family_id,academic_year,status,renewed_at,renewed_by)
        values(${body.familyId}::uuid,${body.academicYear},${body.status},case when ${body.status}='renewed' then now() else null end,${u.id}::uuid)
        on conflict(family_id,academic_year) do update set status=excluded.status,renewed_at=excluded.renewed_at,renewed_by=excluded.renewed_by,updated_at=now()`;
      await log(u.id,'family','renew',`Histórico de curso actualizado: ${body.academicYear}`,body.familyId,null);
      return reply({ok:true});
    }

    if (path === '/settings' && req.method === 'GET') {
      await requireUser(req);
      const rows=await sql`select value from app_settings where key='general'`;
      return reply({settings:normalizeGeneralSettings(rows[0]?.value)});
    }
    if (path === '/settings' && req.method === 'PUT') {
      const u=await requireRole(req,['superadmin','admin']);
      const body=await readBody(req);
      const clean=normalizeGeneralSettings(body);
      await sql`insert into app_settings(key,value,updated_at) values('general',${JSON.stringify(clean)}::jsonb,now())
        on conflict(key) do update set value=excluded.value,updated_at=now()`;
      await log(u.id,'settings','settings',`Ajustes actualizados. Curso: ${clean.activeAcademicYear}`);
      return reply({settings:clean});
    }

    if (path === '/activity' && req.method === 'GET') {
      await requireUser(req); const url=new URL(req.url); const entityId=url.searchParams.get('entityId');
      const rows = entityId
        ? await sql`select a.*,u.name as user_name from activity_log a left join app_users u on u.id=a.user_id where a.entity_id=${entityId} order by a.created_at desc limit 300`
        : await sql`select a.*,u.name as user_name from activity_log a left join app_users u on u.id=a.user_id order by a.created_at desc limit 300`;
      return reply({activity:rows.map((a:any)=>({id:a.id,userId:a.user_id,userName:a.user_name||'Sistema',timestamp:a.created_at,entityType:a.entity_type,entityId:a.entity_id,entityLabel:a.entity_label,action:a.action,summary:a.summary}))});
    }

    if (path === '/users' && req.method === 'GET') {
      await requireRole(req,['superadmin']); const rows=await sql`select id,username,email,name,role,is_active,last_login_at,created_at from app_users order by name`; return reply({users:rows.map(safeUser)});
    }
    if (path === '/users' && req.method === 'POST') {
      const u=await requireRole(req,['superadmin']); const body=await readBody(req);
      if (!body.username || !body.name || !body.password || String(body.password).length<12 || !['superadmin','admin','user'].includes(body.role)) return reply({error:'INVALID_USER'},400);
      const hash=await hashPassword(String(body.password));
      const rows=await sql`insert into app_users(username,email,name,role,password_hash,is_active) values(${body.username},${body.email||null},${body.name},${body.role},${hash},true) returning *`;
      await log(u.id,'user','create',`Usuario creado: ${body.name}`,rows[0].id,body.name); return reply({user:safeUser(rows[0])},201);
    }
    const userMatch=path.match(/^\/users\/([0-9a-f-]+)$/i);
    if (userMatch && req.method === 'PATCH') {
      const u=await requireRole(req,['superadmin']); const body=await readBody(req); const id=userMatch[1];
      if (id===u.id && body.isActive===false) return reply({error:'CANNOT_DISABLE_SELF'},400);
      if (body.password) {
        if (String(body.password).length<12) return reply({error:'INVALID_PASSWORD'},400);
        await sql`update app_users set password_hash=${await hashPassword(String(body.password))},updated_at=now() where id=${id}::uuid`;
        await sql`delete from sessions where user_id=${id}::uuid`;
      }
      if (body.role && !['superadmin','admin','user'].includes(body.role)) return reply({error:'INVALID_ROLE'},400);
      await sql`update app_users set name=coalesce(${body.name||null},name),email=coalesce(${body.email||null},email),role=coalesce(${body.role||null},role),
        is_active=coalesce(${typeof body.isActive==='boolean'?body.isActive:null},is_active),updated_at=now() where id=${id}::uuid`;
      const rows=await sql`select * from app_users where id=${id}::uuid`; await log(u.id,'user','update',`Usuario actualizado: ${rows[0]?.name||id}`,id,rows[0]?.name||null);
      return reply({user:safeUser(rows[0])});
    }


    if (path === '/imports' && req.method === 'POST') {
      const u = await requireRole(req,['superadmin','admin']);
      const body = await readBody(req);
      if (!Array.isArray(body.families) || body.families.length > 5000) return reply({error:'INVALID_IMPORT'},400);
      if (body.mode === 'replace' && u.role !== 'superadmin') return reply({error:'FORBIDDEN'},403);
      for (const f of body.families) if (!f.membershipNumber || !f.familyName) return reply({error:'INVALID_IMPORT_ROW'},400);
      await sql`select ampa_private.create_snapshot('pre-import', ${u.id}::uuid)`;
      await sql.begin(async tx => {
        if (body.mode === 'replace') await tx`delete from families`;
        for (const family of body.families) await upsertImportedFamily(tx,family,u.id);
      });
      await log(u.id,'import','import',`Importadas ${body.families.length} familias`,null,'importación');
      return reply({ok:true,imported:body.families.length});
    }

    if (path === '/backups' && req.method === 'GET') {
      await requireRole(req,['superadmin']);
      const rows = await sql`select b.id,b.created_at,b.reason,u.name as created_by_name
        from ampa_private.backup_snapshots b left join app_users u on u.id=b.created_by
        order by b.created_at desc limit 30`;
      return reply({backups:rows.map((b:any)=>({id:b.id,createdAt:b.created_at,reason:b.reason,createdByName:b.created_by_name}))});
    }
    if (path === '/backups' && req.method === 'POST') {
      const u = await requireRole(req,['superadmin']);
      const body = await readBody(req);
      const rows = await sql`select ampa_private.create_snapshot(${String(body.reason||'manual')}, ${u.id}::uuid) as id`;
      await log(u.id,'export','export','Copia de seguridad interna creada',rows[0]?.id,'backup');
      return reply({id:rows[0]?.id},201);
    }
    if (path === '/backups/restore' && req.method === 'POST') {
      const u = await requireRole(req,['superadmin']);
      const body = await readBody(req);
      if (!body.id || body.confirmation !== 'RESTAURAR COPIA') return reply({error:'CONFIRMATION_REQUIRED'},400);
      await sql`select ampa_private.create_snapshot('pre-restore', ${u.id}::uuid)`;
      await restoreSnapshot(String(body.id),u.id);
      return reply({ok:true});
    }



    if (path === '/email/status' && req.method === 'GET') {
      await requireRole(req,['superadmin','admin']);
      const mailConfig = await getEmailProviderConfig();
      return reply({
        configured: mailConfig.configured,
        domainVerified: mailConfig.domainVerified,
        fromEmail: mailConfig.fromEmail || null,
        senderName: mailConfig.senderName
      });
    }

    if (path === '/email/family-document' && req.method === 'POST') {
      const u = await requireRole(req,['superadmin','admin']);
      const body = await readBody(req);
      const mailConfig = await getEmailProviderConfig();
      const resendKey = mailConfig.apiKey;
      const mailFrom = mailConfig.fromEmail;
      const senderName = mailConfig.senderName;
      if (!mailConfig.configured) return reply({error:'EMAIL_NOT_CONFIGURED'},503);

      if (!body.familyId || !body.guardianId || !body.subject || !body.contentBase64 || body.documentType !== 'membership-card') {
        return reply({error:'INVALID_EMAIL_REQUEST'},400);
      }
      if (String(body.subject).length > 180 || String(body.message || '').length > 8000 || String(body.contentBase64).length > 12_000_000) {
        return reply({error:'EMAIL_PAYLOAD_TOO_LARGE'},413);
      }

      const recipients = await sql`
        select g.id, g.email, g.first_name, g.last_name, f.family_name, f.membership_number
        from guardians g
        join families f on f.id=g.family_id
        where g.id=${body.guardianId}::uuid and f.id=${body.familyId}::uuid
        limit 1
      `;
      const recipient = recipients[0];
      if (!recipient?.email) return reply({error:'GUARDIAN_EMAIL_NOT_FOUND'},404);

      const escapeHtml = (value:string) => String(value || '')
        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
      const htmlMessage = escapeHtml(String(body.message || '')).replace(/\n/g,'<br>');

      const general = await sql`select value from app_settings where key='general' limit 1`;
      const replyTo = general[0]?.value?.contactEmail || undefined;

      const response = await fetch('https://api.resend.com/emails',{
        method:'POST',
        headers:{
          'Content-Type':'application/json',
          'Authorization':`Bearer ${resendKey}`,
        },
        body:JSON.stringify({
          from:`${senderName} <${mailFrom}>`,
          to:[recipient.email],
          subject:String(body.subject),
          html:`<div style="font-family:Arial,sans-serif;color:#1e293b;line-height:1.6"><p>${htmlMessage}</p><hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0"><p style="font-size:12px;color:#64748b">AMPA Agustinos Granada · Documento enviado desde la aplicación de gestión.</p></div>`,
          ...(replyTo ? { reply_to: replyTo } : {}),
          attachments:[{
            filename:String(body.filename || 'carnet-ampa.pdf').replace(/[^a-zA-Z0-9._-]/g,'_'),
            content:String(body.contentBase64),
            content_type:String(body.mimeType || 'application/pdf'),
          }],
        }),
      });
      const result = await response.json().catch(()=>({}));
      if (!response.ok) {
        console.error('RESEND_ERROR',response.status,result);
        return reply({error:'EMAIL_PROVIDER_FAILED'},502);
      }

      await log(
        u.id,
        'card',
        'card',
        `Carnet enviado por email a ${recipient.first_name} ${recipient.last_name} <${recipient.email}>`,
        body.familyId,
        recipient.family_name
      );
      return reply({ok:true,to:recipient.email,messageId:result?.id || null});
    }

    return reply({error:'NOT_FOUND',path},404);
  } catch (error:any) {
    console.error(error);
    return reply({error:error?.message||'INTERNAL_ERROR'},error?.status||500);
  }
});
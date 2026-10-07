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
  const [families, guardians, students, renewals, eventFamilies, events, eventAttendees] = await Promise.all([
    sql`select * from families order by family_name`,
    sql`select * from guardians order by created_at`,
    sql`select * from students order by created_at`,
    sql`select * from renewals order by academic_year`,
    sql`select * from event_families order by created_at desc`,
    sql`select * from events order by event_date desc, created_at desc`,
    sql`select * from event_attendees order by created_at`,
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
    })),
    events:eventFamilies.filter((ef:any)=>ef.family_id===f.id).map((ef:any)=>{
      const event=events.find((e:any)=>e.id===ef.event_id);
      const attendees=eventAttendees.filter((a:any)=>a.event_id===ef.event_id && a.family_id===f.id);
      return event ? {
        eventId:event.id,
        title:event.title,
        eventDate:isoDateFromDb(event.event_date),
        academicYear:event.academic_year,
        participantCount:attendees.length,
        participantNames:attendees.map((a:any)=>a.participant_name),
      } : null;
    }).filter(Boolean)
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
    await tx`delete from event_registration_sessions`;
    await tx`delete from event_registration_challenges`;
    await tx`delete from event_registration_attendees`;
    await tx`delete from event_registrations`;
    await tx`delete from event_attendees`;
    await tx`delete from event_families`;
    await tx`delete from events`;
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
    for (const e of payload.events || []) {
      await tx`insert into events(
          id,title,event_date,academic_year,description,image_data_url,created_by,
          registration_enabled,registration_deadline,registration_capacity,max_attendees_per_family,registration_message,registration_audience,registration_token,
          created_at,updated_at
        )
        values(
          ${e.id}::uuid,${e.title},${e.event_date}::date,${e.academic_year||''},${e.description||''},${e.image_data_url||null},${e.created_by||null}::uuid,
          ${!!e.registration_enabled},${e.registration_deadline||null}::timestamptz,${e.registration_capacity||null},${e.max_attendees_per_family||8},${e.registration_message||''},${e.registration_audience||'members_only'},
          coalesce(${e.registration_token||null}::uuid,gen_random_uuid()),
          ${e.created_at||new Date().toISOString()}::timestamptz,${e.updated_at||new Date().toISOString()}::timestamptz
        )`;
    }
    for (const ef of payload.eventFamilies || []) {
      await tx`insert into event_families(event_id,family_id,created_at)
        values(${ef.event_id}::uuid,${ef.family_id}::uuid,${ef.created_at||new Date().toISOString()}::timestamptz)`;
    }
    for (const ea of payload.eventAttendees || []) {
      await tx`insert into event_attendees(id,event_id,family_id,person_type,person_id,participant_name,created_at)
        values(${ea.id}::uuid,${ea.event_id}::uuid,${ea.family_id}::uuid,${ea.person_type},${ea.person_id||null}::uuid,
        ${ea.participant_name},${ea.created_at||new Date().toISOString()}::timestamptz)`;
    }
    for (const er of payload.eventRegistrations || []) {
      await tx`insert into event_registrations(id,event_id,family_id,status,verified_email,registration_kind,created_at,updated_at)
        values(${er.id}::uuid,${er.event_id}::uuid,${er.family_id}::uuid,${er.status||'confirmed'},${er.verified_email||''},${er.registration_kind||'member'},
        ${er.created_at||new Date().toISOString()}::timestamptz,${er.updated_at||new Date().toISOString()}::timestamptz)`;
    }
    for (const era of payload.eventRegistrationAttendees || []) {
      await tx`insert into event_registration_attendees(registration_id,person_type,person_id,participant_name,created_at)
        values(${era.registration_id}::uuid,${era.person_type},${era.person_id}::uuid,${era.participant_name},
        ${era.created_at||new Date().toISOString()}::timestamptz)`;
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


function numericMemberNumber(value:any){
  const digits=String(value||'').replace(/\D/g,'').replace(/^0+/,'');
  return digits || '0';
}

async function createRegistrationSession(eventId:string,familyId:string,email:string){
  const token=randomToken(32);
  const tokenHash=await sha256(token);
  await sql`delete from event_registration_sessions where expires_at < now()`;
  await sql`insert into event_registration_sessions(event_id,family_id,verified_email,token_hash,expires_at)
    values(${eventId}::uuid,${familyId}::uuid,${email},${tokenHash},now()+interval '30 minutes')`;
  return token;
}

async function registrationSession(token:string,eventId:string){
  if(!token) return null;
  const tokenHash=await sha256(token);
  const rows=await sql`
    select s.event_id,s.family_id,s.verified_email,f.family_name,f.membership_number,f.is_active_this_year
    from event_registration_sessions s
    join families f on f.id=s.family_id
    where s.token_hash=${tokenHash} and s.event_id=${eventId}::uuid and s.expires_at>now()
    limit 1`;
  return rows[0] || null;
}

async function publicFamilyRegistrationState(eventId:string,familyId:string){
  const [guardians,students,registrationRows]=await Promise.all([
    sql`select id,first_name,last_name,relationship from guardians where family_id=${familyId}::uuid order by created_at`,
    sql`select id,first_name,last_name,class_name from students where family_id=${familyId}::uuid order by created_at`,
    sql`select r.id,r.status,r.updated_at,a.person_type,a.person_id,a.participant_name
      from event_registrations r
      left join event_registration_attendees a on a.registration_id=r.id
      where r.event_id=${eventId}::uuid and r.family_id=${familyId}::uuid
      order by a.created_at`
  ]);
  const registration=registrationRows.length ? {
    id:registrationRows[0].id,
    status:registrationRows[0].status,
    updatedAt:registrationRows[0].updated_at,
    attendees:registrationRows.filter((r:any)=>r.person_id).map((r:any)=>({
      personType:r.person_type,personId:r.person_id,participantName:r.participant_name
    }))
  } : null;
  return {
    members:[
      ...guardians.map((g:any)=>({
        personType:'guardian',personId:g.id,
        name:[g.first_name,g.last_name].filter(Boolean).join(' '),
        detail:g.relationship==='tutor_legal'?'Tutor/a legal':g.relationship==='madre'?'Madre':g.relationship==='padre'?'Padre':'Adulto'
      })),
      ...students.map((s:any)=>({
        personType:'student',personId:s.id,
        name:[s.first_name,s.last_name].filter(Boolean).join(' '),
        detail:s.class_name||'Alumno/a'
      }))
    ],
    registration
  };
}

async function eventRegistrationOpen(event:any){
  if(!event?.registration_enabled) return false;
  const deadline=event.registration_deadline
    ? new Date(event.registration_deadline)
    : new Date(String(event.event_date).slice(0,10)+'T23:59:59+02:00');
  return Number.isFinite(deadline.getTime()) && Date.now()<=deadline.getTime();
}

function escapeHtmlValue(value:any){
  return String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

async function sendRegistrationMail(to:string,subject:string,html:string){
  const config=await getEmailProviderConfig();
  if(!config.configured) return {sent:false,configured:false};
  const response=await fetch('https://api.resend.com/emails',{
    method:'POST',
    headers:{'Content-Type':'application/json','Authorization':`Bearer ${config.apiKey}`},
    body:JSON.stringify({
      from:`${config.senderName} <${config.fromEmail}>`,
      to:[to],
      subject,
      html
    })
  });
  const result=await response.json().catch(()=>({}));
  return {sent:response.ok,configured:true,result,status:response.status};
}

async function promoteEventWaitlist(eventId:string){
  const promoted:Array<{email:string;familyName:string;eventTitle:string}>=[];

  await sql.begin(async tx=>{
    const eventRows=await tx`select id,title,registration_capacity from events where id=${eventId}::uuid for update`;
    if(!eventRows.length) return;
    const event=eventRows[0];

    if(event.registration_capacity==null){
      const rows=await tx`
        update event_registrations r set status='confirmed',updated_at=now()
        from families f
        where r.event_id=${eventId}::uuid and r.status='waitlist' and f.id=r.family_id
        returning r.verified_email,f.family_name`;
      for(const row of rows) promoted.push({email:row.verified_email,familyName:row.family_name,eventTitle:event.title});
      return;
    }

    const currentRows=await tx`
      select count(*)::int as count
      from event_registration_attendees a
      join event_registrations r on r.id=a.registration_id
      where r.event_id=${eventId}::uuid and r.status='confirmed'`;
    let occupied=currentRows[0]?.count||0;
    const waiting=await tx`
      select r.id,r.verified_email,f.family_name,count(a.person_id)::int as attendee_count
      from event_registrations r
      join families f on f.id=r.family_id
      left join event_registration_attendees a on a.registration_id=r.id
      where r.event_id=${eventId}::uuid and r.status='waitlist'
      group by r.id,r.verified_email,f.family_name,r.created_at
      order by r.created_at asc`;

    for(const row of waiting){
      const count=row.attendee_count||0;
      if(count<1 || occupied+count>event.registration_capacity) continue;
      await tx`update event_registrations set status='confirmed',updated_at=now() where id=${row.id}::uuid`;
      occupied+=count;
      promoted.push({email:row.verified_email,familyName:row.family_name,eventTitle:event.title});
    }
  });

  for(const item of promoted){
    await sendRegistrationMail(
      item.email,
      `Plaza confirmada · ${item.eventTitle}`,
      `<div style="font-family:Arial,sans-serif;color:#1e293b;line-height:1.6"><h2>Plaza confirmada</h2><p>La inscripción de la familia <strong>${item.familyName}</strong> ha pasado de lista de espera a <strong>confirmada</strong> para <strong>${item.eventTitle}</strong>.</p><p>AMPA Agustinos Granada</p></div>`
    ).catch(()=>null);
  }
  return promoted;
}

Deno.serve(async (req: Request) => {
  const path = pathOf(req);
  try {
    const publicEventMatch=path.match(/^\/public\/events\/([0-9a-f-]+)$/i);
    if(publicEventMatch && req.method==='GET'){
      const token=publicEventMatch[1];
      const rows=await sql`select * from events where registration_token=${token}::uuid limit 1`;
      if(!rows.length) return reply({error:'EVENT_NOT_FOUND'},404);
      const e=rows[0];
      return reply({event:{
        title:e.title,
        eventDate:isoDateFromDb(e.event_date),
        academicYear:e.academic_year,
        description:e.description||'',
        imageDataUrl:e.image_data_url||'',
        registrationEnabled:e.registration_enabled,
        registrationDeadline:e.registration_deadline,
        registrationCapacity:e.registration_capacity==null?null:Number(e.registration_capacity),
        maxAttendeesPerFamily:e.max_attendees_per_family,
        registrationMessage:e.registration_message||'',
        registrationAudience:e.registration_audience||'members_only',
        isOpen:await eventRegistrationOpen(e)
      }});
    }

    const publicCodeMatch=path.match(/^\/public\/events\/([0-9a-f-]+)\/request-code$/i);
    if(publicCodeMatch && req.method==='POST'){
      const token=publicCodeMatch[1];
      const body=await readBody(req);
      const memberInput=String(body.membershipNumber||'').trim();
      const email=String(body.email||'').trim().toLowerCase();
      if(!memberInput || !email || email.length>254) return reply({error:'INVALID_IDENTIFICATION'},400);

      const events=await sql`select * from events where registration_token=${token}::uuid limit 1`;
      if(!events.length) return reply({error:'EVENT_NOT_FOUND'},404);
      const event=events[0];
      const eventOpen=await eventRegistrationOpen(event);

      const memberNormalized=numericMemberNumber(memberInput);
      const matches=await sql`
        select f.id as family_id,f.family_name,f.membership_number,f.is_active_this_year,
               g.id as guardian_id,g.email
        from families f
        join guardians g on g.family_id=f.id
        where lower(trim(coalesce(g.email,'')))=${email}
          and (
            lower(trim(f.membership_number))=lower(trim(${memberInput}))
            or ltrim(regexp_replace(f.membership_number,'\\D','','g'),'0')=${memberNormalized}
          )
        order by g.is_main_contact desc,g.created_at
        limit 1`;
      const match=matches[0];
      if(!match) return reply({error:'MEMBERSHIP_NOT_VERIFIED'},422);
      if(!match.is_active_this_year) return reply({error:'MEMBERSHIP_INACTIVE'},403);

      const existingRegistration=await sql`
        select id,status from event_registrations
        where event_id=${event.id}::uuid and family_id=${match.family_id}::uuid
          and status<>'cancelled'
        limit 1`;
      if(!event.registration_enabled && !existingRegistration.length) return reply({error:'REGISTRATION_DISABLED'},409);
      if(!eventOpen && !existingRegistration.length) return reply({error:'REGISTRATION_CLOSED'},409);

      const recent=await sql`
        select count(*)::int as count from event_registration_challenges
        where event_id=${event.id}::uuid and family_id=${match.family_id}::uuid
          and created_at>now()-interval '15 minutes'`;
      if((recent[0]?.count||0)>=4) return reply({error:'TOO_MANY_CODES'},429);

      const mailConfig=await getEmailProviderConfig();
      const challengeId=crypto.randomUUID();

      if(!mailConfig.configured){
        await sql`insert into event_registration_challenges(id,event_id,family_id,guardian_id,email,code_hash,verified_at)
          values(${challengeId}::uuid,${event.id}::uuid,${match.family_id}::uuid,${match.guardian_id}::uuid,${email},null,now())`;
        const verificationToken=await createRegistrationSession(event.id,match.family_id,email);
        return reply({ok:true,mode:'direct',verificationToken});
      }

      const random=crypto.getRandomValues(new Uint32Array(1))[0];
      const code=String(100000+(random%900000));
      const codeHash=await sha256(`${challengeId}:${code}`);
      await sql`insert into event_registration_challenges(id,event_id,family_id,guardian_id,email,code_hash)
        values(${challengeId}::uuid,${event.id}::uuid,${match.family_id}::uuid,${match.guardian_id}::uuid,${email},${codeHash})`;

      const sent=await sendRegistrationMail(
        email,
        `Código de inscripción · ${event.title}`,
        `<div style="font-family:Arial,sans-serif;color:#1e293b;line-height:1.6"><p>Hola,</p><p>Tu código para gestionar la inscripción de la familia <strong>${escapeHtmlValue(match.family_name)}</strong> en <strong>${escapeHtmlValue(event.title)}</strong> es:</p><div style="font-size:32px;font-weight:800;letter-spacing:8px;margin:22px 0">${code}</div><p>Caduca en 10 minutos. Si no has solicitado este código, ignora este mensaje.</p><p>AMPA Agustinos Granada</p></div>`
      );
      if(!sent.sent){
        await sql`delete from event_registration_challenges where id=${challengeId}::uuid`;
        return reply({error:'EMAIL_PROVIDER_FAILED'},502);
      }
      return reply({ok:true,mode:'otp',challengeId});
    }

    const publicGuestMatch=path.match(/^\/public\/events\/([0-9a-f-]+)\/guest-register$/i);
    if(publicGuestMatch && req.method==='POST'){
      const token=publicGuestMatch[1];
      const body=await readBody(req);
      const familyName=String(body.familyName||'').trim().slice(0,160);
      const contactName=String(body.contactName||'').trim().slice(0,160);
      const email=String(body.email||'').trim().toLowerCase().slice(0,254);
      const phone=String(body.phone||'').trim().slice(0,40);
      const attendeeNames=Array.isArray(body.attendeeNames)
        ? body.attendeeNames.map((name:any)=>String(name||'').trim().slice(0,160)).filter(Boolean)
        : [];

      if(!familyName || !contactName || !email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return reply({error:'INVALID_GUEST_DATA'},400);

      const events=await sql`select * from events where registration_token=${token}::uuid limit 1`;
      if(!events.length) return reply({error:'EVENT_NOT_FOUND'},404);
      const event=events[0];
      if((event.registration_audience||'members_only')!=='public') return reply({error:'MEMBERS_ONLY_EVENT'},403);
      if(!event.registration_enabled || !await eventRegistrationOpen(event)) return reply({error:'REGISTRATION_CLOSED'},409);
      if(!attendeeNames.length) return reply({error:'NO_ATTENDEES'},400);
      if(attendeeNames.length>Number(event.max_attendees_per_family||8)) return reply({error:'FAMILY_LIMIT_EXCEEDED'},400);

      let finalStatus='confirmed';
      let registrationId='';
      let createdInactiveFamily=false;
      let resolvedFamilyId='';
      let resolvedFamilyName=familyName;

      await sql.begin(async tx=>{
        const lockedRows=await tx`select * from events where id=${event.id}::uuid for update`;
        const current=lockedRows[0];
        if(!current || !current.registration_enabled || (current.registration_audience||'members_only')!=='public') {
          throw Object.assign(new Error('REGISTRATION_CLOSED'),{status:409});
        }

        const existingFamilies=await tx`
          select f.id,f.family_name,f.is_active_this_year
          from families f
          join guardians g on g.family_id=f.id
          where lower(trim(coalesce(g.email,'')))=${email}
          order by f.is_active_this_year desc,g.is_main_contact desc,g.created_at
          limit 1`;

        if(existingFamilies.length){
          resolvedFamilyId=existingFamilies[0].id;
          resolvedFamilyName=existingFamilies[0].family_name;
        }else{
          const familyId=crypto.randomUUID();
          const guestMembership=`INV-${crypto.randomUUID().slice(0,8).toUpperCase()}`;
          const nameParts=contactName.split(/\s+/).filter(Boolean);
          const firstName=nameParts.shift()||contactName;
          const lastName=nameParts.join(' ');
          await tx`
            insert into families(id,membership_number,family_name,is_active_this_year,registration_academic_year,notes)
            values(
              ${familyId}::uuid,${guestMembership},${familyName},false,null,
              ${`Alta automática INACTIVA desde inscripción pública al evento: ${event.title}`}
            )`;
          await tx`
            insert into guardians(family_id,first_name,last_name,relationship,phone,email,is_main_contact)
            values(${familyId}::uuid,${firstName},${lastName},'otro',${phone||null},${email},true)`;
          resolvedFamilyId=familyId;
          createdInactiveFamily=true;
        }

        const occupiedRows=await tx`
          select count(*)::int as count
          from event_registration_attendees a
          join event_registrations r on r.id=a.registration_id
          where r.event_id=${event.id}::uuid and r.status='confirmed' and r.family_id<>${resolvedFamilyId}::uuid`;
        const occupied=occupiedRows[0]?.count||0;
        const capacity=current.registration_capacity==null?null:Number(current.registration_capacity);
        finalStatus=capacity!=null && occupied+attendeeNames.length>capacity ? 'waitlist' : 'confirmed';

        const rows=await tx`
          insert into event_registrations(event_id,family_id,status,verified_email,registration_kind,updated_at)
          values(${event.id}::uuid,${resolvedFamilyId}::uuid,${finalStatus},${email},'public',now())
          on conflict(event_id,family_id) do update set
            status=excluded.status,
            verified_email=excluded.verified_email,
            registration_kind=case when event_registrations.registration_kind='member' then 'member' else 'public' end,
            updated_at=now()
          returning id`;
        registrationId=rows[0].id;
        await tx`delete from event_registration_attendees where registration_id=${registrationId}::uuid`;
        for(const name of attendeeNames){
          await tx`
            insert into event_registration_attendees(registration_id,person_type,person_id,participant_name)
            values(${registrationId}::uuid,'guardian',${crypto.randomUUID()}::uuid,${name})`;
        }
      });

      await promoteEventWaitlist(event.id);
      const fresh=await sql`select status from event_registrations where id=${registrationId}::uuid limit 1`;
      finalStatus=fresh[0]?.status||finalStatus;
      let waitlistPosition:null|number=null;
      if(finalStatus==='waitlist'){
        const pos=await sql`
          select count(*)::int as position
          from event_registrations r
          where r.event_id=${event.id}::uuid and r.status='waitlist'
            and r.created_at <= (select created_at from event_registrations where id=${registrationId}::uuid)`;
        waitlistPosition=pos[0]?.position||1;
      }

      const statusText=finalStatus==='confirmed'?'confirmada':'en lista de espera';
      await sendRegistrationMail(
        email,
        `Inscripción ${statusText} · ${event.title}`,
        `<div style="font-family:Arial,sans-serif;color:#1e293b;line-height:1.6"><h2>Inscripción ${statusText}</h2><p>La inscripción de <strong>${escapeHtmlValue(resolvedFamilyName)}</strong> para <strong>${escapeHtmlValue(event.title)}</strong> ha quedado <strong>${statusText}</strong>.</p><p>Personas incluidas: <strong>${attendeeNames.length}</strong>.</p><p>AMPA Agustinos Granada</p></div>`
      ).catch(()=>null);

      return reply({ok:true,status:finalStatus,waitlistPosition,createdInactiveFamily});
    }

    const publicVerifyMatch=path.match(/^\/public\/events\/([0-9a-f-]+)\/verify-code$/i);
    if(publicVerifyMatch && req.method==='POST'){
      const token=publicVerifyMatch[1];
      const body=await readBody(req);
      const challengeId=String(body.challengeId||'');
      const code=String(body.code||'').replace(/\D/g,'').slice(0,6);
      if(!challengeId || code.length!==6) return reply({error:'INVALID_CODE'},400);
      const rows=await sql`
        select c.*,f.is_active_this_year,e.registration_token
        from event_registration_challenges c
        join families f on f.id=c.family_id
        join events e on e.id=c.event_id
        where c.id=${challengeId}::uuid and e.registration_token=${token}::uuid
        limit 1`;
      const challenge=rows[0];
      if(!challenge || challenge.verified_at || new Date(challenge.expires_at).getTime()<Date.now() || challenge.attempts>=5) {
        return reply({error:'CODE_EXPIRED'},410);
      }
      await sql`update event_registration_challenges set attempts=attempts+1 where id=${challengeId}::uuid`;
      const expected=await sha256(`${challengeId}:${code}`);
      if(expected!==challenge.code_hash) return reply({error:'INVALID_CODE'},400);
      if(!challenge.is_active_this_year) return reply({error:'MEMBERSHIP_INACTIVE'},403);
      await sql`update event_registration_challenges set verified_at=now() where id=${challengeId}::uuid`;
      const verificationToken=await createRegistrationSession(challenge.event_id,challenge.family_id,challenge.email);
      return reply({ok:true,verificationToken});
    }

    const publicSessionMatch=path.match(/^\/public\/events\/([0-9a-f-]+)\/session$/i);
    if(publicSessionMatch && req.method==='POST'){
      const token=publicSessionMatch[1];
      const body=await readBody(req);
      const events=await sql`select id from events where registration_token=${token}::uuid limit 1`;
      if(!events.length) return reply({error:'EVENT_NOT_FOUND'},404);
      const session=await registrationSession(String(body.verificationToken||''),events[0].id);
      if(!session) return reply({error:'VERIFICATION_EXPIRED'},401);
      if(!session.is_active_this_year) return reply({error:'MEMBERSHIP_INACTIVE'},403);
      const state=await publicFamilyRegistrationState(events[0].id,session.family_id);
      return reply({
        family:{
          familyName:session.family_name,
          membershipNumber:numericMemberNumber(session.membership_number),
          members:state.members
        },
        registration:state.registration
      });
    }

    const publicRegisterMatch=path.match(/^\/public\/events\/([0-9a-f-]+)\/register$/i);
    if(publicRegisterMatch && req.method==='POST'){
      const token=publicRegisterMatch[1];
      const body=await readBody(req);
      const eventRows=await sql`select * from events where registration_token=${token}::uuid limit 1`;
      if(!eventRows.length) return reply({error:'EVENT_NOT_FOUND'},404);
      const event=eventRows[0];
      if(!event.registration_enabled || !await eventRegistrationOpen(event)) return reply({error:'REGISTRATION_CLOSED'},409);
      const session=await registrationSession(String(body.verificationToken||''),event.id);
      if(!session) return reply({error:'VERIFICATION_EXPIRED'},401);
      if(!session.is_active_this_year) return reply({error:'MEMBERSHIP_INACTIVE'},403);

      const requested=Array.isArray(body.attendees)?body.attendees:[];
      const uniqueKeys=new Set<string>();
      const normalized:any[]=[];
      for(const item of requested){
        const personType=item?.personType;
        const personId=String(item?.personId||'');
        if(!['guardian','student'].includes(personType) || !/^[0-9a-f-]{36}$/i.test(personId)) continue;
        const key=`${personType}:${personId}`;
        if(uniqueKeys.has(key)) continue;
        uniqueKeys.add(key);
        normalized.push({personType,personId});
      }
      if(!normalized.length) return reply({error:'NO_ATTENDEES'},400);
      if(normalized.length>Number(event.max_attendees_per_family||8)) return reply({error:'FAMILY_LIMIT_EXCEEDED'},400);

      let finalStatus='confirmed';
      let registrationId='';
      await sql.begin(async tx=>{
        const locked=await tx`select * from events where id=${event.id}::uuid for update`;
        const current=locked[0];
        if(!current || !current.registration_enabled) throw Object.assign(new Error('REGISTRATION_CLOSED'),{status:409});

        const [guardians,students]=await Promise.all([
          tx`select id,first_name,last_name from guardians where family_id=${session.family_id}::uuid`,
          tx`select id,first_name,last_name from students where family_id=${session.family_id}::uuid`
        ]);
        const valid=new Map<string,string>();
        for(const g of guardians) valid.set(`guardian:${g.id}`,[g.first_name,g.last_name].filter(Boolean).join(' '));
        for(const s of students) valid.set(`student:${s.id}`,[s.first_name,s.last_name].filter(Boolean).join(' '));
        for(const item of normalized){
          if(!valid.has(`${item.personType}:${item.personId}`)) throw Object.assign(new Error('INVALID_ATTENDEE'),{status:400});
        }

        const occupiedRows=await tx`
          select count(*)::int as count
          from event_registration_attendees a
          join event_registrations r on r.id=a.registration_id
          where r.event_id=${event.id}::uuid and r.status='confirmed' and r.family_id<>${session.family_id}::uuid`;
        const occupied=occupiedRows[0]?.count||0;
        const capacity=current.registration_capacity==null?null:Number(current.registration_capacity);
        finalStatus=capacity!=null && occupied+normalized.length>capacity ? 'waitlist' : 'confirmed';

        const rows=await tx`
          insert into event_registrations(event_id,family_id,status,verified_email,registration_kind,updated_at)
          values(${event.id}::uuid,${session.family_id}::uuid,${finalStatus},${session.verified_email},'member',now())
          on conflict(event_id,family_id) do update set
            status=excluded.status,verified_email=excluded.verified_email,registration_kind='member',updated_at=now()
          returning id`;
        registrationId=rows[0].id;
        await tx`delete from event_registration_attendees where registration_id=${registrationId}::uuid`;
        for(const item of normalized){
          const name=valid.get(`${item.personType}:${item.personId}`)||'';
          await tx`insert into event_registration_attendees(registration_id,person_type,person_id,participant_name)
            values(${registrationId}::uuid,${item.personType},${item.personId}::uuid,${name})`;
        }
      });

      await promoteEventWaitlist(event.id);
      const fresh=await sql`select status from event_registrations where id=${registrationId}::uuid limit 1`;
      finalStatus=fresh[0]?.status||finalStatus;
      let waitlistPosition:null|number=null;
      if(finalStatus==='waitlist'){
        const pos=await sql`
          select count(*)::int as position
          from event_registrations r
          where r.event_id=${event.id}::uuid and r.status='waitlist'
            and r.created_at <= (select created_at from event_registrations where id=${registrationId}::uuid)`;
        waitlistPosition=pos[0]?.position||1;
      }

      const statusText=finalStatus==='confirmed'?'confirmada':'en lista de espera';
      await sendRegistrationMail(
        session.verified_email,
        `Inscripción ${statusText} · ${event.title}`,
        `<div style="font-family:Arial,sans-serif;color:#1e293b;line-height:1.6"><h2>Inscripción ${statusText}</h2><p>La inscripción de la familia <strong>${escapeHtmlValue(session.family_name)}</strong> para <strong>${escapeHtmlValue(event.title)}</strong> ha quedado <strong>${statusText}</strong>.</p><p>Personas incluidas: <strong>${normalized.length}</strong>.</p><p>Puedes volver al mismo enlace para modificar o cancelar la inscripción.</p><p>AMPA Agustinos Granada</p></div>`
      ).catch(()=>null);

      return reply({ok:true,status:finalStatus,waitlistPosition});
    }

    const publicCancelMatch=path.match(/^\/public\/events\/([0-9a-f-]+)\/cancel$/i);
    if(publicCancelMatch && req.method==='POST'){
      const token=publicCancelMatch[1];
      const body=await readBody(req);
      const events=await sql`select id,title from events where registration_token=${token}::uuid limit 1`;
      if(!events.length) return reply({error:'EVENT_NOT_FOUND'},404);
      const event=events[0];
      const session=await registrationSession(String(body.verificationToken||''),event.id);
      if(!session) return reply({error:'VERIFICATION_EXPIRED'},401);
      const rows=await sql`
        update event_registrations set status='cancelled',updated_at=now()
        where event_id=${event.id}::uuid and family_id=${session.family_id}::uuid
        returning id`;
      if(!rows.length) return reply({error:'REGISTRATION_NOT_FOUND'},404);
      await promoteEventWaitlist(event.id);
      await sendRegistrationMail(
        session.verified_email,
        `Inscripción cancelada · ${event.title}`,
        `<div style="font-family:Arial,sans-serif;color:#1e293b;line-height:1.6"><p>Se ha cancelado la inscripción de la familia <strong>${escapeHtmlValue(session.family_name)}</strong> en <strong>${escapeHtmlValue(event.title)}</strong>.</p><p>AMPA Agustinos Granada</p></div>`
      ).catch(()=>null);
      return reply({ok:true});
    }

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


    if (path === '/events' && req.method === 'GET') {
      await requireUser(req);
      const [events, familyCounts, attendeeCounts, registrationCounts, totals] = await Promise.all([
        sql`select * from events order by event_date desc, created_at desc`,
        sql`select event_id,count(*)::int as count from event_families group by event_id`,
        sql`select event_id,count(*)::int as count from event_attendees group by event_id`,
        sql`
          select r.event_id,
            count(distinct r.family_id) filter (where r.status='confirmed')::int as registered_family_count,
            count(a.person_id) filter (where r.status='confirmed')::int as registered_participant_count,
            count(distinct r.family_id) filter (where r.status='waitlist')::int as waitlist_family_count
          from event_registrations r
          left join event_registration_attendees a on a.registration_id=r.id
          group by r.event_id`,
        sql`select
          (select count(*)::int from families where is_active_this_year=true) as active_families,
          (
            (select count(*)::int from guardians g join families f on f.id=g.family_id where f.is_active_this_year=true)
            +
            (select count(*)::int from students s join families f on f.id=s.family_id where f.is_active_this_year=true)
          ) as census_people`
      ]);
      const activeFamilies = totals[0]?.active_families || 0;
      const censusPeople = totals[0]?.census_people || 0;
      return reply({events:events.map((e:any)=>{
        const familyCount=familyCounts.find((x:any)=>x.event_id===e.id)?.count || 0;
        const participantCount=attendeeCounts.find((x:any)=>x.event_id===e.id)?.count || 0;
        const reg=registrationCounts.find((x:any)=>x.event_id===e.id) || {};
        return {
          id:e.id,title:e.title,eventDate:isoDateFromDb(e.event_date),academicYear:e.academic_year,description:e.description||'',imageDataUrl:e.image_data_url||'',
          familyCount,participantCount,
          familyParticipationRate:activeFamilies ? Math.round((familyCount/activeFamilies)*1000)/10 : 0,
          censusParticipationRate:censusPeople ? Math.round((participantCount/censusPeople)*1000)/10 : 0,
          registrationEnabled:!!e.registration_enabled,
          registrationToken:e.registration_token,
          registrationDeadline:e.registration_deadline,
          registrationCapacity:e.registration_capacity==null?null:Number(e.registration_capacity),
          maxAttendeesPerFamily:e.max_attendees_per_family||8,
          registrationMessage:e.registration_message||'',
          registrationAudience:e.registration_audience||'members_only',
          registeredFamilyCount:reg.registered_family_count||0,
          registeredParticipantCount:reg.registered_participant_count||0,
          waitlistFamilyCount:reg.waitlist_family_count||0,
          createdAt:e.created_at,updatedAt:e.updated_at
        };
      }),totals:{activeFamilies,censusPeople}});
    }

    if (path === '/events' && req.method === 'POST') {
      const u=await requireRole(req,['superadmin','admin']);
      const body=await readBody(req);
      const academicYear=String(body.academicYear||'').trim();
      const capacity=body.registrationCapacity==null || body.registrationCapacity==='' ? null : Number(body.registrationCapacity);
      const maxPerFamily=Math.max(1,Math.min(20,Number(body.maxAttendeesPerFamily||8)));
      if (!String(body.title||'').trim() || !body.eventDate || !/^[0-9]{4}\/[0-9]{4}$/.test(academicYear)) return reply({error:'INVALID_EVENT'},400);
      if (capacity!=null && (!Number.isInteger(capacity) || capacity<1)) return reply({error:'INVALID_CAPACITY'},400);
      if (String(body.imageDataUrl||'').length > 1500000) return reply({error:'EVENT_IMAGE_TOO_LARGE'},413);
      const rows=await sql`insert into events(
          title,event_date,academic_year,description,image_data_url,created_by,
          registration_enabled,registration_deadline,registration_capacity,max_attendees_per_family,registration_message,registration_audience
        )
        values(
          ${String(body.title).trim()},${body.eventDate}::date,${academicYear},${String(body.description||'').trim()},${body.imageDataUrl||null},${u.id}::uuid,
          ${!!body.registrationEnabled},${body.registrationDeadline||null}::timestamptz,${capacity},${maxPerFamily},${String(body.registrationMessage||'').trim().slice(0,2000)},${body.registrationAudience==='public'?'public':'members_only'}
        )
        returning *`;
      await log(u.id,'event','create',`Evento creado: ${rows[0].title}`,rows[0].id,rows[0].title);
      return reply({event:{id:rows[0].id}},201);
    }

    const eventMatch=path.match(/^\/events\/([0-9a-f-]+)$/i);
    if (eventMatch && req.method === 'GET') {
      await requireUser(req);
      const id=eventMatch[1];
      const rows=await sql`select * from events where id=${id}::uuid limit 1`;
      if (!rows.length) return reply({error:'EVENT_NOT_FOUND'},404);
      const [families,attendees,registrationRows]=await Promise.all([
        sql`select family_id from event_families where event_id=${id}::uuid order by created_at`,
        sql`select id,family_id,person_type,person_id,participant_name from event_attendees where event_id=${id}::uuid order by created_at`,
        sql`
          select r.id,r.family_id,r.status,r.verified_email,r.registration_kind,r.created_at,r.updated_at,
                 f.family_name,f.membership_number,
                 a.person_type,a.person_id,a.participant_name
          from event_registrations r
          join families f on f.id=r.family_id
          left join event_registration_attendees a on a.registration_id=r.id
          where r.event_id=${id}::uuid
          order by r.created_at,a.created_at`
      ]);
      const registrationsMap=new Map<string,any>();
      for(const row of registrationRows){
        if(!registrationsMap.has(row.id)){
          registrationsMap.set(row.id,{
            id:row.id,familyId:row.family_id,familyName:row.family_name,membershipNumber:row.membership_number,
            status:row.status,verifiedEmail:row.verified_email,registrationKind:row.registration_kind||'member',createdAt:row.created_at,updatedAt:row.updated_at,attendees:[]
          });
        }
        if(row.person_id) registrationsMap.get(row.id).attendees.push({
          personType:row.person_type,personId:row.person_id,participantName:row.participant_name
        });
      }
      const e=rows[0];
      return reply({event:{
        id:e.id,title:e.title,eventDate:isoDateFromDb(e.event_date),academicYear:e.academic_year,description:e.description||'',imageDataUrl:e.image_data_url||'',
        registrationEnabled:!!e.registration_enabled,
        registrationToken:e.registration_token,
        registrationDeadline:e.registration_deadline,
        registrationCapacity:e.registration_capacity==null?null:Number(e.registration_capacity),
        maxAttendeesPerFamily:e.max_attendees_per_family||8,
        registrationMessage:e.registration_message||'',
        registrationAudience:e.registration_audience||'members_only',
        familyIds:families.map((x:any)=>x.family_id),
        attendees:attendees.map((a:any)=>({id:a.id,familyId:a.family_id,personType:a.person_type,personId:a.person_id,participantName:a.participant_name})),
        registrations:Array.from(registrationsMap.values())
      }});
    }

    if (eventMatch && req.method === 'PUT') {
      const u=await requireRole(req,['superadmin','admin']);
      const id=eventMatch[1];
      const body=await readBody(req);
      const academicYear=String(body.academicYear||'').trim();
      const capacity=body.registrationCapacity==null || body.registrationCapacity==='' ? null : Number(body.registrationCapacity);
      const maxPerFamily=Math.max(1,Math.min(20,Number(body.maxAttendeesPerFamily||8)));
      if (!String(body.title||'').trim() || !body.eventDate || !/^[0-9]{4}\/[0-9]{4}$/.test(academicYear)) return reply({error:'INVALID_EVENT'},400);
      if (capacity!=null && (!Number.isInteger(capacity) || capacity<1)) return reply({error:'INVALID_CAPACITY'},400);
      if (String(body.imageDataUrl||'').length > 1500000) return reply({error:'EVENT_IMAGE_TOO_LARGE'},413);
      const rows=await sql`update events set
        title=${String(body.title).trim()},event_date=${body.eventDate}::date,academic_year=${academicYear},
        description=${String(body.description||'').trim()},image_data_url=${body.imageDataUrl||null},
        registration_enabled=${!!body.registrationEnabled},
        registration_deadline=${body.registrationDeadline||null}::timestamptz,
        registration_capacity=${capacity},
        max_attendees_per_family=${maxPerFamily},
        registration_message=${String(body.registrationMessage||'').trim().slice(0,2000)},
        registration_audience=${body.registrationAudience==='public'?'public':'members_only'},
        updated_at=now()
        where id=${id}::uuid returning title`;
      if (!rows.length) return reply({error:'EVENT_NOT_FOUND'},404);
      await promoteEventWaitlist(id);
      await log(u.id,'event','update',`Evento actualizado: ${rows[0].title}`,id,rows[0].title);
      return reply({ok:true});
    }

    const registrationToggleMatch=path.match(/^\/events\/([0-9a-f-]+)\/registration$/i);
    if (registrationToggleMatch && req.method === 'PATCH') {
      const u=await requireRole(req,['superadmin','admin']);
      const id=registrationToggleMatch[1];
      const body=await readBody(req);
      if(typeof body.enabled!=='boolean') return reply({error:'INVALID_REGISTRATION_STATE'},400);

      const currentRows=await sql`select title,registration_deadline from events where id=${id}::uuid limit 1`;
      if(!currentRows.length) return reply({error:'EVENT_NOT_FOUND'},404);
      const current=currentRows[0];

      let deadlineCleared=false;
      if(body.enabled && current.registration_deadline && new Date(current.registration_deadline).getTime() < Date.now()){
        deadlineCleared=true;
      }

      const rows=await sql`
        update events
        set registration_enabled=${body.enabled},
            registration_deadline=case when ${deadlineCleared} then null else registration_deadline end,
            updated_at=now()
        where id=${id}::uuid
        returning title,registration_enabled,registration_deadline`;

      await log(
        u.id,
        'event',
        'update',
        body.enabled ? 'Inscripciones abiertas' : 'Inscripciones cerradas',
        id,
        rows[0].title
      );

      return reply({
        ok:true,
        registrationEnabled:!!rows[0].registration_enabled,
        registrationDeadline:rows[0].registration_deadline,
        deadlineCleared
      });
    }

    if (eventMatch && req.method === 'DELETE') {
      const u=await requireRole(req,['superadmin']);
      const id=eventMatch[1];
      const rows=await sql`delete from events where id=${id}::uuid returning title`;
      if (!rows.length) return reply({error:'EVENT_NOT_FOUND'},404);
      await log(u.id,'event','delete',`Evento eliminado: ${rows[0].title}`,id,rows[0].title);
      return reply({ok:true});
    }

    const attendanceMatch=path.match(/^\/events\/([0-9a-f-]+)\/attendance$/i);
    if (attendanceMatch && req.method === 'PUT') {
      const u=await requireRole(req,['superadmin','admin']);
      const id=attendanceMatch[1];
      const body=await readBody(req);
      if (!Array.isArray(body.families) || body.families.length > 1000) return reply({error:'INVALID_EVENT_ATTENDANCE'},400);
      const eventRows=await sql`select title from events where id=${id}::uuid limit 1`;
      if (!eventRows.length) return reply({error:'EVENT_NOT_FOUND'},404);
      let attendeeTotal=0;
      await sql.begin(async tx=>{
        await tx`delete from event_attendees where event_id=${id}::uuid`;
        await tx`delete from event_families where event_id=${id}::uuid`;
        for (const family of body.families) {
          if (!family?.familyId) continue;
          const exists=await tx`select id from families where id=${family.familyId}::uuid limit 1`;
          if (!exists.length) continue;
          await tx`insert into event_families(event_id,family_id) values(${id}::uuid,${family.familyId}::uuid) on conflict do nothing`;
          for (const attendee of family.attendees || []) {
            if (!['guardian','student'].includes(attendee?.personType) || !attendee?.participantName) continue;
            attendeeTotal++;
            await tx`insert into event_attendees(event_id,family_id,person_type,person_id,participant_name)
              values(${id}::uuid,${family.familyId}::uuid,${attendee.personType},${attendee.personId||null}::uuid,${String(attendee.participantName).slice(0,180)})
              on conflict(event_id,person_type,person_id) do update set family_id=excluded.family_id,participant_name=excluded.participant_name`;
          }
        }
      });
      await log(u.id,'event','update',`Participación actualizada: ${body.families.length} familias · ${attendeeTotal} participantes`,id,eventRows[0].title);
      return reply({ok:true,families:body.families.length,participants:attendeeTotal});
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
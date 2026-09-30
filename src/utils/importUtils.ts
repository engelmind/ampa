import { Family, Guardian, Student } from '../types/family';

export interface ImportPreview {
  families: Family[];
  warnings: string[];
  errors: string[];
  sourceType: 'csv' | 'json';
}

const splitCsvLine = (line: string): string[] => {
  const out: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') { current += '"'; i++; }
      else quoted = !quoted;
    } else if (ch === ',' && !quoted) {
      out.push(current.trim());
      current = '';
    } else current += ch;
  }
  out.push(current.trim());
  return out.map((v) => v.replace(/^"|"$/g, '').trim());
};

const normalizeHeader = (h: string) => h.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');

const val = (row: Record<string,string>, aliases: string[]) => {
  for (const alias of aliases) {
    const key = Object.keys(row).find((k) => normalizeHeader(k) === normalizeHeader(alias));
    if (key && row[key]?.trim()) return row[key].trim();
  }
  return '';
};

const makeGuardian = (row: Record<string,string>, relationship: Guardian['relationship'], prefix: string, main = false): Guardian | null => {
  const firstName = val(row,[`${prefix} nombre`,`${prefix}_nombre`,`${prefix}nombre`]);
  const lastName = val(row,[`${prefix} apellidos`,`${prefix}_apellidos`,`${prefix}apellidos`]);
  const fullName = val(row,[prefix,`${prefix} nombre completo`,`${prefix}_nombre_completo`]) || [firstName,lastName].filter(Boolean).join(' ');
  const dni = val(row,[`${prefix} dni`,`${prefix} dni nie`,`${prefix}_dni`]);
  const phone = val(row,[`${prefix} telefono`,`${prefix} móvil`,`${prefix} movil`,`${prefix}_telefono`]);
  const email = val(row,[`${prefix} email`,`${prefix} correo`,`${prefix}_email`]);
  const birth = val(row,[`${prefix} fecha nacimiento`,`${prefix} nacimiento`,`${prefix}_fecha_nacimiento`]).replace(/\D/g,'');
  if (![firstName,lastName,fullName,dni,phone,email,birth].some(Boolean)) return null;
  return {
    id: crypto.randomUUID(),
    fullName,
    firstName: firstName || fullName.split(/\s+/)[0] || '',
    lastName: lastName || fullName.split(/\s+/).slice(1).join(' '),
    relationship,
    dni,
    phone,
    email,
    isMainContact: main,
    birthDateDDMMAAAA: birth.slice(0,8),
  };
};

const makeStudents = (row: Record<string,string>): Student[] => {
  const students: Student[] = [];
  for (let i=1;i<=8;i++) {
    const name = val(row,[`hijo${i} nombre`,`alumno${i} nombre`,`hijo ${i} nombre`,`alumno ${i} nombre`]);
    const lastName = val(row,[`hijo${i} apellidos`,`alumno${i} apellidos`,`hijo ${i} apellidos`,`alumno ${i} apellidos`]);
    const full = val(row,[`hijo${i}`,`alumno${i}`,`hijo ${i}`,`alumno ${i}`]);
    const birthRaw = val(row,[`hijo${i} fecha nacimiento`,`alumno${i} fecha nacimiento`,`hijo ${i} nacimiento`]).replace(/\D/g,'');
    const yearRaw = val(row,[`hijo${i} ano nacimiento`,`hijo${i} año nacimiento`,`alumno${i} año nacimiento`]);
    const parts = full.trim().split(/\s+/).filter(Boolean);
    const firstName = name || parts[0] || '';
    const surnames = lastName || parts.slice(1).join(' ');
    if (![firstName,surnames,birthRaw,yearRaw].some(Boolean)) continue;
    const birthYear = birthRaw.length === 8 ? Number(birthRaw.slice(4,8)) : Number(yearRaw) || new Date().getFullYear()-6;
    students.push({
      id: crypto.randomUUID(),
      firstName,
      lastName:surnames,
      dni:val(row,[`hijo${i} dni`,`alumno${i} dni`]),
      birthYear,
      birthDateDDMMAAAA:birthRaw.slice(0,8),
      courseOffset:0,
      groupLetter:val(row,[`hijo${i} grupo`,`alumno${i} grupo`]).toUpperCase().slice(0,2),
      allergies:val(row,[`hijo${i} alergias`,`alumno${i} alergias`]),
      specialNeeds:val(row,[`hijo${i} necesidades`,`alumno${i} necesidades`]),
      authorizedPhoto:false,
    });
  }
  return students;
};

export function previewImport(text: string, filename = ''): ImportPreview {
  const trimmed = text.trim();
  if (!trimmed) return {families:[],warnings:[],errors:['El archivo está vacío.'],sourceType:'csv'};

  if (filename.toLowerCase().endsWith('.json') || trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      const families = Array.isArray(parsed) ? parsed : parsed.families;
      if (!Array.isArray(families)) throw new Error('No se encuentra una matriz de familias.');
      const normalized = families.map((f:any) => ({
        ...f,
        id:f.id || crypto.randomUUID(),
        guardians:Array.isArray(f.guardians)?f.guardians:[],
        students:Array.isArray(f.students)?f.students:[],
        activeYears:Array.isArray(f.activeYears)?f.activeYears:[],
        address:f.address || {street:'',city:'Granada',postalCode:''},
        registrationDate:f.registrationDate || new Date().toISOString().slice(0,10),
        updatedAt:f.updatedAt || new Date().toISOString(),
      })) as Family[];
      const errors = normalized.flatMap((f,i)=>!f.membershipNumber || !f.familyName ? [`Fila ${i+1}: faltan nº de socio o familia.`] : []);
      return {families:normalized,warnings:[],errors,sourceType:'json'};
    } catch (e:any) {
      return {families:[],warnings:[],errors:[`JSON no válido: ${e?.message || 'error desconocido'}`],sourceType:'json'};
    }
  }

  const lines = trimmed.split(/\r?\n/).filter((l)=>l.trim());
  if (lines.length < 2) return {families:[],warnings:[],errors:['El CSV debe incluir cabecera y al menos una fila.'],sourceType:'csv'};
  const headers = splitCsvLine(lines[0]);
  const rows = lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    return Object.fromEntries(headers.map((h,i)=>[h,cells[i] || ''])) as Record<string,string>;
  });

  const warnings:string[] = [];
  const errors:string[] = [];
  const families:Family[] = rows.map((row,i) => {
    const membershipNumber = val(row,['nº socio','numero socio','n socio','socio','membershipnumber']);
    const familyName = val(row,['familia','nombre familia','apellidos familia','familyname']);
    if (!membershipNumber || !familyName) errors.push(`Fila ${i+2}: faltan nº de socio o nombre de familia.`);

    const mother = makeGuardian(row,'madre','madre',true);
    const father = makeGuardian(row,'padre','padre',!mother);
    const tutor = makeGuardian(row,'tutor_legal','tutor',!mother && !father);
    const guardians = [mother,father,tutor].filter(Boolean) as Guardian[];
    if (!guardians.length) warnings.push(`Fila ${i+2}: familia ${familyName || membershipNumber} sin adulto responsable reconocido.`);

    const students = makeStudents(row);
    const activeRaw = val(row,['activo','estado','renovado','activa']).toLowerCase();
    const isActiveThisYear = ['si','sí','s','1','activo','activa','renovado','renovada','true'].includes(activeRaw);
    const activeYears = val(row,['historico cursos activos','cursos activos','activeyears']).split(/[;|,]/).map((x)=>x.trim()).filter(Boolean);

    return {
      id:crypto.randomUUID(),
      membershipNumber,
      familyName,
      isActiveThisYear,
      activeYears,
      registrationAcademicYear:val(row,['curso alta','curso academico alta','registrationacademicyear']) || undefined,
      guardians,
      students,
      address:{
        street:val(row,['direccion','domicilio','calle']),
        city:val(row,['localidad','ciudad']) || 'Granada',
        postalCode:val(row,['codigo postal','cp']),
      },
      notes:val(row,['observaciones','notas']),
      registrationDate:val(row,['fecha alta','registrationdate']) || new Date().toISOString().slice(0,10),
      updatedAt:new Date().toISOString(),
    };
  });

  const duplicates = families.map((f)=>f.membershipNumber).filter((n,i,a)=>n && a.indexOf(n)!==i);
  if (duplicates.length) errors.push(`Números de socio duplicados en el archivo: ${Array.from(new Set(duplicates)).join(', ')}.`);

  return {families,warnings,errors,sourceType:'csv'};
}

import { EducationalStage, Student } from '../types/family';

export interface CalculatedCourse {
  stage: EducationalStage;
  stageName: string;
  courseName: string;
  fullDisplay: string;
  ageInAcademicYear: number;
  isGraduated: boolean;
  birthYear: number;
  isOfficial?: boolean;
}

export function getAcademicYearStart(academicYear: string): number {
  const match = academicYear.match(/^(\d{4})/);
  if (match) return parseInt(match[1], 10);
  return new Date().getFullYear();
}

export function getStudentBirthYear(student: Pick<Student, 'birthYear' | 'birthDateDDMMAAAA'>): number {
  const raw = String(student.birthDateDDMMAAAA || '').replace(/\D/g,'');
  if (raw.length === 8) {
    const year = Number(raw.slice(4,8));
    if (year >= 1900 && year <= new Date().getFullYear()) return year;
  }
  return Number(student.birthYear) || new Date().getFullYear();
}

export function hasOfficialCurrentCourse(
  student: Pick<Student, 'academicYear' | 'className'>,
  academicYear: string
): boolean {
  return student.academicYear === academicYear && Boolean(String(student.className || '').trim());
}

export function normalizeCourseLabel(value?: string): string {
  const raw = String(value || '').trim();
  const normalized = raw.toUpperCase().replace(/\s+/g,' ');

  let match = normalized.match(/^([345])\s*AÑOS$/);
  if (match) {
    const map: Record<string,string> = {
      '3': '1º Infantil',
      '4': '2º Infantil',
      '5': '3º Infantil',
    };
    return map[match[1]];
  }

  match = normalized.match(/^([1-3])º\s*INFANTIL$/);
  if (match) return `${match[1]}º Infantil`;

  match = normalized.match(/^([1-6])º\s*(PR|PRIMARIA)$/);
  if (match) return `${match[1]}º Primaria`;

  match = normalized.match(/^([1-4])º\s*ESO$/);
  if (match) return `${match[1]}º ESO`;

  match = normalized.match(/^([1-2])º\s*(BACH|BACHILLERATO)$/);
  if (match) return `${match[1]}º Bachillerato`;

  return raw;
}

function officialCourse(
  student: Pick<Student, 'birthYear' | 'birthDateDDMMAAAA' | 'courseOffset' | 'groupLetter' | 'academicYear' | 'className'>,
  academicYear: string
): CalculatedCourse | null {
  if (!hasOfficialCurrentCourse(student, academicYear)) return null;

  const raw = normalizeCourseLabel(student.className);
  const normalized = raw
    .toUpperCase()
    .replace(/\s+/g,' ')
    .replace(' AÑOS',' AÑOS');

  const baseYear = getAcademicYearStart(academicYear);
  const birthYear = getStudentBirthYear(student);
  const group = student.groupLetter ? ` ${student.groupLetter.trim().toUpperCase()}` : '';

  const make = (
    stage: EducationalStage,
    stageName: string,
    courseName: string,
    ageInAcademicYear: number,
    isGraduated = false
  ): CalculatedCourse => ({
    stage,
    stageName,
    courseName,
    fullDisplay: `${raw}${group}`,
    ageInAcademicYear,
    isGraduated,
    birthYear,
    isOfficial: true,
  });

  let match = normalized.match(/^([1-3])º\s*INFANTIL$/);
  if (match) {
    const n = Number(match[1]);
    return make('infantil','Educación Infantil',raw,n + 2);
  }

  match = normalized.match(/^([1-6])º\s*(PR|PRIMARIA)$/);
  if (match) {
    const n = Number(match[1]);
    return make('primaria','Educación Primaria',raw,5+n);
  }

  match = normalized.match(/^([1-4])º\s*ESO$/);
  if (match) {
    const n = Number(match[1]);
    return make('secundaria','Educación Secundaria (ESO)',raw,11+n);
  }

  match = normalized.match(/^([1-2])º\s*(BACH|BACHILLERATO)$/);
  if (match) {
    const n = Number(match[1]);
    return make('bachillerato','Bachillerato',raw,15+n);
  }

  // El curso proviene del listado oficial aunque su etiqueta no coincida
  // con una de las abreviaturas conocidas.
  return make('infantil','Curso oficial',raw,99);
}

export function calculateStudentCourse(
  student: Pick<Student, 'birthYear' | 'birthDateDDMMAAAA' | 'courseOffset' | 'groupLetter' | 'academicYear' | 'className'>,
  academicYear: string
): CalculatedCourse {
  const official = officialCourse(student,academicYear);
  if (official) return official;

  const baseYear = getAcademicYearStart(academicYear);
  const birthYear = getStudentBirthYear(student);
  const offset = student.courseOffset || 0;
  const effectiveAge = baseYear - birthYear + offset;
  const group = student.groupLetter ? ` ${student.groupLetter.trim().toUpperCase()}` : '';

  const make = (stage: EducationalStage, stageName: string, courseName: string, isGraduated = false): CalculatedCourse => ({
    stage,
    stageName,
    courseName,
    fullDisplay: isGraduated ? 'Graduado' : `${courseName.replace(/ \([^)]*\)/, '')}${group}`,
    ageInAcademicYear: effectiveAge,
    isGraduated,
    birthYear,
    isOfficial: false,
  });

  if (effectiveAge < 3) return make('infantil', 'Infantil', 'Preescolar / Guardería');
  if (effectiveAge === 3) return make('infantil', 'Educación Infantil', '1º Infantil');
  if (effectiveAge === 4) return make('infantil', 'Educación Infantil', '2º Infantil');
  if (effectiveAge === 5) return make('infantil', 'Educación Infantil', '3º Infantil');
  if (effectiveAge >= 6 && effectiveAge <= 11) return make('primaria', 'Educación Primaria', `${effectiveAge - 5}º Primaria`);
  if (effectiveAge >= 12 && effectiveAge <= 15) return make('secundaria', 'Educación Secundaria (ESO)', `${effectiveAge - 11}º ESO`);
  if (effectiveAge >= 16 && effectiveAge <= 17) return make('bachillerato', 'Bachillerato', `${effectiveAge - 15}º Bachillerato`);
  return make('graduado', 'Graduados / Antiguos Alumnos', 'Graduado / Bachillerato Finalizado', true);
}

export function getNextAcademicYear(currentYear: string): string {
  const start = getAcademicYearStart(currentYear);
  return `${start + 1}/${start + 2}`;
}

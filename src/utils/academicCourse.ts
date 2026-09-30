import { EducationalStage, Student } from '../types/family';

export interface CalculatedCourse {
  stage: EducationalStage;
  stageName: string;
  courseName: string;
  fullDisplay: string;
  ageInAcademicYear: number;
  isGraduated: boolean;
  birthYear: number;
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

export function calculateStudentCourse(
  student: Pick<Student, 'birthYear' | 'birthDateDDMMAAAA' | 'courseOffset' | 'groupLetter'>,
  academicYear: string
): CalculatedCourse {
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
  });

  if (effectiveAge < 3) return make('infantil', 'Infantil', 'Preescolar / Guardería');
  if (effectiveAge === 3) return make('infantil', 'Educación Infantil', '1º Infantil (3 años)');
  if (effectiveAge === 4) return make('infantil', 'Educación Infantil', '2º Infantil (4 años)');
  if (effectiveAge === 5) return make('infantil', 'Educación Infantil', '3º Infantil (5 años)');
  if (effectiveAge >= 6 && effectiveAge <= 11) return make('primaria', 'Educación Primaria', `${effectiveAge - 5}º Primaria`);
  if (effectiveAge >= 12 && effectiveAge <= 15) return make('secundaria', 'Educación Secundaria (ESO)', `${effectiveAge - 11}º ESO`);
  if (effectiveAge >= 16 && effectiveAge <= 17) return make('bachillerato', 'Bachillerato', `${effectiveAge - 15}º Bachillerato`);
  return make('graduado', 'Graduados / Antiguos Alumnos', 'Graduado / Bachillerato Finalizado', true);
}

export function getNextAcademicYear(currentYear: string): string {
  const start = getAcademicYearStart(currentYear);
  return `${start + 1}/${start + 2}`;
}

import { Family, SystemSettings } from '../types/family';
import { calculateStudentCourse } from './academicCourse';

export type DataIssueLevel = 'important' | 'recommended';

export interface DataIssue {
  code: string;
  label: string;
  level: DataIssueLevel;
}

export function getFamilyDataIssues(family: Family): DataIssue[] {
  const issues: DataIssue[] = [];
  const main = family.guardians.find((g) => g.isMainContact) || family.guardians[0];

  if (!family.guardians.length) issues.push({ code:'guardian', label:'Sin adulto responsable', level:'important' });
  if (main && !main.phone && !main.email) issues.push({ code:'contact', label:'Contacto principal sin teléfono ni correo', level:'important' });
  if (!family.address?.street || !family.address?.city || !family.address?.postalCode) issues.push({ code:'address', label:'Domicilio incompleto', level:'recommended' });
  if (!family.students.length) issues.push({ code:'students', label:'Sin alumnos/as registrados', level:'recommended' });

  family.students.forEach((student) => {
    if (!student.birthDateDDMMAAAA) {
      issues.push({ code:`birth-${student.id}`, label:`${student.firstName || 'Alumno/a'} sin fecha de nacimiento`, level:'important' });
    }
  });

  return issues;
}

export function familyMatchesStage(family: Family, academicYear: string, stage: string): boolean {
  if (!stage || stage === 'all') return true;
  return family.students.some((student) => student.birthDateDDMMAAAA && calculateStudentCourse(student, academicYear).stage === stage);
}

export function getAvailableAcademicYears(families: Family[], settings: SystemSettings): string[] {
  return Array.from(new Set([
    settings.activeAcademicYear,
    ...families.flatMap((f) => f.activeYears || []),
    ...families.map((f) => f.registrationAcademicYear).filter(Boolean) as string[],
  ])).sort().reverse();
}

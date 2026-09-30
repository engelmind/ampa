import { Family, SystemSettings } from '../types/family';
import { calculateStudentCourse } from './academicCourse';

export function exportToCSV(families: Family[], currentAcademicYear: string): string {
  const headers = ['Nº Socio','Familia',`Activo en Curso ${currentAcademicYear}`,'Historial Cursos Activos','Tutor Principal','DNI Tutor','Teléfono Móvil','Correo Electrónico','Dirección Domiciliaria','Localidad','Nº Hijos','Hijos y Cursos Calculados','Alergias / Necesidades','Fecha Alta'];
  const rows = families.map((f) => {
    const mainGuardian = f.guardians.find((g) => g.isMainContact) || f.guardians[0] || ({} as any);
    const studentsSummary = f.students.map((s) => {
      const calculated = calculateStudentCourse(s, currentAcademicYear);
      return `${s.firstName} ${s.lastName} (${calculated.fullDisplay}, nac. ${s.birthYear})`;
    }).join('; ');
    const allergiesSummary = f.students.filter((s) => s.allergies || s.specialNeeds).map((s) =>
      `${s.firstName}: ${[s.allergies, s.specialNeeds].filter(Boolean).join(' / ')}`
    ).join('; ');
    return [
      `"${f.membershipNumber}"`, `"${f.familyName}"`, f.isActiveThisYear ? 'ACTIVO' : 'NO ACTIVO',
      `"${(f.activeYears || []).join(', ')}"`, `"${mainGuardian.fullName || ''}"`, `"${mainGuardian.dni || ''}"`,
      `"${mainGuardian.phone || ''}"`, `"${mainGuardian.email || ''}"`, `"${f.address?.street || ''}"`,
      `"${f.address?.city || ''}"`, f.students.length, `"${studentsSummary}"`, `"${allergiesSummary}"`, `"${f.registrationDate}"`
    ].join(',');
  });
  return [headers.join(','), ...rows].join('\n');
}

export function exportToJSON(families: Family[], settings: SystemSettings): string {
  return JSON.stringify({
    version: '3.0',
    exportedAt: new Date().toISOString(),
    settings,
    families,
  }, null, 2);
}

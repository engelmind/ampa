import { Family, SystemSettings } from '../types/family';
import { calculateStudentCourse } from '../utils/academicCourse';
import { normalizeToDDMMAAAA, extractBirthYearFromDDMMAAAA } from '../utils/dateUtils';

const FAMILIES_STORAGE_KEY = 'ampa_families_v2';
const SETTINGS_STORAGE_KEY = 'ampa_system_settings_v2';

export const DEFAULT_SETTINGS: SystemSettings = {
  activeAcademicYear: '2025/2026',
  schoolName: 'Colegio San Agustín Granada',
  associationName: 'AMPA Agustinos Granada',
  nifCif: 'G18123456',
  contactEmail: 'ampa@agustinosgranada.es',
};

export const INITIAL_FAMILIES: Family[] = [
  {
    id: 'fam-1',
    membershipNumber: 'SOC-0001',
    familyName: 'García Navarro',
    isActiveThisYear: true,
    activeYears: ['2023/2024', '2024/2025', '2025/2026'],
    guardians: [
      { id: 'g-1a', fullName: 'Elena Navarro Morales', relationship: 'madre', dni: '48592014K', phone: '654 321 980', email: 'elena.navarro@example.com', isMainContact: true },
      { id: 'g-1b', fullName: 'Carlos García Ruiz', relationship: 'padre', dni: '44819033P', phone: '612 876 543', email: 'carlos.garcia@example.com', isMainContact: false },
    ],
    students: [
      { id: 's-1a', firstName: 'Mateo', lastName: 'García Navarro', birthYear: 2016, birthDate: '2016-04-12', courseOffset: 0, groupLetter: 'A', allergies: 'Frutos secos (cacahuete)', specialNeeds: '', authorizedPhoto: true },
      { id: 's-1b', firstName: 'Lucía', lastName: 'García Navarro', birthYear: 2020, birthDate: '2020-09-03', courseOffset: 0, groupLetter: 'B', allergies: '', specialNeeds: '', authorizedPhoto: true },
    ],
    address: { street: 'Calle Ejemplo, 24, 3ºB', city: 'Granada', postalCode: '18010' },
    notes: 'Datos ficticios de demostración.',
    registrationDate: '2023-09-10',
    updatedAt: '2025-10-05',
  },
  {
    id: 'fam-2',
    membershipNumber: 'SOC-0002',
    familyName: 'Rodríguez Jiménez',
    isActiveThisYear: true,
    activeYears: ['2024/2025', '2025/2026'],
    guardians: [
      { id: 'g-2a', fullName: 'María Jiménez López', relationship: 'madre', dni: '00000000T', phone: '600 000 002', email: 'familia2@example.com', isMainContact: true },
      { id: 'g-2b', fullName: 'Antonio Rodríguez Soto', relationship: 'padre', dni: '00000001R', phone: '600 000 003', email: 'familia2b@example.com', isMainContact: false },
    ],
    students: [
      { id: 's-2a', firstName: 'Alejandro', lastName: 'Rodríguez Jiménez', birthYear: 2012, birthDate: '2012-01-20', courseOffset: 0, groupLetter: 'B', allergies: 'Intolerancia a la lactosa', specialNeeds: '', authorizedPhoto: true },
    ],
    address: { street: 'Avenida Demo, 12', city: 'Granada', postalCode: '18003' },
    notes: 'Datos ficticios de demostración.',
    registrationDate: '2024-09-12',
    updatedAt: '2025-09-15',
  },
  {
    id: 'fam-3',
    membershipNumber: 'SOC-0003',
    familyName: 'López Fernández',
    isActiveThisYear: false,
    activeYears: ['2022/2023', '2023/2024', '2024/2025'],
    guardians: [
      { id: 'g-3a', fullName: 'Javier López Benítez', relationship: 'padre', dni: '00000002W', phone: '600 000 004', email: 'familia3@example.com', isMainContact: true },
    ],
    students: [
      { id: 's-3a', firstName: 'Sofía', lastName: 'López Fernández', birthYear: 2018, birthDate: '2018-06-14', courseOffset: 0, groupLetter: 'C', allergies: 'Polen y gramíneas', specialNeeds: '', authorizedPhoto: false },
      { id: 's-3b', firstName: 'Daniel', lastName: 'López Fernández', birthYear: 2014, birthDate: '2014-11-28', courseOffset: 0, groupLetter: 'A', allergies: '', specialNeeds: '', authorizedPhoto: true },
    ],
    address: { street: 'Paseo Demo, 8', city: 'Granada', postalCode: '18009' },
    notes: 'Datos ficticios de demostración.',
    registrationDate: '2022-10-01',
    updatedAt: '2025-09-28',
  },
  {
    id: 'fam-4',
    membershipNumber: 'SOC-0004',
    familyName: 'Martínez Ortiz',
    isActiveThisYear: true,
    activeYears: ['2021/2022', '2022/2023', '2023/2024', '2024/2025', '2025/2026'],
    guardians: [
      { id: 'g-4a', fullName: 'Patricia Ortiz Vega', relationship: 'madre', dni: '00000003A', phone: '600 000 005', email: 'familia4@example.com', isMainContact: true },
      { id: 'g-4b', fullName: 'David Martínez Calvo', relationship: 'padre', dni: '00000004G', phone: '600 000 006', email: 'familia4b@example.com', isMainContact: false },
    ],
    students: [
      { id: 's-4a', firstName: 'Hugo', lastName: 'Martínez Ortiz', birthYear: 2009, birthDate: '2009-03-05', courseOffset: 0, groupLetter: 'A', allergies: '', specialNeeds: '', authorizedPhoto: true },
      { id: 's-4b', firstName: 'Martina', lastName: 'Martínez Ortiz', birthYear: 2011, birthDate: '2011-08-17', courseOffset: 0, groupLetter: 'A', allergies: '', specialNeeds: '', authorizedPhoto: true },
    ],
    address: { street: 'Calle Muestra, 45', city: 'Granada', postalCode: '18002' },
    notes: 'Datos ficticios de demostración.',
    registrationDate: '2021-09-08',
    updatedAt: '2025-10-02',
  },
  {
    id: 'fam-5',
    membershipNumber: 'SOC-0005',
    familyName: 'Sánchez Morales',
    isActiveThisYear: true,
    activeYears: ['2025/2026'],
    guardians: [
      { id: 'g-5a', fullName: 'Beatriz Morales Gil', relationship: 'madre', dni: '00000005M', phone: '600 000 007', email: 'familia5@example.com', isMainContact: true },
    ],
    students: [
      { id: 's-5a', firstName: 'Leo', lastName: 'Sánchez Morales', birthYear: 2022, birthDate: '2022-05-19', courseOffset: 0, groupLetter: 'A', allergies: 'Celiaquía (gluten estricto)', specialNeeds: 'Comedor menú celíaco', authorizedPhoto: true },
    ],
    address: { street: 'Avenida Ejemplo, 18', city: 'Granada', postalCode: '18012' },
    notes: 'Datos ficticios de demostración.',
    registrationDate: '2025-09-01',
    updatedAt: '2025-09-01',
  },
  {
    id: 'fam-6',
    membershipNumber: 'SOC-0006',
    familyName: 'Castillo Domínguez',
    isActiveThisYear: true,
    activeYears: ['2023/2024', '2024/2025', '2025/2026'],
    guardians: [
      { id: 'g-6a', fullName: 'Fernando Castillo Rivas', relationship: 'padre', dni: '00000006Y', phone: '600 000 008', email: 'familia6@example.com', isMainContact: true },
      { id: 'g-6b', fullName: 'Laura Domínguez Cano', relationship: 'madre', dni: '00000007F', phone: '600 000 009', email: 'familia6b@example.com', isMainContact: false },
    ],
    students: [
      { id: 's-6a', firstName: 'Álvaro', lastName: 'Castillo Domínguez', birthYear: 2015, birthDate: '2015-02-11', courseOffset: 0, groupLetter: 'B', allergies: 'Huevo y derivados', specialNeeds: '', authorizedPhoto: true },
    ],
    address: { street: 'Calle Prueba, 60', city: 'Granada', postalCode: '18004' },
    notes: 'Datos ficticios de demostración.',
    registrationDate: '2023-10-10',
    updatedAt: '2025-09-15',
  },
];

export function getSystemSettings(): SystemSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(DEFAULT_SETTINGS));
      return DEFAULT_SETTINGS;
    }
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSystemSettings(settings: SystemSettings): SystemSettings {
  if (typeof window !== 'undefined') localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  return settings;
}

export function enrichFamilyWithDDMMAAAA(fam: Family): Family {
  return {
    ...fam,
    guardians: (fam.guardians || []).map((g, idx) => {
      let bDate = g.birthDateDDMMAAAA;
      if (!bDate && g.birthDate) bDate = normalizeToDDMMAAAA(g.birthDate);
      if (!bDate) {
        const defaults = ['14101982', '22031980', '05071985', '19111978'];
        bDate = defaults[idx % defaults.length];
      }
      return { ...g, birthDateDDMMAAAA: bDate };
    }),
    students: (fam.students || []).map((s) => {
      let bDate = s.birthDateDDMMAAAA;
      if (!bDate && s.birthDate) bDate = normalizeToDDMMAAAA(s.birthDate);
      if (!bDate && s.birthYear) bDate = `1505${s.birthYear}`;
      const bYear = bDate ? extractBirthYearFromDDMMAAAA(bDate, s.birthYear || 2016) : (s.birthYear || 2016);
      return { ...s, birthDateDDMMAAAA: bDate, birthYear: bYear };
    }),
  };
}

export function getFamilies(): Family[] {
  if (typeof window === 'undefined') return INITIAL_FAMILIES.map(enrichFamilyWithDDMMAAAA);
  try {
    const raw = localStorage.getItem(FAMILIES_STORAGE_KEY);
    if (!raw) {
      const enriched = INITIAL_FAMILIES.map(enrichFamilyWithDDMMAAAA);
      localStorage.setItem(FAMILIES_STORAGE_KEY, JSON.stringify(enriched));
      return enriched;
    }
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed) && parsed.length > 0 ? parsed : INITIAL_FAMILIES;
    return list.map(enrichFamilyWithDDMMAAAA);
  } catch (e) {
    console.error('Error leyendo base de datos:', e);
    return INITIAL_FAMILIES.map(enrichFamilyWithDDMMAAAA);
  }
}

export function saveFamily(family: Family): Family[] {
  const families = getFamilies();
  const index = families.findIndex((f) => f.id === family.id);
  const now = new Date().toISOString();
  const enrichedFamily = enrichFamilyWithDDMMAAAA(family);
  let updatedList: Family[];

  if (index >= 0) {
    updatedList = [...families];
    updatedList[index] = { ...enrichedFamily, updatedAt: now };
  } else {
    updatedList = [{ ...enrichedFamily, registrationDate: family.registrationDate || now.split('T')[0], updatedAt: now }, ...families];
  }

  if (typeof window !== 'undefined') localStorage.setItem(FAMILIES_STORAGE_KEY, JSON.stringify(updatedList));
  return updatedList;
}

export function toggleFamilyActive(familyId: string, currentAcademicYear: string): Family[] {
  const families = getFamilies();
  const index = families.findIndex((f) => f.id === familyId);
  if (index === -1) return families;
  const fam = families[index];
  const newActiveState = !fam.isActiveThisYear;
  let activeYears = Array.isArray(fam.activeYears) ? [...fam.activeYears] : [];
  if (newActiveState) {
    if (!activeYears.includes(currentAcademicYear)) activeYears.push(currentAcademicYear);
  } else {
    activeYears = activeYears.filter((y) => y !== currentAcademicYear);
  }
  const updatedList = [...families];
  updatedList[index] = { ...fam, isActiveThisYear: newActiveState, activeYears, updatedAt: new Date().toISOString() };
  if (typeof window !== 'undefined') localStorage.setItem(FAMILIES_STORAGE_KEY, JSON.stringify(updatedList));
  return updatedList;
}

export function deleteFamily(id: string): Family[] {
  const updatedList = getFamilies().filter((f) => f.id !== id);
  if (typeof window !== 'undefined') localStorage.setItem(FAMILIES_STORAGE_KEY, JSON.stringify(updatedList));
  return updatedList;
}

export function getNextMembershipNumber(): string {
  let maxNum = 0;
  getFamilies().forEach((f) => {
    const match = f.membershipNumber.match(/\d+/);
    if (match) maxNum = Math.max(maxNum, parseInt(match[0], 10));
  });
  return `SOC-${(maxNum + 1).toString().padStart(4, '0')}`;
}

export function resetToDemoData(): Family[] {
  if (typeof window !== 'undefined') {
    localStorage.setItem(FAMILIES_STORAGE_KEY, JSON.stringify(INITIAL_FAMILIES));
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(DEFAULT_SETTINGS));
  }
  return INITIAL_FAMILIES;
}

export function advanceAcademicYear(newYear: string, renewAllActive: boolean = false): { settings: SystemSettings; families: Family[] } {
  const updatedSettings = { ...getSystemSettings(), activeAcademicYear: newYear };
  saveSystemSettings(updatedSettings);
  const updatedFamilies = getFamilies().map((fam) => {
    const isActiveThisYear = renewAllActive ? fam.isActiveThisYear : false;
    const activeYears = [...(fam.activeYears || [])];
    if (isActiveThisYear && !activeYears.includes(newYear)) activeYears.push(newYear);
    return { ...fam, isActiveThisYear, activeYears, updatedAt: new Date().toISOString() };
  });
  if (typeof window !== 'undefined') localStorage.setItem(FAMILIES_STORAGE_KEY, JSON.stringify(updatedFamilies));
  return { settings: updatedSettings, families: updatedFamilies };
}

export function exportToCSV(families: Family[], currentAcademicYear: string): string {
  const headers = ['Nº Socio','Familia',`Activo en Curso ${currentAcademicYear}`,'Historial Cursos Activos','Tutor Principal','DNI Tutor','Teléfono Móvil','Correo Electrónico','Dirección Domiciliaria','Localidad','Nº Hijos','Hijos y Cursos Calculados','Alergias / Necesidades','Fecha Alta'];
  const rows = families.map((f) => {
    const mainGuardian = f.guardians.find((g) => g.isMainContact) || f.guardians[0] || {};
    const studentsSummary = f.students.map((s) => {
      const calculated = calculateStudentCourse(s, currentAcademicYear);
      return `${s.firstName} (${calculated.fullDisplay}, nac. ${s.birthYear})`;
    }).join('; ');
    const allergiesSummary = f.students.filter((s) => s.allergies).map((s) => `${s.firstName}: ${s.allergies}`).join('; ');
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
  return JSON.stringify({ version: '2.0', settings, families }, null, 2);
}

export function importFromJSON(jsonString: string): { success: boolean; count: number; error?: string } {
  try {
    const parsed = JSON.parse(jsonString);
    let familiesToLoad: Family[] = [];
    if (Array.isArray(parsed)) familiesToLoad = parsed;
    else if (parsed && Array.isArray(parsed.families)) {
      familiesToLoad = parsed.families;
      if (parsed.settings) saveSystemSettings(parsed.settings);
    } else return { success: false, count: 0, error: 'El archivo JSON no contiene un catálogo de familias válido.' };

    const isValid = familiesToLoad.every((f) => f.id && f.familyName && Array.isArray(f.guardians) && Array.isArray(f.students));
    if (!isValid) return { success: false, count: 0, error: 'La estructura de los registros de familias no es válida.' };
    localStorage.setItem(FAMILIES_STORAGE_KEY, JSON.stringify(familiesToLoad));
    return { success: true, count: familiesToLoad.length };
  } catch (err: any) {
    return { success: false, count: 0, error: err?.message || 'Error al procesar el archivo JSON.' };
  }
}

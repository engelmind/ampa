export type AppRole = 'superadmin' | 'admin' | 'user';

export interface AppUser {
  id: string;
  username: string;
  name: string;
  role: AppRole;
  email?: string;
  password?: string;
  isActive?: boolean;
  lastLoginAt?: string;
}

export type EducationalStage = 'infantil' | 'primaria' | 'secundaria' | 'bachillerato' | 'graduado';

export interface Guardian {
  id: string;
  /** Se mantiene por compatibilidad con datos existentes. */
  fullName: string;
  firstName?: string;
  lastName?: string;
  relationship: 'madre' | 'padre' | 'tutor_legal' | 'otro';
  dni: string;
  phone: string;
  email: string;
  isMainContact: boolean;
  birthDateDDMMAAAA?: string;
  birthDate?: string;
  communicationsConsent?: boolean;
  privacyConsent?: boolean;
}

export interface Student {
  id: string;
  firstName: string;
  lastName: string;
  dni?: string;
  birthYear: number;
  birthDateDDMMAAAA?: string;
  birthDate?: string;
  courseOffset: number;
  groupLetter: string;
  academicYear?: string;
  school?: string;
  className?: string;
  allergies?: string;
  specialNeeds?: string;
  authorizedPhoto: boolean;
}

export interface Family {
  id: string;
  membershipNumber: string;
  familyName: string;
  isActiveThisYear: boolean;
  activeYears: string[];
  registrationAcademicYear?: string;
  guardians: Guardian[];
  students: Student[];
  address: {
    street: string;
    city: string;
    postalCode: string;
  };
  notes?: string;
  registrationDate: string;
  updatedAt: string;
}

export interface ActivityLogEntry {
  id: string;
  userId: string;
  userName: string;
  timestamp: string;
  entityType: 'family' | 'user' | 'settings' | 'course' | 'export' | 'import' | 'card';
  entityId?: string;
  entityLabel?: string;
  action: 'create' | 'update' | 'delete' | 'renew' | 'deactivate' | 'login' | 'export' | 'import' | 'settings' | 'card';
  summary: string;
}

export interface SystemSettings {
  activeAcademicYear: string;
  schoolName: string;
  associationName: string;
  nifCif: string;
  contactEmail: string;
}

export type MainViewTab = 'dashboard' | 'families' | 'courses' | 'settings';

export interface FamilyFilters {
  searchQuery: string;
  statusFilter: 'all' | 'active' | 'inactive';
  stageFilter: 'all' | EducationalStage;
  sortBy: 'membershipNumber' | 'familyName' | 'studentsCount' | 'registrationDate';
  sortOrder: 'asc' | 'desc';
  viewMode: 'cards' | 'table';
  itemsPerPage: number;
  currentPage: number;
}

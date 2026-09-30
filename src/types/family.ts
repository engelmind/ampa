export type AppRole = 'superadmin' | 'admin' | 'user';

export interface AppUser {
  id: string;
  username: string;
  name: string;
  role: AppRole;
  email?: string;
  password?: string;
}

export type EducationalStage = 'infantil' | 'primaria' | 'secundaria' | 'bachillerato' | 'graduado';

export interface Guardian {
  id: string;
  fullName: string;
  relationship: 'madre' | 'padre' | 'tutor_legal' | 'otro';
  dni: string;
  phone: string;
  email: string;
  isMainContact: boolean;
  birthDateDDMMAAAA?: string;
  birthDate?: string;
}

export interface Student {
  id: string;
  firstName: string;
  lastName: string;
  birthYear: number;
  birthDateDDMMAAAA?: string;
  birthDate?: string;
  courseOffset: number;
  groupLetter: string;
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

export interface SystemSettings {
  activeAcademicYear: string;
  schoolName: string;
  associationName: string;
  nifCif: string;
  contactEmail: string;
}

export type MainViewTab = 'dashboard' | 'families' | 'settings';

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

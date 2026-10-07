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
}

export interface FamilyEventRecord {
  eventId: string;
  title: string;
  eventDate: string;
  academicYear: string;
  participantCount: number;
  participantNames: string[];
}

export interface EventSummary {
  id: string;
  title: string;
  eventDate: string;
  academicYear: string;
  description: string;
  imageDataUrl?: string;
  familyCount: number;
  participantCount: number;
  familyParticipationRate: number;
  censusParticipationRate: number;
  registrationEnabled: boolean;
  registrationToken: string;
  registrationDeadline?: string | null;
  registrationCapacity?: number | null;
  maxAttendeesPerFamily: number;
  registrationMessage?: string;
  registeredFamilyCount: number;
  registeredParticipantCount: number;
  waitlistFamilyCount: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface EventAttendee {
  id?: string;
  familyId: string;
  personType: 'guardian' | 'student';
  personId: string;
  participantName: string;
}

export interface EventRegistrationRecord {
  id: string;
  familyId: string;
  familyName: string;
  membershipNumber: string;
  status: 'confirmed' | 'waitlist' | 'cancelled';
  verifiedEmail: string;
  createdAt: string;
  updatedAt: string;
  attendees: Array<Pick<EventAttendee, 'personType' | 'personId' | 'participantName'>>;
}

export interface EventDetail {
  id: string;
  title: string;
  eventDate: string;
  academicYear: string;
  description: string;
  imageDataUrl?: string;
  registrationEnabled: boolean;
  registrationToken: string;
  registrationDeadline?: string | null;
  registrationCapacity?: number | null;
  maxAttendeesPerFamily: number;
  registrationMessage?: string;
  familyIds: string[];
  attendees: EventAttendee[];
  registrations: EventRegistrationRecord[];
}

export interface EventAttendanceFamily {
  familyId: string;
  attendees: Array<Pick<EventAttendee, 'personType' | 'personId' | 'participantName'>>;
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
  events?: FamilyEventRecord[];
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
  entityType: 'family' | 'user' | 'settings' | 'course' | 'export' | 'import' | 'card' | 'event';
  entityId?: string;
  entityLabel?: string;
  action: 'create' | 'update' | 'delete' | 'renew' | 'activate' | 'deactivate' | 'login' | 'export' | 'import' | 'settings' | 'card' | 'audit';
  summary: string;
}

export interface SystemSettings {
  activeAcademicYear: string;
  schoolName: string;
  associationName: string;
  nifCif: string;
  contactEmail: string;
}

export type MainViewTab = 'dashboard' | 'families' | 'events' | 'settings';

export interface FamilyFilters {
  searchQuery: string;
  statusFilter: 'all' | 'active' | 'inactive';
  stageFilter: 'all' | EducationalStage;
  sortBy: 'membershipNumber' | 'familyName' | 'studentsCount' | 'registrationDate';
  sortOrder: 'asc' | 'desc';
  viewMode: 'cards' | 'table' | 'list';
  itemsPerPage: number;
  currentPage: number;
}

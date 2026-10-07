import { ActivityLogEntry, AppUser, EventAttendanceFamily, EventDetail, EventSummary, Family, SystemSettings } from '../types/family';

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const resolvedPath = path.startsWith('/api/') ? `/backend/${path.slice(5)}` : path;
  const response = await fetch(resolvedPath, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body?.error || `HTTP_${response.status}`);
    (error as any).status = response.status;
    (error as any).body = body;
    throw error;
  }
  return body as T;
}

export const backendApi = {
  health: () => request<{ ok: boolean; database: string; mode: string; users?: number }>('/api/health'),

  bootstrap: (payload: { code: string; username: string; email?: string; name: string; password: string }) =>
    request<{ user: AppUser }>('/api/setup/bootstrap', { method: 'POST', body: JSON.stringify(payload) }),

  login: (username: string, password: string) =>
    request<{ user: AppUser }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  logout: () => request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),
  me: () => request<{ user: AppUser }>('/api/auth/me'),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ ok: boolean }>('/api/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) }),

  getFamilies: () => request<{ families: Family[] }>('/api/families'),
  createFamily: (family: Family) =>
    request<{ id: string }>('/api/families', { method: 'POST', body: JSON.stringify(family) }),
  updateFamily: (family: Family) =>
    request<{ ok: boolean }>(`/api/families/${family.id}`, { method: 'PUT', body: JSON.stringify(family) }),
  deleteFamily: (familyId: string) =>
    request<{ ok: boolean }>(`/api/families/${familyId}`, { method: 'DELETE' }),

  setFamilyActive: (familyId: string, active: boolean) =>
    request<{ ok: boolean }>(`/api/families/${familyId}/active`, { method: 'PATCH', body: JSON.stringify({ active }) }),
  resetAllFamiliesActive: (active: boolean) =>
    request<{ ok: boolean; updated: number }>('/api/families/active/reset', { method: 'POST', body: JSON.stringify({ active }) }),

  getEvents: () => request<{ events: EventSummary[]; totals: { activeFamilies: number; censusPeople: number } }>('/api/events'),
  getEvent: (id: string) => request<{ event: EventDetail }>(`/api/events/${id}`),
  createEvent: (event: Pick<EventDetail, 'title' | 'eventDate' | 'academicYear' | 'description' | 'imageDataUrl' | 'registrationEnabled' | 'registrationDeadline' | 'registrationCapacity' | 'maxAttendeesPerFamily' | 'registrationMessage' | 'registrationAudience'>) =>
    request<{ event: { id: string } }>('/api/events', { method:'POST', body:JSON.stringify(event) }),
  updateEvent: (event: Pick<EventDetail, 'id' | 'title' | 'eventDate' | 'academicYear' | 'description' | 'imageDataUrl' | 'registrationEnabled' | 'registrationDeadline' | 'registrationCapacity' | 'maxAttendeesPerFamily' | 'registrationMessage' | 'registrationAudience'>) =>
    request<{ ok:boolean }>(`/api/events/${event.id}`, { method:'PUT', body:JSON.stringify(event) }),
  setEventRegistrationEnabled: (id:string, enabled:boolean) =>
    request<{ ok:boolean; registrationEnabled:boolean; registrationDeadline?:string|null; deadlineCleared:boolean }>(
      `/api/events/${id}/registration`,
      { method:'PATCH', body:JSON.stringify({enabled}) }
    ),

  deleteEvent: (id:string) =>
    request<{ ok:boolean }>(`/api/events/${id}`, { method:'DELETE' }),
  saveEventAttendance: (id:string, families:EventAttendanceFamily[]) =>
    request<{ ok:boolean; families:number; participants:number }>(`/api/events/${id}/attendance`, {
      method:'PUT',
      body:JSON.stringify({families}),
    }),

  getPublicEvent: (token:string) => request<{ event: {
    title:string; eventDate:string; academicYear:string; description:string; imageDataUrl?:string;
    registrationEnabled:boolean; registrationDeadline?:string|null; registrationCapacity?:number|null;
    maxAttendeesPerFamily:number; registrationMessage?:string; registrationAudience:'members_only'|'public'; isOpen:boolean;
  } }>(`/api/public/events/${encodeURIComponent(token)}`),
  registerPublicEventGuest: (token:string,payload:{
    familyName:string; contactName:string; email:string; phone:string; attendeeNames:string[];
  }) =>
    request<{ok:boolean;status:'confirmed'|'waitlist';waitlistPosition:number|null;createdInactiveFamily:boolean}>(
      `/api/public/events/${encodeURIComponent(token)}/guest-register`,
      {method:'POST',body:JSON.stringify(payload)}
    ),

  requestPublicEventCode: (token:string,membershipNumber:string,email:string) =>
    request<{ ok:boolean; mode:'otp'|'direct'; challengeId?:string; verificationToken?:string }>(
      `/api/public/events/${encodeURIComponent(token)}/request-code`,
      {method:'POST',body:JSON.stringify({membershipNumber,email})}
    ),
  verifyPublicEventCode: (token:string,challengeId:string,code:string) =>
    request<{ ok:boolean; verificationToken:string }>(
      `/api/public/events/${encodeURIComponent(token)}/verify-code`,
      {method:'POST',body:JSON.stringify({challengeId,code})}
    ),
  getPublicEventSession: (token:string,verificationToken:string) =>
    request<{ family:{
      familyName:string; membershipNumber:string;
      members:Array<{personType:'guardian'|'student';personId:string;name:string;detail:string}>
    }; registration:null|{id:string;status:'confirmed'|'waitlist'|'cancelled';updatedAt:string;attendees:Array<{personType:'guardian'|'student';personId:string;participantName:string}>} }>(
      `/api/public/events/${encodeURIComponent(token)}/session`,
      {method:'POST',body:JSON.stringify({verificationToken})}
    ),
  savePublicEventRegistration: (token:string,verificationToken:string,attendees:Array<{personType:'guardian'|'student';personId:string}>) =>
    request<{ok:boolean;status:'confirmed'|'waitlist';waitlistPosition:number|null}>(
      `/api/public/events/${encodeURIComponent(token)}/register`,
      {method:'POST',body:JSON.stringify({verificationToken,attendees})}
    ),
  cancelPublicEventRegistration: (token:string,verificationToken:string) =>
    request<{ok:boolean}>(
      `/api/public/events/${encodeURIComponent(token)}/cancel`,
      {method:'POST',body:JSON.stringify({verificationToken})}
    ),

  getSettings: () => request<{ settings: SystemSettings }>('/api/settings'),
  saveSettings: (settings: SystemSettings) =>
    request<{ settings: SystemSettings }>('/api/settings', { method: 'PUT', body: JSON.stringify(settings) }),

  getActivity: (entityId?: string) =>
    request<{ activity: ActivityLogEntry[] }>(`/api/activity${entityId ? `?entityId=${encodeURIComponent(entityId)}` : ''}`),

  getUsers: () => request<{ users: AppUser[] }>('/api/users'),
  createUser: (user: Pick<AppUser, 'username' | 'email' | 'name' | 'role' | 'password'>) =>
    request<{ user: AppUser }>('/api/users', { method: 'POST', body: JSON.stringify(user) }),
  updateUser: (id: string, patch: Partial<Pick<AppUser, 'name' | 'email' | 'role' | 'isActive' | 'password'>>) =>
    request<{ user: AppUser }>(`/api/users/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),

  importFamilies: (families: Family[], mode: 'merge' | 'replace' = 'merge') =>
    request<{ ok: boolean; imported: number }>('/api/imports', { method: 'POST', body: JSON.stringify({ families, mode }) }),

  listBackups: () =>
    request<{ backups: Array<{ id:string; createdAt:string; reason:string; createdByName?:string|null }> }>('/api/backups'),
  createBackup: (reason = 'manual') =>
    request<{ id:string }>('/api/backups', { method:'POST', body:JSON.stringify({ reason }) }),
  restoreBackup: (id:string, confirmation:string) =>
    request<{ ok:boolean }>('/api/backups/restore', { method:'POST', body:JSON.stringify({ id, confirmation }) }),

  emailStatus: () => request<{ configured:boolean; domainVerified?:boolean; fromEmail?:string|null; senderName?:string }>('/api/email/status'),

  sendFamilyDocument: (payload: {
    familyId: string;
    guardianId: string;
    subject: string;
    message: string;
    filename: string;
    mimeType: string;
    contentBase64: string;
    documentType: 'membership-card';
  }) => request<{ ok:boolean; to:string; messageId?:string }>('/api/email/family-document', {
    method:'POST',
    body:JSON.stringify(payload),
  }),
};

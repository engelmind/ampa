import React, { useEffect, useMemo, useState } from 'react';
import {
  LayoutDashboard, Users, Settings, Search, Plus, Download, LogOut, ChevronRight,
  UserRound, GraduationCap, CheckCircle2, Clock3, X, Pencil, Save, RefreshCcw,
  AlertTriangle, MapPin, Phone, Mail, Trash2, UserPlus, Baby
} from 'lucide-react';
import { AppUser, Family, Guardian, MainViewTab, Student, SystemSettings } from './types/family';
import { exportToCSV } from './utils/exportUtils';
import { backendApi } from './services/backendApi';
import { calculateStudentCourse } from './utils/academicCourse';
import { familyMatchesStage, getAvailableAcademicYears, getFamilyDataIssues } from './utils/dataQuality';
import { generateFamiliesPdfReport } from './utils/pdfExportUtils';
import { LoginScreen } from './components/LoginScreen';
import { SetupScreen } from './components/SetupScreen';
import { AmpaLogo } from './components/AmpaLogo';
import { NotificationToast, ToastMessage } from './components/NotificationToast';
import { FamilyDetail } from './components/FamilyDetail';
import { CoursesView } from './components/CoursesView';
import { AdminTools } from './components/AdminTools';

const defaultSettings: SystemSettings = {
  activeAcademicYear: '2026/2027',
  schoolName: 'Colegio San Agustín Granada',
  associationName: 'AMPA Agustinos Granada',
  nifCif: '',
  contactEmail: '',
};

const nextMembershipNumber = (families: Family[]) => {
  let max = 0;
  for (const family of families) {
    const match = family.membershipNumber.match(/\d+/);
    if (match) max = Math.max(max, Number(match[0]));
  }
  return `SOC-${String(max + 1).padStart(4, '0')}`;
};

const emptyFamily = (membershipNumber: string): Family => ({
  id: `fam-${Date.now()}`,
  membershipNumber,
  familyName: '',
  isActiveThisYear: true,
  activeYears: [],
  guardians: [
    {
      id: `g-${Date.now()}-m`,
      fullName: '',
      firstName: '',
      lastName: '',
      relationship: 'madre',
      dni: '',
      phone: '',
      email: '',
      isMainContact: true,
      birthDateDDMMAAAA: '',
    },
    {
      id: `g-${Date.now()}-p`,
      fullName: '',
      firstName: '',
      lastName: '',
      relationship: 'padre',
      dni: '',
      phone: '',
      email: '',
      isMainContact: false,
      birthDateDDMMAAAA: '',
    },
  ],
  students: [],
  address: { street: '', city: 'Granada', postalCode: '' },
  notes: '',
  registrationDate: new Date().toISOString().slice(0, 10),
  updatedAt: new Date().toISOString(),
});


const splitFullName = (value: string) => {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  return { firstName: parts[0] || '', lastName: parts.slice(1).join(' ') };
};

const hydrateFamilyForEditing = (family: Family): Family => ({
  ...structuredClone(family),
  guardians: family.guardians.map((g) => {
    const split = splitFullName(g.fullName || '');
    return {
      ...g,
      firstName: g.firstName || split.firstName,
      lastName: g.lastName || split.lastName,
      birthDateDDMMAAAA: g.birthDateDDMMAAAA || '',
    };
  }),
  students: family.students.map((s) => ({
    ...s,
    dni: s.dni || '',
    birthDateDDMMAAAA: s.birthDateDDMMAAAA || '',
  })),
});

const normalizeDateInput = (value: string) => value.replace(/\D/g, '').slice(0, 8);

const dateDisplay = (raw?: string) => {
  const d = (raw || '').replace(/\D/g, '').slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0,2)}/${d.slice(2)}`;
  return `${d.slice(0,2)}/${d.slice(2,4)}/${d.slice(4)}`;
};

const validDate = (raw?: string) => {
  if (!raw) return true;
  const d = raw.replace(/\D/g, '');
  if (d.length !== 8) return false;
  const day = Number(d.slice(0,2)), month = Number(d.slice(2,4)), year = Number(d.slice(4,8));
  const test = new Date(year, month - 1, day);
  return year >= 1900 && year <= new Date().getFullYear()
    && test.getFullYear() === year && test.getMonth() === month - 1 && test.getDate() === day;
};

const yearFromDate = (raw?: string, fallback = new Date().getFullYear() - 6) => {
  const d = (raw || '').replace(/\D/g, '');
  const y = Number(d.slice(4,8));
  return d.length === 8 && y > 1900 ? y : fallback;
};

const newGuardian = (): Guardian => ({
  id: `g-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
  fullName: '',
  firstName: '',
  lastName: '',
  relationship: 'tutor_legal',
  dni: '',
  phone: '',
  email: '',
  isMainContact: false,
  birthDateDDMMAAAA: '',
});

const newStudent = (): Student => ({
  id: `s-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
  firstName: '',
  lastName: '',
  dni: '',
  birthYear: new Date().getFullYear() - 6,
  birthDateDDMMAAAA: '',
  courseOffset: 0,
  groupLetter: '',
  allergies: '',
  specialNeeds: '',
  authorizedPhoto: false,
});

export default function App() {
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [families, setFamilies] = useState<Family[]>([]);
  const [settings, setSettings] = useState<SystemSettings>(defaultSettings);
  const [tab, setTab] = useState<MainViewTab>('dashboard');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [academicYearFilter, setAcademicYearFilter] = useState('all');
  const [stageFilter, setStageFilter] = useState('all');
  const [qualityFilter, setQualityFilter] = useState<'all'|'incomplete'>('all');
  const [sortBy, setSortBy] = useState<'familyName'|'membershipNumber'|'registrationDate'|'studentsCount'>('familyName');
  const [sortOrder, setSortOrder] = useState<'asc'|'desc'>('asc');
  const [selected, setSelected] = useState<Family | null>(null);
  const [editing, setEditing] = useState<Family | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [activity, setActivity] = useState<any[]>([]);
  const [bootState, setBootState] = useState<'loading' | 'setup' | 'login' | 'ready' | 'error'>('loading');

  const canEdit = currentUser?.role === 'superadmin' || currentUser?.role === 'admin';

  const toast = (type: ToastMessage['type'], title: string, message?: string) => {
    const id = crypto.randomUUID();
    setToasts((p) => [...p, { id, type, title, message }]);
    window.setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 3500);
  };

  const loadWorkspace = async () => {
    const [familiesResult, settingsResult, activityResult] = await Promise.all([
      backendApi.getFamilies(),
      backendApi.getSettings(),
      backendApi.getActivity(),
    ]);
    setFamilies(familiesResult.families);
    setSettings({ ...defaultSettings, ...settingsResult.settings });
    setActivity(activityResult.activity);
  };

  const acceptAuthenticatedUser = async (user: AppUser) => {
    setCurrentUser(user);
    await loadWorkspace();
    setBootState('ready');
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const health = await backendApi.health();
        if (cancelled) return;
        if ((health.users || 0) === 0) {
          setBootState('setup');
          return;
        }
        try {
          const session = await backendApi.me();
          if (cancelled) return;
          setCurrentUser(session.user);
          await loadWorkspace();
          if (!cancelled) setBootState('ready');
        } catch (error: any) {
          if (!cancelled) setBootState(error?.status === 401 ? 'login' : 'error');
        }
      } catch {
        if (!cancelled) setBootState('error');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const academicYears = useMemo(() => getAvailableAcademicYears(families,settings),[families,settings]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const result = families.filter((f) => {
      const guardians = f.guardians.map((g) => [g.fullName, g.dni, g.phone, g.email].filter(Boolean).join(' ')).join(' ');
      const students = f.students.map((s) => [s.firstName, s.lastName, s.dni].filter(Boolean).join(' ')).join(' ');
      const searchable = [f.membershipNumber, f.familyName, guardians, students].filter(Boolean).join(' ').toLowerCase();
      const matchesQ = !q || searchable.includes(q);
      const matchesStatus = status === 'all' || (status === 'active' ? f.isActiveThisYear : !f.isActiveThisYear);
      const matchesYear = academicYearFilter === 'all' || f.activeYears.includes(academicYearFilter) || f.registrationAcademicYear === academicYearFilter;
      const matchesStage = familyMatchesStage(f,settings.activeAcademicYear,stageFilter);
      const matchesQuality = qualityFilter === 'all' || getFamilyDataIssues(f).length > 0;
      return matchesQ && matchesStatus && matchesYear && matchesStage && matchesQuality;
    });

    return result.sort((a,b) => {
      let av:any, bv:any;
      if (sortBy==='studentsCount') { av=a.students.length; bv=b.students.length; }
      else { av=(a as any)[sortBy] || ''; bv=(b as any)[sortBy] || ''; }
      const cmp = typeof av === 'number' ? av-bv : String(av).localeCompare(String(bv),'es',{numeric:true,sensitivity:'base'});
      return sortOrder==='asc'?cmp:-cmp;
    });
  }, [families, query, status, academicYearFilter, stageFilter, qualityFilter, sortBy, sortOrder, settings.activeAcademicYear]);

  const activeCount = families.filter((f) => f.isActiveThisYear).length;
  const studentCount = families.reduce((n, f) => n + f.students.length, 0);
  const pendingCount = families.length - activeCount;
  const incompleteFamilies = families.filter((f)=>getFamilyDataIssues(f).length>0);

  if (bootState === 'loading') {
    return <div className="min-h-screen bg-slate-950 flex items-center justify-center"><div className="text-center text-white"><AmpaLogo inverted className="mx-auto h-16 w-auto"/><p className="mt-5 text-sm text-slate-300">Conectando con la base de datos…</p></div></div>;
  }
  if (bootState === 'error') {
    return <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6"><div className="max-w-md rounded-3xl bg-white p-7 text-center"><AlertTriangle className="mx-auto text-rose-600"/><h1 className="mt-3 text-lg font-black">No se puede conectar con el backend</h1><p className="mt-2 text-sm text-slate-500">La interfaz está disponible, pero la API de producción no responde correctamente.</p><button onClick={()=>window.location.reload()} className="mt-5 min-h-11 rounded-xl bg-slate-900 px-4 text-xs font-bold text-white">Reintentar</button></div></div>;
  }
  if (bootState === 'setup') {
    return <SetupScreen
      onBootstrap={async (payload) => (await backendApi.bootstrap(payload)).user}
      onReady={(user) => { void acceptAuthenticatedUser(user); }}
    />;
  }
  if (bootState === 'login' || !currentUser) {
    return <LoginScreen
      onAuthenticate={async (username, password) => (await backendApi.login(username, password)).user}
      onLoginSuccess={(user) => { void acceptAuthenticatedUser(user); toast('success', 'Sesión iniciada', `Bienvenido/a, ${user.name}`); }}
    />;
  }

  const handleLogout = async () => {
    try { await backendApi.logout(); } catch {}
    setCurrentUser(null);
    setFamilies([]);
    setActivity([]);
    setBootState('login');
  };

  const updateGuardian = (index: number, patch: Partial<Guardian>) => {
    if (!editing) return;
    setEditing({ ...editing, guardians: editing.guardians.map((g, i) => i === index ? { ...g, ...patch } : g) });
  };

  const addGuardian = () => editing && setEditing({ ...editing, guardians: [...editing.guardians, newGuardian()] });

  const removeGuardian = (index: number) => {
    if (!editing || editing.guardians.length <= 1) return;
    const guardians = editing.guardians.filter((_, i) => i !== index);
    if (!guardians.some((g) => g.isMainContact) && guardians[0]) guardians[0].isMainContact = true;
    setEditing({ ...editing, guardians });
  };

  const setMainGuardian = (index: number) => {
    if (!editing) return;
    setEditing({ ...editing, guardians: editing.guardians.map((g, i) => ({ ...g, isMainContact: i === index })) });
  };

  const updateStudent = (index: number, patch: Partial<Student>) => {
    if (!editing) return;
    setEditing({ ...editing, students: editing.students.map((s, i) => i === index ? { ...s, ...patch } : s) });
  };

  const addStudent = () => editing && setEditing({ ...editing, students: [...editing.students, newStudent()] });
  const removeStudent = (index: number) => editing && setEditing({ ...editing, students: editing.students.filter((_, i) => i !== index) });

  const saveEdited = async () => {
    if (!editing || !editing.familyName.trim()) {
      toast('error', 'Faltan datos', 'Indique al menos el nombre identificativo de la familia.');
      return;
    }
    if (editing.guardians.some((g) => !validDate(g.birthDateDDMMAAAA)) || editing.students.some((s) => !validDate(s.birthDateDDMMAAAA))) {
      toast('error', 'Fecha no válida', 'Las fechas de nacimiento deben escribirse en formato DD/MM/AAAA.');
      return;
    }

    const guardians = editing.guardians
      .filter((g) => [g.firstName, g.lastName, g.fullName].some((v) => (v || '').trim()))
      .map((g, index) => {
        const firstName = (g.firstName || '').trim();
        const lastName = (g.lastName || '').trim();
        return {
          ...g, firstName, lastName,
          fullName: [firstName, lastName].filter(Boolean).join(' ') || g.fullName.trim(),
          birthDateDDMMAAAA: normalizeDateInput(g.birthDateDDMMAAAA || ''),
          isMainContact: editing.guardians.some((x) => x.isMainContact) ? g.isMainContact : index === 0,
        };
      });

    if (!guardians.length) {
      toast('error', 'Falta un adulto responsable', 'Añada al menos padre, madre o tutor/a legal.');
      return;
    }

    const students = editing.students
      .filter((s) => [s.firstName, s.lastName].some((v) => v.trim()))
      .map((s) => ({
        ...s,
        firstName: s.firstName.trim(),
        lastName: s.lastName.trim(),
        dni: (s.dni || '').trim().toUpperCase(),
        birthDateDDMMAAAA: normalizeDateInput(s.birthDateDDMMAAAA || ''),
        birthYear: yearFromDate(s.birthDateDDMMAAAA, s.birthYear),
      }));

    const ready: Family = {
      ...editing,
      guardians,
      students,
      registrationAcademicYear: editing.registrationAcademicYear || settings.activeAcademicYear,
      activeYears: editing.isActiveThisYear && !editing.activeYears.includes(settings.activeAcademicYear)
        ? [...editing.activeYears, settings.activeAcademicYear]
        : editing.activeYears,
    };

    const existed = families.some((f) => f.id === ready.id);
    try {
      if (existed) await backendApi.updateFamily(ready);
      else await backendApi.createFamily(ready);
      await loadWorkspace();
      setEditing(null);
      setSelected(null);
      toast('success', 'Ficha familiar guardada', `${guardians.length} adulto(s) y ${students.length} hijo(s)/a(s) registrados.`);
    } catch (error: any) {
      toast('error', 'No se pudo guardar la familia', error?.message);
    }
  };

  const toggleActive = async (id: string) => {
    const fam = families.find((f) => f.id === id);
    if (!fam) return;
    const nextActive = !fam.isActiveThisYear;
    try {
      await backendApi.renewFamily(id, settings.activeAcademicYear, nextActive ? 'renewed' : 'inactive');
      await loadWorkspace();
      const refreshed = (await backendApi.getFamilies()).families.find((f) => f.id === id);
      setSelected(refreshed || null);
      toast('info', nextActive ? 'Renovación registrada' : 'Familia marcada como no renovada');
    } catch (error:any) {
      toast('error', 'No se pudo actualizar la renovación', error?.message);
    }
  };

  const deleteFamily = async (family: Family) => {
    if (currentUser?.role !== 'superadmin') return;
    const confirmation = window.prompt(`Para eliminar definitivamente la familia ${family.familyName}, escribe su número de socio: ${family.membershipNumber}`);
    if (confirmation !== family.membershipNumber) return;
    try {
      await backendApi.createBackup('pre-delete');
      await backendApi.deleteFamily(family.id);
      await loadWorkspace();
      setSelected(null);
      toast('success','Familia eliminada',`Se ha creado una copia previa a la eliminación de ${family.membershipNumber}.`);
    } catch (error:any) {
      toast('error','No se pudo eliminar la familia',error?.message);
    }
  };

  const downloadCSV = () => {
    const csv = exportToCSV(filtered, settings.activeAcademicYear);
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = `ampa_familias_${settings.activeAcademicYear.replace('/', '-')}.csv`;
    a.click();
    URL.revokeObjectURL(href);
    toast('success', 'Listado exportado', `${filtered.length} familias incluidas.`);
  };

  const updateSettings = async (next: SystemSettings) => {
    try {
      const result = await backendApi.saveSettings(next);
      setSettings({ ...defaultSettings, ...result.settings });
      await loadWorkspace();
      toast('success', 'Ajustes guardados');
    } catch (error:any) {
      toast('error', 'No se pudieron guardar los ajustes', error?.message);
    }
  };

  const handleAdvanceYear = async (newYear: string) => {
    if (!currentUser || !window.confirm(`Abrir el curso ${newYear}? Las familias quedarán pendientes de renovación y se conservará el histórico.`)) return;
    try {
      await backendApi.saveSettings({ ...settings, activeAcademicYear: newYear });
      await Promise.all(families.map((family) => backendApi.renewFamily(family.id, newYear, 'pending')));
      await loadWorkspace();
      toast('success', 'Nuevo curso abierto', `Curso ${newYear} preparado para renovaciones.`);
    } catch (error:any) {
      toast('error', 'No se pudo abrir el nuevo curso', error?.message);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 sm:px-6">
          <AmpaLogo className="h-11 w-auto max-w-[210px]" />
          <div className="hidden h-8 w-px bg-slate-200 sm:block" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-extrabold">Gestión de Familias</div>
            <div className="text-[11px] text-slate-500">Curso {settings.activeAcademicYear} · base de datos central</div>
          </div>
          <div className="hidden text-right md:block">
            <div className="text-xs font-bold">{currentUser.name}</div>
            <div className="text-[10px] uppercase tracking-wider text-slate-400">{currentUser.role}</div>
          </div>
          <button type="button" onClick={handleLogout} className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-600 hover:bg-slate-50">
            <LogOut size={16}/><span className="hidden sm:inline">Salir</span>
          </button>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[210px_1fr]">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <nav className="grid grid-cols-4 gap-2 lg:grid-cols-1">
            {[
              ['dashboard', 'Panel', LayoutDashboard],
              ['families', 'Directorio', Users],
              ['courses', 'Cursos', GraduationCap],
              ['settings', 'Ajustes', Settings],
            ].map(([id, label, Icon]: any) => (
              <button key={id} type="button" onClick={() => setTab(id)} className={`flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-xs font-bold lg:justify-start ${tab === id ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
                <Icon size={17}/><span>{label}</span>
              </button>
            ))}
          </nav>
        </aside>

        <main className="min-w-0">
          {tab === 'dashboard' && (
            <div className="space-y-6">
              <section className="flex flex-col justify-between gap-4 rounded-3xl bg-slate-900 p-6 text-white sm:flex-row sm:items-center">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[.18em] text-slate-400">Resumen operativo</p>
                  <h1 className="mt-2 text-2xl font-black">AMPA Agustinos Granada</h1>
                  <p className="mt-1 max-w-2xl text-sm text-slate-300">Consulta el estado del censo, controla renovaciones y accede rápidamente a las tareas habituales.</p>
                </div>
                {canEdit && <button type="button" onClick={() => setEditing(emptyFamily(nextMembershipNumber(families)))} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 text-sm font-bold hover:bg-rose-500"><Plus size={18}/> Nueva familia</button>}
              </section>

              <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  ['Familias', families.length, Users, 'Censo total'],
                  ['Activas', activeCount, CheckCircle2, 'Renovadas este curso'],
                  ['Pendientes', pendingCount, Clock3, 'Sin renovación'],
                  ['Alumnos', studentCount, GraduationCap, 'Hijos registrados'],
                ].map(([label, value, Icon, hint]: any) => (
                  <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="mb-4 flex items-center justify-between"><span className="text-xs font-bold text-slate-500">{label}</span><Icon size={18} className="text-slate-400"/></div>
                    <div className="text-3xl font-black tracking-tight">{value}</div>
                    <div className="mt-1 text-[11px] text-slate-400">{hint}</div>
                  </div>
                ))}
              </section>

              <section className="grid gap-3 lg:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="mb-3 text-sm font-extrabold">Distribución por etapas</div>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(families.flatMap((f)=>f.students).reduce((acc: Record<string,number>, s) => {
                      const stage = calculateStudentCourse(s, settings.activeAcademicYear).stageName;
                      acc[stage] = (acc[stage] || 0) + 1;
                      return acc;
                    }, {})).map(([stage,count]) => <div key={stage} className="rounded-xl bg-slate-50 p-3"><div className="text-[11px] text-slate-500">{stage}</div><div className="mt-1 text-xl font-black">{count}</div></div>)}
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="mb-3 text-sm font-extrabold">Altas recientes</div>
                  <div className="space-y-2">
                    {[...families].sort((a,b)=>b.registrationDate.localeCompare(a.registrationDate)).slice(0,4).map((f)=><button key={f.id} onClick={()=>setSelected(f)} className="flex w-full justify-between rounded-xl bg-slate-50 p-3 text-left"><span className="text-xs font-bold">Familia {f.familyName}</span><span className="text-[10px] text-slate-400">{new Date(f.registrationDate).toLocaleDateString('es-ES')}</span></button>)}
                  </div>
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white">
                <div className="flex items-center justify-between border-b border-slate-100 p-4">
                  <div><h2 className="text-sm font-extrabold">Fichas que requieren revisión</h2><p className="text-xs text-slate-500">Datos de contacto, domicilio, nacimiento o consentimientos incompletos.</p></div>
                  <button type="button" onClick={() => { setQualityFilter('incomplete'); setTab('families'); }} className="text-xs font-bold text-rose-600">{incompleteFamilies.length} pendientes</button>
                </div>
                <div className="divide-y divide-slate-100">
                  {incompleteFamilies.slice(0,5).map((f)=><button key={f.id} type="button" onClick={()=>setSelected(f)} className="flex w-full items-center gap-3 p-4 text-left hover:bg-slate-50">
                    <AlertTriangle size={16} className="text-amber-500"/>
                    <div className="min-w-0 flex-1"><div className="truncate text-sm font-bold">Familia {f.familyName}</div><div className="text-[11px] text-slate-400">{getFamilyDataIssues(f).slice(0,2).map((i)=>i.label).join(' · ')}</div></div>
                    <ChevronRight size={17} className="text-slate-300"/>
                  </button>)}
                  {!incompleteFamilies.length&&<div className="p-8 text-center text-sm text-slate-400">No hay fichas con datos pendientes.</div>}
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white">
                <div className="flex items-center justify-between border-b border-slate-100 p-4">
                  <div><h2 className="text-sm font-extrabold">Pendientes de renovación</h2><p className="text-xs text-slate-500">Familias no activas en {settings.activeAcademicYear}</p></div>
                  <button type="button" onClick={() => { setStatus('inactive'); setTab('families'); }} className="text-xs font-bold text-rose-600">Ver todas</button>
                </div>
                <div className="divide-y divide-slate-100">
                  {families.filter((f) => !f.isActiveThisYear).slice(0,5).map((f) => (
                    <button key={f.id} type="button" onClick={() => setSelected(f)} className="flex w-full items-center gap-3 p-4 text-left hover:bg-slate-50">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 font-bold text-slate-500">{f.familyName.charAt(0)}</div>
                      <div className="min-w-0 flex-1"><div className="truncate text-sm font-bold">Familia {f.familyName}</div><div className="text-[11px] text-slate-400">{f.membershipNumber}</div></div>
                      <ChevronRight size={17} className="text-slate-300"/>
                    </button>
                  ))}
                  {pendingCount === 0 && <div className="p-8 text-center text-sm text-slate-400">Todas las familias están renovadas.</div>}
                </div>
              </section>
            </div>
          )}

          {tab === 'families' && (
            <div className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div><p className="text-xs font-bold uppercase tracking-[.18em] text-slate-400">Directorio</p><h1 className="text-2xl font-black">Familias asociadas</h1></div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={downloadCSV} className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold"><Download size={16}/> Exportar CSV</button>
                  <button type="button" onClick={()=>generateFamiliesPdfReport(filtered,{academicYear:settings.activeAcademicYear,associationName:settings.associationName,schoolName:settings.schoolName,filterLabel:`${filtered.length} familias · filtros del directorio`})} className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold"><Download size={16}/> PDF filtrado</button>
                  {canEdit && <button type="button" onClick={() => setEditing(emptyFamily(nextMembershipNumber(families)))} className="flex min-h-11 items-center gap-2 rounded-xl bg-rose-600 px-4 text-xs font-bold text-white"><Plus size={16}/> Nueva familia</button>}
                </div>
              </div>

              <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-3">
                <label className="relative block">
                  <Search size={17} className="absolute left-3 top-3.5 text-slate-400"/>
                  <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar familia, alumno, teléfono, email o nº de socio…" className="min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm outline-none focus:border-rose-400 focus:bg-white"/>
                </label>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                  <select value={status} onChange={(e)=>setStatus(e.target.value as any)} className="min-h-10 rounded-xl border border-slate-200 px-3 text-xs font-bold"><option value="all">Todos los estados</option><option value="active">Activas</option><option value="inactive">Pendientes</option></select>
                  <select value={academicYearFilter} onChange={(e)=>setAcademicYearFilter(e.target.value)} className="min-h-10 rounded-xl border border-slate-200 px-3 text-xs font-bold"><option value="all">Todos los cursos</option>{academicYears.map((y)=><option key={y} value={y}>{y}</option>)}</select>
                  <select value={stageFilter} onChange={(e)=>setStageFilter(e.target.value)} className="min-h-10 rounded-xl border border-slate-200 px-3 text-xs font-bold"><option value="all">Todas las etapas</option><option value="infantil">Infantil</option><option value="primaria">Primaria</option><option value="secundaria">Secundaria</option><option value="bachillerato">Bachillerato</option><option value="graduado">Graduado</option></select>
                  <select value={qualityFilter} onChange={(e)=>setQualityFilter(e.target.value as any)} className="min-h-10 rounded-xl border border-slate-200 px-3 text-xs font-bold"><option value="all">Todas las fichas</option><option value="incomplete">Datos incompletos</option></select>
                  <div className="flex gap-2"><select value={sortBy} onChange={(e)=>setSortBy(e.target.value as any)} className="min-h-10 min-w-0 flex-1 rounded-xl border border-slate-200 px-2 text-xs font-bold"><option value="familyName">Orden: Familia</option><option value="membershipNumber">Orden: Socio</option><option value="registrationDate">Orden: Alta</option><option value="studentsCount">Orden: Nº alumnos</option></select><button type="button" onClick={()=>setSortOrder(v=>v==='asc'?'desc':'asc')} className="min-h-10 rounded-xl border border-slate-200 px-3 text-xs font-black">{sortOrder==='asc'?'↑':'↓'}</button></div>
                </div>
              </div>

              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div className="hidden grid-cols-[110px_1.3fr_1fr_110px_40px] gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400 md:grid">
                  <span>Socio</span><span>Familia</span><span>Contacto</span><span>Estado</span><span/>
                </div>
                <div className="divide-y divide-slate-100">
                  {filtered.map((f) => {
                    const g = f.guardians.find((x) => x.isMainContact) || f.guardians[0];
                    return (
                      <button key={f.id} type="button" onClick={() => setSelected(f)} className="grid w-full gap-2 p-4 text-left hover:bg-slate-50 md:grid-cols-[110px_1.3fr_1fr_110px_40px] md:items-center md:gap-3">
                        <span className="font-mono text-xs font-bold text-slate-500">{f.membershipNumber}</span>
                        <span><span className="block text-sm font-extrabold">Familia {f.familyName}</span><span className="text-[11px] text-slate-400">{f.students.length} alumno{f.students.length === 1 ? '' : 's'}</span></span>
                        <span className="text-xs text-slate-500">{g?.fullName || 'Sin contacto'}<span className="block text-[11px] text-slate-400">{g?.phone}</span></span>
                        <span className={`w-fit rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${f.isActiveThisYear ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{f.isActiveThisYear ? 'Activa' : 'Pendiente'}</span>
                        <ChevronRight size={17} className="hidden text-slate-300 md:block"/>
                      </button>
                    );
                  })}
                  {filtered.length === 0 && <div className="p-12 text-center text-sm text-slate-400">No hay familias que coincidan con la búsqueda.</div>}
                </div>
              </div>
            </div>
          )}

          {tab === 'courses' && (
            <CoursesView families={families} settings={settings} canEdit={canEdit} onAdvanceYear={handleAdvanceYear} />
          )}

          {tab === 'settings' && (
            <div className="space-y-5">
              <div><p className="text-xs font-bold uppercase tracking-[.18em] text-slate-400">Configuración</p><h1 className="text-2xl font-black">Ajustes del AMPA</h1></div>
              <section className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="mb-5 flex items-center gap-3"><div className="rounded-xl bg-slate-100 p-2"><Settings size={18}/></div><div><h2 className="text-sm font-extrabold">Datos generales</h2><p className="text-xs text-slate-500">Configuración central de la aplicación.</p></div></div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {[
                    ['associationName','Asociación'],
                    ['schoolName','Centro educativo'],
                    ['activeAcademicYear','Curso académico'],
                    ['contactEmail','Correo de contacto'],
                  ].map(([key,label]) => (
                    <label key={key} className="space-y-1.5"><span className="text-xs font-bold text-slate-600">{label}</span><input disabled={!canEdit} value={(settings as any)[key]} onChange={(e) => setSettings({...settings,[key]:e.target.value})} className="min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm disabled:bg-slate-50"/></label>
                  ))}
                </div>
                {canEdit && <button type="button" onClick={() => updateSettings(settings)} className="mt-5 flex min-h-11 items-center gap-2 rounded-xl bg-slate-900 px-4 text-xs font-bold text-white"><Save size={16}/> Guardar ajustes</button>}
              </section>
              <AdminTools
                families={families}
                settings={settings}
                currentUser={currentUser}
                onFamiliesReload={() => loadWorkspace()}
                onNotify={toast}
              />
            </div>
          )}
        </main>
      </div>

      {selected && (
        <FamilyDetail
          family={selected}
          settings={settings}
          activity={activity}
          canEdit={canEdit}
          onClose={() => setSelected(null)}
          onEdit={() => { setEditing(hydrateFamilyForEditing(selected)); setSelected(null); }}
          onToggleRenewal={() => toggleActive(selected.id)}
          canDelete={currentUser.role === 'superadmin'}
          onDelete={() => void deleteFamily(selected)}
        />
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 sm:items-center sm:p-4">
          <div className="max-h-[96vh] w-full max-w-5xl overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white/95 p-5 backdrop-blur">
              <div>
                <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">{editing.membershipNumber}</div>
                <h2 className="text-lg font-black">{families.some((f)=>f.id===editing.id) ? 'Editar familia completa' : 'Nueva familia'}</h2>
              </div>
              <button type="button" onClick={() => setEditing(null)} className="rounded-xl p-2 hover:bg-slate-100"><X size={20}/></button>
            </div>

            <div className="space-y-7 p-5 sm:p-6">
              <section className="rounded-2xl border border-slate-200 p-4">
                <h3 className="mb-4 text-sm font-black">Datos generales</h3>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <label className="space-y-1 sm:col-span-2"><span className="text-[11px] font-bold text-slate-500">Nombre de la familia</span><input value={editing.familyName} onChange={(e)=>setEditing({...editing,familyName:e.target.value})} placeholder="Ej. García López" className="min-h-10 w-full rounded-xl border border-slate-200 px-3 text-sm"/></label>
                  <label className="space-y-1"><span className="text-[11px] font-bold text-slate-500">Nº de socio</span><input value={editing.membershipNumber} onChange={(e)=>setEditing({...editing,membershipNumber:e.target.value})} className="min-h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-mono"/></label>
                  <label className="flex min-h-10 items-center gap-2 self-end rounded-xl border border-slate-200 px-3"><input type="checkbox" checked={editing.isActiveThisYear} onChange={(e)=>setEditing({...editing,isActiveThisYear:e.target.checked})}/><span className="text-xs font-bold">Activa {settings.activeAcademicYear}</span></label>
                </div>
              </section>

              <section>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div><h3 className="text-sm font-black">Padre, madre y tutores</h3><p className="text-xs text-slate-500">Registre todos los adultos responsables de la unidad familiar.</p></div>
                  <button type="button" onClick={addGuardian} className="flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-bold"><UserPlus size={16}/> Añadir adulto</button>
                </div>
                <div className="space-y-3">
                  {editing.guardians.map((g, index) => (
                    <div key={g.id} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-3">
                          <select value={g.relationship} onChange={(e)=>updateGuardian(index,{relationship:e.target.value as Guardian['relationship']})} className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold">
                            <option value="madre">Madre</option><option value="padre">Padre</option><option value="tutor_legal">Tutor/a legal</option><option value="otro">Otro/a</option>
                          </select>
                          <label className="flex items-center gap-2 text-xs font-semibold text-slate-600"><input type="radio" name="mainGuardian" checked={g.isMainContact} onChange={()=>setMainGuardian(index)}/> Contacto principal</label>
                        </div>
                        {editing.guardians.length > 1 && <button type="button" onClick={()=>removeGuardian(index)} className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label="Eliminar adulto"><Trash2 size={16}/></button>}
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        <label className="space-y-1"><span className="text-[11px] font-bold text-slate-500">Nombre</span><input value={g.firstName || ''} onChange={(e)=>updateGuardian(index,{firstName:e.target.value})} className="min-h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"/></label>
                        <label className="space-y-1"><span className="text-[11px] font-bold text-slate-500">Apellidos</span><input value={g.lastName || ''} onChange={(e)=>updateGuardian(index,{lastName:e.target.value})} className="min-h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"/></label>
                        <label className="space-y-1"><span className="text-[11px] font-bold text-slate-500">DNI / NIE</span><input value={g.dni} onChange={(e)=>updateGuardian(index,{dni:e.target.value.toUpperCase()})} className="min-h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-mono"/></label>
                        <label className="space-y-1"><span className="text-[11px] font-bold text-slate-500">Fecha de nacimiento</span><input inputMode="numeric" placeholder="DD/MM/AAAA" value={dateDisplay(g.birthDateDDMMAAAA)} onChange={(e)=>updateGuardian(index,{birthDateDDMMAAAA:normalizeDateInput(e.target.value)})} className={`min-h-10 w-full rounded-xl border bg-white px-3 text-sm font-mono ${validDate(g.birthDateDDMMAAAA) ? 'border-slate-200' : 'border-rose-400'}`}/></label>
                        <label className="space-y-1"><span className="text-[11px] font-bold text-slate-500">Teléfono</span><input value={g.phone} onChange={(e)=>updateGuardian(index,{phone:e.target.value})} className="min-h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"/></label>
                        <label className="space-y-1"><span className="text-[11px] font-bold text-slate-500">Correo electrónico</span><input type="email" value={g.email} onChange={(e)=>updateGuardian(index,{email:e.target.value})} className="min-h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"/></label>
                      </div>
                      <div className="mt-4 grid gap-2 border-t border-slate-200 pt-3 sm:grid-cols-2">
                        <label className="flex items-center gap-2 text-xs font-semibold text-slate-600"><input type="checkbox" checked={g.communicationsConsent===true} onChange={(e)=>updateGuardian(index,{communicationsConsent:e.target.checked})}/> Autoriza comunicaciones del AMPA</label>
                        <label className="flex items-center gap-2 text-xs font-semibold text-slate-600"><input type="checkbox" checked={g.privacyConsent===true} onChange={(e)=>updateGuardian(index,{privacyConsent:e.target.checked})}/> Consentimiento de privacidad registrado</label>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div><h3 className="text-sm font-black">Hijos/as · alumnos/as</h3><p className="text-xs text-slate-500">Puede añadir tantos hijos/as como formen parte de la familia.</p></div>
                  <button type="button" onClick={addStudent} className="flex min-h-10 items-center gap-2 rounded-xl bg-rose-600 px-3 text-xs font-bold text-white"><Baby size={16}/> Añadir hijo/a</button>
                </div>
                <div className="space-y-3">
                  {editing.students.map((s, index) => (
                    <div key={s.id} className="rounded-2xl border border-slate-200 p-4">
                      <div className="mb-4 flex items-center justify-between"><div className="text-xs font-black uppercase tracking-wider text-slate-400">Alumno/a {index + 1}</div><button type="button" onClick={()=>removeStudent(index)} className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={16}/></button></div>
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        <label className="space-y-1"><span className="text-[11px] font-bold text-slate-500">Nombre</span><input value={s.firstName} onChange={(e)=>updateStudent(index,{firstName:e.target.value})} className="min-h-10 w-full rounded-xl border border-slate-200 px-3 text-sm"/></label>
                        <label className="space-y-1"><span className="text-[11px] font-bold text-slate-500">Apellidos</span><input value={s.lastName} onChange={(e)=>updateStudent(index,{lastName:e.target.value})} className="min-h-10 w-full rounded-xl border border-slate-200 px-3 text-sm"/></label>
                        <label className="space-y-1"><span className="text-[11px] font-bold text-slate-500">DNI / NIE</span><input value={s.dni || ''} onChange={(e)=>updateStudent(index,{dni:e.target.value.toUpperCase()})} className="min-h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-mono"/></label>
                        <label className="space-y-1"><span className="text-[11px] font-bold text-slate-500">Fecha de nacimiento</span><input inputMode="numeric" placeholder="DD/MM/AAAA" value={dateDisplay(s.birthDateDDMMAAAA)} onChange={(e)=>{const raw=normalizeDateInput(e.target.value);updateStudent(index,{birthDateDDMMAAAA:raw,birthYear:yearFromDate(raw,s.birthYear)});}} className={`min-h-10 w-full rounded-xl border px-3 text-sm font-mono ${validDate(s.birthDateDDMMAAAA) ? 'border-slate-200' : 'border-rose-400'}`}/></label>
                        <label className="space-y-1"><span className="text-[11px] font-bold text-slate-500">Grupo / letra</span><input value={s.groupLetter} onChange={(e)=>updateStudent(index,{groupLetter:e.target.value.toUpperCase().slice(0,2)})} placeholder="A" className="min-h-10 w-full rounded-xl border border-slate-200 px-3 text-sm"/></label>
                        <label className="space-y-1"><span className="text-[11px] font-bold text-slate-500">Curso</span><select value={s.courseOffset} onChange={(e)=>updateStudent(index,{courseOffset:Number(e.target.value)})} className="min-h-10 w-full rounded-xl border border-slate-200 px-3 text-sm"><option value={-1}>-1 respecto al automático</option><option value={0}>Automático por edad</option><option value={1}>+1 respecto al automático</option></select></label>
                        <label className="space-y-1 sm:col-span-2"><span className="text-[11px] font-bold text-slate-500">Alergias / intolerancias</span><input value={s.allergies || ''} onChange={(e)=>updateStudent(index,{allergies:e.target.value})} className="min-h-10 w-full rounded-xl border border-slate-200 px-3 text-sm"/></label>
                        <label className="space-y-1"><span className="text-[11px] font-bold text-slate-500">Necesidades especiales</span><input value={s.specialNeeds || ''} onChange={(e)=>updateStudent(index,{specialNeeds:e.target.value})} className="min-h-10 w-full rounded-xl border border-slate-200 px-3 text-sm"/></label>
                        <label className="flex min-h-10 items-center gap-2 rounded-xl bg-slate-50 px-3 text-xs font-semibold text-slate-600"><input type="checkbox" checked={s.authorizedPhoto} onChange={(e)=>updateStudent(index,{authorizedPhoto:e.target.checked})}/> Autorización de imagen registrada</label>
                      </div>
                    </div>
                  ))}
                  {editing.students.length === 0 && <button type="button" onClick={addStudent} className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 p-6 text-sm font-bold text-slate-400 hover:border-rose-300 hover:text-rose-600"><Plus size={18}/> Añadir el primer hijo/a</button>}
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 p-4">
                <h3 className="mb-4 text-sm font-black">Domicilio y observaciones</h3>
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="space-y-1 sm:col-span-2"><span className="text-[11px] font-bold text-slate-500">Dirección</span><input value={editing.address.street} onChange={(e)=>setEditing({...editing,address:{...editing.address,street:e.target.value}})} className="min-h-10 w-full rounded-xl border border-slate-200 px-3 text-sm"/></label>
                  <label className="space-y-1"><span className="text-[11px] font-bold text-slate-500">Código postal</span><input value={editing.address.postalCode} onChange={(e)=>setEditing({...editing,address:{...editing.address,postalCode:e.target.value}})} className="min-h-10 w-full rounded-xl border border-slate-200 px-3 text-sm"/></label>
                  <label className="space-y-1"><span className="text-[11px] font-bold text-slate-500">Localidad</span><input value={editing.address.city} onChange={(e)=>setEditing({...editing,address:{...editing.address,city:e.target.value}})} className="min-h-10 w-full rounded-xl border border-slate-200 px-3 text-sm"/></label>
                  <label className="space-y-1 sm:col-span-2"><span className="text-[11px] font-bold text-slate-500">Observaciones</span><textarea value={editing.notes || ''} onChange={(e)=>setEditing({...editing,notes:e.target.value})} rows={3} className="w-full rounded-xl border border-slate-200 p-3 text-sm"/></label>
                </div>
              </section>

              <div className="sticky bottom-0 -mx-5 -mb-5 flex justify-end gap-2 border-t border-slate-200 bg-white/95 p-4 backdrop-blur sm:-mx-6 sm:-mb-6">
                <button type="button" onClick={()=>setEditing(null)} className="min-h-11 rounded-xl px-4 text-xs font-bold text-slate-500">Cancelar</button>
                <button type="button" onClick={saveEdited} className="flex min-h-11 items-center gap-2 rounded-xl bg-rose-600 px-5 text-xs font-bold text-white"><Save size={15}/> Guardar familia completa</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <NotificationToast toasts={toasts} onDismiss={(id) => setToasts((p) => p.filter((t) => t.id !== id))}/>
    </div>
  );
}

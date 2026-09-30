import React, { useEffect, useState } from 'react';
import { FileJson, FileText, ShieldCheck, UserCog, Plus, Save, KeyRound } from 'lucide-react';
import { AppUser, Family, SystemSettings } from '../types/family';
import { exportToJSON } from '../services/db';
import { backendApi } from '../services/backendApi';
import { generateFamiliesPdfReport } from '../utils/pdfExportUtils';

interface Props {
  families: Family[];
  settings: SystemSettings;
  currentUser: AppUser;
  onFamiliesReload: () => void | Promise<void>;
  onNotify: (type: 'success' | 'error' | 'info', title: string, message?: string) => void;
  onActivity?: (summary: string, action: 'export' | 'import' | 'settings', entityType?: 'export' | 'import' | 'settings') => void;
}

export function AdminTools({ families, settings, currentUser, onNotify }: Props) {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [newUser, setNewUser] = useState<AppUser>({
    id: '', username: '', name: '', email: '', role: 'user', password: '', isActive: true,
  });
  const isSuper = currentUser.role === 'superadmin';

  const loadUsers = async () => {
    if (!isSuper) return;
    setLoadingUsers(true);
    try {
      const result = await backendApi.getUsers();
      setUsers(result.users);
    } catch (e:any) {
      onNotify('error','No se pudieron cargar los usuarios',e?.message);
    } finally {
      setLoadingUsers(false);
    }
  };

  useEffect(() => { void loadUsers(); }, [isSuper]);

  const downloadText = (filename: string, text: string, type: string) => {
    const blob = new Blob([text], { type });
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href; a.download = filename; a.click();
    URL.revokeObjectURL(href);
  };

  const exportBackup = () => {
    downloadText(
      `ampa_backup_${new Date().toISOString().slice(0,10)}.json`,
      exportToJSON(families, settings),
      'application/json;charset=utf-8'
    );
    onNotify('success','Copia de seguridad exportada','El fichero contiene el censo y la configuración actual.');
  };

  const exportPdf = () => {
    generateFamiliesPdfReport(families, {
      academicYear: settings.activeAcademicYear,
      associationName: settings.associationName,
      schoolName: settings.schoolName,
      filterLabel: 'Censo completo',
    });
    onNotify('success','PDF generado',`${families.length} familias incluidas.`);
  };

  const createUser = async () => {
    if (!isSuper) return;
    if (!newUser.username.trim() || !newUser.name.trim() || !newUser.password) {
      onNotify('error','Faltan datos del usuario'); return;
    }
    if ((newUser.password || '').length < 12) {
      onNotify('error','Contraseña demasiado corta','Debe tener al menos 12 caracteres.'); return;
    }
    try {
      await backendApi.createUser({
        username:newUser.username.trim(), name:newUser.name.trim(), email:newUser.email?.trim(),
        role:newUser.role, password:newUser.password,
      });
      setNewUser({ id:'',username:'',name:'',email:'',role:'user',password:'',isActive:true });
      await loadUsers();
      onNotify('success','Usuario creado');
    } catch(e:any) {
      onNotify('error','No se pudo crear el usuario',e?.message);
    }
  };

  const toggleUser = async (user: AppUser) => {
    if (!isSuper || user.id===currentUser.id) return;
    try {
      await backendApi.updateUser(user.id,{isActive:user.isActive===false});
      await loadUsers();
      onNotify('success',user.isActive===false?'Usuario activado':'Usuario desactivado');
    } catch(e:any) {
      onNotify('error','No se pudo actualizar el usuario',e?.message);
    }
  };

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="mb-4 flex items-center gap-2"><ShieldCheck size={18}/><h2 className="text-sm font-extrabold">Datos, copias y documentos</h2></div>
        <div className="grid gap-3 sm:grid-cols-3">
          <button type="button" onClick={exportBackup} className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-bold"><FileJson size={17}/> Exportar backup JSON</button>
          <button type="button" onClick={exportPdf} className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-bold"><FileText size={17}/> Generar listado PDF</button>
          <div className="flex min-h-12 items-center justify-center rounded-xl border border-dashed border-slate-200 px-3 text-center text-[11px] font-semibold text-slate-400">Importación asistida CSV/JSON: siguiente bloque de migración</div>
        </div>
        <p className="mt-3 text-[11px] leading-5 text-slate-500">El backup se genera desde la base central. La restauración directa queda desactivada hasta incorporar previsualización, validación y confirmación reforzada.</p>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="mb-4 flex items-center gap-2"><UserCog size={18}/><div><h2 className="text-sm font-extrabold">Usuarios y roles</h2><p className="text-xs text-slate-500">Gestión centralizada en servidor. Sólo el Superadministrador puede modificarla.</p></div></div>

        {!isSuper && <div className="rounded-xl bg-slate-50 p-4 text-xs text-slate-500">La gestión de usuarios está reservada al Superadministrador.</div>}
        {isSuper && (
          <>
            <div className="space-y-2">
              {loadingUsers && <div className="p-4 text-sm text-slate-400">Cargando usuarios…</div>}
              {users.map((u) => (
                <div key={u.id} className="grid gap-3 rounded-xl bg-slate-50 p-3 sm:grid-cols-[1fr_auto_auto] sm:items-center">
                  <div>
                    <div className="text-sm font-bold">{u.name}</div>
                    <div className="text-[11px] text-slate-500">{u.username}{u.email ? ` · ${u.email}` : ''}{u.lastLoginAt ? ` · último acceso ${new Date(u.lastLoginAt).toLocaleString('es-ES')}` : ''}</div>
                  </div>
                  <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-black uppercase text-slate-600">{u.role}</span>
                  <button disabled={u.id===currentUser.id} type="button" onClick={()=>void toggleUser(u)} className={`min-h-9 rounded-lg px-3 text-xs font-bold disabled:opacity-40 ${u.isActive===false?'bg-amber-100 text-amber-800':'bg-emerald-100 text-emerald-800'}`}>{u.isActive===false?'Inactivo · activar':'Activo · desactivar'}</button>
                </div>
              ))}
            </div>

            <div className="mt-5 rounded-2xl border border-dashed border-slate-300 p-4">
              <div className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-400"><Plus size={14}/> Nuevo usuario</div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <input placeholder="Nombre" value={newUser.name} onChange={(e)=>setNewUser({...newUser,name:e.target.value})} className="min-h-10 rounded-xl border border-slate-200 px-3 text-sm"/>
                <input placeholder="Usuario" value={newUser.username} onChange={(e)=>setNewUser({...newUser,username:e.target.value})} className="min-h-10 rounded-xl border border-slate-200 px-3 text-sm"/>
                <input placeholder="Email" type="email" value={newUser.email||''} onChange={(e)=>setNewUser({...newUser,email:e.target.value})} className="min-h-10 rounded-xl border border-slate-200 px-3 text-sm"/>
                <div className="relative"><KeyRound size={14} className="absolute left-3 top-3 text-slate-400"/><input placeholder="Contraseña inicial (12+)" type="password" value={newUser.password||''} onChange={(e)=>setNewUser({...newUser,password:e.target.value})} className="min-h-10 w-full rounded-xl border border-slate-200 pl-9 pr-3 text-sm"/></div>
                <select value={newUser.role} onChange={(e)=>setNewUser({...newUser,role:e.target.value as AppUser['role']})} className="min-h-10 rounded-xl border border-slate-200 px-3 text-sm"><option value="user">Consulta</option><option value="admin">Administrador</option><option value="superadmin">Superadministrador</option></select>
                <button type="button" onClick={()=>void createUser()} className="flex min-h-10 items-center justify-center gap-2 rounded-xl bg-rose-600 px-3 text-xs font-bold text-white"><Save size={15}/> Crear usuario</button>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

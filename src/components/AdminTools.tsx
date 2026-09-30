import React, { useRef, useState } from 'react';
import { Download, FileJson, FileText, ShieldCheck, Upload, UserCog, Trash2, Plus, Save } from 'lucide-react';
import { AppUser, Family, SystemSettings } from '../types/family';
import { deleteUser, getUsers, saveUser } from '../services/authService';
import { exportToJSON, importFromJSON } from '../services/db';
import { generateFamiliesPdfReport } from '../utils/pdfExportUtils';

interface Props {
  families: Family[];
  settings: SystemSettings;
  currentUser: AppUser;
  onFamiliesReload: () => void;
  onNotify: (type: 'success' | 'error' | 'info', title: string, message?: string) => void;
  onActivity: (summary: string, action: 'export' | 'import' | 'settings', entityType?: 'export' | 'import' | 'settings') => void;
}

export function AdminTools({ families, settings, currentUser, onFamiliesReload, onNotify, onActivity }: Props) {
  const [users, setUsers] = useState<AppUser[]>(getUsers());
  const [newUser, setNewUser] = useState<AppUser>({
    id: '',
    username: '',
    name: '',
    email: '',
    role: 'user',
    password: '',
    isActive: true,
  });
  const fileRef = useRef<HTMLInputElement | null>(null);
  const isSuper = currentUser.role === 'superadmin';

  const downloadText = (filename: string, text: string, type: string) => {
    const blob = new Blob([text], { type });
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(href);
  };

  const exportBackup = () => {
    downloadText(
      `ampa_backup_${new Date().toISOString().slice(0,10)}.json`,
      exportToJSON(families, settings),
      'application/json;charset=utf-8'
    );
    onActivity('Copia de seguridad JSON exportada', 'export', 'export');
    onNotify('success', 'Copia de seguridad creada');
  };

  const exportPdf = () => {
    generateFamiliesPdfReport(families, {
      academicYear: settings.activeAcademicYear,
      associationName: settings.associationName,
      schoolName: settings.schoolName,
      filterLabel: 'Censo completo',
    });
    onActivity('Listado PDF del censo exportado', 'export', 'export');
    onNotify('success', 'PDF generado', `${families.length} familias incluidas.`);
  };

  const importBackup = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = importFromJSON(String(reader.result || ''));
      if (!result.success) {
        onNotify('error', 'No se pudo importar', result.error);
        return;
      }
      onFamiliesReload();
      onActivity(`Copia JSON importada: ${result.count} familias`, 'import', 'import');
      onNotify('success', 'Datos importados', `${result.count} familias restauradas.`);
    };
    reader.readAsText(file);
  };

  const createUser = () => {
    if (!isSuper) return;
    if (!newUser.username.trim() || !newUser.name.trim() || !newUser.password) {
      onNotify('error', 'Faltan datos del usuario');
      return;
    }
    const user: AppUser = {
      ...newUser,
      id: crypto.randomUUID(),
      username: newUser.username.trim(),
      name: newUser.name.trim(),
      email: newUser.email?.trim(),
      isActive: true,
    };
    setUsers(saveUser(user));
    setNewUser({ id: '', username: '', name: '', email: '', role: 'user', password: '', isActive: true });
    onNotify('success', 'Usuario creado', user.name);
  };

  const toggleUser = (user: AppUser) => {
    if (!isSuper) return;
    const updated = { ...user, isActive: user.isActive === false };
    setUsers(saveUser(updated));
  };

  const removeUser = (id: string) => {
    if (!isSuper) return;
    try {
      setUsers(deleteUser(id));
      onNotify('success', 'Usuario eliminado');
    } catch (e: any) {
      onNotify('error', 'No se puede eliminar', e?.message);
    }
  };

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="mb-4 flex items-center gap-2"><ShieldCheck size={18}/><h2 className="text-sm font-extrabold">Datos, copias y documentos</h2></div>
        <div className="grid gap-3 sm:grid-cols-3">
          <button type="button" onClick={exportBackup} className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-bold"><FileJson size={17}/> Exportar backup JSON</button>
          <button type="button" onClick={exportPdf} className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-bold"><FileText size={17}/> Generar listado PDF</button>
          <button type="button" onClick={() => fileRef.current?.click()} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-slate-900 px-3 text-xs font-bold text-white"><Upload size={17}/> Restaurar JSON</button>
          <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => importBackup(e.target.files?.[0])}/>
        </div>
        <p className="mt-3 text-[11px] leading-5 text-slate-500">La restauración JSON sustituye el censo local actual. En producción esta operación deberá estar protegida por backend, permisos y confirmación reforzada.</p>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="mb-4 flex items-center gap-2"><UserCog size={18}/><div><h2 className="text-sm font-extrabold">Usuarios y roles</h2><p className="text-xs text-slate-500">Superadministrador, Administrador y Consulta.</p></div></div>

        <div className="space-y-2">
          {users.map((u) => (
            <div key={u.id} className="grid gap-3 rounded-xl bg-slate-50 p-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-center">
              <div>
                <div className="text-sm font-bold">{u.name}</div>
                <div className="text-[11px] text-slate-500">{u.username}{u.email ? ` · ${u.email}` : ''}{u.lastLoginAt ? ` · último acceso ${new Date(u.lastLoginAt).toLocaleString('es-ES')}` : ''}</div>
              </div>
              <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-black uppercase text-slate-600">{u.role}</span>
              <button disabled={!isSuper || u.id === currentUser.id} type="button" onClick={() => toggleUser(u)} className={`min-h-9 rounded-lg px-3 text-xs font-bold disabled:opacity-40 ${u.isActive === false ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>{u.isActive === false ? 'Inactivo' : 'Activo'}</button>
              <button disabled={!isSuper || u.id === currentUser.id} type="button" onClick={() => removeUser(u.id)} className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30"><Trash2 size={15}/></button>
            </div>
          ))}
        </div>

        {isSuper && (
          <div className="mt-5 rounded-2xl border border-dashed border-slate-300 p-4">
            <div className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-400"><Plus size={14}/> Nuevo usuario</div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <input placeholder="Nombre" value={newUser.name} onChange={(e)=>setNewUser({...newUser,name:e.target.value})} className="min-h-10 rounded-xl border border-slate-200 px-3 text-sm"/>
              <input placeholder="Usuario" value={newUser.username} onChange={(e)=>setNewUser({...newUser,username:e.target.value})} className="min-h-10 rounded-xl border border-slate-200 px-3 text-sm"/>
              <input placeholder="Email" type="email" value={newUser.email || ''} onChange={(e)=>setNewUser({...newUser,email:e.target.value})} className="min-h-10 rounded-xl border border-slate-200 px-3 text-sm"/>
              <input placeholder="Contraseña inicial" type="password" value={newUser.password || ''} onChange={(e)=>setNewUser({...newUser,password:e.target.value})} className="min-h-10 rounded-xl border border-slate-200 px-3 text-sm"/>
              <select value={newUser.role} onChange={(e)=>setNewUser({...newUser,role:e.target.value as AppUser['role']})} className="min-h-10 rounded-xl border border-slate-200 px-3 text-sm">
                <option value="user">Consulta</option><option value="admin">Administrador</option><option value="superadmin">Superadministrador</option>
              </select>
              <button type="button" onClick={createUser} className="flex min-h-10 items-center justify-center gap-2 rounded-xl bg-rose-600 px-3 text-xs font-bold text-white"><Save size={15}/> Crear usuario</button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

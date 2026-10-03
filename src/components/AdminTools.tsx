import React, { useEffect, useState } from 'react';
import { ArchiveRestore, DatabaseBackup, FileJson, FileText, KeyRound, Mail, Plus, Save, ShieldCheck, Upload, UserCog } from 'lucide-react';
import { AppUser, Family, SystemSettings } from '../types/family';
import { exportToJSON } from '../utils/exportUtils';
import { backendApi } from '../services/backendApi';
import { generateFamiliesPdfReport } from '../utils/pdfExportUtils';
import { ImportWizard } from './ImportWizard';

interface Props {
  families: Family[];
  settings: SystemSettings;
  currentUser: AppUser;
  onFamiliesReload: () => void | Promise<void>;
  onNotify: (type: 'success' | 'error' | 'info', title: string, message?: string) => void;
}

type Backup = { id:string; createdAt:string; reason:string; createdByName?:string|null };

export function AdminTools({ families, settings, currentUser, onFamiliesReload, onNotify }: Props) {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [backups, setBackups] = useState<Backup[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [emailStatus,setEmailStatus]=useState<{configured:boolean;domainVerified?:boolean;fromEmail?:string|null;senderName?:string}|null>(null);
  const [newUser, setNewUser] = useState<AppUser>({ id:'', username:'', name:'', email:'', role:'user', password:'', isActive:true });
  const isSuper = currentUser.role === 'superadmin';
  const canAdminData = currentUser.role === 'superadmin' || currentUser.role === 'admin';

  const loadUsers = async () => {
    if (!isSuper) return;
    setLoadingUsers(true);
    try { setUsers((await backendApi.getUsers()).users); }
    catch(e:any){ onNotify('error','No se pudieron cargar los usuarios',e?.message); }
    finally { setLoadingUsers(false); }
  };

  const loadBackups = async () => {
    if (!isSuper) return;
    try { setBackups((await backendApi.listBackups()).backups); }
    catch(e:any){ onNotify('error','No se pudieron cargar las copias',e?.message); }
  };

  const loadEmailStatus = async () => {
    if (!canAdminData) return;
    try { setEmailStatus(await backendApi.emailStatus()); }
    catch { setEmailStatus(null); }
  };

  useEffect(()=>{ void loadUsers(); void loadBackups(); void loadEmailStatus(); },[isSuper,canAdminData]);

  const downloadText=(filename:string,text:string,type:string)=>{
    const blob=new Blob([text],{type}); const href=URL.createObjectURL(blob); const a=document.createElement('a');
    a.href=href;a.download=filename;a.click();URL.revokeObjectURL(href);
  };

  const exportBackup=()=>{
    downloadText(`ampa_backup_${new Date().toISOString().slice(0,10)}.json`,exportToJSON(families,settings),'application/json;charset=utf-8');
    onNotify('success','Copia JSON descargada','El fichero contiene el censo y la configuración actual.');
  };

  const exportPdf=()=>{
    generateFamiliesPdfReport(families,{academicYear:settings.activeAcademicYear,associationName:settings.associationName,schoolName:settings.schoolName,filterLabel:'Censo completo'});
    onNotify('success','PDF generado',`${families.length} familias incluidas.`);
  };

  const createInternalBackup=async()=>{
    try { await backendApi.createBackup('manual'); await loadBackups(); onNotify('success','Snapshot interno creado'); }
    catch(e:any){ onNotify('error','No se pudo crear la copia',e?.message); }
  };

  const restore=async(backup:Backup)=>{
    const confirmation=window.prompt('Esta acción sustituirá el censo y la configuración actuales. Escribe exactamente: RESTAURAR COPIA');
    if(confirmation!=='RESTAURAR COPIA') return;
    try{
      await backendApi.restoreBackup(backup.id,confirmation);
      await onFamiliesReload();
      await loadBackups();
      onNotify('success','Copia restaurada',new Date(backup.createdAt).toLocaleString('es-ES'));
    }catch(e:any){ onNotify('error','No se pudo restaurar la copia',e?.message); }
  };

  const runImport=async(importFamilies:Family[],mode:'merge'|'replace')=>{
    try{
      const result=await backendApi.importFamilies(importFamilies,mode);
      await onFamiliesReload();
      if(isSuper) await loadBackups();
      onNotify('success','Importación completada',`${result.imported} familias procesadas.`);
    }catch(e:any){ onNotify('error','La importación no se completó',e?.message); throw e; }
  };

  const createUser=async()=>{
    if(!isSuper) return;
    if(!newUser.username.trim()||!newUser.name.trim()||!newUser.password){onNotify('error','Faltan datos del usuario');return;}
    if((newUser.password||'').length<12){onNotify('error','Contraseña demasiado corta','Debe tener al menos 12 caracteres.');return;}
    try{
      await backendApi.createUser({username:newUser.username.trim(),name:newUser.name.trim(),email:newUser.email?.trim(),role:newUser.role,password:newUser.password});
      setNewUser({id:'',username:'',name:'',email:'',role:'user',password:'',isActive:true});
      await loadUsers(); onNotify('success','Usuario creado');
    }catch(e:any){onNotify('error','No se pudo crear el usuario',e?.message);}
  };

  const toggleUser=async(user:AppUser)=>{
    if(!isSuper||user.id===currentUser.id)return;
    try{await backendApi.updateUser(user.id,{isActive:user.isActive===false});await loadUsers();onNotify('success',user.isActive===false?'Usuario activado':'Usuario desactivado');}
    catch(e:any){onNotify('error','No se pudo actualizar el usuario',e?.message);}
  };

  return (
    <div className="space-y-5">
      {showImport && <ImportWizard canReplace={isSuper} onImport={runImport} onClose={()=>setShowImport(false)}/>}

      {canAdminData && <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className={`rounded-xl p-2 ${emailStatus?.configured?'bg-emerald-50 text-emerald-700':'bg-amber-50 text-amber-700'}`}><Mail size={18}/></div>
            <div>
              <h2 className="text-sm font-extrabold">Correo saliente</h2>
              <p className="mt-1 text-xs text-slate-500">{emailStatus?.fromEmail || 'Remitente no configurado'}</p>
            </div>
          </div>
          <div className={`w-fit rounded-full px-3 py-1.5 text-[10px] font-black uppercase ${emailStatus?.configured?'bg-emerald-50 text-emerald-700':'bg-amber-50 text-amber-700'}`}>
            {emailStatus?.configured ? 'Operativo' : emailStatus?.domainVerified===false ? 'Dominio no verificado' : 'No operativo'}
          </div>
        </div>
        {!emailStatus?.configured && <p className="mt-3 text-[11px] leading-5 text-amber-700">El envío desde la aplicación está bloqueado hasta que el dominio del remitente quede verificado en el proveedor de correo.</p>}
      </section>}

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="mb-4 flex items-center gap-2"><ShieldCheck size={18}/><div><h2 className="text-sm font-extrabold">Datos, importación y documentos</h2><p className="text-xs text-slate-500">Herramientas sobre la base central del AMPA.</p></div></div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {canAdminData && <button type="button" onClick={()=>setShowImport(true)} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-slate-900 px-3 text-xs font-bold text-white"><Upload size={17}/> Importar CSV / JSON</button>}
          <button type="button" onClick={exportBackup} className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-bold"><FileJson size={17}/> Descargar backup JSON</button>
          <button type="button" onClick={exportPdf} className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-bold"><FileText size={17}/> Generar censo PDF</button>
          {isSuper && <button type="button" onClick={()=>void createInternalBackup()} className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-bold"><DatabaseBackup size={17}/> Crear snapshot interno</button>}
        </div>
        <p className="mt-3 text-[11px] leading-5 text-slate-500">Las importaciones se previsualizan y validan antes de escribir. Antes de una importación o restauración se crea automáticamente una copia interna.</p>
      </section>

      {isSuper && <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="mb-4 flex items-center gap-2"><DatabaseBackup size={18}/><div><h2 className="text-sm font-extrabold">Copias internas</h2><p className="text-xs text-slate-500">Snapshot automático diario y copias previas a operaciones sensibles. Se conservan las 30 últimas.</p></div></div>
        <div className="space-y-2">
          {backups.slice(0,8).map((b)=><div key={b.id} className="flex flex-col gap-3 rounded-xl bg-slate-50 p-3 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1"><div className="text-xs font-bold">{new Date(b.createdAt).toLocaleString('es-ES')}</div><div className="text-[11px] text-slate-500">{b.reason}{b.createdByName?` · ${b.createdByName}`:''}</div></div>
            <button onClick={()=>void restore(b)} className="flex min-h-9 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600"><ArchiveRestore size={14}/> Restaurar</button>
          </div>)}
          {!backups.length&&<div className="rounded-xl border border-dashed border-slate-200 p-5 text-center text-xs text-slate-400">Aún no hay snapshots disponibles.</div>}
        </div>
      </section>}

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="mb-4 flex items-center gap-2"><UserCog size={18}/><div><h2 className="text-sm font-extrabold">Usuarios y roles</h2><p className="text-xs text-slate-500">Superadministrador, Administrador y Consulta. Los permisos se validan también en servidor.</p></div></div>
        {!isSuper&&<div className="rounded-xl bg-slate-50 p-4 text-xs text-slate-500">La gestión de usuarios está reservada al Superadministrador.</div>}
        {isSuper&&<>
          <div className="space-y-2">
            {loadingUsers&&<div className="p-4 text-sm text-slate-400">Cargando usuarios…</div>}
            {users.map((u)=><div key={u.id} className="grid gap-3 rounded-xl bg-slate-50 p-3 sm:grid-cols-[1fr_auto_auto] sm:items-center">
              <div><div className="text-sm font-bold">{u.name}</div><div className="text-[11px] text-slate-500">{u.username}{u.email?` · ${u.email}`:''}{u.lastLoginAt?` · último acceso ${new Date(u.lastLoginAt).toLocaleString('es-ES')}`:''}</div></div>
              <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-black uppercase text-slate-600">{u.role}</span>
              <button disabled={u.id===currentUser.id} type="button" onClick={()=>void toggleUser(u)} className={`min-h-9 rounded-lg px-3 text-xs font-bold disabled:opacity-40 ${u.isActive===false?'bg-amber-100 text-amber-800':'bg-emerald-100 text-emerald-800'}`}>{u.isActive===false?'Inactivo · activar':'Activo · desactivar'}</button>
            </div>)}
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
        </>}
      </section>
    </div>
  );
}

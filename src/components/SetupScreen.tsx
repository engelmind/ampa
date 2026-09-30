import React, { useState } from 'react';
import { AlertCircle, Eye, EyeOff, KeyRound, ShieldCheck } from 'lucide-react';
import { AmpaLogo } from './AmpaLogo';
import { AppUser } from '../types/family';

interface Props {
  onBootstrap: (payload: { code: string; username: string; email?: string; name: string; password: string }) => Promise<AppUser>;
  onReady: (user: AppUser) => void;
}

export function SetupScreen({ onBootstrap, onReady }: Props) {
  const [code, setCode] = useState('');
  const [username, setUsername] = useState('engelmind');
  const [email, setEmail] = useState('engelmind@hotmail.com');
  const [name, setName] = useState('Superadministrador AMPA');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!code.trim()) return setError('Introduzca el código de activación.');
    if (!username.trim() || !name.trim()) return setError('Complete usuario y nombre.');
    if (password.length < 12) return setError('La contraseña debe tener al menos 12 caracteres.');
    if (password !== repeat) return setError('Las contraseñas no coinciden.');
    setBusy(true);
    try {
      const user = await onBootstrap({ code: code.trim(), username: username.trim(), email: email.trim() || undefined, name: name.trim(), password });
      onReady(user);
    } catch (e: any) {
      const message = e?.message === 'INVALID_SETUP_CODE'
        ? 'El código de activación no es válido.'
        : e?.message === 'ALREADY_INITIALIZED'
          ? 'La aplicación ya ha sido inicializada.'
          : 'No se pudo completar la activación inicial.';
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <div className="border-b border-slate-100 bg-slate-50 p-7 text-center">
          <AmpaLogo className="mx-auto h-16 w-auto" />
          <div className="mt-5 flex items-center justify-center gap-2 text-slate-900"><ShieldCheck size={19}/><h1 className="text-xl font-black">Activación inicial segura</h1></div>
          <p className="mx-auto mt-2 max-w-md text-xs leading-5 text-slate-500">Crea el primer Superadministrador. El código de activación sólo puede utilizarse una vez y se elimina al finalizar.</p>
        </div>

        <form onSubmit={submit} className="space-y-4 p-6 sm:p-8">
          {error && <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700"><AlertCircle size={16}/>{error}</div>}

          <label className="block space-y-1.5">
            <span className="text-xs font-bold text-slate-600">Código de activación</span>
            <div className="relative"><KeyRound size={16} className="absolute left-3.5 top-3 text-slate-400"/><input autoFocus value={code} onChange={(e)=>setCode(e.target.value)} className="min-h-11 w-full rounded-xl border border-slate-200 pl-10 pr-3 font-mono text-sm" placeholder="Código de un solo uso"/></div>
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1.5"><span className="text-xs font-bold text-slate-600">Usuario</span><input value={username} onChange={(e)=>setUsername(e.target.value)} autoComplete="username" className="min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm"/></label>
            <label className="space-y-1.5"><span className="text-xs font-bold text-slate-600">Correo</span><input type="email" value={email} onChange={(e)=>setEmail(e.target.value)} className="min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm"/></label>
          </div>

          <label className="block space-y-1.5"><span className="text-xs font-bold text-slate-600">Nombre visible</span><input value={name} onChange={(e)=>setName(e.target.value)} className="min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm"/></label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1.5"><span className="text-xs font-bold text-slate-600">Contraseña</span><div className="relative"><input type={showPassword?'text':'password'} value={password} onChange={(e)=>setPassword(e.target.value)} autoComplete="new-password" className="min-h-11 w-full rounded-xl border border-slate-200 px-3 pr-10 text-sm"/><button type="button" onClick={()=>setShowPassword(v=>!v)} className="absolute right-3 top-3 text-slate-400">{showPassword?<EyeOff size={16}/>:<Eye size={16}/>}</button></div></label>
            <label className="space-y-1.5"><span className="text-xs font-bold text-slate-600">Repetir contraseña</span><input type={showPassword?'text':'password'} value={repeat} onChange={(e)=>setRepeat(e.target.value)} autoComplete="new-password" className="min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm"/></label>
          </div>

          <button disabled={busy} className="min-h-12 w-full rounded-xl bg-rose-600 px-4 text-sm font-bold text-white disabled:opacity-50">{busy?'Creando Superadministrador…':'Activar aplicación'}</button>
        </form>
      </div>
    </div>
  );
}

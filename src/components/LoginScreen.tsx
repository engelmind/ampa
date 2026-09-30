import React, { useState } from 'react';
import { AppUser } from '../types/family';
import { AmpaLogo } from './AmpaLogo';
import { Lock, User, AlertCircle, ArrowRight, Eye, EyeOff } from 'lucide-react';

interface LoginScreenProps {
  onAuthenticate: (username: string, password: string) => Promise<AppUser>;
  onLoginSuccess: (user: AppUser) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onAuthenticate, onLoginSuccess }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    if (!username.trim() || !password) {
      setErrorMessage('Introduzca usuario y contraseña.');
      return;
    }
    setIsLoading(true);
    try {
      const user = await onAuthenticate(username.trim(), password);
      onLoginSuccess(user);
    } catch (error: any) {
      const code = error?.message || '';
      setErrorMessage(code === 'INVALID_CREDENTIALS'
        ? 'Usuario o contraseña incorrectos.'
        : 'No se ha podido iniciar sesión. Compruebe la conexión e inténtelo de nuevo.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-[#1c1917] to-slate-900 flex flex-col justify-center items-center p-4 sm:p-6 text-slate-800">
      <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden z-10">
        <div className="p-8 pb-6 text-center bg-gradient-to-b from-slate-50 to-white border-b border-slate-100">
          <div className="flex justify-center mb-4"><AmpaLogo className="h-16 w-auto" /></div>
          <h2 className="text-xl font-black tracking-tight text-slate-900">Control de Acceso</h2>
          <p className="text-xs text-slate-500 mt-1">Plataforma privada de gestión del AMPA</p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-4">
          {errorMessage && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle size={16} className="shrink-0" /><span>{errorMessage}</span>
            </div>
          )}
          <div className="space-y-1.5">
            <label htmlFor="ampa-user" className="text-xs font-bold text-slate-700 block">Usuario o correo</label>
            <div className="relative">
              <User className="absolute left-3.5 top-3 text-slate-400" size={17} />
              <input id="ampa-user" type="text" autoFocus autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Usuario" className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:bg-white focus:ring-2 focus:ring-rose-500" />
            </div>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="ampa-password" className="text-xs font-bold text-slate-700 block">Contraseña</label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-3 text-slate-400" size={17} />
              <input id="ampa-password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••••••" className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:bg-white focus:ring-2 focus:ring-rose-500 font-mono" />
              <button type="button" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'} className="absolute right-3.5 top-3 text-slate-400 hover:text-slate-600">{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button>
            </div>
          </div>
          <button type="submit" disabled={isLoading} className="w-full py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-sm font-bold shadow-md transition flex items-center justify-center gap-2 disabled:opacity-50">
            {isLoading ? 'Verificando...' : <><span>Iniciar sesión</span><ArrowRight size={16} /></>}
          </button>
          <div className="pt-4 border-t border-slate-100 text-center">
            <p className="text-[10px] leading-4 text-slate-500">Acceso exclusivo para usuarios autorizados. La sesión se gestiona mediante cookie segura HttpOnly.</p>
          </div>
        </form>
        <div className="bg-slate-50 p-4 border-t border-slate-100 text-center text-xs text-slate-500">AMPA Colegio San Agustín Granada</div>
      </div>
    </div>
  );
};

import React from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  title: string;
  message?: string;
}

interface ToastProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const NotificationToast: React.FC<ToastProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm w-full no-print pointer-events-none">
      {toasts.map((toast) => (
        <div key={toast.id} className={`pointer-events-auto flex items-start gap-3 p-4 rounded-xl shadow-lg border backdrop-blur-md ${toast.type === 'success' ? 'bg-emerald-900/90 text-white border-emerald-700/60' : toast.type === 'error' ? 'bg-rose-900/90 text-white border-rose-700/60' : 'bg-slate-900/90 text-white border-slate-700/60'}`}>
          <div className="shrink-0 mt-0.5">
            {toast.type === 'success' ? <CheckCircle2 size={18} className="text-emerald-300" /> : toast.type === 'error' ? <AlertCircle size={18} className="text-rose-300" /> : <Info size={18} className="text-sky-300" />}
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-semibold text-white leading-tight">{toast.title}</h4>
            {toast.message && <p className="text-xs text-slate-200 mt-1 leading-relaxed">{toast.message}</p>}
          </div>
          <button type="button" onClick={() => onDismiss(toast.id)} aria-label="Cerrar aviso" className="text-slate-300 hover:text-white p-1 rounded"><X size={15} /></button>
        </div>
      ))}
    </div>
  );
};

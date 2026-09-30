import React, { useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileUp, Upload, X } from 'lucide-react';
import { Family } from '../types/family';
import { previewImport, ImportPreview } from '../utils/importUtils';

interface Props {
  canReplace: boolean;
  onImport: (families: Family[], mode: 'merge' | 'replace') => Promise<void>;
  onClose: () => void;
}

export function ImportWizard({ canReplace, onImport, onClose }: Props) {
  const inputRef = useRef<HTMLInputElement|null>(null);
  const [preview, setPreview] = useState<ImportPreview|null>(null);
  const [filename, setFilename] = useState('');
  const [mode, setMode] = useState<'merge'|'replace'>('merge');
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const read = (file?:File) => {
    if (!file) return;
    setFilename(file.name);
    const reader = new FileReader();
    reader.onload = () => setPreview(previewImport(String(reader.result||''),file.name));
    reader.readAsText(file);
  };

  const submit = async () => {
    if (!preview || preview.errors.length || !preview.families.length || !confirmed) return;
    setBusy(true);
    try {
      await onImport(preview.families,mode);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/60 sm:items-center sm:p-4">
      <div className="max-h-[94vh] w-full max-w-4xl overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white/95 p-5 backdrop-blur">
          <div><div className="text-[10px] font-black uppercase tracking-wider text-slate-400">Importación asistida</div><h2 className="text-lg font-black">Importar familias y alumnos</h2></div>
          <button onClick={onClose} className="rounded-xl p-2 hover:bg-slate-100"><X size={20}/></button>
        </div>

        <div className="space-y-5 p-5 sm:p-6">
          <section className="rounded-2xl border border-dashed border-slate-300 p-5 text-center">
            <FileUp className="mx-auto text-slate-400"/>
            <p className="mt-2 text-sm font-bold">CSV o JSON de la aplicación anterior</p>
            <p className="mt-1 text-xs text-slate-500">Se analiza primero y no se escribe nada hasta confirmar la previsualización.</p>
            <button type="button" onClick={()=>inputRef.current?.click()} className="mt-4 min-h-11 rounded-xl bg-slate-900 px-4 text-xs font-bold text-white"><Upload size={15} className="mr-2 inline"/>Seleccionar archivo</button>
            <input ref={inputRef} type="file" accept=".csv,.json,text/csv,application/json" onChange={(e)=>read(e.target.files?.[0])} className="hidden"/>
            {filename && <div className="mt-3 text-xs font-semibold text-slate-500">{filename}</div>}
          </section>

          {preview && (
            <>
              <section className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl bg-slate-50 p-4"><div className="text-[10px] font-black uppercase text-slate-400">Familias detectadas</div><div className="mt-2 text-2xl font-black">{preview.families.length}</div></div>
                <div className="rounded-2xl bg-amber-50 p-4"><div className="text-[10px] font-black uppercase text-amber-600">Avisos</div><div className="mt-2 text-2xl font-black text-amber-800">{preview.warnings.length}</div></div>
                <div className="rounded-2xl bg-rose-50 p-4"><div className="text-[10px] font-black uppercase text-rose-600">Errores</div><div className="mt-2 text-2xl font-black text-rose-800">{preview.errors.length}</div></div>
              </section>

              {preview.errors.length > 0 && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4"><div className="mb-2 flex items-center gap-2 text-sm font-black text-rose-800"><AlertTriangle size={16}/>Corrija estos errores</div>{preview.errors.map((e,i)=><div key={i} className="text-xs leading-5 text-rose-700">{e}</div>)}</div>}
              {preview.warnings.length > 0 && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">{preview.warnings.slice(0,10).map((e,i)=><div key={i} className="text-xs leading-5 text-amber-800">{e}</div>)}</div>}

              <section className="overflow-hidden rounded-2xl border border-slate-200">
                <div className="grid grid-cols-[110px_1fr_80px_80px] bg-slate-50 px-3 py-2 text-[10px] font-black uppercase text-slate-400"><span>Socio</span><span>Familia</span><span>Adultos</span><span>Alumnos</span></div>
                {preview.families.slice(0,8).map((f)=><div key={f.id} className="grid grid-cols-[110px_1fr_80px_80px] border-t border-slate-100 px-3 py-2 text-xs"><span className="font-mono">{f.membershipNumber}</span><span className="font-bold">{f.familyName}</span><span>{f.guardians.length}</span><span>{f.students.length}</span></div>)}
                {preview.families.length>8 && <div className="border-t border-slate-100 p-3 text-center text-xs text-slate-400">… y {preview.families.length-8} familias más</div>}
              </section>

              <section className="rounded-2xl border border-slate-200 p-4">
                <div className="text-sm font-black">Modo de importación</div>
                <label className="mt-3 flex items-start gap-3"><input type="radio" checked={mode==='merge'} onChange={()=>setMode('merge')} className="mt-1"/><div><div className="text-xs font-bold">Fusionar con el censo actual</div><div className="text-[11px] text-slate-500">Actualiza coincidencias por nº de socio y añade las nuevas.</div></div></label>
                {canReplace && <label className="mt-3 flex items-start gap-3"><input type="radio" checked={mode==='replace'} onChange={()=>setMode('replace')} className="mt-1"/><div><div className="text-xs font-bold text-rose-700">Sustituir censo completo</div><div className="text-[11px] text-slate-500">Se crea automáticamente una copia previa antes de reemplazar los datos.</div></div></label>}
              </section>

              <label className="flex items-start gap-3 rounded-2xl bg-slate-50 p-4"><input type="checkbox" checked={confirmed} onChange={(e)=>setConfirmed(e.target.checked)} className="mt-1"/><span className="text-xs leading-5 text-slate-600">He revisado la previsualización y confirmo la importación de <strong>{preview.families.length} familias</strong>.</span></label>

              <div className="flex justify-end gap-2"><button onClick={onClose} className="min-h-11 px-4 text-xs font-bold text-slate-500">Cancelar</button><button disabled={busy||!confirmed||!!preview.errors.length||!preview.families.length} onClick={()=>void submit()} className="flex min-h-11 items-center gap-2 rounded-xl bg-rose-600 px-5 text-xs font-bold text-white disabled:opacity-40"><CheckCircle2 size={16}/>{busy?'Importando…':'Confirmar importación'}</button></div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

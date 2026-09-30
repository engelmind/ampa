import React, { useEffect, useState } from 'react';
import { Download, Mail, X } from 'lucide-react';
import { downloadPdfArtifact, PdfArtifact } from '../utils/pdfExportUtils';

interface Props {
  artifact: PdfArtifact;
  onClose: () => void;
  onEmail?: () => void;
  emailLabel?: string;
}

export function PdfPreviewModal({ artifact, onClose, onEmail, emailLabel = 'Enviar por email' }: Props) {
  const [url,setUrl]=useState('');

  useEffect(()=>{
    const objectUrl=URL.createObjectURL(artifact.blob);
    setUrl(objectUrl);
    return()=>URL.revokeObjectURL(objectUrl);
  },[artifact]);

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/70 sm:items-center sm:p-4">
      <div className="flex h-[96vh] w-full max-w-6xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:h-[92vh] sm:rounded-3xl">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 p-4">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-black">{artifact.title}</div>
            <div className="text-[11px] text-slate-500">{artifact.description || artifact.filename}</div>
          </div>
          {onEmail && <button type="button" onClick={onEmail} className="flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-bold"><Mail size={15}/>{emailLabel}</button>}
          <button type="button" onClick={()=>downloadPdfArtifact(artifact)} className="flex min-h-10 items-center gap-2 rounded-xl bg-rose-600 px-3 text-xs font-bold text-white"><Download size={15}/> Descargar PDF</button>
          <button type="button" onClick={onClose} className="rounded-xl p-2 hover:bg-slate-100" aria-label="Cerrar previsualización"><X size={19}/></button>
        </div>
        <div className="min-h-0 flex-1 bg-slate-100 p-2 sm:p-4">
          {url ? <iframe title={artifact.title} src={url} className="h-full w-full rounded-xl border border-slate-200 bg-white"/> : <div className="flex h-full items-center justify-center text-sm text-slate-400">Preparando previsualización…</div>}
        </div>
      </div>
    </div>
  );
}

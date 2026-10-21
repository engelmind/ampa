import React, { useEffect, useRef, useState } from 'react';
import { Download, Mail, Printer, X } from 'lucide-react';
import { downloadPdfArtifact, PdfArtifact } from '../utils/pdfExportUtils';

interface Props {
  artifact: PdfArtifact;
  onClose: () => void;
  onEmail?: () => void;
  emailLabel?: string;
}

export function PdfPreviewModal({ artifact, onClose, onEmail, emailLabel = 'Enviar por email' }: Props) {
  const [url, setUrl] = useState('');
  const frame = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!artifact.blob) { setUrl(''); return; }
    const objectUrl = URL.createObjectURL(artifact.blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [artifact]);

  const printOrDownload = () => {
    if (artifact.html) {
      const view = frame.current?.contentWindow;
      if (view) {
        view.focus();
        view.print();
      } else {
        downloadPdfArtifact(artifact);
      }
      return;
    }
    downloadPdfArtifact(artifact);
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/70 sm:items-center sm:p-4">
      <div className="flex h-[96vh] w-full max-w-6xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:h-[92vh] sm:rounded-3xl">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 p-4">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-black">{artifact.title}</div>
            <div className="text-[11px] text-slate-500">{artifact.description || artifact.filename}</div>
          </div>
          {onEmail && !artifact.html && <button type="button" onClick={onEmail} className="flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-bold"><Mail size={15}/>{emailLabel}</button>}
          <button type="button" onClick={printOrDownload} className="flex min-h-10 items-center gap-2 rounded-xl bg-rose-600 px-3 text-xs font-bold text-white">
            {artifact.html ? <Printer size={15}/> : <Download size={15}/>}
            {artifact.html ? 'Imprimir / Guardar PDF' : 'Descargar PDF'}
          </button>
          <button type="button" onClick={onClose} className="rounded-xl p-2 hover:bg-slate-100" aria-label="Cerrar previsualización"><X size={19}/></button>
        </div>
        {artifact.html && <div className="border-b border-slate-200 bg-amber-50 px-4 py-2 text-[11px] text-amber-900">
          Documento maquetado en HTML. En el diálogo de impresión, seleccione «Guardar como PDF», formato A4, escala 100 % y gráficos de fondo activados y encabezados/pies del navegador desactivados.
        </div>}
        <div className="min-h-0 flex-1 bg-slate-100 p-2 sm:p-4">
          {artifact.html ? (
            <iframe ref={frame} title={artifact.title} srcDoc={artifact.html} className="h-full w-full rounded-xl border border-slate-200 bg-white" />
          ) : url ? (
            <iframe title={artifact.title} src={url} className="h-full w-full rounded-xl border border-slate-200 bg-white" />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-slate-400">Preparando previsualización…</div>
          )}
        </div>
      </div>
    </div>
  );
}

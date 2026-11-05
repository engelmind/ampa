import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Download, FileCheck2, Mail, Printer, Share2, X } from 'lucide-react';
import { downloadPdfArtifact, downloadPdfBlob, PdfArtifact } from '../utils/pdfExportUtils';

interface Props {
  artifact: PdfArtifact;
  onClose: () => void;
  onEmail?: () => void;
  emailLabel?: string;
}

/** Previsualización HTML y archivo PDF real: permite guardar o compartir en iOS y Android. */
export function PdfPreviewModal({ artifact, onClose, onEmail, emailLabel = 'Enviar por email' }: Props) {
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(artifact.blob || null);
  const [url, setUrl] = useState('');
  const [generating, setGenerating] = useState(Boolean(artifact.html));
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const frame = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    let mounted = true;
    setPdfBlob(artifact.blob || null);
    setGenerating(Boolean(artifact.html));
    setError('');

    if (artifact.html) {
      const html = artifact.html;
      // La conversión se realiza localmente y sólo se carga el motor cuando
      // se solicita un informe. El botón Compartir queda listo antes del toque.
      void (async () => {
        try {
          const { renderHtmlReportPdf } = await import('../utils/htmlToPdfRenderer');
          if (controller.signal.aborted) return;
          const blob = await renderHtmlReportPdf(html, controller.signal);
          if (mounted) setPdfBlob(blob);
        } catch (failure: unknown) {
          if (!controller.signal.aborted && mounted) {
            setError(failure instanceof Error ? failure.message : 'No se pudo generar el PDF.');
          }
        } finally {
          if (mounted) setGenerating(false);
        }
      })();
    }

    return () => { mounted = false; controller.abort(); };
  }, [artifact, retry]);

  useEffect(() => {
    if (!pdfBlob) { setUrl(''); return; }
    const objectUrl = URL.createObjectURL(pdfBlob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [pdfBlob]);

  const shareable = useMemo(() => {
    if (!pdfBlob || typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') return false;
    try {
      const file = new File([pdfBlob], artifact.filename, { type: 'application/pdf' });
      return navigator.canShare({ files: [file] });
    } catch { return false; }
  }, [pdfBlob, artifact.filename]);

  const sharePdf = () => {
    if (!pdfBlob || !shareable) return;
    const file = new File([pdfBlob], artifact.filename, { type: 'application/pdf' });
    // Importante: ejecutar navigator.share() directamente desde el click.
    // Safari iOS rechaza peticiones lanzadas tras una conversión asíncrona.
    void navigator.share({ files: [file], title: artifact.title }).catch((failure: unknown) => {
      if (failure instanceof Error && failure.name === 'AbortError') return;
      setError('No se ha podido abrir el menú de compartir. Use Guardar PDF y comparta el archivo desde su dispositivo.');
    });
  };

  const savePdf = () => {
    if (!pdfBlob) return;
    downloadPdfBlob(pdfBlob, artifact.filename);
  };

  const printHtml = () => {
    if (artifact.html) {
      const view = frame.current?.contentWindow;
      if (view) { view.focus(); view.print(); }
      else downloadPdfArtifact(artifact);
      return;
    }
    if (pdfBlob) {
      const windowRef = window.open(url, '_blank');
      if (!windowRef) setError('El navegador ha bloqueado la ventana. Descargue el PDF para imprimirlo.');
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/70 sm:items-center sm:p-4">
      <div className="flex h-[96vh] w-full max-w-6xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:h-[92vh] sm:rounded-3xl">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 p-3 sm:gap-3 sm:p-4">
          <div className="min-w-0 flex-[1_1_170px]">
            <div className="truncate text-sm font-black">{artifact.title}</div>
            <div className="text-[11px] text-slate-500">{artifact.description || artifact.filename}</div>
          </div>
          {onEmail && !artifact.html && <button type="button" onClick={onEmail} className="flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-bold"><Mail size={15}/>{emailLabel}</button>}
          {shareable && <button type="button" onClick={sharePdf} className="flex min-h-10 items-center gap-2 rounded-xl bg-rose-600 px-3 text-xs font-bold text-white"><Share2 size={15}/> Compartir PDF</button>}
          <button type="button" onClick={savePdf} disabled={!pdfBlob || generating}
            className={'flex min-h-10 items-center gap-2 rounded-xl px-3 text-xs font-bold disabled:opacity-55 ' + (shareable ? 'border border-slate-200 bg-white text-slate-700' : 'bg-rose-600 text-white')}>
            <Download size={15}/>{generating ? 'Generando PDF…' : 'Guardar PDF'}
          </button>
          <button type="button" onClick={printHtml} className="flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-600"><Printer size={15}/> Imprimir</button>
          <button type="button" onClick={onClose} className="rounded-xl p-2 hover:bg-slate-100" aria-label="Cerrar previsualización"><X size={19}/></button>
        </div>

        {generating && <div role="status" className="flex items-center gap-2 border-b border-indigo-100 bg-indigo-50 px-4 py-2 text-[11px] font-semibold text-indigo-800">
          <FileCheck2 size={15}/> Preparando un PDF real en A4 vertical, listo para guardar o compartir…
        </div>}
        {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-2 border-b border-red-100 bg-red-50 px-4 py-2 text-[11px] text-red-800">
          <span>{error}</span>
          {artifact.html && <button type="button" onClick={() => setRetry(value => value + 1)} className="rounded-lg border border-red-200 px-2.5 py-1 font-bold">Reintentar</button>}
        </div>}
        {artifact.html && !generating && pdfBlob && <div className="border-b border-emerald-100 bg-emerald-50 px-4 py-1.5 text-[11px] font-semibold text-emerald-800">
          {shareable ? 'PDF generado. Pulse Compartir PDF para enviarlo por WhatsApp, correo o guardarlo en Archivos.' : 'PDF generado. Pulse Guardar PDF y comparta el archivo desde Archivos o Descargas.'} La vista inferior muestra la plantilla original.
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

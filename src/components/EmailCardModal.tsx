import React, { useEffect, useMemo, useState } from 'react';
import { Mail, Send, X } from 'lucide-react';
import { Family } from '../types/family';
import { PdfArtifact } from '../utils/pdfExportUtils';
import { backendApi } from '../services/backendApi';

interface Props {
  family: Family;
  artifact: PdfArtifact;
  academicYear: string;
  onClose: () => void;
  onSent: (recipient: string) => void;
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i=0;i<bytes.length;i+=chunk) {
    binary += String.fromCharCode(...bytes.subarray(i,i+chunk));
  }
  return btoa(binary);
}

export function EmailCardModal({ family, artifact, academicYear, onClose, onSent }: Props) {
  const recipients = useMemo(
    () => family.guardians.filter((g)=>g.email?.trim()),
    [family]
  );
  const defaultGuardian = recipients.find((g)=>g.isMainContact) || recipients[0];
  const [guardianId,setGuardianId]=useState(defaultGuardian?.id || '');
  const [subject,setSubject]=useState(`Carnet AMPA · Familia ${family.familyName} · ${academicYear}`);
  const [message,setMessage]=useState(
    `Hola,\n\nAdjuntamos el carnet de la familia ${family.familyName} correspondiente al curso ${academicYear}.\n\nUn saludo,\nAMPA Agustinos Granada`
  );
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [mailReady,setMailReady]=useState<boolean|null>(null);
  const [domainVerified,setDomainVerified]=useState<boolean|null>(null);
  const [sender,setSender]=useState('');

  useEffect(()=>{
    let alive=true;
    backendApi.emailStatus()
      .then((status)=>{if(alive){setMailReady(status.configured);setDomainVerified(status.domainVerified ?? null);setSender(status.fromEmail || '');}})
      .catch(()=>{if(alive)setMailReady(false);});
    return()=>{alive=false;};
  },[]);

  const send = async () => {
    if(!guardianId) return;
    setBusy(true); setError('');
    try {
      const pdfBase64=await blobToBase64(artifact.blob);
      const result=await backendApi.sendFamilyDocument({
        familyId:family.id,
        guardianId,
        subject,
        message,
        filename:artifact.filename,
        mimeType:'application/pdf',
        contentBase64:pdfBase64,
        documentType:'membership-card',
      });
      const guardian=recipients.find((g)=>g.id===guardianId);
      onSent(result.to || guardian?.email || '');
      onClose();
    } catch(e:any) {
      const code=e?.message || '';
      if(code==='EMAIL_NOT_CONFIGURED') setError('El servicio de correo del AMPA todavía no está configurado en el servidor.');
      else if(code==='GUARDIAN_EMAIL_NOT_FOUND') setError('Ese tutor no tiene un correo válido registrado.');
      else setError('No se pudo enviar el carnet. Inténtelo de nuevo.');
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-950/65 sm:items-center sm:p-4">
      <div className="w-full max-w-xl rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
        <div className="flex items-center justify-between border-b border-slate-100 p-5">
          <div><div className="text-[10px] font-black uppercase tracking-wider text-slate-400">Enviar carnet</div><h2 className="text-lg font-black">Familia {family.familyName}</h2></div>
          <button onClick={onClose} className="rounded-xl p-2 hover:bg-slate-100"><X size={19}/></button>
        </div>
        <div className="space-y-4 p-5">
          {mailReady===false && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><strong>{domainVerified===false ? 'Dominio de correo pendiente de verificar.' : 'Correo pendiente de configurar.'}</strong><div className="mt-1 text-xs leading-5">{domainVerified===false ? 'El remitente ya está configurado, pero Resend necesita verificar los registros DNS de agustinosgranada.es antes de permitir envíos.' : 'El carnet puede previsualizarse y descargarse, pero el envío directo se activará cuando quede conectado el proveedor de correo del AMPA.'}</div></div>}
          {!recipients.length ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">No hay ningún padre, madre o tutor con email registrado en esta familia.</div>
          ) : (
            <>
              <label className="block space-y-1.5"><span className="text-xs font-bold text-slate-600">Destinatario</span>
                <select value={guardianId} onChange={(e)=>setGuardianId(e.target.value)} className="min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm">
                  {recipients.map((g)=><option key={g.id} value={g.id}>{g.fullName} · {g.email}{g.isMainContact?' · principal':''}</option>)}
                </select>
              </label>
              <label className="block space-y-1.5"><span className="text-xs font-bold text-slate-600">Asunto</span><input value={subject} onChange={(e)=>setSubject(e.target.value)} className="min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm"/></label>
              <label className="block space-y-1.5"><span className="text-xs font-bold text-slate-600">Mensaje</span><textarea rows={6} value={message} onChange={(e)=>setMessage(e.target.value)} className="w-full rounded-xl border border-slate-200 p-3 text-sm leading-6"/></label>
              <div className="flex items-center gap-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-500"><Mail size={15}/><span className="truncate">{artifact.filename}</span><span className="ml-auto shrink-0">{Math.max(1,Math.round(artifact.blob.size/1024))} KB</span></div>
              {mailReady && sender && <div className="text-[11px] text-slate-400">Remitente: {sender}</div>}
              {error&&<div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700">{error}</div>}
            </>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 p-4">
          <button onClick={onClose} className="min-h-11 px-4 text-xs font-bold text-slate-500">Cancelar</button>
          <button disabled={busy||!guardianId||!recipients.length||mailReady!==true} onClick={()=>void send()} className="flex min-h-11 items-center gap-2 rounded-xl bg-rose-600 px-5 text-xs font-bold text-white disabled:opacity-40"><Send size={15}/>{busy?'Enviando…':'Enviar carnet'}</button>
        </div>
      </div>
    </div>
  );
}

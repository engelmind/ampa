import React, { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays, CheckCircle2, Clock3, Mail, ShieldCheck, TicketCheck,
  UserRound, Users, XCircle, ArrowLeft, LoaderCircle
} from 'lucide-react';
import { backendApi } from '../services/backendApi';
import { AmpaLogo } from './AmpaLogo';

type PublicEvent = {
  title:string;
  eventDate:string;
  academicYear:string;
  description:string;
  imageDataUrl?:string;
  registrationEnabled:boolean;
  registrationDeadline?:string|null;
  registrationCapacity?:number|null;
  maxAttendeesPerFamily:number;
  registrationMessage?:string;
  isOpen:boolean;
  confirmedFamilies:number;
  confirmedParticipants:number;
  waitlistFamilies:number;
  remainingSeats:number|null;
};

type Member = {
  personType:'guardian'|'student';
  personId:string;
  name:string;
  detail:string;
};

type Registration = null | {
  id:string;
  status:'confirmed'|'waitlist'|'cancelled';
  updatedAt:string;
  attendees:Array<{personType:'guardian'|'student';personId:string;participantName:string}>;
};

const dateLabel=(iso:string)=>{
  const d=new Date(iso+'T12:00:00');
  return Number.isNaN(d.getTime())?iso:d.toLocaleDateString('es-ES',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
};

const deadlineLabel=(value?:string|null)=>{
  if(!value) return null;
  const d=new Date(value);
  return Number.isNaN(d.getTime())?null:d.toLocaleString('es-ES',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
};

const errorText=(error:any)=>{
  const code=error?.message||'';
  const map:Record<string,string>={
    EVENT_NOT_FOUND:'No se ha encontrado esta actividad.',
    REGISTRATION_DISABLED:'Las inscripciones de esta actividad no están habilitadas.',
    REGISTRATION_CLOSED:'El plazo de inscripción está cerrado.',
    MEMBERSHIP_NOT_VERIFIED:'No hemos podido verificar ese número de socio con ese correo electrónico.',
    MEMBERSHIP_INACTIVE:'La familia figura como inactiva en el curso actual. Contacte con el AMPA si cree que se trata de un error.',
    TOO_MANY_CODES:'Se han realizado demasiados intentos. Espere unos minutos antes de volver a intentarlo.',
    EMAIL_PROVIDER_FAILED:'No se ha podido enviar el código de verificación. Inténtelo de nuevo más tarde.',
    INVALID_CODE:'El código no es correcto.',
    CODE_EXPIRED:'El código ha caducado. Solicite uno nuevo.',
    VERIFICATION_EXPIRED:'La verificación ha caducado. Identifíquese de nuevo.',
    NO_ATTENDEES:'Seleccione al menos una persona.',
    FAMILY_LIMIT_EXCEEDED:'Ha superado el máximo de personas permitido por familia.',
    INVALID_ATTENDEE:'Alguna de las personas seleccionadas ya no coincide con la ficha familiar.',
    REGISTRATION_NOT_FOUND:'No existe una inscripción que cancelar.',
  };
  return map[code]||'No se ha podido completar la operación. Inténtelo de nuevo.';
};

export function PublicEventRegistration({token}:{token:string}){
  const [event,setEvent]=useState<PublicEvent|null>(null);
  const [loading,setLoading]=useState(true);
  const [fatal,setFatal]=useState('');
  const [membershipNumber,setMembershipNumber]=useState('');
  const [email,setEmail]=useState('');
  const [challengeId,setChallengeId]=useState('');
  const [code,setCode]=useState('');
  const [verificationToken,setVerificationToken]=useState('');
  const [family,setFamily]=useState<{familyName:string;membershipNumber:string;members:Member[]}|null>(null);
  const [registration,setRegistration]=useState<Registration>(null);
  const [selected,setSelected]=useState<Set<string>>(new Set());
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [result,setResult]=useState<{status:'confirmed'|'waitlist';waitlistPosition:number|null}|null>(null);

  const storageKey=`ampa-event-registration-${token}`;
  const keyOf=(m:{personType:string;personId:string})=>`${m.personType}:${m.personId}`;

  const refreshEvent=async()=>{
    const response=await backendApi.getPublicEvent(token);
    setEvent(response.event);
  };

  const loadSession=async(sessionToken:string)=>{
    const response=await backendApi.getPublicEventSession(token,sessionToken);
    setVerificationToken(sessionToken);
    setFamily(response.family);
    setRegistration(response.registration);
    setResult(null);
    const initial=new Set<string>();
    if(response.registration && response.registration.status!=='cancelled'){
      response.registration.attendees.forEach((item)=>initial.add(keyOf(item)));
    }
    setSelected(initial);
    sessionStorage.setItem(storageKey,sessionToken);
  };

  useEffect(()=>{
    let cancelled=false;
    (async()=>{
      try{
        await refreshEvent();
        const saved=sessionStorage.getItem(storageKey);
        if(saved){
          try{ await loadSession(saved); }
          catch{ sessionStorage.removeItem(storageKey); }
        }
      }catch(error:any){
        if(!cancelled) setFatal(errorText(error));
      }finally{
        if(!cancelled) setLoading(false);
      }
    })();
    return()=>{cancelled=true;};
  },[token]);

  const selectedMembers=useMemo(
    ()=>family?.members.filter((member)=>selected.has(keyOf(member)))||[],
    [family,selected]
  );

  const requestCode=async()=>{
    setMessage('');
    setBusy(true);
    try{
      const response=await backendApi.requestPublicEventCode(token,membershipNumber,email);
      if(response.mode==='direct' && response.verificationToken){
        await loadSession(response.verificationToken);
        setMessage('Familia verificada correctamente.');
      }else if(response.challengeId){
        setChallengeId(response.challengeId);
        setMessage('Hemos enviado un código de 6 cifras al correo registrado.');
      }
    }catch(error:any){
      setMessage(errorText(error));
    }finally{
      setBusy(false);
    }
  };

  const verifyCode=async()=>{
    setMessage('');
    setBusy(true);
    try{
      const response=await backendApi.verifyPublicEventCode(token,challengeId,code);
      await loadSession(response.verificationToken);
      setMessage('Familia verificada correctamente.');
    }catch(error:any){
      setMessage(errorText(error));
    }finally{
      setBusy(false);
    }
  };

  const saveRegistration=async()=>{
    if(!verificationToken || !selectedMembers.length) return;
    setMessage('');
    setBusy(true);
    try{
      const response=await backendApi.savePublicEventRegistration(
        token,
        verificationToken,
        selectedMembers.map((member)=>({personType:member.personType,personId:member.personId}))
      );
      setResult({status:response.status,waitlistPosition:response.waitlistPosition});
      await refreshEvent();
      await loadSession(verificationToken);
      setResult({status:response.status,waitlistPosition:response.waitlistPosition});
      window.scrollTo({top:0,behavior:'smooth'});
    }catch(error:any){
      setMessage(errorText(error));
    }finally{
      setBusy(false);
    }
  };

  const cancelRegistration=async()=>{
    if(!verificationToken || !registration || registration.status==='cancelled') return;
    if(!window.confirm('¿Cancelar la inscripción de toda la familia en esta actividad?')) return;
    setBusy(true);
    setMessage('');
    try{
      await backendApi.cancelPublicEventRegistration(token,verificationToken);
      await refreshEvent();
      await loadSession(verificationToken);
      setMessage('La inscripción ha quedado cancelada.');
    }catch(error:any){
      setMessage(errorText(error));
    }finally{
      setBusy(false);
    }
  };

  const forgetSession=()=>{
    sessionStorage.removeItem(storageKey);
    setVerificationToken('');
    setFamily(null);
    setRegistration(null);
    setChallengeId('');
    setCode('');
    setSelected(new Set());
    setResult(null);
    setMessage('');
  };

  if(loading){
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><LoaderCircle className="animate-spin text-indigo-500" size={28}/></div>;
  }

  if(fatal || !event){
    return <div className="min-h-screen bg-slate-950 p-6 flex items-center justify-center">
      <div className="w-full max-w-md rounded-[30px] bg-white p-7 text-center shadow-2xl">
        <AmpaLogo className="mx-auto h-16 w-auto"/>
        <XCircle className="mx-auto mt-6 text-rose-500" size={34}/>
        <h1 className="mt-3 text-xl font-black text-slate-950">No podemos abrir esta inscripción</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">{fatal||'Actividad no disponible.'}</p>
      </div>
    </div>;
  }

  const deadline=deadlineLabel(event.registrationDeadline);
  const existingActive=registration && registration.status!=='cancelled';

  return <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#eef2ff_0,transparent_34%),linear-gradient(180deg,#f8fafc,#eef2f7)] text-slate-900">
    <header className="border-b border-white/80 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4 sm:px-6">
        <AmpaLogo className="h-12 w-auto sm:h-14"/>
        <span className="rounded-full bg-indigo-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-indigo-700">Inscripción AMPA</span>
      </div>
    </header>

    <main className="mx-auto max-w-4xl space-y-5 px-4 py-5 sm:px-6 sm:py-8">
      <section className="overflow-hidden rounded-[32px] border border-white bg-white shadow-[0_20px_60px_rgba(71,85,105,.12)]">
        {event.imageDataUrl&&<div className="h-48 sm:h-64"><img src={event.imageDataUrl} alt="" className="h-full w-full object-cover"/></div>}
        <div className="p-5 sm:p-7">
          <div className="flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-[.16em] text-indigo-600">
            <span>{event.academicYear}</span>
            <span className="h-1 w-1 rounded-full bg-slate-300"/>
            <span>{dateLabel(event.eventDate)}</span>
          </div>
          <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">{event.title}</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">{event.description||'Actividad organizada por AMPA Agustinos Granada.'}</p>
          {event.registrationMessage&&<div className="mt-4 rounded-2xl bg-indigo-50 p-4 text-xs leading-5 text-indigo-900">{event.registrationMessage}</div>}

          <div className="mt-5 grid gap-2 sm:grid-cols-3">
            <div className="rounded-2xl bg-slate-50 p-3"><Users size={15} className="text-indigo-500"/><div className="mt-2 text-lg font-black">{event.confirmedParticipants}</div><div className="text-[10px] font-bold text-slate-400">Personas confirmadas</div></div>
            <div className="rounded-2xl bg-slate-50 p-3"><TicketCheck size={15} className="text-indigo-500"/><div className="mt-2 text-lg font-black">{event.registrationCapacity??'∞'}</div><div className="text-[10px] font-bold text-slate-400">Aforo configurado</div></div>
            <div className="rounded-2xl bg-slate-50 p-3"><Clock3 size={15} className="text-indigo-500"/><div className="mt-2 text-lg font-black">{event.remainingSeats==null?'—':event.remainingSeats}</div><div className="text-[10px] font-bold text-slate-400">Plazas libres</div></div>
          </div>

          <div className={`mt-4 flex items-start gap-3 rounded-2xl p-4 ${event.isOpen?'bg-emerald-50 text-emerald-800':'bg-amber-50 text-amber-900'}`}>
            {event.isOpen?<CheckCircle2 size={18} className="mt-0.5 shrink-0"/>:<Clock3 size={18} className="mt-0.5 shrink-0"/>}
            <div className="text-xs leading-5">
              <strong>{event.isOpen?'Inscripciones abiertas':'Inscripciones cerradas'}</strong>
              {deadline&&<span className="block opacity-75">Plazo: {deadline}</span>}
              {!event.isOpen&&<span className="block opacity-75">Si ya se inscribió, puede identificarse para consultar o cancelar su inscripción.</span>}
            </div>
          </div>
        </div>
      </section>

      {result&&<section className={`rounded-[28px] border p-5 shadow-sm ${result.status==='confirmed'?'border-emerald-200 bg-emerald-50':'border-amber-200 bg-amber-50'}`}>
        <div className="flex items-start gap-3">
          {result.status==='confirmed'?<CheckCircle2 className="mt-0.5 text-emerald-600" size={24}/>:<Clock3 className="mt-0.5 text-amber-600" size={24}/>}
          <div>
            <h2 className="text-lg font-black">{result.status==='confirmed'?'Inscripción confirmada':'Inscripción en lista de espera'}</h2>
            <p className="mt-1 text-xs leading-5 opacity-80">{result.status==='confirmed'
              ?'La familia queda inscrita con las personas seleccionadas.'
              :`Ahora mismo no hay plazas suficientes para toda la familia. Posición aproximada en la lista: ${result.waitlistPosition||'—'}.`}</p>
          </div>
        </div>
      </section>}

      {!family ? (
        <section className="rounded-[30px] border border-white bg-white p-5 shadow-[0_16px_45px_rgba(71,85,105,.09)] sm:p-7">
          {!challengeId ? <>
            <div className="flex items-start gap-3">
              <div className="rounded-2xl bg-indigo-50 p-3 text-indigo-600"><ShieldCheck size={22}/></div>
              <div><h2 className="text-lg font-black">Verificar familia socia</h2><p className="mt-1 text-xs leading-5 text-slate-500">Introduzca el número de socio y el correo de un padre, madre o tutor que figure en la ficha de la familia.</p></div>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <label className="space-y-1.5"><span className="text-[11px] font-bold text-slate-500">Número de socio</span><input value={membershipNumber} onChange={e=>setMembershipNumber(e.target.value)} inputMode="numeric" autoComplete="off" placeholder="Ej. 128" className="min-h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none focus:border-indigo-300 focus:bg-white focus:ring-4 focus:ring-indigo-50"/></label>
              <label className="space-y-1.5"><span className="text-[11px] font-bold text-slate-500">Correo registrado</span><div className="relative"><Mail size={16} className="absolute left-4 top-4 text-slate-400"/><input type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" placeholder="familia@correo.es" className="min-h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm outline-none focus:border-indigo-300 focus:bg-white focus:ring-4 focus:ring-indigo-50"/></div></label>
            </div>
            {message&&<p className="mt-3 text-xs font-semibold text-slate-600">{message}</p>}
            <button type="button" disabled={busy||!membershipNumber.trim()||!email.trim()} onClick={()=>void requestCode()} className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 text-sm font-black text-white disabled:opacity-40"><ShieldCheck size={17}/>{busy?'Verificando…':'Continuar'}</button>
          </> : <>
            <button type="button" onClick={()=>{setChallengeId('');setCode('');setMessage('');}} className="flex items-center gap-2 text-xs font-bold text-slate-500"><ArrowLeft size={14}/> Cambiar datos</button>
            <div className="mt-4 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600"><Mail size={22}/></div>
              <h2 className="mt-3 text-lg font-black">Código de verificación</h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">Introduzca el código de 6 cifras enviado al correo registrado.</p>
              <input value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,'').slice(0,6))} inputMode="numeric" autoComplete="one-time-code" placeholder="000000" className="mx-auto mt-5 block min-h-14 w-48 rounded-2xl border border-slate-200 bg-slate-50 text-center text-2xl font-black tracking-[.3em] outline-none focus:border-indigo-300 focus:bg-white"/>
              {message&&<p className="mt-3 text-xs font-semibold text-slate-600">{message}</p>}
              <button type="button" disabled={busy||code.length!==6} onClick={()=>void verifyCode()} className="mt-5 min-h-12 w-full rounded-2xl bg-slate-950 px-5 text-sm font-black text-white disabled:opacity-40">{busy?'Comprobando…':'Verificar código'}</button>
            </div>
          </>}
        </section>
      ) : (
        <section className="rounded-[30px] border border-white bg-white p-5 shadow-[0_16px_45px_rgba(71,85,105,.09)] sm:p-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[.16em] text-indigo-500">Familia verificada</div>
              <h2 className="mt-1 text-xl font-black">Familia {family.familyName}</h2>
              <p className="mt-1 text-xs text-slate-500">Socio nº {family.membershipNumber}</p>
            </div>
            <button type="button" onClick={forgetSession} className="text-xs font-bold text-slate-400 hover:text-slate-700">Usar otra familia</button>
          </div>

          {existingActive&&<div className={`mt-4 rounded-2xl p-4 text-xs font-semibold ${registration?.status==='confirmed'?'bg-emerald-50 text-emerald-800':'bg-amber-50 text-amber-900'}`}>
            Inscripción actual: <strong>{registration?.status==='confirmed'?'Confirmada':'Lista de espera'}</strong> · {registration?.attendees.length||0} persona(s).
          </div>}
          {registration?.status==='cancelled'&&<div className="mt-4 rounded-2xl bg-slate-100 p-4 text-xs font-semibold text-slate-600">La inscripción anterior está cancelada.</div>}

          <div className="mt-5">
            <div className="flex items-end justify-between gap-3">
              <div><h3 className="text-sm font-black">¿Quiénes asistirán?</h3><p className="mt-1 text-[11px] text-slate-500">Seleccione hasta {event.maxAttendeesPerFamily} personas de la familia.</p></div>
              <span className="text-xs font-black text-indigo-600">{selected.size}/{event.maxAttendeesPerFamily}</span>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {family.members.map((member)=>{
                const key=keyOf(member);
                const checked=selected.has(key);
                const disabled=!checked && selected.size>=event.maxAttendeesPerFamily;
                return <label key={key} className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-3 transition ${checked?'border-indigo-200 bg-indigo-50/70':'border-slate-100 bg-slate-50'} ${disabled?'opacity-45':''}`}>
                  <input type="checkbox" checked={checked} disabled={disabled||!event.isOpen} onChange={()=>{
                    setSelected(prev=>{const next=new Set(prev); if(next.has(key)) next.delete(key); else next.add(key); return next;});
                  }} className="h-4 w-4 rounded border-slate-300"/>
                  <div className="min-w-0"><div className="truncate text-xs font-black text-slate-800">{member.name}</div><div className="mt-0.5 text-[10px] text-slate-400">{member.detail}</div></div>
                </label>;
              })}
            </div>
          </div>

          {message&&<p className="mt-4 text-xs font-semibold text-slate-600">{message}</p>}

          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {existingActive&&<button type="button" disabled={busy} onClick={()=>void cancelRegistration()} className="min-h-12 rounded-2xl border border-rose-200 bg-white px-5 text-xs font-black text-rose-600 disabled:opacity-40">Cancelar inscripción</button>}
            {event.isOpen&&<button type="button" disabled={busy||!selected.size} onClick={()=>void saveRegistration()} className="min-h-12 rounded-2xl bg-slate-950 px-6 text-xs font-black text-white disabled:opacity-40">{busy?'Guardando…':existingActive?'Actualizar inscripción':'Confirmar inscripción'}</button>}
          </div>
        </section>
      )}

      <footer className="pb-8 text-center text-[10px] leading-5 text-slate-400">
        AMPA Agustinos Granada · Los datos se utilizan únicamente para gestionar esta actividad y se contrastan con la ficha de socio.
      </footer>
    </main>
  </div>;
}

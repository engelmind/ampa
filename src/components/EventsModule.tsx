import React, { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays, ChevronLeft, FileDown, ImagePlus, Pencil, Plus, Save, Search, Trash2,
  UserRound, Users, Baby, X, BarChart3, Percent, Table2, Rows3, LayoutGrid, Link2, Copy, ExternalLink, ClipboardCheck
} from 'lucide-react';
import { backendApi } from '../services/backendApi';
import { EventDetail, EventSummary, Family, SystemSettings } from '../types/family';
import { createEventParticipantsPdfArtifact, downloadPdfArtifact } from '../utils/pdfExportUtils';

interface Props {
  families: Family[];
  events: EventSummary[];
  totals: { activeFamilies: number; censusPeople: number };
  settings: SystemSettings;
  canEdit: boolean;
  canDelete: boolean;
  onReload: () => Promise<void>;
  onNotify: (type:'success'|'error'|'info',title:string,message?:string)=>void;
}

type EventDraft = Pick<EventDetail,'title'|'eventDate'|'academicYear'|'description'|'imageDataUrl'|'registrationEnabled'|'registrationDeadline'|'registrationCapacity'|'maxAttendeesPerFamily'|'registrationMessage'> & { id?: string };
type EventViewMode = 'table' | 'list' | 'cards';

const emptyDraft = (academicYear:string):EventDraft => ({
  title:'',
  eventDate:new Date().toISOString().slice(0,10),
  academicYear,
  description:'',
  imageDataUrl:'',
  registrationEnabled:false,
  registrationDeadline:null,
  registrationCapacity:null,
  maxAttendeesPerFamily:8,
  registrationMessage:'',
});

const toLocalDateTimeInput=(value?:string|null)=>{
  if(!value) return '';
  const d=new Date(value);
  if(Number.isNaN(d.getTime())) return '';
  const pad=(n:number)=>String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const dateLabel = (iso:string) => {
  if (!iso) return 'Sin fecha';
  const d=new Date(iso+'T12:00:00');
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('es-ES',{day:'2-digit',month:'short',year:'numeric'});
};

const personKey=(type:'guardian'|'student',id:string)=>`${type}:${id}`;
const familyMemberKeys=(family:Family)=>new Set([
  ...family.guardians.map((guardian)=>personKey('guardian',guardian.id)),
  ...family.students.map((student)=>personKey('student',student.id)),
]);

async function imageToDataUrl(file:File){
  if (!file.type.startsWith('image/')) throw new Error('Seleccione un archivo de imagen.');
  if (file.size > 8_000_000) throw new Error('La imagen original no puede superar 8 MB.');
  const source=await new Promise<string>((resolve,reject)=>{
    const reader=new FileReader();
    reader.onerror=()=>reject(new Error('No se pudo leer la imagen.'));
    reader.onload=()=>resolve(String(reader.result||''));
    reader.readAsDataURL(file);
  });
  const img=await new Promise<HTMLImageElement>((resolve,reject)=>{
    const node=new Image();
    node.onload=()=>resolve(node);
    node.onerror=()=>reject(new Error('La imagen no es válida.'));
    node.src=source;
  });
  const max=900;
  const scale=Math.min(1,max/Math.max(img.width,img.height));
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(img.width*scale));
  canvas.height=Math.max(1,Math.round(img.height*scale));
  const ctx=canvas.getContext('2d');
  if(!ctx) throw new Error('No se pudo procesar la imagen.');
  ctx.drawImage(img,0,0,canvas.width,canvas.height);
  return canvas.toDataURL('image/jpeg',0.78);
}

export function EventsModule({families,events,totals,settings,canEdit,canDelete,onReload,onNotify}:Props){
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const [detail,setDetail]=useState<EventDetail|null>(null);
  const [loadingDetail,setLoadingDetail]=useState(false);
  const [draft,setDraft]=useState<EventDraft|null>(null);
  const [savingEvent,setSavingEvent]=useState(false);
  const [savingAttendance,setSavingAttendance]=useState(false);
  const [selectedFamilies,setSelectedFamilies]=useState<Set<string>>(new Set());
  const [selectedPeople,setSelectedPeople]=useState<Record<string,Set<string>>>({});
  const [familyQuery,setFamilyQuery]=useState('');
  const [onlySelected,setOnlySelected]=useState(false);
  const [editingAttendance,setEditingAttendance]=useState(false);
  const [eventQuery,setEventQuery]=useState('');
  const [academicYearFilter,setAcademicYearFilter]=useState('all');
  const [eventView,setEventView]=useState<EventViewMode>('cards');

  const academicYears=useMemo(()=>Array.from(new Set([
    settings.activeAcademicYear,
    ...events.map((event)=>event.academicYear).filter(Boolean),
  ])).sort((a,b)=>b.localeCompare(a)),[events,settings.activeAcademicYear]);

  const visibleEvents=useMemo(()=>{
    const q=eventQuery.trim().toLocaleLowerCase('es');
    return [...events]
      .filter((event)=>academicYearFilter==='all' || event.academicYear===academicYearFilter)
      .filter((event)=>!q || event.title.toLocaleLowerCase('es').includes(q))
      .sort((a,b)=>b.eventDate.localeCompare(a.eventDate) || a.title.localeCompare(b.title,'es'));
  },[events,eventQuery,academicYearFilter]);

  const filteredFamilies=useMemo(()=>{
    const q=familyQuery.trim().toLowerCase();
    return families.filter((family)=>{
      if(onlySelected && !selectedFamilies.has(family.id)) return false;
      if(!q) return true;
      const people=[
        ...family.guardians.map(g=>g.fullName),
        ...family.students.map(s=>`${s.firstName} ${s.lastName}`)
      ].join(' ').toLowerCase();
      return `${family.membershipNumber} ${family.familyName} ${people}`.toLowerCase().includes(q);
    });
  },[families,familyQuery,onlySelected,selectedFamilies]);

  const loadDetail=async(id:string)=>{
    setLoadingDetail(true);
    try{
      const response=await backendApi.getEvent(id);
      setDetail(response.event);
      setSelectedId(id);
      setSelectedFamilies(new Set(response.event.familyIds));
      setEditingAttendance(response.event.familyIds.length === 0);
      setFamilyQuery('');
      setOnlySelected(false);
      const people:Record<string,Set<string>>={};
      for(const attendee of response.event.attendees){
        if(!people[attendee.familyId]) people[attendee.familyId]=new Set();
        people[attendee.familyId].add(personKey(attendee.personType,attendee.personId));
      }
      setSelectedPeople(people);
    }catch(error:any){
      onNotify('error','No se pudo abrir el evento',error?.message);
    }finally{
      setLoadingDetail(false);
    }
  };

  useEffect(()=>{
    if(selectedId && !events.some(event=>event.id===selectedId)){
      setSelectedId(null);
      setDetail(null);
    }
  },[events,selectedId]);

  const toggleFamily=(familyId:string)=>{
    const family=families.find((item)=>item.id===familyId);
    if(!family) return;
    const alreadySelected=selectedFamilies.has(familyId);
    if(alreadySelected){
      setSelectedFamilies(prev=>{
        const next=new Set(prev);
        next.delete(familyId);
        return next;
      });
      setSelectedPeople(current=>{
        const clone={...current};
        delete clone[familyId];
        return clone;
      });
      return;
    }
    setSelectedFamilies(prev=>new Set(prev).add(familyId));
    setSelectedPeople(current=>({...current,[familyId]:familyMemberKeys(family)}));
  };

  const togglePerson=(familyId:string,key:string)=>{
    setSelectedPeople(prev=>{
      const next={...prev};
      const set=new Set(next[familyId]||[]);
      if(set.has(key)) set.delete(key); else set.add(key);
      if(set.size===0){
        delete next[familyId];
        setSelectedFamilies(current=>{
          const familiesNext=new Set(current);
          familiesNext.delete(familyId);
          return familiesNext;
        });
      }else{
        next[familyId]=set;
        setSelectedFamilies(current=>new Set(current).add(familyId));
      }
      return next;
    });
  };

  const selectedParticipantCount=useMemo(
    ()=>Object.values(selectedPeople).reduce((total,set)=>total+set.size,0),
    [selectedPeople]
  );

  const saveAttendance=async()=>{
    if(!detail) return;
    setSavingAttendance(true);
    try{
      const payload=Array.from(selectedFamilies).map(familyId=>{
        const family=families.find(f=>f.id===familyId);
        const keys=selectedPeople[familyId]||new Set<string>();
        const attendees:Array<{personType:'guardian'|'student';personId:string;participantName:string}>=[];
        for(const guardian of family?.guardians||[]){
          if(keys.has(personKey('guardian',guardian.id))){
            attendees.push({personType:'guardian',personId:guardian.id,participantName:guardian.fullName});
          }
        }
        for(const student of family?.students||[]){
          if(keys.has(personKey('student',student.id))){
            attendees.push({personType:'student',personId:student.id,participantName:`${student.firstName} ${student.lastName}`.trim()});
          }
        }
        return {familyId,attendees};
      });
      const result=await backendApi.saveEventAttendance(detail.id,payload);
      await onReload();
      await loadDetail(detail.id);
      onNotify('success','Participación guardada',`${result.families} familias · ${result.participants} participantes.`);
    }catch(error:any){
      onNotify('error','No se pudo guardar la participación',error?.message);
    }finally{
      setSavingAttendance(false);
    }
  };

  const saveEvent=async()=>{
    if(!draft?.title.trim() || !draft.eventDate || !draft.academicYear.trim()){
      onNotify('error','Faltan datos','Indique el título, la fecha y el curso escolar.');
      return;
    }
    setSavingEvent(true);
    try{
      const payload={...draft,registrationDeadline:draft.registrationDeadline ? new Date(draft.registrationDeadline).toISOString() : null};
      if(draft.id) await backendApi.updateEvent({id:draft.id,...payload});
      else await backendApi.createEvent(payload);
      setDraft(null);
      await onReload();
      onNotify('success',draft.id?'Evento actualizado':'Evento creado');
    }catch(error:any){
      onNotify('error','No se pudo guardar el evento',error?.message);
    }finally{
      setSavingEvent(false);
    }
  };

  const removeEvent=async()=>{
    if(!detail || !canDelete) return;
    if(!window.confirm(`¿Eliminar definitivamente el evento “${detail.title}” y su registro de participación?`)) return;
    try{
      await backendApi.deleteEvent(detail.id);
      setSelectedId(null); setDetail(null);
      await onReload();
      onNotify('success','Evento eliminado');
    }catch(error:any){
      onNotify('error','No se pudo eliminar el evento',error?.message);
    }
  };

  const downloadParticipantsPdf=()=>{
    if(!detail || !detail.attendees.length){
      onNotify('info','Sin participantes','Guarde al menos un participante antes de generar la lista.');
      return;
    }
    downloadPdfArtifact(createEventParticipantsPdfArtifact(detail,families,settings));
  };

  const copyRegistrationLink=async()=>{
    if(!detail?.registrationToken) return;
    const url=`${window.location.origin}/inscripcion/${detail.registrationToken}`;
    try{
      await navigator.clipboard.writeText(url);
      onNotify('success','Enlace copiado','Ya puede compartir el formulario de inscripción.');
    }catch{
      onNotify('info','Enlace de inscripción',url);
    }
  };

  const loadConfirmedRegistrationsAsAttendance=async()=>{
    if(!detail || !canEdit) return;
    const confirmed=detail.registrations.filter((registration)=>registration.status==='confirmed');
    if(!confirmed.length){
      onNotify('info','Sin inscripciones confirmadas','Todavía no hay familias confirmadas que cargar.');
      return;
    }
    const participantTotal=confirmed.reduce((total,registration)=>total+registration.attendees.length,0);
    const warning=detail.attendees.length
      ? `Esto sustituirá la participación guardada actualmente por ${confirmed.length} familias y ${participantTotal} personas inscritas y confirmadas. ¿Continuar?`
      : `Se cargarán como participación ${confirmed.length} familias y ${participantTotal} personas confirmadas. ¿Continuar?`;
    if(!window.confirm(warning)) return;
    setSavingAttendance(true);
    try{
      const payload=confirmed.map((registration)=>({
        familyId:registration.familyId,
        attendees:registration.attendees.map((attendee)=>({
          personType:attendee.personType,
          personId:attendee.personId,
          participantName:attendee.participantName,
        }))
      }));
      const result=await backendApi.saveEventAttendance(detail.id,payload);
      await onReload();
      await loadDetail(detail.id);
      setEditingAttendance(false);
      onNotify('success','Inscritos cargados como participación',`${result.families} familias · ${result.participants} personas.`);
    }catch(error:any){
      onNotify('error','No se pudieron cargar las inscripciones',error?.message);
    }finally{
      setSavingAttendance(false);
    }
  };

  const acceptImage=async(file?:File)=>{
    if(!file || !draft) return;
    try{
      const imageDataUrl=await imageToDataUrl(file);
      setDraft({...draft,imageDataUrl});
    }catch(error:any){
      onNotify('error','No se pudo añadir la imagen',error?.message);
    }
  };

  if(detail){
    const summary=events.find(e=>e.id===detail.id);
    const familyRate=totals.activeFamilies ? Math.round((selectedFamilies.size/totals.activeFamilies)*1000)/10 : 0;
    const censusRate=totals.censusPeople ? Math.round((selectedParticipantCount/totals.censusPeople)*1000)/10 : 0;
    const confirmedRegistrations=detail.registrations.filter((registration)=>registration.status==='confirmed');
    const waitlistRegistrations=detail.registrations.filter((registration)=>registration.status==='waitlist');
    const cancelledRegistrations=detail.registrations.filter((registration)=>registration.status==='cancelled');
    const registeredParticipants=confirmedRegistrations.reduce((total,registration)=>total+registration.attendees.length,0);
    const registrationLink=`${window.location.origin}/inscripcion/${detail.registrationToken}`;
    const deadlineTime=detail.registrationDeadline ? new Date(detail.registrationDeadline).getTime() : new Date(detail.eventDate+'T23:59:59').getTime();
    const registrationOpen=detail.registrationEnabled && Number.isFinite(deadlineTime) && deadlineTime>=Date.now();
    return <div className="space-y-4">
      <section className="overflow-hidden rounded-[30px] border border-white/70 bg-white/90 shadow-[0_18px_50px_rgba(71,85,105,.09)]">
        <div className="grid lg:grid-cols-[280px_1fr]">
          <div className="relative min-h-[210px] bg-gradient-to-br from-indigo-100 via-violet-100 to-rose-100">
            {detail.imageDataUrl ? <img src={detail.imageDataUrl} alt="" className="absolute inset-0 h-full w-full object-cover"/> :
              <div className="absolute inset-0 flex items-center justify-center"><CalendarDays size={52} className="text-indigo-300"/></div>}
            <button type="button" onClick={()=>{setDetail(null);setSelectedId(null);}} className="absolute left-3 top-3 flex min-h-10 items-center gap-2 rounded-2xl bg-white/90 px-3 text-xs font-black text-slate-700 shadow-sm backdrop-blur"><ChevronLeft size={16}/> Eventos</button>
          </div>
          <div className="p-5 sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-[.2em] text-indigo-500"><span>{dateLabel(detail.eventDate)}</span><span className="rounded-full bg-indigo-50 px-2 py-1 tracking-normal text-indigo-700">Curso {detail.academicYear}</span></div>
                <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">{detail.title}</h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">{detail.description || 'Sin descripción.'}</p>
              </div>
              {canEdit&&<div className="flex gap-2">
                <button type="button" onClick={()=>setDraft({
                  id:detail.id,title:detail.title,eventDate:detail.eventDate,academicYear:detail.academicYear,
                  description:detail.description,imageDataUrl:detail.imageDataUrl,
                  registrationEnabled:detail.registrationEnabled,
                  registrationDeadline:toLocalDateTimeInput(detail.registrationDeadline),
                  registrationCapacity:detail.registrationCapacity,
                  maxAttendeesPerFamily:detail.maxAttendeesPerFamily,
                  registrationMessage:detail.registrationMessage||''
                })} className="flex min-h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-xs font-extrabold text-slate-600"><Pencil size={14}/> Editar</button>
                {canDelete&&<button type="button" onClick={()=>void removeEvent()} className="min-h-10 rounded-2xl border border-rose-200 bg-white px-3 text-rose-600"><Trash2 size={15}/></button>}
              </div>}
            </div>
            <div className="mt-6 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {[
                ['Familias',selectedFamilies.size,Users],
                ['Participantes',selectedParticipantCount,UserRound],
                ['% familias',`${familyRate}%`,Percent],
                ['% censo',`${censusRate}%`,BarChart3],
              ].map(([label,value,Icon]:any)=><div key={label} className="rounded-[20px] border border-white bg-gradient-to-br from-white to-slate-50 p-3.5 shadow-sm">
                <Icon size={16} className="text-indigo-400"/>
                <div className="mt-3 text-2xl font-black tracking-tight text-slate-950">{value}</div>
                <div className="mt-1 text-[10px] font-bold text-slate-400">{label}</div>
              </div>)}
            </div>
            {summary&&<div className="mt-3 text-[10px] font-semibold text-slate-400">Referencia guardada: {summary.familyCount} familias · {summary.participantCount} participantes</div>}
          </div>
        </div>
      </section>

      <section className="rounded-[30px] border border-white/70 bg-white/90 p-5 shadow-[0_16px_40px_rgba(71,85,105,.08)] sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-[10px] font-black uppercase tracking-[.18em] text-indigo-500">Inscripciones online</div>
              <span className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase ${!detail.registrationEnabled?'bg-slate-100 text-slate-500':registrationOpen?'bg-emerald-50 text-emerald-700':'bg-amber-50 text-amber-700'}`}>
                {!detail.registrationEnabled?'Desactivadas':registrationOpen?'Abiertas':'Cerradas'}
              </span>
            </div>
            <h2 className="mt-1 text-xl font-black text-slate-950">Formulario público para familias</h2>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">Las familias se identifican contra la base AMPA, seleccionan quién asistirá y quedan separadas de la asistencia real hasta el día del evento.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {detail.registrationEnabled&&<>
              <button type="button" onClick={()=>void copyRegistrationLink()} className="flex min-h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-xs font-extrabold text-slate-600 shadow-sm"><Copy size={14}/> Copiar enlace</button>
              <a href={registrationLink} target="_blank" rel="noreferrer" className="flex min-h-10 items-center gap-2 rounded-2xl bg-indigo-600 px-3 text-xs font-extrabold text-white shadow-sm"><ExternalLink size={14}/> Abrir formulario</a>
            </>}
          </div>
        </div>

        {detail.registrationEnabled ? <>
          <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-[20px] bg-emerald-50 p-3.5"><Users size={15} className="text-emerald-600"/><div className="mt-2 text-2xl font-black text-slate-950">{confirmedRegistrations.length}</div><div className="text-[10px] font-bold text-emerald-700">Familias confirmadas</div></div>
            <div className="rounded-[20px] bg-indigo-50 p-3.5"><UserRound size={15} className="text-indigo-600"/><div className="mt-2 text-2xl font-black text-slate-950">{registeredParticipants}</div><div className="text-[10px] font-bold text-indigo-700">Personas inscritas</div></div>
            <div className="rounded-[20px] bg-amber-50 p-3.5"><Clock3 size={15} className="text-amber-600"/><div className="mt-2 text-2xl font-black text-slate-950">{waitlistRegistrations.length}</div><div className="text-[10px] font-bold text-amber-700">Familias en espera</div></div>
            <div className="rounded-[20px] bg-slate-50 p-3.5"><TicketCheck size={15} className="text-slate-500"/><div className="mt-2 text-2xl font-black text-slate-950">{detail.registrationCapacity??'∞'}</div><div className="text-[10px] font-bold text-slate-500">Aforo máximo</div></div>
          </div>

          <div className="mt-4 rounded-2xl border border-indigo-100 bg-indigo-50/60 p-3">
            <div className="flex items-start gap-2"><Link2 size={15} className="mt-0.5 shrink-0 text-indigo-500"/><div className="min-w-0"><div className="text-[9px] font-black uppercase tracking-wider text-indigo-500">Enlace público</div><div className="mt-1 break-all font-mono text-[10px] text-indigo-900">{registrationLink}</div></div></div>
          </div>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[.14em] text-slate-400">Solicitudes recibidas</div>
              <div className="mt-1 text-xs text-slate-500">{detail.registrations.length-cancelledRegistrations.length} activas · {cancelledRegistrations.length} canceladas</div>
            </div>
            {canEdit&&confirmedRegistrations.length>0&&<button type="button" disabled={savingAttendance} onClick={()=>void loadConfirmedRegistrationsAsAttendance()} className="flex min-h-10 items-center gap-2 rounded-2xl border border-indigo-200 bg-white px-3 text-xs font-extrabold text-indigo-700 disabled:opacity-50"><ClipboardCheck size={15}/> Cargar confirmados como asistencia</button>}
          </div>

          <div className="mt-3 space-y-2">
            {detail.registrations
              .slice()
              .sort((a,b)=>{
                const rank=(status:string)=>status==='confirmed'?0:status==='waitlist'?1:2;
                return rank(a.status)-rank(b.status) || a.familyName.localeCompare(b.familyName,'es',{sensitivity:'base'});
              })
              .map((registration)=><div key={registration.id} className={`rounded-[22px] border p-3.5 ${registration.status==='cancelled'?'border-slate-100 bg-slate-50 opacity-60':'border-slate-100 bg-white'}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2"><strong className="text-xs font-black text-slate-900">Familia {registration.familyName}</strong><span className="font-mono text-[9px] font-bold text-slate-400">{registration.membershipNumber}</span></div>
                    <div className="mt-1 text-[10px] text-slate-400">{registration.attendees.map((attendee)=>attendee.participantName).join(' · ') || 'Sin personas seleccionadas'}</div>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase ${registration.status==='confirmed'?'bg-emerald-50 text-emerald-700':registration.status==='waitlist'?'bg-amber-50 text-amber-700':'bg-slate-100 text-slate-500'}`}>
                    {registration.status==='confirmed'?'Confirmada':registration.status==='waitlist'?'Espera':'Cancelada'}
                  </span>
                </div>
              </div>)}
            {!detail.registrations.length&&<div className="rounded-[22px] border-2 border-dashed border-slate-200 p-7 text-center text-xs text-slate-400">Aún no se ha recibido ninguna inscripción.</div>}
          </div>
        </> : <div className="mt-5 rounded-[22px] border-2 border-dashed border-slate-200 p-6 text-center">
          <div className="text-sm font-black text-slate-600">El formulario público está desactivado</div>
          <div className="mt-1 text-xs text-slate-400">Edite el evento y active “Inscripciones públicas” para generar su enlace.</div>
        </div>}
      </section>

      {!editingAttendance ? (
        <section className="rounded-[30px] border border-white/70 bg-white/90 p-5 shadow-[0_16px_40px_rgba(71,85,105,.08)] sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[.18em] text-slate-400">Participación guardada</div>
              <h2 className="mt-1 text-xl font-black text-slate-950">Familias y asistentes</h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">Vista operativa del evento: solo aparecen las familias que participan y sus miembros asistentes.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {!!detail.attendees.length&&<button type="button" onClick={downloadParticipantsPdf} className="flex min-h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-xs font-extrabold text-slate-700 shadow-sm"><FileDown size={15}/> Lista PDF</button>}
              {canEdit&&<button type="button" onClick={()=>setEditingAttendance(true)} className="flex min-h-11 items-center gap-2 rounded-2xl bg-slate-950 px-4 text-xs font-extrabold text-white"><Pencil size={15}/> Editar participación</button>}
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {Array.from(selectedFamilies)
              .map((familyId)=>families.find((family)=>family.id===familyId))
              .filter((family):family is Family=>Boolean(family))
              .sort((a,b)=>a.familyName.localeCompare(b.familyName,'es',{sensitivity:'base'}))
              .map((family)=>{
                const keys=selectedPeople[family.id]||new Set<string>();
                const guardians=family.guardians.filter((guardian)=>keys.has(personKey('guardian',guardian.id)));
                const students=family.students.filter((student)=>keys.has(personKey('student',student.id)));
                return <div key={family.id} className="rounded-[24px] border border-slate-100 bg-gradient-to-br from-slate-50 to-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <strong className="text-sm font-black text-slate-900">Familia {family.familyName}</strong>
                        <span className="font-mono text-[9px] font-bold text-slate-400">{family.membershipNumber}</span>
                      </div>
                      <div className="mt-1 text-[10px] font-semibold text-slate-400">{keys.size} participante{keys.size===1?'':'s'}</div>
                    </div>
                    <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[10px] font-black text-indigo-700">{keys.size}</span>
                  </div>
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    <div className="rounded-2xl bg-white p-3 shadow-sm">
                      <div className="mb-2 flex items-center gap-2 text-[9px] font-black uppercase tracking-wider text-slate-400"><UserRound size={13}/> Padres / tutores</div>
                      <div className="space-y-1.5">
                        {guardians.map((guardian)=><div key={guardian.id} className="flex items-center gap-2 text-[11px] font-semibold text-slate-700"><span className="h-1.5 w-1.5 rounded-full bg-indigo-400"/><span className="truncate">{guardian.fullName}</span><span className="ml-auto shrink-0 text-[9px] font-bold uppercase text-slate-400">{guardian.relationship.replace('_',' ')}</span></div>)}
                        {!guardians.length&&<div className="text-[10px] text-slate-400">No participa ningún adulto.</div>}
                      </div>
                    </div>
                    <div className="rounded-2xl bg-white p-3 shadow-sm">
                      <div className="mb-2 flex items-center gap-2 text-[9px] font-black uppercase tracking-wider text-slate-400"><Baby size={13}/> Hijos/as</div>
                      <div className="space-y-1.5">
                        {students.map((student)=><div key={student.id} className="flex items-center gap-2 text-[11px] font-semibold text-slate-700"><span className="h-1.5 w-1.5 rounded-full bg-rose-400"/><span className="truncate">{student.firstName} {student.lastName}</span><span className="ml-auto shrink-0 text-[9px] text-slate-400">{student.className||'Sin curso'}</span></div>)}
                        {!students.length&&<div className="text-[10px] text-slate-400">No participa ningún hijo/a.</div>}
                      </div>
                    </div>
                  </div>
                </div>;
              })}
            {!selectedFamilies.size&&<div className="rounded-[22px] border-2 border-dashed border-slate-200 p-8 text-center">
              <div className="text-sm font-black text-slate-500">Aún no hay participación guardada</div>
              <div className="mt-1 text-xs text-slate-400">Seleccione las familias y asistentes para comenzar.</div>
              {canEdit&&<button type="button" onClick={()=>setEditingAttendance(true)} className="mt-4 rounded-2xl bg-slate-950 px-4 py-3 text-xs font-extrabold text-white">Configurar participación</button>}
            </div>}
          </div>
        </section>
      ) : (
        <section className="rounded-[30px] border border-white/70 bg-white/90 p-5 shadow-[0_16px_40px_rgba(71,85,105,.08)] sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[.18em] text-slate-400">Editar participación</div>
              <h2 className="mt-1 text-xl font-black text-slate-950">Seleccionar familias y asistentes</h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">Al marcar una familia se seleccionan automáticamente todos sus miembros. Después solo tiene que desmarcar a quien no participe.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {!!detail.familyIds.length&&<button type="button" onClick={()=>{void loadDetail(detail.id);}} className="min-h-11 rounded-2xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-600">Cancelar cambios</button>}
              {canEdit&&<button type="button" disabled={savingAttendance} onClick={()=>void saveAttendance()} className="flex min-h-11 items-center gap-2 rounded-2xl bg-slate-950 px-4 text-xs font-extrabold text-white disabled:opacity-50"><Save size={15}/>{savingAttendance?'Guardando…':'Guardar participación'}</button>}
            </div>
          </div>
          <div className="mt-5 grid gap-2 sm:grid-cols-[1fr_auto]">
            <label className="relative"><Search size={16} className="absolute left-4 top-3.5 text-slate-400"/><input value={familyQuery} onChange={e=>setFamilyQuery(e.target.value)} placeholder="Buscar familia o miembro…" className="min-h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm outline-none focus:border-indigo-300"/></label>
            <label className="flex min-h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600"><input type="checkbox" checked={onlySelected} onChange={e=>setOnlySelected(e.target.checked)}/> Solo seleccionadas</label>
          </div>

          <div className="mt-4 space-y-2">
            {filteredFamilies.map(family=>{
              const checked=selectedFamilies.has(family.id);
              const people=selectedPeople[family.id]||new Set<string>();
              return <div key={family.id} className={`rounded-[22px] border p-3 transition ${checked?'border-indigo-200 bg-indigo-50/45':'border-slate-100 bg-slate-50/65'}`}>
                <div className="flex items-center gap-3">
                  <input disabled={!canEdit} type="checkbox" checked={checked} onChange={()=>toggleFamily(family.id)} className="h-4 w-4 rounded border-slate-300"/>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2"><strong className="truncate text-xs text-slate-800">Familia {family.familyName}</strong><span className="font-mono text-[9px] font-bold text-slate-400">{family.membershipNumber}</span></div>
                    <div className="mt-0.5 text-[10px] text-slate-400">{family.guardians.length} adulto(s) · {family.students.length} hijo(s) · {people.size} participante(s)</div>
                  </div>
                  <span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase ${family.isActiveThisYear?'bg-emerald-50 text-emerald-700':'bg-amber-50 text-amber-700'}`}>{family.isActiveThisYear?'Activa':'Inactiva'}</span>
                </div>
                {checked&&<div className="mt-3 grid gap-2 border-t border-indigo-100 pt-3 md:grid-cols-2">
                  <div className="rounded-2xl bg-white/80 p-3">
                    <div className="mb-2 flex items-center gap-2 text-[9px] font-black uppercase tracking-wider text-slate-400"><UserRound size={13}/> Padres / tutores</div>
                    <div className="space-y-1.5">
                      {family.guardians.map(g=>{const key=personKey('guardian',g.id);return <label key={g.id} className="flex items-center gap-2 text-[11px] font-semibold text-slate-700"><input disabled={!canEdit} type="checkbox" checked={people.has(key)} onChange={()=>togglePerson(family.id,key)}/><span className="truncate">{g.fullName}</span><span className="ml-auto shrink-0 text-[9px] font-bold uppercase text-slate-400">{g.relationship.replace('_',' ')}</span></label>})}
                      {!family.guardians.length&&<div className="text-[10px] text-slate-400">Sin adultos registrados.</div>}
                    </div>
                  </div>
                  <div className="rounded-2xl bg-white/80 p-3">
                    <div className="mb-2 flex items-center gap-2 text-[9px] font-black uppercase tracking-wider text-slate-400"><Baby size={13}/> Hijos/as</div>
                    <div className="space-y-1.5">
                      {family.students.map(s=>{const key=personKey('student',s.id);return <label key={s.id} className="flex items-center gap-2 text-[11px] font-semibold text-slate-700"><input disabled={!canEdit} type="checkbox" checked={people.has(key)} onChange={()=>togglePerson(family.id,key)}/><span className="truncate">{s.firstName} {s.lastName}</span><span className="ml-auto shrink-0 text-[9px] text-slate-400">{s.className||'Sin curso'}</span></label>})}
                      {!family.students.length&&<div className="text-[10px] text-slate-400">Sin hijos/as registrados.</div>}
                    </div>
                  </div>
                </div>}
              </div>;
            })}
          </div>
        </section>
      )}

      {draft&&<EventEditor draft={draft} setDraft={setDraft} saving={savingEvent} onSave={()=>void saveEvent()} onClose={()=>setDraft(null)} onImage={acceptImage}/>}
    </div>;
  }

  return <div className="space-y-4">
    <section className="relative overflow-hidden rounded-[30px] border border-white/70 bg-gradient-to-br from-white via-white to-[#eef2ff] p-5 shadow-[0_20px_55px_rgba(71,85,105,.10)] sm:p-7">
      <div className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-gradient-to-br from-indigo-200/45 to-rose-100/30 blur-2xl"/>
      <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[.22em] text-indigo-500">Eventos y actividades</div>
          <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-950 sm:text-[32px]">Participación del AMPA</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Cree actividades, gestione asistentes por unidad familiar y mida la participación real de la asociación.</p>
        </div>
        {canEdit&&<button type="button" onClick={()=>setDraft(emptyDraft(settings.activeAcademicYear))} className="flex min-h-11 items-center gap-2 rounded-2xl bg-slate-950 px-4 text-xs font-extrabold text-white shadow-[0_10px_25px_rgba(15,23,42,.18)]"><Plus size={16}/> Nuevo evento</button>}
      </div>
      <div className="relative mt-6 grid gap-2 sm:grid-cols-3">
        <div className="rounded-[20px] border border-white bg-white/75 p-3.5 shadow-sm"><CalendarDays size={16} className="text-indigo-400"/><div className="mt-3 text-2xl font-black">{events.length}</div><div className="mt-1 text-[10px] font-bold text-slate-400">Eventos registrados</div></div>
        <div className="rounded-[20px] border border-white bg-white/75 p-3.5 shadow-sm"><Users size={16} className="text-indigo-400"/><div className="mt-3 text-2xl font-black">{totals.activeFamilies}</div><div className="mt-1 text-[10px] font-bold text-slate-400">Familias activas de referencia</div></div>
        <div className="rounded-[20px] border border-white bg-white/75 p-3.5 shadow-sm"><UserRound size={16} className="text-indigo-400"/><div className="mt-3 text-2xl font-black">{totals.censusPeople}</div><div className="mt-1 text-[10px] font-bold text-slate-400">Personas en el censo familiar</div></div>
      </div>
    </section>

    <section className="rounded-[30px] border border-white/70 bg-white/90 p-4 shadow-[0_16px_40px_rgba(71,85,105,.08)] sm:p-5">
      <div className="grid gap-3 lg:grid-cols-[1fr_190px_auto]">
        <label className="relative block">
          <Search size={17} className="absolute left-4 top-3.5 text-slate-400"/>
          <input value={eventQuery} onChange={(e)=>setEventQuery(e.target.value)} placeholder="Buscar actividad por nombre…" className="min-h-11 w-full rounded-2xl border border-slate-200 bg-slate-50/80 pl-11 pr-4 text-sm outline-none transition focus:border-indigo-300 focus:bg-white focus:ring-4 focus:ring-indigo-50"/>
        </label>
        <select value={academicYearFilter} onChange={(e)=>setAcademicYearFilter(e.target.value)} className="min-h-11 rounded-2xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-600">
          <option value="all">Todos los cursos</option>
          {academicYears.map((year)=><option key={year} value={year}>{year}</option>)}
        </select>
        <div className="flex rounded-2xl bg-slate-100 p-1">
          <button type="button" onClick={()=>setEventView('table')} className={`flex min-h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-extrabold transition ${eventView==='table'?'bg-white text-slate-900 shadow-sm':'text-slate-400'}`}><Table2 size={14}/> Tabla</button>
          <button type="button" onClick={()=>setEventView('list')} className={`flex min-h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-extrabold transition ${eventView==='list'?'bg-white text-slate-900 shadow-sm':'text-slate-400'}`}><Rows3 size={14}/> Lista</button>
          <button type="button" onClick={()=>setEventView('cards')} className={`flex min-h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-extrabold transition ${eventView==='cards'?'bg-white text-slate-900 shadow-sm':'text-slate-400'}`}><LayoutGrid size={14}/> Tarjetas</button>
        </div>
      </div>
      <div className="mt-3 text-[10px] font-semibold text-slate-400">{visibleEvents.length} de {events.length} actividades</div>
    </section>

    {eventView==='cards' ? (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {visibleEvents.map(event=><button key={event.id} type="button" onClick={()=>void loadDetail(event.id)} className="group overflow-hidden rounded-[28px] border border-white/70 bg-white/90 text-left shadow-[0_16px_40px_rgba(71,85,105,.08)] transition hover:-translate-y-0.5 hover:shadow-[0_20px_48px_rgba(71,85,105,.12)]">
          <div className="relative h-36 bg-gradient-to-br from-indigo-100 via-violet-100 to-rose-100">
            {event.imageDataUrl?<img src={event.imageDataUrl} alt="" className="h-full w-full object-cover"/>:<div className="flex h-full items-center justify-center"><CalendarDays size={40} className="text-indigo-300"/></div>}
            <span className="absolute left-3 top-3 rounded-xl bg-white/90 px-2.5 py-1.5 text-[10px] font-black text-slate-700 shadow-sm backdrop-blur">{dateLabel(event.eventDate)}</span>
            <span className="absolute right-3 top-3 rounded-xl bg-indigo-600/90 px-2.5 py-1.5 text-[10px] font-black text-white shadow-sm backdrop-blur">{event.academicYear}</span>
          </div>
          <div className="p-4">
            <h2 className="truncate text-base font-black text-slate-900">{event.title}</h2>
            <p className="mt-1 line-clamp-2 min-h-9 text-[11px] leading-4 text-slate-500">{event.description||'Sin descripción.'}</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="rounded-2xl bg-slate-50 p-2.5"><div className="text-lg font-black">{event.familyCount}</div><div className="text-[9px] font-bold text-slate-400">Familias · {event.familyParticipationRate}%</div></div>
              <div className="rounded-2xl bg-slate-50 p-2.5"><div className="text-lg font-black">{event.participantCount}</div><div className="text-[9px] font-bold text-slate-400">Participantes · {event.censusParticipationRate}%</div></div>
            </div>
          </div>
        </button>)}
      </div>
    ) : eventView==='list' ? (
      <div className="overflow-hidden rounded-[28px] border border-white/70 bg-white/90 shadow-[0_16px_40px_rgba(71,85,105,.08)]">
        <div className="divide-y divide-slate-100">
          {visibleEvents.map((event)=><button key={event.id} type="button" onClick={()=>void loadDetail(event.id)} className="grid w-full gap-1 px-4 py-3 text-left transition hover:bg-indigo-50/40 sm:grid-cols-[95px_1fr_100px_100px] sm:items-center sm:gap-3">
            <span className="text-[10px] font-black text-indigo-600">{dateLabel(event.eventDate)}</span>
            <span className="min-w-0"><span className="block truncate text-sm font-black text-slate-900">{event.title}</span><span className="block truncate text-[10px] text-slate-400">{event.description||'Sin descripción'}</span></span>
            <span className="w-fit rounded-full bg-indigo-50 px-2.5 py-1 text-[9px] font-black text-indigo-700">{event.academicYear}</span>
            <span className="text-[10px] font-bold text-slate-500">{event.familyCount} fam. · {event.participantCount} pers.</span>
          </button>)}
        </div>
      </div>
    ) : (
      <div className="overflow-x-auto rounded-[28px] border border-white/70 bg-white/90 shadow-[0_16px_40px_rgba(71,85,105,.08)]">
        <table className="min-w-[760px] w-full border-collapse text-left">
          <thead className="bg-slate-50/90 text-[9px] font-black uppercase tracking-[.14em] text-slate-400"><tr><th className="px-4 py-3">Fecha</th><th className="px-4 py-3">Actividad</th><th className="px-4 py-3">Curso</th><th className="px-4 py-3 text-right">Familias</th><th className="px-4 py-3 text-right">Participantes</th><th className="px-4 py-3 text-right">% familias</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {visibleEvents.map((event)=><tr key={event.id} onClick={()=>void loadDetail(event.id)} className="cursor-pointer transition hover:bg-indigo-50/40">
              <td className="whitespace-nowrap px-4 py-3 text-[11px] font-bold text-indigo-600">{dateLabel(event.eventDate)}</td>
              <td className="max-w-[360px] px-4 py-3"><div className="truncate text-xs font-black text-slate-900">{event.title}</div><div className="truncate text-[10px] text-slate-400">{event.description||'Sin descripción'}</div></td>
              <td className="whitespace-nowrap px-4 py-3 text-[10px] font-black text-slate-600">{event.academicYear}</td>
              <td className="px-4 py-3 text-right text-xs font-bold text-slate-700">{event.familyCount}</td>
              <td className="px-4 py-3 text-right text-xs font-bold text-slate-700">{event.participantCount}</td>
              <td className="px-4 py-3 text-right text-xs font-bold text-slate-500">{event.familyParticipationRate}%</td>
            </tr>)}
          </tbody>
        </table>
      </div>
    )}
    {!visibleEvents.length&&<div className="rounded-[28px] border-2 border-dashed border-white/80 bg-white/65 p-12 text-center"><CalendarDays size={30} className="mx-auto text-slate-300"/><div className="mt-3 text-sm font-black text-slate-500">No hay actividades que coincidan</div><div className="mt-1 text-xs text-slate-400">{events.length?'Cambie el nombre buscado o el filtro de curso.':'Cree el primer evento para comenzar a medir la participación.'}</div></div>}
    {loadingDetail&&<div className="rounded-2xl bg-white/80 p-4 text-center text-xs font-bold text-slate-400">Cargando evento…</div>}
    {draft&&<EventEditor draft={draft} setDraft={setDraft} saving={savingEvent} onSave={()=>void saveEvent()} onClose={()=>setDraft(null)} onImage={acceptImage}/>}
  </div>;
}

function EventEditor({draft,setDraft,saving,onSave,onClose,onImage}:{
  draft:EventDraft;
  setDraft:(draft:EventDraft)=>void;
  saving:boolean;
  onSave:()=>void;
  onClose:()=>void;
  onImage:(file?:File)=>void;
}){
  const [dragging,setDragging]=useState(false);
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 sm:items-center sm:p-4">
    <div className="max-h-[94vh] w-full max-w-3xl overflow-y-auto rounded-t-[30px] bg-white shadow-2xl sm:rounded-[30px]">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white/95 p-5 backdrop-blur">
        <div><div className="text-[10px] font-black uppercase tracking-wider text-indigo-500">Eventos</div><h2 className="text-lg font-black">{draft.id?'Editar evento':'Nuevo evento'}</h2></div>
        <button type="button" onClick={onClose} className="rounded-xl p-2 hover:bg-slate-100"><X size={20}/></button>
      </div>
      <div className="space-y-5 p-5 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-[1fr_180px_150px]">
          <label className="space-y-1"><span className="text-[11px] font-bold text-slate-500">Título</span><input value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})} className="min-h-11 w-full rounded-2xl border border-slate-200 px-3 text-sm font-bold" placeholder="Ej. Visita a los Bosques de la Alhambra"/></label>
          <label className="space-y-1"><span className="text-[11px] font-bold text-slate-500">Fecha</span><input type="date" value={draft.eventDate} onChange={e=>setDraft({...draft,eventDate:e.target.value})} className="min-h-11 w-full rounded-2xl border border-slate-200 px-3 text-sm"/></label>
          <label className="space-y-1"><span className="text-[11px] font-bold text-slate-500">Curso escolar</span><input value={draft.academicYear} onChange={e=>setDraft({...draft,academicYear:e.target.value})} className="min-h-11 w-full rounded-2xl border border-slate-200 px-3 text-sm font-bold" placeholder="2026/2027" inputMode="numeric"/></label>
        </div>
        <label className="space-y-1"><span className="text-[11px] font-bold text-slate-500">Descripción breve</span><textarea value={draft.description} onChange={e=>setDraft({...draft,description:e.target.value})} rows={4} className="w-full rounded-2xl border border-slate-200 p-3 text-sm leading-6" placeholder="Objetivo, lugar o información útil de la actividad."/></label>
        <div>
          <div className="mb-1 text-[11px] font-bold text-slate-500">Imagen del evento</div>
          <label onDragEnter={e=>{e.preventDefault();setDragging(true)}} onDragOver={e=>e.preventDefault()} onDragLeave={()=>setDragging(false)} onDrop={e=>{e.preventDefault();setDragging(false);void onImage(e.dataTransfer.files?.[0])}} className={`relative flex min-h-48 cursor-pointer items-center justify-center overflow-hidden rounded-[24px] border-2 border-dashed transition ${dragging?'border-indigo-400 bg-indigo-50':'border-slate-200 bg-slate-50'}`}>
            {draft.imageDataUrl?<img src={draft.imageDataUrl} alt="" className="absolute inset-0 h-full w-full object-cover"/>:<div className="text-center text-slate-400"><ImagePlus size={30} className="mx-auto"/><div className="mt-2 text-xs font-black">Arrastre una imagen o pulse para elegirla</div><div className="mt-1 text-[10px]">Se optimizará automáticamente para la app</div></div>}
            <input type="file" accept="image/*" className="sr-only" onChange={e=>void onImage(e.target.files?.[0])}/>
            {draft.imageDataUrl&&<div className="absolute inset-x-0 bottom-0 bg-slate-950/55 p-2 text-center text-[10px] font-bold text-white backdrop-blur">Pulse o arrastre otra imagen para sustituirla</div>}
          </label>
          {draft.imageDataUrl&&<button type="button" onClick={()=>setDraft({...draft,imageDataUrl:''})} className="mt-2 text-[10px] font-bold text-rose-600">Quitar imagen</button>}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <button type="button" onClick={onClose} className="min-h-11 rounded-2xl px-4 text-xs font-bold text-slate-500">Cancelar</button>
          <button type="button" disabled={saving} onClick={onSave} className="flex min-h-11 items-center gap-2 rounded-2xl bg-slate-950 px-5 text-xs font-extrabold text-white disabled:opacity-50"><Save size={15}/>{saving?'Guardando…':'Guardar evento'}</button>
        </div>
      </div>
    </div>
  </div>;
}

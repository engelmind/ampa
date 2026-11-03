import React, { useMemo, useState } from 'react';
import { Baby, CalendarDays, Check, ChevronLeft, ChevronRight, ClipboardCheck, Clock3, Copy, Download, ExternalLink, FileDown, Pencil, Plus, QrCode, Search, Settings2, TicketCheck, Trash2, UserRound, Users, X } from 'lucide-react';
import { backendApi } from '../services/backendApi';
import { EventDetail, EventRegistrationRecord, Family, SystemSettings } from '../types/family';
import { PdfArtifact, createEventParticipantsPdfArtifact, createEventRegistrationsPdfArtifact } from '../utils/pdfExportUtils';
import { PdfPreviewModal } from './PdfPreviewModal';

type View = 'overview'|'registrations'|'attendance'|'settings';
type PersonType = 'guardian'|'student';
type Participant = {personType:PersonType;personId:string};
type Notify=(type:'success'|'error'|'info',title:string,message?:string)=>void;
const PAGE_SIZE=15;
const personKey=(type:PersonType,id:string)=>type+':'+id;
const personParts=(key:string):Participant=>({personType:key.startsWith('student:')?'student':'guardian',personId:key.substring(key.indexOf(':')+1)});
const labelStatus=(s:string)=>s==='confirmed'?'Confirmada':s==='waitlist'?'En espera':'Cancelada';
const dateLabel=(s:string)=>new Date(s+'T12:00:00').toLocaleDateString('es-ES');
const memberName=(student:Family['students'][number])=>(student.firstName+' '+student.lastName).trim();
const matches=(family:Family|undefined,q:string,extra='')=>{
  const query=q.trim().toLocaleLowerCase('es');
  if(!query) return true;
  return [
    family?.membershipNumber||'',family?.familyName||'',extra,
    ...(family?.guardians||[]).map(g=>g.fullName),
    ...(family?.students||[]).map(s=>memberName(s))
  ].join(' ').toLocaleLowerCase('es').includes(query);
};

function PageNav({page,total,onChange,label}:{page:number;total:number;onChange:(n:number)=>void;label:string}){
  const pages=Math.max(1,Math.ceil(total/PAGE_SIZE));
  const current=Math.min(page,pages);
  return <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-3 py-3 text-[11px] font-semibold text-slate-500">
    <span>{total ? ((current-1)*PAGE_SIZE+1)+'–'+Math.min(current*PAGE_SIZE,total) : '0'} de {total} {label}</span>
    <div className="flex items-center gap-2">
      <button type="button" disabled={current<=1} onClick={()=>onChange(current-1)} aria-label="Página anterior" className="rounded-xl border border-slate-200 px-3 py-2 disabled:opacity-30"><ChevronLeft size={14}/></button>
      <span>Página {current} de {pages}</span>
      <button type="button" disabled={current>=pages} onClick={()=>onChange(current+1)} aria-label="Página siguiente" className="rounded-xl border border-slate-200 px-3 py-2 disabled:opacity-30"><ChevronRight size={14}/></button>
    </div>
  </div>;
}

function MemberPicker({family,selected,onChange,readonly=false,formChildren=[],extra=[]}:{
  family:Family;selected:Set<string>;onChange:(next:Set<string>)=>void;readonly?:boolean;
  formChildren?:EventRegistrationRecord['formChildren'];extra?:Array<{personType:PersonType;personId:string;participantName:string}>
}){
  const declared=new Set((formChildren||[]).map(c=>c.studentId));
  const allKnown=[
    ...family.guardians.map(g=>({key:personKey('guardian',g.id),name:g.fullName,role:g.relationship.replace('_',' '),isChild:false,declared:false})),
    ...family.students.map(s=>({key:personKey('student',s.id),name:memberName(s),role:s.className||'Curso no asignado',isChild:true,declared:declared.has(s.id)}))
  ];
  const known=new Set(allKnown.map(person=>person.key));
  const unidentified=extra.filter(p=>!known.has(personKey(p.personType,p.personId)))
    .map(p=>({key:personKey(p.personType,p.personId),name:p.participantName,role:'Persona pendiente de vincular al directorio',isChild:p.personType==='student',declared:declared.has(p.personId)}));
  const people=[...allKnown,...unidentified];
  const toggle=(key:string)=>{
    if(readonly) return;
    const next=new Set(selected);
    if(next.has(key)) next.delete(key); else next.add(key);
    onChange(next);
  };
  const groups=[{title:'Padres, madres y tutores',child:false},{title:'Hijos/as',child:true}];
  return <div className="space-y-3">
    {!readonly&&<div className="flex flex-wrap gap-2">
      <button type="button" onClick={()=>onChange(new Set(people.map(p=>p.key)))} className="rounded-xl bg-indigo-50 px-3 py-2 text-[10px] font-bold text-indigo-700">Seleccionar todos</button>
      <button type="button" onClick={()=>onChange(new Set(people.filter(p=>!p.isChild).map(p=>p.key)))} className="rounded-xl bg-slate-100 px-3 py-2 text-[10px] font-bold text-slate-600">Solo adultos</button>
      <button type="button" onClick={()=>onChange(new Set())} className="rounded-xl bg-slate-100 px-3 py-2 text-[10px] font-bold text-slate-600">Vaciar selección</button>
      <span className="ml-auto self-center text-[10px] font-bold text-slate-500">{selected.size} seleccionados</span>
    </div>}
    <div className="grid gap-3 lg:grid-cols-2">
      {groups.map(group=><section key={group.title} className="rounded-2xl bg-slate-50 p-3">
        <div className="mb-2 flex items-center gap-2 text-[10px] font-black text-slate-600">
          {group.child?<Baby size={14} className="text-rose-500"/>:<UserRound size={14} className="text-indigo-500"/>}
          {group.title}
        </div>
        <div className="space-y-1.5">
          {people.filter(p=>p.isChild===group.child).map(p=><label key={p.key} className="flex cursor-pointer items-start gap-2 rounded-xl border border-slate-100 bg-white px-2.5 py-2 text-[11px]">
            <input type="checkbox" disabled={readonly} checked={selected.has(p.key)} onChange={()=>toggle(p.key)} className="mt-0.5 h-4 w-4 accent-indigo-600"/>
            <span className="min-w-0 flex-1"><strong className="block font-semibold text-slate-800">{p.name}</strong><span className="text-[9px] text-slate-400">{p.role}</span></span>
            {p.declared&&<span className="shrink-0 rounded-md bg-rose-50 px-1.5 py-1 text-[8px] font-bold text-rose-700">Formulario</span>}
          </label>)}
          {!people.some(p=>p.isChild===group.child)&&<div className="text-[10px] text-slate-400">Sin miembros en el directorio</div>}
        </div>
      </section>)}
    </div>
  </div>;
}

export interface EventWorkspaceProps {
  detail:EventDetail;
  families:Family[];
  settings:SystemSettings;
  canEdit:boolean;
  canDelete:boolean;
  onBack:()=>void;
  onEditEvent:()=>void;
  onDeleteEvent:()=>void;
  onToggleRegistration:()=>Promise<void>;
  onCopyLink:()=>Promise<void>;
  onDownloadQr:(format:'png'|'svg')=>void;
  qrPng:string;
  qrSvg:string;
  onReload:()=>Promise<void>;
  onRefresh:()=>Promise<void>;
  onNotify:Notify;
}

export function EventWorkspace({
  detail,families,settings,canEdit,canDelete,onBack,onEditEvent,onDeleteEvent,
  onToggleRegistration,onCopyLink,onDownloadQr,qrPng,qrSvg,onReload,onRefresh,onNotify
}:EventWorkspaceProps){
  const [tab,setTab]=useState<View>('overview');
  const [regQuery,setRegQuery]=useState('');
  const [regFilter,setRegFilter]=useState('active');
  const [regPage,setRegPage]=useState(1);
  const [regEditorId,setRegEditorId]=useState<string|null>(null);
  const [regSelected,setRegSelected]=useState<Set<string>>(new Set());
  const [addingFamily,setAddingFamily]=useState(false);
  const [familyPick,setFamilyPick]=useState('');
  const [busy,setBusy]=useState(false);
  const [attQuery,setAttQuery]=useState('');
  const [attFilter,setAttFilter]=useState('registered');
  const [attPage,setAttPage]=useState(1);
  const [attEditorId,setAttEditorId]=useState<string|null>(null);
  const [attSelected,setAttSelected]=useState<Set<string>>(new Set());
  const [printPreview,setPrintPreview]=useState<PdfArtifact|null>(null);

  const familyMap=useMemo(()=>new Map(families.map(f=>[f.id,f] as const)),[families]);
  const registrationMap=useMemo(()=>new Map(detail.registrations.map(r=>[r.familyId,r] as const)),[detail.registrations]);
  const attendanceMap=useMemo(()=>{
    const m=new Map<string,Set<string>>();
    for(const a of detail.attendees){
      if(!m.has(a.familyId)) m.set(a.familyId,new Set());
      m.get(a.familyId)!.add(personKey(a.personType,a.personId));
    }
    return m;
  },[detail.attendees]);
  const confirmed=detail.registrations.filter(r=>r.status==='confirmed');
  const waiting=detail.registrations.filter(r=>r.status==='waitlist');
  const cancelled=detail.registrations.filter(r=>r.status==='cancelled');
  const active=detail.registrations.filter(r=>r.status!=='cancelled');
  const reserved=confirmed.reduce((n,r)=>n+r.attendees.length,0);
  const registrationOpen=detail.registrationEnabled && (!detail.registrationDeadline || new Date(detail.registrationDeadline).getTime()>=Date.now());
  const capacity=detail.registrationCapacity;
  const busyRefresh=async()=>{await onRefresh();await onReload();};

  const listed=detail.registrations.filter(r=>{
    if(regFilter==='active' && r.status==='cancelled') return false;
    if(!['active','all'].includes(regFilter) && r.status!==regFilter) return false;
    return matches(familyMap.get(r.familyId),regQuery,r.familyName+' '+r.membershipNumber+' '+r.attendees.map(a=>a.participantName).join(' '));
  }).sort((a,b)=>{
    const order=(r:EventRegistrationRecord)=>r.status==='confirmed'?0:r.status==='waitlist'?1:2;
    return order(a)-order(b)||a.familyName.localeCompare(b.familyName,'es',{sensitivity:'base'});
  });
  const listedPage=listed.slice((regPage-1)*PAGE_SIZE,regPage*PAGE_SIZE);
  const attendanceFamilies=families.filter(f=>{
    const reg=registrationMap.get(f.id);
    const attending=attendanceMap.has(f.id);
    if(attFilter==='registered' && !((reg && reg.status!=='cancelled')||attending)) return false;
    if(attFilter==='attended' && !attending) return false;
    if(attFilter==='pending' && !(reg && reg.status==='confirmed' && !attending)) return false;
    if(attFilter==='notRegistered' && (reg && reg.status!=='cancelled')) return false;
    return matches(f,attQuery);
  }).sort((a,b)=>a.familyName.localeCompare(b.familyName,'es',{sensitivity:'base'}));
  const attendancePage=attendanceFamilies.slice((attPage-1)*PAGE_SIZE,attPage*PAGE_SIZE);
  const eligibleToAdd=families.filter(f=>!registrationMap.has(f.id) || registrationMap.get(f.id)?.status==='cancelled');
  const searchedToAdd=eligibleToAdd.filter(f=>matches(f,familyPick)).slice(0,12);
  const currentReg=regEditorId?registrationMap.get(regEditorId):undefined;
  const currentRegFamily=regEditorId?familyMap.get(regEditorId):undefined;
  const currentAttFamily=attEditorId?familyMap.get(attEditorId):undefined;

  const openRegistration=(familyId:string)=>{
    const r=registrationMap.get(familyId);
    setRegEditorId(familyId);
    setRegSelected(new Set((r?.attendees||[]).map(a=>personKey(a.personType,a.personId))));
    setAddingFamily(false);
  };
  const saveRegistration=async()=>{
    if(!regEditorId || !canEdit) return;
    if(!regSelected.size && !window.confirm('La inscripción quedará CANCELADA. ¿Confirma la baja completa de esta familia?')) return;
    setBusy(true);
    try{
      const res=await backendApi.manageEventRegistration(detail.id,regEditorId,Array.from(regSelected).map(personParts));
      setRegEditorId(null);
      setAddingFamily(false);
      setRegPage(1);
      await busyRefresh();
      onNotify('success',res.status==='cancelled'?'Inscripción cancelada':res.status==='waitlist'?'Familia en lista de espera':'Inscripción guardada',
        'Los cambios afectan únicamente a esta familia. No se han enviado correos.');
    }catch(error:any){onNotify('error','No se pudo guardar la inscripción',error?.message)}
    finally{setBusy(false)}
  };
  const cancelRegistration=async(r:EventRegistrationRecord)=>{
    if(!canEdit || !window.confirm('¿Cancelar la inscripción de la familia '+r.familyName+'? Se conservará su historial y no se enviará ningún correo.')) return;
    setBusy(true);
    try{
      await backendApi.manageEventRegistration(detail.id,r.familyId,[]);
      setRegEditorId(null);await busyRefresh();
      onNotify('success','Inscripción cancelada','Las demás familias no se han modificado.');
    }catch(error:any){onNotify('error','No se pudo cancelar',error?.message)}
    finally{setBusy(false)}
  };

  const openAttendance=(familyId:string)=>{
    setAttEditorId(familyId);
    setAttSelected(new Set(attendanceMap.get(familyId)||[]));
  };
  const saveAttendance=async()=>{
    if(!attEditorId||!canEdit) return;
    const wasPresent=attendanceMap.has(attEditorId);
    if(!attSelected.size && wasPresent && !window.confirm('¿Eliminar toda la asistencia de esta familia? La inscripción no cambiará.')) return;
    if(attSelected.size && detail.eventDate>new Date().toLocaleDateString('en-CA') &&
      !window.confirm('La fecha de este evento aún no ha llegado. ¿Desea registrar asistencia efectiva por adelantado?')) return;
    setBusy(true);
    try{
      await backendApi.saveEventFamilyAttendance(detail.id,attEditorId,Array.from(attSelected).map(personParts));
      setAttEditorId(null);
      await busyRefresh();
      onNotify('success','Asistencia guardada','Solo se ha actualizado esta familia; su inscripción permanece intacta.');
    }catch(error:any){onNotify('error','No se pudo guardar la asistencia',error?.message)}
    finally{setBusy(false)}
  };

  const openRegistrationReport=()=>{
    if(!active.length){onNotify('info','No hay inscripciones activas');return}
    setPrintPreview(createEventRegistrationsPdfArtifact(detail,families,settings));
  };
  const openAttendanceReport=()=>{
    if(!detail.attendees.length){onNotify('info','No hay asistencia efectiva registrada');return}
    setPrintPreview(createEventParticipantsPdfArtifact(detail,families,settings));
  };
  const chooseTab=(next:View)=>{
    setTab(next);setRegEditorId(null);setAddingFamily(false);setAttEditorId(null);
  };
  const nav=[
    {id:'overview' as View,label:'Resumen',count:null},
    {id:'registrations' as View,label:'Inscripciones',count:active.length},
    {id:'attendance' as View,label:'Asistencia',count:attendanceMap.size},
    {id:'settings' as View,label:'Configuración',count:null}
  ];

  return <div className="space-y-4">
    <section className="overflow-hidden rounded-[28px] border border-white/70 bg-white/95 shadow-sm">
      <div className="flex flex-wrap items-center gap-4 px-5 py-4">
        <button type="button" onClick={onBack} className="flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-[11px] font-extrabold text-slate-600"><ChevronLeft size={15}/> Eventos</button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[10px] font-bold text-indigo-500"><CalendarDays size={13}/>{dateLabel(detail.eventDate)} · Curso {detail.academicYear}</div>
          <h1 className="mt-1 text-xl font-black tracking-tight text-slate-950 sm:text-2xl">{detail.title}</h1>
          <p className="mt-1 max-w-3xl text-[11px] text-slate-500">{detail.description||'Evento sin descripción.'}</p>
        </div>
        <span className={'rounded-full px-3 py-2 text-[10px] font-extrabold '+(registrationOpen?'bg-emerald-50 text-emerald-700':'bg-slate-100 text-slate-500')}>
          {registrationOpen?'Inscripción abierta':'Inscripción cerrada'}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-px bg-slate-100 sm:grid-cols-4">
        {[
          {label:'Familias inscritas',value:confirmed.length,icon:Users},
          {label:'Plazas confirmadas',value:reserved,icon:TicketCheck},
          {label:'Familias asistentes',value:attendanceMap.size,icon:ClipboardCheck},
          {label:'Asistentes efectivos',value:detail.attendees.length,icon:UserRound}
        ].map(k=><div key={k.label} className="bg-white px-4 py-3">
          <div className="flex items-center gap-2 text-[9px] font-semibold text-slate-500"><k.icon size={13} className="text-indigo-400"/>{k.label}</div>
          <div className="mt-1 text-2xl font-black text-slate-950">{k.value}</div>
        </div>)}
      </div>
      <div className="flex gap-1 overflow-x-auto border-t border-slate-100 bg-slate-50/80 p-2" role="tablist" aria-label="Áreas de gestión del evento">
        {nav.map(item=><button key={item.id} role="tab" aria-selected={tab===item.id} type="button" onClick={()=>chooseTab(item.id)} className={'flex min-h-10 shrink-0 items-center gap-2 rounded-xl px-4 text-[11px] font-black transition '+(tab===item.id?'bg-slate-900 text-white shadow-sm':'text-slate-500 hover:bg-white')}>
          {item.label} {item.count!==null&&<span className={'rounded-md px-1.5 py-0.5 text-[9px] '+(tab===item.id?'bg-white/20':'bg-slate-200')}>{item.count}</span>}
        </button>)}
      </div>
    </section>

    {tab==='overview'&&<section className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-3">
        <button type="button" onClick={()=>chooseTab('registrations')} className="rounded-[24px] border border-indigo-100 bg-gradient-to-br from-indigo-50 to-white p-5 text-left shadow-sm transition hover:border-indigo-300">
          <div className="flex items-center gap-2 text-[11px] font-black text-indigo-700"><Users size={17}/> Inscripciones</div>
          <p className="mt-2 text-2xl font-black text-slate-900">{active.length} <span className="text-xs text-slate-500">familias</span></p>
          <p className="mt-1 text-[11px] text-slate-500">{reserved} plazas confirmadas · {waiting.length} familias en espera · {cancelled.length} bajas</p>
          <p className="mt-4 text-[11px] font-extrabold text-indigo-700">Buscar, añadir y modificar familias</p>
        </button>
        <button type="button" onClick={()=>chooseTab('attendance')} className="rounded-[24px] border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white p-5 text-left shadow-sm transition hover:border-emerald-300">
          <div className="flex items-center gap-2 text-[11px] font-black text-emerald-700"><ClipboardCheck size={17}/> Asistencia efectiva</div>
          <p className="mt-2 text-2xl font-black text-slate-900">{attendanceMap.size} <span className="text-xs text-slate-500">familias</span></p>
          <p className="mt-1 text-[11px] text-slate-500">{detail.attendees.length} personas verificadas · {confirmed.filter(r=>!attendanceMap.has(r.familyId)).length} familias confirmadas sin asistencia</p>
          <p className="mt-4 text-[11px] font-extrabold text-emerald-700">Pasar lista y corregir una familia</p>
        </button>
        <button type="button" onClick={()=>chooseTab('settings')} className="rounded-[24px] border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-slate-300">
          <div className="flex items-center gap-2 text-[11px] font-black text-slate-700"><Settings2 size={17}/> Configuración</div>
          <p className="mt-2 text-2xl font-black text-slate-900">{capacity==null?'Sin límite':capacity+' plazas'}</p>
          <p className="mt-1 text-[11px] text-slate-500">Formulario público, aforo, QR y condiciones de inscripción</p>
          <p className="mt-4 text-[11px] font-extrabold text-slate-700">Gestionar publicación y ajustes</p>
        </button>
      </div>
      <p className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[11px] text-slate-500">
        Las <strong className="text-slate-700">inscripciones</strong> son reservas de plaza. La <strong className="text-slate-700">asistencia</strong> se registra por separado y solo cuando se confirma que una persona acudió a la actividad.
      </p>
    </section>}

    {tab==='registrations'&&<section className="rounded-[28px] border border-white/70 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-lg font-black text-slate-950">Inscripciones</h2><p className="text-[11px] text-slate-500">Registro de reservas: altas, bajas, modificaciones y espera. No registra asistencia.</p></div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={openRegistrationReport} className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2.5 text-[11px] font-bold text-slate-600"><FileDown size={14}/> PDF de inscripciones</button>
          {canEdit&&<button type="button" onClick={()=>{setAddingFamily(true);setRegEditorId(null);setFamilyPick('')}} className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2.5 text-[11px] font-bold text-white"><Plus size={14}/> Añadir familia</button>}
        </div>
      </div>

      {addingFamily&&<div className="mt-4 rounded-[22px] border border-indigo-200 bg-indigo-50/30 p-4">
        <div className="flex items-center justify-between gap-3"><strong className="text-xs text-slate-800">Alta o reactivación de inscripción</strong><button type="button" aria-label="Cerrar alta" onClick={()=>setAddingFamily(false)}><X size={16}/></button></div>
        <p className="mt-1 text-[10px] text-slate-500">Busque una familia del directorio y seleccione exactamente quién ocupa plaza. Las inscripciones canceladas pueden reactivarse.</p>
        <div className="relative mt-3"><Search size={15} className="absolute left-3 top-3 text-slate-400"/><input value={familyPick} onChange={e=>setFamilyPick(e.target.value)} placeholder="Nombre, número de socio, adulto o hijo…" className="min-h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-xs"/></div>
        <div className="mt-2 max-h-[260px] divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-100 bg-white">
          {searchedToAdd.map(f=><button key={f.id} type="button" onClick={()=>openRegistration(f.id)} className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition hover:bg-indigo-50"><span className="min-w-0 text-[11px] font-semibold text-slate-700">{f.familyName} <span className="font-mono text-[9px] text-slate-400">{f.membershipNumber}</span></span><span className="text-[10px] font-bold text-indigo-700">{registrationMap.get(f.id)?.status==='cancelled'?'Reactivar':'Seleccionar'}</span></button>)}
          {!searchedToAdd.length&&<div className="px-3 py-4 text-xs text-slate-400">No hay familias disponibles con ese criterio.</div>}
        </div>
        <p className="mt-2 text-[9px] text-slate-400">Mostrando hasta 12 coincidencias; refine la búsqueda para localizar otras familias.</p>
      </div>}

      {regEditorId && (!currentReg || currentReg.status==='cancelled') && currentRegFamily&&<div className="mt-4 rounded-2xl border border-indigo-200 bg-indigo-50/30 p-4">
        <div className="mb-3 flex items-center justify-between"><div><h3 className="text-xs font-black text-slate-800">{currentReg?.status==='cancelled'?'Reactivar inscripción':'Nueva inscripción'} · {currentRegFamily.familyName}</h3><p className="mt-1 text-[10px] text-slate-500">Seleccione quién ocupará plaza. Los demás miembros quedan vinculados solo en el directorio.</p></div><button type="button" onClick={()=>setRegEditorId(null)} aria-label="Cerrar"><X size={16}/></button></div>
        <MemberPicker family={currentRegFamily} selected={regSelected} onChange={setRegSelected} readonly={!canEdit||busy} formChildren={currentReg?.formChildren} extra={currentReg?.attendees}/>
        <div className="mt-3 flex justify-end gap-2"><button type="button" onClick={()=>setRegEditorId(null)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-[11px] font-bold text-slate-600">Cancelar</button><button type="button" disabled={busy||!regSelected.size} onClick={()=>void saveRegistration()} className="rounded-xl bg-indigo-600 px-4 py-2.5 text-[11px] font-bold text-white disabled:opacity-50"><Plus size={12} className="inline"/> Confirmar inscripción</button></div>
      </div>}

      <div className="mt-4 grid gap-2 md:grid-cols-[minmax(0,1fr)_180px]">
        <label className="relative"><Search size={15} className="absolute left-3 top-3.5 text-slate-400"/><input value={regQuery} onChange={e=>{setRegQuery(e.target.value);setRegPage(1)}} className="min-h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-xs" placeholder="Buscar familia, socio o persona inscrita…"/></label>
        <select aria-label="Filtrar inscripciones" value={regFilter} onChange={e=>{setRegFilter(e.target.value);setRegPage(1)}} className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-[11px] font-bold text-slate-600">
          <option value="active">Activas (confirmadas y espera)</option><option value="confirmed">Confirmadas</option>
          <option value="waitlist">Lista de espera</option><option value="cancelled">Canceladas</option><option value="all">Todas</option>
        </select>
      </div>
      <div className="mt-3 overflow-hidden rounded-2xl border border-slate-100">
        <div className="hidden grid-cols-[minmax(0,1fr)_95px_90px_96px] gap-2 bg-slate-50 px-4 py-2 text-[9px] font-extrabold uppercase tracking-wide text-slate-400 sm:grid">
          <span>Familia y n.º socio</span><span>Personas</span><span>Estado</span><span className="text-right">Gestión</span>
        </div>
        <div className="divide-y divide-slate-100">
          {listedPage.map(r=><div key={r.id}>
            <div className="grid gap-2 px-4 py-3 transition hover:bg-slate-50 sm:grid-cols-[minmax(0,1fr)_95px_90px_96px] sm:items-center">
              <div className="min-w-0"><div className="truncate text-xs font-extrabold text-slate-800">{r.familyName}</div><div className="font-mono text-[9px] text-slate-400">{r.membershipNumber}</div></div>
              <div className="text-[11px] font-black text-slate-700">{r.status==='cancelled'?'—':r.attendees.length} <span className="font-normal text-slate-400">{r.status==='cancelled'?'histórico':'plazas'}</span></div>
              <div><span className={'rounded-lg px-2 py-1 text-[9px] font-bold '+(r.status==='confirmed'?'bg-emerald-50 text-emerald-700':r.status==='waitlist'?'bg-amber-50 text-amber-700':'bg-slate-100 text-slate-500')}>{labelStatus(r.status)}</span></div>
              <div className="sm:text-right"><button type="button" aria-expanded={regEditorId===r.familyId} onClick={()=>regEditorId===r.familyId?setRegEditorId(null):openRegistration(r.familyId)} className="rounded-xl border border-indigo-100 bg-white px-3 py-2 text-[10px] font-black text-indigo-700">{regEditorId===r.familyId?'Cerrar':'Gestionar'}</button></div>
            </div>
            {regEditorId===r.familyId && currentRegFamily&&<div className="border-t border-indigo-100 bg-indigo-50/25 p-4">
              <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                <div><h3 className="text-xs font-black text-slate-800">{r.familyName} · Edición individual</h3><p className="mt-1 text-[10px] text-slate-500">Marque las personas que tienen plaza. Los hijos declarados en el formulario se identifican con su etiqueta, pero no se seleccionan automáticamente.</p></div>
                <button type="button" aria-label="Cerrar edición" onClick={()=>setRegEditorId(null)}><X size={16}/></button>
              </div>
              <MemberPicker family={currentRegFamily} selected={regSelected} onChange={setRegSelected} readonly={!canEdit||busy} formChildren={r.formChildren} extra={r.attendees}/>
              <div className="mt-3 flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 pt-3">
                {canEdit&&r.status!=='cancelled'&&<button type="button" disabled={busy} onClick={()=>void cancelRegistration(r)} className="flex min-h-9 items-center gap-1 rounded-xl border border-rose-200 px-3 text-[10px] font-bold text-rose-700 disabled:opacity-50"><Trash2 size={13}/> Baja familiar</button>}
                {canEdit&&<button type="button" disabled={busy} onClick={()=>void saveRegistration()} className="flex min-h-9 items-center gap-1 rounded-xl bg-indigo-600 px-4 text-[10px] font-bold text-white disabled:opacity-50"><Check size={14}/>{busy?'Guardando…':r.status==='cancelled'?'Reactivar y guardar':'Guardar cambios'}</button>}
              </div>
            </div>}
          </div>)}
          {!listed.length&&<div className="px-4 py-8 text-center text-xs text-slate-400">No hay inscripciones para estos filtros.</div>}
        </div>
        <PageNav page={regPage} total={listed.length} onChange={setRegPage} label="familias"/>
      </div>
    </section>}

    {tab==='attendance'&&<section className="rounded-[28px] border border-white/70 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="text-lg font-black text-slate-950">Asistencia efectiva</h2><p className="text-[11px] text-slate-500">Control presencial independiente de las inscripciones. Cada familia se guarda por separado.</p></div>
        <button type="button" onClick={openAttendanceReport} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-[11px] font-bold text-slate-600"><FileDown size={14}/> PDF de asistencia</button>
      </div>
      {detail.eventDate>new Date().toLocaleDateString('en-CA')&&<p className="mt-3 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-[10px] font-semibold text-amber-700">Actividad futura: todavía no debe contabilizarse asistencia real. Si necesita registrar una excepción, la operación exigirá confirmación explícita.</p>}
      <div className="mt-4 grid gap-2 md:grid-cols-[minmax(0,1fr)_200px]">
        <label className="relative"><Search size={15} className="absolute left-3 top-3.5 text-slate-400"/><input value={attQuery} onChange={e=>{setAttQuery(e.target.value);setAttPage(1)}} className="min-h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-xs" placeholder="Buscar familia o miembro (también no inscritos)…"/></label>
        <select aria-label="Filtrar asistencia" value={attFilter} onChange={e=>{setAttFilter(e.target.value);setAttPage(1)}} className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-[11px] font-bold text-slate-600">
          <option value="registered">Familias inscritas y asistentes</option><option value="attended">Con asistencia</option>
          <option value="pending">Confirmadas sin asistencia</option><option value="notRegistered">Sin inscripción activa</option>
          <option value="all">Todas las familias</option>
        </select>
      </div>
      <div className="mt-3 overflow-hidden rounded-2xl border border-slate-100">
        <div className="hidden grid-cols-[minmax(0,1fr)_90px_110px_100px] gap-2 bg-slate-50 px-4 py-2 text-[9px] font-extrabold uppercase text-slate-400 sm:grid">
          <span>Familia</span><span>Inscripción</span><span>Asistentes</span><span className="text-right">Operar</span>
        </div>
        <div className="divide-y divide-slate-100">
          {attendancePage.map(f=>{
            const reg=registrationMap.get(f.id);
            const selected=attendanceMap.get(f.id);
            return <div key={f.id}>
              <div className="grid gap-2 px-4 py-3 hover:bg-slate-50 sm:grid-cols-[minmax(0,1fr)_90px_110px_100px] sm:items-center">
                <div className="min-w-0"><strong className="block truncate text-xs text-slate-800">{f.familyName}</strong><span className="font-mono text-[9px] text-slate-400">{f.membershipNumber}</span></div>
                <div className="text-[10px] font-semibold text-slate-500">{reg?.status==='confirmed'?'Confirmada':reg?.status==='waitlist'?'En espera':'Sin inscripción'}</div>
                <div className={'text-[11px] font-bold '+(selected?'text-emerald-700':'text-slate-400')}>{selected?selected.size+' presentes':'Sin marcar'}</div>
                <div className="sm:text-right"><button type="button" onClick={()=>attEditorId===f.id?setAttEditorId(null):openAttendance(f.id)} aria-expanded={attEditorId===f.id} className="rounded-xl border border-emerald-100 px-3 py-2 text-[10px] font-bold text-emerald-700">{attEditorId===f.id?'Cerrar':'Pasar lista'}</button></div>
              </div>
              {attEditorId===f.id && currentAttFamily&&<div className="border-t border-emerald-100 bg-emerald-50/25 p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><strong className="text-xs text-slate-800">Asistencia · {f.familyName}</strong><p className="mt-1 text-[10px] text-slate-500">Marque únicamente las personas cuya presencia se ha comprobado.</p></div><button type="button" onClick={()=>setAttEditorId(null)} aria-label="Cerrar"><X size={16}/></button></div>
                <MemberPicker family={currentAttFamily} selected={attSelected} onChange={setAttSelected} readonly={!canEdit||busy} formChildren={reg?.formChildren}/>
                <div className="mt-3 flex justify-end gap-2 border-t border-slate-200 pt-3"><button type="button" onClick={()=>setAttEditorId(null)} className="rounded-xl border border-slate-200 px-3 py-2 text-[10px] font-bold text-slate-600">Cancelar</button>{canEdit&&<button type="button" disabled={busy||(!attSelected.size&&!selected)} onClick={()=>void saveAttendance()} className="rounded-xl bg-emerald-700 px-4 py-2 text-[10px] font-bold text-white disabled:opacity-40">{busy?'Guardando…':attSelected.size?'Guardar asistencia':'Retirar asistencia'}</button>}</div>
              </div>}
            </div>;
          })}
          {!attendanceFamilies.length&&<div className="px-4 py-8 text-center text-xs text-slate-400">No hay familias para el filtro seleccionado. Pruebe «Todas las familias» para incluir asistentes sin inscripción.</div>}
        </div>
        <PageNav page={attPage} total={attendanceFamilies.length} onChange={setAttPage} label="familias"/>
      </div>
    </section>}

    {tab==='settings'&&<section className="space-y-4">
      <div className="rounded-[28px] border border-white/70 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h2 className="text-lg font-black text-slate-950">Configuración del evento</h2><p className="text-[11px] text-slate-500">Aforo, plazos, publicación y edición de datos. No se mezclan aquí los listados de personas.</p></div>
          {canEdit&&<button type="button" onClick={onEditEvent} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-[11px] font-bold text-slate-700"><Pencil size={14}/> Editar datos y aforo</button>}
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <div className="rounded-xl bg-slate-50 p-3"><div className="text-[10px] text-slate-500">Aforo máximo</div><div className="mt-1 text-xl font-black">{capacity??'Sin límite'}</div></div>
          <div className="rounded-xl bg-slate-50 p-3"><div className="text-[10px] text-slate-500">Ocupación confirmada</div><div className="mt-1 text-xl font-black">{reserved}</div></div>
          <div className="rounded-xl bg-slate-50 p-3"><div className="text-[10px] text-slate-500">Familias en espera</div><div className="mt-1 text-xl font-black">{waiting.length}</div></div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="text-[11px] font-semibold text-slate-600">{registrationOpen?'Formulario abierto':'Formulario cerrado'}</span>
          {canEdit&&<button type="button" onClick={()=>void onToggleRegistration()} className={'rounded-xl px-3 py-2.5 text-[11px] font-bold text-white '+(registrationOpen?'bg-rose-600':'bg-emerald-600')}>{registrationOpen?'Cerrar inscripciones':'Abrir inscripciones'}</button>}
          <span className="text-[10px] text-slate-400">Las altas y modificaciones internas se gestionan en «Inscripciones».</span>
        </div>
        {detail.registrationDeadline&&<p className="mt-2 text-[10px] text-slate-500">Fecha límite: {new Date(detail.registrationDeadline).toLocaleString('es-ES')}</p>}
        <div className="mt-4 border-t border-slate-100 pt-4">
          <h3 className="text-xs font-black text-slate-800">Enlace y código QR</h3>
          <div className="mt-3 flex flex-wrap items-start gap-4">
            <div className="min-w-0 flex-1">
              <p className="break-all rounded-xl bg-slate-50 p-3 font-mono text-[10px] text-slate-600">{window.location.origin+'/inscripcion/'+detail.registrationToken}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={()=>void onCopyLink()} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-[10px] font-bold text-slate-600"><Copy size={13}/> Copiar enlace</button>
                <a target="_blank" rel="noreferrer" href={window.location.origin+'/inscripcion/'+detail.registrationToken} className="flex items-center gap-2 rounded-xl bg-indigo-600 px-3 py-2.5 text-[10px] font-bold text-white"><ExternalLink size={13}/> Abrir página pública</a>
              </div>
            </div>
            <div className="w-32 shrink-0 text-center">{qrPng?<img className="h-28 w-28 rounded-xl border border-slate-100 p-1" src={qrPng} alt="QR de inscripción"/>:<QrCode className="mx-auto text-slate-300" size={48}/>}
              <div className="mt-2 flex justify-center gap-1"><button type="button" disabled={!qrPng} onClick={()=>onDownloadQr('png')} className="rounded-lg border border-slate-200 px-2 py-1 text-[10px] disabled:opacity-30"><Download size={12} className="inline"/> PNG</button><button type="button" disabled={!qrSvg} onClick={()=>onDownloadQr('svg')} className="rounded-lg border border-slate-200 px-2 py-1 text-[10px] disabled:opacity-30">SVG</button></div>
            </div>
          </div>
        </div>
      </div>
      {canDelete&&<div className="rounded-[24px] border border-rose-100 bg-white p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-xs font-black text-rose-800">Eliminar el evento</h3><p className="mt-1 text-[10px] text-slate-500">Operación irreversible reservada a la administración superior.</p></div><button type="button" onClick={onDeleteEvent} className="flex items-center gap-1 rounded-xl border border-rose-200 px-3 py-2.5 text-[10px] font-bold text-rose-700"><Trash2 size={13}/> Eliminar</button></div></div>}
    </section>}

    {printPreview&&<PdfPreviewModal artifact={printPreview} onClose={()=>setPrintPreview(null)}/>}
  </div>;
}

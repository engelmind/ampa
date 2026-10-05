import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Mail, Phone } from 'lucide-react';
import { Family } from '../types/family';
import { calculateStudentCourse } from '../utils/academicCourse';
import { getFamilyDataIssues } from '../utils/dataQuality';

interface Props {
  families: Family[];
  academicYear: string;
  onSelect: (family: Family) => void;
  pageSize?: number;
}

const relationshipShort=(value:string)=>{
  if(value==='madre') return 'Madre';
  if(value==='padre') return 'Padre';
  if(value==='tutor_legal') return 'Tutor';
  return 'Otro';
};

export function CompactFamilyGrid({families,academicYear,onSelect,pageSize=40}:Props){
  const [page,setPage]=useState(1);
  const pages=Math.max(1,Math.ceil(families.length/pageSize));
  useEffect(()=>setPage(1),[families.length,pageSize]);
  useEffect(()=>{ if(page>pages) setPage(pages); },[page,pages]);
  const visible=useMemo(()=>families.slice((page-1)*pageSize,page*pageSize),[families,page,pageSize]);

  return <div className="space-y-3">
    <div
      className="grid gap-3"
      style={{gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 250px), 1fr))'}}
    >
      {visible.map((family)=>{
        const main=family.guardians.find((g)=>g.isMainContact)||family.guardians[0];
        const issues=getFamilyDataIssues(family);
        const adults=family.guardians
          .map((g)=>`${g.fullName} (${relationshipShort(g.relationship)})`)
          .join(' · ');
        return <button key={family.id} onClick={()=>onSelect(family)} className="group min-w-0 rounded-[22px] border border-white/70 bg-white/90 p-3 text-left shadow-[0_14px_36px_rgba(71,85,105,.07)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_42px_rgba(71,85,105,.11)]">
          <div className="flex items-start gap-2">
            <div className={`mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full ${family.isActiveThisYear?'bg-gradient-to-br from-emerald-400 to-cyan-400':'bg-gradient-to-br from-amber-400 to-orange-400'}`}/>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <div className="truncate text-xs font-black">Familia {family.familyName}</div>
                <div className="shrink-0 font-mono text-[8px] font-bold text-slate-400">{family.membershipNumber}</div>
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-[8px] font-black uppercase tracking-wide text-slate-400">
                <span>{family.guardians.length} adulto{family.guardians.length===1?'':'s'}</span>
                <span>·</span>
                <span>{family.students.length} hijo{family.students.length===1?'':'s'}</span>
                <span>·</span>
                <span>{family.events?.length||0} evento{(family.events?.length||0)===1?'':'s'}</span>
                <span className={`ml-auto ${family.isActiveThisYear?'text-emerald-600':'text-amber-600'}`}>{family.isActiveThisYear?'Activa':'Inactiva'}</span>
              </div>
            </div>
          </div>

          <div className="mt-2.5 min-w-0 rounded-xl bg-slate-50/75 px-2.5 py-2">
            <div className="truncate text-[9px] text-slate-500" title={adults || 'Sin adultos registrados'}>
              <span className="font-black uppercase tracking-wide text-slate-400">Adultos:</span>{' '}
              {adults || 'Sin adultos registrados'}
            </div>
          </div>

          <div className="mt-2 space-y-1 rounded-2xl bg-slate-50/80 p-2.5">
            {family.students.slice(0,3).map((student)=><div key={student.id} className="flex items-center justify-between gap-2 text-[9px]">
              <span className="truncate font-semibold text-slate-700">{student.firstName} {student.lastName}</span>
              <span className="shrink-0 font-semibold text-rose-600">{calculateStudentCourse(student,academicYear).fullDisplay}</span>
            </div>)}
            {family.students.length>3&&<div className="text-[8px] font-bold text-slate-400">+{family.students.length-3} alumno(s)</div>}
            {!family.students.length&&<div className="text-[9px] text-slate-400">Sin alumnos registrados</div>}
          </div>

          <div className="mt-2 flex min-w-0 items-center gap-2 border-t border-slate-100 pt-2.5 text-[8px] text-slate-400">
            {main?.phone&&<span className="flex min-w-0 items-center gap-1"><Phone size={9}/><span className="truncate">{main.phone}</span></span>}
            {main?.email&&<span className="flex min-w-0 items-center gap-1"><Mail size={9}/><span className="max-w-[125px] truncate">{main.email}</span></span>}
            <span className="ml-auto shrink-0 font-bold">{issues.length ? `${issues.length} revisar` : 'Completa'}</span>
          </div>
        </button>;
      })}
    </div>

    {!families.length&&<div className="rounded-[28px] border-2 border-dashed border-white/80 bg-white/70 p-10 text-center text-sm text-slate-400">No hay familias que coincidan con los filtros.</div>}

    {families.length>pageSize&&<div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/70 bg-white/90 px-3 py-2 shadow-[0_10px_28px_rgba(71,85,105,.06)]">
      <div className="text-[11px] text-slate-500">Mostrando {(page-1)*pageSize+1}–{Math.min(page*pageSize,families.length)} de {families.length}</div>
      <div className="flex items-center gap-2"><button disabled={page<=1} onClick={()=>setPage((p)=>Math.max(1,p-1))} className="rounded-xl border border-slate-200 bg-white p-2 shadow-sm disabled:opacity-30"><ChevronLeft size={15}/></button><span className="text-xs font-bold">{page} / {pages}</span><button disabled={page>=pages} onClick={()=>setPage((p)=>Math.min(pages,p+1))} className="rounded-xl border border-slate-200 bg-white p-2 shadow-sm disabled:opacity-30"><ChevronRight size={15}/></button></div>
    </div>}
  </div>;
}

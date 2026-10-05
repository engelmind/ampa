import React, { useEffect, useMemo, useState } from 'react';
import { Baby, CalendarDays, ChevronLeft, ChevronRight, Mail, Phone, UserRound } from 'lucide-react';
import { Family } from '../types/family';
import { calculateStudentCourse } from '../utils/academicCourse';
import { getFamilyDataIssues } from '../utils/dataQuality';

interface Props {
  families: Family[];
  academicYear: string;
  onSelect: (family: Family) => void;
  pageSize?: number;
}

const relationshipLabel=(value:string)=>{
  if(value==='madre') return 'Madre';
  if(value==='padre') return 'Padre';
  if(value==='tutor_legal') return 'Tutor/a legal';
  return 'Otro/a';
};

export function CompactFamilyGrid({families,academicYear,onSelect,pageSize=24}:Props){
  const [page,setPage]=useState(1);
  const pages=Math.max(1,Math.ceil(families.length/pageSize));
  useEffect(()=>setPage(1),[families.length,pageSize]);
  useEffect(()=>{ if(page>pages) setPage(pages); },[page,pages]);
  const visible=useMemo(()=>families.slice((page-1)*pageSize,page*pageSize),[families,page,pageSize]);

  return <div className="space-y-3">
    <div className="grid gap-4 xl:grid-cols-2">
      {visible.map((family)=>{
        const main=family.guardians.find((g)=>g.isMainContact)||family.guardians[0];
        const issues=getFamilyDataIssues(family);
        return <button key={family.id} onClick={()=>onSelect(family)} className="group min-w-0 overflow-hidden rounded-[28px] border border-white/75 bg-white/92 text-left shadow-[0_16px_42px_rgba(71,85,105,.08)] transition hover:-translate-y-0.5 hover:shadow-[0_22px_52px_rgba(71,85,105,.13)]">
          <div className="relative overflow-hidden border-b border-slate-100 bg-gradient-to-br from-white via-white to-indigo-50/80 p-4 sm:p-5">
            <div className="pointer-events-none absolute -right-12 -top-16 h-40 w-40 rounded-full bg-gradient-to-br from-indigo-200/45 to-rose-100/30 blur-xl"/>
            <div className="relative flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${family.isActiveThisYear?'bg-emerald-500':'bg-amber-500'}`}/>
                  <span className="font-mono text-[9px] font-black uppercase tracking-wider text-slate-400">{family.membershipNumber}</span>
                </div>
                <div className="mt-1 truncate text-lg font-black tracking-tight text-slate-900">Familia {family.familyName}</div>
                <div className="mt-1 truncate text-[11px] font-semibold text-slate-400">{main?.fullName || 'Sin contacto principal'}</div>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-[9px] font-black uppercase ${family.isActiveThisYear?'bg-emerald-50 text-emerald-700':'bg-amber-50 text-amber-700'}`}>{family.isActiveThisYear?'Activa':'Inactiva'}</span>
            </div>

            <div className="relative mt-4 grid grid-cols-3 gap-2">
              {[
                ['Adultos',family.guardians.length,UserRound],
                ['Hijos',family.students.length,Baby],
                ['Eventos',family.events?.length||0,CalendarDays],
              ].map(([label,value,Icon]:any)=><div key={label} className="rounded-[18px] border border-white bg-white/80 p-2.5 shadow-sm">
                <Icon size={14} className="text-indigo-400"/>
                <div className="mt-2 text-xl font-black text-slate-950">{value}</div>
                <div className="text-[9px] font-bold text-slate-400">{label}</div>
              </div>)}
            </div>
          </div>

          <div className="grid gap-4 p-4 sm:p-5 md:grid-cols-2">
            <section className="min-w-0">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-[9px] font-black uppercase tracking-[.14em] text-slate-400">Padres / madres / tutores</div>
                <span className="text-[9px] font-bold text-slate-300">{family.guardians.length}</span>
              </div>
              <div className="space-y-2">
                {family.guardians.map((guardian)=><div key={guardian.id} className="rounded-2xl bg-slate-50/90 p-2.5">
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[11px] font-extrabold text-slate-700">{guardian.fullName}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[9px] font-bold uppercase text-slate-400">
                        <span>{relationshipLabel(guardian.relationship)}</span>
                        {guardian.isMainContact&&<span className="rounded-full bg-indigo-50 px-1.5 py-0.5 text-indigo-600">Principal</span>}
                      </div>
                    </div>
                  </div>
                  {(guardian.phone||guardian.email)&&<div className="mt-2 flex min-w-0 flex-wrap gap-x-3 gap-y-1 text-[9px] text-slate-400">
                    {guardian.phone&&<span className="flex items-center gap-1"><Phone size={10}/>{guardian.phone}</span>}
                    {guardian.email&&<span className="flex min-w-0 items-center gap-1"><Mail size={10}/><span className="max-w-[180px] truncate">{guardian.email}</span></span>}
                  </div>}
                </div>)}
                {!family.guardians.length&&<div className="rounded-2xl border border-dashed border-slate-200 p-3 text-center text-[10px] text-slate-400">Sin adultos registrados</div>}
              </div>
            </section>

            <section className="min-w-0">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-[9px] font-black uppercase tracking-[.14em] text-slate-400">Hijos / alumnos</div>
                <span className="text-[9px] font-bold text-slate-300">{family.students.length}</span>
              </div>
              <div className="space-y-2">
                {family.students.map((student)=><div key={student.id} className="rounded-2xl bg-slate-50/90 p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-[11px] font-extrabold text-slate-700">{student.firstName} {student.lastName}</span>
                    <span className="shrink-0 rounded-full bg-white px-2 py-1 text-[9px] font-bold text-indigo-600 shadow-sm">{calculateStudentCourse(student,academicYear).fullDisplay}</span>
                  </div>
                </div>)}
                {!family.students.length&&<div className="rounded-2xl border border-dashed border-slate-200 p-3 text-center text-[10px] text-slate-400">Sin hijos/as registrados</div>}
              </div>
            </section>
          </div>

          <div className="flex items-center gap-2 border-t border-slate-100 px-4 py-3 text-[9px] text-slate-400 sm:px-5">
            <span className="font-bold">{issues.length ? `${issues.length} dato(s) a revisar` : 'Ficha completa'}</span>
            <span className="ml-auto font-black text-indigo-500 opacity-70 transition group-hover:opacity-100">Abrir ficha →</span>
          </div>
        </button>;
      })}
    </div>

    {!families.length&&<div className="rounded-[28px] border-2 border-dashed border-white/80 bg-white/70 p-10 text-center text-sm text-slate-400">No hay familias que coincidan con los filtros.</div>}

    {families.length>pageSize&&<div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/70 bg-white/90 px-3 py-2 shadow-[0_10px_28px_rgba(71,85,105,.06)]">
      <div className="text-[11px] text-slate-500">Mostrando {(page-1)*pageSize+1}–{Math.min(page*pageSize,families.length)} de {families.length}</div>
      <div className="flex items-center gap-2"><button disabled={page<=1} onClick={(e)=>{e.stopPropagation();setPage((p)=>Math.max(1,p-1));}} className="rounded-xl border border-slate-200 bg-white p-2 shadow-sm disabled:opacity-30"><ChevronLeft size={15}/></button><span className="text-xs font-bold">{page} / {pages}</span><button disabled={page>=pages} onClick={(e)=>{e.stopPropagation();setPage((p)=>Math.min(pages,p+1));}} className="rounded-xl border border-slate-200 bg-white p-2 shadow-sm disabled:opacity-30"><ChevronRight size={15}/></button></div>
    </div>}
  </div>;
}

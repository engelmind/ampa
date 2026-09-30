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

export function CompactFamilyGrid({families,academicYear,onSelect,pageSize=40}:Props){
  const [page,setPage]=useState(1);
  const pages=Math.max(1,Math.ceil(families.length/pageSize));
  useEffect(()=>setPage(1),[families.length,pageSize]);
  useEffect(()=>{ if(page>pages) setPage(pages); },[page,pages]);
  const visible=useMemo(()=>families.slice((page-1)*pageSize,page*pageSize),[families,page,pageSize]);

  return <div className="space-y-3">
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {visible.map((family)=>{
        const main=family.guardians.find((g)=>g.isMainContact)||family.guardians[0];
        const issues=getFamilyDataIssues(family);
        return <button key={family.id} onClick={()=>onSelect(family)} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-3 text-left hover:border-slate-300 hover:shadow-sm">
          <div className="flex items-start gap-2">
            <div className={`mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full ${family.isActiveThisYear?'bg-emerald-500':'bg-amber-500'}`}/>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2"><div className="truncate text-xs font-black">Familia {family.familyName}</div><div className="shrink-0 font-mono text-[9px] font-bold text-slate-400">{family.membershipNumber}</div></div>
              {main&&<div className="mt-1 truncate text-[10px] text-slate-500">{main.fullName}</div>}
            </div>
          </div>

          <div className="mt-2 space-y-1">
            {family.students.slice(0,3).map((student)=><div key={student.id} className="flex items-center justify-between gap-2 text-[10px]"><span className="truncate font-semibold text-slate-700">{student.firstName} {student.lastName}</span><span className="shrink-0 text-rose-600">{calculateStudentCourse(student,academicYear).fullDisplay}</span></div>)}
            {family.students.length>3&&<div className="text-[9px] font-bold text-slate-400">+{family.students.length-3} alumno(s)</div>}
            {!family.students.length&&<div className="text-[10px] text-slate-400">Sin alumnos registrados</div>}
          </div>

          <div className="mt-2 flex min-w-0 items-center gap-2 border-t border-slate-100 pt-2 text-[9px] text-slate-400">
            {main?.phone&&<span className="flex min-w-0 items-center gap-1"><Phone size={10}/><span className="truncate">{main.phone}</span></span>}
            {main?.email&&<span className="flex min-w-0 items-center gap-1"><Mail size={10}/><span className="truncate">{main.email}</span></span>}
            <span className="ml-auto shrink-0">{issues.length ? `${issues.length} revisar` : 'Completa'}</span>
          </div>
        </button>;
      })}
    </div>

    {!families.length&&<div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-400">No hay familias que coincidan con los filtros.</div>}

    {families.length>pageSize&&<div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2">
      <div className="text-[11px] text-slate-500">Mostrando {(page-1)*pageSize+1}–{Math.min(page*pageSize,families.length)} de {families.length}</div>
      <div className="flex items-center gap-2"><button disabled={page<=1} onClick={()=>setPage((p)=>Math.max(1,p-1))} className="rounded-lg border border-slate-200 p-2 disabled:opacity-30"><ChevronLeft size={15}/></button><span className="text-xs font-bold">{page} / {pages}</span><button disabled={page>=pages} onClick={()=>setPage((p)=>Math.min(pages,p+1))} className="rounded-lg border border-slate-200 p-2 disabled:opacity-30"><ChevronRight size={15}/></button></div>
    </div>}
  </div>;
}

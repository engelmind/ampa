import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Family } from '../types/family';
import { calculateStudentCourse } from '../utils/academicCourse';

interface Props {
  families: Family[];
  academicYear: string;
  onSelect: (family: Family) => void;
  pageSize?: number;
}

export function CompactFamilyList({families,academicYear,onSelect,pageSize=80}:Props){
  const [page,setPage]=useState(1);
  const pages=Math.max(1,Math.ceil(families.length/pageSize));
  useEffect(()=>setPage(1),[families.length,pageSize]);
  useEffect(()=>{ if(page>pages) setPage(pages); },[page,pages]);

  const visible=useMemo(
    ()=>families.slice((page-1)*pageSize,page*pageSize),
    [families,page,pageSize]
  );

  return <div className="space-y-3">
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
      <div className="min-w-[1180px]">
        <div className="grid grid-cols-[90px_220px_220px_160px_1fr_82px] gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 text-[9px] font-black uppercase tracking-wider text-slate-400">
          <span>Socio</span><span>Familia</span><span>Contacto</span><span>Teléfono</span><span>Alumnos</span><span>Estado</span>
        </div>
        <div className="divide-y divide-slate-100">
          {visible.map((family)=>{
            const main=family.guardians.find((g)=>g.isMainContact)||family.guardians[0];
            const students=family.students.map((student)=> {
              const course=calculateStudentCourse(student,academicYear).fullDisplay;
              return `${student.firstName} ${student.lastName} · ${course}`;
            }).join('  ·  ');
            return <button
              key={family.id}
              type="button"
              onClick={()=>onSelect(family)}
              className="grid w-full grid-cols-[90px_220px_220px_160px_1fr_82px] items-center gap-2 px-3 py-1.5 text-left text-[11px] hover:bg-slate-50"
            >
              <span className="flex items-center gap-2 font-mono font-bold text-slate-500">
                <span className={`h-2 w-2 shrink-0 rounded-full ${family.isActiveThisYear?'bg-emerald-500':'bg-amber-500'}`}/>
                {family.membershipNumber}
              </span>
              <span className="truncate font-extrabold text-slate-800">{family.familyName}</span>
              <span className="truncate text-slate-600">{main?.fullName || 'Sin contacto'}</span>
              <span className="truncate text-slate-500">{main?.phone || main?.email || '—'}</span>
              <span className="truncate text-slate-600" title={students || 'Sin alumnos'}>{students || 'Sin alumnos'}</span>
              <span className={`text-[9px] font-black uppercase ${family.isActiveThisYear?'text-emerald-700':'text-amber-700'}`}>
                {family.isActiveThisYear?'Activa':'Inactiva'}
              </span>
            </button>;
          })}
          {!visible.length&&<div className="p-10 text-center text-sm text-slate-400">No hay familias que coincidan con los filtros.</div>}
        </div>
      </div>
    </div>

    {families.length>pageSize&&<div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2">
      <div className="text-[11px] text-slate-500">Mostrando {(page-1)*pageSize+1}–{Math.min(page*pageSize,families.length)} de {families.length}</div>
      <div className="flex items-center gap-2">
        <button disabled={page<=1} onClick={()=>setPage((p)=>Math.max(1,p-1))} className="rounded-lg border border-slate-200 p-2 disabled:opacity-30"><ChevronLeft size={15}/></button>
        <span className="text-xs font-bold">{page} / {pages}</span>
        <button disabled={page>=pages} onClick={()=>setPage((p)=>Math.min(pages,p+1))} className="rounded-lg border border-slate-200 p-2 disabled:opacity-30"><ChevronRight size={15}/></button>
      </div>
    </div>}
  </div>;
}

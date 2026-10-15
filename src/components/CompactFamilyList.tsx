import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Family } from '../types/family';
import { FamilyMembersGrid } from './FamilyMembersGrid';

interface Props {
  families: Family[];
  academicYear: string;
  onSelect: (family: Family) => void;
  pageSize?: number;
}

export function CompactFamilyList({families,academicYear,onSelect,pageSize=100}:Props){
  const [page,setPage]=useState(1);
  const pages=Math.max(1,Math.ceil(families.length/pageSize));
  useEffect(()=>setPage(1),[families.length,pageSize]);
  useEffect(()=>{ if(page>pages) setPage(pages); },[page,pages]);

  const visible=useMemo(
    ()=>families.slice((page-1)*pageSize,page*pageSize),
    [families,page,pageSize]
  );

  return <div className="space-y-3">
    <div className="overflow-x-auto rounded-[24px] border border-white/70 bg-white/90 shadow-[0_14px_34px_rgba(71,85,105,.07)]">
      <div className="min-w-[1160px]">
        <div className="grid grid-cols-[92px_180px_1fr_72px] items-center gap-3 border-b border-slate-100 bg-slate-50/85 px-4 py-2 text-[8px] font-black uppercase tracking-[.13em] text-slate-400">
          <span>Socio</span>
          <span>Familia</span>
          <span>Unidad familiar · adultos primero, hijos después</span>
          <span>Estado</span>
        </div>
        <div className="divide-y divide-slate-100">
          {visible.map((family)=>(
            <button
              key={family.id}
              type="button"
              onClick={()=>onSelect(family)}
              className="group grid w-full grid-cols-[92px_180px_1fr_72px] items-start gap-3 px-4 py-2 text-left text-[10px] transition hover:bg-indigo-50/45"
            >
              <span className="flex min-w-0 items-center gap-1.5 pt-2 font-mono font-bold text-slate-500">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${family.isActiveThisYear?'bg-emerald-500':'bg-amber-500'}`}/>
                <span className="truncate">{family.membershipNumber}</span>
              </span>
              <span className="min-w-0 pt-1.5">
                <span className="block truncate font-extrabold text-slate-800">{family.familyName}</span>
                <span className="mt-1 block text-[8px] font-bold text-slate-400">{family.guardians.length} adulto{family.guardians.length===1?'':'s'} · {family.students.length} hijo{family.students.length===1?'':'s'}</span>
              </span>
              <FamilyMembersGrid family={family} academicYear={academicYear} variant="list"/>
              <span className={`pt-2 text-[8px] font-black uppercase ${family.isActiveThisYear?'text-emerald-700':'text-amber-700'}`}>
                {family.isActiveThisYear?'Activa':'Inactiva'}
              </span>
            </button>
          ))}
          {!visible.length&&<div className="p-10 text-center text-sm text-slate-400">No hay familias que coincidan con los filtros.</div>}
        </div>
      </div>
    </div>

    {families.length>pageSize&&<div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2">
      <div className="text-[11px] text-slate-500">Mostrando {(page-1)*pageSize+1}–{Math.min(page*pageSize,families.length)} de {families.length}</div>
      <div className="flex items-center gap-2">
        <button disabled={page<=1} onClick={()=>setPage((p)=>Math.max(1,p-1))} className="rounded-xl border border-slate-200 bg-white p-2 shadow-sm disabled:opacity-30"><ChevronLeft size={15}/></button>
        <span className="text-xs font-bold">{page} / {pages}</span>
        <button disabled={page>=pages} onClick={()=>setPage((p)=>Math.min(pages,p+1))} className="rounded-xl border border-slate-200 bg-white p-2 shadow-sm disabled:opacity-30"><ChevronRight size={15}/></button>
      </div>
    </div>}
  </div>;
}

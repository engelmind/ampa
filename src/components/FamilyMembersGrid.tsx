import React from 'react';
import { Baby, Mail, Phone, UserRound } from 'lucide-react';
import { Family } from '../types/family';
import { calculateStudentCourse } from '../utils/academicCourse';

interface Props {
  family: Family;
  academicYear: string;
  variant?: 'card' | 'list' | 'table';
}

const relationshipLabel=(value:string)=>{
  if(value==='madre') return 'Madre';
  if(value==='padre') return 'Padre';
  if(value==='tutor_legal') return 'Tutor/a legal';
  return 'Adulto';
};

export function FamilyMembersGrid({family,academicYear,variant='table'}:Props){
  const gridClass=variant==='card'
    ? 'grid grid-cols-1 gap-1.5'
    : variant==='list'
      ? 'grid grid-cols-2 gap-1.5 xl:grid-cols-3'
      : 'grid grid-cols-1 gap-1.5 lg:grid-cols-2 xl:grid-cols-3';

  return <div className={gridClass}>
    {family.guardians.map((guardian)=>(
      <div key={'g-'+guardian.id} className="min-w-0 rounded-xl border border-indigo-100 bg-indigo-50/55 px-2.5 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <UserRound size={12} className="shrink-0 text-indigo-500"/>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[10px] font-extrabold text-slate-800">{guardian.fullName || 'Adulto sin nombre'}</div>
            <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[8px] font-bold text-indigo-600">
              <span className="shrink-0 uppercase">{relationshipLabel(guardian.relationship)}</span>
              {guardian.isMainContact&&<span className="shrink-0 text-slate-400">· principal</span>}
            </div>
          </div>
        </div>
        {(guardian.phone||guardian.email)&&variant!=='card'&&<div className="mt-1.5 flex min-w-0 flex-wrap gap-x-2 gap-y-1 border-t border-indigo-100 pt-1.5 text-[8px] text-slate-400">
          {guardian.phone&&<span className="flex min-w-0 items-center gap-1"><Phone size={9}/><span className="truncate">{guardian.phone}</span></span>}
          {guardian.email&&<span className="flex min-w-0 items-center gap-1"><Mail size={9}/><span className="max-w-[150px] truncate">{guardian.email}</span></span>}
        </div>}
      </div>
    ))}

    {family.students.map((student)=>(
      <div key={'s-'+student.id} className="min-w-0 rounded-xl border border-rose-100 bg-rose-50/50 px-2.5 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Baby size={12} className="shrink-0 text-rose-500"/>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[10px] font-extrabold text-slate-800">{student.firstName} {student.lastName}</div>
            <div className="mt-0.5 truncate text-[8px] font-bold text-rose-600">{calculateStudentCourse(student,academicYear).fullDisplay}</div>
          </div>
        </div>
      </div>
    ))}

    {!family.guardians.length&&!family.students.length&&(
      <div className="rounded-xl border border-dashed border-slate-200 px-3 py-2 text-[9px] text-slate-400">Sin componentes registrados</div>
    )}
  </div>;
}

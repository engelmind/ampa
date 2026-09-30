import React, { useMemo } from 'react';
import { CalendarRange, CheckCircle2, GraduationCap, RefreshCcw } from 'lucide-react';
import { Family, SystemSettings } from '../types/family';
import { calculateStudentCourse, getNextAcademicYear } from '../utils/academicCourse';

interface Props {
  families: Family[];
  settings: SystemSettings;
  canEdit: boolean;
  onAdvanceYear: (newYear: string) => void;
}

export function CoursesView({ families, settings, canEdit, onAdvanceYear }: Props) {
  const nextYear = getNextAcademicYear(settings.activeAcademicYear);
  const students = families.flatMap((f) => f.students.map((student)=>({student,family:f})));

  const courseCounts = useMemo(() => {
    const counts = new Map<string,{label:string;stage:string;count:number;order:number}>();
    students.forEach(({student}) => {
      const course = calculateStudentCourse(student,settings.activeAcademicYear);
      const current = counts.get(course.fullDisplay);
      counts.set(course.fullDisplay,{
        label:course.fullDisplay,
        stage:course.stageName,
        count:(current?.count || 0) + 1,
        order:course.isGraduated ? 99 : course.ageInAcademicYear,
      });
    });
    return Array.from(counts.values()).sort((a,b)=>a.order-b.order || a.label.localeCompare(b.label,'es'));
  },[families,settings.activeAcademicYear]);

  const active = families.filter((f) => f.isActiveThisYear).length;
  const pending = families.length - active;

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-bold uppercase tracking-[.18em] text-slate-400">Cursos y renovaciones</p>
        <h1 className="text-2xl font-black">Curso {settings.activeAcademicYear}</h1>
        <p className="mt-1 text-xs text-slate-500">Los cursos se recalculan automáticamente desde la fecha de nacimiento de cada alumno/a. La corrección manual ±1 sólo se conserva para excepciones.</p>
      </div>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <CalendarRange size={18} className="text-slate-400"/>
          <div className="mt-3 text-2xl font-black">{settings.activeAcademicYear}</div>
          <div className="text-xs text-slate-500">Curso activo</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <CheckCircle2 size={18} className="text-emerald-500"/>
          <div className="mt-3 text-2xl font-black">{active}</div>
          <div className="text-xs text-slate-500">Familias renovadas</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <RefreshCcw size={18} className="text-amber-500"/>
          <div className="mt-3 text-2xl font-black">{pending}</div>
          <div className="text-xs text-slate-500">Pendientes de renovación</div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="mb-4 flex items-center gap-2"><GraduationCap size={18}/><div><h2 className="text-sm font-extrabold">Distribución por curso calculado</h2><p className="text-xs text-slate-500">Resultado actual para {settings.activeAcademicYear}.</p></div></div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {courseCounts.map((course) => (
            <div key={course.label} className="rounded-xl bg-slate-50 p-3">
              <div className="text-xs font-bold text-slate-700">{course.label}</div>
              <div className="mt-1 text-[10px] text-slate-400">{course.stage}</div>
              <div className="mt-2 text-xl font-black">{course.count}</div>
            </div>
          ))}
          {!courseCounts.length && <div className="text-sm text-slate-400">No hay alumnos registrados.</div>}
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 p-4"><h2 className="text-sm font-extrabold">Alumnos y curso actual</h2><p className="text-xs text-slate-500">Comprobación individual del cálculo.</p></div>
        <div className="divide-y divide-slate-100">
          {students.map(({student,family})=>{
            const course=calculateStudentCourse(student,settings.activeAcademicYear);
            return <div key={student.id} className="grid gap-1 p-3.5 sm:grid-cols-[1fr_150px_120px] sm:items-center">
              <div><div className="text-xs font-bold">{student.firstName} {student.lastName}</div><div className="text-[10px] text-slate-400">Familia {family.familyName} · {student.birthDateDDMMAAAA ? student.birthDateDDMMAAAA.replace(/(\d{2})(\d{2})(\d{4})/,'$1/$2/$3') : student.birthYear}</div></div>
              <div className="text-xs font-extrabold text-rose-600">{course.fullDisplay}</div>
              <div className="text-[10px] text-slate-400">{student.courseOffset ? `Corrección ${student.courseOffset>0?'+':''}${student.courseOffset}` : 'Cálculo automático'}</div>
            </div>;
          })}
          {!students.length&&<div className="p-8 text-center text-sm text-slate-400">No hay alumnos registrados.</div>}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-extrabold">Preparar siguiente curso</h2>
        <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">Al iniciar {nextYear}, el histórico se conserva, las familias quedan pendientes de renovación y los cursos de todos los alumnos se recalculan automáticamente para el nuevo año académico.</p>
        {canEdit && (
          <button type="button" onClick={() => onAdvanceYear(nextYear)} className="mt-4 min-h-11 rounded-xl bg-slate-900 px-4 text-xs font-bold text-white">
            Abrir curso {nextYear}
          </button>
        )}
      </section>
    </div>
  );
}

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
  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    families.flatMap((f) => f.students).forEach((s) => {
      const stage = calculateStudentCourse(s, settings.activeAcademicYear).stageName;
      counts[stage] = (counts[stage] || 0) + 1;
    });
    return counts;
  }, [families, settings.activeAcademicYear]);

  const active = families.filter((f) => f.isActiveThisYear).length;
  const pending = families.length - active;

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-bold uppercase tracking-[.18em] text-slate-400">Cursos y renovaciones</p>
        <h1 className="text-2xl font-black">Curso {settings.activeAcademicYear}</h1>
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
        <div className="mb-4 flex items-center gap-2"><GraduationCap size={18}/><h2 className="text-sm font-extrabold">Distribución de alumnos por etapa</h2></div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {Object.entries(stageCounts).map(([stage,count]) => (
            <div key={stage} className="rounded-xl bg-slate-50 p-3">
              <div className="text-xs text-slate-500">{stage}</div>
              <div className="mt-1 text-xl font-black">{count}</div>
            </div>
          ))}
          {!Object.keys(stageCounts).length && <div className="text-sm text-slate-400">No hay alumnos registrados.</div>}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-extrabold">Preparar siguiente curso</h2>
        <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">Al iniciar {nextYear}, el histórico de cursos se conserva y las familias quedan pendientes de renovación hasta que se confirme su cuota.</p>
        {canEdit && (
          <button type="button" onClick={() => onAdvanceYear(nextYear)} className="mt-4 min-h-11 rounded-xl bg-slate-900 px-4 text-xs font-bold text-white">
            Abrir curso {nextYear}
          </button>
        )}
      </section>
    </div>
  );
}

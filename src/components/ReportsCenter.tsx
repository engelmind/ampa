import React, { useState } from 'react';
import { AlertTriangle, ContactRound, FileCheck2, FileText, GraduationCap, History, LayoutGrid, ShieldCheck, Users, X } from 'lucide-react';
import { AppRole, Family, SystemSettings } from '../types/family';
import { createReportPdfArtifact, PdfArtifact, ReportKind } from '../utils/pdfExportUtils';

interface Props {
  allFamilies: Family[];
  filteredFamilies: Family[];
  settings: SystemSettings;
  role: AppRole;
  onPreview: (artifact: PdfArtifact) => void;
  onClose: () => void;
}

const REPORTS:Array<{kind:ReportKind;title:string;description:string;icon:any;restricted?:boolean}>=[
  {kind:'family-census',title:'Censo de familias',description:'Familias, contacto principal, alumnos y estado.',icon:Users},
  {kind:'active-families',title:'Familias activas',description:'Familias con la cuota actual pagada.',icon:FileCheck2},
  {kind:'inactive-families',title:'Familias inactivas',description:'Familias con la cuota actual pendiente.',icon:AlertTriangle},
  {kind:'students',title:'Listado de alumnos',description:'Alumno, familia, nacimiento, curso y grupo.',icon:GraduationCap},
  {kind:'students-by-course',title:'Alumnos por curso',description:'Ordenados por curso calculado y fecha de nacimiento.',icon:GraduationCap},
  {kind:'guardians',title:'Tutores y contactos',description:'Padres, madres y tutores con teléfono y email.',icon:ContactRound},
  {kind:'incomplete',title:'Fichas incompletas',description:'Datos pendientes de revisar por familia.',icon:AlertTriangle},
  {kind:'course-history',title:'Histórico de cursos',description:'Cursos asociados históricamente a cada familia.',icon:History},
  {kind:'compact-family-cards',title:'Fichas familiares compactas',description:'8 fichas por A4. Pensado para censos muy grandes.',icon:LayoutGrid},
  {kind:'sensitive-needs',title:'Alergias y necesidades',description:'Informe restringido con datos especialmente sensibles.',icon:ShieldCheck,restricted:true},
];

export function ReportsCenter({allFamilies,filteredFamilies,settings,role,onPreview,onClose}:Props){
  const [scope,setScope]=useState<'filtered'|'all'>('filtered');
  const [busy,setBusy]=useState<ReportKind|null>(null);
  const source=scope==='filtered'?filteredFamilies:allFamilies;

  const open=(kind:ReportKind)=>{
    setBusy(kind);
    try{
      const report=createReportPdfArtifact(kind,source,settings);
      onPreview(report);
    }finally{setBusy(null);}
  };

  return <div className="fixed inset-0 z-[75] flex items-end justify-center bg-slate-950/65 sm:items-center sm:p-4">
    <div className="max-h-[94vh] w-full max-w-5xl overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-slate-100 bg-white/95 p-5 backdrop-blur">
        <div className="min-w-0 flex-1"><div className="text-[10px] font-black uppercase tracking-wider text-slate-400">Documentación</div><h2 className="text-lg font-black">Centro de informes PDF</h2><p className="mt-1 text-xs text-slate-500">Todos los documentos se previsualizan antes de descargarlos.</p></div>
        <div className="flex rounded-xl bg-slate-100 p-1">
          <button onClick={()=>setScope('filtered')} className={`min-h-9 rounded-lg px-3 text-xs font-bold ${scope==='filtered'?'bg-white shadow-sm':'text-slate-500'}`}>Filtro actual · {filteredFamilies.length}</button>
          <button onClick={()=>setScope('all')} className={`min-h-9 rounded-lg px-3 text-xs font-bold ${scope==='all'?'bg-white shadow-sm':'text-slate-500'}`}>Todo el censo · {allFamilies.length}</button>
        </div>
        <button onClick={onClose} className="rounded-xl p-2 hover:bg-slate-100"><X size={19}/></button>
      </div>
      <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
        {REPORTS.map(({kind,title,description,icon:Icon,restricted})=>{
          const blocked=!!restricted && role==='user';
          return <button key={kind} disabled={blocked||!!busy} onClick={()=>open(kind)} className="group rounded-2xl border border-slate-200 p-4 text-left hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">
            <div className="flex items-start gap-3"><div className="rounded-xl bg-slate-100 p-2 text-slate-600 group-hover:bg-white"><Icon size={18}/></div><div className="min-w-0"><div className="text-sm font-black">{title}</div><div className="mt-1 text-xs leading-5 text-slate-500">{description}</div>{blocked&&<div className="mt-2 text-[10px] font-bold uppercase text-rose-600">Sólo administración</div>}{busy===kind&&<div className="mt-2 text-[10px] font-bold text-slate-400">Generando…</div>}</div></div>
          </button>;
        })}
      </div>
      <div className="border-t border-slate-100 p-4 text-[11px] leading-5 text-slate-500">
        <FileText size={14} className="mr-1 inline"/> Para un censo de 500 familias, la opción <strong>Fichas familiares compactas</strong> genera 8 fichas por página y evita una ficha completa por página.
      </div>
    </div>
  </div>;
}

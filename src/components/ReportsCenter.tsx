import React, { useMemo, useState } from 'react';
import { AlertTriangle, ContactRound, FileText, GraduationCap, LayoutGrid, Rows3, ShieldCheck, Users, X } from 'lucide-react';
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

type ReportDefinition = {
  kind: ReportKind;
  title: string;
  description: string;
  icon: any;
  category: 'Familias' | 'Alumnado' | 'Control';
  restricted?: boolean;
};

const REPORTS:ReportDefinition[]=[
  {kind:'family-census',title:'Censo detallado',description:'Una fila por familia con contacto principal, alumnos, curso y estado.',icon:Users,category:'Familias'},
  {kind:'compact-family-list',title:'Lista compacta',description:'Una sola línea por familia. Pensada para revisar grandes censos con rapidez.',icon:Rows3,category:'Familias'},
  {kind:'compact-family-cards',title:'Fichas familiares compactas',description:'8 unidades familiares por A4, con contacto, alumnos y dirección.',icon:LayoutGrid,category:'Familias'},
  {kind:'guardians',title:'Tutores y contactos',description:'Padres, madres y tutores con teléfono, email y relación familiar.',icon:ContactRound,category:'Familias'},
  {kind:'students-by-course',title:'Alumnado por curso',description:'Alumnos ordenados por curso, familia, nacimiento y grupo.',icon:GraduationCap,category:'Alumnado'},
  {kind:'incomplete',title:'Fichas incompletas',description:'Sólo familias con datos que conviene completar o revisar.',icon:AlertTriangle,category:'Control'},
  {kind:'sensitive-needs',title:'Alergias y necesidades',description:'Informe restringido. Sólo muestra alumnos con información sensible registrada.',icon:ShieldCheck,category:'Control',restricted:true},
];

export function ReportsCenter({allFamilies,filteredFamilies,settings,role,onPreview,onClose}:Props){
  const [scope,setScope]=useState<'filtered'|'all'>('filtered');
  const [busy,setBusy]=useState<ReportKind|null>(null);
  const source=scope==='filtered'?filteredFamilies:allFamilies;

  const sensitiveCount=useMemo(
    ()=>source.reduce((n,f)=>n+f.students.filter((s)=>s.allergies||s.specialNeeds).length,0),
    [source]
  );

  const open=(kind:ReportKind)=>{
    setBusy(kind);
    try{
      const report=createReportPdfArtifact(kind,source,settings);
      onPreview(report);
    }finally{setBusy(null);}
  };

  const categories:Array<ReportDefinition['category']>=['Familias','Alumnado','Control'];

  return <div className="fixed inset-0 z-[75] flex items-end justify-center bg-slate-950/65 sm:items-center sm:p-4">
    <div className="max-h-[94vh] w-full max-w-5xl overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-slate-100 bg-white/95 p-5 backdrop-blur">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">Documentación</div>
          <h2 className="text-lg font-black">Centro de informes PDF</h2>
          <p className="mt-1 text-xs text-slate-500">Cada informe tiene una función distinta. Todos se previsualizan antes de descargar.</p>
        </div>
        <div className="flex rounded-xl bg-slate-100 p-1">
          <button onClick={()=>setScope('filtered')} className={`min-h-9 rounded-lg px-3 text-xs font-bold ${scope==='filtered'?'bg-white shadow-sm':'text-slate-500'}`}>Filtro actual · {filteredFamilies.length}</button>
          <button onClick={()=>setScope('all')} className={`min-h-9 rounded-lg px-3 text-xs font-bold ${scope==='all'?'bg-white shadow-sm':'text-slate-500'}`}>Todo el censo · {allFamilies.length}</button>
        </div>
        <button onClick={onClose} className="rounded-xl p-2 hover:bg-slate-100"><X size={19}/></button>
      </div>

      <div className="space-y-6 p-5">
        <div className="rounded-2xl bg-slate-50 p-4 text-[11px] leading-5 text-slate-600">
          <FileText size={14} className="mr-1 inline"/>
          El <strong>Filtro actual</strong> respeta la búsqueda y los filtros del Directorio. Así puede obtener, por ejemplo, sólo familias activas, sólo inactivas, una etapa educativa concreta o las fichas pendientes de completar sin crear informes duplicados.
        </div>

        {categories.map((category)=>{
          const reports=REPORTS.filter((report)=>report.category===category);
          return <section key={category}>
            <div className="mb-2 text-[10px] font-black uppercase tracking-[.16em] text-slate-400">{category}</div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {reports.map(({kind,title,description,icon:Icon,restricted})=>{
                const roleBlocked=!!restricted && role==='user';
                const noSensitiveData=kind==='sensitive-needs' && sensitiveCount===0;
                const blocked=roleBlocked||noSensitiveData;
                return <button key={kind} disabled={blocked||!!busy} onClick={()=>open(kind)} className="group rounded-2xl border border-slate-200 p-4 text-left hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">
                  <div className="flex items-start gap-3">
                    <div className="rounded-xl bg-slate-100 p-2 text-slate-600 group-hover:bg-white"><Icon size={18}/></div>
                    <div className="min-w-0">
                      <div className="text-sm font-black">{title}</div>
                      <div className="mt-1 text-xs leading-5 text-slate-500">{description}</div>
                      {roleBlocked&&<div className="mt-2 text-[10px] font-bold uppercase text-rose-600">Sólo administración</div>}
                      {noSensitiveData&&<div className="mt-2 text-[10px] font-bold uppercase text-slate-400">Sin datos registrados</div>}
                      {busy===kind&&<div className="mt-2 text-[10px] font-bold text-slate-400">Generando…</div>}
                    </div>
                  </div>
                </button>;
              })}
            </div>
          </section>;
        })}
      </div>
    </div>
  </div>;
}

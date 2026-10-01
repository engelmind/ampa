import React, { useMemo, useState } from 'react';
import { CalendarDays, History, Mail, MapPin, Phone, ShieldCheck, UserRound, GraduationCap, Pencil, RefreshCcw, X, CreditCard, Trash2 } from 'lucide-react';
import { ActivityLogEntry, Family, SystemSettings } from '../types/family';
import { calculateStudentCourse } from '../utils/academicCourse';
import { parseDDMMAAAA } from '../utils/dateUtils';
import { createMembershipCardPdfArtifact, PdfArtifact } from '../utils/pdfExportUtils';
import { PdfPreviewModal } from './PdfPreviewModal';
import { EmailCardModal } from './EmailCardModal';
import { getFamilyDataIssues } from '../utils/dataQuality';

type Section = 'family' | 'students' | 'history' | 'privacy';

interface Props {
  family: Family;
  settings: SystemSettings;
  activity: ActivityLogEntry[];
  canEdit: boolean;
  onClose: () => void;
  onEdit: () => void;
  onToggleRenewal: () => void;
  canDelete?: boolean;
  onDelete?: () => void;
  onNotify?: (type:'success'|'error'|'info',title:string,message?:string)=>void;
}

export function FamilyDetail({ family, settings, activity, canEdit, onClose, onEdit, onToggleRenewal, canDelete, onDelete, onNotify }: Props) {
  const [section, setSection] = useState<Section>('family');
  const [cardArtifact,setCardArtifact]=useState<PdfArtifact|null>(null);
  const [showEmail,setShowEmail]=useState(false);
  const [buildingCard,setBuildingCard]=useState(false);
  const issues = useMemo(()=>getFamilyDataIssues(family),[family]);
  const familyActivity = useMemo(
    () => activity.filter((a) => a.entityType === 'family' && a.entityId === family.id),
    [activity, family.id]
  );

  const openCardPreview = async () => {
    setBuildingCard(true);
    try {
      setCardArtifact(await createMembershipCardPdfArtifact(family,settings.activeAcademicYear,settings.associationName));
    } catch {
      onNotify?.('error','No se pudo generar el carnet');
    } finally {
      setBuildingCard(false);
    }
  };

  const sections: Array<[Section, string, React.ComponentType<{ size?: number }>]> = [
    ['family', 'Familia', UserRound],
    ['students', 'Alumnos', GraduationCap],
    ['history', 'Historial', History],
    ['privacy', 'Privacidad', ShieldCheck],
  ];

  return (
    <>
      {cardArtifact && <PdfPreviewModal artifact={cardArtifact} onClose={()=>setCardArtifact(null)} onEmail={canEdit ? ()=>setShowEmail(true) : undefined} emailLabel="Enviar carnet"/>}
      {cardArtifact && showEmail && <EmailCardModal family={family} artifact={cardArtifact} academicYear={settings.activeAcademicYear} onClose={()=>setShowEmail(false)} onSent={(recipient)=>onNotify?.('success','Carnet enviado',recipient)}/>}
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-950/55 p-0 sm:items-center sm:p-4">
      <div className="max-h-[94vh] w-full max-w-4xl overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
        <div className="sticky top-0 z-10 border-b border-slate-100 bg-white/95 backdrop-blur">
          <div className="flex items-center justify-between p-5">
            <div>
              <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">{family.membershipNumber}</div>
              <h2 className="text-xl font-black">Familia {family.familyName}</h2>
              <div className="mt-1 text-xs text-slate-500">
                Alta {new Date(family.registrationDate).toLocaleDateString('es-ES')} · {family.isActiveThisYear ? 'Activa' : 'Pendiente de renovación'}
              </div>
            </div>
            <button type="button" onClick={onClose} aria-label="Cerrar ficha" className="rounded-xl p-2 hover:bg-slate-100"><X size={20}/></button>
          </div>
          <div className="flex gap-1 overflow-x-auto px-4 pb-3">
            {sections.map(([id,label,Icon]) => (
              <button key={id} type="button" onClick={() => setSection(id)} className={`flex min-h-10 shrink-0 items-center gap-2 rounded-xl px-3 text-xs font-bold ${section === id ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}>
                <Icon size={15}/>{label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-5 sm:p-6">
          {section === 'family' && (
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl bg-slate-50 p-4">
                  <div className="text-[10px] font-black uppercase text-slate-400">Estado</div>
                  <div className={`mt-2 font-extrabold ${family.isActiveThisYear ? 'text-emerald-700' : 'text-amber-700'}`}>{family.isActiveThisYear ? 'Renovada' : 'Pendiente'}</div>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  <div className="text-[10px] font-black uppercase text-slate-400">Curso de alta</div>
                  <div className="mt-2 text-sm font-bold">{family.registrationAcademicYear || family.activeYears[0] || '—'}</div>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  <div className="text-[10px] font-black uppercase text-slate-400">Histórico de cuotas</div>
                  <div className="mt-2 text-sm font-bold">{family.activeYears.length} curso(s)</div>
                </div>
              </div>

              {issues.length>0 && <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4"><div className="text-xs font-black uppercase tracking-wider text-amber-700">Datos que conviene completar</div><div className="mt-2 flex flex-wrap gap-2">{issues.map((i)=><span key={i.code} className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-amber-800">{i.label}</span>)}</div></section>}

              <section>
                <h3 className="mb-2 text-xs font-black uppercase tracking-wider text-slate-400">Padres, madres y tutores</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  {family.guardians.map((g) => (
                    <div key={g.id} className="rounded-2xl border border-slate-200 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-extrabold">{g.fullName}</div>
                          <div className="mt-1 text-[11px] uppercase font-bold text-slate-400">{g.relationship.replace('_',' ')}</div>
                        </div>
                        {g.isMainContact && <span className="rounded-full bg-rose-50 px-2 py-1 text-[10px] font-black text-rose-700">Contacto principal</span>}
                      </div>
                      <div className="mt-3 space-y-1.5 text-xs text-slate-600">
                        {g.dni && <div>DNI/NIE: <strong>{g.dni}</strong></div>}
                        {g.birthDateDDMMAAAA && <div className="flex items-center gap-1"><CalendarDays size={13}/>{parseDDMMAAAA(g.birthDateDDMMAAAA).formattedDisplay}</div>}
                        {g.phone && <div className="flex items-center gap-1"><Phone size={13}/>{g.phone}</div>}
                        {g.email && <div className="flex items-center gap-1"><Mail size={13}/>{g.email}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-2xl bg-slate-50 p-4 text-sm">
                <div className="flex items-start gap-2"><MapPin size={16} className="mt-0.5 text-slate-400"/><div><div className="font-bold">{family.address.street || 'Sin dirección'}</div><div className="text-xs text-slate-500">{family.address.postalCode} {family.address.city}</div></div></div>
                {family.notes && <div className="mt-3 border-t border-slate-200 pt-3 text-xs leading-5 text-slate-600">{family.notes}</div>}
              </section>
            </div>
          )}

          {section === 'students' && (
            <div className="space-y-3">
              {family.students.map((s) => {
                const course = calculateStudentCourse(s, settings.activeAcademicYear);
                return (
                  <div key={s.id} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="text-base font-extrabold">{s.firstName} {s.lastName}</div>
                        <div className="mt-1 text-xs font-bold text-rose-600">{course.fullDisplay}</div>
                      </div>
                      <div className="rounded-xl bg-slate-50 px-3 py-2 text-right text-xs text-slate-500">
                        {s.birthDateDDMMAAAA ? parseDDMMAAAA(s.birthDateDDMMAAAA).formattedDisplay : s.birthYear}
                      </div>
                    </div>
                    <div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
                      {s.dni && <div>DNI/NIE: <strong>{s.dni}</strong></div>}
                      <div>Etapa: <strong>{course.stageName}</strong></div>
                      {s.groupLetter && <div>Grupo: <strong>{s.groupLetter}</strong></div>}
                      {s.school && <div>Centro: <strong>{s.school}</strong></div>}
                      {s.className && <div>Clase: <strong>{s.className}</strong></div>}
                      {s.allergies && <div className="sm:col-span-2 rounded-xl bg-amber-50 p-2 text-amber-900"><strong>Alergias/intolerancias:</strong> {s.allergies}</div>}
                      {s.specialNeeds && <div className="sm:col-span-2 rounded-xl bg-sky-50 p-2 text-sky-900"><strong>Necesidades:</strong> {s.specialNeeds}</div>}
                    </div>
                  </div>
                );
              })}
              {family.students.length === 0 && <div className="rounded-2xl border-2 border-dashed border-slate-200 p-8 text-center text-sm text-slate-400">No hay alumnos/as registrados.</div>}
            </div>
          )}

          {section === 'history' && (
            <div className="space-y-3">
              <div className="rounded-2xl bg-slate-50 p-4">
                <div className="text-xs font-black uppercase tracking-wider text-slate-400">Renovaciones por curso</div>
                <div className="mt-3 flex flex-wrap gap-2">{family.activeYears.length ? family.activeYears.map((y) => <span key={y} className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700">{y}</span>) : <span className="text-sm text-slate-400">Sin histórico</span>}</div>
              </div>
              <div>
                <div className="mb-2 text-xs font-black uppercase tracking-wider text-slate-400">Actividad registrada</div>
                <div className="space-y-2">
                  {familyActivity.map((a) => (
                    <div key={a.id} className="rounded-xl border border-slate-200 p-3">
                      <div className="flex flex-wrap justify-between gap-2"><span className="text-xs font-bold">{a.summary}</span><span className="text-[10px] text-slate-400">{new Date(a.timestamp).toLocaleString('es-ES')}</span></div>
                      <div className="mt-1 text-[11px] text-slate-500">{a.userName}</div>
                    </div>
                  ))}
                  {!familyActivity.length && <div className="rounded-xl border-2 border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">Todavía no hay actividad registrada para esta familia.</div>}
                </div>
              </div>
            </div>
          )}

          {section === 'privacy' && (
            <div className="space-y-3">
              <div className="rounded-2xl border border-slate-200 p-4">
                <h3 className="text-sm font-extrabold">Consentimientos y comunicaciones</h3>
                <p className="mt-1 text-xs leading-5 text-slate-500">Los consentimientos se almacenan en la ficha central de cada adulto responsable y quedan incluidos en el historial de modificaciones.</p>
              </div>
              {family.guardians.map((g) => (
                <div key={g.id} className="grid gap-3 rounded-2xl bg-slate-50 p-4 sm:grid-cols-[1fr_auto_auto] sm:items-center">
                  <div><div className="text-sm font-bold">{g.fullName}</div><div className="text-xs text-slate-500">{g.email || 'Sin email'}</div></div>
                  <span className={`rounded-full px-2 py-1 text-[10px] font-black ${g.communicationsConsent ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>Comunicaciones {g.communicationsConsent ? 'Sí' : 'No/pendiente'}</span>
                  <span className={`rounded-full px-2 py-1 text-[10px] font-black ${g.privacyConsent ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>Privacidad {g.privacyConsent ? 'Sí' : 'No/pendiente'}</span>
                </div>
              ))}
            </div>
          )}

          <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
            <button type="button" disabled={buildingCard} onClick={()=>void openCardPreview()} className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-4 text-xs font-bold disabled:opacity-50"><CreditCard size={15}/>{buildingCard?'Generando…':'Carnet'}</button>
            {canDelete && onDelete && <button type="button" onClick={onDelete} className="flex min-h-11 items-center gap-2 rounded-xl border border-rose-200 px-4 text-xs font-bold text-rose-700"><Trash2 size={15}/> Eliminar</button>}
            {canEdit && <button type="button" onClick={onEdit} className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-4 text-xs font-bold"><Pencil size={15}/> Editar familia</button>}
            {canEdit && <button type="button" onClick={onToggleRenewal} className="flex min-h-11 items-center gap-2 rounded-xl bg-slate-900 px-4 text-xs font-bold text-white"><RefreshCcw size={15}/>{family.isActiveThisYear ? 'Marcar no renovada' : 'Registrar renovación'}</button>}
          </div>
        </div>
      </div>
    </div>
    </>
  );
}

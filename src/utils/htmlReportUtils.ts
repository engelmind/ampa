import { EventDetail, Family, SystemSettings, Student } from '../types/family';
import { calculateStudentCourse, hasOfficialCurrentCourse } from './academicCourse';
import { getFamilyDataIssues } from './dataQuality';
import { parseDDMMAAAA } from './dateUtils';

/**
 * Plantillas HTML de impresión. La vista previa y el PDF se generan desde el
 * mismo documento mediante el motor de impresión del navegador.
 * No se construyen listados en celdas ni se rasteriza el texto.
 */
export type HtmlReportKind =
  | 'family-census' | 'compact-family-list' | 'students-by-course'
  | 'guardians' | 'incomplete' | 'compact-family-cards' | 'sensitive-needs';

export interface PrintReportOptions {
  title?: string;
  subtitle?: string;
  filterLabel?: string;
  academicYear: string;
  schoolName?: string;
  associationName?: string;
  orientation?: 'landscape' | 'portrait';
}

const escapeHtml = (value: unknown): string => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const safeText = (value: unknown, fallback = 'No consta'): string =>
  escapeHtml(String(value ?? '').trim() || fallback);

const cap = (value: unknown) => escapeHtml(value);
const join = (...parts: Array<string | undefined | null>) => parts.filter(Boolean).join(' · ');
const studentName = (s: Student) => join(String(s.firstName || ''), String(s.lastName || '')).replace(' · ', ' ').trim();
const studentCourse = (s: Student, year: string): string =>
  hasOfficialCurrentCourse(s, year) || s.birthDateDDMMAAAA
    ? calculateStudentCourse(s, year).fullDisplay
    : 'Sin curso asignado';

const guardianLabel = (relationship: string): string => ({
  madre: 'Madre', padre: 'Padre', tutor_legal: 'Tutor/a legal', otro: 'Adulto/a'
} as Record<string, string>)[relationship] || 'Adulto/a';

const status = (f: Family): string =>
  '<span class="state ' + (f.isActiveThisYear ? 'active' : 'inactive') + '">' +
  (f.isActiveThisYear ? 'Activa' : 'Inactiva') + '</span>';

const code = (f: Family) => '<span class="member-id">N.º ' + safeText(f.membershipNumber, '—') + '</span>';
const heading = (f: Family): string =>
  '<div class="family-title"><strong>Familia ' + safeText(f.familyName) + '</strong>' +
  '<span class="family-metadata">' + code(f) + status(f) + '</span></div>';

const adultPill = (g: Family['guardians'][number], includeContact = false): string =>
  '<span class="person adult"><span class="person-type">' + escapeHtml(guardianLabel(g.relationship)) + '</span> ' +
  safeText(g.fullName, 'Adulto/a sin nombre') +
  (includeContact && (g.phone || g.email) ? '<small>' + escapeHtml(join(g.phone, g.email)) + '</small>' : '') + '</span>';

const childPill = (s: Student, year: string): string =>
  '<span class="person child"><span class="person-type">Hijo/a</span> ' + safeText(studentName(s), 'Sin nombre') +
  '<small>' + escapeHtml(studentCourse(s, year)) + '</small></span>';

const memberGroup = (f: Family, year: string, withContacts = false): string => {
  const adults = f.guardians.map(g => adultPill(g, withContacts)).join('');
  const children = f.students.map(s => childPill(s, year)).join('');
  return '<div class="members">' +
    '<div class="people-group">' + (adults || '<span class="empty">Sin adultos registrados</span>') + '</div>' +
    '<div class="people-group">' + (children || '<span class="empty">Sin hijos registrados</span>') + '</div>' +
    '</div>';
};

const familyAddress = (f: Family): string =>
  escapeHtml(join(f.address?.street, join(f.address?.postalCode, f.address?.city)));

const reportSectionTitle = (label: string, count?: number): string =>
  '<div class="section-heading"><h2>' + escapeHtml(label) + '</h2>' +
  (count !== undefined ? '<span>' + count + ' registros</span>' : '') + '</div>';

const familyPanel = (f: Family, year: string, expanded = false): string =>
  '<article class="family-panel">' + heading(f) + memberGroup(f, year, expanded) +
  (expanded && familyAddress(f) ? '<div class="family-foot">Domicilio: ' + familyAddress(f) + '</div>' : '') + '</article>';

const familyStrip = (f: Family, year: string): string => {
  const persons = [
    ...f.guardians.map(g => '<span class="inline-person adult-inline">' + safeText(g.fullName) + ' <i>' + escapeHtml(guardianLabel(g.relationship)) + '</i></span>'),
    ...f.students.map(s => '<span class="inline-person child-inline">' + safeText(studentName(s)) + ' <i>' + escapeHtml(studentCourse(s, year)) + '</i></span>')
  ];
  return '<article class="family-strip"><div class="strip-identity"><b>' + safeText(f.familyName) +
    '</b><span>' + code(f) + ' ' + status(f) + '</span></div>' +
    '<div class="strip-people">' + (persons.join('') || '<span class="empty">Sin miembros registrados</span>') +
    '</div></article>';
};

const uniqueFamilies = (families: Family[]) => families.length;
const countStudents = (families: Family[]) => families.reduce((n, f) => n + f.students.length, 0);
const countGuardians = (families: Family[]) => families.reduce((n, f) => n + f.guardians.length, 0);
const summary = (items: Array<[string, string | number]>): string =>
  '<div class="summary-grid">' + items.map(([k, v]) =>
    '<div class="summary-item"><strong>' + escapeHtml(v) + '</strong><span>' + escapeHtml(k) + '</span></div>'
  ).join('') + '</div>';

const stylesheet = (): string => [
  // Los pies se sitúan en las cajas de margen de cada página, no como elementos
  // position:fixed (que Chromium puede superponer al primer registro siguiente).
  '@page { size: A4 portrait; margin: 13mm 11mm 16mm;' +
  ' @bottom-left {content: "AMPA Agustinos Granada · Documento de uso interno · Información confidencial";' +
  ' color:#64748b; font: 7pt \'Plus Jakarta Sans\',system-ui,sans-serif; border-top:1px solid #cbd5e1; padding-top:1mm; width:150mm; }' +
  ' @bottom-right {content: "Página " counter(page) " de " counter(pages); color:#65748b; font:8pt \'Plus Jakarta Sans\',system-ui,sans-serif;} }',
  '*{box-sizing:border-box}',
  'html{background:#eef2f6}',
  'body{margin:0;font:10pt/1.4 \'Plus Jakarta Sans\',system-ui,-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif;color:#1e293b;-webkit-print-color-adjust:exact;print-color-adjust:exact;-webkit-font-smoothing:antialiased}',
  '.document{max-width:190mm;margin:14px auto;background:#fff;padding:12mm 11mm;box-shadow:0 10px 36px #0f172a20}',
  '.topline{height:3.4mm;background:linear-gradient(90deg,#b91c1c 0%,#dc2626 66%,#f59e0b 66%,#f59e0b 100%);margin:-12mm -11mm 8mm}',
  '.brand{display:flex;align-items:center;justify-content:space-between;gap:10mm;padding-bottom:5mm;border-bottom:1px solid #e2e8f0}',
  '.brand img{max-width:54mm;max-height:19mm;object-fit:contain;object-position:left center}',
  '.brand-copy{text-align:right;flex:1;min-width:0}',
  '.brand-copy strong{display:block;color:#991b1b;font-size:10pt}',
  '.brand-copy span{display:block;color:#64748b;font-size:8pt;margin-top:2px}',
  '.eyebrow{font-size:7.5pt;letter-spacing:.14em;text-transform:uppercase;font-weight:800;color:#b91c1c;margin-top:6mm}',
  'h1{margin:1.5mm 0 2mm;font-size:19pt;line-height:1.15;letter-spacing:-.035em;color:#0f172a;overflow-wrap:anywhere}',
  '.report-subtitle{color:#64748b;font-size:8.5pt;margin:0 0 4.5mm}',
  '.summary-grid{display:flex;gap:2.8mm;margin:4.5mm 0 6mm;flex-wrap:wrap}',
  '.summary-item{padding:3mm 4mm;border:1px solid #e2e8f0;border-radius:2mm;background:#f8fafc;min-width:28mm;flex:1;break-inside:avoid}',
  '.summary-item strong{display:block;font-size:14pt;line-height:1.1;color:#0f172a}',
  '.summary-item span{display:block;font-size:7.5pt;color:#64748b;margin-top:1.5mm;font-weight:600}',
  '.summary-item:nth-child(4n+1){border-top:2px solid #b91c1c}',
  '.summary-item:nth-child(4n+2){border-top:2px solid #2563eb}',
  '.summary-item:nth-child(4n+3){border-top:2px solid #db2777}',
  '.summary-item:nth-child(4n){border-top:2px solid #0d9488}',
  '.section-heading{display:flex;align-items:baseline;justify-content:space-between;border-bottom:1.5px solid #cbd5e1;padding-bottom:1.8mm;margin:5mm 0 2.5mm;gap:3mm;break-after:avoid}',
  '.section-heading h2{font-size:10pt;letter-spacing:.035em;margin:0;color:#334155}',
  '.section-heading span{font-size:7.5pt;color:#64748b}',
  '.family-panel,.family-strip,.contact-panel,.student-strip,.issue-panel,.event-family,.note-panel{break-inside:avoid;page-break-inside:avoid}',
  '.family-panel{border:1px solid #dbe3ec;border-left:2.8mm solid #b91c1c;padding:3mm 3.5mm;border-radius:2mm;margin:0 0 2.8mm;background:#fff}',
  '.family-title{display:flex;justify-content:space-between;align-items:flex-start;gap:4mm;margin-bottom:2mm}',
  '.family-title>strong{font-size:10pt;line-height:1.24;color:#0f172a;overflow-wrap:anywhere}',
  '.family-metadata{display:flex;align-items:center;gap:2mm;white-space:nowrap}',
  '.member-id{font-size:7.5pt;color:#475569;font-weight:700}',
  '.state{display:inline-block;border:1px solid #e2e8f0;border-radius:50px;padding:.3mm 1.9mm;font-size:6.9pt;font-weight:700}',
  '.state.active{background:#effaf5;color:#166534;border-color:#bfdfcc}',
  '.state.inactive{background:#fff7ed;color:#9a3412;border-color:#ffedd5}',
  '.members{display:flex;flex-direction:column;gap:1.5mm}',
  '.people-group{display:flex;flex-wrap:wrap;gap:1.3mm}',
  '.person{font-size:8.2pt;padding:1mm 1.7mm;background:#f1f5f9;border-left:2px solid #94a3b8;border-radius:1mm;line-height:1.3}',
  '.person.child{background:#fff7f7;border-left-color:#e0a4a4}',
  '.person-type{font-size:7pt;color:#64748b;font-weight:700}',
  '.person small{display:inline;color:#64748b;font-size:7.2pt;margin-left:1.5mm}',
  '.family-foot{font-size:7.3pt;color:#64748b;border-top:1px dashed #e2e8f0;padding-top:1.6mm;margin-top:2mm}',
  '.empty{color:#94a3b8;font-style:italic;font-size:8pt}',
  '.family-strip{display:grid;grid-template-columns:48mm 1fr;gap:3mm;align-items:start;border-bottom:1px solid #e2e8f0;border-left:2px solid #b91c1c;padding:1.6mm 2.2mm;margin-bottom:1mm}',
  '.family-strip:nth-of-type(even){background:#f8fafc}',
  '.strip-identity b{display:block;font-size:8.3pt;color:#0f172a;overflow-wrap:anywhere}',
  '.strip-identity>span{display:flex;gap:2mm;align-items:center;margin-top:.7mm}',
  '.strip-people{font-size:7.8pt;line-height:1.4;display:flex;flex-wrap:wrap;column-gap:2mm;row-gap:.9mm}',
  '.inline-person{padding:0 .6mm;white-space:normal}',
  '.inline-person:not(:last-child)::after{content:" ·";color:#94a3b8;margin-left:1.4mm}',
  '.inline-person i{font-style:normal;color:#64748b;font-size:7pt}',
  '.child-inline{color:#9f4444}',
  '.cards-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:2.7mm;align-items:start}',
  '.cards-grid .family-panel{margin:0;min-height:44mm;padding:2.7mm}',
  '.cards-grid .family-title{flex-wrap:wrap;margin-bottom:1.5mm}',
  '.cards-grid .person{font-size:7.7pt}',
  '.cards-grid .person small{font-size:6.7pt}',
  '.contact-panel,.issue-panel,.note-panel{border:1px solid #e2e8f0;border-radius:2mm;margin-bottom:2mm;padding:2.5mm 3mm;background:#fff}',
  '.contact-panel strong,.issue-panel strong{font-size:9pt}',
  '.contact-person{display:grid;grid-template-columns:1.1fr 35mm 1.2fr;gap:3mm;padding:1.4mm 0;border-bottom:1px dashed #e2e8f0;font-size:8pt;align-items:start}',
  '.contact-person:last-child{border-bottom:0}',
  '.muted{color:#64748b;font-size:7.4pt}',
  '.course-group{break-after:auto}',
  '.course-heading{background:#f1f5f9;border-left:2.3mm solid #b91c1c;padding:2mm 3mm;margin:4mm 0 1.5mm;font-size:9pt;font-weight:800;break-after:avoid}',
  // Cinco columnas idénticas en cabecera y filas: ninguna celda invade la siguiente.
  // Las etiquetas se indican una vez por grupo y no se repiten en cada alumno.
  '.student-grid{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr) minmax(0,.43fr) minmax(0,.48fr) 7mm;gap:1mm;align-items:baseline;padding-inline:1mm;min-width:0}',
  '.student-grid>*{min-width:0;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
  '.student-column-head{margin-top:1mm;padding-block:1mm;border-bottom:1px solid #cbd5e1;color:#64748b;font-size:6.1pt;letter-spacing:.02em;font-weight:750;text-transform:uppercase;break-after:avoid}',
  '.student-strip{padding-block:1.1mm;border-bottom:1px solid #e2e8f0;font-size:7.1pt;line-height:1.25;white-space:nowrap;break-inside:avoid;page-break-inside:avoid}',
  '.student-strip b{font-weight:750}',
  '.student-strip .student-family{color:#475569;font-size:6.8pt}',
  '.student-strip .student-number{font-size:6.7pt;color:#334155;font-weight:700;font-variant-numeric:tabular-nums}',
  '.student-strip .student-birth{font-size:6.7pt;color:#64748b;font-variant-numeric:tabular-nums}',
  '.student-strip .student-class{text-align:center;color:#64748b;font-size:6.7pt;font-weight:650}',
  '.student-column-head .student-class{text-align:center}',
  '.student-strip.tight b{font-size:6.45pt}',
  '.student-strip.tight .student-family{font-size:6.2pt}',
  '.student-strip:nth-of-type(even){background:#f8fafc}',
  '.issue-tags{display:flex;flex-wrap:wrap;gap:1.5mm;margin-top:2mm}',
  '.issue-tag{background:#fff7ed;color:#9a3412;border-radius:1mm;padding:.7mm 2mm;font-size:7.4pt}',
  '.privacy{margin:3mm 0 5mm;padding:2.5mm 3mm;border:1px solid #fed7aa;background:#fff7ed;color:#9a3412;font-size:8pt;break-inside:avoid}',
  '.event-hero{display:grid;grid-template-columns:minmax(0,1fr) 57mm;gap:5mm;border:1px solid #e2e8f0;border-radius:3mm;padding:4mm;margin:5mm 0 4mm;break-inside:avoid;background:linear-gradient(125deg,#fff 0%,#fff8f8 100%)}',
  '.event-hero.no-image{grid-template-columns:1fr}',
  '.event-hero img{width:100%;height:42mm;object-fit:cover;border-radius:2mm}',
  '.event-hero h2{font-size:11pt;margin:0 0 3mm;line-height:1.2;color:#991b1b}',
  '.event-info{display:flex;flex-wrap:wrap;gap:2mm;font-size:7.5pt;font-weight:700;color:#475569}',
  '.event-info>span{padding:1mm 2mm;background:#fff;border:1px solid #e2e8f0;border-radius:1mm}',
  '.event-description{font-size:8.3pt;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.4;margin-top:3mm}',
  '.event-family{padding:2.5mm 3mm;margin:0 0 2mm;border:1px solid #dbe3ec;border-left:2.5mm solid #b91c1c;border-radius:2mm}',
  '.event-family .family-title{margin-bottom:1.5mm}',
  '.attendee-row{display:grid;grid-template-columns:5mm 1fr 40mm;gap:2mm;align-items:start;font-size:8pt;line-height:1.35;padding:.8mm 0}',
  '.attendee-details{min-width:0;overflow-wrap:anywhere}',
  '.attendee-name{display:block}',
  '.attendee-contacts{display:flex;flex-wrap:wrap;column-gap:3mm;row-gap:.35mm;margin-top:.55mm;color:#475569;font-size:7.15pt;line-height:1.25}',
  '.attendee-contacts span{max-width:100%;overflow-wrap:anywhere}',
  '.attendee-row+.attendee-row{border-top:1px solid #f1f5f9}',
  '.check-square{width:3.2mm;height:3.2mm;border:1px solid #94a3b8;border-radius:.5mm;display:inline-block}',
  '.attendee-role{color:#64748b;font-size:7.5pt;text-align:right}',
  '.attendee-row.child-row .attendee-role{color:#a16262}',
  '.event-roster-family{break-inside:avoid;page-break-inside:avoid;border:1px solid #dbe3ec;border-left:2mm solid #b91c1c;border-radius:1.7mm;padding:2mm 2.5mm;margin:0 0 2mm;background:#fff}',
  '.event-roster-family:nth-of-type(even){background:#fafbfc}',
  '.event-roster-title{display:flex;align-items:baseline;justify-content:space-between;gap:3mm;border-bottom:1px solid #e2e8f0;padding-bottom:1mm;margin-bottom:1.4mm}',
  '.event-roster-title strong{font-size:9pt;color:#0f172a;line-height:1.24}',
  '.event-roster-title span{font-size:7.2pt;font-weight:600;color:#64748b;white-space:nowrap}',
  '.event-roster-two{display:grid;grid-template-columns:1fr 1fr;gap:4.8mm}',
  '.event-roster-simple .event-roster-two{grid-template-columns:1fr;row-gap:1.6mm}',
  '.event-roster-simple .event-roster-line{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,1.55fr);gap:2mm;align-items:baseline;white-space:normal}',
  '.event-roster-simple .event-roster-person,.event-roster-simple .event-roster-meta{min-width:0;overflow-wrap:anywhere}',
  '.event-roster-simple .event-roster-meta{font-size:7pt}',
  '.event-roster-checklist .event-roster-group-title{margin-bottom:1.5mm}',
  '.event-roster-group{min-width:0}',
  '.event-roster-group-title{font-size:7.2pt;font-weight:800;color:#991b1b;text-transform:uppercase;letter-spacing:.035em;margin:0 0 1mm}',
  '.event-roster-group-title small{font-size:7.2pt;font-weight:600;color:#64748b}',
  '.event-roster-line{display:flex;gap:1.7mm;align-items:baseline;min-width:0;line-height:1.35;font-size:7.5pt;padding:.65mm 0}',
  '.event-roster-line+.event-roster-line{border-top:1px solid #f1f5f9}',
  '.event-roster-person{color:#1e293b;font-weight:650;min-width:0}',
  '.event-roster-meta{color:#475569;min-width:0;white-space:nowrap;font-size:6.9pt;overflow-wrap:anywhere}',
  '.event-roster-check{gap:2mm;align-items:center;padding:1.05mm 0;font-size:8.2pt}',
  '.event-roster-box{display:inline-block;width:3.5mm;height:3.5mm;flex:0 0 3.5mm;border:1.1px solid #64748b;border-radius:.45mm;background:#fff}',
  '.event-roster-empty{color:#94a3b8;font-style:italic;font-size:7.2pt}',
  '.blank{padding:6mm;text-align:center;border:1px dashed #cbd5e1;color:#64748b}',
  '@media print{html,body{background:#fff}.document{box-shadow:none;padding:0;max-width:none;margin:0}.topline{margin:0 0 5mm}.brand{padding-bottom:3mm}}',
  '@media(max-width:660px){.document{margin:0;padding:4mm}.topline{margin:-4mm -4mm 5mm}.brand img{max-width:39mm}.event-hero{grid-template-columns:1fr}.event-hero img{height:auto;max-height:42mm}.contact-person{grid-template-columns:1fr}.cards-grid{grid-template-columns:1fr}.family-strip{grid-template-columns:1fr}}'
].join('\n');

type Layout = { title: string; detail?: string; label?: string; privacy?: string };

const documentHtml = (settings: PrintReportOptions, layout: Layout, body: string): string => {
  const issueDate = new Date().toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
  const academy = settings.academicYear || 'Sin curso';
  const title = layout.title;
  return [
    '<!doctype html><html lang="es"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<base href="', escapeHtml(typeof window !== 'undefined' ? window.location.origin + '/' : '/'), '">',
    '<title>', escapeHtml(title), '</title>',
    '<link rel="preconnect" href="https://fonts.googleapis.com">',
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&display=swap">',
    '<style>', stylesheet(), '</style></head><body>',
    '<div class="document"><div class="topline"></div>',
    '<header class="brand"><img src="/logo-ampa-corporate.webp" alt="Logotipo AMPA Agustinos Granada">',
    '<div class="brand-copy"><strong>', safeText(settings.associationName, 'AMPA Agustinos Granada'), '</strong>',
    '<span>', safeText(settings.schoolName, 'Colegio Santo Tomás de Villanueva'), '</span>',
    '<span>Curso escolar ', escapeHtml(academy), '</span></div></header>',
    '<div class="eyebrow">', escapeHtml(layout.label || 'Informe de gestión'), '</div>',
    '<h1>', escapeHtml(title), '</h1>',
    '<p class="report-subtitle">', escapeHtml(layout.detail || ''), ' · Emitido el ', escapeHtml(issueDate), '</p>',
    layout.privacy ? '<div class="privacy">' + escapeHtml(layout.privacy) + '</div>' : '',
    '<main>', body, '</main></div></body></html>'
  ].join('');
};

export function renderFamiliesHtml(families: Family[], options: PrintReportOptions): string {
  const body = summary([
    ['Familias', uniqueFamilies(families)], ['Adultos', countGuardians(families)],
    ['Hijos/as', countStudents(families)]
  ]) + reportSectionTitle('Unidades familiares', families.length) +
    (families.length
      ? families.map(f => familyPanel(f, options.academicYear, true)).join('')
      : '<p class="blank">No hay familias para los filtros actuales.</p>');
  return documentHtml(options, {
    title: options.title || 'Censo de familias', label: 'Directorio de familias',
    detail: options.filterLabel || options.subtitle || (families.length + ' familias')
  }, body);
}

export function renderEventParticipantsHtml(event: EventDetail, families: Family[], settings: SystemSettings): string {
  const currentDate=new Date();
  const today=[currentDate.getFullYear(),String(currentDate.getMonth()+1).padStart(2,'0'),String(currentDate.getDate()).padStart(2,'0')].join('-');
  const isPending=event.eventDate>today;
  const byFamily = new Map<string, EventDetail['attendees']>();
  for (const attendee of event.attendees) {
    if (!byFamily.has(attendee.familyId)) byFamily.set(attendee.familyId, []);
    byFamily.get(attendee.familyId)!.push(attendee);
  }
  const familyMap = new Map(families.map(f => [f.id, f] as const));
  const keys = Array.from(byFamily.keys()).sort((a, b) =>
    String(familyMap.get(a)?.familyName || a).localeCompare(String(familyMap.get(b)?.familyName || b), 'es', { sensitivity: 'base' })
  );
  const eventDate = event.eventDate ? new Date(event.eventDate + 'T12:00:00').toLocaleDateString('es-ES') : 'Sin fecha';
  const imageUrl = String(event.imageDataUrl || '').trim();
  const safeImage = /^(data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+|https?:\/\/[^\s"'<>]+)$/i.test(imageUrl)
    ? escapeHtml(imageUrl) : '';
  const hero = '<section class="event-hero ' + (safeImage ? '' : 'no-image') + '">' +
    '<div><h2>' + safeText(event.title) + '</h2>' +
    '<div class="event-info"><span>Fecha: ' + escapeHtml(eventDate) + '</span><span>Curso ' +
    safeText(event.academicYear, settings.activeAcademicYear) + '</span></div>' +
    (event.description ? '<div class="event-description">' + escapeHtml(event.description) + '</div>' : '') +
    '</div>' + (safeImage ? '<img src="' + safeImage + '" alt="Imagen de la actividad">' : '') + '</section>';
  const panels = keys.map(id => {
    const family = familyMap.get(id);
    const attendees = [...(byFamily.get(id) || [])].sort((a, b) =>
      (a.personType === 'guardian' ? 0 : 1) - (b.personType === 'guardian' ? 0 : 1) ||
      a.participantName.localeCompare(b.participantName, 'es', { sensitivity: 'base' })
    );
    const displayName = family?.familyName || 'Familia no disponible';
    const title = '<div class="family-title"><strong>Familia ' + safeText(displayName) +
      '</strong><span class="family-metadata">' + (family ? code(family) : '') +
      '<span class="member-id">' + attendees.length + ' participantes</span></span></div>';
    const rows = attendees.map(a => {
      const guardian = a.personType === 'guardian'
        ? family?.guardians.find(g => g.id === a.personId) : undefined;
      const student = a.personType === 'student'
        ? family?.students.find(s => s.id === a.personId) : undefined;
      const role = guardian ? guardianLabel(guardian.relationship)
        : student ? studentCourse(student, event.academicYear || settings.activeAcademicYear)
        : a.personType === 'guardian' ? 'Adulto/a' : 'Hijo/a';
      // Sólo se publican los medios de contacto de los adultos que asisten.
      // Los datos se leen de la ficha del adulto y nunca se inventan ni se
      // transfieren automáticamente desde otros miembros de la familia.
      const phone = a.personType === 'guardian' ? String(guardian?.phone ?? '').trim() : '';
      const email = a.personType === 'guardian' ? String(guardian?.email ?? '').trim() : '';
      const contactDetails = phone || email
        ? '<div class="attendee-contacts">' +
          (phone ? '<span>Tel.: ' + escapeHtml(phone) + '</span>' : '') +
          (email ? '<span>Email: ' + escapeHtml(email) + '</span>' : '') +
          '</div>'
        : '';
      return '<div class="attendee-row ' + (a.personType === 'student' ? 'child-row' : '') + '">' +
        '<span class="check-square"></span><span class="attendee-details"><span class="attendee-name">' +
        safeText(a.participantName) + '</span>' + contactDetails +
        '</span><span class="attendee-role">' + escapeHtml(role) + '</span></div>';
    }).join('');
    return '<article class="event-family">' + title + rows + '</article>';
  }).join('');
  const body = hero + summary([[isPending?'Familias precargadas':'Familias participantes', keys.length],
    [isPending?'Personas precargadas':'Asistentes', event.attendees.length],
    ['Adultos', event.attendees.filter(a => a.personType === 'guardian').length],
    ['Hijos/as', event.attendees.filter(a => a.personType === 'student').length]]) +
    (isPending ? '<div class="privacy">Actividad aún no celebrada: este documento refleja únicamente asistencia precargada y NO acredita la presencia real.</div>' : '') +
    reportSectionTitle(isPending?'Personas precargadas por unidad familiar':'Control de participación por familias', keys.length) +
    (panels || '<p class="blank">Aún no hay participantes registrados.</p>');
  return documentHtml({
    academicYear: event.academicYear || settings.activeAcademicYear,
    schoolName: settings.schoolName,
    associationName: settings.associationName
  }, {
    title: (isPending?'Asistencia precargada':'Participantes') + ' · ' + event.title,
    label: isPending?'Control previo sin verificar':'Informe de actividad',
    detail: eventDate + ' · Adultos primero, hijos después · Contactos de adultos participantes'
  }, body);
}


/** Relaciones imprimibles de personas inscritas, sin miembros ajenos al evento.
 * Lista simple: contacto de cada adulto y curso del menor en la misma línea.
 * Lista check: solo nombres por familia y una casilla individual para pasar lista.
 * La impresión es un control operativo: no confirma asistencia por sí misma. */
export function renderEventRegistrationsHtml(
  event: EventDetail, families: Family[], settings: SystemSettings,
  mode:'simple'|'check'='simple'
): string {
  const registrations=event.registrations
    .filter(registration=>registration.status==='confirmed')
    .sort((a,b)=>a.familyName.localeCompare(b.familyName,'es',{sensitivity:'base'}));
  const familyMap=new Map(families.map(family=>[family.id,family] as const));
  const isParentsSchool=event.title.toLocaleLowerCase('es').includes('escuela de padres');
  const currentYear=event.academicYear||settings.activeAcademicYear;
  const eventDate=event.eventDate
    ? new Date(event.eventDate+'T12:00:00').toLocaleDateString('es-ES') : '';
  const adults=registrations.reduce((n,r)=>n+r.attendees.filter(a=>a.personType==='guardian').length,0);
  const children=registrations.reduce((n,r)=>n+r.attendees.filter(a=>a.personType==='student').length,0);
  const adultsLabel=isParentsSchool?'Adultos · Escuela de Padres':'Adultos';
  const childrenLabel=isParentsSchool?'Niños/as · Ludoteca':'Hijos/as';

  const line=(name:string,meta:string,check:boolean):string=>
    '<div class="event-roster-line '+(check?'event-roster-check':'')+'">'+
    (check?'<span class="event-roster-box"></span>':'')+
    '<span class="event-roster-person">'+escapeHtml(name)+'</span>'+
    (!check&&meta?'<span class="event-roster-meta">'+escapeHtml(meta)+'</span>':'')+
    '</div>';

  const panels=registrations.map((registration,index)=>{
    const family=familyMap.get(registration.familyId);
    const listedAdults=registration.attendees.filter(a=>a.personType==='guardian');
    const listedChildren=registration.attendees.filter(a=>a.personType==='student');
    const guardianLines=listedAdults.map(attendee=>{
      const guardian=family?.guardians.find(g=>g.id===attendee.personId);
      const contacts=[
        guardian?.phone ? 'Tel.: '+String(guardian.phone).trim() : '',
        guardian?.email ? 'Email: '+String(guardian.email).trim() : ''
      ].filter(Boolean).join('   ·   ');
      return line(attendee.participantName,contacts,mode==='check');
    }).join('');
    const childLines=listedChildren.map(attendee=>{
      const student=family?.students.find(s=>s.id===attendee.personId);
      const source=registration.formChildren?.find(c=>c.studentId===attendee.personId)?.course?.trim()||'';
      const rawCourse=student ? studentCourse(student,currentYear) : '';
      const fromForm=source==='3' ? '3 años' : /^2\s*años$/i.test(source) ? '2 años'
        : /aún no ha entrado al cole/i.test(source) ? '1 año · sin escolarizar' : source;
      const course=student?.className?.trim()
        ? rawCourse : (fromForm || (rawCourse==='Sin curso asignado'?'':rawCourse));
      return line(attendee.participantName,course,mode==='check');
    }).join('');
    const title='<div class="event-roster-title"><strong>'+
      (index+1)+'. Familia '+escapeHtml(registration.familyName)+'</strong>'+
      (mode==='check'?'':'<span>'+escapeHtml(registration.membershipNumber||'')+
      ' · '+registration.attendees.length+' inscritos</span>')+'</div>';
    return '<article class="event-roster-family '+(mode==='simple'?'event-roster-simple':'event-roster-checklist')+'">'+title+
      '<div class="event-roster-two">'+
      '<div class="event-roster-group"><div class="event-roster-group-title">'+escapeHtml(adultsLabel)+
      ' <small>('+listedAdults.length+')</small></div>'+ (guardianLines||'<div class="event-roster-empty">Sin adultos inscritos</div>')+'</div>'+
      '<div class="event-roster-group"><div class="event-roster-group-title">'+escapeHtml(childrenLabel)+
      ' <small>('+listedChildren.length+')</small></div>'+ (childLines||'<div class="event-roster-empty">Sin menores inscritos</div>')+'</div>'+
      '</div></article>';
  }).join('');

  const summaryHtml=summary([
    ['Familias inscritas',registrations.length],
    [isParentsSchool?'Adultos asistentes':'Adultos inscritos',adults],
    [isParentsSchool?'Niños/as en ludoteca':'Menores inscritos',children],
    ['Total de personas',adults+children]
  ]);
  const explanation=mode==='check'
    ? 'Control de asistencia por familias. Marque la casilla de cada persona al comprobar su presencia. Las casillas se imprimen vacías.'
    : 'Relación de personas inscritas. Los teléfonos y correos se muestran solo cuando están disponibles en la ficha del adulto.';
  return documentHtml({
    academicYear:currentYear,
    schoolName:settings.schoolName,
    associationName:settings.associationName
  },{
    title:(mode==='check'?'Lista Check':'Lista simple')+' · '+event.title,
    label:mode==='check'?'Control de asistencia':'Relación de inscritos',
    detail:eventDate+' · '+(mode==='check'?'Nombres y casillas de control':'Adultos y menores por unidad familiar'),
    privacy:'Uso interno del AMPA. '+explanation+' Este documento no acredita asistencia efectiva.'
  },summaryHtml+reportSectionTitle('Familias y personas inscritas',registrations.length)+
      (panels||'<p class="blank">No hay familias confirmadas para este evento.</p>'));
}

export function renderReportHtml(kind: HtmlReportKind, families: Family[], settings: SystemSettings): string {
  const options: PrintReportOptions = {
    academicYear: settings.activeAcademicYear,
    schoolName: settings.schoolName,
    associationName: settings.associationName
  };
  if (kind === 'family-census') return renderFamiliesHtml(families, { ...options, title: 'Censo de familias' });
  if (kind === 'compact-family-list') {
    const body = summary([['Familias', families.length], ['Personas', countGuardians(families) + countStudents(families)]]) +
      reportSectionTitle('Relación familiar compacta', families.length) +
      (families.map(f => familyStrip(f, options.academicYear)).join('') ||
      '<p class="blank">No hay familias para los filtros actuales.</p>');
    return documentHtml(options, {
      title: 'Lista compacta de familias', detail: 'Una unidad familiar por bloque · Adultos antes que hijos',
      label: 'Listado operativo'
    }, body);
  }
  if (kind === 'compact-family-cards') {
    const body = summary([['Familias', families.length], ['Adultos', countGuardians(families)], ['Hijos/as', countStudents(families)]]) +
      reportSectionTitle('Fichas por unidad familiar', families.length) +
      '<div class="cards-grid">' + families.map(f => familyPanel(f, options.academicYear)).join('') + '</div>';
    return documentHtml(options, {
      title: 'Fichas familiares compactas', label: 'Fichero familiar',
      detail: 'Dos columnas · Distribución automática para impresión'
    }, body);
  }
  if (kind === 'guardians') {
    const body = summary([['Familias', families.length], ['Adultos', countGuardians(families)]]) +
      reportSectionTitle('Padres, madres y tutores legales', countGuardians(families)) +
      families.filter(f => f.guardians.length > 0).map(f =>
        '<article class="contact-panel"><div class="family-title"><strong>Familia ' + safeText(f.familyName) + '</strong>' +
        '<span class="family-metadata">' + code(f) + '</span></div>' +
        f.guardians.map(g => '<div class="contact-person"><div><b>' + safeText(g.fullName) +
          '</b><div class="muted">' + escapeHtml(guardianLabel(g.relationship)) +
          (g.isMainContact ? ' · Contacto principal' : '') + '</div></div>' +
          '<div>' + safeText(g.phone, 'Sin teléfono') + '</div><div>' +
          safeText(g.email, 'Sin correo electrónico') + '</div></div>').join('') + '</article>'
      ).join('');
    return documentHtml(options, { title: 'Tutores y contactos', label: 'Directorio de contactos',
      detail: 'Información para la gestión interna de la asociación'
    }, body);
  }
  if (kind === 'students-by-course') {
    const groups = new Map<string, Array<{ f: Family; s: Student }>>();
    for (const f of families) for (const s of f.students) {
      const course = studentCourse(s, options.academicYear);
      if (!groups.has(course)) groups.set(course, []);
      groups.get(course)!.push({ f, s });
    }
    const all = Array.from(groups.entries()).sort((a, b) => {
      if (a[0] === 'Sin curso asignado') return 1;
      if (b[0] === 'Sin curso asignado') return -1;
      const aStudent = a[1][0]?.s, bStudent = b[1][0]?.s;
      const ageA = aStudent ? calculateStudentCourse(aStudent, options.academicYear).ageInAcademicYear : 999;
      const ageB = bStudent ? calculateStudentCourse(bStudent, options.academicYear).ageInAcademicYear : 999;
      return ageA - ageB || a[0].localeCompare(b[0], 'es');
    });
    const body = summary([['Alumnos/as', countStudents(families)], ['Familias', families.length],
      ['Cursos', groups.size]]) +
      all.map(([course, data]) =>
        '<section class="course-group"><div class="course-heading">' + escapeHtml(course) +
        ' · ' + data.length + ' alumnos/as</div>' +
        '<div class="student-grid student-column-head"><span>Apellidos, nombre</span>' +
        '<span>Familia</span><span>N.º socio</span><span>Nacimiento</span>' +
        '<span class="student-class">Grupo</span></div>' +
        data.sort((a, b) =>
          (a.s.lastName.trim() || a.f.familyName).localeCompare(
            b.s.lastName.trim() || b.f.familyName, 'es', { sensitivity: 'base' }) ||
          a.s.firstName.localeCompare(b.s.firstName, 'es', { sensitivity: 'base' })
        ).map(({ f, s }) => {
          const name = s.lastName.trim()
            ? s.lastName.trim() + ', ' + s.firstName.trim()
            : studentName(s);
          const date = s.birthDateDDMMAAAA
            ? parseDDMMAAAA(s.birthDateDDMMAAAA).formattedDisplay
            : (s.birthYear ? String(s.birthYear) : '');
          const tight = name.length > 34 || f.familyName.length > 27;
          return '<div class="student-grid student-strip' + (tight ? ' tight' : '') + '">' +
            '<b>' + safeText(name) + '</b>' +
            '<span class="student-family">' + safeText(f.familyName, '') + '</span>' +
            '<span class="student-number">' + safeText(f.membershipNumber, '') + '</span>' +
            '<span class="student-birth">' + escapeHtml(date) + '</span>' +
            '<span class="student-class">' + escapeHtml(s.groupLetter || '') + '</span>' +
            '</div>';
        }).join('') + '</section>'
      ).join('');
    return documentHtml(options, { title: 'Alumnado por curso', label: 'Informe académico',
      detail: 'Relación de alumnado agrupado por curso escolar' }, body);
  }
  if (kind === 'incomplete') {
    const incomplete = families.map(f => ({ f, issues: getFamilyDataIssues(f) }))
      .filter(entry => entry.issues.length > 0);
    const body = summary([['Familias por revisar', incomplete.length]]) +
      reportSectionTitle('Información pendiente de completar', incomplete.length) +
      (incomplete.map(({ f, issues }) =>
        '<article class="issue-panel"><div class="family-title"><strong>Familia ' +
        safeText(f.familyName) + '</strong><span class="family-metadata">' + code(f) + status(f) +
        '</span></div><div class="issue-tags">' + issues.map(issue =>
          '<span class="issue-tag">' + escapeHtml(issue.label) + '</span>').join('') +
        '</div></article>').join('') || '<p class="blank">No hay fichas incompletas.</p>');
    return documentHtml(options, {
      title: 'Fichas incompletas', label: 'Control de calidad de datos',
      detail: 'Relación de familias con campos pendientes de revisión'
    }, body);
  }
  if (kind === 'sensitive-needs') {
    const rows = families.flatMap(f => f.students.filter(s => s.allergies || s.specialNeeds).map(s => ({ f, s })));
    const body = summary([['Alumnos/as con registros', rows.length]]) +
      reportSectionTitle('Necesidades y observaciones registradas', rows.length) +
      rows.map(({ f, s }) =>
        '<article class="note-panel"><div class="family-title"><strong>' + safeText(studentName(s)) +
        '</strong><span class="member-id">Familia ' + safeText(f.familyName) + ' · ' +
        safeText(studentCourse(s, options.academicYear)) + '</span></div>' +
        (s.allergies ? '<div><b>Alergias / intolerancias:</b> ' + escapeHtml(s.allergies) + '</div>' : '') +
        (s.specialNeeds ? '<div><b>Necesidades específicas:</b> ' + escapeHtml(s.specialNeeds) + '</div>' : '') +
        '</article>'
      ).join('');
    return documentHtml(options, { title: 'Alergias y necesidades especiales',
      label: 'Información de acceso restringido',
      detail: 'Datos personales de especial protección',
      privacy: 'Documento confidencial. Acceso limitado a personal autorizado. No difundir ni conservar copias innecesarias.'
    }, body);
  }
  return renderFamiliesHtml(families, options);
}

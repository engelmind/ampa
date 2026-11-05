import jsPDF from 'jspdf';
import { renderMembershipCardPng } from './membershipCardRenderer';
import { EventDetail, Family, SystemSettings } from '../types/family';
import {
  HtmlReportKind, PrintReportOptions, renderFamiliesHtml,
  renderEventParticipantsHtml, renderEventRegistrationsHtml, renderReportHtml
} from './htmlReportUtils';

export interface PdfReportOptions extends PrintReportOptions {}

export interface PdfArtifact {
  /** Documento HTML listo para la previsualización y la impresión A4. */
  html?: string;
  /** PDF binario: se conserva para el carnet a escala real. */
  blob?: Blob;
  filename: string;
  title: string;
  description?: string;
}

export type ReportKind = HtmlReportKind;

const artifact = (doc: jsPDF, filename: string, title: string, description?: string): PdfArtifact => ({
  blob: doc.output('blob'),
  filename,
  title,
  description
});

const htmlArtifact = (html: string, filename: string, title: string, description?: string): PdfArtifact => ({
  html, filename, title, description
});

/** Espera a que se carguen las imágenes antes de invocar la impresión. */
export async function printHtmlDocument(printWindow: Window, html: string): Promise<void> {
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  await Promise.all(Array.from(printWindow.document.images).map(image =>
    image.complete ? Promise.resolve() : new Promise<void>(resolve => {
      image.addEventListener('load', () => resolve(), { once: true });
      image.addEventListener('error', () => resolve(), { once: true });
    })
  ));
  try { await printWindow.document.fonts.ready; } catch { /* No impide imprimir. */ }
  printWindow.focus();
  printWindow.print();
}

/** Descarga un archivo PDF real. Se libera la URL con margen para Safari iOS. */
export function downloadPdfBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.pdf') ? filename : filename + '.pdf';
  a.type = 'application/pdf';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export function downloadPdfArtifact(item: PdfArtifact): void {
  if (item.blob) { downloadPdfBlob(item.blob, item.filename); return; }
  if (!item.html) return;
  // El método heredado también genera un archivo real: nunca depende del
  // diálogo de impresión para obtener un PDF en el dispositivo.
  void import('./htmlToPdfRenderer')
    .then(({renderHtmlReportPdf}) => renderHtmlReportPdf(item.html as string))
    .then(blob => downloadPdfBlob(blob, item.filename))
    .catch(error => window.alert(
      'No ha sido posible generar el PDF: ' +
      (error instanceof Error ? error.message : 'error desconocido')
    ));
}

export function createFamiliesPdfArtifact(families: Family[], options: PdfReportOptions): PdfArtifact {
  const title = options.title || 'Censo de familias';
  return htmlArtifact(
    renderFamiliesHtml(families, options),
    'censo_familias_' + options.academicYear.replace('/', '-') + '.pdf',
    title,
    String(families.length) + ' familias · Maquetación HTML para guardar como PDF'
  );
}

export function generateFamiliesPdfReport(families: Family[], options: PdfReportOptions): void {
  downloadPdfArtifact(createFamiliesPdfArtifact(families, options));
}

const safeFilenamePart = (value: string) => value
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-zA-Z0-9_-]+/g, '_')
  .replace(/^_+|_+$/g, '')
  .slice(0, 70) || 'evento';

export function createEventParticipantsPdfArtifact(
  event: EventDetail, families: Family[], settings: SystemSettings
): PdfArtifact {
  const uniqueFamilies = new Set(event.attendees.map(attendee => attendee.familyId)).size;
  const date=new Date();
  const today=[date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
  const pending=event.eventDate>today;
  return htmlArtifact(
    renderEventParticipantsHtml(event, families, settings),
    (pending?'asistencia_precargada_':'participantes_') + safeFilenamePart(event.title) + '_' + (event.eventDate || 'sin_fecha') + '.pdf',
    (pending?'Asistencia precargada · ':'Participantes · ') + event.title,
    uniqueFamilies + ' familias · ' + event.attendees.length +
      (pending?' personas pendientes de comprobación · HTML listo para impresión':' participantes · HTML listo para impresión')
  );
}


/** Lista simple (con contactos y curso) o Check (casillas individuales de asistencia).
 * Solo figuran las personas efectivamente inscritas en el evento. */
export function createEventRegistrationsPdfArtifact(
  event: EventDetail, families: Family[], settings: SystemSettings,
  mode: 'simple' | 'check' = 'simple'
): PdfArtifact {
  const registrations=event.registrations.filter(registration=>registration.status==='confirmed');
  const adultCount=registrations.reduce((n,r)=>n+r.attendees.filter(a=>a.personType==='guardian').length,0);
  const childCount=registrations.reduce((n,r)=>n+r.attendees.filter(a=>a.personType==='student').length,0);
  const title=mode==='check'?'Lista Check':'Lista simple';
  return htmlArtifact(
    renderEventRegistrationsHtml(event,families,settings,mode),
    (mode==='check'?'lista_check_':'lista_simple_')+
      safeFilenamePart(event.title)+'_'+(event.eventDate||'sin_fecha')+'.pdf',
    title+' · '+event.title,
    registrations.length+' familias · '+adultCount+' adultos · '+childCount+' menores · '+(adultCount+childCount)+' inscritos'
  );
}

async function buildMembershipCardDoc(
  family: Family,
  academicYear: string,
  _associationName = 'AMPA Agustinos Granada'
) {
  const pageW = 210;
  const pageH = 297;
  const width = 85.6;
  const height = 54;
  const cardX = (pageW - width) / 2;
  const cardY = 35;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const cardPng = await renderMembershipCardPng(family, academicYear);

  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, pageW, pageH, 'F');

  // Physical trim guide. The card itself is always inserted at exact ID-1 size.
  doc.setDrawColor(172, 177, 184);
  doc.setLineWidth(0.22);
  doc.setLineDashPattern([1.15, 1.15], 0);
  doc.roundedRect(cardX - 1.8, cardY - 1.8, width + 3.6, height + 3.6, 4.4, 4.4, 'S');
  doc.setLineDashPattern([], 0);

  // Preview and PDF use this exact same canonical raster.
  doc.addImage(cardPng, 'PNG', cardX, cardY, width, height, undefined, 'NONE');

  doc.setTextColor(112, 112, 112);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text(
    'Carnet a tamaño real: 85,6 × 54 mm · Imprimir al 100 % y recortar por la línea de puntos.',
    pageW / 2,
    cardY + height + 8,
    { align: 'center' }
  );

  return doc;
}

export async function createMembershipCardPdfArtifact(
  family: Family,
  academicYear: string,
  associationName = 'AMPA Agustinos Granada'
): Promise<PdfArtifact> {
  const doc = await buildMembershipCardDoc(family, academicYear, associationName);
  const year = academicYear.replace('/', '-');
  const digits = (family.membershipNumber.match(/\d+/g)?.join('') || family.membershipNumber).trim();
  return artifact(
    doc,
    'carnet_ampa_' + (digits || family.membershipNumber) + '_' + year + '.pdf',
    'Carnet · Familia ' + family.familyName,
    'A4 listo para imprimir · carnet 85,6 × 54 mm a escala 100 %'
  );
}

export async function generateMembershipCardPdf(
  family: Family,
  academicYear: string,
  associationName = 'AMPA Agustinos Granada'
): Promise<void> {
  downloadPdfArtifact(await createMembershipCardPdfArtifact(family, academicYear, associationName));
}


export function createReportPdfArtifact(
  kind: ReportKind, families: Family[], settings: SystemSettings
): PdfArtifact {
  const titles: Record<ReportKind, string> = {
    'family-census': 'Censo de familias',
    'compact-family-list': 'Lista compacta de familias',
    'compact-family-cards': 'Fichas familiares compactas',
    'students-by-course': 'Alumnado por curso',
    'guardians': 'Tutores y contactos',
    'incomplete': 'Fichas incompletas',
    'sensitive-needs': 'Alergias y necesidades especiales'
  };
  const title = titles[kind];
  return htmlArtifact(
    renderReportHtml(kind, families, settings),
    kind.replace(/[^a-zA-Z0-9-]/g, '_') + '_' + settings.activeAcademicYear.replace('/', '-') + '.pdf',
    title,
    String(families.length) + ' familias seleccionadas · Previsualización HTML imprimible'
  );
}

import jsPDF from 'jspdf';
import { renderMembershipCardPng } from './membershipCardRenderer';
import { EventDetail, Family, SystemSettings } from '../types/family';
import {
  HtmlReportKind, PrintReportOptions, renderFamiliesHtml,
  renderEventParticipantsHtml, renderReportHtml
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

export function downloadPdfArtifact(item: PdfArtifact): void {
  if (item.html) {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      window.alert('El navegador ha bloqueado la ventana de impresión. Permita las ventanas emergentes para esta aplicación.');
      return;
    }
    void printHtmlDocument(printWindow, item.html).catch(() => {
      printWindow.document.body.innerHTML += '<p style="padding:20px">Utilice Ctrl+P para imprimir o guardar como PDF.</p>';
    });
    return;
  }
  if (!item.blob) return;
  const url = URL.createObjectURL(item.blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = item.filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
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
  return htmlArtifact(
    renderEventParticipantsHtml(event, families, settings),
    'participantes_' + safeFilenamePart(event.title) + '_' + (event.eventDate || 'sin_fecha') + '.pdf',
    'Participantes · ' + event.title,
    uniqueFamilies + ' familias · ' + event.attendees.length + ' participantes · HTML listo para impresión'
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

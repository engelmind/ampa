import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Family } from '../types/family';
import { calculateStudentCourse } from './academicCourse';
import { parseDDMMAAAA } from './dateUtils';

export interface PdfReportOptions {
  title?: string;
  subtitle?: string;
  filterLabel?: string;
  academicYear: string;
  schoolName?: string;
  associationName?: string;
  orientation?: 'landscape' | 'portrait';
}

export function generateFamiliesPdfReport(
  families: Family[],
  options: PdfReportOptions
): void {
  const orientation = options.orientation || 'landscape';
  const doc = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
  const associationName = options.associationName || 'AMPA Agustinos Granada';
  const academicYear = options.academicYear || '2025/2026';
  const filterLabel = options.filterLabel || 'Todas las familias';
  const dateStr = new Date().toLocaleDateString('es-ES', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setFillColor(220, 38, 38);
  doc.rect(0, 0, pageWidth, 7, 'F');
  doc.setFillColor(251, 191, 36);
  doc.rect(0, 7, pageWidth, 2, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(30, 41, 59);
  doc.text(associationName, 14, 18);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  doc.text(`Colegio San Agustín Granada · Curso Escolar ${academicYear}`, 14, 23);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(220, 38, 38);
  doc.text(options.title || 'LISTADO OFICIAL DE FAMILIAS Y ALUMNOS', 14, 30);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text(`Criterio: ${filterLabel} | Expedido: ${dateStr}`, 14, 35);

  const totalStudents = families.reduce((acc, f) => acc + (f.students?.length || 0), 0);
  const totalGuardians = families.reduce((acc, f) => acc + (f.guardians?.length || 0), 0);
  const activeCount = families.filter((f) => f.isActiveThisYear).length;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(30, 41, 59);
  doc.text(
    `Total: ${families.length} familias (${activeCount} activas) | ${totalStudents} alumnos | ${totalGuardians} tutores`,
    pageWidth - 14, 35, { align: 'right' }
  );

  const tableRows = families.map((fam) => {
    const guardiansText = fam.guardians.map((g) => {
      const contactInfo = [g.phone, g.email].filter(Boolean).join(' · ');
      const birth = g.birthDateDDMMAAAA ? ` (F.Nac: ${parseDDMMAAAA(g.birthDateDDMMAAAA).formattedDisplay})` : '';
      return `• ${g.fullName}${birth}${contactInfo ? `\n  ${contactInfo}` : ''}`;
    }).join('\n');

    const studentsText = fam.students.map((s) => {
      const course = calculateStudentCourse(s, academicYear);
      const birth = s.birthDateDDMMAAAA
        ? ` [${parseDDMMAAAA(s.birthDateDDMMAAAA).formattedDisplay}]`
        : ` [${s.birthYear}]`;
      const extra = s.allergies ? ` (Alérgica/o: ${s.allergies})` : '';
      return `• ${s.firstName} ${s.lastName}${birth}: ${course.fullDisplay}${extra}`;
    }).join('\n');

    return [
      fam.membershipNumber,
      `Familia ${fam.familyName}`,
      guardiansText || 'Sin tutores registrados',
      studentsText || 'Sin alumnos registrados',
      fam.isActiveThisYear ? 'ACTIVO' : 'INACTIVO',
    ];
  });

  autoTable(doc, {
    startY: 38,
    head: [['Nº SOCIO', 'FAMILIA', 'TUTORES LEGALES & CONTACTO', 'ALUMNOS / HIJOS (CURSO & F. NAC)', 'ESTADO']],
    body: tableRows,
    theme: 'grid',
    headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8.5, halign: 'left', cellPadding: 3 },
    bodyStyles: { fontSize: 8, cellPadding: 2.5, textColor: [30, 41, 59], valign: 'top' },
    columnStyles: {
      0: { cellWidth: 22, fontStyle: 'bold', halign: 'center' },
      1: { cellWidth: 38, fontStyle: 'bold' },
      2: { cellWidth: orientation === 'landscape' ? 85 : 55 },
      3: { cellWidth: 'auto' },
      4: { cellWidth: 20, halign: 'center', fontStyle: 'bold' },
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 4) {
        data.cell.styles.textColor = data.cell.raw === 'ACTIVO' ? [16, 185, 129] : [148, 163, 184];
      }
    },
    margin: { left: 14, right: 14, bottom: 18 },
    didDrawPage: (data) => {
      const pageNumber = doc.getNumberOfPages();
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text(`AMPA Agustinos Granada · Documento Oficial de Censo · Página ${data.pageNumber} de ${pageNumber}`, 14, doc.internal.pageSize.getHeight() - 8);
      doc.text('Confidencial - Uso exclusivo de la Asociación de Familias', pageWidth - 14, doc.internal.pageSize.getHeight() - 8, { align: 'right' });
    },
  });

  const safeFilter = filterLabel.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
  doc.save(`listado_familias_ampa_${academicYear.replace('/', '-')}_${safeFilter}.pdf`);
}


export function generateMembershipCardPdf(family: Family, academicYear: string, associationName = 'AMPA Agustinos Granada'): void {
  const doc = new jsPDF({ orientation:'landscape', unit:'mm', format:[86,54] });
  const main = family.guardians.find((g)=>g.isMainContact) || family.guardians[0];
  const students = family.students.map((s)=>`${s.firstName} ${s.lastName}`).join(', ');

  doc.setFillColor(30,41,59);
  doc.roundedRect(0,0,86,54,3,3,'F');
  doc.setFillColor(225,29,72);
  doc.rect(0,0,6,54,'F');

  doc.setTextColor(255,255,255);
  doc.setFont('helvetica','bold');
  doc.setFontSize(11);
  doc.text(associationName, 11, 12);

  doc.setFontSize(8);
  doc.setFont('helvetica','normal');
  doc.setTextColor(203,213,225);
  doc.text(`Curso ${academicYear}`, 11, 17);

  doc.setTextColor(255,255,255);
  doc.setFont('helvetica','bold');
  doc.setFontSize(12);
  doc.text(`Familia ${family.familyName}`, 11, 27, {maxWidth:64});

  doc.setFontSize(8);
  doc.setFont('helvetica','normal');
  doc.setTextColor(226,232,240);
  doc.text(`Socio: ${family.membershipNumber}`, 11, 34);
  if (main?.fullName) doc.text(`Contacto: ${main.fullName}`, 11, 39, {maxWidth:64});
  if (students) doc.text(`Alumnos: ${students}`, 11, 44, {maxWidth:64});

  doc.setFont('helvetica','bold');
  doc.setTextColor(family.isActiveThisYear ? 134 : 251, family.isActiveThisYear ? 239 : 191, family.isActiveThisYear ? 172 : 36);
  doc.text(family.isActiveThisYear ? 'SOCIO ACTIVO' : 'PENDIENTE DE RENOVACIÓN', 75, 49, {align:'right'});

  doc.save(`carnet_ampa_${family.membershipNumber}_${academicYear.replace('/','-')}.pdf`);
}

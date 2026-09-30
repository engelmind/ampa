import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Family } from '../types/family';
import { calculateStudentCourse } from './academicCourse';
import { parseDDMMAAAA } from './dateUtils';
import QRCode from 'qrcode';

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


export async function generateMembershipCardPdf(
  family: Family,
  academicYear: string,
  associationName = 'AMPA Agustinos Granada'
): Promise<void> {
  const width = 85.6;
  const height = 54;
  const doc = new jsPDF({ orientation:'landscape', unit:'mm', format:[width,height] });

  const members = [
    ...family.guardians.map((g)=>g.fullName || [g.firstName,g.lastName].filter(Boolean).join(' ')),
    ...family.students.map((s)=>`${s.firstName} ${s.lastName}`),
  ].map((x)=>x.trim()).filter(Boolean);

  const visibleMembers = members.slice(0,5);
  if (members.length > 5) visibleMembers[4] = `${visibleMembers[4]} · +${members.length-5}`;

  const memberDigits = (family.membershipNumber.match(/\d+/)?.[0] || family.membershipNumber).slice(-4);
  const qrTarget = `${window.location.origin}/?socio=${encodeURIComponent(family.membershipNumber)}`;
  const qrData = await QRCode.toDataURL(qrTarget,{
    errorCorrectionLevel:'M',
    margin:0,
    width:360,
    color:{dark:'#000000',light:'#FFFFFF'},
  });

  // Tarjeta 85,6 x 54 mm, siguiendo la referencia visual aportada.
  doc.setFillColor(246,28,35);
  doc.roundedRect(0,0,width,height,3.6,3.6,'F');

  // Formas tonales sutiles del fondo.
  doc.setFillColor(239,35,43);
  doc.circle(78,7,18,'F');
  doc.setFillColor(232,27,35);
  doc.circle(4,52,14,'F');

  // Línea amarilla inferior.
  doc.setFillColor(250,204,21);
  doc.rect(0.8,height-1.6,width-1.6,1.1,'F');

  // Isotipo.
  doc.setFillColor(255,255,255);
  doc.roundedRect(4,4,9.5,9.5,1.2,1.2,'F');
  doc.setTextColor(220,27,36);
  doc.setFont('helvetica','bold');
  doc.setFontSize(8);
  doc.text('AG',8.75,10.2,{align:'center'});

  // Marca.
  doc.setTextColor(255,255,255);
  doc.setFont('helvetica','bold');
  doc.setFontSize(8.4);
  doc.text('AMPA AGUSTINOS',15.3,8.1);
  doc.setFontSize(5.3);
  doc.text('GRANADA',15.3,11.1);

  // Curso.
  const formattedYear = academicYear.replace('/','-');
  doc.setTextColor(255,255,255);
  doc.setFontSize(4.5);
  doc.text('CURSO ESCOLAR',79.8,5.9,{align:'right'});
  doc.setTextColor(253,224,15);
  doc.setFontSize(10.5);
  doc.text(formattedYear,79.8,11.2,{align:'right'});

  // Familia.
  doc.setTextColor(255,255,255);
  doc.setFontSize(4.5);
  doc.text('FAMILIA',4.2,18.6);
  doc.setFontSize(family.familyName.length > 28 ? 9.2 : 11.2);
  doc.text(`Familia ${family.familyName}`,4.2,24.6,{maxWidth:57});

  // Bloque socio.
  doc.setDrawColor(255,102,107);
  doc.setFillColor(248,54,61);
  doc.setLineWidth(0.35);
  doc.roundedRect(4.2,30.5,10.3,12.2,1.3,1.3,'FD');
  doc.setTextColor(255,255,255);
  doc.setFontSize(3.7);
  doc.text('Nº SOCIO',9.35,34.3,{align:'center'});
  doc.setFontSize(memberDigits.length > 3 ? 10.5 : 12.5);
  doc.text(memberDigits.padStart(3,'0'),9.35,40.5,{align:'center'});

  // Separador + integrantes.
  doc.setDrawColor(255,148,152);
  doc.setLineWidth(0.3);
  doc.line(16.7,30.7,16.7,44.9);
  doc.setTextColor(255,255,255);
  doc.setFontSize(3.8);
  doc.text('INTEGRANTES',18.4,33.0);
  doc.setFont('helvetica','bold');
  const memberFont = visibleMembers.length >= 5 ? 5.5 : 6.2;
  doc.setFontSize(memberFont);
  visibleMembers.forEach((name,index)=>{
    doc.text(name,18.4,36.2 + index * 2.85,{maxWidth:41});
  });

  // QR en marco blanco.
  doc.setFillColor(255,255,255);
  doc.roundedRect(63.8,29.7,18.3,18.3,1.2,1.2,'F');
  doc.addImage(qrData,'PNG',64.6,30.5,16.7,16.7);

  // Estado discreto.
  if (!family.isActiveThisYear) {
    doc.setFillColor(253,224,15);
    doc.roundedRect(62.0,49.0,20.0,3.0,1,1,'F');
    doc.setTextColor(126,34,34);
    doc.setFontSize(4.3);
    doc.text('PENDIENTE DE RENOVACIÓN',72.0,51.1,{align:'center'});
  }

  doc.save(`carnet_ampa_${family.membershipNumber}_${formattedYear}.pdf`);
}

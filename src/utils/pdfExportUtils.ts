import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { renderMembershipCardPng } from './membershipCardRenderer';
import { EventDetail, Family, SystemSettings } from '../types/family';
import { calculateStudentCourse, hasOfficialCurrentCourse } from './academicCourse';
import { parseDDMMAAAA } from './dateUtils';
import { getFamilyDataIssues } from './dataQuality';

export interface PdfReportOptions {
  title?: string;
  subtitle?: string;
  filterLabel?: string;
  academicYear: string;
  schoolName?: string;
  associationName?: string;
  orientation?: 'landscape' | 'portrait';
}

export interface PdfArtifact {
  blob: Blob;
  filename: string;
  title: string;
  description?: string;
}

export type ReportKind =
  | 'family-census'
  | 'compact-family-list'
  | 'students-by-course'
  | 'guardians'
  | 'incomplete'
  | 'compact-family-cards'
  | 'sensitive-needs';

const esc = (value: unknown) => String(value ?? '').replace(/[<>]/g,'');
const studentCourseLabel = (student:any, academicYear:string) =>
  (hasOfficialCurrentCourse(student,academicYear) || student.birthDateDDMMAAAA)
    ? calculateStudentCourse(student,academicYear).fullDisplay
    : 'Sin curso asignado';

const artifact = (doc: jsPDF, filename: string, title: string, description?: string): PdfArtifact => ({
  blob: doc.output('blob'),
  filename,
  title,
  description,
});

export function downloadPdfArtifact(item: PdfArtifact): void {
  const url = URL.createObjectURL(item.blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = item.filename;
  a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

function drawReportHeader(doc: jsPDF, options: PdfReportOptions, title: string, detail = '') {
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setFillColor(220,38,38);
  doc.rect(0,0,pageWidth,7,'F');
  doc.setFillColor(251,191,36);
  doc.rect(0,7,pageWidth,2,'F');

  doc.setFont('helvetica','bold');
  doc.setFontSize(15);
  doc.setTextColor(30,41,59);
  doc.text(options.associationName || 'AMPA Agustinos Granada',14,18);

  doc.setFont('helvetica','normal');
  doc.setFontSize(9);
  doc.setTextColor(100,116,139);
  doc.text(`${options.schoolName || 'Colegio Santo Tomás de Villanueva'} · Curso ${options.academicYear}`,14,23);

  doc.setFont('helvetica','bold');
  doc.setFontSize(11);
  doc.setTextColor(220,38,38);
  doc.text(title.toUpperCase(),14,30);

  doc.setFont('helvetica','normal');
  doc.setFontSize(8);
  doc.setTextColor(71,85,105);
  const issued = new Date().toLocaleString('es-ES');
  doc.text(`${detail || options.filterLabel || 'Censo completo'} · ${issued}`,14,35,{maxWidth:pageWidth-28});
}

function addFooter(doc: jsPDF, label = 'Documento interno AMPA') {
  const count = doc.getNumberOfPages();
  for(let page=1;page<=count;page++){
    doc.setPage(page);
    const w=doc.internal.pageSize.getWidth();
    const h=doc.internal.pageSize.getHeight();
    doc.setFont('helvetica','normal');
    doc.setFontSize(7);
    doc.setTextColor(148,163,184);
    doc.text(`${label} · Página ${page} de ${count}`,10,h-5);
    doc.text('Confidencial · Uso autorizado',w-10,h-5,{align:'right'});
  }
}

function tableArtifact(
  title:string,
  filename:string,
  head:string[],
  body:(string|number)[][],
  options:PdfReportOptions,
  columnStyles:any = {},
  detail = '',
  orientation:'landscape'|'portrait'='landscape'
):PdfArtifact{
  const doc=new jsPDF({orientation,unit:'mm',format:'a4'});
  drawReportHeader(doc,options,title,detail);
  autoTable(doc,{
    startY:39,
    head:[head],
    body,
    theme:'grid',
    headStyles:{fillColor:[30,41,59],textColor:[255,255,255],fontStyle:'bold',fontSize:7.5,cellPadding:2.3},
    bodyStyles:{fontSize:7.2,cellPadding:2.1,textColor:[30,41,59],valign:'top'},
    alternateRowStyles:{fillColor:[248,250,252]},
    columnStyles,
    margin:{left:10,right:10,bottom:12},
  });
  addFooter(doc,title);
  return artifact(doc,filename,title,`${body.length} registros`);
}

export function createFamiliesPdfArtifact(families:Family[],options:PdfReportOptions):PdfArtifact{
  const rows=families.map((fam)=>{
    const main=fam.guardians.find((g)=>g.isMainContact)||fam.guardians[0];
    const students=fam.students.map((s)=>`${s.firstName} ${s.lastName} · ${studentCourseLabel(s,options.academicYear)}`).join('\n');
    return [
      fam.membershipNumber,
      `Familia ${fam.familyName}`,
      main ? `${main.fullName}\n${[main.phone,main.email].filter(Boolean).join(' · ')}` : 'Sin contacto',
      students || 'Sin alumnos',
      fam.isActiveThisYear ? 'ACTIVA':'INACTIVA',
    ];
  });
  return tableArtifact(
    options.title || 'Censo de familias',
    `censo_familias_${options.academicYear.replace('/','-')}.pdf`,
    ['Nº SOCIO','FAMILIA','CONTACTO PRINCIPAL','ALUMNOS / CURSO','ESTADO'],
    rows,options,{0:{cellWidth:22,fontStyle:'bold'},1:{cellWidth:42,fontStyle:'bold'},2:{cellWidth:72},3:{cellWidth:'auto'},4:{cellWidth:24,halign:'center'}},
    options.filterLabel || `${families.length} familias`
  );
}

export function generateFamiliesPdfReport(families:Family[],options:PdfReportOptions):void{
  downloadPdfArtifact(createFamiliesPdfArtifact(families,options));
}


const safeFilenamePart=(value:string)=>value
  .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .replace(/[^a-zA-Z0-9_-]+/g,'_')
  .replace(/^_+|_+$/g,'')
  .slice(0,70) || 'evento';

export function createEventParticipantsPdfArtifact(event:EventDetail,families:Family[],settings:SystemSettings):PdfArtifact{
  const attendingFamilies=new Set(event.familyIds);
  const rows=event.attendees
    .map((attendee)=>{
      const family=families.find((f)=>f.id===attendee.familyId);
      const guardian=attendee.personType==='guardian'
        ? family?.guardians.find((g)=>g.id===attendee.personId)
        : undefined;
      const student=attendee.personType==='student'
        ? family?.students.find((s)=>s.id===attendee.personId)
        : undefined;
      const role=guardian
        ? guardian.relationship==='madre' ? 'Madre'
          : guardian.relationship==='padre' ? 'Padre'
          : guardian.relationship==='tutor_legal' ? 'Tutor/a legal'
          : 'Adulto/a'
        : student
          ? studentCourseLabel(student,settings.activeAcademicYear)
          : attendee.personType==='guardian' ? 'Adulto/a' : 'Hijo/a';
      return {
        familyName:family?.familyName || 'Familia no disponible',
        membershipNumber:family?.membershipNumber || '',
        participantName:attendee.participantName,
        role,
      };
    })
    .sort((a,b)=>
      a.familyName.localeCompare(b.familyName,'es',{sensitivity:'base'})
      || a.participantName.localeCompare(b.participantName,'es',{sensitivity:'base'})
    )
    .map((row,index)=>[
      index+1,
      '________',
      row.membershipNumber,
      row.familyName,
      row.participantName,
      row.role,
    ]);

  const opts:PdfReportOptions={
    academicYear:settings.activeAcademicYear,
    schoolName:settings.schoolName,
    associationName:settings.associationName,
  };
  const date=event.eventDate
    ? new Date(event.eventDate+'T12:00:00').toLocaleDateString('es-ES',{day:'2-digit',month:'2-digit',year:'numeric'})
    : 'Sin fecha';
  const familyCount=Array.from(attendingFamilies).length;
  const title=`Participantes - ${event.title}`;
  return tableArtifact(
    title,
    `participantes_${safeFilenamePart(event.title)}_${event.eventDate || 'sin_fecha'}.pdf`,
    ['Nº','CONTROL','SOCIO','FAMILIA','PARTICIPANTE','TIPO / CURSO'],
    rows,
    opts,
    {
      0:{cellWidth:12,halign:'center'},
      1:{cellWidth:24,halign:'center'},
      2:{cellWidth:23,fontStyle:'bold'},
      3:{cellWidth:52,fontStyle:'bold'},
      4:{cellWidth:72},
      5:{cellWidth:'auto'},
    },
    `${date} · Curso ${event.academicYear} · ${familyCount} familias · ${rows.length} participantes`,
    'landscape'
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

function createCompactFamilyCardsPdf(families:Family[],settings:SystemSettings):PdfArtifact{
  const doc=new jsPDF({orientation:'portrait',unit:'mm',format:'a4'});
  const pageW=210,pageH=297, margin=8, gapX=5,gapY=4;
  const cardW=(pageW-margin*2-gapX)/2;
  const cardH=(pageH-margin*2-gapY*3)/4;
  const perPage=8;

  families.forEach((family,index)=>{
    const slot=index%perPage;
    if(index>0&&slot===0) doc.addPage();
    const col=slot%2,row=Math.floor(slot/2);
    const x=margin+col*(cardW+gapX), y=margin+row*(cardH+gapY);
    const main=family.guardians.find((g)=>g.isMainContact)||family.guardians[0];
    const issues=getFamilyDataIssues(family);
    const students=family.students.slice(0,4).map((s)=>`${s.firstName} ${s.lastName} · ${studentCourseLabel(s,settings.activeAcademicYear)}`);

    doc.setDrawColor(226,232,240); doc.setFillColor(255,255,255); doc.roundedRect(x,y,cardW,cardH,2,2,'FD');
    doc.setFillColor(family.isActiveThisYear?16:245,family.isActiveThisYear?185:158,family.isActiveThisYear?129:11);
    doc.roundedRect(x,y,cardW,5,2,2,'F');
    doc.setFont('helvetica','bold'); doc.setTextColor(15,23,42); doc.setFontSize(8);
    doc.text(`Familia ${family.familyName}`,x+4,y+11,{maxWidth:cardW-30});
    doc.setFontSize(6.2); doc.setTextColor(100,116,139); doc.text(family.membershipNumber,x+cardW-4,y+11,{align:'right'});

    doc.setFont('helvetica','normal'); doc.setFontSize(5.8); doc.setTextColor(51,65,85);
    let cy=y+16;
    if(main){
      doc.setFont('helvetica','bold'); doc.text(main.fullName,x+4,cy,{maxWidth:cardW-8}); cy+=3.3;
      doc.setFont('helvetica','normal'); doc.text([main.phone,main.email].filter(Boolean).join(' · ')||'Sin teléfono/email',x+4,cy,{maxWidth:cardW-8}); cy+=4;
    }
    doc.setFont('helvetica','bold'); doc.text('ALUMNOS',x+4,cy); cy+=3.2;
    doc.setFont('helvetica','normal');
    students.forEach((line)=>{doc.text(line,x+4,cy,{maxWidth:cardW-8}); cy+=3.3;});
    if(family.students.length>4){doc.text(`+${family.students.length-4} alumno(s)`,x+4,cy);cy+=3.3;}

    const address=[family.address.street,[family.address.postalCode,family.address.city].filter(Boolean).join(' ')].filter(Boolean).join(' · ');
    if(address){doc.setTextColor(100,116,139);doc.text(address,x+4,y+cardH-7,{maxWidth:cardW-8});}
    if(issues.length){
      doc.setTextColor(180,83,9);doc.setFont('helvetica','bold');doc.text(`${issues.length} dato(s) por revisar`,x+cardW-4,y+cardH-3,{align:'right'});
    }
  });

  addFooter(doc,'Fichas familiares compactas');
  return artifact(doc,`fichas_familiares_compactas_${settings.activeAcademicYear.replace('/','-')}.pdf`,'Fichas familiares compactas',`${families.length} familias · 8 fichas por página`);
}

function createCompactFamilyListPdf(families:Family[],settings:SystemSettings):PdfArtifact{
  const doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a4'});
  const opts:PdfReportOptions={academicYear:settings.activeAcademicYear,schoolName:settings.schoolName,associationName:settings.associationName};
  drawReportHeader(doc,opts,'Lista compacta de familias',`${families.length} familias · una línea por familia`);

  const rows=families.map((family)=>{
    const main=family.guardians.find((g)=>g.isMainContact)||family.guardians[0];
    const studentNames=family.students.map((s)=>`${s.firstName} ${s.lastName}`).join(' · ');
    return [
      family.membershipNumber,
      family.familyName,
      main?.fullName || 'Sin contacto',
      main?.phone || '',
      main?.email || '',
      studentNames || 'Sin alumnos',
      family.isActiveThisYear ? 'ACTIVA' : 'INACTIVA',
    ];
  });

  autoTable(doc,{
    startY:39,
    head:[['SOCIO','FAMILIA','CONTACTO','TELÉFONO','EMAIL','ALUMNOS','ESTADO']],
    body:rows,
    theme:'plain',
    headStyles:{fillColor:[30,41,59],textColor:[255,255,255],fontStyle:'bold',fontSize:6.2,cellPadding:1.4},
    bodyStyles:{fontSize:5.7,cellPadding:1.15,textColor:[30,41,59],valign:'middle',lineColor:[226,232,240],lineWidth:{bottom:.1}},
    alternateRowStyles:{fillColor:[248,250,252]},
    columnStyles:{
      0:{cellWidth:22,fontStyle:'bold'},
      1:{cellWidth:42,fontStyle:'bold'},
      2:{cellWidth:44},
      3:{cellWidth:28},
      4:{cellWidth:62},
      5:{cellWidth:'auto'},
      6:{cellWidth:23,halign:'center',fontStyle:'bold'},
    },
    margin:{left:8,right:8,bottom:11},
  });
  addFooter(doc,'Lista compacta de familias');
  return artifact(doc,`lista_compacta_familias_${settings.activeAcademicYear.replace('/','-')}.pdf`,'Lista compacta de familias',`${families.length} familias`);
}

export function createReportPdfArtifact(kind:ReportKind,families:Family[],settings:SystemSettings):PdfArtifact{
  const opts:PdfReportOptions={academicYear:settings.activeAcademicYear,schoolName:settings.schoolName,associationName:settings.associationName};

  if(kind==='family-census') return createFamiliesPdfArtifact(families,{...opts,title:'Censo de familias',filterLabel:`${families.length} familias`});
  if(kind==='compact-family-list') return createCompactFamilyListPdf(families,settings);
  if(kind==='compact-family-cards') return createCompactFamilyCardsPdf(families,settings);

  if(kind==='students-by-course'){
    const data=families.flatMap((f)=>f.students.map((s)=>({
      f,s,c:(hasOfficialCurrentCourse(s,settings.activeAcademicYear) || s.birthDateDDMMAAAA)
        ? calculateStudentCourse(s,settings.activeAcademicYear)
        : null
    })))
      .sort((a,b)=>(a.c?.ageInAcademicYear ?? 999)-(b.c?.ageInAcademicYear ?? 999) || a.s.lastName.localeCompare(b.s.lastName,'es'));
    const rows=data.map(({f,s,c})=>[
      c?.fullDisplay || 'Sin curso asignado',
      `${s.firstName} ${s.lastName}`,
      f.familyName,
      s.birthDateDDMMAAAA?parseDDMMAAAA(s.birthDateDDMMAAAA).formattedDisplay:String(s.birthYear||''),
      s.groupLetter||'',
      f.isActiveThisYear?'ACTIVA':'INACTIVA',
    ]);
    return tableArtifact(
      'Alumnado por curso',
      `alumnado_por_curso_${settings.activeAcademicYear.replace('/','-')}.pdf`,
      ['CURSO','ALUMNO/A','FAMILIA','F. NAC.','GRUPO','FAMILIA'],
      rows,opts,
      {0:{cellWidth:38,fontStyle:'bold'},1:{cellWidth:54},2:{cellWidth:50},3:{cellWidth:27},4:{cellWidth:18},5:{cellWidth:25}}
    );
  }

  if(kind==='guardians'){
    const rows=families.flatMap((f)=>f.guardians.map((g)=>[
      g.fullName,f.familyName,g.relationship.replace('_',' '),g.phone||'',g.email||'',g.isMainContact?'Principal':''
    ]));
    return tableArtifact(
      'Tutores y contactos',
      `tutores_contactos_${settings.activeAcademicYear.replace('/','-')}.pdf`,
      ['TUTOR/A','FAMILIA','RELACIÓN','TELÉFONO','EMAIL','CONTACTO'],
      rows,opts,{0:{cellWidth:50},1:{cellWidth:45},2:{cellWidth:27},3:{cellWidth:32},4:{cellWidth:75},5:{cellWidth:24}}
    );
  }

  if(kind==='incomplete'){
    const incomplete=families.filter((f)=>getFamilyDataIssues(f).length);
    const rows=incomplete.map((f)=>[
      f.membershipNumber,f.familyName,getFamilyDataIssues(f).map((i)=>i.label).join('\n'),f.isActiveThisYear?'ACTIVA':'INACTIVA'
    ]);
    return tableArtifact(
      'Fichas incompletas',
      `fichas_incompletas_${settings.activeAcademicYear.replace('/','-')}.pdf`,
      ['SOCIO','FAMILIA','DATOS A REVISAR','ESTADO'],
      rows,opts,{0:{cellWidth:27},1:{cellWidth:52},2:{cellWidth:'auto'},3:{cellWidth:28}}
    );
  }

  if(kind==='sensitive-needs'){
    const rows=families.flatMap((f)=>f.students.filter((s)=>s.allergies||s.specialNeeds).map((s)=>[
      `${s.firstName} ${s.lastName}`,f.familyName,studentCourseLabel(s,settings.activeAcademicYear),s.allergies||'',s.specialNeeds||''
    ]));
    return tableArtifact(
      'Alergias y necesidades especiales',
      `datos_restringidos_alumnos_${settings.activeAcademicYear.replace('/','-')}.pdf`,
      ['ALUMNO/A','FAMILIA','CURSO','ALERGIAS / INTOLERANCIAS','NECESIDADES'],
      rows,opts,{0:{cellWidth:50},1:{cellWidth:44},2:{cellWidth:37},3:{cellWidth:72},4:{cellWidth:74}},
      'Acceso restringido · Datos especialmente sensibles'
    );
  }

  return createFamiliesPdfArtifact(families,opts);
}

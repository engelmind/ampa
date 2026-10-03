import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import QRCode from 'qrcode';
import { Family, SystemSettings } from '../types/family';
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

async function buildMembershipCardDoc(family:Family,academicYear:string,associationName='AMPA Agustinos Granada'){
  const width=85.6, height=54;
  const doc=new jsPDF({orientation:'landscape',unit:'mm',format:[width,height]});
  const members=[
    ...family.guardians.map((g)=>g.fullName || [g.firstName,g.lastName].filter(Boolean).join(' ')),
    ...family.students.map((s)=>`${s.firstName} ${s.lastName}`),
  ].map((x)=>x.trim()).filter(Boolean);
  const visible=members.slice(0,5);
  if(members.length>5) visible[4]=`${visible[4]} · +${members.length-5}`;
  const digits=(family.membershipNumber.match(/\d+/)?.[0]||family.membershipNumber).slice(-4);
  const qrTarget=`${window.location.origin}/?socio=${encodeURIComponent(family.membershipNumber)}`;
  const qrData=await QRCode.toDataURL(qrTarget,{errorCorrectionLevel:'M',margin:0,width:360,color:{dark:'#000000',light:'#FFFFFF'}});

  doc.setFillColor(246,28,35); doc.roundedRect(0,0,width,height,3.6,3.6,'F');
  doc.setFillColor(239,35,43); doc.circle(78,7,18,'F');
  doc.setFillColor(232,27,35); doc.circle(4,52,14,'F');
  doc.setFillColor(250,204,21); doc.rect(.8,height-1.6,width-1.6,1.1,'F');

  doc.setFillColor(255,255,255); doc.roundedRect(4,4,9.5,9.5,1.2,1.2,'F');
  doc.setTextColor(220,27,36); doc.setFont('helvetica','bold'); doc.setFontSize(8); doc.text('AG',8.75,10.2,{align:'center'});

  doc.setTextColor(255,255,255); doc.setFontSize(8.4); doc.text('AMPA AGUSTINOS',15.3,8.1);
  doc.setFontSize(5.3); doc.text('GRANADA',15.3,11.1);
  const year=academicYear.replace('/','-');
  doc.setFontSize(4.5); doc.text('CURSO ESCOLAR',79.8,5.9,{align:'right'});
  doc.setTextColor(253,224,15); doc.setFontSize(10.5); doc.text(year,79.8,11.2,{align:'right'});

  doc.setTextColor(255,255,255); doc.setFontSize(4.5); doc.text('FAMILIA',4.2,18.6);
  doc.setFontSize(family.familyName.length>28?9.2:11.2); doc.text(`Familia ${family.familyName}`,4.2,24.6,{maxWidth:57});

  doc.setDrawColor(255,102,107); doc.setFillColor(248,54,61); doc.setLineWidth(.35); doc.roundedRect(4.2,30.5,10.3,12.2,1.3,1.3,'FD');
  doc.setTextColor(255,255,255); doc.setFontSize(3.7); doc.text('Nº SOCIO',9.35,34.3,{align:'center'});
  doc.setFontSize(digits.length>3?10.5:12.5); doc.text(digits.padStart(3,'0'),9.35,40.5,{align:'center'});

  doc.setDrawColor(255,148,152); doc.setLineWidth(.3); doc.line(16.7,30.7,16.7,44.9);
  doc.setTextColor(255,255,255); doc.setFontSize(3.8); doc.text('INTEGRANTES',18.4,33);
  doc.setFont('helvetica','bold'); doc.setFontSize(visible.length>=5?5.5:6.2);
  visible.forEach((name,index)=>doc.text(name,18.4,36.2+index*2.85,{maxWidth:41}));

  doc.setFillColor(255,255,255); doc.roundedRect(63.8,29.7,18.3,18.3,1.2,1.2,'F');
  doc.addImage(qrData,'PNG',64.6,30.5,16.7,16.7);

  if(!family.isActiveThisYear){
    doc.setFillColor(253,224,15); doc.roundedRect(62,49,20,3,1,1,'F');
    doc.setTextColor(126,34,34); doc.setFontSize(4.3); doc.text('CUOTA PENDIENTE',72,51.1,{align:'center'});
  }
  return doc;
}

export async function createMembershipCardPdfArtifact(family:Family,academicYear:string,associationName='AMPA Agustinos Granada'):Promise<PdfArtifact>{
  const doc=await buildMembershipCardDoc(family,academicYear,associationName);
  const year=academicYear.replace('/','-');
  return artifact(doc,`carnet_ampa_${family.membershipNumber}_${year}.pdf`,`Carnet · Familia ${family.familyName}`,'85,6 × 54 mm');
}

export async function generateMembershipCardPdf(family:Family,academicYear:string,associationName='AMPA Agustinos Granada'):Promise<void>{
  downloadPdfArtifact(await createMembershipCardPdfArtifact(family,academicYear,associationName));
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

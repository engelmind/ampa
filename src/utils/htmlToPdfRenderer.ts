import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

/**
 * Informes A4 nativos para guardar y compartir desde iOS/Android.
 *
 * La versión anterior capturaba cada elemento HTML por separado. Los márgenes
 * verticales, el line-height y el ajuste de fuentes hacían que html2canvas
 * recortara títulos y líneas de texto al rasterizar cada recuadro.
 *
 * Ahora se componen primero páginas completas en un documento independiente,
 * se mide la altura real de cada ficha y se rasteriza la página ENTERA.
 * Ningún texto se captura recortando su propia caja de línea.
 *
 * Todo se procesa en el dispositivo: no se transmiten datos de alumnos,
 * familiares ni teléfonos a ningún proveedor de generación de PDF.
 */
const PAGE_WIDTH_MM = 210;
const PAGE_HEIGHT_MM = 297;
const MARGIN_X_MM = 11;
const MARGIN_TOP_MM = 13;
const MARGIN_BOTTOM_MM = 17;
const CONTENT_WIDTH_MM = PAGE_WIDTH_MM - MARGIN_X_MM * 2;
const CONTENT_HEIGHT_MM = PAGE_HEIGHT_MM - MARGIN_TOP_MM - MARGIN_BOTTOM_MM;
const PX_PER_MM = 96 / 25.4;
const CONTENT_HEIGHT_PX = CONTENT_HEIGHT_MM * PX_PER_MM;
const PAGE_PADDING_PX = 9;
const PDF_SCALE = 1.65;

function assertNotCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Operación cancelada', 'AbortError');
}

async function waitForImages(doc: Document): Promise<void> {
  const images = Array.from(doc.images);
  await Promise.all(images.map(async image => {
    if (!image.complete) {
      await new Promise<void>(resolve => {
        image.addEventListener('load', () => resolve(), { once: true });
        image.addEventListener('error', () => resolve(), { once: true });
      });
    }
  }));
  const illustration = doc.querySelector('.event-hero img');
  if (illustration && !(illustration as HTMLImageElement).naturalWidth) {
    throw new Error('No se ha podido cargar la ilustración del evento.');
  }
}

async function createRenderFrame(html: string): Promise<HTMLIFrameElement> {
  const frame = document.createElement('iframe');
  frame.title = 'Preparación privada de informe A4';
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;left:-12000px;top:0;width:794px;height:1050px;border:0;pointer-events:none;z-index:-1';

  const reset = [
    '<style>',
    'html,body{background:#fff!important}',
    '.document{box-shadow:none!important;width:188mm!important;max-width:188mm!important;margin:0 auto!important;padding:0!important;background:#fff!important}',
    '.topline{display:none!important}',
    '.brand{padding-bottom:3mm!important}',
    '</style>'
  ].join('');

  const loaded = new Promise<void>((resolve, reject) => {
    frame.addEventListener('load', () => resolve(), { once: true });
    frame.addEventListener('error', () => reject(new Error('No se pudo preparar el documento.')), { once: true });
  });
  frame.srcdoc = html.replace('</head>', reset + '</head>');
  document.body.appendChild(frame);

  try {
    await loaded;
    const doc = frame.contentDocument;
    if (!doc) throw new Error('El navegador no permite preparar el PDF.');
    await waitForImages(doc);
    try { await doc.fonts.ready; } catch { /* Fuente de reserva del navegador. */ }
    return frame;
  } catch (error) {
    frame.remove();
    throw error;
  }
}

function reportBlocks(root: HTMLElement): HTMLElement[] {
  const result: HTMLElement[] = [];
  const main = root.querySelector('main');

  for (const element of Array.from(root.children)) {
    if (element === main || element.classList.contains('topline')) continue;
    result.push(element as HTMLElement);
  }

  if (!main) return result;
  for (const section of Array.from(main.children)) {
    if (section.classList.contains('course-group')) {
      for (const element of Array.from(section.children)) {
        result.push(element as HTMLElement);
      }
    } else if (section.classList.contains('cards-grid')) {
      // El PDF necesita los mismos bloques a página completa, sin cortar
      // las fichas. La vista previa HTML mantiene su disposición original.
      for (const element of Array.from(section.children)) {
        result.push(element as HTMLElement);
      }
    } else {
      result.push(section as HTMLElement);
    }
  }
  return result;
}

function isHeading(element: HTMLElement): boolean {
  return element.classList.contains('section-heading') ||
    element.classList.contains('course-heading') ||
    element.classList.contains('student-column-head');
}

/** Maqueta un informe a partir de bloques de altura real, antes de rasterizar. */
function paginate(doc: Document, source: HTMLElement[]): HTMLElement[] {
  const host = doc.createElement('div');
  host.style.cssText = 'position:relative;width:188mm;margin:0 auto;background:white;';
  doc.body.appendChild(host);

  const pages: HTMLElement[] = [];
  let current = doc.createElement('div');
  let count = 0;

  const startPage = (): void => {
    current = doc.createElement('div');
    current.className = 'ampa-pdf-page';
    current.style.cssText = [
      'box-sizing:border-box',
      'position:relative',
      'width:188mm',
      'max-width:188mm',
      'background:#fff',
      'padding:' + PAGE_PADDING_PX + 'px 2px',
      'overflow:visible',
      'display:flow-root'
    ].join(';');
    host.appendChild(current);
    pages.push(current);
    count = 0;
  };

  startPage();

  for (const original of source) {
    const clone = original.cloneNode(true) as HTMLElement;
    // Si la plantilla utiliza cuadrícula, la ficha fuera del contenedor
    // original ocupa la anchura completa, sin columnas desbordadas.
    if (clone.classList.contains('family-panel')) {
      clone.style.minHeight = '0';
      clone.style.width = '100%';
    }
    current.appendChild(clone);
    let overflows = current.scrollHeight > CONTENT_HEIGHT_PX - 2;

    // Evita un título aislado sin espacio para al menos la siguiente fila.
    if (isHeading(clone) && current.scrollHeight > CONTENT_HEIGHT_PX - 43) {
      overflows = true;
    }

    if (count > 0 && overflows) {
      current.removeChild(clone);
      startPage();
      current.appendChild(clone);
    }
    count++;
  }

  return pages.filter(page => page.children.length > 0);
}

function drawStripe(pdf: jsPDF): void {
  pdf.setFillColor(185, 28, 28);
  pdf.rect(0, 0, PAGE_WIDTH_MM * .66, 2.5, 'F');
  pdf.setFillColor(245, 158, 11);
  pdf.rect(PAGE_WIDTH_MM * .66, 0, PAGE_WIDTH_MM * .34, 2.5, 'F');
}

function drawFooter(pdf: jsPDF, page: number, total: number): void {
  pdf.setDrawColor(203, 213, 225);
  pdf.setLineWidth(.25);
  pdf.line(MARGIN_X_MM, PAGE_HEIGHT_MM - 12, PAGE_WIDTH_MM - MARGIN_X_MM, PAGE_HEIGHT_MM - 12);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7);
  pdf.setTextColor(100, 116, 139);
  pdf.text('AMPA Agustinos Granada · Documento de uso interno', MARGIN_X_MM, PAGE_HEIGHT_MM - 8);
  pdf.text('Página ' + page + ' de ' + total, PAGE_WIDTH_MM - MARGIN_X_MM, PAGE_HEIGHT_MM - 8, { align: 'right' });
}

/** Añade una página rasterizada; los documentos de gran tamaño se subdividen. */
function insertPage(pdf: jsPDF, canvas: HTMLCanvasElement, first: boolean): void {
  if (!first) pdf.addPage();
  drawStripe(pdf);
  const availableHeight = CONTENT_HEIGHT_MM;
  const pixelPerMM = canvas.width / CONTENT_WIDTH_MM;
  const pagePixelHeight = Math.floor(availableHeight * pixelPerMM);

  let offset = 0;
  let firstSlice = true;
  while (offset < canvas.height) {
    if (!firstSlice) { pdf.addPage(); drawStripe(pdf); }
    const sliceHeight = Math.min(pagePixelHeight, canvas.height - offset);

    if (offset === 0 && sliceHeight === canvas.height) {
      pdf.addImage(canvas.toDataURL('image/jpeg', .92), 'JPEG',
        MARGIN_X_MM, MARGIN_TOP_MM, CONTENT_WIDTH_MM, canvas.height / pixelPerMM,
        undefined, 'FAST');
    } else {
      const slice = document.createElement('canvas');
      slice.width = canvas.width;
      slice.height = sliceHeight;
      const ctx = slice.getContext('2d');
      if (!ctx) throw new Error('No se pudo dividir el documento en páginas.');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, slice.width, slice.height);
      ctx.drawImage(canvas, 0, offset, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);
      pdf.addImage(slice.toDataURL('image/jpeg', .92), 'JPEG',
        MARGIN_X_MM, MARGIN_TOP_MM, CONTENT_WIDTH_MM, sliceHeight / pixelPerMM,
        undefined, 'FAST');
      slice.width = 0;
      slice.height = 0;
    }

    offset += sliceHeight;
    firstSlice = false;
  }
}

export async function renderHtmlReportPdf(html: string, signal?: AbortSignal): Promise<Blob> {
  let frame: HTMLIFrameElement | undefined;
  try {
    assertNotCancelled(signal);
    frame = await createRenderFrame(html);
    assertNotCancelled(signal);

    const doc = frame.contentDocument;
    const root = doc?.querySelector('.document') as HTMLElement | null;
    if (!doc || !root) throw new Error('El informe no contiene contenido imprimible.');

    const blocks = reportBlocks(root);
    if (!blocks.length) throw new Error('No se encontraron datos en el informe.');

    // La plantilla original deja de participar en el flujo; cada hoja nueva
    // contiene clones con estilos heredados, medidos en un ancho A4 constante.
    root.style.display = 'none';
    const pages = paginate(doc, blocks);
    if (!pages.length) throw new Error('No se ha podido paginar el informe.');

    await waitForImages(doc);
    try { await doc.fonts.ready; } catch { /* Ya se dispone de fuente de reserva. */ }

    const pdf = new jsPDF({
      orientation: 'portrait', unit: 'mm', format: 'a4', compress: true
    });

    for (let i = 0; i < pages.length; i++) {
      assertNotCancelled(signal);
      const canvas = await html2canvas(pages[i], {
        scale: PDF_SCALE,
        useCORS: true,
        allowTaint: false,
        backgroundColor: '#ffffff',
        logging: false,
        windowWidth: 794,
        scrollX: 0,
        scrollY: 0
      });
      if (!canvas.width || !canvas.height) throw new Error('Una página del PDF está vacía.');

      insertPage(pdf, canvas, i === 0);
      canvas.width = 0;
      canvas.height = 0;
      if (i % 2 === 1) await new Promise<void>(resolve => setTimeout(resolve, 0));
    }

    const total = pdf.getNumberOfPages();
    for (let page = 1; page <= total; page++) {
      pdf.setPage(page);
      drawFooter(pdf, page, total);
    }

    const blob = pdf.output('blob');
    if (blob.size < 1000) throw new Error('No se ha podido generar un PDF completo.');
    return blob;
  } finally {
    frame?.remove();
  }
}

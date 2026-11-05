import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

/**
 * Genera un PDF A4 real en el propio dispositivo. Renderizar bloques por
 * separado evita lienzos enormes que Safari iOS suele recortar o dejar vacíos.
 * Las fichas, las familias y las filas del alumnado no se parten entre páginas.
 * Nunca se envían los datos del censo a un servicio de conversión externo.
 */
const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN_X = 11;
const MARGIN_TOP = 13;
const MARGIN_BOTTOM = 17;
const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN_X;
const CONTENT_BOTTOM = PAGE_HEIGHT - MARGIN_BOTTOM;
const REFERENCE_WIDTH_PX = 718; // 190 mm a 96 dpi, igual que la plantilla HTML A4.

const waitForImages = async (doc: Document): Promise<void> => {
  await Promise.all(Array.from(doc.images).map(image => new Promise<void>(resolve => {
    if (image.complete) { resolve(); return; }
    const done = () => resolve();
    image.addEventListener('load', done, { once: true });
    image.addEventListener('error', done, { once: true });
  })));
  const missingIllustration = doc.querySelector('.event-hero img');
  if (missingIllustration?.tagName === 'IMG' && !(missingIllustration as HTMLImageElement).naturalWidth) {
    throw new Error('No se ha podido cargar la ilustración del evento. Compruebe la imagen antes de generar el PDF.');
  }
};

const createRenderFrame = async (html: string): Promise<HTMLIFrameElement> => {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.setAttribute('title', 'Generación privada del informe PDF');
  frame.style.cssText = 'position:fixed;left:-11000px;top:0;width:794px;height:1050px;border:0;pointer-events:none;z-index:-1;';
  const printableCss = [
    '<style>',
    'html,body{background:#fff!important}',
    '.document{box-shadow:none!important;padding:0!important;max-width:190mm!important;margin:0 auto!important;background:#fff!important}',
    '.topline{margin:0 0 5mm!important}',
    '.brand{padding-bottom:3mm!important}',
    '</style>'
  ].join('');
  const source = html.replace('</head>', printableCss + '</head>');
  const loaded = new Promise<void>((resolve, reject) => {
    frame.onload = () => resolve();
    frame.onerror = () => reject(new Error('No ha sido posible preparar la vista del informe.'));
  });
  document.body.appendChild(frame);
  frame.srcdoc = source;
  await loaded;
  const innerDoc = frame.contentDocument;
  if (!innerDoc) throw new Error('El navegador no permite acceder a la vista del informe.');
  await waitForImages(innerDoc);
  try { await innerDoc.fonts.ready; } catch { /* El PDF usa la fuente alternativa cuando procede. */ }
  return frame;
};

/** Fragmentos independientes, para mantener juntas las fichas sin perder filas. */
const reportBlocks = (root: HTMLElement): HTMLElement[] => {
  const result: HTMLElement[] = [];
  const main = root.querySelector('main');

  for (const child of Array.from(root.children)) {
    if (child.nodeType !== 1) continue;
    const element = child as HTMLElement;
    if (element.classList.contains('topline') || element === main) continue;
    result.push(child);
  }
  if (!main) return result;

  for (const item of Array.from(main.children)) {
    if (item.nodeType !== 1) continue;
    const element = item as HTMLElement;
    if (item.classList.contains('course-group')) {
      for (const row of Array.from(item.children)) {
        if (row.nodeType === 1) result.push(row as HTMLElement);
      }
    } else if (item.classList.contains('cards-grid')) {
      // Los clones se insertan temporalmente en una columna A4 completa.
      // El original a dos columnas permanece intacto en la previsualización.
      for (const card of Array.from(item.children)) {
        if (card.nodeType !== 1) continue;
        const clone = card.cloneNode(true) as HTMLElement;
        clone.style.width = '100%';
        clone.style.minHeight = '0';
        main.appendChild(clone);
        result.push(clone);
      }
    } else {
      result.push(item);
    }
  }
  return result;
};

const afterGap = (element: HTMLElement): number => {
  if (element.classList.contains('brand')) return 3;
  if (element.tagName === 'H1') return 1.2;
  if (element.classList.contains('report-subtitle')) return 2.3;
  if (element.classList.contains('event-hero')) return 2.4;
  if (element.classList.contains('summary-grid')) return 2.5;
  if (element.classList.contains('section-heading')) return 1.8;
  if (element.classList.contains('course-heading')) return 1;
  if (element.classList.contains('student-column-head')) return .8;
  if (element.classList.contains('student-strip')) return .3;
  return 1.2;
};

export async function renderHtmlReportPdf(html: string): Promise<Blob> {
  let frame: HTMLIFrameElement | null = null;
  try {
    frame = await createRenderFrame(html);
    const documentNode = frame.contentDocument;
    const root = documentNode?.querySelector('.document');
    if (!root || root.nodeType !== 1) throw new Error('No se ha encontrado el contenido del informe.');

    const blocks = reportBlocks(root as HTMLElement);
    if (!blocks.length) throw new Error('El informe no contiene datos imprimibles.');

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
    let y = MARGIN_TOP;
    let pageHasContents = false;

    const drawPageStripe = () => {
      pdf.setFillColor(185, 28, 28);
      pdf.rect(0, 0, PAGE_WIDTH * .66, 2.5, 'F');
      pdf.setFillColor(245, 158, 11);
      pdf.rect(PAGE_WIDTH * .66, 0, PAGE_WIDTH * .34, 2.5, 'F');
    };

    const newPage = () => {
      pdf.addPage();
      y = MARGIN_TOP;
      pageHasContents = false;
      drawPageStripe();
    };

    drawPageStripe();

    for (let index = 0; index < blocks.length; index++) {
      const element = blocks[index];
      // Los elementos originales conservan sus estilos corporativos y
      // el ancho real de la página A4 en el iframe de renderización.
      const canvas = await html2canvas(element, {
        scale: 1.75,
        useCORS: true,
        allowTaint: false,
        backgroundColor: '#ffffff',
        logging: false,
        windowWidth: 794,
        scrollX: 0,
        scrollY: 0
      });

      if (!canvas.width || !canvas.height) {
        throw new Error('No se ha podido renderizar una sección del informe.');
      }

      const elementWidth = Math.max(1, element.getBoundingClientRect().width);
      const displayWidth = CONTENT_WIDTH * Math.min(1, elementWidth / REFERENCE_WIDTH_PX);
      const displayHeight = canvas.height * displayWidth / canvas.width;
      const x = MARGIN_X;

      // Evita que el encabezado de un curso quede huérfano al final de página.
      const heading = element.classList.contains('course-heading') ||
        element.classList.contains('section-heading') ||
        element.classList.contains('student-column-head');
      if (pageHasContents && (y + displayHeight > CONTENT_BOTTOM ||
          (heading && CONTENT_BOTTOM - y - displayHeight < 9))) {
        newPage();
      }

      if (displayHeight <= CONTENT_BOTTOM - MARGIN_TOP) {
        const data = canvas.toDataURL('image/jpeg', .88);
        pdf.addImage(data, 'JPEG', x, y, displayWidth, displayHeight, undefined, 'FAST');
        y += displayHeight + afterGap(element);
        pageHasContents = true;
      } else {
        // Un único fragmento excepcionalmente largo se trocea sin crear
        // un lienzo gigante ni perder contenidos entre páginas.
        const pixelsPerMM = canvas.width / displayWidth;
        let fromY = 0;
        while (fromY < canvas.height) {
          const remainingMM = CONTENT_BOTTOM - y;
          if (remainingMM < 4) newPage();
          const take = Math.min(canvas.height - fromY,
            Math.max(1, Math.floor((CONTENT_BOTTOM - y) * pixelsPerMM)));
          const slice = document.createElement('canvas');
          slice.width = canvas.width;
          slice.height = take;
          const ctx = slice.getContext('2d');
          if (!ctx) throw new Error('No se pudo dividir el documento en páginas.');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, slice.width, slice.height);
          ctx.drawImage(canvas, 0, fromY, canvas.width, take, 0, 0, canvas.width, take);
          const h = take / pixelsPerMM;
          pdf.addImage(slice.toDataURL('image/jpeg', .88), 'JPEG', x, y, displayWidth, h, undefined, 'FAST');
          slice.width = 0;
          slice.height = 0;
          y += h;
          fromY += take;
          pageHasContents = true;
          if (fromY < canvas.height) newPage();
        }
        y += afterGap(element);
      }

      canvas.width = 0;
      canvas.height = 0;
      // Deja respirar a la interfaz y limita los picos de memoria en iOS.
      if (index % 8 === 7) await new Promise<void>(resolve => setTimeout(resolve, 0));
    }

    const total = pdf.getNumberOfPages();
    for (let page = 1; page <= total; page++) {
      pdf.setPage(page);
      pdf.setDrawColor(203, 213, 225);
      pdf.setLineWidth(.25);
      pdf.line(MARGIN_X, PAGE_HEIGHT - 12, PAGE_WIDTH - MARGIN_X, PAGE_HEIGHT - 12);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7);
      pdf.setTextColor(100, 116, 139);
      pdf.text('AMPA Agustinos Granada · Documento de uso interno', MARGIN_X, PAGE_HEIGHT - 8);
      pdf.text('Página ' + page + ' de ' + total, PAGE_WIDTH - MARGIN_X, PAGE_HEIGHT - 8, { align: 'right' });
    }

    const blob = pdf.output('blob');
    if (blob.size < 1000) throw new Error('El PDF generado está incompleto.');
    return blob;
  } finally {
    frame?.remove();
  }
}

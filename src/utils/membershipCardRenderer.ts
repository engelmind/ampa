import QRCode from 'qrcode';
import { Family } from '../types/family';

const CARD_WIDTH = 1712;
const CARD_HEIGHT = 1080;

const escapeXml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

async function assetToDataUrl(path: string): Promise<string> {
  const response = await fetch(path);
  if (!response.ok) throw new Error('CARD_ASSET_NOT_FOUND');
  const blob = await response.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('CARD_ASSET_READ_FAILED'));
    reader.readAsDataURL(blob);
  });
}

async function svgToPngDataUrl(svg: string): Promise<string> {
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const objectUrl = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = objectUrl;
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('CARD_RENDER_FAILED'));
    });
    const canvas = document.createElement('canvas');
    canvas.width = CARD_WIDTH;
    canvas.height = CARD_HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('CARD_CANVAS_UNAVAILABLE');
    ctx.clearRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
    ctx.drawImage(image, 0, 0, CARD_WIDTH, CARD_HEIGHT);
    return canvas.toDataURL('image/png', 1);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function memberLayout(count: number) {
  if (count <= 4) return { fontSize: 43, lineHeight: 53, startY: 604 };
  if (count <= 6) return { fontSize: 36, lineHeight: 44, startY: 594 };
  if (count <= 8) return { fontSize: 31, lineHeight: 38, startY: 586 };
  if (count <= 10) return { fontSize: 27, lineHeight: 33, startY: 580 };
  return { fontSize: 23, lineHeight: 28, startY: 572 };
}

function familyIconSvg() {
  return [
    '<circle cx="151" cy="565" r="55" fill="url(#familyIconGradient)"/>',
    '<circle cx="131" cy="551" r="10" fill="#fff"/>',
    '<circle cx="151" cy="545" r="12" fill="#fff"/>',
    '<circle cx="172" cy="551" r="10" fill="#fff"/>',
    '<path d="M111 590c0-18 11-28 24-28s24 10 24 28v10h-48z" fill="#fff"/>',
    '<path d="M139 592c0-23 13-35 29-35s29 12 29 35v8h-58z" fill="#fff"/>',
    '<rect x="142" y="584" width="16" height="24" rx="8" fill="#ef2330"/>',
    '<rect x="164" y="584" width="16" height="24" rx="8" fill="#ef2330"/>'
  ].join('');
}

function calendarIconSvg() {
  return [
    '<rect x="93" y="922" width="100" height="100" rx="24" fill="#ffe0e2"/>',
    '<g transform="translate(115 944)" fill="none" stroke="#e51a24" stroke-width="7" stroke-linecap="round" stroke-linejoin="round">',
    '<rect x="0" y="7" width="56" height="52" rx="8"/>',
    '<path d="M0 23h56M14 0v14M42 0v14"/>',
    '<circle cx="15" cy="35" r="2.5" fill="#e51a24" stroke="none"/>',
    '<circle cx="28" cy="35" r="2.5" fill="#e51a24" stroke="none"/>',
    '<circle cx="41" cy="35" r="2.5" fill="#e51a24" stroke="none"/>',
    '<circle cx="15" cy="48" r="2.5" fill="#e51a24" stroke="none"/>',
    '<circle cx="28" cy="48" r="2.5" fill="#e51a24" stroke="none"/>',
    '</g>'
  ].join('');
}

export async function renderMembershipCardPng(
  family: Family,
  academicYear: string
): Promise<string> {
  const [logoData, schoolData] = await Promise.all([
    assetToDataUrl('/logo-ampa-corporate.webp'),
    assetToDataUrl('/ampa-school.webp'),
  ]);

  const qrTarget = window.location.origin + '/?socio=' + encodeURIComponent(family.membershipNumber);
  const qrData = await QRCode.toDataURL(qrTarget, {
    errorCorrectionLevel: 'M',
    margin: 0,
    width: 600,
    color: { dark: '#000000', light: '#ffffff' },
  });

  const guardians = family.guardians
    .map((g) => (g.fullName || [g.firstName, g.lastName].filter(Boolean).join(' ')).trim())
    .filter(Boolean);
  const students = family.students
    .map((s) => [s.firstName, s.lastName].filter(Boolean).join(' ').trim())
    .filter(Boolean);
  const members = [...guardians, ...students];
  const layout = memberLayout(members.length);
  const membershipDigits = (family.membershipNumber.match(/\d+/g)?.join('') || family.membershipNumber).trim();
  const displayYear = academicYear.replace('/', ' - ');

  const namesMarkup = (members.length ? members : ['—'])
    .map((name, index) => {
      const y = layout.startY + index * layout.lineHeight;
      return '<text x="244" y="' + y + '" class="member-name">' + escapeXml(name) + '</text>';
    })
    .join('');

  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="' + CARD_WIDTH + '" height="' + CARD_HEIGHT + '" viewBox="0 0 ' + CARD_WIDTH + ' ' + CARD_HEIGHT + '">' +
    '<defs>' +
      '<clipPath id="cardClip"><rect x="20" y="20" width="1672" height="1040" rx="70"/></clipPath>' +
      '<linearGradient id="badgeGradient" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#b9090d"/><stop offset=".52" stop-color="#df1319"/><stop offset="1" stop-color="#a70006"/></linearGradient>' +
      '<linearGradient id="familyIconGradient" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff525b"/><stop offset="1" stop-color="#e11a24"/></linearGradient>' +
      '<linearGradient id="photoFade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffffff" stop-opacity="1"/><stop offset=".24" stop-color="#ffffff" stop-opacity=".93"/><stop offset=".53" stop-color="#ffffff" stop-opacity=".28"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></linearGradient>' +
      '<linearGradient id="photoRed" x1=".2" y1="0" x2="1" y2=".7"><stop offset="0" stop-color="#ff2934" stop-opacity=".03"/><stop offset=".62" stop-color="#ef1721" stop-opacity=".16"/><stop offset="1" stop-color="#ef1721" stop-opacity=".38"/></linearGradient>' +
      '<radialGradient id="topGlow" cx=".87" cy=".04" r=".72"><stop offset="0" stop-color="#ff2e38" stop-opacity=".42"/><stop offset=".48" stop-color="#ff5b63" stop-opacity=".11"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>' +
      '<filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="9" stdDeviation="16" flood-color="#111827" flood-opacity=".16"/></filter>' +
      '<filter id="panelShadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="5" stdDeviation="10" flood-color="#ef2330" flood-opacity=".05"/></filter>' +
      '<style>' +
        '.sans{font-family:Arial,Helvetica,sans-serif}.member-name{font-family:Arial,Helvetica,sans-serif;font-size:' + layout.fontSize + 'px;font-weight:500;fill:#171717}.smallcaps{font-family:Arial,Helvetica,sans-serif;letter-spacing:10px}.script{font-family:"Segoe Script","Brush Script MT","Lucida Handwriting",cursive;font-style:italic}' +
      '</style>' +
    '</defs>' +

    '<rect x="20" y="20" width="1672" height="1040" rx="70" fill="#ffffff" filter="url(#softShadow)"/>' +
    '<g clip-path="url(#cardClip)">' +
      '<rect x="20" y="20" width="1672" height="1040" fill="#ffffff"/>' +

      '<image href="' + schoolData + '" x="770" y="20" width="922" height="520" preserveAspectRatio="xMidYMid slice"/>' +
      '<rect x="680" y="20" width="1012" height="560" fill="url(#photoRed)"/>' +
      '<rect x="650" y="20" width="900" height="550" fill="url(#photoFade)"/>' +
      '<rect x="610" y="20" width="1082" height="530" fill="url(#topGlow)"/>' +

      '<path d="M20 408 C300 505 555 525 820 464 C1110 397 1282 631 1692 370 L1692 645 C1350 782 1178 645 1001 579 C786 500 638 607 430 650 C265 684 128 644 20 590 Z" fill="#ff626a" opacity=".17"/>' +
      '<path d="M20 497 C292 559 520 592 770 533 C1018 475 1166 638 1375 642 C1490 644 1586 593 1692 522 L1692 670 C1517 772 1355 739 1200 664 C1000 568 854 575 676 643 C432 736 190 690 20 629 Z" fill="#f43b45" opacity=".33"/>' +
      '<path d="M736 531 C1002 443 1167 623 1374 627 C1504 629 1607 563 1692 503 L1692 637 C1517 747 1368 710 1214 641 C1036 560 921 557 746 624 Z" fill="#ef1721" opacity=".72"/>' +
      '<path d="M1050 558 C1234 489 1365 604 1482 606 C1557 607 1628 568 1692 527 L1692 669 C1585 725 1490 738 1388 705 C1265 665 1196 602 1050 642 Z" fill="#d90812" opacity=".88"/>' +

      '<image href="' + logoData + '" x="118" y="58" width="610" height="309" preserveAspectRatio="xMinYMin meet"/>' +
      '<text x="126" y="384" class="sans" font-size="29" font-weight="500" fill="#171717" letter-spacing="11">COLEGIO AGUSTINOS GRANADA</text>' +

      '<rect x="1171" y="70" width="455" height="150" rx="42" fill="url(#badgeGradient)" filter="url(#panelShadow)"/>' +
      '<text x="1215" y="158" class="sans" font-size="31" font-weight="500" fill="#fff" letter-spacing="8">Nº SOCIO</text>' +
      '<line x1="1430" y1="103" x2="1430" y2="186" stroke="#ffffff" stroke-opacity=".65" stroke-width="2"/>' +
      '<text x="1530" y="170" class="sans" text-anchor="middle" font-size="72" font-weight="700" fill="#fff">' + escapeXml(membershipDigits || '—') + '</text>' +

      '<rect x="75" y="465" width="1095" height="400" rx="43" fill="#ffffff" fill-opacity=".91" filter="url(#panelShadow)"/>' +
      familyIconSvg() +
      '<text x="242" y="548" class="sans" font-size="50" font-weight="800" fill="#171717">Familia</text>' +
      namesMarkup +
      '<line x1="118" y1="838" x2="1092" y2="838" stroke="#ef2330" stroke-opacity=".16" stroke-width="2"/>' +

      '<rect x="1224" y="494" width="392" height="397" rx="40" fill="#fff" filter="url(#softShadow)"/>' +
      '<image href="' + qrData + '" x="1272" y="533" width="296" height="296"/>' +
      '<text x="1420" y="850" class="sans" text-anchor="middle" font-size="16" font-weight="500" letter-spacing="7" fill="#171717">CARNET DE SOCIO</text>' +
      '<text x="1420" y="878" class="sans" text-anchor="middle" font-size="13" font-weight="500" letter-spacing="5" fill="#171717">AMPA AGUSTINOS GRANADA</text>' +

      calendarIconSvg() +
      '<text x="218" y="941" class="sans" font-size="24" font-weight="500" fill="#171717" letter-spacing="7">VÁLIDO PARA EL CURSO</text>' +
      '<text x="218" y="1009" class="sans" font-size="52" font-weight="800" fill="#171717">' + escapeXml(displayYear) + '</text>' +

      '<g transform="rotate(-3 1310 956)">' +
        '<text x="1310" y="970" class="script" text-anchor="middle" textLength="525" lengthAdjust="spacingAndGlyphs" font-size="50" font-weight="600" fill="#ef1721">Acompañar hacia la Verdad</text>' +
        '<path d="M1090 1002 C1218 965 1400 977 1588 984" fill="none" stroke="#ef1721" stroke-width="6" stroke-linecap="round"/>' +
      '</g>' +

      '<path d="M20 891 C258 819 441 864 621 946 C736 999 817 1033 934 1060 L20 1060 Z" fill="#f24851" opacity=".07"/>' +
      '<path d="M642 1060 C795 958 908 922 1055 941 C1194 960 1280 1027 1383 1060 Z" fill="#ef2330" opacity=".05"/>' +
    '</g>' +
    '<rect x="20" y="20" width="1672" height="1040" rx="70" fill="none" stroke="#e4e7ec" stroke-width="4"/>' +
    '</svg>';

  return svgToPngDataUrl(svg);
}

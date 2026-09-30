/**
 * Utilidades para manejo de fechas en formato DDMMAAAA
 * Requisito: Las fechas de nacimiento de padres e hijos se importan y manejan en formato DDMMAAAA (8 dígitos).
 */

export interface ParsedDDMMAAAA {
  day: number;
  month: number;
  year: number;
  rawDDMMAAAA: string;
  formattedDisplay: string;
  isValid: boolean;
  age: number;
}

export function normalizeToDDMMAAAA(input: string | number | undefined | null): string {
  if (!input) return '';
  const str = String(input).trim();
  const clean = str.replace(/[^0-9]/g, '');

  if (str.includes('-') && str.length >= 10) {
    const parts = str.split('-');
    if (parts.length === 3 && parts[0].length === 4) {
      const [y, m, d] = parts;
      return `${d.padStart(2, '0')}${m.padStart(2, '0')}${y}`;
    }
  }

  if (clean.length === 8) return clean;
  return clean;
}

export function parseDDMMAAAA(input: string | number | undefined | null, referenceYear: number = 2026): ParsedDDMMAAAA {
  const raw = normalizeToDDMMAAAA(input);

  if (raw.length !== 8) {
    return { day: 0, month: 0, year: 0, rawDDMMAAAA: raw, formattedDisplay: raw || '-', isValid: false, age: 0 };
  }

  const day = parseInt(raw.substring(0, 2), 10);
  const month = parseInt(raw.substring(2, 4), 10);
  const year = parseInt(raw.substring(4, 8), 10);

  const isValid =
    !isNaN(day) && !isNaN(month) && !isNaN(year) &&
    day >= 1 && day <= 31 && month >= 1 && month <= 12 &&
    year >= 1930 && year <= 2030;

  const age = isValid ? referenceYear - year : 0;
  const formattedDisplay = isValid
    ? `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`
    : raw;

  return { day, month, year, rawDDMMAAAA: raw, formattedDisplay, isValid, age };
}

export function extractBirthYearFromDDMMAAAA(input: string | number | undefined | null, fallbackYear: number = 2016): number {
  const parsed = parseDDMMAAAA(input);
  if (parsed.isValid && parsed.year > 1900) return parsed.year;
  const str = String(input || '').replace(/[^0-9]/g, '');
  if (str.length >= 8) {
    const y = parseInt(str.substring(4, 8), 10);
    if (!isNaN(y) && y > 1900) return y;
  }
  return fallbackYear;
}

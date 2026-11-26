/** Integer paise to a plain decimal rupee string (no float maths): 123456 -> "1234.56". */
export const rupees = (paise: number) => {
  const sign = paise < 0 ? '-' : '';
  const abs = Math.abs(paise);
  return `${sign}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
};

/**
 * One CSV cell. Values that start with = + - @ (or a tab/CR) are prefixed with an apostrophe so a
 * spreadsheet never evaluates them as formulas (CSV injection); quotes, commas and newlines are escaped.
 */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  let s = String(value);
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** UTF-8 with BOM so Excel opens rupee signs and names correctly. */
export const toCsv = (header: string[], rows: (string | number | null | undefined)[][]) =>
  '﻿' + [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';

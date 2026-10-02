// Port of the legacy PHP fix_tel(): Bangladeshi mobile numbers are normalised to +8801XXXXXXXXX.
// Anything else (landlines, foreign numbers, USSD codes like *778#) is kept as typed, minus separators.
export function formatPhone(input) {
  if (input == null) return '';
  const n = String(input).trim().replace(/[\s\-().]/g, '');
  if (/^01\d{9}$/.test(n)) return `+88${n}`;           // 01712345678   -> +8801712345678
  if (/^\+?8801\d{9}$/.test(n)) return `+${n.replace('+', '')}`; // 8801712345678 -> +8801712345678
  return n;
}

export const digitsOnly = (v) => String(v ?? '').replace(/\D/g, '');

/** Escapes LIKE/ILIKE wildcards so user input is always matched literally. */
export const escapeLike = (v) => String(v).replace(/[\\%_]/g, (c) => `\\${c}`);

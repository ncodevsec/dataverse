import { formatPhone } from './phone.js';

function decodeQuotedPrintable(str) {
  const joined = str.replace(/=\r?\n/g, '');
  const bytes = [];
  for (let i = 0; i < joined.length; i++) {
    if (joined[i] === '=' && /^[0-9A-Fa-f]{2}$/.test(joined.slice(i + 1, i + 3))) {
      bytes.push(parseInt(joined.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(...Buffer.from(joined[i], 'utf8'));
    }
  }
  return Buffer.from(bytes).toString('utf8');
}

/**
 * Parses vCard text into [{ name, number }]. Port of the legacy PHP get_contacts(): takes FN and the first TEL of each card,
 * decodes quoted-printable names (common in Android exports) and normalises Bangladeshi numbers.
 */
export function parseVcf(text) {
  const contacts = [];
  // unfold RFC 2425 continuation lines (a line starting with a space/tab continues the previous one)
  const unfolded = text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '');
  for (const card of unfolded.split(/BEGIN:VCARD/i).slice(1)) {
    let name = 'Unknown';
    const fn = card.match(/^FN((?:;[^:\n]*)?):(.*)$/im);
    if (fn) {
      name = fn[2].trim();
      if (/QUOTED-PRINTABLE/i.test(fn[1])) name = decodeQuotedPrintable(name);
    }
    name = name.replace(/[\\;'"]/g, '').replace(/\./g, ' ').replace(/\s+/g, ' ').trim() || 'Unknown';

    const tel = card.match(/^TEL(?:;[^:\n]*)?:(.*)$/im);
    if (!tel) continue;
    const number = formatPhone(tel[1].trim().replace(/[^\d+*#]/g, ''));
    if (number) contacts.push({ name: name.slice(0, 120), number: number.slice(0, 64) });
  }
  return contacts;
}

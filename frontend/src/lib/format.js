export const initials = (name = '') =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => Array.from(w)[0] ?? '').join('').toUpperCase() || '?';

export function fmtDate(value, style = 'dmy') {
  if (!value) return null;
  const s = String(value).slice(0, 10);
  const [y, m, d] = s.split('-');
  if (!y || !m || !d) return value;
  if (style === 'iso') return s;
  if (style === 'mdy') return `${m}/${d}/${y}`;
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${Number(d)} ${months[Number(m) - 1]}, ${y}`;
}

export function fmtDateTime(value) {
  if (!value) return '';
  return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function timeAgo(value) {
  const s = Math.max(1, Math.round((Date.now() - new Date(value).getTime()) / 1000));
  const units = [['year', 31536000], ['month', 2592000], ['day', 86400], ['hour', 3600], ['minute', 60]];
  for (const [u, n] of units) if (s >= n) { const v = Math.floor(s / n); return `${v} ${u}${v > 1 ? 's' : ''} ago`; }
  return 'just now';
}

export function age(dob, until) {
  if (!dob) return null;
  const b = new Date(`${dob}T00:00:00`);
  const t = until ? new Date(`${until}T00:00:00`) : new Date();
  let a = t.getFullYear() - b.getFullYear();
  if (t < new Date(t.getFullYear(), b.getMonth(), b.getDate())) a--;
  return a >= 0 ? a : null;
}

export const bytes = (n) => (n > 1e9 ? `${(n / 1e9).toFixed(1)} GB` : n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.round(n / 1e3)} KB`);

/** Only http(s) links are ever rendered as hrefs - blocks javascript: URLs and similar XSS vectors. */
export function safeUrl(value, platform) {
  if (!value) return null;
  const v = value.trim();
  if (/^https?:\/\//i.test(v)) { try { return new URL(v).href; } catch { return null; } }
  if (/^[a-z][a-z0-9+.-]*:/i.test(v)) return null; // some other scheme
  const handle = v.replace(/^@/, '').replace(/[^\w.\-/?=&]/g, '');
  if (!handle) return null;
  const base = { facebook: 'https://facebook.com/', instagram: 'https://instagram.com/', tiktok: 'https://tiktok.com/@' }[platform];
  return base ? base + handle : null;
}

export const GENDER = { MALE: 'Male', FEMALE: 'Female' };
export const MARITAL = { SINGLE: 'Unmarried', MARRIED: 'Married', DIVORCED: 'Divorced', WIDOWED: 'Widowed' };

/** Resizes an image in the browser (max side 640px, JPEG) so uploads stay small and fast. */
export async function resizeImage(file, max = 640, quality = 0.85) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not process image'))), 'image/jpeg', quality));
}

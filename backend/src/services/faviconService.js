import dns from 'node:dns';
import https from 'node:https';
import net from 'node:net';
import { query } from '../db/pool.js';

// Social-media icons are the site's own favicon. They are fetched by the SERVER (once, then cached) so that viewing a profile
// never makes the viewer's browser contact third-party sites, and the page CSP can stay strict. Because the server fetches a
// user-influenced domain, every request is SSRF-guarded: public DNS only, https only, tiny timeouts and size caps.
export const DOMAIN_RE = /^(?=.{3,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
const MAX_BYTES = 64 * 1024;
const TTL_FOUND_MS = 14 * 24 * 3600e3;
const TTL_MISSING_MS = 24 * 3600e3;

export function isPrivateAddress(ip) {
  if (net.isIPv6(ip)) {
    const x = ip.toLowerCase();
    const mapped = x.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    return x === '::' || x === '::1' || /^f[cd]/.test(x) || /^fe[89ab]/.test(x) || x.startsWith('ff') || x.startsWith('2001:db8');
  }
  const [a, b] = ip.split('.').map(Number);
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)
    || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
}

/** dns.lookup that refuses private / loopback / link-local results; the connection uses exactly the address it returns (no rebinding gap). */
export function safeLookup(hostname, opts, cb) {
  dns.lookup(hostname, { all: true }, (err, addrs) => {
    if (err) return cb(err);
    const ok = addrs.filter((a) => !isPrivateAddress(a.address));
    if (!ok.length) return cb(Object.assign(new Error('blocked address'), { code: 'EBLOCKED' }));
    return opts?.all ? cb(null, ok) : cb(null, ok[0].address, ok[0].family);
  });
}

const sniff = (b) => {
  if (b.length > 8 && b[0] === 0 && b[1] === 0 && b[2] === 1 && b[3] === 0) return 'image/x-icon';
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length > 4 && b.toString('ascii', 0, 4) === 'GIF8') return 'image/gif';
  if (b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null; // SVG and anything else is refused on purpose
};

function get(url, redirects = 2) {
  return new Promise((resolve) => {
    let u; try { u = new URL(url); } catch { return resolve(null); }
    if (u.protocol !== 'https:' || !DOMAIN_RE.test(u.hostname) || (u.port && u.port !== '443')) return resolve(null);
    const req = https.get({ hostname: u.hostname, path: u.pathname + u.search, lookup: safeLookup, timeout: 3000, headers: { 'User-Agent': 'DataverseFavicon/1.0', Accept: 'image/*' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
        res.resume();
        let next; try { next = new URL(res.headers.location, u).toString(); } catch { return resolve(null); }
        return resolve(get(next, redirects - 1));
      }
      if (res.statusCode !== 200) { res.resume(); return resolve(null); }
      const chunks = []; let size = 0;
      res.on('data', (c) => { size += c.length; if (size > MAX_BYTES) { req.destroy(); resolve(null); } else chunks.push(c); });
      res.on('end', () => { const buf = Buffer.concat(chunks); const type = sniff(buf); resolve(type ? { type, data: buf } : null); });
      res.on('error', () => resolve(null));
    });
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.on('error', () => resolve(null));
  });
}

/** Cached favicon for a registrable-looking domain, or null. */
export async function getFavicon(domainInput) {
  const domain = String(domainInput || '').toLowerCase().replace(/^www\./, '');
  if (!DOMAIN_RE.test(domain)) return null;
  const { rows } = await query('SELECT content_type, data, found, fetched_at FROM favicons WHERE domain = $1', [domain]);
  const row = rows[0];
  if (row && Date.now() - new Date(row.fetched_at).getTime() < (row.found ? TTL_FOUND_MS : TTL_MISSING_MS)) return row.found ? { type: row.content_type, data: row.data } : null;
  const got = (await get(`https://${domain}/favicon.ico`)) || (await get(`https://www.${domain}/favicon.ico`));
  await query(
    `INSERT INTO favicons (domain, content_type, data, found, fetched_at) VALUES ($1,$2,$3,$4,now())
     ON CONFLICT (domain) DO UPDATE SET content_type = EXCLUDED.content_type, data = EXCLUDED.data, found = EXCLUDED.found, fetched_at = now()`,
    [domain, got?.type ?? null, got?.data ?? null, !!got]);
  return got;
}

// Thin fetch wrapper. Authentication is an HttpOnly cookie set by the API, so no token ever touches JavaScript storage.
const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '') + '/api';

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error?.message || `Request failed (${status})`);
    this.status = status;
    this.code = body?.error?.code;
    this.details = body?.error?.details || null;
  }
}

async function request(method, path, { body, query, raw, signal } = {}) {
  const url = new URL(BASE + path, window.location.origin);
  if (query) for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  const headers = { 'X-Requested-With': 'dataverse' }; // CSRF guard header required by the API for cookie sessions
  let payload;
  if (raw) { headers['Content-Type'] = raw.type; payload = raw; }
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }

  let res;
  try {
    res = await fetch(url, { method, headers, body: payload, credentials: 'include', signal });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError(0, { error: { message: 'Cannot reach the server. Check your connection and try again.', code: 'NETWORK' } });
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new ApiError(res.status, data);
    if (res.status === 401 && !path.startsWith('/auth/')) window.dispatchEvent(new CustomEvent('dv:unauthorized'));
    throw err;
  }
  return data;
}

export const api = {
  get: (p, query, signal) => request('GET', p, { query, signal }),
  post: (p, body) => request('POST', p, { body }),
  put: (p, body) => request('PUT', p, { body }),
  patch: (p, body) => request('PATCH', p, { body }),
  del: (p) => request('DELETE', p),
  upload: (p, blob) => request('PUT', p, { raw: blob }),
};

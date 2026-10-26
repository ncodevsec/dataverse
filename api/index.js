// Vercel Serverless Function exposing the SAME Express app that runs on a normal Node server (backend/src/server.js).
// vercel.json rewrites /api/* to this function. The app is built once per warm instance and reused.
import { createApp } from '../backend/src/app.js';

let app;

export default function handler(req, res) {
  try {
    app ??= createApp();
  } catch (err) {
    console.error('[api] startup failed:', err.message); // e.g. missing DATABASE_URL / JWT_SECRET
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify({ error: { code: 'MISCONFIGURED', message: 'The server is not configured correctly. Check the function logs.' } }));
    return;
  }
  return app(req, res);
}

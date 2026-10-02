// Standalone Node.js entry point (VPS, Docker, Render, Fly, Railway ...). Netlify uses netlify/functions/api.mjs instead.
import { createApp } from './app.js';
import { config } from './config.js';
import { closePool, query } from './db/pool.js';
import { bootstrapAdmin } from './services/bootstrapAdmin.js';

const app = createApp();

if (config.bootstrapAdmin.email && config.bootstrapAdmin.password) {
  bootstrapAdmin()
    .then((r) => r.created && console.log(`[bootstrap] administrator created: ${r.email}`))
    .catch((e) => console.error('[bootstrap] could not create administrator:', e.errors?.[0]?.message || e.message));
}

const server = app.listen(config.port, async () => {
  console.log(`Dataverse API listening on http://localhost:${config.port} (${config.env})`);
  try { await query('SELECT 1'); console.log('Database connection OK'); } catch (e) { console.error('Database connection FAILED:', e.message); }
});

const shutdown = (signal) => {
  console.log(`${signal} received, shutting down`);
  server.close(async () => { await closePool(); process.exit(0); });
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

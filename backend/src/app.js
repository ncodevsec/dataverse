import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { config, assertConfig } from './config.js';
import { authenticate, csrfGuard } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { api } from './routes/index.js';

const NETLIFY_PREFIX = '/.netlify/functions/api';

/**
 * Builds the Express application. It has no knowledge of where it runs:
 *   - backend/src/server.js          -> app.listen()            (VPS / Docker / any Node host)
 *   - netlify/functions/api.mjs      -> serverless-http(app)    (Netlify Functions)
 */
export function createApp() {
  assertConfig();
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);

  // Netlify may deliver either "/api/..." (redirect rewrite) or "/.netlify/functions/api/..." (direct call).
  app.use((req, _res, next) => {
    if (req.url.startsWith(NETLIFY_PREFIX)) req.url = `/api${req.url.slice(NETLIFY_PREFIX.length)}` || '/api';
    next();
  });

  app.use(helmet({
    crossOriginResourcePolicy: { policy: config.cors.origins.length ? 'cross-origin' : 'same-origin' },
  }));

  if (config.cors.origins.length) {
    app.use(cors({
      origin: (origin, cb) => cb(null, !origin || config.cors.origins.includes(origin)),
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
      maxAge: 600,
    }));
  }

  // Body parsers. The vCard import accepts a larger JSON body; everything else is capped small.
  app.use('/api/contacts/import-vcf', express.json({ limit: '2mb' }));
  app.use(express.json({ limit: '100kb' }));

  if (!config.isProd) {
    app.use((req, res, next) => {
      const t = Date.now();
      res.on('finish', () => console.log(`${req.method} ${req.path} ${res.statusCode} ${Date.now() - t}ms`)); // never log bodies/headers
      next();
    });
  }

  // Everything under /api is private member data: never let browsers or shared caches keep it.
  // (The photo route overrides this with its own private cache header.)
  app.use('/api', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.use('/api', authenticate, csrfGuard, api);
  app.use('/api', notFoundHandler);

  // Optional: serve the built React app from the same process (handy on a VPS: one process, one port).
  if (config.serveFrontend) {
    const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../frontend/dist');
    if (fs.existsSync(dist)) {
      app.use(express.static(dist, { index: false, maxAge: '1h' }));
      app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
    } else {
      console.warn(`[server] SERVE_FRONTEND is on but ${dist} does not exist. Run "npm run build" first.`);
    }
  }

  app.use(errorHandler);
  return app;
}

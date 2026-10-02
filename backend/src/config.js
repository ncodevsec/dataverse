import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

// Load the repo-root .env first, then backend/.env. Real environment variables always win,
// which is how Netlify / VPS / Docker provide configuration in production.
const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, '../../.env'), quiet: true });
dotenv.config({ path: path.resolve(here, '../.env'), quiet: true });

const env = process.env;
const bool = (v, d = false) => (v === undefined || v === '' ? d : ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase()));
const list = (v) => (v || '').split(',').map((s) => s.trim()).filter(Boolean);

const isProd = env.NODE_ENV === 'production';
// Netlify Functions run on AWS Lambda
const isServerless = bool(env.SERVERLESS) || Boolean(env.NETLIFY || env.AWS_LAMBDA_FUNCTION_NAME);

export const config = {
  env: env.NODE_ENV || 'development',
  isProd,
  isServerless,
  port: Number(env.PORT) || 3001,
  siteUrl: (env.SITE_URL || 'http://localhost:5173').replace(/\/$/, ''),
  serveFrontend: bool(env.SERVE_FRONTEND, false),
  trustProxy: env.TRUST_PROXY === undefined ? 1 : Number.isNaN(Number(env.TRUST_PROXY)) ? env.TRUST_PROXY : Number(env.TRUST_PROXY),

  db: {
    url: env.DATABASE_URL,
    ssl: (env.DATABASE_SSL || 'auto').toLowerCase(), // auto | true | false
    rejectUnauthorized: bool(env.DATABASE_SSL_REJECT_UNAUTHORIZED, true),
    // One connection per serverless instance keeps you under provider connection limits.
    poolMax: Number(env.PG_POOL_MAX) || (isServerless ? 1 : 10),
  },

  jwt: {
    secret: env.JWT_SECRET,
    expiresInSeconds: Number(env.JWT_EXPIRES_DAYS || 7) * 24 * 60 * 60,
  },
  cookie: {
    name: 'dv_session',
    secure: bool(env.COOKIE_SECURE, isProd),
  },
  bcryptRounds: Number(env.BCRYPT_ROUNDS) || 12,
  cors: { origins: list(env.CORS_ORIGINS) },

  bootstrapAdmin: {
    email: env.BOOTSTRAP_ADMIN_EMAIL,
    username: env.BOOTSTRAP_ADMIN_USERNAME || 'admin',
    password: env.BOOTSTRAP_ADMIN_PASSWORD,
    name: env.BOOTSTRAP_ADMIN_NAME || 'Administrator',
  },

  mail: {
    resendApiKey: env.RESEND_API_KEY,
    from: env.MAIL_FROM || 'Dataverse <no-reply@example.com>',
  },
};

/** Fail fast on unsafe / missing configuration. Called when the app is created. */
export function assertConfig() {
  const problems = [];
  if (!config.db.url) problems.push('DATABASE_URL is required');
  if (!config.jwt.secret) problems.push('JWT_SECRET is required');
  else if (config.jwt.secret.length < 32) problems.push('JWT_SECRET must be at least 32 characters');
  else if (isProd && /change.?me|secret|example/i.test(config.jwt.secret)) problems.push('JWT_SECRET looks like a placeholder');
  if (problems.length) {
    throw new Error(`Invalid configuration: ${problems.join('; ')}. See .env.example`);
  }
}

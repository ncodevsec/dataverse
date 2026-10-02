#!/usr/bin/env node
// Usage:
//   BOOTSTRAP_ADMIN_EMAIL=you@example.com BOOTSTRAP_ADMIN_PASSWORD='long-secret-pass' npm run admin:create
//   npm run admin:create -- --email you@example.com --username boss --name "Boss" --password 'long-secret-pass'
import { config } from '../src/config.js';
import { closePool } from '../src/db/pool.js';
import { bootstrapAdmin } from '../src/services/bootstrapAdmin.js';

const arg = (name) => { const i = process.argv.indexOf(`--${name}`); return i > -1 ? process.argv[i + 1] : undefined; };

const input = {
  email: arg('email') || config.bootstrapAdmin.email,
  username: arg('username') || config.bootstrapAdmin.username,
  password: arg('password') || config.bootstrapAdmin.password,
  name: arg('name') || config.bootstrapAdmin.name,
};

if (!input.email || !input.password) {
  console.error('Provide an email and password via BOOTSTRAP_ADMIN_EMAIL / BOOTSTRAP_ADMIN_PASSWORD or --email / --password.');
  process.exit(1);
}

bootstrapAdmin(input)
  .then((r) => console.log(r.created ? `Admin created: ${r.email}` : `A user with that email/username already exists - nothing changed (${r.email}).`))
  .catch((err) => { console.error(err.errors?.map((e) => `${e.path.join('.')}: ${e.message}`).join('\n') || err.message); process.exitCode = 1; })
  .finally(closePool);

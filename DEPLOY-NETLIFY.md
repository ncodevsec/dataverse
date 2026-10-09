# Deploying Dataverse to Netlify (https://dataversed.netlify.app)

Branch: `netlify`. Database: Neon PostgreSQL. The API runs as one Netlify Function wrapping the Express app.

## 1. Database (Neon) - from your computer, once
1. In Neon, copy the **pooled** connection string (host contains `-pooler`), ending in `?sslmode=require`.
2. Locally:
   ```bash
   git clone https://github.com/ncodevsec/dataverse.git && cd dataverse && git checkout netlify
   npm ci
   cp .env.example .env
   ```
   Edit `.env`: set `DATABASE_URL` (Neon), `JWT_SECRET` (`node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`),
   `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD` (>= 10 chars).
3. `npm run db:migrate` - creates all tables (needs `pg_trgm`, available on Neon) and the first admin.
4. Optional legacy data: put the dump in `database/import/` then `npm run db:import -- --dry-run` and `npm run db:import`.

## 2. Netlify site
1. **Add new site -> Import from Git ->** `ncodevsec/dataverse`, branch **`netlify`**. Build settings come from `netlify.toml` (do not override).
2. **Site configuration -> Environment variables** (Netlify-side, NOT in git):

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | Neon pooled connection string |
   | `JWT_SECRET` | the same >= 32-char secret (or a new one; sessions just reset) |
   | `SITE_URL` | `https://dataversed.netlify.app` |
   | `NODE_ENV` | `production` |
   | `RESEND_API_KEY`, `MAIL_FROM` | optional (password-reset email) |

   Do **not** set `BOOTSTRAP_ADMIN_*` on Netlify (the admin was created in step 1), and leave `CORS_ORIGINS` empty.
3. Deploy. Verify:
   - `https://dataversed.netlify.app/api/health` -> `{"status":"ok"}`
   - `https://dataversed.netlify.app/api/health/db` -> `{"status":"ok","database":"up"}`
   - Sign in with the bootstrap admin, then remove `BOOTSTRAP_ADMIN_PASSWORD` from your local `.env`.

## Troubleshooting
- `500 MISCONFIGURED` from `/api`: function logs show which env var is missing/short (`JWT_SECRET` >= 32 chars).
- Build stops on "secrets scanning": add the flagged key to `SECRETS_SCAN_OMIT_KEYS` in `netlify.toml`.
- `self-signed certificate`: set `DATABASE_SSL_REJECT_UNAUTHORIZED=false` (not normally needed on Neon).
- Signed out right after login: must be served over HTTPS (Netlify is) because the cookie is `Secure` in production.
- Large backups: the in-app download is limited to small databases (10 s / 6 MB); use `npm run backup` locally.
- After pulling code that adds a migration, run `npm run db:migrate` against Neon **before** deploying.

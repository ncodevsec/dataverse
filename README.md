# Dataverse

A modern full-stack rebuild of the PHP/MySQL Dataverse project: **profiles**, **Shekor** (family tree / generations) and **Caller ID** (shared contact directory), with authentication, roles, an Admin Panel, audit log, light/dark/system theme and a Netlify-ready serverless API.

| Layer    | Technology                                                                               |
| -------- | ---------------------------------------------------------------------------------------- |
| Frontend | Vite, React 18, React Router 6, Tailwind CSS 4                                           |
| Backend  | Node.js 20+, Express 4, PostgreSQL (`pg`), Zod validation, JWT (HttpOnly cookie), bcrypt |
| Hosting  | Netlify (static site + one Netlify Function wrapping Express) – or any Node server       |

```
dataverse/
├── frontend/            React app (src/pages, components, context, lib)
├── backend/
│   ├── src/
│   │   ├── controllers/ request handlers
│   │   ├── routes/      route tables (auth, profiles, contacts, admin)
│   │   ├── middleware/  auth, CSRF, rate limit, validation, errors
│   │   ├── services/    business logic (profiles, tree, caller id, audit, settings)
│   │   ├── db/          connection pool (serverless-aware)
│   │   ├── utils/       zod schemas, jwt, passwords, phone, vCard
│   │   ├── app.js       createApp()  <- the ONE Express app
│   │   └── server.js    app.listen() <- normal Node hosting
│   ├── scripts/         migrate, create-admin, import-legacy
│   └── tests/           integration tests
├── netlify/functions/   api.mjs  <- wraps createApp() with serverless-http
├── database/
│   ├── migrations/      001_init.sql
│   └── import/          (git-ignored) put the legacy dump + photos here
├── netlify.toml
└── .env.example
```

---

## 1. Local development

Requirements: **Node.js 20+**, **PostgreSQL 14+** (with the `pg_trgm` extension, included in standard Postgres packages).

```bash
git clone <your-repo-url> dataverse && cd dataverse
npm install                      # installs both workspaces

# 1) PostgreSQL (see section 2), then:
cp .env.example .env             # edit DATABASE_URL, JWT_SECRET, BOOTSTRAP_ADMIN_*
npm run db:migrate               # creates tables AND the first admin (section 4)

# 2) start API (:4310) + web (:5173) together
npm run dev
```

Open <http://localhost:5173> and sign in with the bootstrap admin. Vite proxies `/api` to Express, so the browser sees a single origin (just like on Netlify) and the session cookie works without any CORS setup.

Useful scripts

| Command                         | What it does                                                               |
| ------------------------------- | -------------------------------------------------------------------------- |
| `npm run dev`                   | API with auto-reload + Vite dev server                                     |
| `npm run build`                 | Production build of the frontend (`frontend/dist`)                         |
| `npm start`                     | Run the API as a normal Node server                                        |
| `npm run db:migrate`            | Apply pending SQL migrations                                               |
| `npm run db:import -- --file …` | Import the legacy MySQL data (section 3)                                   |
| `npm run admin:create`          | Create an administrator (section 4)                                        |
| `npm run lint:check`            | Syntax-check all backend files                                             |
| `npm test -w backend`           | Backend integration tests (needs a **separate, disposable** DB, see below) |
| `npm test -w frontend`          | Renders every page against a running API                                   |

## 2. PostgreSQL setup

**Local**

```bash
createuser -P dataverse                     # choose a password
createdb -O dataverse dataverse
# DATABASE_URL=postgres://dataverse:<password>@localhost:5432/dataverse
```

**Hosted (required for Netlify)** – create a database at any provider, e.g. **Neon**, **Supabase**, Railway, Render or Aiven, and copy its connection string into `DATABASE_URL`.

- On serverless, prefer the provider's **pooled** connection string (Neon “pooled connection”, Supabase “Transaction pooler”). Each function instance opens only **one** connection (`PG_POOL_MAX` defaults to 1 on Netlify).
- TLS is enabled automatically for non-local hosts. If your provider uses a self-signed certificate set `DATABASE_SSL_REJECT_UNAUTHORIZED=false`.

**Tests** use their own database and **wipe it**:

```bash
createdb dataverse_test
TEST_DATABASE_URL=postgres://dataverse:<pw>@localhost:5432/dataverse_test npm test -w backend
```

## 3. Database migration & importing the legacy data

### Schema

`database/migrations/*.sql` are applied in filename order by `npm run db:migrate` (tracked in `schema_migrations`). To change the schema later, add `002_….sql` – never edit an applied file.

How the legacy MySQL model was normalised:

| Legacy (MySQL)                                          | New (PostgreSQL)                                                                                                                             |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `main` (tinyint `gender`, `maritalStatus`)              | `profiles` with `gender` `MALE/FEMALE`, `marital_status` `SINGLE/MARRIED/DIVORCED/WIDOWED`                                                   |
| `fathersID`, `mothersID`, `spouseID` = `0` for “nobody” | real `NULL` foreign keys (`ON DELETE SET NULL`), spouse link kept **symmetric**                                                              |
| `dob = '0000-00-00'`                                    | `NULL`                                                                                                                                       |
| `lineage` JSON `["en","bn"]`, `tags` text               | `lineage` text, `tags text[]` (GIN-indexed)                                                                                                  |
| `_union`, `eduLevel`, `fb`, `insta` …                   | `union_name`, `education_level`, `facebook`, `instagram` …                                                                                   |
| `caller_id(name, number, connectionID, profileID)`      | `caller_contacts(name, number, connection_id, profile_id)` + generated digit column, trigram indexes, **unique** `(phonebook, number, name)` |
| `posts`                                                 | `posts` (notes on a profile)                                                                                                                 |
| `pages`                                                 | dropped (it only held legacy PHP routing)                                                                                                    |
| photos in `img/profile/profile_<id>.jpeg`               | `profile_photos` (bytes in PostgreSQL – serverless hosts have no persistent disk)                                                            |
| _(none)_                                                | `users`, `site_settings`, `audit_logs`, `rate_limits`                                                                                        |

Profile and contact **IDs are preserved**, so existing “Dataverse IDs” and relationships keep working.

### Importing your existing data

The importer reads the `mysqldump` file directly (no MySQL server needed):

```bash
# put the files here (this folder is git-ignored on purpose):
#   database/import/dataverse_db_21-06-2026.sql
#   database/import/img/profile/profile_1.jpeg ...   (optional)

npm run db:import -- --dry-run          # parse + validate inside a transaction, write nothing
npm run db:import                       # real import (refuses if profiles already has data)
npm run db:import -- --truncate         # replace existing profile/contact/post data
```

Options: `--file <dump.sql>`, `--photos <folder>`, `--truncate`, `--dry-run`. The whole import is one transaction. It reports counts and warnings (e.g. dangling spouse links, duplicate or empty contacts that were dropped).

> **Privacy:** the legacy dump and photos contain real personal data (NID numbers, phone numbers). `.gitignore` already excludes `database/import/*`, `.env` and `legacy/`. Do not commit them. Consider removing them from the old repository's history too.

Importing into the **hosted** database: put the provider's `DATABASE_URL` in your local `.env` and run the same commands from your computer.

## 4. Admin bootstrap

Public registration **always** creates role `USER`; the API rejects any attempt to send a role. Administrators come from:

1. **Bootstrap env vars** – set `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD` (≥ 10 chars), optionally `BOOTSTRAP_ADMIN_USERNAME` / `BOOTSTRAP_ADMIN_NAME`, then run `npm run db:migrate` (or `npm run admin:create`). It is idempotent and never overwrites an existing account's password. Remove the password variable afterwards.
2. **The Admin Panel** – an existing admin can create users, promote/demote, deactivate, reset passwords.

```bash
npm run admin:create -- --email me@example.com --username boss --password 'a-long-passphrase'
```

Safety rails: admins cannot demote/deactivate/delete themselves, and the last active admin can never be removed. Role changes, deactivation and password changes revoke that user's existing sessions immediately.

## 5. Environment variables

See [`.env.example`](.env.example) for the annotated list. Required: `DATABASE_URL`, `JWT_SECRET` (≥ 32 chars). The API refuses to start with a missing/short secret.

| Variable                                                          | Purpose                                                    |
| ----------------------------------------------------------------- | ---------------------------------------------------------- |
| `DATABASE_URL`                                                    | PostgreSQL connection string                               |
| `DATABASE_SSL`, `DATABASE_SSL_REJECT_UNAUTHORIZED`, `PG_POOL_MAX` | TLS and pool tuning                                        |
| `JWT_SECRET`, `JWT_EXPIRES_DAYS`, `BCRYPT_ROUNDS`                 | Auth                                                       |
| `SITE_URL`                                                        | Public URL, used in reset emails                           |
| `CORS_ORIGINS`                                                    | Only if the frontend is on a different domain than the API |
| `BOOTSTRAP_ADMIN_*`                                               | First administrator                                        |
| `RESEND_API_KEY`, `MAIL_FROM`                                     | Optional password-reset email (Resend HTTP API)            |
| `SERVE_FRONTEND`, `PORT`, `TRUST_PROXY`                           | Normal-server mode                                         |

## 6. Deploying to Netlify (Free)

1. Push the repo to GitHub (section 9).
2. Create a hosted PostgreSQL database (section 2) and run `npm run db:migrate` (and optionally `db:import`) **from your computer** against it.
3. In Netlify: **Add new site → Import from Git**. `netlify.toml` already sets the build command (`npm run build`), publish dir (`frontend/dist`), functions dir and the redirects.
4. **Site configuration → Environment variables**: add `DATABASE_URL`, `JWT_SECRET`, `SITE_URL` (your `https://…netlify.app` URL), and optionally `RESEND_API_KEY` / `MAIL_FROM`. Leave `CORS_ORIGINS` empty (same origin).
5. Deploy. Check `https://<site>/api/health` and `/api/health/db`.

How it fits together: `netlify.toml` rewrites `/api/*` to `netlify/functions/api.mjs`, which wraps the same `createApp()` with `serverless-http`. The frontend and API share one origin, so the **HttpOnly session cookie + CSRF header** scheme works with no CORS.

Free-tier notes

- Functions have a 10 s limit and a ~6 MB request/response limit. Photos are resized in the browser to ≤ 640 px and capped at 1 MB; vCard imports at 2 MB.
- Rate limits and counters live in PostgreSQL (`rate_limits`), so they are shared across function instances.
- Cold starts add a little latency to the first request after idle time.

## 7. Moving from Netlify Functions to a normal Express server (VPS / Docker)

Nothing in `backend/src` knows about Netlify – only `netlify/functions/api.mjs` does. To self-host:

```bash
git clone <repo> && cd dataverse && npm ci
cp .env.example .env              # production values, NODE_ENV=production, SERVE_FRONTEND=true
npm run build                     # builds frontend/dist
npm run db:migrate
npm start                         # Express on $PORT serves /api AND the React app
```

Put nginx/Caddy in front for HTTPS (cookies are `Secure` in production, so HTTPS is required) and keep the process alive with systemd or PM2 (`pm2 start backend/src/server.js --name dataverse`). Set `TRUST_PROXY=1` behind one proxy. To host the frontend elsewhere (e.g. keep it on Netlify while the API moves), build it with `VITE_API_URL=https://api.example.com` and set `CORS_ORIGINS=https://your-site.netlify.app` on the API – the API will then also need `SameSite=None` cookies or Bearer tokens; the simplest path is keeping both on one domain.

The same bundle also works on Render, Fly.io, Railway, etc. (start command `npm start`).

## 8. Permissions & security model

|                                                          | Anonymous |                       USER                       | ADMIN |
| -------------------------------------------------------- | :-------: | :----------------------------------------------: | :---: |
| See profiles, Shekor, Caller ID                          |     –     |                        ✅                        |  ✅   |
| Create profiles / contacts (if allowed in site settings) |     –     |                        ✅                        |  ✅   |
| Edit / delete a profile                                  |     –     | own (created by them or linked to their account) |  all  |
| NID field                                                |     –     |                own profiles only                 |  all  |
| Edit / delete contacts                                   |     –     |                 those they added                 |  all  |
| Admin Panel, users, site settings, audit log             |     –     |                        –                         |  ✅   |

Implemented protections: bcrypt hashes (never returned or logged) · JWT in an **HttpOnly, SameSite=Lax, Secure** cookie plus CSRF header check · every request re-checks the user in the database (instant revocation) · Zod validation with `.strict()` schemas · parameterised SQL only (LIKE wildcards escaped) · Helmet headers and a CSP on the static site · PostgreSQL-backed rate limits on login/register/forgot/reset · timing-safe login (no user enumeration) · uploaded images verified by file signature · social links rendered only if `http(s)` · audit log for user, role, profile, contact and settings changes (secrets scrubbed) · generated temporary passwords shown once.

Password reset: `/forgot-password` emails a one-hour single-use link (needs `RESEND_API_KEY`; without it, admins reset passwords in the panel).

## 9. Git / GitHub

The repository is already initialised with a clean history of focused commits.

```bash
git remote add origin git@github.com:<you>/dataverse.git
git push -u origin main
```

The commits are authored as `Dataverse Dev <dev@dataverse.local>`; set your identity first if you want your name on them (`git config user.name/email`) or rewrite the author with `git rebase -r --root --exec 'git commit --amend --reset-author --no-edit'`.

## 10. API reference (summary)

All routes are under `/api`; everything except those marked public needs a session.

- **Public**: `GET /health`, `GET /health/db`, `GET /settings/public`, `POST /auth/register|login|logout|forgot-password|reset-password`
- **Account**: `GET /auth/me`, `PATCH /me`, `PUT /me/password`
- **Profiles**: `GET/POST /profiles`, `GET/PATCH/DELETE /profiles/:id`, `GET /profiles/options?q=`, `GET /profiles/facets`, `GET /profiles/:id/family`, `GET/PUT/DELETE /profiles/:id/photo`, `GET/POST /profiles/:id/posts`, `PATCH/DELETE /posts/:id`
- **Shekor**: `GET /tree/:id?up=3&down=2` (lineage, ancestors, descendants, family)
- **Caller ID**: `GET/POST /contacts`, `PATCH/DELETE /contacts/:id`, `GET /contacts/relatives`, `POST /contacts/import-vcf`
- **Search / dashboard**: `GET /search?q=`, `GET /dashboard`
- **Admin (ADMIN only)**: `GET /admin/stats|system|settings|audit-logs`, `PUT /admin/settings`, `GET/POST /admin/users`, `GET/PATCH/DELETE /admin/users/:id`, `POST /admin/users/:id/reset-password`, `GET /admin/contacts/duplicates`, `POST /admin/contacts/relink`, `DELETE /admin/contacts/phonebook/:id`

List endpoints are server-side paginated (`page`, `limit ≤ 100`) and return `{ items, total, page, pages }`.

## 11. Troubleshooting

- **`Invalid configuration: JWT_SECRET …`** – set a ≥ 32-char secret.
- **`self-signed certificate` from the database** – set `DATABASE_SSL_REJECT_UNAUTHORIZED=false`.
- **`too many connections`** – use the provider's pooled URL; keep `PG_POOL_MAX=1` on Netlify.
- **`extension "pg_trgm" is not available`** – enable it in the provider's dashboard (Supabase: Database → Extensions) and re-run the migration.
- **Signed out immediately after deploy** – the site must be served over HTTPS (Netlify does this) because the cookie is `Secure` in production.
- **500 `MISCONFIGURED` from `/api`** – open the function logs; a required environment variable is missing.

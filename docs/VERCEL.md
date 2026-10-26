# Deploying to Vercel (`production` branch)

Frontend (Vite/React) and backend (Express) both run on Vercel from the `production` branch.
`vercel.json` + `api/index.js` are the Vercel entry points.

## Environment variables (Vercel > Project > Settings > Environment Variables, scope: Production)
| Name | Value |
|---|---|
| `DATABASE_URL` | your external PostgreSQL URL (prefer the pooled one) |
| `JWT_SECRET` | 48+ random chars: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `NODE_ENV` | `production` (build still installs dev deps via `npm ci --include=dev` in vercel.json) |
| `SITE_URL` | `https://your-domain` |
| `TRUST_PROXY` | `1` |
| `DATABASE_SSL` | `true` (if your host requires SSL) |
| `RESEND_API_KEY`, `MAIL_FROM` | optional (email) |
| `BOOTSTRAP_ADMIN_*` | first run only; remove the password afterwards |

Mark secrets as **Sensitive**. Leave `CORS_ORIGINS` empty (same origin).

## One-time steps
1. Run migrations from your computer: `DATABASE_URL=... npm run db:migrate`.
2. Vercel > Add New Project > import `ncodevsec/dataverse`. Framework preset **Other**, Root Directory `./` (settings come from `vercel.json`).
3. Settings > Git > **Production Branch = `production`**.
4. Add env vars, then deploy. Check `/api/health` and `/api/health/db`.
5. Add your custom domain (HTTPS is required, cookies are `Secure`).

## Merging new features
```
git checkout production
git merge main          # or: git merge feature/xyz
git push origin production   # Vercel redeploys
```
Keep Vercel-specific changes in `vercel.json`, `api/`, `docs/VERCEL.md` only.

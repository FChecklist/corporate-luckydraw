# Cloudflare setup for Corporate Lucky Draw (for the release session)

Nothing of this exists yet. Names are in the repo; the owner's Cloudflare login/token is needed (never in git).

## 0. Stop-ship found
`pages/wrangler.toml` and `apps/edge/wrangler.toml` were copied from Bingo and pointed at BINGO's database (id f2d1ed1b-...). They now say `REPLACE-WITH-NEW-D1-ID` so a deploy cannot touch Bingo's data. Put the new id from step 1 there (both files).

## 1. Database (D1)
`wrangler d1 create corporate-luckydraw` (same name as in the toml), copy the id into both toml files, then apply all migrations in `apps/edge/migrations` (30 files, in order, last 0031_draw.sql): `wrangler d1 migrations apply corporate-luckydraw --remote` from `apps/edge` (or the project's migration script if the release notes of Bingo say otherwise).

## 2. Pages project
Project name `corporate-luckydraw` (also in `package.json` script `pages:deploy`, `pages/wrangler.toml`). Create: `wrangler pages project create corporate-luckydraw --production-branch main`. Deploy: `bun run pages:deploy` (builds `pages/public`, adds ?v=<commit> to every script/css address, writes version.json). Free plan, `nodejs_compat` flag and Smart Placement come from the toml.

## 3. Domain
Custom domain `luckydraw.corporatetambola.com` (brand default, `apps/edge/src/brand.ts`): Pages project > Custom domains > add; DNS in zone corporatetambola.com is a CNAME `luckydraw` -> `corporate-luckydraw.pages.dev` (proxied). Same pattern as the other games (bingo., housie., ...). Owner decision still open: the exact host name.
Also check: Cloudflare zone setting Browser Cache TTL = "Respect Existing Headers" (optional, owner's call; the ?v= addresses already protect returning visitors).

## 4. Variables and secrets
All names are in `config/SECRETS_NAMES.md` (names only). Pages variables to set in the dashboard: `PUBLIC_ORIGIN=https://luckydraw.corporatetambola.com`, `MAIL_FROM`, `OWNER_NOTIFY_EMAIL`; optional `FUNNEL=1` (funnel events, off when unset), `STRICT_KEYS=1` on the live site. Secrets: DATA_KEY, PHONE_SALT, ORGANIZER_SECRET, CRON_KEY, INBOUND_SECRET, VISIT_KEY, REPORT_KEY, RESEND_API_KEY, RESEND_WEBHOOK_SECRET, RAZORPAY_KEY_ID/KEY_SECRET/WEBHOOK_SECRET (payments only "IT Services by Rajat Agarwal"), PAY_SERVICE_KEY. New values for this site; do not reuse Bingo's DATA_KEY/PHONE_SALT.
Razorpay: webhook to `https://luckydraw.corporatetambola.com/api/...` (as in `docs/GO_LIVE_CHECKLIST.md`); Resend: sending domain and inbound webhook for the new host.

## 5. Scheduled job (cron)
`apps/cron/wrangler.toml`, name `corporate-luckydraw-cron`, every minute, TARGET `https://corporate-luckydraw.pages.dev`. From `apps/cron`: `bun x wrangler@3 deploy`, then `wrangler secret put CRON_KEY` (same value as the Pages CRON_KEY). The draw runs from this tick, so the cron MUST be live before any draw time.

## 6. Games bar and links
`gamesbar.js` already lists Lucky Draw at `/`. The other sites' footers/bars need the live Lucky Draw URL once the domain exists.

## 7. After deploy
Open `/version.json` (commit matches), `/api/mode`, `/api/game-manifest`, make a rehearsal draw (10 people), check mail, then flip to LIVE only on the owner's word. `docs/DEPLOYS.md` still describes `corporate-bingo`: update it after the first deploy.

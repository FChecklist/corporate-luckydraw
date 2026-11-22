# Deploys

What is live, and how to know.

* Open `/version.json` on the site. It holds `commit` (the git commit the pages were built from), `dirty` (true if files differed from that commit), `builtAt` (UTC) and `game`. It holds nothing else.
* A deploy is made with `bun run pages:deploy`: it builds `pages/public` (which writes `version.json` and adds `?v=<commit>` to every local script and stylesheet address), then uploads it to the Cloudflare Pages project `corporate-luckydraw`. The Worker's database changes are the numbered files in `apps/edge/migrations` (30 files, last `0031_draw.sql`).
* TEST or LIVE mode (whether real payments are taken) is separate from a deploy: `GET /api/mode`.

## What exists

| Thing | Value |
|---|---|
| Pages project | `corporate-luckydraw` |
| Domain | `luckydraw.corporatetambola.com` |
| D1 database | `corporate-luckydraw`, id `aa913d0a-24e2-4bd2-a9bd-27e7186a24bd` (in `pages/wrangler.toml` and `apps/edge/wrangler.toml`; never Bingo's) |
| First deploy | 2026-11-01, deployment `c1a442dc`, commit `15dd94b`, tag `luckydraw-1-2026-11-01`; mode TEST |

## The draw tick (important)

`apps/cron` (the every-minute Worker) is not deployed: there is no Workers token. The scheduled tick (`/api/lifecycle/tick`) is called every 5 minutes by GitHub Actions and by Supabase pg_cron. So an automatic draw can start up to about 5 minutes after the published time (up to about 20 minutes if both callers miss). No screen or text may promise minute precision: the pages say "at about the published time, within a few minutes". If the cron Worker is deployed later (`apps/cron`, secret `CRON_KEY`), the delay drops to about one minute.

## Rollback

Cloudflare dashboard, Workers and Pages, corporate-luckydraw, Deployments: roll back to an earlier deployment. Record the previous deployment id before every deploy.

## Deploys by commit

| Commit | Date | Deployment | Mode |
|---|---|---|---|
| 15dd94b | 2026-11-01 | c1a442dc | TEST |

## Switches added 2026-11-01

* `DEMO_GAME=1` (Pages variable, off by default): shows the free demo game (up to 10 people, no payment, named "Demo", 3 a day per organizer account and per address). The console button reads it from `/api/game-manifest`.
* Payment test (`/paytest`, Rs 1): owner key only. The page asks for the owner key and sends it as `x-organizer`; without it the server answers 403. Ledger code is `LDR` (txn ids look like `LDR-pay_...`, product type `payment_test`). Needs the site in LIVE mode with the Razorpay and central ledger secrets.

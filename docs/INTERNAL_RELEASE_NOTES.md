# Corporate Lucky Draw: internal release notes

INTERNAL REFERENCE ONLY. Not for customers and not for any website or front end. Written on 2 Nov 2026 for the owner and future maintainers. All times are IST (India Standard Time, UTC plus 5:30). Facts were read from git, from the Cloudflare Pages deployment list (read-only) and from the live address on 2 Nov 2026 between 01:45 and 02:05 IST (the live state was still changing during that time, so a release made after 02:05 is not described here); anything that could not be checked is marked "unverified".

## What this is
Corporate Lucky Draw is the prize-draw game for company teams: eligible people are entered and winners are drawn live at the end of the event; it handles large crowds (up to 100,000).

| Item | Value |
|---|---|
| Live address | https://luckydraw.corporatetambola.com |
| Cloudflare Pages project | `corporate-luckydraw` |
| GitHub repository | `FChecklist/corporate-luckydraw` (PRIVATE repository) |
| Branch holding the latest release work | `feat/demo-and-paytest-2026-11-01` (tip at the time of writing: `59797fb`) |
| What is live now | Commit `59797fb`, deployment `90a7900c-77f1-4bc4-a252-397de5c0c377` (1 Nov 2026 21:59 IST), re-deployed 2 Nov 00:02 IST as `769a64f6-b0dc-48f9-ab64-dbb9aca07cb5`. Confirmed by the Cloudflare list and by version.json (commit 59797fb076bc, dirty false). Release-list version 1.4.0. Note: the main checkout of this repo is detached; the remote branch tip is 59797fb. |

## Release table (newest first)
| Date and time (IST) | Version | Commit | Cloudflare deployment id | Rollback id (the live one before it) | Tests and exceptions |
|---|---|---|---|---|---|
| 02 Nov 2026 00:02 | 1.4.0* | `59797fb` | `769a64f6-b0dc-48f9-ab64-dbb9aca07cb5` | `90a7900c-77f1-4bc4-a252-397de5c0c377` | Same build as the deployment before it, redeployed only to add the GOOGLE_CLIENT_ID setting (Google sign-in stays dormant on game pages: the owner switched it off in code on 23 Oct 2026; it is live on the console). version.json unchanged. No new tests. |
| 01 Nov 2026 21:59 | 1.4.0* | `59797fb` | `90a7900c-77f1-4bc4-a252-397de5c0c377` | `d9b70fc3-9298-4c67-8cee-a340d9c99415` | Partner full run on this exact commit: 1,874 pass / 0 fail. Migration 0022_ledger_c.sql (this game's OWN D1 database; additive: ALTER ADD COLUMN, CREATE TABLE IF NOT EXISTS, and a backfill of the new txn_id column) was applied BEFORE the deploy: 114 applied, 51 already there, 0 failed. Live checks: version.json 59797fb076bc, hide files present, robots Disallow /, no sitemap, noindex tag on every page, X-Robots-Tag, all pages 200. The payment TEST/LIVE switch was not touched. |
| 01 Nov 2026 08:44 | 1.4.0* | `49a6b47` | `d9b70fc3-9298-4c67-8cee-a340d9c99415` | `5f075cf4-3d25-4c20-8c97-37cb795bda36` | Same commit 49a6b47 as the deployment before it, redeployed on 1 Nov 2026 so that new secrets (payment settings) apply. This is the rollback target of the 21:59 release. This build is NOT hidden from search (no noindex yet). |
| 01 Nov 2026 02:38 | 1.4.0* | `49a6b47` | `5f075cf4-3d25-4c20-8c97-37cb795bda36` | `c1a442dc-3a4b-4100-81d1-adae641e0ec2` | Partner laptop 1,854 pass / 0 fail on this head (31 Oct note). |
| 01 Nov 2026 01:57 | 1.4.0* | `15dd94b` | `c1a442dc-3a4b-4100-81d1-adae641e0ec2` | none (first deployment) | First deployment of this project. Tested head 90dcb7a: 1,835 pass / 0 fail. A first deployment cannot be rolled back (nothing before it). |

Version marked with a star comes from the repo's release list (`apps/edge/src/releases.json`); the live version.json carries only the commit. This project was created on 1 Nov 2026 about 01:57 IST (its first deployment), so it has only five production deployments.

## What changed in each release

### 1 Nov 2026 21:59 IST, commit 59797fb (the "hidden, wording, 100,000 cap" release)
Previous live: `49a6b47`. Release-list version 1.4.0.
- Users: the site is hidden from search for the first time (noindex tag and header, robots Disallow all, no sitemap). Lucky Draw never had the hide release of the morning of 1 Nov; its code was copied from Luck.
- Users and Organizers: gentler, user-favouring wording (refunds, cancel, limits), guide explanations, privacy, terms and mail warnings ("PLEASE KEEP SAFE"); no street, city, state or pin code, only India.
- Organizers: the people limit is stated as 100,000 with a friendly refusal; the family limit is the person plus up to 4 family members (decision by the owner 1 Nov about 19:45 IST, was 10).
- Organizers: a free Demo game (up to 10 people) and an owner-only Rs 1 payment test with site code LDR exist behind switches (DEMO_GAME off).
- Database: migration 0022_ledger_c.sql was applied to this game's own D1 database before the deploy (additive, repeat-safe).

### Payment mode
All six games answer "LIVE" on /api/mode (checked 2 Nov about 01:45 IST for Bingo and Tambola; the other four were LIVE at the 1 Nov 23:10 IST handover entry). For Lucky Draw the LIVE mode was set at 08:45 IST on 1 Nov 2026 by a database write by the boss session (audit row 'mode-switch'); the owner confirmed his go at 23:00 IST. Payment settings are applied only by redeploying the same commit.

### 1 Nov 2026 01:57 to 08:44 IST (the project's first deployments)
- 01:57 first deployment, commit 15dd94b (own D1 database named corporate-luckydraw). 02:38 commit 49a6b47 (DEPLOYS.md lists deploys by commit; telemetry test). 08:44 the same commit redeployed so the payment settings apply.

## Earlier numbered releases
(none: this project has no numbered releases before 31 Oct 2026)


The release list inside the repo also names versions 1.4.0, 1.3.2 and 1.3.1 (copied from Bingo's list when the engine was built); they were not separate Lucky Draw releases.

## How to roll back
1. Sign in to the Cloudflare dashboard (the account that holds the Corporate Games sites).
2. Left menu: Workers and Pages. Open the project `corporate-luckydraw`.
3. Open the Deployments tab. Find the rollback id from the table above (the list shows the first 8 characters).
4. On that line press the three dots, then "Rollback to this deployment", and confirm.
5. Open https://luckydraw.corporatetambola.com/version.json and check that the commit is the old one. Check that the home page of the site opens.

Things to know before pressing the button:
- Do it only when no real game is being played or about to start (the release rule is: no real game within 3 hours; test games are named LT-...).
- A rollback puts back the old files and old code only. It does NOT undo database changes. Settings such as secrets are fixed into each deployment when it is made, so an old deployment may lack a setting that was added later (this is why same-build redeploys were needed to add the Google setting on 1 to 2 Nov 2026).
- After a rollback, check that the site is still hidden from search: robots.txt must say Disallow /, and every page must carry a noindex tag.


Database: the 21:59 release applied migration 0022 to Lucky Draw's own database. A rollback does NOT undo it; the migration is additive, so the old code keeps working with the new columns.

## Known gaps and open decisions
- Real Rs 1 payment test for each game: the owner makes it himself on the main website. Open.
- Independent, water-tight review of the text of the one legal document (checklist row 45): not yet done.
- The new free Demo game sits behind a setting called DEMO_GAME. That name was not found in the Cloudflare settings of this project (read 2 Nov 2026), so it appears to be off. When to switch it on needs an audit and the owner's go. If the setting is held somewhere else this is unverified.
- /sitemap.xml: the new build has no sitemap, but an old copy can still be answered from Cloudflare's edge cache (a request with a query string such as ?x=1 shows 404). It leaves the cache by itself; a cache purge of the zone would clear it at once (not done).
- Test games used for live checks are named LT-... and are deleted afterwards.
- Payment LIVE: the owner has approved it (1 Nov 23:00 IST). The owner-only TEST/LIVE switch is `/api/owner/mode` and was left as it was.
- The repository is private; the local main checkout is detached at 59797fb.
- Whether ID-only joining is in this game's live code is not confirmed in the records (unverified).

## Where the details are
- Handover file: `C:\ct\test-sites\handover\2026-11-01\RELEASE-HANDOVER-2026-11-01.md` (the release log is its section 10, open owner items are section 11). Older release notes of 31 Oct 2026 are in the folder `C:\ct\test-sites\handover\2026-10-31\`.
- Memory notes of the boss session, folder `C:\Users\Dell\.claude\projects\C--ct-ct\memory\`: `boss-state-2026-11-01.md` (state at each hour of 1 to 2 Nov 2026), `central-payment-ledger-rules-2026-11-01.md`, `wording-tone-rule-flowery-2026-11-01.md`, `game-rules-owner-decisions-2026-10-31.md`, `partner-laptop-2026-10-30.md` (how the test laptop is used).
- The list of decisions by the owner with status: `decisions-72h-checklist.md` and `decisions-72h-tambola-verified.md` in the handover folder; who did what: `sessions-done-register.md`.
- Release steps and rollback command: `release-runbook-2026-11-01.md` in the folder `handover\2026-10-31`.
- Technical readers can also open `docs/DEPLOYS.md` in a game repo (list of deployments by commit), where it exists.

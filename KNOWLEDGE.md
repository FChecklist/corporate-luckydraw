# Corporate Lucky Draw: how the game works

Read from the code (`apps/edge/src/draw.ts`, `vendor/game-core/packages/luckydraw`, `packages/beacon`), 28 Nov 2026. Repo-level facts (stack, build, deploy, rollback) are in `docs/REPO-KNOWLEDGE.md`; family index in `KNOWLEDGE-MAP.md`. Current release: see `apps/edge/src/releases.json` (newest first); the live site reports it at `/version.json` and in every page footer as `vX.Y.Z`.

## In one paragraph
A company event game. An Organizer sets how many winners, the prize for each place, and automatic or manual draw. Employees join with one ID (employee ID, mobile or e-mail): joining is registering, one seat per person. At the draw time the winners are chosen from the entries using a public random value (drand beacon), so anyone holding the entries and that value gets the same winners.

## Who does what
- Organizer / Host: creates the game, sets the draw, can press Draw in manual mode. Co-hosts and others cannot (403).
- Participant: opens the link, registers once, sees "You won" if chosen.
- Platform (shared with the sibling games): accounts, payment via IT Services + Razorpay, rehearsal, helpdesk, retention.

## Input
- Draw settings (`checkDrawSettings`): `winners` (whole number 1..1000, not more than the allowed people), `prizes` (list, max one per winner, each cleaned and cut to 80 chars; none in rehearsal), `mode` = `auto` or `manual`.
- Entries: the participant IDs registered for the game.

## Lifecycle and logic
1. Settings are saved (`saveDrawSettings`) until the draw has happened; after that they are fixed.
2. Registration closes (`registrationClosed`) when the draw has started or happened, or, in auto mode and not paused, when the draw time is reached.
3. Auto mode: the scheduled job (`drawTick`, up to 10 draws per call) draws at the published time plus 3 seconds; the cron can run a few minutes late. Manual mode: Organizer/Host presses Draw. Paused games never draw.
4. `runDraw` first claims the draw in the database (sets `closing_ms`; a second request gets "being made, wait"; a claim older than 120 s can be retaken). Any failure releases the claim and changes nothing.
5. It fetches the beacon value for the draw round (auto: exactly that round; manual: the latest, trying up to 3 earlier). If the beacon does not answer: "press Draw again in a minute", nothing changed.
6. Entries are fed to the common engine (`luckyDrawRules`, `registerMany` in batches of 5000), then `tick` (auto) or `draw` (manual) with the beacon value gives the ordered winners.
7. The result (winner IDs by place, round, beacon value, entry count, who drew) is written once (`drawn_ms IS NULL` guard, so a repeat is "already drawn"). The game's end is recorded and, for real (non-rehearsal) games, winners and prize rows are recorded and e-mails go out.

## Output
- Result screens show places with masked names (`First L. (ID ends 42)`, masked IDs/e-mails), prizes, beacon round and the fairness sentence.
- E-mail: each winner with an e-mail ID is told; the Organizer gets a summary. Mail failure never blocks or undoes the draw.
- Fairness wording (`DRAW_FAIRNESS`): same entries and same public beacon value always give the same winners; the value is published by drand and nobody can choose or predict it. The code proves only the first half; the second comes from the public beacon.
- Privacy line: no personal details needed; participant information is deleted within 24 hours of the game (actually 20 hours after the end).

## Where things live
- Draw: `apps/edge/src/draw.ts`; rules engine: `vendor/game-core/packages/luckydraw`; beacon: `packages/beacon/src/index.ts`.
- Pages: `apps/web/public/*.html`; build: `pages/build.mjs` (writes `version.json`, stamps the footer version).
- Releases: `apps/edge/src/releases.json` + `CHANGELOG.md`.

## Not verified here
Live behaviour (the beacon, scheduled job lateness, mail delivery) was not exercised; this note is from reading code.

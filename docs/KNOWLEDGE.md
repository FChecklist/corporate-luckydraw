# Knowledge: Corporate Lucky Draw

**Version 1.5.0** (20 Nov 2026). The version lives in four places that must agree (a test checks it): `version.json`, `CHANGELOG.md`, this file, and the footer of every page (read from `apps/edge/src/releases.json`).
Read this first. Then `docs/STATE.md` (what the P1 work did and what the owner must decide), `docs/CONTRACT_V1.md` and `docs/PAY_STEP.md` (the console), `KNOWLEDGE-MAP.md` (all repositories).

## What this is
A lucky draw for company events. The organizer lists people by ID, shares one game link, people enter their ID, and at the draw time the software picks the winners from a public random beacon (drand). Players never pay. The organizer pays in the console (not here). Nothing is deployed from this branch until two independent audits say PASS and the owner says go.

## The rules the code keeps (owner rules, 20 Nov 2026)
| Rule | What the code does | Where | Test |
|---|---|---|---|
| a. Closed group, by invitation, ID only | Every game is made for the ID list. "Anyone with the link", `closed:false` and mobile/name/e-mail joins are refused by the server. An unlisted ID waits for the organizer. | `invite-only.ts`, `worker.ts` | `invite-only.test.ts` |
| c. Payment only through the console | `POST /api/console/paid` (signed notice) marks the game paid, once per order, repeatable. No payment, no draw (402). | `console-adapter.ts`, `draw.ts` | `console-paid.test.ts` |
| e. A fair draw | The list of entries is frozen at the draw time or at the press of Start. A manual start uses a beacon round published after the press. Same entries + same beacon value = same winners. | `draw.ts` | `draw-fairness.test.ts`, `draw-rules-sim.test.ts` |
| f. One true privacy line | Player details deleted within 24 hours of the draw; the organizer's, hosts' and winners' details kept 365 days; invoices as the law requires. | `draw.ts` `NO_PERSONAL_LINE` and every screen, mail, report, consent K4/K6 | `privacy-line.test.ts` |

Never write "100% secure" or the like anywhere (a test keeps it out). Voice: simple, warm, polite, favour the user.

## How a draw happens
1. People enter an ID; a listed ID gets a seat at once, an unlisted one waits for the organizer (`worker.ts` join, `people.ts`).
2. **Automatic**: the draw time is the game clock's start (pauses added). From that instant the list is closed (`registrationClosed`, `freezeAt`). The draw uses the beacon round OF the draw time. The scheduled job (`apps/cron`, every minute, secret `CRON_KEY`) calls `POST /api/lifecycle/tick` which calls `drawTick` (3 seconds after the draw time at the earliest). Any page that asks (`GET /api/z/{id}/draw`) does the same, lazily.
3. **Manual**: the organizer or a Host presses Start (`POST /api/z/{id}/drawnow`). That stores `draw.freeze_ms` (the press) and `draw.target_round` (= round public at the press + 2) and closes the list. The winners come when that round is published (3 to 6 seconds); the job or a page completes it. Pressing again changes nothing. A beacon that does not answer never reopens the list.
4. `entryPids(db, eid, freezeMs)` reads the seats AS THEY STOOD at the freeze: a seat blocked at or after the freeze (`seat.blk_ms`) still counts, a seat that joined or was claimed at or after it (`participant.joined_ms`) does not. Nobody can be added, put back or approved after the freeze (`list-closed`).
5. The engine is `vendor/game-core/packages/luckydraw` (ranking by SHA-256 of `CB1-LUCKY|game|ref|beacon|ID`; lowest ranks win).
6. Retention: `erasePersonal` removes players' data 20 hours after the draw (promise: 24); winners' prize records and the team's details stay 365 days (`lifecycle.ts`).

## Payment chain (deployed dark)
game -> console -> Moneypenny -> IT Services -> Razorpay. The game never shows a payment page. The console sends a SIGNED notice (Ed25519, 60 seconds, one use) to `/api/console/paid`. The bridge (`apps/edge/src/console-bridge/`) is copied from the console repo and must NOT be edited here.
- `payInfo(env,{eid,sub})` read-only: `{owner,item,paid}`.
- `markPaid(env,{eid,sub,item,orderRef,nowMs})`: re-checks owner and size every call (`definite` refusal when wrong), one statement sets size, people limit and (late payment) the new time, notes are INSERT OR IGNORE, a repeat of the same order is a no-op and never resets, a different order on a paid game is refused.
- Descriptor in `zc.js`: `payGame: "luckydraw"`, `consoleOrigin: "https://console.corporatetambola.com"`.
- CSP of the console page (`pages/build.mjs`): `frame-src` = `https://itservices-rajat-agarwal.pages.dev` only; `connect-src` allows `https://console.corporatetambola.com`; no wildcard, no Google, no Razorpay.

## Go-live (one step)
Set `CONSOLE_PUBKEYS` (the console's public keys) AND `PAY_VIA_CONSOLE=1` together. The redirects switch on only when both are set; `/api/status/health` shows `go_live.problems` and fails on a half switch. Then set `EMP_LEGACY_BEFORE_MS` in `people.ts` to the deploy instant. Never set `TEST_OPEN_JOIN`.

## Tests
- `bun run typecheck`
- `bun test packages apps tools/control-worker` (whole suite, one process, about 3 minutes)
- `node tools/run-each-file.mjs --jobs 4` (every file its own process; this is what CI job `each-file` runs)
- `DRAW_SIM_N=20000 bun test apps/edge/test/draw-rules-sim.test.ts` for a bigger simulation
- CI: `.github/workflows/ci.yml`, jobs `typecheck` and `each-file`.
- Every fix has a test that was shown to fail when the fix was broken, then restored (the break is named in the test file's header).

## Known gaps (not fixed in this branch, and why)
- The signed assertion covers `eid` and `sub` but not `item` and `orderRef` (`console-bridge/assertion.ts`, `bridge.ts`): the bridge belongs to the console repo.
- A paid notice that stopped half way leaves the bridge row `marking` and the bridge answers 409 `in_progress` to the same order: fixed in the console repo (console-gamepay session). This game's `markPaid` is ready for the repeat.
- `to=pay` and `to=free` in the console hand-off are read but the target page is ignored; the game opens `zc.html`. The contract allows it.
- 26 of the console's 40 contract fixtures need the console's own fake game and are not run here; the other 14 are (`console-contract.test.ts`).
- Host and Co-host keys through the console are not wired (`mintKey` refuses them).
- The game's home page (`index.html`) still has its start form; with go-live its API answers 302 to home.
- Organizer, host and co-host seats are not excluded from the draw (`mark` says "stay out of lucky draws" but `entryPids` does not check the role).
- Owner decisions: the consent wording K4/K6 was changed (legal text, version date unchanged, the exact wording is hashed with every row); the owner approves it.

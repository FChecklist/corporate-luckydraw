# Knowledge: Corporate Lucky Draw

**Version 1.5.3** (22 Nov 2026). The version lives in four places that must agree (a test checks it): `version.json`, `CHANGELOG.md`, this file, and the footer of every page (read from `apps/edge/src/releases.json`).
Read this first. Then `docs/STATE.md` (what the P1 work did and what the owner must decide), `docs/CONTRACT_V1.md` and `docs/PAY_STEP.md` (the console), `KNOWLEDGE-MAP.md` (all repositories).

## The live code is merged in (1.5.3)
- Production runs commit `d040396f69f0` (deployed 5 Nov 2026). This branch contains it (`git merge-base --is-ancestor d040396f69f0 HEAD` answers yes), so nothing live is dropped by deploying the branch. Check this before every deploy.
- Live things that are in the branch now: join retry with jitter, round-2 route classes, the resumable end of a draw (`drawpend/` marker, `finishDraw`), a Stop before the draw (`stopped`), `OWNER_TEST_FREE`, `RUNNER_KEY` (`runnerOk`, `runnerTestGame`), the owner's private price (`price-adjust.ts`, migration `0032_price_adjust.sql`), the demo game (`DEMO_GAME`), the shared payment kit (`paykit.js`), the single Terms document (the old Legal, Privacy, Data processing, Refund and Legal position pages forward to it), no street address anywhere, `console.corporatetambola.com` sign-in links.
- Database files in order: `0031_draw.sql`, `0032_price_adjust.sql` (live, already run), `0033_draw_freeze.sql` (new; the frozen list; run it BEFORE deploying). `test/migrations.test.ts` keeps the files and `SCHEMA` identical, in this order.
- When both sides changed the same words, the owner rules v1.1 wording stands; when only live changed, live stands. A Start press after a Stop works like any manual Start (the list closes, a later beacon round decides).
- The page builder `apps/web/tools/make_site.py` needs the brand kit folder of the owner's own computer, so on this branch the public pages were merged by hand and are checked by the tests.

## What this is
A lucky draw for company events. The organizer lists people by ID, shares one game link, people enter their ID, and at the draw time the software picks the winners from a public random beacon (drand). Players never pay. The organizer pays in the console (not here). Nothing is deployed from this branch until two independent audits say PASS and the owner says go.

## The rules the code keeps (owner rules, 20 Nov 2026)
| Rule | What the code does | Where | Test |
|---|---|---|---|
| a. Closed group, by invitation, ID only | Every game is made for the ID list. "Anyone with the link", `closed:false` and mobile/name/e-mail joins are refused by the server. An unlisted ID waits for the organizer. | `invite-only.ts`, `worker.ts` | `invite-only.test.ts` |
| c. Payment only through the console | `POST /api/console/paid` (signed notice) marks the game paid, once per order, repeatable. No payment, no draw (402). | `console-adapter.ts`, `draw.ts` | `console-paid.test.ts` |
| e. A fair draw | The list of entries is frozen at the draw time or at the press of Start. A manual start uses a beacon round published after the press. Same entries + same beacon value = same winners. | `draw.ts` | `draw-fairness.test.ts`, `draw-rules-sim.test.ts` |
| b. Organizer and Host screens speak to "you" | No "I", "my", "we", "our" in the organizer console, the AI-link page, the organizer guide, the sign-in mail, the server messages to organizers and the agreement boxes K1, K2, K3, K5, K6. Player boxes (K4) and the AI helper's own replies stay as they are. | `zc.js`, `consent-text.json`, `consent.js`, `mails.ts` | `you-voice.test.ts` |
| f. One true privacy line | Player details deleted within 24 hours of the draw; the organizer's, hosts' and winners' details kept 365 days; invoices as the law requires. | `draw.ts` `NO_PERSONAL_LINE` and every screen, mail, report, consent K4/K6 | `privacy-line.test.ts` |

Never write "100% secure" or the like anywhere (a test keeps it out). Voice: simple, warm, polite, favour the user.

## What a typed ID is, and how wrong guesses are limited (owner-accepted, 22 Nov 2026)
- **An ID the person types is matched to the organizer's list. It is not proven.** Nobody can prove from a typed ID who is typing. The organizer can see every card, un-bind one, or remove a person (`docs/ROLES_AND_CONSOLE_SPEC_3.md`: "matched to a list, not proven"). The player's help says the same (`z.js`, `guide.js`).
- **Only WRONG IDs are counted.** `idMissOver` in `worker.ts` allows 30 wrong IDs per network per game per 10 minutes, and 500 wrong IDs per game per 10 minutes from anywhere. Over the limit the answer is 429 `too-many-tries` (the person is told to ask the organizer). The counters live in the `kv` table under `idmiss/<game>/<time>/...` and go with the game's other personal data.
- **One network = an IPv4 address, or an IPv6 /64** (`net-key.ts`, `netGroup`). A line on IPv6 can change the last 64 bits at will, so counting the whole address gave it a new allowance on every try (audit M1 of 9024db89). The same grouping is used for the new-seat allowance (`joinOverLimit`). IPv4 is unchanged.
- **A right ID is never counted and never limited per address.** A whole office sits behind one address and must all get in. Do NOT add a per-address limit on right IDs.
- **The check "is this you?" (`POST /api/z/{id}/who`) shows no name.** It answers `{known: true|false}`. Nothing about the person is shown until the organizer or a Host says yes. A stranger who guesses a right ID learns only that it is on the list; they can then try to join as that person first, and the organizer fixes that by un-binding the card.
- **A typed mobile number is never a way in** (any game, including one saved by an older version that asked for a mobile number): the join reads the ID only. Tests: `guess-limit.test.ts`, `join-global.test.ts`.

## How a draw happens
1. People enter an ID; a listed ID gets a seat at once, an unlisted one waits for the organizer (`worker.ts` join, `people.ts`).
2. **Automatic**: the draw time is the game clock's start (pauses added). From that instant the list is closed (`registrationClosed`, `freezeAt`). The draw uses the beacon round OF the draw time. The scheduled job (`apps/cron`, every minute, secret `CRON_KEY`) calls `POST /api/lifecycle/tick` which calls `drawTick` (3 seconds after the draw time at the earliest). Any page that asks (`GET /api/z/{id}/draw`) does the same, lazily.
3. **Manual**: the organizer or a Host presses Start (`POST /api/z/{id}/drawnow`). That stores `draw.freeze_ms` (the press) and `draw.target_round` (= round public at the press + 2) and closes the list. The winners come when that round is published (3 to 6 seconds); the job or a page completes it. Pressing again changes nothing. A beacon that does not answer never reopens the list.
4. **While the list is closed and the winners are not made yet** (`entriesFrozen` in `worker.ts`), these are refused with 409 `draw-frozen`: delete one person, delete everybody, un-bind, send a card link again, cancel, **close the whole organizer account**, and **an e-mailed deletion request** (the e-mail answer is `action: "draw-frozen"`, no code is sent). They work again once the winners exist. If the draw cannot be made (for example the public random number is not reachable), the list stays closed until it is made; the refusal text says so. `entryPids(db, eid, freezeMs)` reads the seats AS THEY STOOD at the freeze: a seat blocked at or after the freeze (`seat.blk_ms`) still counts, a seat that joined or was claimed at or after it (`participant.joined_ms`) does not. Nobody can be added, put back or approved after the freeze (`list-closed`). From the freeze until the winners are made, delete-one (`forget`), erase, un-bind, send-link-again and cancel are refused with 409 `draw-frozen` (`entriesFrozen` in `worker.ts`, `resendPerson`, `cancelPreview`): this holds also for a Start pressed before the start time. After the draw they work again.
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
- A typed ID is matched, not proven (owner-accepted, see above). A guesser who hits a right ID is not counted and can try to join first as that person; the organizer un-binds the card. A flood of 500 wrong IDs on one game makes people with a wrong ID wait 10 minutes (people with a right ID are not affected).
- The signed assertion covers `eid` and `sub` but not `item` and `orderRef` (`console-bridge/assertion.ts`, `bridge.ts`): the bridge belongs to the console repo.
- A paid notice that stopped half way leaves the bridge row `marking`, and the copied bridge would answer 409 `in_progress` to the same order for ever. This game drops a `marking` row older than 60 seconds before the bridge looks (`sweepStaleMarking`, `console-adapter.ts`), so the repeat is done for real; `markPaid` is safe to repeat. The console repo's own fix is still wanted.
- `to=pay` and `to=free` in the console hand-off are read but the target page is ignored; the game opens `zc.html`. The contract allows it.
- 26 of the console's 40 contract fixtures need the console's own fake game and are not run here; the other 14 are (`console-contract.test.ts`).
- Host and Co-host keys through the console are not wired (`mintKey` refuses them).
- The game's home page (`index.html`) still has its start form; with go-live its API answers 302 to home.
- `TEST_OPEN_JOIN` fails the health check when set (`goLiveState`).
- Organizer, host and co-host seats are not excluded from the draw (`mark` says "stay out of lucky draws" but `entryPids` does not check the role).
- Owner decisions: the consent wording K4/K6 (1.5.0) and K1, K2, K3, K5, K6 (1.5.1, "you" voice) was changed (legal text, version date unchanged, the exact wording is hashed with every row); the owner approves it.

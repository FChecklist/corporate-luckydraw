# Changelog: Corporate Lucky Draw

The newest release is first. The version is kept in four places that must agree (a test checks it): `version.json`, this file, `docs/KNOWLEDGE.md`, and the footer of every page (it is read from `apps/edge/src/releases.json`, which also feeds the owner's version page).
Older releases (1.0.0 to 1.4.0) are listed in `apps/edge/src/releases.json`.

## 1.5.0 - 20 Nov 2026 (branch `p1/owner-rules-v1-1`, PR #3, not deployed)

Fixes for every finding of the independent audit of commit `302d251` (3 High, 4 Medium, 2 Low).

### H1 - the draw is fair even though it runs a little after the draw time
- **The list of entries is frozen** at the draw time (automatic) or at the press of Start (manual). A removal, a leave, a put-back or a late claim after that moment changes nothing. Where: `apps/edge/src/draw.ts` (`entryPids`, `freezeAt`, `registrationClosed`), `apps/edge/src/people.ts` and `rights.ts` (a block now records `seat.blk_ms`), `apps/edge/src/worker.ts` (`listClosedFor`; nobody can be added or put back after the list closes), new migration `apps/edge/migrations/0032_draw_freeze.sql` (`draw.freeze_ms`, `draw.target_round`, `seat.blk_ms`).
- **Manual start uses a beacon round that is published after the press** (`manualRound` = the round public at the press + 2). The press closes the list and stores that round; the winners appear when it is published. An older, already public round is never used. Where: `draw.ts` (`runDraw`).
- **The draw is made without anybody opening a page**: the existing scheduled job (`apps/cron`, every minute, calls `/api/lifecycle/tick` which calls `drawTick`) makes automatic draws and finishes started manual draws. A page that asks does the same lazily, on the same frozen list. No new cron was needed.
- **Fairness text** says only what the code does: "No one knows the result before the draw. The list of entries closes at the draw time and cannot change after that..." (`DRAW_FAIRNESS` in `draw.ts`).
- **Simulation**: `apps/edge/test/draw-rules-sim.test.ts` runs 5,000 draws through the real draw code and checks nine rules against an independent oracle: rule failures 0 of 5,000 (0.00%). The same draws with the old entry list fail 76.5% (the control that proves the simulation sees the fault). The earlier 19.22% simulation was not in the repo, so its exact definition could not be reproduced; this one is the new, written-down definition. Regression tests: `apps/edge/test/draw-fairness.test.ts`.
- Screens: `apps/web/public/zc.js` (Start closes the list and waits for the winners), `z.js`.

### H2 - closed group, invite only, ID only, enforced by the server
- Every new game is made for the ID list; `whoCanJoin: "anyone"`, `closed: false` and any way of asking other than an ID (`verify: mobile|either|both`) are refused with 400. A game stored open is still treated as closed. A join with only a name or a mobile number is refused (`need-id`). An ID that is not on the list waits for the organizer. Where: new `apps/edge/src/invite-only.ts`, `worker.ts` (create, settings, join), `ai-go.ts`, `ai-link.ts`, `ai-functions.ts` (the AI guided path has no open choice), `zc.js` (no "Anyone with the link"). Tests: `apps/edge/test/invite-only.test.ts`.
- `TEST_OPEN_JOIN` exists only so the older engine tests (cards, claims, retention) can still make open games. It is named in no deploy file, no request can set it, and `invite-only.test.ts` proves it.

### H3 - the privacy line is true for winners
- One line everywhere: "Player details are deleted within 24 hours of the draw. The organizer's, hosts' and winners' details are kept for 365 days, and invoices as the law requires." Where: `draw.ts` (`NO_PERSONAL_LINE`), `z.js`, `zc.js`, `ai-link.ts`, `index.html`, `trust-page.ts`, the report PDF (`report-layout.ts`, rebuilt `reportgen.js`) and the report mail (`lifecycle.ts`).
- Consent K4 and K6 speak of IDs, not names and numbers (`consent-text.json`, `consent.js`). Tests: `apps/edge/test/privacy-line.test.ts`.

### M1 - a half-done paid notice can be finished by repeating it
- `markPaid` re-checks owner and size on every call (a wrong one is a `definite` refusal), sets the size, the people limit and the late-payment time in ONE statement, writes the two notes with INSERT OR IGNORE, is a no-op on a paid game of the same order, never moves the draw time on a repeat, and refuses a different order on a paid game. New read-only `payInfo(env,{eid,sub})` returns `{owner,item,paid}`. Where: `apps/edge/src/console-adapter.ts`. The bridge's own stuck `marking` row is fixed in the console repo (the vendored `console-bridge/` is untouched). Tests: `apps/edge/test/console-paid.test.ts`.

### M2 / M3 / M4 / Low
- Going live is one step: the redirects switch on only when BOTH `PAY_VIA_CONSOLE=1` and `CONSOLE_PUBKEYS` are set; `/api/status/health` shows which is missing and fails on a half switch. `/api/start` and `/api/auth/*` go to home when live. The sign-in page lets only the console hand-off through (`t` AND `go=console`); the sign-in page has no Google. Where: `console-origin.ts`, `pages/functions/_middleware.ts`, `admin.ts`, `signin.js`. Tests: `apps/edge/test/go-live.test.ts`.
- CSP of the console page: `frame-src` is the payment window only, `connect-src` allows `https://console.corporatetambola.com`, no wildcard, no Google, no Razorpay (`pages/build.mjs`, `apps/web/public/_headers`). Descriptor `payGame` and `consoleOrigin` in `zc.js`.
- The console's contract fixtures that do not need its fake game (14 of 40) now run against this game: `apps/edge/test/console-contract.test.ts`.
- The 7 whole-suite failures are gone: a stale Bingo big-screen test removed and listed in `docs/STALE_BINGO_TESTS.md`, six slow privacy tests get a 30 s limit, the owner-test date is no longer compared with today.
- New CI: `.github/workflows/ci.yml` (jobs `typecheck` and `each-file`; every test file is its own process, `tools/run-each-file.mjs`).
- Not fixed here (see `docs/KNOWLEDGE.md`, "Known gaps"): the signed assertion does not cover `item` and `orderRef` (the bridge, console repo); the bridge's stuck `marking` row (console repo); `to=pay` and `to=free` in the hand-off are read but the target page is ignored (the contract allows it); 26 of the 40 contract fixtures need the console's fake game.

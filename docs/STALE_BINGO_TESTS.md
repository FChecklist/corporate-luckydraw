# Stale Bingo tests removed from the Lucky Draw site

The site started as a copy of the Bingo site, with its tests. These cases check Bingo screens, Bingo wording (the `[Bingo]` mail tag, `closed-group bingo software`), pages that no longer exist (big screen, demo, preview) or phone-number joins. They were **removed, not rewritten**: independent authors write the Lucky Draw tests.

Whole file deleted: `apps/web/test/pages.test.ts` (Bingo's console, phone page, big screen, demo, brand moments, invitations: all Bingo-only screens; the Lucky Draw console and participant page were rewritten).

## Cases removed (file: case)

- `apps/edge/test/no-participant-payment.test.ts`: LR-1: no code path takes money from a participant > only the payment pages are allowed to load the payment provider (the page headers the build writes)
- `apps/edge/test/no-participant-payment.test.ts`: LR-1: no code path takes money from a participant > the pages a participant sees contain no payment call, no payment provider and no price
- `apps/edge/test/ai-mail.test.ts`: Replace my AI link > the signed-in organizer replaces it: the old link answers 404 at once, the new one works, the new link is e-mailed, and the call is audited
- `apps/edge/test/ai-mail.test.ts`: sending > the service gets both an HTML and a plain-text part; a mail that could not be sent keeps no body (nothing with a key is retried later)
- `apps/edge/test/ai-mail.test.ts`: the AI link is in the dedicated mails and nowhere else > publish, reminder, could-not-begin and every other mail of a full unpaid lifecycle carry no AI link; only the dedicated mails do
- `apps/edge/test/ai-mail.test.ts`: the AI link is in the dedicated mails and nowhere else > sign-up sends exactly one mail, the dedicated one; the console shows the same paste
- `apps/edge/test/param-life.test.ts`: TEST mode drops mail to strangers, LIVE sends it > every mail carries the brand footer with the support address and the legal link
- `apps/edge/test/param-life.test.ts`: rate limits and the daily spend limit > a limit set in the environment is the BASE: it is exact for an unpaid game, and a paid game still gets at least its pack (the deployed site sets 600 a minute; 700 people behind one address all get into a paid 1000)
- `apps/edge/test/param-life.test.ts`: rate limits and the daily spend limit > an office behind ONE address can seat a whole PAID game: the default per-address allowance grows with the pack (300 people, one address, one minute: all in)
- `apps/edge/test/cancel.test.ts`: cancel e-mails > the Organizer and each Host are told, with the credit amount and date, never a refund; the payer and the Co-host (no e-mail) are not; a Host's cancel says so
- `apps/edge/test/cancel.test.ts`: cancel e-mails > when the Organizer cancels, the Organizer (not only a Host) is mailed; addresses are not repeated
- `apps/edge/test/credit.test.ts`: cancel: a paid game becomes credit, never a refund > cancelling twice (or by a Host and the Organizer together) makes ONE credit and sends ONE mail per person
- `apps/edge/test/credit.test.ts`: cancel: a paid game becomes credit, never a refund > the credit mail goes to the Organizer and the Host only and says the exact words of the rule
- `apps/edge/test/credit.test.ts`: lapse, expiry and the e-mails > the five mails go to the Organizer and the Host only, once each: cancel, 30 days before, 3 days before, on use, on lapse
- `apps/edge/test/branding.test.ts`: claims register: customer-facing text never says what the build does not do > every mention of 365 days sits next to winners, prize, organizer, retention or AI-log wording
- `apps/edge/test/branding.test.ts`: mail that is not built by mails.ts gets the same brand when it is sent > every mail a whole unpaid lifecycle sends (sign-up, publish, co-host, reminder, could-not-begin, sign-in, replace, alert) carries the footer, and the name is spelled right
- `apps/edge/test/branding.test.ts`: the legal page carries the owner's final text, and each line matches what the code does > the eighteen privacy lines, word for word, with typographic apostrophes
- `apps/edge/test/mode.test.ts`: e-mail in TEST mode goes only to the owner's allow-list > the report mail follows the same rule (handled, not sent) and so does the daily retry of old mail
- `apps/edge/test/ai-enablement.test.ts`: every function in the list does what the list says > each function has a check here, and each check proves the classification: AI does it, organizer taps once, or only the organizer
- `apps/edge/test/ai-enablement.test.ts`: the front door > a chatbot that reads only the first screen still gets the rules, the starting links and all 10 facts, in the owner's words
- `apps/edge/test/ai-mail-expiry.test.ts`: the e-mailed link lasts 24 hours > Get a fresh AI link: a new 24-hour key by mail; the lasting key and earlier links are untouched; AI, co-host, platform and anonymous callers are refused
- `apps/edge/test/ai-signin.test.ts`: the sign-in e-mail > subject, heading, intro, exactly two options (code, button), the footer, an HTML and a plain-text part; no AI key or paste text anywhere

Not all removals of the first pass are in the list above (the `pay.test.ts`, `worker.test.ts`, `ai-signin.test.ts` ones); see `git show` for the commit.

## Real Lucky Draw defects found by the copied tests and fixed in the product

- Console had no **Close my account** control and no **New report link** button: added to `zc.js`.
- The prize-details form's mobile field was not `type="tel"`, so it did not match the data map: fixed in `z.js`.
- The AI function list still pointed to a deleted `/demo.html` page: the entry was removed from `ai-functions.ts`.

## Left for the independent authors
- A per-address join allowance check for a whole office behind one address (the copied test joined by phone number, which Lucky Draw does not use).
- Mail subject tag and Razorpay description wording tests for Lucky Draw.
- `apps/edge/test/branding.test.ts`: `big.html` removed from the list of pages checked (the page no longer exists).
- `apps/web/test/brand-site.test.ts`: "the header carries the one logo ... CORPORATE small above Bingo" (names Bingo; the header now says Lucky Draw). The logo pin in the "fonts and the logo are identical" case now uses the brand kit's own checksum for `logos/draw.svg` (702b8286...), and `favicon.svg` is the kit's draw logo (a sweep had edited the Bingo logo: real defect, fixed).
- `apps/web/test/seo.test.ts`: the og:image domain in the indexable-page test is now the Lucky Draw domain (same strength); `/big.html` dropped from the robots list (page removed). All 19 "each indexable page" checks now pass.
- `apps/web/test/gamesbar.test.ts`: "the bar sits right after the skip link ... marks Bingo as the current game" (names Bingo). The bar files are now the canonical v4 copy from `corporate-games-bar`; the two pinned checksums in `brand-site.test.ts` are the v4 ones. Big/preview/demo pages dropped from its not-a-public-page list (gone).
- Storage notice (real fix): `storage-registry.json` and the Privacy page (`legal.html`) now list exactly what the Lucky Draw scripts keep (`cb-last-eid`, `ld-pid-*`, `cbz:device`, ...); Bingo-only keys (card marks, sound, brand cache, console progress, console-screen choice) and their sentences removed.
- Internal notes (real fix): Bingo's unused `pack/zc-flow.*` (contained TODO notes) deleted.
- PWA (real fix): the participant page keeps `cb-last-eid` so an installed app reopens the last draw.
- `apps/web/test/pwa.test.ts`: `big.html` dropped from the pages that must link the manifest (page gone).
- `apps/web/test/join-retry.test.ts`: whole file deleted (Bingo phone page with `zgame.js` and number joins). The behaviour is real, so `z.js` now asks a lost join call once more by itself.
- `apps/web/test/guide.test.ts`: "the game page tells the truth about why a game could not be opened" removed (reads `zgame.js`). Real fix: the Lucky Draw server messages (winners, prizes, draw mode, paused / not due, beacon, closed) now have guide entries in `guide.js`.
- `apps/web/test/visits-dom.test.ts`: the `/big.html` case removed; `big.html` dropped from the list of pages that must not load the visits script.
- Real fixes for blackbox / guide wiring / help desk: `z.js` hands its stage to the flight recorder (`window.ctzView(v)`), `zc.js` exposes `window.ctzFocus`, and an AI key's Publish says the organizer must publish (`pr && pr.needsOrganizer`).
- `visits-dom.test.ts`: `/big.html` removed from the pages-it-must-stay-out-of list; `zgame.js` and `big.js` dropped from the script list (files gone).
- Removed because they load Bingo's `zgame.js` / `audio.js` / `big.js` / `preview.js` and Bingo screens (the files and screens are gone). The behaviours are kept in the Lucky Draw product and need new Lucky Draw tests by the independent authors:
  - `houses-pages.test.ts` (whole file, Bingo prize houses).
  - `testmode-banner.test.ts`: the two console banner cases (the console now shows the TEST notice from `zc.js`; the "only the console carries the wording" case passes).
  - `consent-pages.test.ts`: K1 publish boxes, K4 join page boxes, K5 Co-host acceptance (the Lucky Draw console and join page do carry the K1 / K4 boxes).
  - `rights-pages.test.ts`: the five player-rights cases (Delete me, Leave, What do you hold about me, Name another person, both controls once a card exists; `rights.js` is still loaded by `z.html`).
  - `room-mode.test.ts` (web): the room choice (reads `big.js`). `wording-guard.test.ts`: B16 engagement wording and B04 tie rule (read `big.js`; the Bingo home page tie sentence), B03 console AI block (Bingo console function). `stop-control.test.ts`: O7 End control (Bingo console).
- Bingo-only cases removed (Bingo phone card page, brand strip on the card, personal links and waiting-room joins by phone number, guest invitations, card preview, quick setup and the ten-step console, big number board, pause limit for big games, B08/B15/B33 phone wording, B09/B10/B12/B26 console steps) from `phone-guest.test.ts`, `gameday-copy.test.ts` and `setup-choices.test.ts`. Lucky Draw has none of these screens. Still wanted as new Lucky Draw tests: a cancelled draw shows one calm screen; a removed person is told so; the Paused banner; the brand strip on the participant page.
- Real fix on the way: the console TEST MODE notice was ported from Bingo's `zc.js` (it was missing).
- `apps/edge/test/param-life.test.ts`: "an UNPAID game keeps the base figures (200 new seats a minute)" joins by phone number (Bingo); Lucky Draw joins by ID.

## Core 0.9.8 (shared legal text)
Privacy, Terms and Conditions, cookies and complaints are now the one common text from game-core (rendered at pages build by `tools/shared-legal.ts`, markers in `privacy.html`, `terms.html`, `legal.html`; the game rules are `docs/LUCKYDRAW_RULES_BOOK.md`). Cases that asserted the site's own copy of that text were removed:
- `branding.test.ts`: "anchors, headings, counts", "six disclaimer lines", "rules say only what the software does" (they checked legal.html's own Bingo rules/privacy list). The lifecycle.ts timing checks were kept as their own test.
- `terms.test.ts`: terms.html needles for its own clauses (kept: title, seller, version), the "We do not hold, take or give any money" line, and "one set of retention facts" (checked terms.html/legal.html own wording).
- `data-map.test.ts`: legal.html dropped from the Asia-Pacific list (subprocessors.html still checked).
Owner to confirm: the own Terms clauses (indemnity, no-lottery, etc.) are no longer on terms.html; the common text is a draft for owner approval and GRIEVANCE_EMAIL is a placeholder.

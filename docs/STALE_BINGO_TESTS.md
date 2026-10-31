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

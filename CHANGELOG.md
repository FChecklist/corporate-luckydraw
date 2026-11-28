# Changelog: Corporate Lucky Draw

Newest first. Release entries below are taken from `apps/edge/src/releases.json` (the source of truth, served to the owner at `/api/owner/releases`); this file mirrors them. The number a running site reports is `version` in `/version.json`.

## Unreleased (28 Nov 2026, footer version)
Added
- What: every page with the legal footer now shows the release number, `v1.4.0`, as the first line of the footer.
- Why: the owner rule that every site and page shows its version, notes and release date, so a visitor or the owner can see which release is live.
- Where: `pages/version.mjs` (`stampFooter`), `pages/build.mjs`, `apps/web/test/version-stamp.test.ts`; also new `KNOWLEDGE.md` (how the game works).
- How / logic: at build time the same number written to `/version.json` (newest entry of `releases.json`) is inserted after `<div class="ck-legal">` in each built page. Source pages are not edited.
- Input: `releases.json`. Output: `<p class="ck-ver">v1.4.0</p>` in the built pages.
- Release date: TO BE FILLED when deployed. No game logic changed. Not deployed; the version number stays 1.4.0.

## Unreleased (27 Nov 2026, versioning order)
Added
- `/version.json` now also carries `version` (the newest release number in `releases.json`), next to `commit`, `dirty`, `builtAt`, `game`. Where: `pages/version.mjs`, `apps/web/test/version-stamp.test.ts`, `docs/DEPLOYS.md`.
- This CHANGELOG.md and `docs/REPO-KNOWLEDGE.md`.
No game, edge or page behaviour changes. No version bump: the current release stays 1.4.0. Not deployed.

## 1.4.0 - 2026-10-30 (commit this release)
The Corporate Games look: new website, one logo, six-item menu
- Every public page now looks and feels like the Corporate Tambola website: warm colours, the Corporate Lucky Draw badge with CORPORATE above the name, the same header, footer, buttons and fonts
- The header menu has six items: How it works, Free demo game, Guide, Brochure, Refer & earn, Log in
- New pages: How it works and Guide (the organizer guide); the Brochure is a web page with the one-page PDF to download
- One Corporate Games bar at the top of every public page; new app icons, share picture and e-mail header in the same brand
- The organizer console and the phone pages wear the same colours, fonts and header bar. Nothing in how the console works has changed
- Wording: close group everywhere, shorter plain sentences; the old organizer-guide address points to the Guide

## 1.3.2 - 2026-10-27 (commit bd66d3c)
A game waiting for payment never blocks a new game
- Only drafts that were never published count toward the limit of ten drafts; a game that is published but not yet paid for no longer stops an Organizer or Host from making a new game
- Making a copy of a game follows the same rule

## 1.3.1 - 2026-10-27 (commit 47115ce)
Bigger daily write guard
- The daily database-write guard is raised to 2,000,000 (a runaway guard only), because the account is on the paid Workers plan; a crowd joining together no longer meets a 'very busy' answer from the guard

## 1.3.0 - 2026-10-27 (commit 04515b0)
Same hardening as Corporate Tambola 1.3.3: joining, permissions, messages, simpler console
- Joining: an employee ID or mobile number is checked against the organizer's list, a stranger waits for the organizer's yes, one phone cannot play as another (device proof on every card action), the same person joining twice gets the same card
- A join that gets no answer (slow link, busy moment) is asked again by itself, safe because the same person always gets the same card
- Permissions: a Co-host who has not accepted the terms cannot pay, an delete is refused while the game is being played, a Host's narrow link cannot change controls
- Simpler console: the rarely used 'How many rounds' choice is hidden, never disabled; one game is one round
- A demo link (zc.html?pass=) is used once, also when the console opens straight into a game
- Players' data is deleted 20 hours after the end (the promise stays 24 hours) and a lazy tick runs the housekeeping when the scheduled job is late
- Every refusal now says what happened, where, and how to fix it (guide catalog)
- Big screen shows 'Connection lost' when the public clock does not answer for 15 seconds

## 1.2.0 - 2026-10-22 (commit 5a7b2b5)
One-door sign-in and e-mail-first console
- One sign-in door for Organizers and Hosts with a six-box code screen
- A confirmed Host's e-mail is answered 'exists' (a code is sent)
- Console keeps the state of each step

## 1.1.0 - 2026-10-14 (commit 8b23cfe)
Colourful cards, Help Desk, guided errors
- Colour and phone-fit work, installable app
- Help Desk helper flow
- Plain-words errors with a Take-me-there button

## 1.0.0 - 2026-10-12 (commit 741602b)
Corporate Lucky Draw goes live
- Lucky Draw on its own Cloudflare stack
- Cards for every guest, winners decided by the software from the public numbers
- Payment through the central payment service, report by e-mail

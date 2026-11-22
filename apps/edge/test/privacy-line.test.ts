// AUDIT H3 (owner rule): the privacy line must be TRUE for winners too. Player details are deleted within 24 hours of the draw; the organizer's, hosts' and winners' details are kept
// 365 days; invoices as the law requires. One wording, everywhere a person reads it: the screens, the mails, the report, the consent boxes (K4, K6: IDs, not names and numbers).
// FALSIFIED BY: putting the old sentence back in draw.ts, z.js or the report layout (each made a test below fail), and K6 back to "names and numbers".
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { NO_PERSONAL_LINE } from "../src/draw";
import { CONSENT_TEXT } from "../src/consent";

const read = (p: string) => readFileSync(new URL("../../../" + p, import.meta.url), "utf8");
const LINE = "Player details are deleted within 24 hours of the draw. The organizer's, hosts' and winners' details are kept for 365 days, and invoices as the law requires.";
const OLD = /All participant information is deleted|No personal details needed\. All/;

describe("one true privacy line", () => {
  test("the line in the game code is the owner's wording, and the draw page, the winner mail and the organizer mail all carry it", () => {
    expect(NO_PERSONAL_LINE).toBe(LINE);
    const draw = read("apps/edge/src/draw.ts");
    expect((draw.match(/\$\{NO_PERSONAL_LINE\}/g) ?? []).length).toBeGreaterThanOrEqual(2); // winner mail + organizer mail
    expect(draw).toMatch(/privacy: NO_PERSONAL_LINE/); // the draw page facts
  });
  test("the player page and the organizer console show the same line (with the apostrophes as typed)", () => {
    for (const f of ["apps/web/public/z.js", "apps/web/public/zc.js"]) expect([f, read(f).includes(`const PRIVACY = "${LINE}"`)]).toEqual([f, true]);
    expect(read("apps/edge/src/ai-link.ts")).toContain(LINE);
  });
  test("the old sentence 'All participant information is deleted' is nowhere in a page, script, mail or manual of this game", () => {
    for (const f of ["apps/edge/src/draw.ts", "apps/edge/src/ai-link.ts", "apps/edge/src/lifecycle.ts", "apps/edge/src/report-layout.ts", "apps/edge/src/trust-page.ts", "apps/web/public/z.js", "apps/web/public/zc.js", "apps/web/public/index.html", "apps/web/public/reportgen.js", "apps/web/public/consent.js"]) expect([f, OLD.test(read(f))]).toEqual([f, false]);
  });
  test("the report and the report mail say that deletion is for PLAYER details and that winner, organizer and host details stay 365 days", () => {
    const rep = read("apps/edge/src/report-layout.ts"), life = read("apps/edge/src/lifecycle.ts");
    expect(rep).not.toMatch(/All of it is deleted/);
    expect(rep).toMatch(/Player details \(every ID, seat, join record and invite record\) are permanently auto-deleted/);
    expect(rep).toMatch(/the winners record[^"]*and the name \(and mobile number, if given\) each winner confirmed/);
    expect(rep).toMatch(/Invoices are kept for as long as the law requires/);
    expect(life).toMatch(/within 24 hours of the draw\) every player's ID/);
    expect(life).toMatch(/For 365 days only this is kept: the organizer, host and co-host details/);
    expect(read("apps/web/public/reportgen.js")).toContain("Player details (every ID, seat, join record and invite record)"); // the built report script follows the source
  });
});

describe("the public Terms page (audit M-2 of 9024db89)", () => {
  // legal.html now forwards to the one Terms document (live, 1 Nov 2026); the deletion statement is checked there
  test("it says player details are deleted within 24 hours after the game, and the old 'All participant data is auto-deleted' claim is not there", () => {
    const html = read("apps/web/public/terms.html"), text = html.replace(/&rsquo;/g, "'").replace(/<[^>]+>/g, " ");
    expect(text).toContain("All information about participants is deleted within 24 hours after the game.");
    expect(text).toContain("365 days");
    expect(html).not.toMatch(/All participant data is auto-deleted/);
  });
});

describe("the consent boxes speak of IDs", () => {
  test("K4 names the ID, the 24 hours after the draw and the winner's 365 days; K6 names IDs, not names and numbers", () => {
    const k4 = CONSENT_TEXT.K4.A as string, k6 = CONSENT_TEXT.K6.A as string;
    expect(k4).toMatch(/my ID/); expect(k4).toMatch(/only if I choose to/); expect(k4).toMatch(/deleted within 24 hours of the draw/); expect(k4).toMatch(/kept for 365 days/); expect(k4).toMatch(/Billing records are kept as the law requires/);
    expect(k4).not.toMatch(/name \(and my mobile number, only if this game asks for it\)/);
    expect(k6).toMatch(/these IDs/); expect(k6).not.toMatch(/names|numbers/);
    expect(read("apps/web/public/consent.js")).toContain(JSON.stringify(k6)); // the page shows the very words the server records
    expect(read("apps/web/public/consent.js")).toContain(JSON.stringify(k4));
  });
  test("no text claims '100% secure' or the like (the claim would be untrue)", () => {
    for (const f of ["apps/edge/src/draw.ts", "apps/edge/src/consent-text.json", "apps/web/public/consent.js"]) expect([f, /100% ?secure|completely secure|unhackable|hack-?proof/i.test(read(f))]).toEqual([f, false]);
  });
});

// Owner copy rules (2026-11-20), pinned so they cannot come back. Everything a visitor or an organizer reads is scanned: every served page and script,
// the e-mail, report, trust and AI-facts sources, the price list and the invoice text.
//   1. no boasts about security or popularity ("100% secure", "most secure gateway", "played by major companies")
//   2. billing data retention has ONE sentence:  We keep billing data for audit and tax reasons.
//   3. privacy laws have ONE claim:  designed to follow US privacy laws, the EU GDPR and India's DPDP
//   4. prices use the rupee sign (U+20B9) in front of the figure, never Rs / INR / "rupees" in front of a number
//   5. nobody is promised that participant details or a report are e-mailed as a PDF (one e-mail has a link; the PDF is made on the organizer's own device)
//   6. organizer pages speak to "you": no I / my / me, no blunt "You must" or "Never ..." openings
import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "../../..");
const PUB = join(ROOT, "apps/web/public");
const EDGE = join(ROOT, "apps/edge/src");
const read = (p: string) => readFileSync(p, "utf8");
const rel = (p: string) => p.slice(ROOT.length + 1).replace(/\\/g, "/");

const walk = (dir: string, re: RegExp): string[] => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? (n === "fonts" || n === "node_modules" ? [] : walk(p, re)) : re.test(n) ? [p] : []; });
/** Every page, script and text file the site serves. */
const served = () => walk(PUB, /\.(html|js|txt)$/);
/** The sources of e-mail, report, trust, AI and price text, and the invoice text. */
const sources = () => [...walk(EDGE, /\.(ts|json)$/), ...walk(join(ROOT, "packages/shared/src"), /\.ts$/), ...walk(join(ROOT, "packages/billing/src"), /\.ts$/), ...walk(join(ROOT, "tools/legal"), /\.html$/)];
const everything = () => [...served(), ...sources()];

/** Comments are not text a person reads. */
function visible(file: string, raw: string): string {
  if (/\.(html|txt)$/.test(file)) return raw.replace(/<!--[\s\S]*?-->/g, " ");
  return raw.replace(/\/\*[\s\S]*?\*\//g, " ").split(/\r?\n/).map((l) => l.replace(/(^|[^:"'\\])\/\/.*$/, "$1")).join("\n");
}
/** Plain wording: tags and entities turned into text, curly apostrophes made straight, spaces squeezed. */
const plain = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/&rsquo;|&#x27;|&#39;|&apos;|[\u2019]/g, "'").replace(/&#8377;|&#x20b9;/gi, "\u20b9").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
function hits(files: string[], re: RegExp, skip: RegExp | null = null): string[] {
  const out: string[] = [];
  for (const f of files) {
    if (skip && skip.test(rel(f))) continue;
    const t = visible(f, read(f));
    for (const m of t.matchAll(new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g"))) out.push(rel(f) + ": ..." + t.slice(Math.max(0, m.index! - 30), m.index! + m[0].length + 30).replace(/\s+/g, " "));
  }
  return out;
}

// ---- 1 ----------------------------------------------------------------------------------------------------------------------------------
const BOASTS = /100\s*%\s*secure|hundred\s+percent\s+secure|(?:most|safest)\s+secure\s+(?:payment\s+)?(?:gateway|platform|software)|most\s+secure\s+payment|(?:played|used|loved|trusted|chosen|picked)\s+by\s+(?:the\s+)?(?:major|leading|big|top|biggest|largest|fortune[\s-]*\d*)\s+(?:\w+\s+){0,2}(?:compan|brand|business|enterprise|corporat)/i;

describe("1: no 'most secure' or 'played by major companies' boasts", () => {
  test("the pattern finds the phrases and their close variants (so an empty result means something)", () => {
    for (const bad of ["100% secure", "100 % secure", "100 %secure", "It is 100% Secure.", "the most secure gateway", "The Most Secure Payment Gateway", "most secure payment", "played by major companies", "Played By Major Companies", "used by major companies", "used by leading companies", "trusted by the biggest brands", "played by Fortune 500 companies"]) expect([bad, BOASTS.test(bad)]).toEqual([bad, true]);
    for (const ok of ["Secure payment by Razorpay", "Pay securely with Razorpay", "An RBI-regulated payment gateway.", "Names are encrypted", "This invitation has already been used by someone", "Played by your own employees", "100% of the price is shown"]) expect([ok, BOASTS.test(ok)]).toEqual([ok, false]);
  });
  test("no served page, script, e-mail, report, trust or AI text says any of them", () => { expect(hits(everything(), BOASTS)).toEqual([]); });
});

// ---- 2 ----------------------------------------------------------------------------------------------------------------------------------
const BILLING_LINE = "We keep billing data for audit and tax reasons.";
// The consent wording is approved word for word by the owner (consent-text.json, its copy in consent.js and the table on the Terms page): it keeps its own sentence.
// lifecycle.ts holds the report e-mail text and is edited by another engineer: its sentence is still the old one. Remove it from this list when that file is changed.
const BILLING_OLD_ALLOWED = /^(apps\/edge\/src\/consent-text\.json|apps\/web\/public\/consent\.js|apps\/web\/public\/terms\.html|apps\/edge\/src\/lifecycle\.ts)$/;

describe("2: billing data has one sentence", () => {
  test("the old 'is kept' form is gone everywhere except the owner-approved consent wording", () => {
    expect(hits(everything(), /billing data (?:is|are) kept/i, BILLING_OLD_ALLOWED)).toEqual([]);
  });
  test("every place that says how long billing data is kept uses exactly the one sentence", () => {
    const bad: string[] = [];
    for (const f of everything()) {
      if (BILLING_OLD_ALLOWED.test(rel(f))) continue;
      const t = plain(visible(f, read(f)));
      for (const m of t.matchAll(/[^.]{0,40}\bbilling data\b[^.]{0,60}\.?/gi)) if (/\b(keep|kept|retain|store|hold)/i.test(m[0]) && !t.includes(BILLING_LINE)) bad.push(rel(f) + ": " + m[0].trim());
    }
    expect(bad).toEqual([]);
  });
  test("the pages, the trust facts, the report and the invoice carry the sentence", () => {
    for (const f of ["privacy.html", "dpa.html", "trust.html", "paytest.js"]) expect([f, plain(read(join(PUB, f))).includes(BILLING_LINE)]).toEqual([f, true]);
    expect(plain(read(join(PUB, "terms.html")))).toContain("(a) " + BILLING_LINE);
    expect(read(join(EDGE, "ai-facts.ts"))).toContain(BILLING_LINE);
    expect(read(join(EDGE, "report-layout.ts"))).toContain(BILLING_LINE);
    expect(read(join(ROOT, "packages/billing/src/index.ts"))).toContain(BILLING_LINE);
  });
});

// ---- 3 ----------------------------------------------------------------------------------------------------------------------------------
const PRIVACY_LINE = "designed to follow US privacy laws, the EU GDPR and India's DPDP";
const STRONG = /\b(?:fully|completely|100\s*%)\s+compliant|(?:GDPR|DPDP|CCPA)[- ]compliant|compliant with (?:the )?(?:EU |US |India's )?(?:GDPR|DPDP|CCPA|privacy)|designed to comply|(?:handled|processed|complies) (?:as required|in line|in accordance) (?:by|with) (?:India's |the )?(?:DPDP|GDPR)|as required by India's DPDP/i;

describe("3: one privacy-law line", () => {
  test("the pattern finds the stronger claims", () => {
    for (const bad of ["fully compliant", "GDPR compliant", "GDPR-compliant", "compliant with the GDPR", "The Software is designed to comply with the DPDP Act", "All data handled as required by India's DPDP Act"]) expect([bad, STRONG.test(bad)]).toEqual([bad, true]);
    expect(STRONG.test("Games are designed to follow US privacy laws, the EU GDPR and India's DPDP.")).toBe(false);
  });
  test("no page, script or text source claims compliance", () => { expect(hits(everything(), STRONG, /(^|\/)(consent-text\.json|ai-facts\.ts)$/)).toEqual([]); });
  test("the home page, brochure, rules page, trust page, llms.txt, the payment-page note, the report and the facts use the one line", () => {
    for (const f of ["index.html", "brochure.html", "legal.html", "trust.html", "llms.txt", "common.js", "site.js", "terms.html"]) expect([f, plain(read(join(PUB, f))).replace(/"/g, "").includes(PRIVACY_LINE)]).toEqual([f, true]);
    for (const f of ["ai-facts.ts", "trust-page.ts", "report-layout.ts"]) expect([f, plain(read(join(EDGE, f))).replace(/"/g, "").includes(PRIVACY_LINE)]).toEqual([f, true]);
  });
  test("the older, longer wording is gone", () => {
    // lifecycle.ts holds the report e-mail text and is edited by another engineer: its privacy sentence is still the old one. Remove it from this list when that file is changed.
    expect(hits(everything(), /designed to follow (?:India's|DPDP|the EU GDPR, US)|built to follow|state privacy laws such as|India(?:'|&rsquo;|\u2019)s DPDP Act 2023, the EU GDPR/i, /^apps\/edge\/src\/lifecycle\.ts$/)).toEqual([]);
  });
});

// ---- 4 ----------------------------------------------------------------------------------------------------------------------------------
// A price is written with the rupee sign in front of the figure. Code that passes the currency to a payment keeps "INR"; the PDF writer cannot print the sign, so pdf.ts turns it into "Rs " there;
// ledger.ts writes a note into the owner's product catalogue (machine data).
const RUPEE_WORDS = /\bRs\.?\s?\d|\bRs\.?\s?\$\{|\bINR\s?\d|\bINR\s?\$\{|\b(?:rupees?|rupee)\s+\d|\d\s*rupees\b/;
describe("4: prices use the rupee sign", () => {
  test("the pattern finds the old forms", () => {
    for (const bad of ["Rs 2,399", "Rs. 2399", "Rs2,399", "INR 10,000", "rupees 100", "100 rupees", "`Rs ${n}`"]) expect([bad, RUPEE_WORDS.test(bad)]).toEqual([bad, true]);
    for (const ok of ["₹2,399", "Prices in Indian rupees.", "currency: \"INR\"", "pay in rupees or write to the seller", "Price in Indian rupees"]) expect([ok, RUPEE_WORDS.test(ok)]).toEqual([ok, false]);
  });
  test("no page, script, e-mail, report, trust, AI or invoice text writes Rs, INR or 'rupees' in front of a number", () => {
    expect(hits(everything(), RUPEE_WORDS, /^apps\/edge\/src\/(ledger|pdf)\.ts$/)).toEqual([]);
  });
  test("the price list shows the rupee sign for every pack, and the sign is in its page description too", () => {
    const raw = read(join(PUB, "pricing.html")), p = plain(raw);
    expect(p).toContain("(₹2,399)"); expect(p).toContain("₹29,499");
    for (const d of raw.match(/<meta[^>]+description[^>]+>/g) ?? []) expect(d).not.toMatch(/\bRs\b/);
  });
});

// ---- 5 ----------------------------------------------------------------------------------------------------------------------------------
// After the game the organizer gets ONE e-mail with a link. The PDF is made on their own device when they open it. Nothing is attached and no details are e-mailed as a PDF.
const PDF_BY_MAIL = /(?:e-?mail(?:ed|s)?|sent|send|attach(?:ed)?)\s+(?:you\s+|to\s+you\s+)?(?:the\s+|a\s+|your\s+|one\s+)?(?:report|participant details|participants' details|details|names)[^.<>]{0,30}\bPDF|(?:report|details)[^.<>]{0,30}(?:e-?mail(?:ed)?|sent)\s+(?:to you\s+)?as (?:a |an )?(?:PDF|attachment)|\bPDF\b[^.<>]{0,30}\b(?:is |are )?attached\b|\battached\b[^.<>]{0,30}\bPDF|\bPDF\b[^.<>]{0,30}\be-?mailed to you\b|(?:report|details)[^.<>]{0,20}\bby e-?mail\b/i;
describe("5: the report is a link in one e-mail, never a PDF in the mail", () => {
  test("the pattern finds the false promises", () => {
    for (const bad of ["The report is e-mailed as a PDF", "We send you the report as a PDF", "The PDF is attached", "your details e-mailed to you as PDF", "You get a report by e-mail."]) expect([bad, PDF_BY_MAIL.test(bad)]).toEqual([bad, true]);
    for (const ok of ["You get an e-mail with a link to your report.", "the PDF is made on your own device", "Download the brochure (PDF)", "The invoice PDF can be downloaded", "Upload a PDF or a CSV to add them in one go."]) expect([ok, PDF_BY_MAIL.test(ok)]).toEqual([ok, false]);
  });
  test("no page, script or text source makes the promise", () => {
    // lifecycle.ts holds the report mail itself: it says the link is all that is sent, and its header comment is a comment (stripped).
    expect(hits(everything(), PDF_BY_MAIL, /^apps\/edge\/src\/(lifecycle|worker)\.ts$/)).toEqual([]);
  });
  test("the report PDF says the link was e-mailed, not the PDF, and the home page and the processing terms say 'a link to your report'", () => {
    const lay = read(join(EDGE, "report-layout.ts"));
    expect(lay).not.toMatch(/come in the following e-mails/); expect(lay).toContain("come in the following PDFs"); expect(lay).toContain("The link to this report was e-mailed to");
    expect(plain(read(join(PUB, "index.html")))).toContain("You get an e-mail with a link to your report.");
    expect(plain(read(join(PUB, "dpa.html")))).toContain("e-mail you a link to your report");
  });
  test("the trust facts and the AI function list say how the report really arrives", () => {
    expect(read(join(EDGE, "ai-facts.ts"))).toContain("the organizer is e-mailed one link to it, and the PDF is made on the organizer's own device");
    expect(read(join(EDGE, "ai-functions.ts"))).toContain("one e-mail with a link to it goes to the organizer");
  });
});

// ---- 6 ----------------------------------------------------------------------------------------------------------------------------------
/** The words a person reads in a script: quoted strings of two or more words, with ${...} and tags taken out. */
function scriptText(raw: string): string[] {
  const t = visible("x.js", raw), out: string[] = [];
  for (const m of t.matchAll(/(["'`])((?:\\.|(?!\1)[^\\])*)\1/g)) {
    const s = m[2]!.replace(/\$\{[^}]*\}/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (/[A-Za-z]+ [A-Za-z]+/.test(s) && !/^[a-z-]+(:|;)/.test(s) && !/[{};=]/.test(s)) out.push(s);
  }
  return out;
}
const FIRST_PERSON = /\b(?:my|me|mine|myself)\b|\bI\b|\bI['\u2019](?:m|ll|ve|d)\b/i;
const ORGANIZER_PAGES = ["organizer-guide.html", "guide.html", "how-it-works.html", "helpdesk.html", "helpdesk-accept.html", "helpdesk-approve.html", "ai-link.html"];
const ORGANIZER_SCRIPTS = ["ai-link.js", "helpdesk.js", "helpdesk-accept.js", "helpdesk-approve.js"];
const BLUNT = /(?:^|>|\.\s)\s*(?:You must|You have to|Never |Do not |Don't )/;

describe("6: organizer pages speak to 'you', politely", () => {
  test("no I, my or me on an organizer page", () => {
    const bad: string[] = [];
    for (const f of ORGANIZER_PAGES) { const t = plain(visible(f, read(join(PUB, f)).replace(/<(script|style|svg)[\s\S]*?<\/\1>/g, " "))); for (const m of t.matchAll(new RegExp(FIRST_PERSON.source, "gi"))) bad.push(f + ": " + t.slice(Math.max(0, m.index! - 30), m.index! + 30)); }
    expect(bad).toEqual([]);
  });
  test("no I, my or me in the words of the AI-link and Help Desk scripts", () => {
    const bad: string[] = [];
    for (const f of ORGANIZER_SCRIPTS) for (const s of scriptText(read(join(PUB, f)))) if (FIRST_PERSON.test(s)) bad.push(f + ": " + s.slice(0, 80));
    expect(bad).toEqual([]);
  });
  test("the e-mail buttons and warnings to the organizer say 'your' and 'Please do not forward'", () => {
    const m = read(join(EDGE, "mails.ts"));
    expect(m).not.toMatch(/label: "[^"]*\b(?:my|me)\b/i); expect(m).not.toMatch(/OPEN MY /); expect(m).not.toMatch(/Replace my AI link/); expect(m).not.toMatch(/>Open my /);
    expect(m).not.toMatch(/DO NOT FORWARD/); expect(m).toContain("Please do not forward");
    expect(read(join(PUB, "ai-link.js"))).not.toMatch(/DO NOT FORWARD/);
  });
  test("no blunt opening ('You must', 'Never ...', 'Do not ...') in the organizer guide or the Help Desk page", () => {
    for (const f of ["guide.html", "helpdesk.html", "how-it-works.html"]) expect([f, BLUNT.test(plain(read(join(PUB, f)).replace(/<li>/g, ". ")))]).toEqual([f, false]);
    expect(read(join(PUB, "guide.html"))).not.toMatch(/You must check/);
  });
  test("the organizer guide and its sources still agree on the report link hours (so the polite rewrite did not drop the fact)", () => {
    expect(plain(read(join(PUB, "guide.html")))).toMatch(/Your report link works for \d+ hours/);
    expect(existsSync(join(PUB, "organizer-guide.html"))).toBe(true);
  });
});

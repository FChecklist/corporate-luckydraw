// OWNER RULE v1.1 (20 Nov 2026): everything an organizer or a Host reads speaks to "you". ZERO first person (I, my, me, we, our, us).
// This test reads the organizer console, the organizer guide, the AI-link page, the organizer's consent boxes (K1, K2, K3, K5, K6) and the texts the server sends to organizers and Hosts, and fails on any first-person word.
// NOT covered, on purpose: the PLAYER screens and the player's own consent boxes (K4: "I am happy for my ID to be used..."), the partner terms (K7), the contact form (K9), the AI helper's own replies (apps/edge/src/ai-go.ts: the AI speaks as itself),
// and the text an organizer pastes INTO their own AI (apps/edge/src/mails.ts `aiPaste`: it is the organizer speaking).
// FALSIFIED BY (planted, saw this fail, restored): "Close my account" in zc.js; "I am allowed to use these IDs" in consent-text.json K6; "Sign me in" in mails.ts; a new "my" in a pay.ts error.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import TEXT from "../src/consent-text.json";

const read = (p: string) => readFileSync(new URL("../../../" + p, import.meta.url), "utf8");
const FIRST_PERSON = /(?<![A-Za-z0-9_.$#\/-])(I|I'm|I've|I'll|I'd|my|My|mine|Mine|myself|me|Me|we|We|we're|We're|we've|we'll|our|Our|ours|us|Us)(?![A-Za-z0-9_$-])/g;
const noComments = (js: string) => js.replace(/\/\*[\s\S]*?\*\//g, " ").split("\n").filter((l) => !/^\s*\/\//.test(l)).map((l) => l.replace(/(^|\s)\/\/\s.*$/, "")).join("\n");
const visibleHtml = (h: string) => h.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ");
const hits = (t: string) => [...t.matchAll(FIRST_PERSON)].map((m) => m[0] + " … " + t.slice(Math.max(0, m.index! - 30), m.index! + 40).replace(/\s+/g, " "));

describe("organizer and Host screens speak to you (zero first person)", () => {
  test("the organizer console, the AI-link page and the organizer guide", () => {
    for (const f of ["zc.js", "ai-link.js"]) expect([f, hits(noComments(read("apps/web/public/" + f)))]).toEqual([f, []]);
    for (const f of ["zc.html", "ai-link.html", "organizer-guide.html"]) expect([f, hits(visibleHtml(read("apps/web/public/" + f)))]).toEqual([f, []]);
  });
  test("the organizer's and the Host's consent boxes (K1, K2, K3, K5, K6), in the server text, the page script and the Terms table", () => {
    for (const k of ["K1", "K2", "K3", "K5", "K6"] as const) for (const [box, t] of Object.entries((TEXT as any)[k] as Record<string, string>)) expect([k, box, hits(t)]).toEqual([k, box, []]);
    const js = read("apps/web/public/consent.js"), terms = visibleHtml(read("apps/web/public/terms.html"));
    for (const k of ["K1", "K2", "K3", "K5", "K6"] as const) for (const t of Object.values((TEXT as any)[k] as Record<string, string>)) { expect([k, js.includes(t)]).toEqual([k, true]); expect([k, terms.includes(t.replace(/&/g, "&amp;"))]).toEqual([k, true]); }
  });
  test("what the server tells organizers and Hosts: the mails, the sign-in button, the pay, people, cancel and credit messages", () => {
    for (const f of ["mails.ts", "pay.ts", "people.ts", "cancel.ts", "credit.ts", "hostsetup.ts", "lifecycle.ts"]) {
      const src = noComments(read("apps/edge/src/" + f));
      // only text inside quotes, and only for sentences (a quoted string with a space); a Player-facing line is not in these files' organizer strings except the ones listed as allowed
      const strings = [...src.matchAll(/"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)].map((m) => m[1] ?? m[2] ?? "").filter((s) => /[A-Za-z]{2,} [A-Za-z]{2,} [A-Za-z]{2,}/.test(s) && !/[(){};=]/.test(s.replace(/\$\{[^}]*\}/g, "X"))); // sentences only: three words and no code characters
      const bad = strings.flatMap((s) => hits(s.replace(/\$\{[^}]*\}/g, "X"))).filter((h) => !ALLOWED.some((a) => h.includes(a)));
      expect([f, bad]).toEqual([f, []]);
    }
  });
});
/** Words that only look first person: a typed instruction to the player (K4 is the player's own box, quoted in the privacy text), a sentence quoted from a player, or a column name. Kept short and explicit. */
const ALLOWED: string[] = ["I am the owner,", "I am their Host,"]; // mails.ts aiPaste: the text the organizer or Host pastes into their own AI

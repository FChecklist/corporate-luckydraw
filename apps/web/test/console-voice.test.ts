// OWNER RULE 20 Nov 2026 (CONSOLE voice): the organizer console speaks TO the organizer and Host as "you": polite, simple English, never "I", "my", "me" or "myself" and never blunt or threatening.
// Player screens (z.js) speak to the players. Consent tick-boxes (consent-text.json, consent.js) are the person's own sentence ("I agree") and are the owner's approved legal text: not part of this rule.
// See docs/CONSOLE_VOICE.md. FALSIFIED BY: the planted breaks listed in docs/STATE.md.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const pub = (f: string) => readFileSync(join(import.meta.dir, "../public", f), "utf8").replace(/\r\n/g, "\n");
/** The text of every "double-quoted" and `template` string in a file (comment-only lines are skipped). */
function strings(src: string): { line: number; text: string }[] {
  const out: { line: number; text: string }[] = [];
  src.split("\n").forEach((ln, i) => {
    const t = ln.trim(); if (t.startsWith("//") || t.startsWith("/*") || t.startsWith("*")) return;
    const code = ln.replace(/\s\/\/ .*$/, "");
    for (const m of code.matchAll(/"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)) out.push({ line: i + 1, text: m[1] ?? m[2] ?? "" });
  });
  return out;
}
export const FIRST = /(^|[\s>(“"'])(I|I'm|I'll|I've|I'd|my|My|me|Me|myself|mine)($|[\s.,?!:;)<"'”’])/;
const html = (s: string) => s.replace(/<[^>]*>/g, " ").replace(/\$\{[^}]*\}/g, " ");
const hits = (f: string) => strings(pub(f)).filter((s) => !/^[a-z_.\-/#:[\]=\s]*$/.test(s.text) && FIRST.test(html(s.text)));
const BLUNT = /\b(you must|you have to|you will be (blocked|banned|charged|fined)|we will (block|ban|report)|or else|do not even)\b/i;

describe("console voice: you, never I", () => {
  test("zc.js (the organizer console): no I, my, me or myself in any organizer-facing text", () => {
    expect(hits("zc.js").map((h) => `zc.js:${h.line} ${h.text.slice(0, 80)}`)).toEqual([]);
  });
  test("zc.js is polite: no blunt or threatening sentence", () => {
    const bad = strings(pub("zc.js")).filter((s) => BLUNT.test(html(s.text)));
    expect(bad.map((b) => `zc.js:${b.line} ${b.text.slice(0, 80)}`)).toEqual([]);
  });
  test("the approved start wording and the owner's invite text are in the console, word for word", () => {
    const s = pub("zc.js");
    for (const t of ["The game starts by itself", "The game begins at the time you set. You do nothing.", "You start the game", "The game waits for you. Press Start when you are ready.",
      "Invite people with just an ID", "No names or personal details are needed.",
      "Just upload or paste the IDs of the people you want to invite: employee ID, associate ID, vendor ID or customer ID, whichever you use.",
      "Your invitee opens the game link and enters their ID. If it is on your list, they join and play. If it is not, you get a request to approve or decline.",
      "The list and all IDs are deleted within 24 hours after the game ends."]) expect([t, s.includes(t)]).toEqual([t, true]);
  });
  test("the console never asks which numbers to call (this game has no number-calling question)", () => {
    expect(pub("zc.js")).not.toMatch(/Numbers come by themselves|You call the numbers|A new random number/);
  });
  test("the voice test itself can fail: a string with ' I ' or 'my ' is caught", () => {
    expect(FIRST.test("Pick from my contacts")).toBe(true); expect(FIRST.test("What if I choose Host?")).toBe(true); expect(FIRST.test("You choose each prize")).toBe(false); expect(FIRST.test("Invite people with just an ID")).toBe(false);
    expect(BLUNT.test("You must pay now")).toBe(true); expect(BLUNT.test("Please pay in your console")).toBe(false);
  });
});

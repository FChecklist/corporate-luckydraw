// Written from the product rule (owner, 1 Nov 2026): a customer never reads another game's rules on the Lucky Draw site, and an AI assistant never learns them.
// Reads what would be served (the public pages and the scripts a customer's browser runs) and the text the AI manuals and the trust page are made from.
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
const PUB = join(import.meta.dir, "../public");
const SRC = join(import.meta.dir, "../../edge/src");
const SKIP = /^(gamesbar|reportgen|reactions|funnel|control|brandkit)\.js$|^sw\.js$/; // the shared games bar names the other games on purpose
const files = readdirSync(PUB).filter((f) => /\.(html|js)$/.test(f) && !SKIP.test(f));
const BINGO_ONLY: [string, RegExp][] = [
  ["75 numbers", /\b75 numbers\b|\ball 75\b|\b75 balls\b/i], ["tickets of 15", /tickets? of 15|15 numbers on (a|each|every) ticket/i],
  ["B I N G O columns", /columns B I N G O|B-I-N-G-O card/i], ["FREE centre square", /FREE (centre|center) square/i],
  ["daub", /\bdaub/i], ["Full House / Four Corners / Blackout", /\bFull House\b|\bFour Corners\b|\bBlackout\b/i],
  ["claim a win", /\b(claim|claims) (a|your|the) (line|win|prize)\b|\bcall(ed)? (each|every) number\b/i],
];
const text = (f: string): string => readFileSync(join(PUB, f), "utf8").replace(/<script[^>]*\bsrc=[^>]*><\/script>/g, "");

// The text an AI assistant reads (manuals, functions, facts) and the trust page source: comment lines are skipped, so only strings count.
const MANUALS = ["ai-link.ts", "ai-go.ts", "ai-functions.ts", "ai-facts.ts", "trust-page.ts"];
const AI_BINGO: [string, RegExp][] = [
  ["prize houses", /\bFour Corners\b|\bFull House\b|\bBlackout\b|\bprize houses?\b/i],
  ["cards and tickets", /\b(a|the|your|each|every|unique|their) (bingo )?(card|cards|ticket|tickets)\b|\bcard numbers?\b/i],
  ["called numbers", /\b75 numbers\b|\bnumbers (are|is) called\b|\bcall speed\b|\bbig screen\b|\bdaub/i],
  ["overclaiming fairness", /very hard, not impossible|tamper-proof/i],
];
const noComments = (s: string): string => s.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");

describe("no phrase that belongs only to another game is served on the Lucky Draw site", () => {
  test("the checkers catch each phrase (so a pass means something)", () => {
    const samples = ["The 75 numbers come from", "tickets of 15 numbers", "the columns B I N G O", "a FREE centre square", "tap to daub", "win a Full House", "claim a line"];
    expect(samples.map((s) => BINGO_ONLY.some(([, re]) => re.test(s)))).toEqual(samples.map(() => true));
    const ai = ["Pick the prize houses", "Every card is unique", "numbers are called", "very hard, not impossible"];
    expect(ai.map((s) => AI_BINGO.some(([, re]) => re.test(s)))).toEqual(ai.map(() => true));
  });
  for (const [name, re] of BINGO_ONLY) test(`none of ${files.length} pages and scripts says: ${name}`, () => {
    expect(files.filter((f) => re.test(text(f)))).toEqual([]);
  });
  for (const [name, re] of AI_BINGO) test(`the AI manuals and the trust page source do not say: ${name}`, () => {
    expect(MANUALS.filter((f) => re.test(noComments(readFileSync(join(SRC, f), "utf8"))))).toEqual([]);
  });
  test("the Lucky Draw rules (9.7) are in the one legal document", () => {
    const t = text("terms.html").replaceAll("&quot;", '"');
    for (const must of ["Lucky Draw has one entry per participant", "Entry closes at the draw time", "Winners are shown to all, with the words You won"]) expect([must, t.includes(must)]).toEqual([must, true]);
  });
});

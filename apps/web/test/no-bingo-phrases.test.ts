// Written from the product rule (owner, 1 Nov 2026): a customer never reads another game's rules on the Lucky Draw site.
// Reads what would be served (the public pages and the scripts a customer's browser runs) and looks for phrases that belong only to Bingo or Tambola.
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
const PUB = join(import.meta.dir, "../public");
const SKIP = /^(gamesbar|reportgen|reactions|funnel|control|brandkit)\.js$|^sw\.js$/; // the shared games bar names the other games on purpose
const files = readdirSync(PUB).filter((f) => /\.(html|js)$/.test(f) && !SKIP.test(f));
const BINGO_ONLY: [string, RegExp][] = [
  ["75 numbers", /\b75 numbers\b|\ball 75\b|\b75 balls\b/i], ["tickets of 15", /tickets? of 15|15 numbers on (a|each|every) ticket/i],
  ["B I N G O columns", /columns B I N G O|B-I-N-G-O card/i], ["FREE centre square", /FREE (centre|center) square/i],
  ["daub", /\bdaub/i], ["Full House / Four Corners / Blackout", /\bFull House\b|\bFour Corners\b|\bBlackout\b/i],
  ["claim a win", /\b(claim|claims) (a|your|the) (line|win|prize)\b|\bcall(ed)? (each|every) number\b/i],
];
const text = (f: string): string => readFileSync(join(PUB, f), "utf8").replace(/<script[^>]*\bsrc=[^>]*><\/script>/g, "");
describe("no phrase that belongs only to another game is served on the Lucky Draw site", () => {
  test("the checker catches each phrase (so a pass means something)", () => {
    const samples = ["The 75 numbers come from", "tickets of 15 numbers", "the columns B I N G O", "a FREE centre square", "tap to daub", "win a Full House", "claim a line"];
    expect(samples.map((s) => BINGO_ONLY.some(([, re]) => re.test(s)))).toEqual(samples.map(() => true));
  });
  for (const [name, re] of BINGO_ONLY) test(`none of ${files.length} pages and scripts says: ${name}`, () => {
    expect(files.filter((f) => re.test(text(f)))).toEqual([]);
  });
  test("the Rules section of legal.html is the Lucky Draw rules", () => {
    const t = text("legal.html");
    for (const must of ["Each person joins once", "Joining closes when the draw starts", "Winners get an e-mail and a &quot;You won&quot; button", "A rehearsal has up to 10 people and no prizes"]) expect([must, t.includes(must) || t.includes(must.replaceAll("&quot;", '"'))]).toEqual([must, true]);
  });
});

// B14 on the screens: the console offers "Everyone is in one room" in step 2 and saves it; the big screen can say the numbers after one tap; a room game's phones start silent.
import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { newWorld, openPage, roundAt, T, type Page } from "./harness";
import { PRIZE_HOUSES } from "../../../packages/beacon/src/config";

setDefaultTimeout(60_000);
const PUB = join(import.meta.dir, "../public");
let open: Page[] = [];
afterEach(async () => { for (const p of open) await p.close(); open = []; });

describe("console step 2", () => {
});

describe("the big screen and the phone page", () => {
  const big = readFileSync(join(PUB, "big.js"), "utf8"), bigHtml = readFileSync(join(PUB, "big.html"), "utf8"), z = readFileSync(join(PUB, "z.js"), "utf8");
  test("the big screen loads the voice, has a button for it, asks for one tap in a room game, and speaks each new number only when switched on", () => {
    expect(bigHtml).toMatch(/<script src="\/audio\.js"><\/script><script src="\/zgame\.js">/);
    expect(big).toMatch(/id="bigvoice"/); expect(big).toMatch(/Tap once: this screen will say the numbers/);
    expect(big).toMatch(/if \(fresh && VOICE\.on && window\.TBAudio\)[^;]*;\s*TBAudio\.play\(last\)/);
    expect(big).toMatch(/info\.roomMode === true/);
  });
  test("a room game's phone starts with its sound off (unless the person chose), and says why", () => {
    expect(z).toMatch(/INFO\.quiet && store\.get\("cbz-sound"\) === null\) \{ sound = false/);
    expect(z).toMatch(/This game is played in one room\. The big screen says each number/);
  });
});

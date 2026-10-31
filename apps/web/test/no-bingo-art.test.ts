// Written from the product rule (owner, 1 Nov 2026): no picture or markup of another game (the Bingo card) ships on the Lucky Draw site.
// 1. no page, script or svg contains B-I-N-G-O card markup (letters or the kit's Bingo symbol);
// 2. every brand picture (app icons, favicons, logos, share card) differs from the Bingo copy that the site started from, and none is dominated by Bingo blue;
// 3. the unused how-it-works screenshots of another game are gone.
import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
const PUB = join(import.meta.dir, "../public");
const sha = (f: string): string => createHash("sha256").update(readFileSync(join(PUB, f))).digest("hex");
const BINGO_COPY: Record<string, string> = {
  "icon-192.png": "1947e0754ca5994ca67e6045b06ebf9bf4156714eb17b7949376d5ebdbaac2f9",
  "icon-512.png": "0efca4fed64c968471205591e7d6016630444282e1e74dc469a735eeeea82094",
  "icon-maskable-192.png": "10e8ef48c34f55f5d96a13fa2292854f01ad93ab3b1791fb4a899db7265b6fb7",
  "icon-maskable-512.png": "64a9621d7d86e1c5b07703760a220875a1171cf528d2c815b9169694b224fdde",
  "apple-touch-icon.png": "5648fb13f2e981d2c0986efdb15ffa3d6310acc5363a00dc64ed4dc090ee3cdd",
  "favicon-32.png": "25b502b0c66dda10edc71984997e52184c3801b908f0e832987ca84c832031c3",
  "favicon.ico": "3d1d9d6574fe68aff642e7cf11b76a45e53ee893091ec1e14bf66ce817ed2c26",
  "logo-512.png": "0efca4fed64c968471205591e7d6016630444282e1e74dc469a735eeeea82094",
  "logo-1024.png": "004311444e1ebc4a1d3b939b92f8f79b27c35eabd4b6ca0448adcbadd84595e1",
  "og-card.png": "0c766978cd20c24f2489f7d4b1838ff5883aea509a57db4e2a4c4596cc6c0cc0",
  "img/card.png": "fd00b7717971dd7eef37887295201c6b96d6ad1e18d3e0677c37492df10d0478",
  "logo-mark.svg": "54c3b59f31cdd163bccfe0c2275cc0eafc67dead878cf6ae0b38b3af575d8df6",
  "logo.svg": "6789e4979d2293d6fb4f700f0d0b8a0af9a55dfb91d8d5fe40bdfc53abda6111",
};
const served = readdirSync(PUB).filter((f) => /\.(html|js|svg|webmanifest)$/.test(f) && f !== "gamesbar.js"); // the shared games bar names the other games on purpose
describe("no Bingo artwork ships on the Lucky Draw site", () => {
  test("no page, script or svg has B I N G O card markup", () => {
    const hits = served.filter((f) => /B I N G O|id="i-bingo"|#i-bingo|>B<\/text>\s*<[^>]*>\s*<text[^>]*>I</i.test(readFileSync(join(PUB, f), "utf8")));
    expect(hits).toEqual([]);
  });
  for (const [name, old] of Object.entries(BINGO_COPY)) test(`${name} is not the Bingo picture it started as`, () => {
    expect(existsSync(join(PUB, name))).toBe(true);
    expect(sha(name)).not.toBe(old);
  });
  test("the SVG logos carry no Bingo card colours (the blue square, the B I N G O tiles)", () => {
    for (const f of ["logo-mark.svg", "logo.svg", "favicon.svg"]) expect([f, /#2D3FE0|#1565C0|#C62828|#2E7D32/i.test(readFileSync(join(PUB, f), "utf8"))]).toEqual([f, false]);
  });
  test("the checker would catch the Bingo markup (so a pass means something)", () => {
    expect(/B I N G O|id="i-bingo"/i.test('<symbol id="i-bingo"><text>B I N G O</text></symbol>')).toBe(true);
  });
  test("the old how-it-works screenshots (another game's pages) are not shipped", () => {
    expect(readdirSync(join(PUB, "img")).filter((f) => f.startsWith("hiw-"))).toEqual([]);
  });
});

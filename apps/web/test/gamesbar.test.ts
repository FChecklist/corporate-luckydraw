// The Corporate Games bar: every PUBLIC page loads gamesbar.js (not the play, console, pay or report pages); the bar lists every game, Bingo is marked as the current one.
// The files themselves are pinned to the canonical copy in brand-site.test.ts.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { Window } from "happy-dom";

const pub = (f: string) => readFileSync(new URL("../public/" + f, import.meta.url), "utf8");
const PUBLIC = ["index", "how-it-works", "guide", "brochure", "about", "contact", "legal", "terms", "refund-policy", "dpa", "subprocessors", "partner", "partner-terms", "helpdesk", "pricing", "privacy", "legal-position", "404"];
const WORK_PAGES = ["z", "zc", "pay", "paylink", "paytest", "report", "signin", "owner-visits", "ai-link"];
const GAMES: [string, string][] = [["tambola", "https://housie.corporatetambola.com/"], ["bingo", "https://luckydraw.corporatetambola.com/"], ["tictactoe", "https://tictactoe.corporatetambola.com/"], ["snakes", "https://snakes.corporatetambola.com/"], ["luck", "https://luck.corporatetambola.com/"], ["draw", "https://home.corporatetambola.com/contact"]];

const load = (w: any) => new Function("window", "document", "location", "String", "Array", "Object", "Math", "Date", "JSON", "RegExp", "Number", "Error", "URL", "setTimeout", "clearTimeout", pub("gamesbar.js"))
  .call(w, w, w.document, w.location, String, Array, Object, Math, Date, JSON, RegExp, Number, Error, URL, setTimeout, clearTimeout); // the page's script, run inside the fake window (it needs the usual built-ins)
describe("the Corporate Games bar", () => {
  test("every public page loads it, no play / console / pay page does, and the build ships it", () => {
    for (const p of PUBLIC) expect([p, /<script src="\/gamesbar\.js\?v=\d+" defer><\/script>/.test(pub(p + ".html"))]).toEqual([p, true]);
    for (const p of WORK_PAGES) expect([p, pub(p + ".html").includes("gamesbar")]).toEqual([p, false]);
    const b = readFileSync(new URL("../../../pages/build.mjs", import.meta.url), "utf8"); expect(b).toContain('"gamesbar.js"'); expect(b).toContain('"gamesbar.css"');
  });
  test("it never says the banned word and never links the old hub", () => {
    const banned = new RegExp(["pri", "vate"].join(""), "i");
    for (const f of ["gamesbar.js", "gamesbar.css"]) { expect(banned.test(pub(f))).toBe(false); expect(pub(f)).not.toContain("games.corporatetambola.com"); }
  });
});

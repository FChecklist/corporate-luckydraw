// OWNER RULE v1.1: money is written with the rupee sign (₹), never "Rs", on every page, script and message of this game. (Exceptions: pdf.ts, because the PDF font cannot draw ₹ and maps it to "Rs " on purpose; and ledger.ts, a note the owner's ledger seeds into its own product catalog, shown on no screen.)
// FALSIFIED BY (planted, saw it fail, restored): "Rs 100" in pricing.html; "Rs " + amount in credit.ts.
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { rs } from "../src/credit";

const root = new URL("../../../", import.meta.url), read = (p: string) => readFileSync(new URL(p, root), "utf8");
const MONEY_RS = /\bRs\.? ?[0-9]|["'`]Rs ?["'`]|\bRs \$\{/;
const noComments = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, " ").split("\n").filter((l) => !/^\s*\/\//.test(l)).map((l) => l.replace(/(^|\s)\/\/\s.*$/, "")).join("\n");
describe("the rupee sign", () => {
  test("the money helper writes ₹ for rupees and US$ for dollars", () => { expect(rs(2399)).toBe("₹2,399"); expect(rs(1499.5)).toMatch(/^₹1,499\.5/); expect(rs(10, "USD")).toBe("US$10"); });
  test("no public page, script or server message writes an amount as Rs", () => {
    const pub = readdirSync(new URL("apps/web/public/", root)).filter((f) => /\.(html|js|txt)$/.test(f) && !/^(reportgen|control|reactions|funnel)\.js$/.test(f)); // the four built bundles are rebuilt from source
    for (const f of pub) { const t = read("apps/web/public/" + f); expect([f, MONEY_RS.test(f.endsWith(".js") ? noComments(t) : t)]).toEqual([f, false]); }
    for (const f of readdirSync(new URL("apps/edge/src/", root)).filter((f) => f.endsWith(".ts") && f !== "pdf.ts" && f !== "ledger.ts" && f !== "site-shell.gen.ts")) expect([f, MONEY_RS.test(noComments(read("apps/edge/src/" + f)))]).toEqual([f, false]);
  });
});

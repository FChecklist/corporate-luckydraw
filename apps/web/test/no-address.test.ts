// Owner order, 1 Nov 2026: no street, city, state or pin code anywhere in what ships. Only "India".
import { expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
const ROOT = join(import.meta.dir, "../../..");
const DIRS = ["apps/web/public", "apps/edge/src", "packages", "tools/legal", "apps/web/tools", "config"];
const BANNED = /ghaziabad|uttar\s+pradesh|indirapuram|shipra|krishna\s+vista|201014|B-1105/i;
const walk = (d: string): string[] => readdirSync(d).flatMap((n) => { const p = join(d, n); return n === "node_modules" || n === "__pycache__" ? [] : statSync(p).isDirectory() ? walk(p) : /\.(html|js|ts|py|json|md|txt|svg|xml|webmanifest)$/.test(n) ? [p] : []; });
test("no address, city, state or pin code appears in shipped pages, scripts, mail and pdf code, or legal sources", () => {
  const hits = DIRS.flatMap((d) => walk(join(ROOT, d))).filter((f) => BANNED.test(readFileSync(f, "utf8")));
  expect(hits.map((h) => h.replace(ROOT, ""))).toEqual([]);
}, 60000);
test("the checker itself catches an address", () => {
  for (const s of ["B-1105, Shipra Krishna Vista", "Indirapuram, Ghaziabad", "Uttar Pradesh, 201014"]) expect(BANNED.test(s)).toBe(true);
});
test("the site footer says only India", () => {
  expect(readFileSync(join(ROOT, "apps/web/public/index.html"), "utf8")).toContain("a sole proprietorship in India. GST is not charged.");
});

// The version standard: version.json, CHANGELOG.md, docs/KNOWLEDGE.md and the footer of every page say the same version, and the CI file has the two job names the audit asks for.
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import RELEASES from "../../edge/src/releases.json";

const root = new URL("../../../", import.meta.url), read = (p: string) => readFileSync(new URL(p, root), "utf8");
const V = JSON.parse(read("version.json"));

describe("one version in four places", () => {
  test("version.json, the newest release, CHANGELOG.md and docs/KNOWLEDGE.md agree", () => {
    expect(V.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect((RELEASES as any[])[0].version).toBe(V.version); expect((RELEASES as any[])[0].date).toBe(V.date);
    expect(read("CHANGELOG.md")).toMatch(new RegExp(`^## ${V.version.replace(/\./g, "\\.")} - `, "m"));
    expect(read("docs/KNOWLEDGE.md")).toContain(`**Version ${V.version}**`);
    expect(JSON.parse(read("package.json")).version).toBe(V.version);
    for (const f of [V.changelog, V.knowledge, V.releases]) expect(() => read(f)).not.toThrow();
  });
  test("the footer of every public page says that version and its date", () => {
    const d = new Date(V.date + "T00:00:00Z"), label = `${d.getUTCDate()} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()]} ${d.getUTCFullYear()}`;
    const pages = readdirSync(new URL("apps/web/public/", root)).filter((f) => f.endsWith(".html")); let seen = 0;
    for (const f of pages) { const h = read("apps/web/public/" + f); const m = h.match(/id="siteVersion">([^<]*)</); if (m) { seen++; expect([f, m[1]]).toEqual([f, `Version ${V.version}, released ${label}`]); } }
    expect(seen).toBeGreaterThan(15);
    expect(read("apps/edge/src/site-shell.gen.ts")).toContain(`Version ${V.version}, released ${label}`);
  });
  test("CI has the two jobs, named typecheck and each-file, and each-file runs every test file as its own process", () => {
    const ci = read(".github/workflows/ci.yml");
    expect(ci).toMatch(/^  typecheck:/m); expect(ci).toMatch(/^  each-file:/m); expect(ci).toContain("bun run typecheck"); expect(ci).toContain("tools/run-each-file.mjs");
    expect(read("tools/run-each-file.mjs")).toMatch(/spawn\("bun", \["test", f\]/);
  });
});

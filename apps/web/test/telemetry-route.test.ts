// rum.js posts to /api/telemetry; the Pages Function that receives it must exist, take no personal details and be tied to this site.
import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
const ROOT = join(import.meta.dir, "../../..");
test("the address rum.js posts to has a function behind it", () => {
  expect(readFileSync(join(ROOT, "apps/web/public/rum.js"), "utf8")).toContain('"/api/telemetry"');
  expect(existsSync(join(ROOT, "pages/functions/api/telemetry.ts"))).toBe(true);
});
test("the function stores no cookie, address or query string", () => {
  const s = readFileSync(join(ROOT, "pages/functions/api/telemetry.ts"), "utf8");
  expect(s).toMatch(/No cookies, no IP, no query strings/);
  expect(s).not.toMatch(/CF-Connecting-IP|cf-connecting-ip|Set-Cookie/i);
});

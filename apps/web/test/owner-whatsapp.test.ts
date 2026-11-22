// The owner's mobile number opens WhatsApp with a ready first line (owner order 4 Nov 2026); the visible number stays as it was.
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

describe("the owner's mobile number opens WhatsApp", () => {
  test("every page that shows the number links it to wa.me/919650397480 with the ready first line and keeps no tel: link", () => {
    const dir = join(import.meta.dir, "../public");
    for (const f of readdirSync(dir).filter((n) => n.endsWith(".html"))) {
      const html = readFileSync(join(dir, f), "utf8");
      if (!html.includes("96503 97480")) continue;
      expect([f, html.includes('<a href="https://wa.me/919650397480?text=Hi%2C%20I%20am%20interested%20in%20corporate%20games" target="_blank" rel="noopener" aria-label="WhatsApp (+91) 96503 97480 (opens WhatsApp)">(+91) 96503 97480</a>')]).toEqual([f, true]);
      expect(html).not.toContain("tel:+919650397480");
    }
  });
});

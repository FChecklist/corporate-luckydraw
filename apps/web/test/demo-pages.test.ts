// The demo is labelled "Demo" on the organizer console and on the page participants open, and the console button only shows when the server says the demo is on.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const src = (f: string) => readFileSync(join(import.meta.dir, "../public", f), "utf8");
test("the console asks for a demo game and hides the button unless the server switched it on", () => {
  const z = src("zc.js");
  expect(z).toMatch(/"\/api\/z", \{ id, demo: true,/);
  expect(z).toMatch(/S\.demoOn \? `<button[^`]*id="demo"/);
  expect(z).toContain("The free demo is not switched on yet.");
  expect(z).toContain("<b>Demo.</b> Up to 10 people. No payment.");
});
test("the participant page shows the Demo tag", () => {
  expect(src("z.js")).toMatch(/\/\^Demo: \/\.test\(I\.name/);
});

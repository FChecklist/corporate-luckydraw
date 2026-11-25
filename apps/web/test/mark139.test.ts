// Owner order (25 Nov 2026): the small mark "१३९" sits at the very top centre of every page, once, with the approved look.
// Scans every page source: the static pages, the pages the edge code builds as HTML strings, the generators, and the pictures drawn as text (SVG banners).
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { BRANDS, DEFAULT_COMPANY, renderInvoiceHtml, splitGst } from "../../../packages/billing/src";
import { trustHtml } from "../../edge/src/trust-page";

const CSS = '.mark139{position:absolute;top:0;left:0;right:0;margin:0;padding:1px 0 0;text-align:center;line-height:1;pointer-events:none;user-select:none;z-index:2147483647;font-family:"Noto Sans Devanagari","Mukta","Nirmala UI","Mangal","Kohinoor Devanagari","Devanagari Sangam MN",sans-serif;font-size:6px;font-weight:700;color:#0B2A6B}\n.mark139 span{display:inline-block;border-bottom:.5px solid #7A1010;padding-bottom:.5px}';
const DIV = '<div class="mark139" lang="hi" aria-hidden="true"><span>१३९</span></div>';
const ROOT = join(import.meta.dir, "../../..");
const PUB = join(ROOT, "apps/web/public");
const read = (p: string) => readFileSync(p, "utf8");
const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
const count = (s: string, needle: string) => s.split(needle).length - 1;

/** The one rule for a whole page: exactly one mark element, the approved markup and CSS, mark first in the body, style in the head. */
function checkPage(name: string, html: string): void {
  expect(count(html, 'class="mark139"'), name + ": exactly one mark element").toBe(1);
  expect(count(html, DIV), name + ": approved markup").toBe(1);
  expect(count(html, CSS), name + ": approved CSS, once").toBe(1);
  expect(html.indexOf(CSS), name + ": CSS in the head").toBeLessThan(html.search(/<body/i));
  expect(html, name + ": mark is the first thing in the body").toMatch(new RegExp("<body[^>]*>" + DIV.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}

describe("the १३९ mark", () => {
  test("the approved values are what the test says they are", () => {
    for (const v of ["#0B2A6B", "#7A1010", "font-size:6px", "font-weight:700", ".5px solid", "padding-bottom:.5px", "position:absolute", "pointer-events:none", "user-select:none"]) expect(CSS).toContain(v);
    expect(DIV).toContain("१३९");
    expect(DIV).toContain('aria-hidden="true"');
  });

  const pages = walk(PUB).filter((f) => f.endsWith(".html"));
  test("there are static pages to scan", () => { expect(pages.length).toBeGreaterThan(30); });
  for (const f of pages) test("static page " + f.slice(PUB.length + 1), () => checkPage(f, read(f)));

  test("the Trust page the edge code builds", () => checkPage("trustHtml()", trustHtml()));
  test("the invoice page the edge code builds", () => checkPage("renderInvoiceHtml()", renderInvoiceHtml({ number: "CB/2026-27/000001", issuedAt: Date.UTC(2026, 9, 1), brand: BRANDS.corporate_luckydraw, company: DEFAULT_COMPANY, draft: false, buyer: { name: "Acme" }, currency: "INR", lines: [{ description: "Draw", quantity: 1, amount: 100 }], tax: splitGst(100, "INR", "27", undefined, true) })));

  for (const f of ["apps/edge/src/admin.ts", "apps/edge/src/people.ts"]) {
    test("HTML strings in " + f, () => {
      const src = read(join(ROOT, f));
      const pagesInSrc = count(src, "<!doctype html");
      expect(pagesInSrc).toBeGreaterThan(0);
      expect(count(src, "${MARK_DIV}"), f + ": one mark per page string").toBe(pagesInSrc);
      expect(count(src, "${MARK_STYLE}"), f + ": one style per page string").toBe(pagesInSrc);
    });
  }
  test("apps/edge/src/mark139.ts holds the approved text", () => {
    const src = read(join(ROOT, "apps/edge/src/mark139.ts"));
    expect(src).toContain(CSS);
    expect(src).toContain(DIV);
  });
  test("the generator and its generated frame carry the approved text", () => {
    const py = read(join(ROOT, "apps/web/tools/site_shell.py"));
    expect(py).toContain(DIV);
    expect(py).toContain("#0B2A6B");
    expect(py).toContain("#7A1010");
    const gen = read(join(ROOT, "apps/edge/src/site-shell.gen.ts"));
    expect(gen).toContain(CSS);
    expect(gen).toContain(DIV);
  });

  test("SVG pictures drawn as text (banners, share cards) carry the mark; icons, logos and favicons do not", () => {
    for (const f of walk(PUB).filter((x) => x.endsWith(".svg"))) {
      const name = f.slice(PUB.length + 1);
      if (/^(favicon|logo)/.test(name) || name.includes("icon")) { expect(read(f), name).not.toContain("१३९"); continue; }
      expect(count(read(f), "१३९"), name).toBe(1);
    }
  });
});

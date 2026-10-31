// The common legal text (game-core 0.9.8: one text for every game; only the rules differ). The site files privacy.html, terms.html and legal.html carry markers,
// never the words: pages/build.mjs calls inject() on the built copies, so no copy of the text lives in this repo (bun tools/drift.ts must pass).
// Run once to put the markers into the three source pages: bun tools/shared-legal.ts   (then python -I apps/web/tools/make_site.py).
import { readFileSync, writeFileSync } from "node:fs";
import { renderLegal, renderRules } from "../vendor/game-core/packages/ui/src/legal";
export const MARK = /<!--shared-legal:([a-z,]*)-->/g, RULES = "<!--shared-rules-->";
const rulesHtml = (): string => renderRules(readFileSync(new URL("../docs/LUCKYDRAW_RULES_BOOK.md", import.meta.url), "utf8"));
/** Replaces the markers in a built page with the shared text and the rules of this game. */
export const inject = (html: string): string => html.replace(MARK, (_m, kinds: string) => kinds ? kinds.split(",").map((k) => renderLegal(k as never)).join("") : renderLegal()).split(RULES).join(rulesHtml());
if (import.meta.main) {
const PUB = new URL("../apps/web/public/", import.meta.url);
const TERMS_VERSION = /TERMS_VERSION = "([^"]+)"/.exec(readFileSync(new URL("../apps/edge/src/brand.ts", import.meta.url), "utf8"))![1]!;
const MAIN = /(<main\b[^>]*>)([\s\S]*?)(<\/main>)/;
const swap = (file: string, inner: (old: string) => string): void => {
  const u = new URL(file, PUB), s = readFileSync(u, "utf8");
  writeFileSync(u, s.replace(MAIN, (_m, a: string, old: string, c: string) => a + "\n" + inner(old) + "\n" + c), "utf8");
};
const from = (old: string, marker: string): string => { const i = old.indexOf(marker); return i < 0 ? "" : old.slice(i); };
swap("privacy.html", () => `<h1>Privacy, cookies and complaints</h1>\n<!--shared-legal:privacy,cookies,grievance-->`);
swap("terms.html", (old) => `<h1>Corporate Lucky Draw — Terms and Conditions</h1>
<p><strong>Seller:</strong> IT SERVICES BY RAJAT AGARWAL, the trade name of Rajat Agarwal. <strong>Service:</strong> Corporate Lucky Draw (luckydraw.corporatetambola.com). <strong>Version ${TERMS_VERSION}.</strong></p>
<!--shared-legal:terms--><section class="legal" id="rules"><h2>Rules of the game</h2><!--shared-rules--></section>
<p>Version ${TERMS_VERSION}</p>
${from(old, "<h2>Consent boxes and records</h2>")}`);
swap("legal.html", (old) => `<h1>Rules, privacy and disclaimer</h1>\n<section class="legal" id="rules"><h2 id="rh">Rules</h2><!--shared-rules--></section>\n<!--shared-legal:-->\n${from(old, '<h2 id="dh">')}`);
}

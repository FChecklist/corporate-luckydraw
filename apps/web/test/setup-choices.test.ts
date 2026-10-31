// B01, B02, B31 (gap plan 2026-10-29), as the organizer sees them in the console:
//   B01  a new game never shows Cards for each person / How the card marks / the gap between numbers / what a guest types (they are hidden, not disabled); an older game that uses another value keeps seeing it
//   B02  a new game runs one number every 12 seconds (the only speed offered); an older game keeps its own
//   B31  the real start-time rule is "any time in the future"; "at least 2 hours ahead" is advice, and a "Start in 20 minutes" button exists
import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { newWorld, openPage, roundAt, T, type Page } from "./harness";
import { PRIZE_HOUSES } from "../../../packages/beacon/src/config";
import { PAUSE_MAX_PARTICIPANTS } from "../../../packages/beacon/src/control";
import { readFileSync } from "node:fs";
import { join } from "node:path";

setDefaultTimeout(60_000);
const ZC_SCRIPTS = "zgame.js control.js zc.js".split(" ");
let open: Page[] = [];
afterEach(async () => { for (const p of open) await p.close(); open = []; });

async function organizer() {
  const w = newWorld();
  const s = await w.json(await w.api("POST", "/api/start", { email: "boss@acme.com" }));
  return { ...w, token: s.token as string, aiKey: s.aiKey as string, aiMessage: s.aiMessage as string };
}
type O = Awaited<ReturnType<typeof organizer>>;
const START = roundAt(T) + 1200;
const make = (o: O, id: string, over: Record<string, unknown> = {}) => o.api("POST", "/api/z", { id, startRound: START, callSeconds: 12, cap: 100, ...over }, o.aiKey);
async function page(o: O, url: string) {
  const afterLoad = (win: any, f: string) => { if (f === "zgame.js" && win.ZG && !win.ZG.PRIZE_HOUSES) win.ZG.PRIZE_HOUSES = PRIZE_HOUSES; };
  const p = await openPage(o.world, { url: "http://localhost" + url, html: "zc.html", scripts: ZC_SCRIPTS, session: { "cbz-org": o.token, "cbz-aimsg": o.aiMessage, "cbz-email": "boss@acme.com" }, afterLoad });
  open.push(p); return p;
}
const hiddenIn = (p: Page, sel: string) => { const el = p.$(sel) as any; return !!el && !!el.closest(".zc-hide"); };
const until = async (cond: () => boolean, ms = 20000) => { const t0 = Date.now(); while (!cond()) { if (Date.now() - t0 > ms) throw new Error("timed out"); await new Promise((r) => setTimeout(r, 50)); } };

describe("Quick setup (a new game)", () => {
});

describe("Step 2 of a game in the console (B01, B02)", () => {
});

describe("B07: a big game says before it is bought that it cannot be paused", () => {
});

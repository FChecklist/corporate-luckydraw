// B08, B09, B10, B15, B28, B33 (gap plan 2026-10-29): the words and buttons a player and an organizer meet on game day.
//   B10  the check-before-publish read-back names the prizes that have no name yet, with a "Name them now" button
//   B12  the people list says how many were invited and have not joined, with a filter
//   B09  step 9 (game day) carries the big number board button and the big-screen link
//   B28  the game-day report never says "all match" when nothing is stored (Bingo has no claim button; phones report their own wins)
//   B08  the paused text says when and that the card is safe; a slow phone connection is not blamed on the organizer
//   B15  a Do Not Disturb tip, the screen stays awake, and a person who comes back is told what they missed
//   B33  three short rules under the card instead of "just watch"
import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { newWorld, openPage, roundAt, T, type Page } from "./harness";
import { PRIZE_HOUSES } from "../../../packages/beacon/src/config";
import { publicKeyFromSecret } from "../../../packages/beacon/src/control";

setDefaultTimeout(60_000);
const PUB = join(import.meta.dir, "../public");
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
const publish = (o: O, id: string) => o.api("POST", `/api/z/${id}/publish`, { email: "boss@acme.com", phone: "98765 43210" }, o.token);
const regKey = (o: O, id: string) => o.api("PUT", `/api/z/${id}/control/key`, { publicKey: publicKeyFromSecret("11".repeat(32)) }, o.token);
async function page(o: O, url: string) {
  const afterLoad = (win: any, f: string) => { if (f === "zgame.js" && win.ZG && !win.ZG.PRIZE_HOUSES) win.ZG.PRIZE_HOUSES = PRIZE_HOUSES; };
  const p = await openPage(o.world, { url: "http://localhost" + url, html: "zc.html", scripts: ZC_SCRIPTS, session: { "cbz-org": o.token, "cbz-aimsg": o.aiMessage, "cbz-email": "boss@acme.com" }, afterLoad });
  open.push(p); return p;
}

describe("B10: the read-back before publishing names the unnamed prizes", () => {
});

describe("B09 + B28: game day (step 9)", () => {
});

describe("B08, B15, B33: the phone page", () => {
  const z = readFileSync(join(PUB, "z.js"), "utf8");
});

describe("B12: the organizer learns before the game who has not joined", () => {
});

describe("B26: the organizer can fetch the game log in the last step", () => {
});

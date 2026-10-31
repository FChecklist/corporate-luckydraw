// The player page offers "Leave this game" and "What do you hold about me / delete me" (U5, U6): real page scripts in a DOM, real Worker code, in-memory database.
import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { createHash } from "node:crypto";
import { newWorld, openPage, roundAt, T, type Page } from "./harness";

setDefaultTimeout(30_000);
const START = roundAt(T) + 1200;
const rnd = (r: number) => createHash("sha256").update("fake" + r).digest("hex");
let open: Page[] = [];
afterEach(async () => { for (const p of open) await p.close(); open = []; });

async function organizer() {
  const w = newWorld();
  const s = await w.json(await w.api("POST", "/api/start", { email: "boss@acme.com" }));
  return { ...w, token: s.token as string, aiKey: s.aiKey as string };
}
type O = Awaited<ReturnType<typeof organizer>>;
const rtFake = (win: any, nowMs: () => number) => {
  const Orig = win.ZG.PhoneRuntime;
  win.ZG.PhoneRuntime = class extends Orig {
    constructor(eid: string, deps: any) {
      super(eid, { ...deps, beacon: { fetcher: async (url: string) => { const last = url.split("/").pop()!; const r = last === "latest" ? roundAt(nowMs()) : Number(last); return { ok: true, status: 200, json: async () => ({ round: r, randomness: rnd(r), signature: "aa" }) }; } } });
    }
  };
};
async function player(o: O, id: string) {
  await o.api("POST", "/api/z", { id, startRound: START, callSeconds: 9, cap: 100 }, o.aiKey);
  await o.api("POST", `/api/z/${id}/publish`, { email: "boss@acme.com", phone: "98765 43210" }, o.token);
  const p = await openPage(o.world, { url: `http://localhost/z?e=${id}`, html: "z.html", scripts: ["audio.js", "zgame.js", "z.js", "rights.js"], tick: true, afterLoad: (win, f) => { if (f === "zgame.js") rtFake(win, () => o.world.now); } });
  open.push(p);
  await p.waitFor((x) => /Join the (game|engagement)/.test(x));
  (p.$("#nm") as any).value = "Maya Lopez"; p.click("#go");
  await p.waitFor((x) => /You are in|Your card|What you can win/.test(x));
  return p;
}
const body = (p: Page) => String(p.win.document.body.textContent ?? "").replace(/\s+/g, " ");
const until = async (p: Page, pred: () => boolean, ms = 6000) => { const t0 = Date.now(); while (!pred()) { if (Date.now() - t0 > ms) throw new Error("timed out; page says: " + body(p).slice(0, 800)); await new Promise((r) => setTimeout(r, 25)); } };
const count = (o: O, sql: string) => (o.world.raw.query(sql).get() as any).c as number;

describe("the player page offers the player's rights", () => {
});

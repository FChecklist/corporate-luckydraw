// The agreement notice as a person meets it on the pages (real page scripts in a DOM, real Worker code, in-memory database). No tick-boxes since 1 Nov 2026: one small line with three links,
// the buttons are not held back, and the request still carries the version so the server keeps its proof.
import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { createHash } from "node:crypto";
import { newWorld, openPage, roundAt, T, type Page } from "./harness";

setDefaultTimeout(30_000);
const START = roundAt(T) + 1200;
const rnd = (r: number) => createHash("sha256").update("fake" + r).digest("hex");
let open: Page[] = [];
afterEach(async () => { for (const p of open) await p.close(); open = []; });

async function organizer(extra: Record<string, string> = {}) {
  const w = newWorld(extra);
  const s = await w.json(await w.api("POST", "/api/start", { email: "boss@acme.com" }));
  return { ...w, token: s.token as string, aiKey: s.aiKey as string, aiMessage: s.aiMessage as string };
}
type O = Awaited<ReturnType<typeof organizer>>;
const make = (o: O, id: string) => o.api("POST", "/api/z", { id, startRound: START, callSeconds: 9, cap: 100 }, o.aiKey);
const publish = (o: O, id: string) => o.api("POST", `/api/z/${id}/publish`, { email: "boss@acme.com", phone: "98765 43210" }, o.token);
async function page(o: O, url: string, html: string, scripts: string[], session: Record<string, string> = {}, extra: Partial<Parameters<typeof openPage>[1]> = {}) {
  const p = await openPage(o.world, { url: "http://localhost" + url, html, scripts, session, tick: false, ...extra }); open.push(p); return p;
}
const rtFake = (win: any, nowMs: () => number) => {
  const Orig = win.ZG.PhoneRuntime;
  win.ZG.PhoneRuntime = class extends Orig {
    constructor(eid: string, deps: any) {
      super(eid, { ...deps, beacon: { fetcher: async (url: string) => { const last = url.split("/").pop()!; const r = last === "latest" ? roundAt(nowMs()) : Number(last); return { ok: true, status: 200, json: async () => ({ round: r, randomness: rnd(r), signature: "aa" }) }; }, mirrors: ["https://a.test"], timeoutMs: 1000 } });
    }
  };
};
const tick = (p: Page, id: string) => { const i = p.win.document.getElementById(id) as any; i.checked = true; i.dispatchEvent(new p.win.Event("change", { bubbles: true })); };
const rows = (o: O, kind: string) => o.world.raw.query("SELECT * FROM consent_log WHERE kind=? ORDER BY at_ms, id").all(kind) as any[];

describe("K4 the join page", () => {
});

describe("K1 publish on the console", () => {
});

describe("K2 the Create your game pop-up", () => {
  test("the notice sits with the sign-up and the sign-up carries the version", async () => {
    const site = await Bun.file(new URL("../public/site.js", import.meta.url)).text();
    expect(site).toContain('CBConsent.html("K2")'); expect(site).toContain('consent: CBConsent.payload(k2, "K2")');
    expect(site.indexOf('CBConsent.html("K2")')).toBeLessThan(site.indexOf('id="frGo"'));
  });
});

describe("K5 a Co-host takes the role", () => {
});

describe("K3 the payment page", () => {
  test("no box: the pay button is on", async () => {
    const o = await organizer({ TEST_MODE: "1" }); await make(o, "CP-PAY"); await publish(o, "CP-PAY");
    const p = await page(o, "/pay?e=CP-PAY", "pay.html", ["common.js", "pay.js"], { "cbz-org": o.token, "cbz-email": "boss@acme.com" });
    await p.waitFor((x) => /Payment/.test(x) && !!p.$("#paygo"));
    expect(p.win.document.querySelectorAll('[data-cbc="K3"] input').length).toBe(0);
    expect([(p.$("#paygo") as any).disabled, (p.$("#paygo") as any).getAttribute("aria-disabled")]).toEqual([false, "false"]);
  });
});

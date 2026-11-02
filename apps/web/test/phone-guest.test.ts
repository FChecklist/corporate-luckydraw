// Phases 2 to 4, the guest's phone and the public pages (docs/PHASE2_SERVER_CONTRACT.md "The phone page must", ROLES_AND_CONSOLE_SPEC_2 items 11 to 13, spec 4 section C).
// The real page scripts run in a DOM and talk to the REAL Worker code (apps/edge) with an in-memory database. Only the public randomness and Google's script are faked.
import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { createHash, createSign, generateKeyPairSync } from "node:crypto";
import { newWorld, openPage, roundAt, roundMs, T, type Page } from "./harness";
import { setGoogleKeyProvider } from "../../edge/src/google";

setDefaultTimeout(60_000);
const HOUR = 3_600_000, DAY = 24 * HOUR;
const START = roundAt(T) + 1200; // one hour after T
const rnd = (r: number) => createHash("sha256").update("fake" + r).digest("hex");
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGAAAABgAAAAAAAAAAAAAAAAAAAAAAAAAAA="; // a 96 x 96 picture header (the server checks the size in pixels: 48 to 192 on the longest side)
let open: Page[] = [];
afterEach(async () => { for (const p of open) await p.close(); open = []; setGoogleKeyProvider(); });

async function organizer(extra: Record<string, string> = {}) {
  const w = newWorld(extra);
  const s = await w.json(await w.api("POST", "/api/start", { email: "boss@acme.com" }));
  return { ...w, token: s.token as string, aiKey: s.aiKey as string };
}
type O = Awaited<ReturnType<typeof organizer>>;
const make = (o: O, id: string, over: Record<string, unknown> = {}) => o.api("POST", "/api/z", { id, startRound: START, callSeconds: 9, cap: 100, join: "phone", ...over }, o.aiKey);
const publish = (o: O, id: string) => o.api("POST", `/api/z/${id}/publish`, { email: "boss@acme.com", phone: "98765 43210" }, o.token);
const settings = (o: O, id: string, body: unknown) => o.api("PATCH", `/api/z/${id}/settings`, body, o.token);
const published = async (o: O, id: string, set: Record<string, unknown> = {}, over: Record<string, unknown> = {}) => { await make(o, id, over); if (Object.keys(set).length) { const r = await settings(o, id, set); expect(r.status).toBe(200); } await publish(o, id); };

type Call = { m: string; u: string; b?: any };
const rtFake = (win: any, nowMs: () => number) => { // the phone's runtime with a fake public beacon (the real one is not reachable from a test)
  const Orig = win.ZG.PhoneRuntime;
  win.ZG.PhoneRuntime = class extends Orig {
    constructor(eid: string, deps: any) {
      super(eid, { ...deps, beacon: { fetcher: async (url: string) => { const last = url.split("/").pop()!; const r = last === "latest" ? roundAt(nowMs()) : Number(last); return { ok: true, status: 200, json: async () => ({ round: r, randomness: rnd(r), signature: "aa" }) }; }, mirrors: ["https://a.test", "https://b.test", "https://c.test"], timeoutMs: 500 }, verify: (x: any) => x.signature === "aa", mono: () => deps.mono() });
    }
  };
};
/** Every request the page makes is written down (method, address, body). `pre` runs before the page's own scripts (to preset storage or wrap fetch). */
const spy = (calls: Call[], pre?: (win: any) => void) => (win: any, f: string, o?: O) => {
  if (f !== "audio.js" && f !== "common.js" && f !== "preview.js" && f !== "google.js" && f !== "paylink.js" && f !== "signin.js") return;
  if (win.__spied) return; win.__spied = true;
  pre?.(win);
  const of = win.fetch;
  win.fetch = (u: any, i?: any) => { let b: any; try { b = i?.body ? JSON.parse(i.body) : undefined; } catch { /* not json */ } calls.push({ m: String(i?.method || "GET").toUpperCase(), u: String(u), b }); return of(u, i); };
};
async function phoneAt(o: O, url: string, calls: Call[] = [], pre?: (win: any) => void) {
  const hook = spy(calls, pre);
  const p = await openPage(o.world, { url: "http://localhost" + url, html: "z.html", scripts: ["audio.js", "zgame.js", "z.js"], afterLoad: (win, f) => { hook(win, f); if (f === "zgame.js") rtFake(win, () => o.world.now); } });
  open.push(p); return p;
}
const typeJoin = async (p: Page, phone: string, name = "Asha") => { await p.waitFor((x) => /Join the game/.test(x)); { const ph = p.$("#ph") as any; if (ph) ph.value = phone; } (p.$("#nm") as any).value = name; p.click("#go"); };
const setVal = (p: Page, sel: string, v: string) => { const el = p.$(sel) as any; el.value = v; el.dispatchEvent(new p.win.Event("input", { bubbles: true })); };
const SEEN = /Your card|What you can win|Starting in|Getting ready/;

describe("brand strip on the card page", () => {
});

describe("joining: personal link, waiting, removed, cancelled", () => {
  const listOnly = async (o: O, id: string, extra: Record<string, unknown> = {}) => { await published(o, id, { whoCanJoin: "list", ...extra }); };
  const addPerson = async (o: O, id: string, name: string, phone: string) => { const r = await o.json(await o.api("POST", `/api/z/${id}/people`, { people: [{ name, phone }] }, o.token)); expect(r.added).toBe(1); return r.people[0] as { id: string; link: string }; };
  const tokenOf = (link: string) => link.split("/j/")[1]!;

});

describe("My invites on the guest's phone", () => {
});

describe("See what guests see (card preview)", () => {
  const prev = async (o: O, hash: string, calls: Call[] = [], session: Record<string, string> = {}) => { const hook = spy(calls); const p = await openPage(o.world, { url: "http://localhost/preview.html" + hash, html: "preview.html", scripts: ["audio.js", "preview.js"], session, afterLoad: (w, f) => hook(w, f) }); open.push(p); return p; };
});

describe("the pay link page (no sign-in)", () => {
  const linkOf = async (o: O, id: string) => { const r = await o.api("POST", `/api/z/${id}/paylink`, {}, o.token); expect(r.status).toBe(200); const j = await o.json(r); return new URL(j.url).searchParams.get("t")!; };
  const pl = async (o: O, t: string, calls: Call[] = []) => { const hook = spy(calls); const p = await openPage(o.world, { url: "http://localhost/paylink.html" + (t ? "?t=" + t : ""), html: "paylink.html", scripts: ["common.js", "paylink.js"], afterLoad: (w, f) => hook(w, f) }); open.push(p); return p; };
  test("shows only the game, date and price with GST, asks name and e-mail, and pays that one game (read back from the server)", async () => {
    const o = await organizer({ TEST_MODE: "1" }); await published(o, "PG-PL1", {}, { name: "Diwali Night" }); const t = await linkOf(o, "PG-PL1");
    const calls: Call[] = []; const p = await pl(o, t, calls);
    const txt = await p.waitFor((x) => /Diwali Night/.test(x));
    expect(txt).toMatch(/₹/); expect(txt).not.toMatch(/plus GST/); expect(txt).toMatch(/Payment to IT Services by Rajat Agarwal/); expect(txt).toMatch(/Total/); expect(txt).not.toMatch(/Please sign in/i); expect(!!p.$("#nm")).toBe(true); expect(!!p.$("#em")).toBe(true); expect(!!p.$("#ph")).toBe(true); // the Details block asks for mobile, company name and GST / Tax number (all optional)
    expect(p.win.location.search).toBe(""); // the secret left the address bar
    p.click("#paygo"); await p.waitFor((x) => /Please enter your name/.test(x)); expect(calls.filter((c) => c.m === "POST" && !c.u.endsWith("/api/proforma"))).toEqual([]); // nothing is sent until name and e-mail are good
    (p.$("#nm") as any).value = "Neha Shah"; (p.$("#em") as any).value = "neha@acme.com"; p.click("#paygo");
    await p.waitFor((x) => /Payment received/.test(x), 20_000);
    const post = calls.find((c) => c.m === "POST" && /\/checkout$/.test(c.u))!; expect(post.u).toBe(`/api/paylink/${t}/checkout`); expect(post.b).toMatchObject({ name: "Neha Shah", email: "neha@acme.com" });
    const st = await o.json(await o.api("GET", `/api/paylink/${t}`)); expect(st.status).toBe("paid");
    const sum = await o.json(await o.api("GET", "/api/z/PG-PL1/summary", undefined, o.token)); expect(sum.payment.status).toBe("paid");
  });
  test("calm screens: paid, expired after 7 days, cancelled, and a wrong or missing link", async () => {
    const o = await organizer({ TEST_MODE: "1" }); await published(o, "PG-PL2"); const t2 = await linkOf(o, "PG-PL2");
    await published(o, "PG-PL3"); const t3 = await linkOf(o, "PG-PL3");
    await o.api("POST", "/api/z/PG-PL3/cancel", { confirmations: 3 }, o.token);
    expect((await (await pl(o, t3)).waitFor((x) => /This game was cancelled/.test(x)))).toMatch(/nothing to pay/i);
    o.world.now += 8 * DAY; const ex = await pl(o, t2); expect(await ex.waitFor((x) => /This payment link has run out/.test(x))).not.toMatch(/Pay ₹/); expect(!!ex.$("#paygo")).toBe(false);
    o.world.now = T; await published(o, "PG-PL4", {}, { name: "Done Deal" }); const t4 = await linkOf(o, "PG-PL4"); o.world.raw.prepare("UPDATE engagement SET pack=100 WHERE id='PG-PL4'").run();
    expect(await (await pl(o, t4)).waitFor((x) => /already paid for/.test(x))).toBeTruthy();
    expect(await (await pl(o, "f".repeat(48))).waitFor((x) => /not working/.test(x))).toBeTruthy();
    expect(await (await pl(o, "")).waitFor((x) => /not working/.test(x))).toBeTruthy();
  });
});

describe("sign-in has one way: the e-mail (no Google button, even when the server has a Google client id)", () => {
  const GID = "test-id.apps.googleusercontent.com";
  const signin = async (o: O) => openPage(o.world, { url: "http://localhost/signin.html?t=abc", html: "signin.html", scripts: ["google.js", "signin.js"] });
  test("the one-tap page shows only its own button; no Google button, nothing is loaded from Google, with or without a client id", async () => {
    for (const env of [{}, { GOOGLE_CLIENT_ID: GID }]) {
      const o = await organizer(env); const p = await signin(o); await p.waitFor((x) => /Sign me in/.test(x)); await new Promise((r) => setTimeout(r, 300));
      expect(p.text()).not.toMatch(/Continue with Google/); expect((p.$("#gWrap") as any).hidden).toBe(true);
      expect(Array.from(p.win.document.querySelectorAll("script")).some((s: any) => /google/.test(s.src || ""))).toBe(false);
    }
  });
  test("the home page Log in sheet has the e-mail box and no Google button, with a client id", async () => {
    const o = await organizer({ GOOGLE_CLIENT_ID: GID });
    const home = await openPage(o.world, { url: "http://localhost/#login", html: "index.html", scripts: ["keep.js", "common.js", "google.js", "site.js"], session: { "cbz-next": "/zc.html" } }); open.push(home); // a flow is waiting (a demo, a payment): only then does the game open its own sheet; a bare #login goes to the console
    await new Promise((r) => setTimeout(r, 600));
    const t = home.win.document.body.textContent || "";
    expect(t).not.toMatch(/Continue with Google/); expect(t).toMatch(/Type your e-mail and press Continue/); expect(home.errors).toEqual([]);
  });
});

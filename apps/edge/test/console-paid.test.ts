// OWNER RULES v1.1 (20 Nov 2026), item 5: payment is only through the console. The console calls Moneypenny, then tells this game with a SIGNED "paid" notice (bridge contract v1, act "paid").
// The game accepts it ONCE per order id, rejects a forged or replayed notice, and the draw may start only when the game is paid.
// The bridge is dark without CONSOLE_PUBKEYS. Old payment routes answer 302 to the console only when PAY_VIA_CONSOLE=1 (nothing is deleted).
// FALSIFIED BY: the 3 planted breaks listed in docs/STATE.md (paid notice marks twice; unpaid game draws; forged signature accepted)
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { handle } from "./with-terms";
import type { PayEnv } from "../src/pay";
import { makeD1 } from "./d1-sqlite";
import { makeKeyPair, signAssertion, b64uEncode, type Payload } from "../src/console-bridge/assertion";
import { drawTick } from "../src/draw";
import { consoleAdapter, payInfo } from "../src/console-adapter";
import { roundMs } from "../src/lifecycle";
import { drawTiming } from "../src/lifecycle";
import { legacyPayRedirect } from "../src/console-bridge/bridge";
import { CONSOLE_ORIGIN, LEGACY_PAY_EXTRA, HOME_ORIGIN, signinRedirect } from "../src/console-origin";

const T = Date.UTC(2026, 10, 20, 10, 0, 0), GEN = 1692803367;
const roundAt = (ms: number) => Math.floor((ms / 1000 - GEN) / 3) + 1;
const ORIGIN = "https://luckydraw.test";
const sha = async (s: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))), (b) => b.toString(16).padStart(2, "0")).join("");
let env: PayEnv; let raw: ReturnType<typeof makeD1>["raw"]; let ipN = 0; let kp: Awaited<ReturnType<typeof makeKeyPair>>; let other: Awaited<ReturnType<typeof makeKeyPair>>;
const realFetch = globalThis.fetch;
const call = (now: number, method: string, path: string, body?: unknown, key?: string, extraEnv: Record<string, string> = {}) =>
  handle(new Request("http://x" + path, { method, headers: { "content-type": "application/json", ...(key ? { "x-organizer": key } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) }), { ...(env as any), ...extraEnv }, now);
const j = async (r: Response) => (await r.json()) as any;
let jtiN = 0;
const note = async (o: { sub: string; eid: string; now?: number; key?: CryptoKey; kid?: string; aud?: string; act?: string; exp?: number }) => {
  const iat = Math.floor((o.now ?? T) / 1000), pl = { v: 1, kid: o.kid ?? "k1", aud: o.aud ?? ORIGIN, sub: o.sub, act: o.act ?? "paid", eid: o.eid, jti: "jti-" + String(++jtiN).padStart(16, "0"), iat, exp: o.exp ?? iat + 60 } as Payload;
  return signAssertion(pl, o.key ?? kp.privateKey);
};
const paid = (a: string, eid: string, orderRef: string, item = "100", now = T) => call(now, "POST", "/api/console/paid", { assertion: a, eid, item, orderRef }, undefined, {});
async function game(email: string, o: { id: string; cap?: number; mode?: "auto" | "manual" } ) {
  const st = await j(await handle(new Request("http://x/api/start", { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": `8.8.8.${++ipN}` }, body: JSON.stringify({ email }) }), env as any, T));
  const key = st.token as string;
  expect((await call(T, "POST", "/api/z", { id: o.id, startRound: roundAt(T) + 1200, callSeconds: 12, cap: o.cap ?? 100, whoCanJoin: "list", verify: "id", idKind: "emp" }, key)).status).toBe(200);
  expect((await call(T, "POST", `/api/z/${o.id}/drawset`, { winners: 1, prizes: [], mode: o.mode ?? "auto" }, key)).status).toBe(200);
  return { key, sub: await sha("email|" + email) };
}
const packOf = (id: string) => (raw.prepare("SELECT pack FROM engagement WHERE id=?").get(id) as any).pack as number;
beforeEach(async () => {
  const d = makeD1(); raw = d.raw; kp = await makeKeyPair(); other = await makeKeyPair();
  env = { DB: d.db, ORGANIZER_SECRET: "plat", RUNNER_KEY: "test-runner-key-test-runner-key-test0000", DAILY_WRITE_BUDGET: "1000000", PUBLIC_ORIGIN: ORIGIN, PHONE_SALT: "salt", CONSOLE_PUBKEYS: "k1:" + kp.publicB64u } as any;
  (globalThis as any).fetch = async () => new Response("{}", { status: 404 });
});
afterEach(() => { globalThis.fetch = realFetch; });

describe("the bridge is dark until the owner switches it on", () => {
  test("without CONSOLE_PUBKEYS every /api/console route answers the game's normal 404", async () => {
    const r = await call(T, "POST", "/api/console/paid", { assertion: "x", eid: "A-1", item: "100", orderRef: "ord-0001" }, undefined, { CONSOLE_PUBKEYS: "" });
    expect(r.status).toBe(404); expect((await j(r)).error).toBe("Not found");
  });
  test("capabilities tell the console the game, its sizes and that the invite is by ID", async () => {
    const r = await call(T, "GET", "/api/console/capabilities"); expect(r.status).toBe(200);
    const c = await j(r); expect(c.game).toBe("luckydraw"); expect(c.origin).toBe(ORIGIN); expect(c.sizes.some((s: any) => s.pack === 100)).toBe(true); expect(c.options.startOptions).toEqual(["auto", "manual"]);
  });
});

describe("the signed paid notice: once per order id", () => {
  test("a good notice marks the game paid; the same order id again answers repeat and changes nothing", async () => {
    const g = await game("pay1@acme.com", { id: "PAY-1" });
    expect(packOf("PAY-1")).toBe(0);
    const r1 = await paid(await note({ sub: g.sub, eid: "PAY-1" }), "PAY-1", "ord-0001"); expect(r1.status).toBe(200); expect(await j(r1)).toMatchObject({ ok: true, repeat: false, eid: "PAY-1" });
    expect(packOf("PAY-1")).toBe(100);
    const paidby = raw.prepare("SELECT v FROM kv WHERE k='paidby/PAY-1'").get() as any; expect(JSON.parse(paidby.v).via).toBe("console");
    const r2 = await paid(await note({ sub: g.sub, eid: "PAY-1" }), "PAY-1", "ord-0001"); expect(r2.status).toBe(200); expect(await j(r2)).toMatchObject({ ok: true, repeat: true });
    expect(raw.prepare("SELECT COUNT(*) AS c FROM console_paid WHERE order_ref='ord-0001'").get()).toEqual({ c: 1 });
  });
  test("the very same signed notice used twice is refused as replayed (one use of the assertion)", async () => {
    const g = await game("pay2@acme.com", { id: "PAY-2" }); const a = await note({ sub: g.sub, eid: "PAY-2" });
    expect((await paid(a, "PAY-2", "ord-0002")).status).toBe(200);
    const again = await paid(a, "PAY-2", "ord-0003"); expect(again.status).toBe(401); expect((await j(again)).error).toBe("replayed");
    expect(raw.prepare("SELECT COUNT(*) AS c FROM console_paid").get()).toEqual({ c: 1 });
  });
  test("a forged notice (signed with a key the game does not know, or a changed body) is refused and nothing is marked paid", async () => {
    const g = await game("pay3@acme.com", { id: "PAY-3" });
    const forged = await paid(await note({ sub: g.sub, eid: "PAY-3", key: other.privateKey }), "PAY-3", "ord-0004"); expect(forged.status).toBe(401); expect((await j(forged)).error).toBe("bad_assertion");
    const a = await note({ sub: g.sub, eid: "PAY-3" }), [v, p, s] = a.split("."); const body = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(p!.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0))));
    const tampered = `${v}.${b64uEncode(new TextEncoder().encode(JSON.stringify({ ...body, eid: "OTHER-9" })))}.${s}`;
    expect((await paid(tampered, "PAY-3", "ord-0005")).status).toBe(401);
    expect((await paid(await note({ sub: g.sub, eid: "PAY-3", kid: "k9" }), "PAY-3", "ord-0006")).status).toBe(401); // a key id the game does not know
    expect(packOf("PAY-3")).toBe(0);
  });
  test("a notice for another game's address, another purpose, a stale time or another game is refused", async () => {
    const g = await game("pay4@acme.com", { id: "PAY-4" });
    expect((await j(await paid(await note({ sub: g.sub, eid: "PAY-4", aud: "https://bingo.corporatetambola.com" }), "PAY-4", "ord-0007"))).error).toBe("wrong_audience");
    expect((await j(await paid(await note({ sub: g.sub, eid: "PAY-4", act: "games" }), "PAY-4", "ord-0008"))).error).toBe("wrong_act");
    expect((await j(await paid(await note({ sub: g.sub, eid: "PAY-4", now: T - 3_600_000 }), "PAY-4", "ord-0009"))).error).toBe("expired");
    expect((await j(await paid(await note({ sub: g.sub, eid: "PAY-4" }), "PAY-9", "ord-0010"))).error).toBe("wrong_act"); // the notice names another game than the request
    expect(packOf("PAY-4")).toBe(0);
  });
  test("the game decides from its own tables: another person's game, a wrong size, a free game, a cancelled game are all refused, definitely (nothing changed)", async () => {
    const g = await game("pay5@acme.com", { id: "PAY-5" }); const stranger = await game("pay6@acme.com", { id: "PAY-6" });
    const a1 = await paid(await note({ sub: stranger.sub, eid: "PAY-5" }), "PAY-5", "ord-0011"); expect(a1.status).toBe(409); expect(await j(a1)).toMatchObject({ error: "game_refused", definite: "true" });
    const a2 = await paid(await note({ sub: g.sub, eid: "PAY-5" }), "PAY-5", "ord-0012", "500"); expect(a2.status).toBe(409); expect((await j(a2)).error).toBe("game_refused");
    const free = await game("pay7@acme.com", { id: "PAY-7", cap: 10 }); const a3 = await paid(await note({ sub: free.sub, eid: "PAY-7" }), "PAY-7", "ord-0013"); expect(a3.status).toBe(409);
    raw.run("UPDATE engagement SET cancelled_ms=? WHERE id='PAY-5'", [T]); const a4 = await paid(await note({ sub: g.sub, eid: "PAY-5" }), "PAY-5", "ord-0014"); expect(a4.status).toBe(409);
    expect(packOf("PAY-5")).toBe(0); expect(raw.prepare("SELECT COUNT(*) AS c FROM console_paid").get()).toEqual({ c: 0 }); // a refusal leaves no order row: the console may repeat with a good one
  });
  test("a second order id for a game that is already paid is refused (money is never counted twice)", async () => {
    const g = await game("pay8@acme.com", { id: "PAY-8" });
    expect((await paid(await note({ sub: g.sub, eid: "PAY-8" }), "PAY-8", "ord-0015")).status).toBe(200);
    const second = await paid(await note({ sub: g.sub, eid: "PAY-8" }), "PAY-8", "ord-0016"); expect(second.status).toBe(409); expect(await j(second)).toMatchObject({ error: "game_refused", definite: "true" });
  });
});

describe("the game starts only when it is paid", () => {
  const T2 = T + 3600_000 + 60_000; // after the draw time
  test("an unpaid game is not drawn by the tick or by Start; after the paid notice it is (two minutes later, as with every late payment)", async () => {
    const g = await game("start1@acme.com", { id: "ST-1", mode: "auto" });
    await call(T, "POST", "/api/z/ST-1/publish", { email: "start1@acme.com", phone: "98765 43210" }, g.key); // published, not paid
    expect((await call(T, "POST", "/api/z/ST-1/join", { empId: "E1", device: "a".repeat(32) })).status).toBeLessThan(500);
    const e0 = raw.prepare("SELECT * FROM engagement WHERE id='ST-1'").get() as any; expect(e0.pack).toBe(0);
    expect(await drawTick(env as any, T2, (e) => drawTiming(env as any, e, T2))).toBe(0);
    expect((raw.prepare("SELECT drawn_ms FROM draw WHERE eid='ST-1'").get() as any).drawn_ms).toBeNull();
    const manual = await game("start2@acme.com", { id: "ST-2", mode: "manual" });
    const press = await call(T2, "POST", "/api/z/ST-2/drawnow", {}, manual.key); expect(press.status).toBe(402); expect((await j(press)).error).toMatch(/paid/);
    // paid through the console: now the game may start
    expect((await paid(await note({ sub: g.sub, eid: "ST-1", now: T2 }), "ST-1", "ord-0020", "100", T2)).status).toBe(200);
    expect(packOf("ST-1")).toBe(100);
    const restart = (raw.prepare("SELECT start_round FROM engagement WHERE id='ST-1'").get() as any).start_round; expect(restart).toBeGreaterThan(roundAt(T2)); // the draw comes 2 minutes after the payment
  });
});

describe("old payment and login routes go to the console and to home, behind a flag, and nothing is deleted", () => {
  const req = (p: string, method = "GET") => new Request("https://luckydraw.test" + p, { method });
  const go = (p: string, flag: string | undefined, method = "GET") => legacyPayRedirect(req(p, method), { flag, consoleOrigin: CONSOLE_ORIGIN, extra: LEGACY_PAY_EXTRA });
  test("flag off: nothing moves; flag on: pay, paylink and paytest pages (both spellings) and the old pay routes answer 302 to the console", () => {
    for (const p of ["/pay.html", "/paylink.html", "/paytest.html", "/pay", "/paylink", "/paytest", "/api/checkout", "/api/z/AB-12/pay-with-credit", "/api/payments/verify", "/api/z/AB-12/paylink"]) { expect([p, go(p, undefined)]).toEqual([p, null]); const r = go(p, "1", p.startsWith("/api") ? "POST" : "GET")!; expect([p, r?.status, r?.headers.get("location")]).toEqual([p, 302, CONSOLE_ORIGIN + "/"]); }
  });
  test("Razorpay's own notice to the game is never redirected (money already paid must still be recorded)", () => { expect(go("/api/payments/webhook", "1", "POST")).toBeNull(); });
  test("the old sign-in page goes to home with the flag on, except the console's one-time hand-off landing", () => {
    expect(signinRedirect(req("/signin.html"), undefined)).toBeNull();
    const r = signinRedirect(req("/signin.html"), "1")!; expect(r.status).toBe(302); expect(r.headers.get("location")).toBe(HOME_ORIGIN + "/");
    expect(signinRedirect(req("/signin?foo=1"), "1")!.status).toBe(302);
    expect(signinRedirect(req("/signin.html?t=" + "a1".repeat(24) + "&go=console&e=AB-12"), "1")).toBeNull();
  });
  test("through the Worker with the flag on, an old pay route answers 302 and the data stays", async () => {
    const g = await game("flag1@acme.com", { id: "FL-1" });
    const r = await call(T, "POST", "/api/checkout", { eid: "FL-1" }, g.key, { PAY_VIA_CONSOLE: "1" }); expect(r.status).toBe(302); expect(r.headers.get("location")).toBe(CONSOLE_ORIGIN + "/");
    expect((await call(T, "GET", "/api/z/FL-1/summary", undefined, g.key, { PAY_VIA_CONSOLE: "1" })).status).toBe(200);
  });
});

describe("the console's hand-off: the organizer arrives from the console, not from a sign-in of this game", () => {
  test("a signed session notice gives an organizer key; a hand-off address redeems once into a key that works; a second try is refused", async () => {
    const g = await game("hand1@acme.com", { id: "HO-1" });
    const ses = await call(T, "POST", "/api/console/session", { assertion: await note({ sub: g.sub, eid: "", act: "session" }) });
    expect(ses.status).toBe(200); const sj = await j(ses); expect(sj.organizer.key).toMatch(/^cbk_[0-9a-f]{48}$/);
    const ho = await call(T, "POST", "/api/console/handoff", { eid: "HO-1", target: "organizer" }, sj.organizer.key); expect(ho.status).toBe(200);
    const url = new URL((await j(ho)).url); expect(url.pathname).toBe("/signin.html"); expect(url.searchParams.get("go")).toBe("console");
    const tok = url.searchParams.get("t")!;
    const red = await call(T, "POST", "/api/console/handoff/redeem", { t: tok }); expect(red.status).toBe(200); const rj = await j(red);
    expect(rj.eid).toBe("HO-1");
    expect((await call(T, "GET", "/api/whoami", undefined, rj.key)).status).toBe(200); // the key made by the hand-off is an ordinary organizer key of this game
    expect((await call(T, "GET", "/api/z/HO-1/summary", undefined, rj.key)).status).toBe(200);
    const again = await call(T, "POST", "/api/console/handoff/redeem", { t: tok }); expect(again.status).toBe(401);
  });
  test("the old platform key and a stranger's key never open a hand-off", async () => {
    const g = await game("hand2@acme.com", { id: "HO-2" }); const other = await game("hand3@acme.com", { id: "HO-3" });
    expect((await call(T, "POST", "/api/console/handoff", { eid: "HO-2", target: "organizer" }, "plat")).status).toBe(403);
    expect((await call(T, "POST", "/api/console/handoff", { eid: "HO-2", target: "organizer" }, other.key)).status).toBe(403);
    void g;
  });
});

// AUDIT M1: a paid notice that stopped half way must be finishable by repeating it. The console repo is fixing the bridge so that it repeats a stuck order; this game's own side is made safe for that.
// FALSIFIED BY: (1) the game saves the size and then the notes in the old order with a throw in between and a repeat that says "already paid" (the repeat then failed), (2) a repeat that moves the draw time again, (3) a second order accepted on a paid game.
describe("markPaid: repeatable, recoverable, never resets", () => {
  /** A database that makes one write fail on purpose: the first write whose first bound value starts with `startsWith`. */
  const flaky = (startsWith: string) => { let armed = true; const db = env.DB; return { prepare: (sql: string) => { const st = db.prepare(sql); return { ...st, bind: (...v: unknown[]) => { const b = st.bind(...v); return { ...b, run: async () => { if (armed && typeof v[0] === "string" && v[0].startsWith(startsWith) && /INTO kv/.test(sql)) { armed = false; throw new Error("disk full"); } return b.run(); } }; } }; }, batch: db.batch } as any; };
  const args = (g: { sub: string }, eid: string, orderRef: string, nowMs: number, item = "100") => ({ eid, sub: g.sub, item, orderRef, nowMs });
  const snap = (eid: string) => JSON.stringify([raw.prepare("SELECT * FROM engagement WHERE id=?").get(eid), raw.prepare("SELECT k, v FROM kv WHERE k IN (?,?) ORDER BY k").all(`pub/${eid}`, `paidby/${eid}`)]);
  test("the size is saved, the note write fails (not a refusal); the SAME call repeated an hour later finishes it, and a third repeat changes nothing", async () => {
    const g = await game("rec1@acme.com", { id: "REC-1" });
    raw.run("UPDATE engagement SET start_round=? WHERE id='REC-1'", [roundAt(T) - 100]); // already past its start: a late payment moves the draw to 2 minutes after the payment
    await expect(consoleAdapter(T).markPaid!({ ...env, DB: flaky("paidby/") } as any, args(g, "REC-1", "ord-r001", T))).rejects.toThrow("disk full");
    expect(packOf("REC-1")).toBe(100); // the half-done state the audit found: paid, but the notes are missing
    expect(raw.prepare("SELECT COUNT(*) AS c FROM kv WHERE k='paidby/REC-1'").get()).toEqual({ c: 0 });
    const restart = (raw.prepare("SELECT start_round FROM engagement WHERE id='REC-1'").get() as any).start_round;
    expect(restart).toBeGreaterThan(roundAt(T)); // the new draw time was set in the SAME statement as the size
    await consoleAdapter(T + 3_600_000).markPaid!(env as any, args(g, "REC-1", "ord-r001", T + 3_600_000)); // one hour later, the console repeats the order
    expect(JSON.parse((raw.prepare("SELECT v FROM kv WHERE k='paidby/REC-1'").get() as any).v)).toMatchObject({ via: "console", order: "ord-r001" });
    expect(raw.prepare("SELECT COUNT(*) AS c FROM kv WHERE k='pub/REC-1'").get()).toEqual({ c: 1 });
    expect((raw.prepare("SELECT start_round FROM engagement WHERE id='REC-1'").get() as any).start_round).toBe(restart); // a repeat NEVER moves the draw time again
    const done = snap("REC-1");
    await consoleAdapter(T + 9_000_000).markPaid!(env as any, args(g, "REC-1", "ord-r001", T + 9_000_000)); expect(snap("REC-1")).toBe(done); // a completed order repeated: nothing changes
  });
  test("a failure before the size is saved leaves the game unpaid and the repeat does the whole job once", async () => {
    const g = await game("rec2@acme.com", { id: "REC-2" });
    const real = env.DB; let n = 0;
    const dying = { prepare: (sql: string) => { const st = real.prepare(sql); return { ...st, bind: (...v: unknown[]) => { const b = st.bind(...v); return { ...b, run: async () => { if (/^UPDATE engagement SET pack=/.test(sql) && n++ === 0) throw new Error("network"); return b.run(); } }; } }; }, batch: real.batch } as any;
    await expect(consoleAdapter(T).markPaid!({ ...env, DB: dying } as any, args(g, "REC-2", "ord-r002", T))).rejects.toThrow("network");
    expect(packOf("REC-2")).toBe(0);
    await consoleAdapter(T).markPaid!(env as any, args(g, "REC-2", "ord-r002", T)); expect(packOf("REC-2")).toBe(100);
    expect(raw.prepare("SELECT COUNT(*) AS c FROM kv WHERE k IN ('pub/REC-2','paidby/REC-2')").get()).toEqual({ c: 2 });
  });
  test("on a repeat the owner and the size are still checked (definite refusal), and a DIFFERENT order on a paid game is refused (nothing changes, the credits can go back)", async () => {
    const g = await game("rec3@acme.com", { id: "REC-3" }), other = await game("rec4@acme.com", { id: "REC-4" });
    await consoleAdapter(T).markPaid!(env as any, args(g, "REC-3", "ord-r003", T)); const done = snap("REC-3");
    const def = async (p: Promise<unknown>) => { try { await p; return "no refusal"; } catch (e: any) { return e?.definite === true ? "definite" : "other"; } };
    expect(await def(consoleAdapter(T).markPaid!(env as any, args(other, "REC-3", "ord-r003", T)))).toBe("definite"); // another person's account
    expect(await def(consoleAdapter(T).markPaid!(env as any, args(g, "REC-3", "ord-r003", T, "250")))).toBe("definite"); // a wrong size
    expect(await def(consoleAdapter(T).markPaid!(env as any, args(g, "REC-3", "ord-r999", T)))).toBe("definite"); // a second order
    expect(snap("REC-3")).toBe(done);
  });
  test("two calls of the same order at the same moment: the game is paid once and both answer", async () => {
    const g = await game("rec5@acme.com", { id: "REC-5" });
    raw.run("UPDATE engagement SET start_round=? WHERE id='REC-5'", [roundAt(T) - 100]);
    await Promise.all([consoleAdapter(T).markPaid!(env as any, args(g, "REC-5", "ord-r005", T)), consoleAdapter(T).markPaid!(env as any, args(g, "REC-5", "ord-r005", T))]);
    expect(packOf("REC-5")).toBe(100); expect(raw.prepare("SELECT COUNT(*) AS c FROM kv WHERE k='paidby/REC-5'").get()).toEqual({ c: 1 });
  });
});

describe("payInfo: read only, owner, item (the size), paid", () => {
  test("the owner sees {owner:true, item, paid}; a stranger and a missing game both see the same nothing; nothing is written", async () => {
    const g = await game("pi1@acme.com", { id: "PI-1" }), s = await game("pi2@acme.com", { id: "PI-2" });
    const before = JSON.stringify(raw.prepare("SELECT * FROM engagement ORDER BY id").all()) + JSON.stringify(raw.prepare("SELECT k,v FROM kv ORDER BY k").all());
    expect(await payInfo(env as any, { eid: "PI-1", sub: g.sub })).toEqual({ owner: true, item: "100", paid: false });
    expect(await payInfo(env as any, { eid: "PI-1", sub: s.sub })).toEqual({ owner: false, item: null, paid: false });
    expect(await payInfo(env as any, { eid: "NO-SUCH", sub: g.sub })).toEqual({ owner: false, item: null, paid: false });
    expect(await consoleAdapter(T).payInfo(env as any, { eid: "PI-1", sub: g.sub })).toEqual({ owner: true, item: "100", paid: false }); // it is on the adapter the bridge is given
    expect(JSON.stringify(raw.prepare("SELECT * FROM engagement ORDER BY id").all()) + JSON.stringify(raw.prepare("SELECT k,v FROM kv ORDER BY k").all())).toBe(before);
    await consoleAdapter(T).markPaid!(env as any, { eid: "PI-1", sub: g.sub, item: "100", orderRef: "ord-p001", nowMs: T });
    expect(await payInfo(env as any, { eid: "PI-1", sub: g.sub })).toEqual({ owner: true, item: "100", paid: true });
  });
  test("a free game (up to the free size) has no item", async () => {
    const g = await game("pi3@acme.com", { id: "PI-3", cap: 10 });
    expect(await payInfo(env as any, { eid: "PI-3", sub: g.sub })).toEqual({ owner: true, item: null, paid: false });
  });
});
void roundMs;

// AUDIT M-A (second audit of 42ae412): the vendored bridge answered 409 `in_progress` for ever to a repeat of an order whose first try ended "unclear" (the row stays `marking`), so a customer could be charged with the game unpaid.
// The game now drops a `marking` row older than 60 seconds before the bridge looks (markPaid is safe to repeat); the bridge still checks the signature of the repeat.
// FALSIFIED BY (planted, saw both tests fail, restored): removing sweepStaleMarking from worker.ts; sweeping rows of any age (the fresh-row test).
describe("a paid notice whose first try stopped half way can be repeated (M-A)", () => {
  beforeEach(() => { raw.prepare("CREATE TABLE IF NOT EXISTS console_paid (order_ref TEXT PRIMARY KEY, eid TEXT NOT NULL, state TEXT NOT NULL, at_ms INTEGER NOT NULL)").run(); });
  test("a stale `marking` row: the repeat with a fresh signed notice is done for real, the game becomes paid, the order is stored once", async () => {
    const g = await game("stuck1@acme.com", { id: "STK-1" });
    raw.prepare("INSERT INTO console_paid(order_ref,eid,state,at_ms) VALUES('ord-stuck1','STK-1','marking',?)").run(T - 3_600_000); // the first try, one hour ago, ended "unclear"
    expect(packOf("STK-1")).toBe(0);
    const r = await paid(await note({ sub: g.sub, eid: "STK-1" }), "STK-1", "ord-stuck1");
    expect(r.status).toBe(200); expect(await j(r)).toMatchObject({ ok: true, repeat: false, eid: "STK-1" });
    expect(packOf("STK-1")).toBe(100);
    expect(raw.prepare("SELECT state FROM console_paid WHERE order_ref='ord-stuck1'").get()).toEqual({ state: "paid" });
    const again = await paid(await note({ sub: g.sub, eid: "STK-1" }), "STK-1", "ord-stuck1"); expect(again.status).toBe(200); expect((await j(again)).repeat).toBe(true);
  });
  test("a fresh `marking` row (a first try that may still be running) is NOT dropped: the repeat still answers in_progress", async () => {
    const g = await game("stuck2@acme.com", { id: "STK-2" });
    raw.prepare("INSERT INTO console_paid(order_ref,eid,state,at_ms) VALUES('ord-stuck2','STK-2','marking',?)").run(T - 5_000);
    const r = await paid(await note({ sub: g.sub, eid: "STK-2" }), "STK-2", "ord-stuck2");
    expect(r.status).toBe(409); expect((await j(r)).error).toBe("in_progress"); expect(packOf("STK-2")).toBe(0);
  });
  test("the sweep never makes a forged repeat work: a stale row, a notice signed with another key, the game stays unpaid", async () => {
    const g = await game("stuck3@acme.com", { id: "STK-3" });
    raw.prepare("INSERT INTO console_paid(order_ref,eid,state,at_ms) VALUES('ord-stuck3','STK-3','marking',?)").run(T - 3_600_000);
    const r = await paid(await note({ sub: g.sub, eid: "STK-3", key: other.privateKey }), "STK-3", "ord-stuck3");
    expect(r.status).toBe(401); expect(packOf("STK-3")).toBe(0);
  });
});
describe("go-live health: TEST_OPEN_JOIN must not be set (audit L-1)", () => {
  test("health fails and names the variable when it is set; a normal environment is clean", async () => {
    const { goLiveState } = await import("../src/console-origin");
    expect(goLiveState({ TEST_OPEN_JOIN: "1" }).problems.join(" ")).toMatch(/TEST_OPEN_JOIN/);
    expect(goLiveState({}).problems).toEqual([]);
    const bad = await j(await call(T, "GET", "/api/status/health", undefined, undefined, { TEST_OPEN_JOIN: "1" })); // the real health route
    expect(bad.ok).toBe(false); expect(bad.go_live.problems.join(" ")).toMatch(/TEST_OPEN_JOIN/);
    const good = await j(await call(T, "GET", "/api/status/health", undefined, undefined, { TEST_OPEN_JOIN: "", CONSOLE_PUBKEYS: "" })); expect(good.go_live.problems).toEqual([]); expect(good.ok).toBe(true);
  });
});

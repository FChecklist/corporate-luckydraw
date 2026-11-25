// "Notify me when this game begins" (1.6.0), the server side (apps/edge/src/push.ts). A fake alert service stands in for corporate-push: no real message is ever sent.
// What these tests prove: nothing is read, written or sent unless BOTH PUSH_URL (a real https address) and PUSH_ADMIN_KEY are set; the game is marked once when it really starts (automatic: the draw time; manual: the press of Start);
// ONE /send per game (also when two scheduled runs overlap), with the pages of 40 browsers followed up to the cap and no retry; a too-old start is never announced; the key is never in a body, a link, a log or the database;
// a /purge goes out whenever the game's data is deleted (erasePersonal: direct, the organizer's own erase, the scheduled 24-hour job).
// FALSIFIED BY (planted, saw these tests fail, restored): removing the markGameStarted call in runDraw (auto and manual each); removing the claim UPDATE in pushTick; removing the pushSettings() guard in each of the three functions;
// removing the purgeGamePush call in erasePersonal; sending the key in the body.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { handle } from "./with-terms";
import type { PayEnv } from "../src/pay";
import { makeD1 } from "./d1-sqlite";
import { drawTick, runDraw } from "../src/draw";
import { drawTiming, erasePersonal, roundMs } from "../src/lifecycle";
import { PUSH_BODY, PUSH_MAX_PAGES, PUSH_SCHEMA, PUSH_STALE_MS, PUSH_TITLE, gameLink, markGameStarted, purgeGamePush, pushSettings, pushTick } from "../src/push";

const T = Date.UTC(2026, 10, 20, 10, 0, 0);
const GEN = 1692803367;
const roundOfMs = (ms: number) => Math.floor((ms / 1000 - GEN) / 3) + 1;
const KEY = "k-9f3a7c1d5b2e48a6-ABCDEFGHIJKLMNOP"; // a made-up test key (32+ characters like the real one; not a real secret)
const PUSH = "https://push.test";
const ORIGIN = "https://luckydraw.test";
const EID = "PUSH-1";
let env: PayEnv; let raw: ReturnType<typeof makeD1>["raw"]; let ipN = 0; let asked: (number | "latest")[] = [];
interface Seen { url: string; method: string; headers: Record<string, string>; redirect?: string; body: any; raw: string }
let pushSeen: Seen[] = []; let otherSeen: string[] = [];
/** What the fake alert service answers to the n-th /send (1 based). */
let sendAnswer: (n: number, body: any) => { status: number; json?: any } | "throw" = () => ({ status: 200, json: { ok: true, sent: 3, gone: 0, failed: 0, campaign: "c1", next_after_id: null } });
const realFetch = globalThis.fetch;
const realLog = { log: console.log, info: console.info, warn: console.warn, error: console.error, debug: console.debug };
let logged: string[] = [];

const hex64 = (n: number) => (n.toString(16).padStart(8, "0") + "ab".repeat(28)).slice(0, 64);
const beacon = () => ({ fetchRound: (async (r: number | "latest") => { asked.push(r); return { round: r as number, signature: "00", randomness: hex64(Number(r) * 7919) }; }) as any });
const call = (now: number, method: string, path: string, body?: unknown, key?: string, extra: Record<string, string> = {}) =>
  handle(new Request("http://x" + path, { method, headers: { "content-type": "application/json", ...(key ? { "x-organizer": key } : {}), ...extra }, body: body === undefined ? undefined : JSON.stringify(body) }), env as any, now);
const j = async (r: Response) => (await r.json()) as any;
const dev = (i: number) => (String(i).padStart(2, "0") + "d".repeat(32)).slice(0, 32);
const sends = () => pushSeen.filter((s) => s.url.endsWith("/send"));
const purges = () => pushSeen.filter((s) => s.url.endsWith("/purge"));
const row = (eid = EID) => raw.query("SELECT push_due_ms, push_sent_ms, drawn_ms, freeze_ms FROM draw WHERE eid=?").get(eid) as { push_due_ms: number | null; push_sent_ms: number | null; drawn_ms: number | null; freeze_ms: number | null };
const live = (extra: Record<string, unknown> = {}) => { env = { ...env, PUSH_URL: PUSH, PUSH_ADMIN_KEY: KEY, ...extra } as PayEnv; };
const tick = (now: number) => drawTick(env as any, now, async (e) => drawTiming(env as any, e, now), beacon());

/** A game with a few people, paid, with a draw set. mode "auto": starts by itself at the draw time. mode "manual": starts when the organizer presses Start. */
async function setup(opts: { mode?: "auto" | "manual"; id?: string } = {}) {
  const id = opts.id ?? EID;
  const st = await j(await handle(new Request("http://x/api/start", { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": `7.7.8.${++ipN}` }, body: JSON.stringify({ email: `demo${ipN}@demo-test.invalid` }) }), env as any, T));
  const key = st.token as string, start = roundOfMs(T) + 1200;
  expect((await call(T, "POST", "/api/z", { id, startRound: start, callSeconds: 12, cap: 100, whoCanJoin: "list", verify: "id", idKind: "emp" }, key)).status).toBe(200);
  expect((await call(T, "POST", `/api/z/${id}/drawset`, { winners: 1, prizes: [], mode: opts.mode ?? "auto" }, key)).status).toBe(200);
  await call(T, "POST", `/api/z/${id}/publish`, { email: "demo1@demo-test.invalid", phone: "98765 43210" }, key);
  const ids = Array.from({ length: 4 }, (_, i) => `P${1000 + i}`);
  expect((await call(T, "POST", `/api/z/${id}/people`, { people: ids.map((empId) => ({ empId })) }, key)).status).toBe(200);
  for (let i = 0; i < ids.length; i++) expect((await call(T, "POST", `/api/z/${id}/join`, { empId: ids[i], device: dev(i + 1) })).status).toBe(200);
  raw.run("UPDATE engagement SET pack=100 WHERE id=?", [id]);
  const e = raw.query("SELECT * FROM engagement WHERE id=?").get(id) as any;
  return { key, e, id, drawMs: roundMs(e.start_round) };
}

beforeEach(() => {
  const d = makeD1(); raw = d.raw; asked = []; pushSeen = []; otherSeen = []; logged = [];
  sendAnswer = () => ({ status: 200, json: { ok: true, sent: 3, gone: 0, failed: 0, campaign: "c1", next_after_id: null } });
  env = { DB: d.db, ORGANIZER_SECRET: "plat", RUNNER_KEY: "test-runner-key-test-runner-key-test0000", DAILY_WRITE_BUDGET: "1000000", PUBLIC_ORIGIN: ORIGIN, PHONE_SALT: "salt", CRON_KEY: "cron-key-cron-key-cron-key-0001" } as any;
  (globalThis as any).fetch = async (url: any, init?: any) => {
    const u = String(typeof url === "string" ? url : url?.url ?? url);
    if (u.startsWith(PUSH)) {
      const rawBody = typeof init?.body === "string" ? init.body : "";
      const headers: Record<string, string> = {}; for (const [k, v] of Object.entries(init?.headers ?? {})) headers[k.toLowerCase()] = String(v);
      const seen: Seen = { url: u, method: String(init?.method ?? "GET"), headers, redirect: init?.redirect, body: rawBody ? JSON.parse(rawBody) : null, raw: rawBody };
      pushSeen.push(seen);
      if (u.endsWith("/send")) { const a = sendAnswer(sends().length, seen.body); if (a === "throw") throw new Error("the service is down"); return new Response(JSON.stringify(a.json ?? {}), { status: a.status }); }
      return new Response(JSON.stringify({ ok: true, purged: 2 }), { status: 200 });
    }
    otherSeen.push(u);
    return new Response("{}", { status: 404 });
  };
  for (const k of Object.keys(realLog) as (keyof typeof realLog)[]) (console as any)[k] = (...a: unknown[]) => { logged.push(a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ")); };
});
afterEach(() => { globalThis.fetch = realFetch; Object.assign(console, realLog); try { raw?.close(); } catch { /* already closed */ } });

describe("the settings: dark unless both are real", () => {
  test("pushSettings: both needed; https only; no sign-in part, query or fragment; a dotted host; a trailing slash is trimmed; the key is trimmed", () => {
    expect(pushSettings({})).toBeNull();
    expect(pushSettings({ PUSH_URL: PUSH })).toBeNull();
    expect(pushSettings({ PUSH_ADMIN_KEY: KEY })).toBeNull();
    expect(pushSettings({ PUSH_URL: PUSH, PUSH_ADMIN_KEY: "   " })).toBeNull();
    expect(pushSettings({ PUSH_URL: "  ", PUSH_ADMIN_KEY: KEY })).toBeNull();
    expect(pushSettings({ PUSH_URL: "http://push.test", PUSH_ADMIN_KEY: KEY })).toBeNull();
    expect(pushSettings({ PUSH_URL: "https://user:pw@push.test", PUSH_ADMIN_KEY: KEY })).toBeNull();
    expect(pushSettings({ PUSH_URL: "https://push.test/?a=1", PUSH_ADMIN_KEY: KEY })).toBeNull();
    expect(pushSettings({ PUSH_URL: "https://push.test/#x", PUSH_ADMIN_KEY: KEY })).toBeNull();
    expect(pushSettings({ PUSH_URL: "https://localhost", PUSH_ADMIN_KEY: KEY })).toBeNull();
    expect(pushSettings({ PUSH_URL: "push.test", PUSH_ADMIN_KEY: KEY })).toBeNull();
    expect(pushSettings({ PUSH_URL: "https://push.test/api///", PUSH_ADMIN_KEY: `  ${KEY}  ` })).toEqual({ base: "https://push.test/api", key: KEY });
    expect(pushSettings({ PUSH_URL: PUSH, PUSH_ADMIN_KEY: KEY })).toEqual({ base: PUSH, key: KEY });
  });
  test("the game link is the link a player opens: the game's own origin, the page z.html and the id (made safe)", () => {
    expect(gameLink({ PUBLIC_ORIGIN: ORIGIN }, "ABC-1")).toBe(`${ORIGIN}/z.html?e=ABC-1`);
    expect(gameLink({ PUBLIC_ORIGIN: "http://insecure.test" }, "ABC-1")).toMatch(/^https:\/\/[^/]+\/z\.html\?e=ABC-1$/); // never a plain-http link
    expect(gameLink({ PUBLIC_ORIGIN: ORIGIN }, "a b&c")).toBe(`${ORIGIN}/z.html?e=a%20b%26c`);
  });
  test("the words of the message fit the service's limits (title 80, body 200) and use no 'your' or 'my'", () => {
    expect(PUSH_TITLE.length).toBeLessThanOrEqual(80); expect(PUSH_BODY.length).toBeLessThanOrEqual(200);
    expect(`${PUSH_TITLE} ${PUSH_BODY}`).not.toMatch(/\b(your|yours|my|mine)\b/i);
  });
  test("the database change file and PUSH_SCHEMA say the same two columns", () => {
    expect(PUSH_SCHEMA).toEqual(["ALTER TABLE draw ADD COLUMN push_due_ms INTEGER", "ALTER TABLE draw ADD COLUMN push_sent_ms INTEGER"]);
  });
});

describe("dark: nothing is marked, nothing is sent, nothing is deleted at the service (and the game still plays)", () => {
  const DARK: [string, Record<string, string | undefined>][] = [
    ["neither setting", {}],
    ["only the address", { PUSH_URL: PUSH }],
    ["only the key", { PUSH_ADMIN_KEY: KEY }],
    ["an empty key", { PUSH_URL: PUSH, PUSH_ADMIN_KEY: "   " }],
    ["an address that is not https", { PUSH_URL: "http://push.test", PUSH_ADMIN_KEY: KEY }],
    ["an address with a sign-in part", { PUSH_URL: "https://user:pw@push.test", PUSH_ADMIN_KEY: KEY }],
    ["an address that is not an address", { PUSH_URL: "push", PUSH_ADMIN_KEY: KEY }],
  ];
  for (const [name, extra] of DARK) {
    test(`${name}: an automatic game is drawn, no mark, no /send, and erasing the game's data calls no /purge`, async () => {
      env = { ...env, ...extra } as PayEnv;
      const g = await setup({ mode: "auto" });
      expect(await tick(g.drawMs + 5_000)).toBe(1);
      expect(row().drawn_ms).not.toBeNull(); // the draw itself is not affected
      expect(row().push_due_ms).toBeNull(); expect(row().push_sent_ms).toBeNull();
      expect(await pushTick(env, g.drawMs + 60_000)).toBe(0);
      await erasePersonal(env as any, g.id, g.drawMs + 30 * 3_600_000, "auto");
      await purgeGamePush(env, g.id); await markGameStarted(env as any, g.id, g.drawMs);
      expect(row().push_due_ms).toBeNull();
      expect(pushSeen).toEqual([]);
    });
  }
  test("neither setting: a manual game's press of Start marks nothing either", async () => {
    const g = await setup({ mode: "manual" });
    const r = await call(T + 5_000, "POST", `/api/z/${g.id}/drawnow`, {}, g.key);
    expect(r.status).toBe(200);
    expect(row().freeze_ms).not.toBeNull(); expect(row().push_due_ms).toBeNull();
    expect(await pushTick(env, T + 600_000)).toBe(0); expect(pushSeen).toEqual([]);
  });
});

describe("one message when the game really starts", () => {
  test("an automatic game: nothing before the draw time; at the draw time the game is marked once; the scheduled run sends ONE /send with the right body, headers and link", async () => {
    live();
    const g = await setup({ mode: "auto" });
    expect(await tick(g.drawMs - 10_000)).toBe(0); // the draw time has not come
    expect(row().push_due_ms).toBeNull();
    expect(await pushTick(env, g.drawMs - 9_000)).toBe(0); expect(pushSeen).toEqual([]);
    const at = g.drawMs + 5_000;
    expect(await tick(at)).toBe(1);
    expect(row().push_due_ms).toBe(at); // the mark is written inside the draw; nothing was sent there
    expect(pushSeen).toEqual([]);
    expect(await pushTick(env, at + 20_000)).toBe(1);
    expect(sends().length).toBe(1);
    const s = sends()[0]!;
    expect(s.url).toBe(`${PUSH}/send`); expect(s.method).toBe("POST");
    expect(s.headers["authorization"]).toBe(`Bearer ${KEY}`); expect(s.headers["content-type"]).toBe("application/json");
    expect(s.redirect).toBe("error"); // the key never follows a redirect
    expect(s.body).toEqual({ scope: `game:${g.id}`, kind: "game_begins", title: PUSH_TITLE, body: PUSH_BODY, url: `${ORIGIN}/z.html?e=${g.id}` });
    expect(row().push_sent_ms).toBe(at + 20_000);
    // later runs do nothing more for this game
    expect(await pushTick(env, at + 80_000)).toBe(0); expect(await pushTick(env, at + 3 * 60_000)).toBe(0);
    expect(sends().length).toBe(1);
  });
  test("a manual game: the list open = nothing; the press of Start marks it (once; a second press changes nothing); the draw that follows adds no second message", async () => {
    live();
    const g = await setup({ mode: "manual" });
    expect(await tick(g.drawMs + 5_000)).toBe(0); // "the game starts when you press Start": the clock alone does not start it
    expect(row().push_due_ms).toBeNull(); expect(await pushTick(env, g.drawMs + 6_000)).toBe(0);
    const press = T + 5_000;
    const r = await call(press, "POST", `/api/z/${g.id}/drawnow`, {}, g.key);
    expect(r.status).toBe(200); expect((await j(r)).pending).toBe(true);
    expect(row().push_due_ms).toBe(press);
    await call(press + 9_000, "POST", `/api/z/${g.id}/drawnow`, {}, g.key); // the second press (the public beacon is not reachable here, so it answers 'try again'); the mark is what matters
    expect(row().push_due_ms).toBe(press); // the first press stands
    expect(await pushTick(env, press + 30_000)).toBe(1);
    expect(sends().length).toBe(1); expect(sends()[0]!.body.scope).toBe(`game:${g.id}`);
    const later = press + 3 * 60_000;
    expect(await tick(later)).toBe(1); expect(row().drawn_ms).not.toBeNull(); // the draw itself is made
    expect(await pushTick(env, later + 60_000)).toBe(0);
    expect(sends().length).toBe(1);
  });
  test("two scheduled runs at the same moment send ONE message (the claim is a single changed row)", async () => {
    live();
    const g = await setup({ mode: "auto" });
    const at = g.drawMs + 5_000; await tick(at);
    const [a, b] = await Promise.all([pushTick(env, at + 20_000), pushTick(env, at + 20_000)]);
    expect(a + b).toBe(1);
    expect(sends().length).toBe(1);
  });
  test("two games that started: each gets its own one message with its own scope and link", async () => {
    live();
    const a = await setup({ mode: "auto", id: "PUSH-A1" });
    const b = await setup({ mode: "auto", id: "PUSH-B2" });
    const at = Math.max(a.drawMs, b.drawMs) + 5_000;
    expect(await tick(at)).toBe(2);
    expect(await pushTick(env, at + 10_000)).toBe(2);
    expect(sends().map((s) => s.body.scope).sort()).toEqual(["game:PUSH-A1", "game:PUSH-B2"]);
    expect(sends().map((s) => s.body.url).sort()).toEqual([`${ORIGIN}/z.html?e=PUSH-A1`, `${ORIGIN}/z.html?e=PUSH-B2`]);
  });
  test("the whole scheduled job (POST /api/lifecycle/tick with the cron key) draws and then sends, once", async () => {
    live();
    const g = await setup({ mode: "auto" });
    const at = g.drawMs + 5_000;
    // the cron call fetches the real public beacon, which the stand-in answers with 404, so the draw cannot be made here; mark the start the way the draw does and let the same call send
    await markGameStarted(env as any, g.id, at);
    const r = await handle(new Request("http://x/api/lifecycle/tick", { method: "POST", headers: { "x-cron-key": "cron-key-cron-key-cron-key-0001" } }), env as any, at + 15_000);
    expect(r.status).toBe(200);
    expect(sends().length).toBe(1); expect(row().push_sent_ms).toBe(at + 15_000);
    const r2 = await handle(new Request("http://x/api/lifecycle/tick", { method: "POST", headers: { "x-cron-key": "cron-key-cron-key-cron-key-0001" } }), env as any, at + 75_000);
    expect(r2.status).toBe(200); expect(sends().length).toBe(1);
  });
});

describe("what happens when the service pages, fails or is slow", () => {
  test("pages of 40 are followed with after_id until the service has no next one", async () => {
    live();
    sendAnswer = (n) => ({ status: 200, json: { ok: true, sent: 40, gone: 0, failed: 0, campaign: "c1", next_after_id: n === 1 ? 41 : n === 2 ? 87 : null } });
    const g = await setup({ mode: "auto" }); const at = g.drawMs + 5_000; await tick(at);
    expect(await pushTick(env, at + 5_000)).toBe(1);
    expect(sends().length).toBe(3);
    expect(sends()[0]!.body.after_id).toBeUndefined(); expect(sends()[1]!.body.after_id).toBe(41); expect(sends()[2]!.body.after_id).toBe(87);
    for (const s of sends()) expect(s.body).toMatchObject({ scope: `game:${g.id}`, kind: "game_begins", title: PUSH_TITLE, body: PUSH_BODY });
  });
  test("a service that always says 'more' is stopped at the cap of calls, never a loop", async () => {
    live();
    sendAnswer = (n) => ({ status: 200, json: { ok: true, sent: 40, gone: 0, failed: 0, campaign: "c1", next_after_id: n * 40 } });
    const g = await setup({ mode: "auto" }); const at = g.drawMs + 5_000; await tick(at);
    await pushTick(env, at + 5_000);
    expect(sends().length).toBe(PUSH_MAX_PAGES);
  });
  test("a refusal (500, 401, ok:false) or a broken answer ends the sending at once and is NOT retried: not now, not in the next run", async () => {
    for (const ans of [{ status: 500, json: { error: "x" } }, { status: 401, json: { error: "no" } }, { status: 200, json: { ok: false, next_after_id: 5 } }, { status: 200, json: { ok: true, next_after_id: "5" } }, { status: 200, json: null }] as const) {
      pushSeen = []; const d = makeD1(); raw = d.raw; env = { ...env, DB: d.db } as PayEnv; live();
      sendAnswer = () => ans as any;
      const g = await setup({ mode: "auto" }); const at = g.drawMs + 5_000; await tick(at);
      expect(await pushTick(env, at + 5_000)).toBe(1);
      expect(sends().length).toBe(1);
      expect(row().push_sent_ms).toBe(at + 5_000); // claimed: it is never tried again
      expect(await pushTick(env, at + 65_000)).toBe(0); expect(sends().length).toBe(1);
    }
  });
  test("a service that is down (the call throws) stops quietly; the draw's result is untouched; no retry", async () => {
    live();
    sendAnswer = () => "throw";
    const g = await setup({ mode: "auto" }); const at = g.drawMs + 5_000; await tick(at);
    const drawnBefore = row().drawn_ms;
    expect(await pushTick(env, at + 5_000)).toBe(1);
    expect(sends().length).toBe(1);
    expect(row().drawn_ms).toBe(drawnBefore);
    expect(await pushTick(env, at + 65_000)).toBe(0); expect(sends().length).toBe(1);
  });
  test("a start more than 2 hours old is never announced (it is claimed so it is not looked at again)", async () => {
    live();
    const g = await setup({ mode: "auto" }); const at = g.drawMs + 5_000; await tick(at);
    expect(await pushTick(env, at + PUSH_STALE_MS + 1_000)).toBe(1);
    expect(sends()).toEqual([]);
    expect(row().push_sent_ms).toBe(at + PUSH_STALE_MS + 1_000);
    expect(await pushTick(env, at + PUSH_STALE_MS + 61_000)).toBe(0);
  });
  test("a start just inside the 2 hours is announced", async () => {
    live();
    const g = await setup({ mode: "auto" }); const at = g.drawMs + 5_000; await tick(at);
    expect(await pushTick(env, at + PUSH_STALE_MS - 1_000)).toBe(1);
    expect(sends().length).toBe(1);
  });
  test("a game id the service would refuse is claimed and never sent", async () => {
    live();
    const g = await setup({ mode: "auto" }); const at = g.drawMs + 5_000; await tick(at);
    raw.run("UPDATE draw SET eid=? WHERE eid=?", ["bad id/with spaces", g.id]);
    expect(await pushTick(env, at + 5_000)).toBe(1);
    expect(sends()).toEqual([]);
  });
});

describe("the key", () => {
  test("never in a body, a link, a log line, the database rows of the game, or an answer to the browser", async () => {
    live();
    sendAnswer = (n) => (n === 1 ? { status: 200, json: { ok: true, next_after_id: 7 } } : { status: 500, json: { error: `denied ${KEY}` } });
    const g = await setup({ mode: "auto" }); const at = g.drawMs + 5_000; await tick(at);
    await pushTick(env, at + 5_000);
    await erasePersonal(env as any, g.id, at + 30 * 3_600_000, "auto");
    expect(pushSeen.length).toBeGreaterThanOrEqual(3);
    for (const s of pushSeen) { expect(s.url).not.toContain(KEY); expect(s.raw).not.toContain(KEY); expect(s.headers["authorization"]).toBe(`Bearer ${KEY}`); for (const [k, v] of Object.entries(s.headers)) if (k !== "authorization") expect(v).not.toContain(KEY); }
    expect(logged.join("\n")).not.toContain(KEY);
    expect(JSON.stringify(raw.query("SELECT * FROM draw").all())).not.toContain(KEY);
    expect(JSON.stringify(raw.query("SELECT * FROM kv").all())).not.toContain(KEY);
    for (const path of [`/api/z/${g.id}`, `/api/z/${g.id}/draw`, "/api/status/health"]) { const r = await call(at + 30 * 3_600_000, "GET", path, undefined, g.key); expect(await r.text()).not.toContain(KEY); }
  });
});

describe("when the game's data is deleted, the saved browser addresses are deleted too", () => {
  test("erasePersonal calls POST /purge once with the game's scope and the key only in the header", async () => {
    live();
    const g = await setup({ mode: "auto" });
    await erasePersonal(env as any, g.id, T + 1_000, "organizer");
    expect(purges().length).toBe(1);
    const p = purges()[0]!;
    expect(p.url).toBe(`${PUSH}/purge`); expect(p.method).toBe("POST");
    expect(p.headers["authorization"]).toBe(`Bearer ${KEY}`); expect(p.redirect).toBe("error");
    expect(p.body).toEqual({ scope: `game:${g.id}` });
    expect(sends()).toEqual([]);
  });
  test("the organizer's own 'delete everything' (POST /api/z/:id/erase) purges and still answers as before", async () => {
    live();
    const g = await setup({ mode: "auto" });
    const r = await call(T + 10_000, "POST", `/api/z/${g.id}/erase`, {}, g.key);
    expect(r.status).toBe(200); const b = await j(r); expect(b.ok).toBe(true); expect(b.erased).toBe(4);
    expect(purges().length).toBe(1); expect(purges()[0]!.body).toEqual({ scope: `game:${g.id}` });
  });
  test("the scheduled 24-hour job (a cancelled game, 20 hours after the cancel) purges; a minute after the cancel it does not", async () => {
    live();
    const g = await setup({ mode: "auto" });
    raw.run("UPDATE engagement SET cancelled_ms=? WHERE id=?", [T + 1_000, g.id]);
    const tickAt = (now: number) => handle(new Request("http://x/api/lifecycle/tick", { method: "POST", headers: { "x-cron-key": "cron-key-cron-key-cron-key-0001" } }), env as any, now);
    expect((await tickAt(T + 120_000)).status).toBe(200);
    expect(purges()).toEqual([]);
    expect((await tickAt(T + 21 * 3_600_000)).status).toBe(200);
    expect(purges().length).toBe(1); expect(purges()[0]!.body).toEqual({ scope: `game:${g.id}` });
    expect((raw.query("SELECT COUNT(*) AS c FROM participant WHERE eid=?").get(g.id) as any).c).toBe(0); // the game's own data really went
  });
  test("a service that is down does not stop the deletion: the game's data is still deleted", async () => {
    live();
    const g = await setup({ mode: "auto" });
    (globalThis as any).fetch = async () => { throw new Error("the service is down"); };
    await erasePersonal(env as any, g.id, T + 1_000, "organizer");
    expect((raw.query("SELECT COUNT(*) AS c FROM participant WHERE eid=?").get(g.id) as any).c).toBe(0);
  });
  test("a game id the service would refuse is never put in a /purge scope", async () => {
    live();
    await purgeGamePush(env, "x y/../z"); await purgeGamePush(env, "");
    expect(purges()).toEqual([]);
  });
});

describe("the draw itself is never held up by the alert", () => {
  test("runDraw by hand for an already drawn game changes no push column and sends nothing", async () => {
    live();
    const g = await setup({ mode: "auto" }); const at = g.drawMs + 5_000; await tick(at);
    const due = row().push_due_ms;
    const again = await runDraw(env as any, g.e, at + 10_000, { drawRound: g.e.start_round, paused: false }, "auto", beacon());
    expect(again.ok).toBe(true);
    expect(row().push_due_ms).toBe(due); expect(pushSeen).toEqual([]);
  });
  test("a service that never answers cannot slow the draw: the draw makes no call to it at all", async () => {
    live();
    (globalThis as any).fetch = async () => { throw new Error("no call to the alert service may be made inside the draw"); };
    const g = await setup({ mode: "auto" }); const at = g.drawMs + 5_000;
    expect(await tick(at)).toBe(1);
    expect(row().drawn_ms).not.toBeNull(); expect(row().push_due_ms).toBe(at);
  });
});

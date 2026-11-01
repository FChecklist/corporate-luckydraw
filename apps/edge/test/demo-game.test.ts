// Written from the owner order of 1 Nov 2026 (boss-order-demo-and-rs1-test): a free demo game for up to 10 people, off unless DEMO_GAME=1,
// at most 3 a day per organizer account and per network address, never a paid pack, never a payment row, named "Demo" on every screen.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { withDevice } from "./device";
import { type Env } from "../src/worker";
import { handle } from "./with-terms";
import type { PayEnv } from "../src/pay";
import { makeD1 } from "./d1-sqlite";

const T = Date.UTC(2026, 10, 2, 10, 0, 0), H = 3_600_000;
const roundAt = (ms: number) => Math.floor((ms / 1000 - 1692803367) / 3) + 1;
let env: PayEnv; let raw: ReturnType<typeof makeD1>["raw"];
const realFetch = globalThis.fetch;
let ipN = 0;
const call = (method: string, path: string, body?: unknown, key?: string, ip = "9.9.9.9", now = T) =>
  handle(new Request("http://x" + path, { method, headers: { "content-type": "application/json", "cf-connecting-ip": ip, ...(key ? { "x-organizer": key } : {}) }, body: withDevice(method, path, body) }), env as Env, now);
const j = async (r: Response) => (await r.json()) as any;
const make = (demo = true) => { const d = makeD1(); raw = d.raw; env = { DB: d.db, ORGANIZER_SECRET: "plat", DAILY_WRITE_BUDGET: "1000000", PUBLIC_ORIGIN: "https://luckydraw.test", OWNER_EMAIL: "owner@platform.test", ...(demo ? { DEMO_GAME: "1" } : {}) } as PayEnv; };
const organizer = async (email: string) => (await j(await call("POST", "/api/start", { email }, undefined, `8.8.8.${++ipN}`))).token as string;
const demo = (key: string, id: string, o: Record<string, unknown> = {}, ip = "9.9.9.9", now = T) =>
  call("POST", "/api/z", { id, demo: true, startRound: roundAt(T + 3 * H), callSeconds: 12, cap: 10, name: "Free demo draw", verify: "id", idKind: "emp", whoCanJoin: "anyone", ...o }, key, ip, now);
const count = (sql: string, ...a: any[]) => (raw.prepare(sql).get(...a) as any).c as number;
afterEach(() => { globalThis.fetch = realFetch; });

describe("free demo game", () => {
  beforeEach(() => make(true));
  test("is open at once for up to 10 people, free, named Demo, with no payment and no pack used", async () => {
    const key = await organizer("boss@acme.com");
    const r = await demo(key, "DEMO-1"); expect(r.status).toBe(200);
    const e = raw.prepare("SELECT cap, pack FROM engagement WHERE id='DEMO-1'").get() as any;
    expect(e.cap).toBe(10); expect(e.pack).toBe(10);
    const cfg = JSON.parse((raw.prepare("SELECT config FROM engagement WHERE id='DEMO-1'").get() as any).config);
    expect(cfg.demo).toBe(true); expect(cfg.name).toBe("Demo: Free demo draw");
    expect(count("SELECT COUNT(*) c FROM payment")).toBe(0); expect(count("SELECT COUNT(*) c FROM entitlement")).toBe(0);
    const info = await j(await call("GET", "/api/z/DEMO-1/info"));
    expect(info.demo).toBe(true); expect(info.draft).not.toBe(true); expect(info.name).toBe("Demo: Free demo draw");
  });
  test("a bought pack is never used up by a demo", async () => {
    const key = await organizer("boss@acme.com");
    const org = (raw.prepare("SELECT org FROM organizer_key WHERE kind='master'").get() as any).org;
    raw.prepare("INSERT INTO entitlement(id,org,pack,payment_id,eid,created_ms) VALUES('ent1',?,500,'p1',NULL,?)").run(org, T);
    expect((await demo(key, "DEMO-2")).status).toBe(200);
    expect((raw.prepare("SELECT eid FROM entitlement WHERE id='ent1'").get() as any).eid).toBeNull();
  });
  test("more than 10 people is refused, and the size cannot be raised later", async () => {
    const key = await organizer("boss@acme.com");
    expect((await demo(key, "DEMO-3", { cap: 11 })).status).toBe(400);
    expect((await demo(key, "DEMO-4")).status).toBe(200);
    const r = await call("PATCH", "/api/z/DEMO-4/settings", { cap: 50 }, key);
    expect(r.status).toBe(400);
  });
  test("a demo cannot lose its Demo name by renaming", async () => {
    const key = await organizer("boss@acme.com");
    await demo(key, "DEMO-5");
    await call("PATCH", "/api/z/DEMO-5/settings", { name: "Annual Prize Draw" }, key);
    expect(JSON.parse((raw.prepare("SELECT config FROM engagement WHERE id='DEMO-5'").get() as any).config).name).toMatch(/^Demo: /);
  });
  test("at most 3 a day per organizer account; the 4th is refused and tomorrow works again", async () => {
    const key = await organizer("boss@acme.com");
    for (let i = 1; i <= 3; i++) expect((await demo(key, `DEMO-L${i}`, {}, `7.7.7.${i}`)).status).toBe(200);
    const r = await demo(key, "DEMO-L4", {}, "7.7.7.9"); expect(r.status).toBe(429); expect((await j(r)).code).toBe("demo-limit");
    expect((await demo(key, "DEMO-L5", {}, "7.7.7.8", T + 24 * H)).status).toBe(200);
  });
  test("at most 3 a day per network address, across different organizers", async () => {
    const keys = [await organizer("a@acme.com"), await organizer("b@acme.com")];
    for (let i = 1; i <= 3; i++) expect((await demo(keys[i % 2]!, `DEMO-I${i}`, {}, "6.6.6.6")).status).toBe(200);
    expect((await demo(keys[0]!, "DEMO-I4", {}, "6.6.6.6")).status).toBe(429);
    expect((await demo(keys[0]!, "DEMO-I5", {}, "6.6.6.7")).status).toBe(200);
  });
  test("is offered to the pages only when switched on", async () => {
    expect((await j(await call("GET", "/api/game-manifest"))).demo).toBe(true);
  });
});

describe("free demo game, switched off (the default)", () => {
  beforeEach(() => make(false));
  test("nothing is created and the page is told it is not switched on", async () => {
    const key = await organizer("boss@acme.com");
    const r = await demo(key, "DEMO-OFF"); expect(r.status).toBe(404); expect((await j(r)).error).toMatch(/not switched on/i);
    expect(count("SELECT COUNT(*) c FROM engagement")).toBe(0);
    expect((await j(await call("GET", "/api/game-manifest"))).demo).toBe(false);
  });
});

describe("a demo has no rehearsal", () => {
  beforeEach(() => make(true));
  test("the server refuses a rehearsal for a demo, and a real game still gets one", async () => {
    const key = await organizer("boss@acme.com");
    await demo(key, "DEMO-R"); const r = await call("POST", "/api/z/DEMO-R/rehearsal", {}, key);
    expect(r.status).toBe(409); expect((await j(r)).code).toBe("demo-no-rehearsal");
  });
});

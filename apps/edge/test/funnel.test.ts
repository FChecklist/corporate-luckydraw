// Funnel events (core 0.9.8): POST /stats/e is off unless FUNNEL=1, keeps fixed fields only, never logs personal details; the browser reporter respects Global Privacy Control.
import { beforeEach, afterEach, describe, expect, test } from "bun:test";
import { handle, type Env } from "../src/worker";
import { makeReporter } from "../../../vendor/game-core/packages/core/src/funnel";
import { makeD1 } from "./d1-sqlite";

const T = Date.UTC(2026, 9, 1, 10, 0, 0);
let env: Record<string, unknown>; let logs: string[]; const real = console.log;
const post = (body: unknown) => handle(new Request("http://x/stats/e", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), env as unknown as Env, T);
const funnelLogs = () => logs.filter((l) => l.startsWith("funnel "));
beforeEach(() => { const d = makeD1(); env = { DB: d.db, ORGANIZER_SECRET: "plat", DATA_KEY: "k", TEST_MODE: "1" }; logs = []; console.log = (...a: unknown[]) => { logs.push(a.join(" ")); }; });
afterEach(() => { console.log = real; });

describe("POST /stats/e", () => {
  test("off when FUNNEL is not set: 204 and nothing logged", async () => {
    const r = await post({ event: "viewed", at: T, visit: "abc" }); expect(r.status).toBe(204); expect(funnelLogs()).toEqual([]);
  });
  test("on: a known event is logged with fixed fields only; personal details and unknown fields are dropped", async () => {
    env.FUNNEL = "1";
    const r = await post({ event: "game_created", at: T, visit: "v1", game: "luckydraw", size: 200, mode: "auto", email: "a@b.com", name: "Maya", phone: "9876543210", extra: "x" });
    expect(r.status).toBe(204); expect(funnelLogs().length).toBe(1);
    const o = JSON.parse(funnelLogs()[0]!.slice(7));
    expect(Object.keys(o).sort()).toEqual(["at", "event", "game", "mode", "size", "visit"]);
    expect(JSON.stringify(o)).not.toMatch(/a@b\.com|Maya|9876543210/);
  });
  test("on: an e-mail or long number in the game field is dropped; unknown events and bad bodies log nothing", async () => {
    env.FUNNEL = "1";
    await post({ event: "viewed", at: T, visit: "v", game: "me@x.com" }); expect(JSON.parse(funnelLogs()[0]!.slice(7)).game).toBeUndefined();
    await post({ event: "not_an_event", at: T, visit: "v" }); expect(funnelLogs().length).toBe(1);
    const bad = await handle(new Request("http://x/stats/e", { method: "POST", body: "{nope" }), env as unknown as Env, T); expect(bad.status).toBe(204); expect(funnelLogs().length).toBe(1);
  });
  test("the manifest says whether funnel is on", async () => {
    const get = async () => ((await (await handle(new Request("http://x/api/game-manifest"), env as unknown as Env, T)).json()) as any).funnel;
    expect(await get()).toBe(false); env.FUNNEL = "1"; expect(await get()).toBe(true);
  });
});

describe("the browser reporter", () => {
  test("Global Privacy Control: nothing is sent", () => {
    const sent: string[] = []; const r = makeReporter({ endpoint: "/stats/e", game: "luckydraw", nav: { globalPrivacyControl: true }, send: (_e, b) => { sent.push(b); } });
    expect(r.report("viewed")).toBe(false); expect(sent).toEqual([]);
  });
  test("without GPC: sent to the same-site path only, with no personal fields; a foreign endpoint sends nothing", () => {
    const sent: string[] = []; const r = makeReporter({ endpoint: "/stats/e", game: "luckydraw", nav: {}, send: (_e, b) => { sent.push(b); } });
    expect(r.report("payment_started", { email: "a@b.com", size: 50 })).toBe(true);
    const o = JSON.parse(sent[0]!); expect(o.email).toBeUndefined(); expect(o).toMatchObject({ event: "payment_started", game: "luckydraw", size: 50 });
    const f = makeReporter({ endpoint: "https://evil.example/e", game: "luckydraw", nav: {}, send: (_e, b) => { sent.push(b); } }); expect(f.report("viewed")).toBe(false); expect(sent.length).toBe(1);
  });
});

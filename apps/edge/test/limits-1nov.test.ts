// Owner decisions of 1 Nov 2026: a game may have up to 100,000 people (100,001 is refused politely);
// a participant may invite family: you and up to 4 family members (a 5th is refused politely).
import { describe, expect, test } from "bun:test";
import { withDevice } from "./device";
import { type Env } from "../src/worker";
import { handle } from "./with-terms";
import type { PayEnv } from "../src/pay";
import { makeD1 } from "./d1-sqlite";
import { validateCfg } from "../../../packages/beacon/src/config";

const T = Date.UTC(2026, 10, 2, 10, 0, 0), H = 3_600_000;
const roundAt = (ms: number) => Math.floor((ms / 1000 - 1692803367) / 3) + 1;
const d = makeD1();
const env = { DB: d.db, ORGANIZER_SECRET: "plat", DAILY_WRITE_BUDGET: "1000000", PUBLIC_ORIGIN: "https://luckydraw.test", OWNER_EMAIL: "owner@platform.test" } as PayEnv;
const call = (method: string, path: string, body?: unknown, key?: string) =>
  handle(new Request("http://x" + path, { method, headers: { "content-type": "application/json", "cf-connecting-ip": "9.9.9.9", ...(key ? { "x-organizer": key } : {}) }, body: withDevice(method, path, body) }), env as Env, T);
const j = async (r: Response) => (await r.json()) as any;

describe("people limit is 100,000", () => {
  test("100,000 is accepted when creating a game; 100,001 is refused with a friendly sentence naming 100,000", async () => {
    const key = (await j(await call("POST", "/api/start", { email: "boss@acme.com" }))).token as string;
    const mk = (id: string, cap: number) => call("POST", "/api/z", { id, startRound: roundAt(T + 3 * H), callSeconds: 12, cap, name: "Big", verify: "id", idKind: "emp", whoCanJoin: "anyone" }, key);
    expect((await mk("BIG-OK", 100000)).status).toBe(200);
    const r = await mk("BIG-NO", 100001); expect(r.status).toBe(400);
    const e = (await j(r)).error as string; expect(e).toContain("100,000"); expect(e.toLowerCase()).not.toContain("must");
    const s = await call("PATCH", "/api/z/BIG-OK/settings", { cap: 100001 }, key); expect(s.status).toBe(400); expect((await j(s)).error).toContain("100,000");
  });
});

describe("family: you and up to 4 family members", () => {
  test("up to 4 invitations each are accepted, a 5th number is refused politely", () => {
    expect(validateCfg({ invites: { on: true, per: 4, cats: ["family"] } }).ok).toBe(true);
    const r: any = validateCfg({ invites: { on: true, per: 5, cats: ["family"] } });
    expect(r.ok).toBe(false); expect(r.error).toContain("you and up to 4 family members");
  });
});

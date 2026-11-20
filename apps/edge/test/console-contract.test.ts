// AUDIT M4: the console's contract fixtures (copied into apps/edge/test/console-contract/) run against THIS game's real bridge, in process.
// The fixtures marked fakeOnly need the console's own fake game (it has the same people and games seeded); the other 14 are run here with the one person they need (alice) created in this game.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { handle } from "./with-terms";
import { makeD1 } from "./d1-sqlite";
// @ts-ignore the kit is plain JavaScript copied from the console repo
import { FIXTURES, makeCtx, runFixture, PEOPLE } from "./console-contract/kit.mjs";

const T = Date.UTC(2026, 10, 20, 10, 0, 0), ORIGIN = "https://luckydraw.test";
let env: any; const realFetch = globalThis.fetch;
beforeEach(async () => {
  const d = makeD1(); const ctx = await makeCtx();
  env = { DB: d.db, ORGANIZER_SECRET: "plat", RUNNER_KEY: "test-runner-key-test-runner-key-test0000", DAILY_WRITE_BUDGET: "1000000", PUBLIC_ORIGIN: ORIGIN, PHONE_SALT: "salt", CONSOLE_PUBKEYS: "k1:" + ctx.publicB64u };
  (globalThis as any).ctx = ctx;
});
afterEach(() => { globalThis.fetch = realFetch; });

describe("the console's contract fixtures, against this game", () => {
  test("every fixture that does not need the console's fake game passes (and the kit really signs and checks them)", async () => {
    const ctx = (globalThis as any).ctx;
    (globalThis as any).fetch = (url: string, init: any) => handle(new Request(url, init), env, T);
    // alice has an account in this game (the person the fixtures ask about)
    expect((await handle(new Request(ORIGIN + "/api/start", { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": "3.3.3.3" }, body: JSON.stringify({ email: PEOPLE.alice }) }), env, T)).status).toBe(200);
    const keyCache = {}; let ran = 0, skipped = 0; const bad: string[] = [];
    for (const fx of FIXTURES) {
      const r = await runFixture(fx, { ctx, origin: ORIGIN, nowMs: T, keyCache, fake: false });
      if (r.skipped) { skipped++; continue; }
      ran++; if (r.problems.length) bad.push(`${fx.name}: ${r.problems.join("; ")}`);
    }
    expect(bad).toEqual([]);
    expect(ran).toBeGreaterThanOrEqual(14); expect(ran + skipped).toBe(FIXTURES.length);
  });
});

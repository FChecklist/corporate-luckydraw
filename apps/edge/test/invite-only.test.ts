// AUDIT H2 (owner rule): a Lucky Draw is a closed group, by invitation, and people give an ID only. The SERVER makes it so, whatever a screen or an AI sends.
// This file runs WITHOUT the TEST_OPEN_JOIN switch the older engine tests use, so it sees exactly what production does.
// FALSIFIED BY: (1) the default closed flag back to open, (2) "anyone" accepted again, (3) verify "mobile" accepted again, (4) the join path that lets an unlisted ID in: each made a test below fail, then was restored.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { handle } from "./with-terms";
import { makeD1 } from "./d1-sqlite";
import { testOpenJoin } from "../src/invite-only";

const T = Date.UTC(2026, 10, 20, 10, 0, 0), GEN = 1692803367;
const roundAt = (ms: number) => Math.floor((ms / 1000 - GEN) / 3) + 1;
let env: any, raw: ReturnType<typeof makeD1>["raw"], ipN = 0;
const realFetch = globalThis.fetch;
const call = (method: string, path: string, body?: unknown, key?: string) => handle(new Request("http://x" + path, { method, headers: { "content-type": "application/json", ...(key ? { "x-organizer": key } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) }), env, T);
const j = async (r: Response) => (await r.json()) as any;
const dev = (i: number) => (String(i).padStart(2, "0") + "c".repeat(32)).slice(0, 32);
async function organizer() { const r = await j(await handle(new Request("http://x/api/start", { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": `5.5.5.${++ipN}` }, body: JSON.stringify({ email: `io${ipN}@demo-test.invalid` }) }), env, T)); return r.token as string; }
const base = { startRound: roundAt(T) + 1200, callSeconds: 12, cap: 100 };
beforeEach(() => { const d = makeD1(); raw = d.raw; env = { DB: d.db, ORGANIZER_SECRET: "plat", RUNNER_KEY: "test-runner-key-test-runner-key-test0000", DAILY_WRITE_BUDGET: "1000000", PUBLIC_ORIGIN: "https://luckydraw.test", PHONE_SALT: "salt" }; (globalThis as any).fetch = async () => new Response("{}", { status: 404 }); });
afterEach(() => { globalThis.fetch = realFetch; });

describe("a new game is a closed group, by ID, whatever is asked", () => {
  test("with nothing said about it, the game is made for the ID list and asks for an ID only", async () => {
    const k = await organizer();
    expect((await call("POST", "/api/z", { id: "IO-1", ...base }, k)).status).toBe(200);
    const e = raw.query("SELECT closed, config FROM engagement WHERE id='IO-1'").get() as any;
    expect(e.closed).toBe(1); expect(JSON.parse(e.config).verify).toBe("id");
    const info = await j(await call("GET", "/api/z/IO-1/summary", undefined, k)); expect(info.whoCanJoin).toBe("list"); expect(info.closed).toBe(true);
  });
  test("'anyone with the link', an open flag and every way of asking other than an ID are refused when a game is made", async () => {
    const k = await organizer();
    for (const [i, extra] of [{ whoCanJoin: "anyone" }, { closed: false }, { verify: "mobile" }, { verify: "either" }, { verify: "both" }, { whoCanJoin: "everyone" }].entries()) {
      const r = await call("POST", "/api/z", { id: `IO-X${i}`, ...base, ...extra }, k);
      expect([JSON.stringify(extra), r.status]).toEqual([JSON.stringify(extra), 400]);
      expect(["invite-only", "id-only"]).toContain((await j(r)).code);
      expect(raw.query("SELECT COUNT(*) AS c FROM engagement WHERE id=?").get(`IO-X${i}`)).toEqual({ c: 0 });
    }
    expect((await call("POST", "/api/z", { id: "IO-OK", ...base, whoCanJoin: "list", verify: "id" }, k)).status).toBe(200); // the console's own request still works
  });
  test("the same refusals when the settings are changed; the game stays closed, ID only", async () => {
    const k = await organizer(); await call("POST", "/api/z", { id: "IO-2", ...base }, k);
    for (const body of [{ whoCanJoin: "anyone" }, { closed: false }, { verify: "mobile" }]) expect([JSON.stringify(body), (await call("PATCH", "/api/z/IO-2/settings", body, k)).status]).toEqual([JSON.stringify(body), 400]);
    expect((await call("PATCH", "/api/z/IO-2/settings", { cap: 50, whoCanJoin: "list" }, k)).status).toBe(200);
    const e = raw.query("SELECT closed, config FROM engagement WHERE id='IO-2'").get() as any; expect(e.closed).toBe(1); expect(JSON.parse(e.config).verify).toBe("id");
  });
  test("an old game that was stored open is still a closed group: it says list, and an unlisted ID waits instead of coming in", async () => {
    const k = await organizer(); await call("POST", "/api/z", { id: "IO-3", ...base }, k);
    raw.run("UPDATE engagement SET closed=0 WHERE id='IO-3'"); raw.run("UPDATE engagement SET pack=100 WHERE id='IO-3'");
    expect((await j(await call("GET", "/api/z/IO-3/summary", undefined, k))).whoCanJoin).toBe("list");
    const r = await call("POST", "/api/z/IO-3/join", { empId: "Z-9", device: dev(1) });
    expect(r.status).toBe(403); expect((await j(r)).code).toBe("waiting");
    expect(raw.query("SELECT COUNT(*) AS c FROM seat WHERE eid='IO-3'").get()).toEqual({ c: 0 });
  });
});

describe("joining: only an ID on the list gets a place; a name or a mobile number is not a way in", () => {
  test("a listed ID joins; an unlisted ID waits; a name alone and a mobile number alone are refused and nobody gets a seat", async () => {
    const k = await organizer(); await call("POST", "/api/z", { id: "IO-4", ...base }, k);
    await call("POST", "/api/z/IO-4/publish", { email: "io@demo-test.invalid", phone: "98765 43210" }, k);
    expect((await call("POST", "/api/z/IO-4/people", { people: [{ empId: "L-1" }] }, k)).status).toBe(200);
    const first = await call("POST", "/api/z/IO-4/join", { empId: "l 1", device: dev(1) }); expect([first.status, (await j(first)).code]).toEqual([200, undefined]);
    const wait = await call("POST", "/api/z/IO-4/join", { empId: "U-2", device: dev(2) }); expect(wait.status).toBe(403); expect((await j(wait)).code).toBe("waiting");
    const nameOnly = await call("POST", "/api/z/IO-4/join", { name: "Asha Rao", device: dev(3) }); expect(nameOnly.status).toBe(400);
    const phone = await call("POST", "/api/z/IO-4/join", { phone: "9876543210", device: dev(4) }); expect(phone.status).toBe(400);
    expect(raw.query("SELECT COUNT(*) AS c FROM seat WHERE eid='IO-4'").get()).toEqual({ c: 1 });
  });
});

describe("the escape hatch for the older engine tests cannot be on in production", () => {
  test("TEST_OPEN_JOIN is off unless exactly '1' and is named in no deploy file", async () => {
    expect(testOpenJoin({})).toBe(false); expect(testOpenJoin({ TEST_OPEN_JOIN: "true" })).toBe(false); expect(testOpenJoin(undefined)).toBe(false);
    for (const f of ["apps/edge/wrangler.toml", "apps/cron/wrangler.toml", "pages/wrangler.toml", "apps/web/public/_headers"]) expect([f, (await Bun.file(new URL("../../../" + f, import.meta.url)).text()).includes("TEST_OPEN_JOIN")]).toEqual([f, false]);
  });
});

// AUDIT M1 of 9024db89: the wrong-ID guess limit was keyed on the exact network address text, so one IPv6 line (a whole /64, about 1.8e19 addresses) could change the last half of its address
// at every try and never be counted. Now an IPv6 address is cut to its /64 before it is hashed; an IPv4 address is unchanged. Also: a per-game ceiling on wrong IDs, the count is one atomic statement,
// a RIGHT ID is never counted and never limited (an office shares one address), and the "is this you?" answer never shows a name.
// FALSIFIED BY (planted, saw these tests fail, restored): netGroup() returning the address as typed (3 fail); a typed mobile number let through in a stored "mobile" game (the L1 test). NOT shown to fail: the atomic counter (the test database runs one statement at a time, so the parallel test passes either way; the statement itself is the guard on the real database).
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { handle, consentFor } from "./with-terms";
import type { PayEnv } from "../src/pay";
import { makeD1 } from "./d1-sqlite";
import { netGroup } from "../src/net-key";

const T = Date.UTC(2026, 9, 1, 10, 0, 0), GEN = 1692803367;
const START = Math.floor((T / 1000 - GEN) / 3) + 1 + 1200;
let env: PayEnv; let raw: ReturnType<typeof makeD1>["raw"]; let ipN = 0;
const realFetch = globalThis.fetch;
const call = (method: string, path: string, body?: unknown, key?: string, ip?: string) =>
  handle(new Request("http://x" + path, { method, headers: { "content-type": "application/json", ...(key ? { "x-organizer": key } : {}), ...(ip ? { "cf-connecting-ip": ip } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) }), env as any, T);
const j = async (r: Response) => (await r.json()) as any;
const who = (empId: string, ip: string) => call("POST", "/api/z/GL-1/who", { empId, consent: consentFor("K4") }, undefined, ip);
const join = (empId: string, ip: string, n = 1) => call("POST", "/api/z/GL-1/join", { empId, device: (String(n).padStart(8, "0") + "d".repeat(32)).slice(0, 32) }, undefined, ip);
const v6 = (n: number, net = "2001:db8:1:2") => `${net}:${(n >> 8 & 255).toString(16)}:${(n & 255).toString(16)}:${(n * 7 % 65536).toString(16)}:${(n * 13 % 65536).toString(16)}`; // n different addresses inside one /64

async function setup() {
  const st = await j(await handle(new Request("http://x/api/start", { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": `7.7.7.${++ipN}` }, body: JSON.stringify({ email: `o${ipN}@acme.com` }) }), env as any, T));
  const master = st.token as string;
  expect((await call("POST", "/api/z", { id: "GL-1", startRound: START, callSeconds: 6, cap: 100, whoCanJoin: "list", verify: "id" }, master)).status).toBe(200);
  await call("POST", "/api/z/GL-1/publish", { email: "boss@acme.com", phone: "98765 43210" }, master);
  expect((await call("POST", "/api/z/GL-1/people", { people: [{ name: "Asha Rao", empId: "E101" }] }, master)).status).toBe(200);
  return master;
}
beforeEach(() => { const d = makeD1(); raw = d.raw; env = { DB: d.db, ORGANIZER_SECRET: "plat", DAILY_WRITE_BUDGET: "10000000", PUBLIC_ORIGIN: "https://luckydraw.test", PHONE_SALT: "salt" } as any; (globalThis as any).fetch = async () => new Response("{}"); });
afterEach(() => { globalThis.fetch = realFetch; });

describe("the network a visitor counts as", () => {
  test("an IPv4 address is unchanged; an IPv6 address becomes its /64; every spelling of one /64 is the same", () => {
    expect(netGroup("203.0.113.7")).toBe("203.0.113.7");
    expect(netGroup(null)).toBe("local"); expect(netGroup("")).toBe("local");
    const a = netGroup("2001:db8:1:2:aaaa:bbbb:cccc:dddd");
    expect(a).toBe("v6/2001:db8:1:2");
    for (const same of ["2001:0DB8:0001:0002::1", "[2001:db8:1:2::ffff]", "2001:db8:1:2:0:0:0:0", "2001:db8:1:2::", "2001:db8:1:2:1:2:3:4%eth0"]) expect([same, netGroup(same)]).toEqual([same, a]);
    for (const other of ["2001:db8:1:3::1", "2001:db8:2:2::1", "2001:db9:1:2::1"]) expect(netGroup(other)).not.toBe(a);
    expect(netGroup("::ffff:203.0.113.7")).toBe("203.0.113.7"); // an IPv4 address written the IPv6 way is the same visitor
    expect(netGroup("not an address")).toBe("not an address");
  });
});

describe("wrong-ID guesses are limited per network, and an IPv6 /64 is one network", () => {
  test("45 wrong IDs from 45 different addresses inside ONE /64: 30 answered, then refused (fails without the /64 grouping)", async () => {
    await setup();
    const codes: number[] = [];
    for (let i = 0; i < 45; i++) codes.push((await who("X" + i, v6(i))).status);
    expect(codes.filter((c) => c === 200).length).toBe(30);
    expect(codes.filter((c) => c === 429).length).toBe(15);
    const r = await who("X99", v6(500)); expect(r.status).toBe(429); expect((await j(r)).code).toBe("too-many-tries");
  });
  test("the same through join: wrong IDs from one /64 wait in the waiting room only 30 times, then 429; another /64 is not affected", async () => {
    await setup();
    const codes: number[] = [];
    for (let i = 0; i < 40; i++) codes.push((await join("Y" + i, v6(i), i + 1)).status);
    expect(codes.filter((c) => c === 403).length).toBe(30); // "waiting": the organizer decides
    expect(codes.filter((c) => c === 429).length).toBe(10);
    expect((await join("Z1", v6(3, "2001:db8:1:3"), 60)).status).toBe(403); // another /64: its own allowance (waiting, not refused)
  });
  test("an IPv4 address behaves as before: 30, then refused; another IPv4 address is separate", async () => {
    await setup();
    const codes: number[] = [];
    for (let i = 0; i < 35; i++) codes.push((await who("X" + i, "203.0.113.9")).status);
    expect(codes.filter((c) => c === 200).length).toBe(30);
    expect((await who("X1", "203.0.113.10")).status).toBe(200);
  });
  test("the counter is one atomic statement: parallel wrong guesses cannot all slip under the limit", async () => {
    await setup();
    const rs = await Promise.all(Array.from({ length: 60 }, (_, i) => who("P" + i, "203.0.113.20")));
    expect(rs.filter((r) => r.status === 200).length).toBe(30);
    expect(rs.filter((r) => r.status === 429).length).toBe(30);
    expect(Number((raw.query("SELECT v FROM kv WHERE k LIKE 'idmiss/GL-1/%/all'").get() as any).v)).toBe(30);
  });
});

describe("a per-game ceiling on wrong IDs, whoever sends them", () => {
  test("after 500 wrong IDs in 10 minutes from many networks, a fresh network is refused too; a RIGHT ID still works", async () => {
    await setup();
    for (let i = 0; i < 500; i++) { const r = await who("W" + i, `2001:db8:${(i >> 4).toString(16)}:${i & 15}::1`); if (r.status !== 200) throw new Error("try " + i + " got " + r.status); }
    const over = await who("W-late", "198.51.100.77"); expect(over.status).toBe(429); expect((await j(over)).code).toBe("too-many-tries");
    expect(await j(await who("E101", "198.51.100.78"))).toEqual({ known: true }); // a right ID is never counted or limited
  });
});

describe("a right ID is never counted, and shows no name", () => {
  test("100 right IDs from one address: all answered 'known', none shows a name, and the wrong-ID counter stays at 0", async () => {
    await setup();
    for (let i = 0; i < 100; i++) { const r = await j(await who("e101", "203.0.113.30")); expect(r).toEqual({ known: true }); }
    expect((raw.query("SELECT COUNT(*) AS c FROM kv WHERE k LIKE 'idmiss/GL-1/%'").get() as any).c).toBe(0);
    expect((await join("E101", "203.0.113.30", 1)).status).toBe(200); // an office behind one address can still all join with their own right IDs
  });
});

describe("a stored game that still says 'mobile number' is treated as an ID game (audit L1)", () => {
  test("a listed mobile number plus any ID does not get a card", async () => {
    const master = await setup();
    const row = raw.query("SELECT config FROM engagement WHERE id='GL-1'").get() as any, cfg = JSON.parse(row.config || "{}"); cfg.verify = "mobile"; // a row made before 1.5.x: it asks for a mobile number
    raw.run("UPDATE engagement SET config=? WHERE id='GL-1'", [JSON.stringify(cfg)]);
    expect((await call("POST", "/api/z/GL-1/people", { people: [{ name: "Bala Nair", phone: "9811122233" }] }, master)).status).toBe(200);
    const r = await call("POST", "/api/z/GL-1/join", { phone: "9811122233", empId: "E999", device: "a".repeat(32) }, undefined, "203.0.113.40");
    expect(r.status).not.toBe(200);
    expect((raw.query("SELECT COUNT(*) AS c FROM seat WHERE eid='GL-1'").get() as any).c).toBe(0);
  });
});

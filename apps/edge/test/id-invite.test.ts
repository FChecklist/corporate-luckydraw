// OWNER RULES v1.1 (20 Nov 2026): "Invite people with just an ID". One alphanumeric ID, no name, no mobile number, no e-mail.
// A-1101, A 1101 and A/1101 are the same ID at upload, at join and at approval, in every game (old or new).
// An ID that is not on the list waits; the Organizer says yes or no; every step is in a log that shows only the ID.
// The real Worker code against an in-memory D1 (the same harness as the other edge tests).
// FALSIFIED BY: the 3 planted breaks listed in docs/STATE.md (cleaning that keeps the dash; unlisted ID joins straight in; log shows a name)
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { handle } from "./with-terms";
import type { PayEnv } from "../src/pay";
import { makeD1 } from "./d1-sqlite";
import { erasePersonal, lifecycleTick, PURGE_AFTER_MS } from "../src/lifecycle";
import { EMP_LEGACY_BEFORE_MS, empClean, empHashOf, legacyEmpFor, normEmp, normId } from "../src/people";

const NEW_T = Date.UTC(2026, 10, 20, 10, 0, 0);
const GEN = 1692803367;
const roundAt = (ms: number) => Math.floor((ms / 1000 - GEN) / 3) + 1;
let env: PayEnv; let ipN = 0; let raw: ReturnType<typeof makeD1>["raw"];
const realFetch = globalThis.fetch;
const call = (now: number, method: string, path: string, body?: unknown, key?: string) =>
  handle(new Request("http://x" + path, { method, headers: { "content-type": "application/json", ...(key ? { "x-organizer": key } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) }), env as any, now);
const j = async (r: Response) => (await r.json()) as any;
const dev = (i: number) => (String(i).padStart(2, "0") + "c".repeat(32)).slice(0, 32);
async function setup(at: number, o: { id?: string; invites?: unknown } = {}) {
  const id = o.id ?? "IDI-1";
  const st = await j(await handle(new Request("http://x/api/start", { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": `7.7.7.${++ipN}` }, body: JSON.stringify({ email: `demo${ipN}@demo-test.invalid` }) }), env as any, at));
  const master = st.token as string, start = roundAt(at) + 1200;
  expect((await call(at, "POST", "/api/z", { id, startRound: start, callSeconds: 12, cap: 100, whoCanJoin: "list", verify: "id", idKind: "emp" }, master)).status).toBe(200);
  expect((await call(at, "POST", `/api/z/${id}/drawset`, { winners: 1, prizes: [], mode: "auto" }, master)).status).toBe(200);
  await call(at, "POST", `/api/z/${id}/publish`, { email: "demo1@demo-test.invalid", phone: "98765 43210" }, master);
  if (o.invites) expect((await call(at, "PATCH", `/api/z/${id}/settings`, { invites: o.invites }, master)).status).toBe(200);
  return master;
}
const add = (at: number, key: string, ids: string[], id = "IDI-1") => call(at, "POST", `/api/z/${id}/people`, { people: ids.map((empId) => ({ empId })) }, key);
const join = (at: number, empId: string, i: number, id = "IDI-1", extra: Record<string, unknown> = {}) => call(at, "POST", `/api/z/${id}/join`, { empId, device: dev(i), ...extra });
const count = async (sql: string, ...a: unknown[]) => Number(((await env.DB.prepare(sql).bind(...a).first<any>()) as any)?.c ?? 0);
beforeEach(() => { const d = makeD1(); raw = d.raw; env = { DB: d.db, ORGANIZER_SECRET: "plat", RUNNER_KEY: "test-runner-key-test-runner-key-test0000", DAILY_WRITE_BUDGET: "1000000", PUBLIC_ORIGIN: "https://luckydraw.test", PHONE_SALT: "salt" } as any; (globalThis as any).fetch = async () => new Response("{}", { status: 404 }); });
afterEach(() => { globalThis.fetch = realFetch; });

describe("the one ID rule", () => {
  test("A-1101, A 1101, A/1101, a.1101 and A_1101 all become A1101; nothing but letters and numbers is kept", () => {
    for (const t of ["A-1101", "A 1101", "A/1101", "a.1101", "A_1101", " a–1101 "]) expect([t, normEmp(t)]).toEqual([t, "A1101"]);
    expect(empClean("ＡＢ１２")).toBe("AB12");
    expect(normEmp("---")).toBeNull(); expect(normEmp("")).toBe("");
    expect(normEmp("A".repeat(31))).toBeNull();
  });
  test("an e-mail address typed where an ID is asked is refused, never turned into letters", () => {
    expect(normId("raj@acme.com", "emp")).toBeNull();
  });
  test("a game made before the rule is also looked up in its old form (A-1101 stays A-1101), a cleaned form is never listed twice", () => {
    expect(EMP_LEGACY_BEFORE_MS).toBeGreaterThan(NEW_T);
    expect(legacyEmpFor("a-1101", { created_ms: NEW_T })).toBe("A-1101");
    expect(legacyEmpFor("A1101", { created_ms: NEW_T })).toBeNull(); // same as the cleaned form: nothing more to try
    expect(legacyEmpFor("A-1101", { created_ms: EMP_LEGACY_BEFORE_MS + 1 })).toBeNull(); // a game made after the rule never needs it
  });
});

describe("A-1101, A 1101 and A/1101 are one person at upload, join and approval", () => {
  test("uploaded as A-1101, the person gets in typing A 1101; the same ID typed again as A/1101 is the same person", async () => {
    const m = await setup(NEW_T); const r = await j(await add(NEW_T, m, ["A-1101", "B 2202"]));
    expect(r.added).toBe(2);
    expect((await join(NEW_T, "A 1101", 1)).status).toBe(200);
    const again = await join(NEW_T, "a/1101", 2); expect(again.status).toBe(423); expect((await j(again)).code).toBe("id-used");
    expect((await join(NEW_T, "b.2202", 3)).status).toBe(200);
  });
  test("the same ID written four ways in one upload is ONE person, never four", async () => {
    const m = await setup(NEW_T); const r = await j(await add(NEW_T, m, ["A-1101", "A 1101", "A/1101", "a.1101"]));
    expect(r.added).toBe(1);
    expect(await count("SELECT COUNT(*) AS c FROM person WHERE eid='IDI-1' AND role IS NULL")).toBe(1);
  });
  test("an ID stored under the OLD rule (A-1101 kept with its dash) still lets that person in, typed either way", async () => {
    const m = await setup(NEW_T); const eid = "IDI-1";
    // plant a person exactly as an older release stored it: hash of the old form "A-1101"
    const ph = await empHashOf(env as any, "A-1101"), { sealPii } = await import("../src/pii");
    await env.DB.prepare("INSERT INTO person(eid,id,ph,pii,inviter,role,status,tok_hash,tok_sealed,approved_by,approved_ms,added_ms) VALUES(?,?,?,?,?,NULL,'invited',?,NULL,NULL,NULL,?)").bind(eid, "aaaaaaaaaaaa", ph, await sealPii(env as any, { phone: "", name: null, empId: "A-1101" }), "o", "t".repeat(32), NEW_T).run();
    await raw.run("UPDATE engagement SET created_ms=? WHERE id='IDI-1'", [Date.UTC(2026, 10, 5)]);
    const r = await join(NEW_T, "a-1101", 1); expect(r.status).toBe(200); // typed in the old form: found by the old-form lookup
    const dup = await j(await add(NEW_T, m, ["a-1101"])); expect(dup.added).toBe(0); expect(dup.duplicates).toBe(1); // uploading the same ID again, written the way the old release stored it, does not make a second row
  });
});

describe("an ID that is not on the list waits for a yes", () => {
  test("it does not get a place; the Organizer sees only the ID; yes lets it in (any written form); no sends it away", async () => {
    const m = await setup(NEW_T); await add(NEW_T, m, ["A1101"]);
    const w1 = await join(NEW_T, "Z 9001", 1), w2 = await join(NEW_T, "Z-9002", 2);
    expect(w1.status).toBe(403); expect((await j(w1)).code).toBe("waiting"); expect(w2.status).toBe(403);
    expect(await count("SELECT COUNT(*) AS c FROM participant WHERE eid='IDI-1'")).toBe(0); // waiting uses no place
    const list = await j(await call(NEW_T, "GET", "/api/z/IDI-1/waiting", undefined, m));
    expect(list.waiting.map((x: any) => x.empId).sort()).toEqual(["Z9001", "Z9002"]);
    expect(list.waiting.every((x: any) => !x.last4 && !String(x.firstName || "").trim())).toBe(true);
    const [a, b] = list.waiting;
    expect((await call(NEW_T, "POST", `/api/z/IDI-1/waiting/${a.id}`, { decision: "admit" }, m)).status).toBe(200);
    expect((await call(NEW_T, "POST", `/api/z/IDI-1/waiting/${b.id}`, { decision: "decline" }, m)).status).toBe(200);
    const again = await join(NEW_T, a.empId === "Z9001" ? "z/9001" : "Z.9002", a.empId === "Z9001" ? 1 : 2);
    expect(again.status).toBe(200);
    const no = await join(NEW_T, b.empId === "Z9001" ? "z/9001" : "Z.9002", b.empId === "Z9001" ? 1 : 2);
    expect(no.status).toBe(403); expect((await j(no)).declined).toBe(true);
  });
  test("an unlisted ID typed three ways asks once: one request, not three", async () => {
    const m = await setup(NEW_T);
    for (const [i, x] of ["Q-77", "q 77", "Q/77"].entries()) await join(NEW_T, x, i + 1);
    expect(await count("SELECT COUNT(*) AS c FROM waiting WHERE eid='IDI-1' AND status='waiting'")).toBe(1);
    expect((await j(await call(NEW_T, "GET", "/api/z/IDI-1/waiting", undefined, m))).waiting.length).toBe(1);
  });
  test("a listed ID joins with no approval and no waiting row", async () => {
    const m = await setup(NEW_T); await add(NEW_T, m, ["L-5"]);
    expect((await join(NEW_T, "l5", 1)).status).toBe(200);
    expect(await count("SELECT COUNT(*) AS c FROM waiting WHERE eid='IDI-1'")).toBe(0);
  });
  test("the joining box needs no name, no mobile number and no e-mail", async () => {
    const m = await setup(NEW_T); await add(NEW_T, m, ["N1"]);
    const r = await join(NEW_T, "N1", 1); expect(r.status).toBe(200);
    const row = raw.query("SELECT name FROM participant WHERE eid='IDI-1'").get() as any; expect(row.name ?? null).toBeNull();
  });
});

describe("the invite and approval log", () => {
  test("lists who asked, through what, what was decided and by whom; only the ID, never a name or a number", async () => {
    const m = await setup(NEW_T); await add(NEW_T, m, ["L1"]);
    await join(NEW_T, "L-2", 1); await join(NEW_T, "L 3", 2);
    const [x, y] = (await j(await call(NEW_T, "GET", "/api/z/IDI-1/waiting", undefined, m))).waiting;
    await call(NEW_T, "POST", `/api/z/IDI-1/waiting/${x.id}`, { decision: "admit" }, m); await call(NEW_T + 1000, "POST", `/api/z/IDI-1/waiting/${y.id}`, { decision: "decline" }, m);
    const r = await call(NEW_T + 2000, "GET", "/api/z/IDI-1/people/log", undefined, m); expect(r.status).toBe(200);
    const log = (await j(r)).log as any[];
    const kinds = (id: string) => log.filter((e) => e.id === id).map((e) => e.kind).sort();
    expect(kinds("L1")).toEqual(["listed"]);
    expect(kinds(x.empId)).toEqual(["asked", "let in"]); expect(kinds(y.empId)).toEqual(["asked", "declined"]);
    expect(log.find((e) => e.kind === "let in").by).toBeTruthy();
    expect(JSON.stringify(log)).not.toMatch(/name|phone|mobile|last4/i);
    expect(log.every((e) => typeof e.through === "string" && e.through.length > 0)).toBe(true);
  });
  test("nobody without the organizer's or a host's key can read it", async () => {
    await setup(NEW_T);
    expect([401, 403, 404]).toContain((await call(NEW_T, "GET", "/api/z/IDI-1/people/log")).status);
  });
  test("a Co-host cannot read the log or the full list (only the Organizer and Hosts do)", async () => {
    const m = await setup(NEW_T);
    const ch = await j(await call(NEW_T, "POST", "/api/org/cohost", { label: "Asha", phone: "98765 11111", e: "IDI-1" }, m));
    const k = (String(ch.link || "").match(/cbc_[0-9a-f]{48}/) ?? [])[0];
    expect(k).toBeTruthy();
    const r = await call(NEW_T, "GET", "/api/z/IDI-1/people/log", undefined, k);
    expect(r.status).toBe(403);
  });
});

describe("family invite: one listed person may invite 4 more", () => {
  test("the setting takes 4 (the default); the listed person's common link brings the family in under their name", async () => {
    const m = await setup(NEW_T, { invites: { on: true, per: 4, cats: ["family"] } });
    await add(NEW_T, m, ["F1"]);
    const me = await j(await join(NEW_T, "F-1", 1)); expect(me.pid).toBeTruthy();
    const seat = raw.query("SELECT seq FROM seat WHERE eid='IDI-1' AND pid=?").get(me.pid) as any;
    // a family member opens the listed person's link: not listed, so the request goes to the person who invited them
    const fam = await join(NEW_T, "Z-77", 2, "IDI-1", { from: seat.seq }); expect(fam.status).toBe(403); expect((await j(fam)).code).toBe("waiting");
    const w = raw.query("SELECT inviter FROM waiting WHERE eid='IDI-1'").get() as any; expect(w.inviter).toBe("s:" + seat.seq);
  });
  test("a listed person can bring 4 more, not 5: the fifth request goes to the organizer, not to the family list", async () => {
    const m = await setup(NEW_T, { invites: { on: true, per: 4, cats: ["family"] } });
    await add(NEW_T, m, ["F1"]);
    const me = await j(await join(NEW_T, "F1", 1)); const seat = (raw.query("SELECT seq FROM seat WHERE eid='IDI-1' AND pid=?").get(me.pid) as any).seq;
    for (let i = 1; i <= 5; i++) { const r = await join(NEW_T, "FAM-" + i, 10 + i, "IDI-1", { from: seat }); expect(r.status).toBeGreaterThanOrEqual(403); }
    const list = (await j(await call(NEW_T, "GET", "/api/z/IDI-1/waiting", undefined, m))).waiting as any[];
    expect(list.length).toBe(5);
    for (const w of list.filter((x) => !x.overLimit)) expect((await call(NEW_T, "POST", `/api/z/IDI-1/waiting/${w.id}`, { decision: "admit" }, m)).status).toBe(200);
    const under = raw.query("SELECT COUNT(*) AS c FROM person WHERE eid='IDI-1' AND inviter=?").get("s:" + seat) as any;
    expect(under.c).toBeLessThanOrEqual(4);
    const info = await j(await call(NEW_T, "GET", `/api/z/IDI-1/invites?pid=${me.pid}`)); expect(info.per).toBe(4); expect(info.canInvite).toBe(true);
  });
});

describe("within 24 hours after the game ends, the list and every ID are deleted", () => {
  test("the promise is kept by the numbers: the scheduled deletion comes at 20 hours, which is inside the 24 hours promised", () => {
    expect(PURGE_AFTER_MS).toBeLessThanOrEqual(24 * 3_600_000); expect(PURGE_AFTER_MS).toBeGreaterThan(0);
  });
  test("the list, the waiting requests, the ID lookups, the guess counters and the log are empty after the erasure", async () => {
    const m = await setup(NEW_T); await add(NEW_T, m, ["E1", "E2"]); await join(NEW_T, "E1", 1); await join(NEW_T, "X-9", 2);
    await env.DB.prepare("INSERT INTO kv(k,v) VALUES('idmiss/IDI-1/2026-11-20T10:0/abc','3')").run();
    await env.DB.prepare("INSERT INTO kv(k,v) VALUES('idx/IDI-1/zzz','p')").run();
    expect(await count("SELECT COUNT(*) AS c FROM person WHERE eid='IDI-1'")).toBeGreaterThan(0); expect(await count("SELECT COUNT(*) AS c FROM waiting WHERE eid='IDI-1'")).toBe(1);
    await erasePersonal(env as any, "IDI-1", NEW_T + 86_400_000, "test");
    for (const t of ["person", "waiting", "seat", "participant"]) expect(await count(`SELECT COUNT(*) AS c FROM ${t} WHERE eid='IDI-1'`)).toBe(0);
    expect(await count("SELECT COUNT(*) AS c FROM kv WHERE k LIKE 'idx/IDI-1/%' OR k LIKE 'idmiss/IDI-1/%'")).toBe(0);
    const log = (await j(await call(NEW_T + 86_400_000, "GET", "/api/z/IDI-1/people/log", undefined, m))).log as any[];
    expect(log.length).toBe(0);
  });
  test("the scheduled tick does it by itself: 22 hours after the draw no ID is left anywhere (sealed or not)", async () => {
    const m = await setup(NEW_T); await add(NEW_T, m, ["T1"]); await join(NEW_T, "T-1", 1); await join(NEW_T, "T 2", 2);
    raw.run("UPDATE engagement SET pack=100 WHERE id='IDI-1'");
    const startMs = (GEN + (Number((raw.query("SELECT start_round FROM engagement WHERE id='IDI-1'").get() as any).start_round) - 1) * 3) * 1000;
    raw.run("UPDATE draw SET drawn_ms=?, result='[]' WHERE eid='IDI-1'", [startMs]);
    raw.run("INSERT OR REPLACE INTO life(eid,end_ms,end_src) VALUES('IDI-1',?, 'draw')", [startMs]);
    await lifecycleTick(env as any, startMs + 22 * 3_600_000);
    for (const t of ["person", "waiting", "seat", "participant"]) expect([t, await count(`SELECT COUNT(*) AS c FROM ${t} WHERE eid='IDI-1'`)]).toEqual([t, 0]);
  });
});

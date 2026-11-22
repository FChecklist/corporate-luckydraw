// AUDIT H-A (second audit of 42ae412): a manual Start pressed BEFORE the start time left the entry list open to changes after the beacon round was public.
// forget (delete one person), erase (delete everybody), cancel and un-bind only looked at the start time, never at "the list is already frozen". Now each is refused with 409 while the draw is frozen and not yet made.
// FALSIFIED BY (planted, saw these tests fail, restored): removing the entriesFrozen() check from forget; from erase; from unbind; the freeze check in cancelPreview; the freeze check in resendPerson.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { handle } from "./with-terms";
import type { PayEnv } from "../src/pay";
import { makeD1 } from "./d1-sqlite";
import { DRAW_FAIRNESS, NO_PERSONAL_LINE, drawRow, drawTick, entryPids, manualRound, registrationClosed, runDraw } from "../src/draw";
import { drawTiming, roundMs } from "../src/lifecycle";
import { roundAt } from "../../../packages/beacon/src/index";
import { winnersFor } from "../../../vendor/game-core/packages/luckydraw/src";
import { normId } from "../../../vendor/game-core/packages/core/src";

const T = Date.UTC(2026, 10, 20, 10, 0, 0);
const GEN = 1692803367;
const roundOfMs = (ms: number) => Math.floor((ms / 1000 - GEN) / 3) + 1;
let env: PayEnv; let raw: ReturnType<typeof makeD1>["raw"]; let ipN = 0; let asked: (number | "latest")[] = [];
const realFetch = globalThis.fetch;
const call = (now: number, method: string, path: string, body?: unknown, key?: string) =>
  handle(new Request("http://x" + path, { method, headers: { "content-type": "application/json", ...(key ? { "x-organizer": key } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) }), env as any, now);
const j = async (r: Response) => (await r.json()) as any;
const dev = (i: number) => (String(i).padStart(2, "0") + "c".repeat(32)).slice(0, 32);
const hex64 = (n: number) => (n.toString(16).padStart(8, "0") + "ab".repeat(28)).slice(0, 64);
/** A beacon stand-in: it answers any round and remembers what was asked. `down` makes it fail. */
const beacon = (o: { down?: boolean } = {}) => ({ fetchRound: (async (r: number | "latest") => { asked.push(r); return o.down ? null : { round: r as number, signature: "00", randomness: hex64(Number(r) * 7919) }; }) as any });
const eidOf = "FAIR-1";
async function setup(opts: { mode?: "auto" | "manual"; people?: number; winners?: number } = {}) {
  const st = await j(await handle(new Request("http://x/api/start", { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": `7.7.7.${++ipN}` }, body: JSON.stringify({ email: `demo${ipN}@demo-test.invalid` }) }), env as any, T));
  const key = st.token as string, start = roundOfMs(T) + 1200;
  expect((await call(T, "POST", "/api/z", { id: eidOf, startRound: start, callSeconds: 12, cap: 100, whoCanJoin: "list", verify: "id", idKind: "emp" }, key)).status).toBe(200);
  expect((await call(T, "POST", `/api/z/${eidOf}/drawset`, { winners: opts.winners ?? 1, prizes: [], mode: opts.mode ?? "auto" }, key)).status).toBe(200);
  await call(T, "POST", `/api/z/${eidOf}/publish`, { email: "demo1@demo-test.invalid", phone: "98765 43210" }, key);
  const n = opts.people ?? 6, ids = Array.from({ length: n }, (_, i) => `P${1000 + i}`);
  expect((await call(T, "POST", `/api/z/${eidOf}/people`, { people: ids.map((empId) => ({ empId })) }, key)).status).toBe(200);
  for (let i = 0; i < n; i++) expect((await call(T, "POST", `/api/z/${eidOf}/join`, { empId: ids[i], device: dev(i + 1) })).status).toBe(200);
  raw.run("UPDATE engagement SET pack=100 WHERE id=?", [eidOf]);
  const e = raw.query("SELECT * FROM engagement WHERE id=?").get(eidOf) as any;
  return { key, e, drawMs: roundMs(e.start_round) };
}
const pids = () => (raw.query("SELECT pid FROM seat WHERE eid=? ORDER BY seq").all(eidOf) as any[]).map((r) => r.pid as string);
const personOf = (pid: string) => (raw.query("SELECT p.id AS id FROM person p JOIN seat s ON s.ph=p.ph AND s.eid=p.eid WHERE s.eid=? AND s.pid=?").get(eidOf, pid) as any).id as string;
/** Who would win if everybody who joined stayed in (computed independently with the engine's own ranking). */
const expectedWinner = (beaconRound: number, ps = pids()) => { const w = winnersFor(eidOf, "0", hex64(beaconRound * 7919), ps.map((p) => normId("emp", p)!), 1)[0]!; return ps.find((p) => normId("emp", p) === w)!; };
const resultPid = () => { const d = raw.query("SELECT result FROM draw WHERE eid=?").get(eidOf) as any; return d?.result ? (JSON.parse(d.result) as { pid: string }[]).map((x) => x.pid) : null; };
const tick = (now: number, deps = beacon()) => drawTick(env as any, now, async (e) => drawTiming(env as any, e, now), deps);
beforeEach(() => { const d = makeD1(); raw = d.raw; asked = []; env = { DB: d.db, ORGANIZER_SECRET: "plat", RUNNER_KEY: "test-runner-key-test-runner-key-test0000", DAILY_WRITE_BUDGET: "1000000", PUBLIC_ORIGIN: "https://luckydraw.test", PHONE_SALT: "salt" } as any; (globalThis as any).fetch = async () => new Response("{}", { status: 404 }); });
afterEach(() => { globalThis.fetch = realFetch; });

const pressEarly = async (g: Awaited<ReturnType<typeof setup>>) => {
  const press = T + 5_000; // far before the start time (one hour ahead)
  const r = await call(press, "POST", `/api/z/${eidOf}/drawnow`, {}, g.key);
  expect(r.status).toBe(200); expect((await j(r)).pending).toBe(true);
  const d = (await drawRow(env.DB, eidOf))!;
  return { press, d, W: expectedWinner(d.target_round!), later: roundMs(d.target_round!) + 1_000 };
};
const seatNoOf = (pid: string) => (raw.query("SELECT seq FROM seat WHERE eid=? AND pid=?").get(eidOf, pid) as any).seq as number;
const seatCount = () => (raw.query("SELECT COUNT(*) AS c FROM seat WHERE eid=?").get(eidOf) as any).c as number;

describe("a manual Start pressed before the start time freezes the list against delete, erase, cancel and un-bind", () => {
  test("forget (delete one person) of the would-be winner after the target round is public is refused; the draw still has the winner", async () => {
    const g = await setup({ mode: "manual" }); const { W, later } = await pressEarly(g);
    const f = await call(later, "POST", `/api/z/${eidOf}/forget`, { seat: seatNoOf(W) }, g.key);
    expect(f.status).toBe(409); expect((await j(f)).code).toBe("draw-frozen");
    expect(seatCount()).toBe(6);
    expect(await tick(later + 2_000)).toBe(1);
    expect(resultPid()).toEqual([W]);
    expect((raw.query("SELECT entries FROM draw WHERE eid=?").get(eidOf) as any).entries).toBe(6);
  });
  test("erase (delete everybody) is refused while the draw is frozen: the draw is not voided", async () => {
    const g = await setup({ mode: "manual" }); const { W, later } = await pressEarly(g);
    const er = await call(later, "POST", `/api/z/${eidOf}/erase`, {}, g.key);
    expect(er.status).toBe(409); expect((await j(er)).code).toBe("draw-frozen");
    expect(seatCount()).toBe(6);
    expect(await tick(later + 2_000)).toBe(1);
    expect(resultPid()).toEqual([W]);
  });
  test("cancel is refused while the draw is frozen (cancel-preview says so too); the game is not cancelled", async () => {
    const g = await setup({ mode: "manual" }); const { W, later } = await pressEarly(g);
    const pv = await j(await call(later, "GET", `/api/z/${eidOf}/cancel-preview`, undefined, g.key));
    expect(pv.canCancel).toBe(false);
    const c = await call(later, "POST", `/api/z/${eidOf}/cancel`, { confirmations: 3 }, g.key);
    expect(c.status).toBe(409);
    expect((raw.query("SELECT cancelled_ms FROM engagement WHERE id=?").get(eidOf) as any).cancelled_ms).toBeNull();
    expect(await tick(later + 2_000)).toBe(1);
    expect(resultPid()).toEqual([W]);
  });
  test("un-binding a card is refused while the draw is frozen", async () => {
    const g = await setup({ mode: "manual" }); const { W, later } = await pressEarly(g);
    const u = await call(later, "POST", `/api/z/${eidOf}/unbind`, { seat: seatNoOf(W) }, g.key);
    expect(u.status).toBe(409); expect((await j(u)).code).toBe("draw-frozen");
    expect((raw.query("SELECT dev FROM seat WHERE pid=?").get(W) as any).dev).not.toBeNull();
  });
  test("sending a card link again (which un-binds the phone) is refused while the draw is frozen", async () => {
    const g = await setup({ mode: "manual" }); const { W, later } = await pressEarly(g);
    const r = await call(later, "POST", `/api/z/${eidOf}/people/${personOf(W)}/resend`, {}, g.key);
    expect(r.status).toBe(409); expect((await j(r)).code).toBe("draw-frozen");
    expect((raw.query("SELECT dev FROM seat WHERE pid=?").get(W) as any).dev).not.toBeNull();
  });
  test("after the draw is made the same delete works again (the right to delete is not lost)", async () => {
    const g = await setup({ mode: "manual" }); const { W, later } = await pressEarly(g);
    expect(await tick(later + 2_000)).toBe(1);
    const f = await call(later + 5_000, "POST", `/api/z/${eidOf}/forget`, { seat: seatNoOf(W) }, g.key);
    expect(f.status).toBe(200);
    expect(resultPid()).toEqual([W]); // the result stands
  });
});

describe("automatic start: between the draw time and the draw, delete and erase are refused too", () => {
  test("forget and erase right after the draw time are refused whatever the game window says", async () => {
    const g = await setup(); const W = expectedWinner(roundOfMs(g.drawMs)); const at = g.drawMs + 10_000;
    raw.run("UPDATE life SET end_ms=? WHERE eid=?", [g.drawMs - 1, eidOf]); // a game window that has already ended must not be a way round
    const f = await call(at, "POST", `/api/z/${eidOf}/forget`, { seat: seatNoOf(W) }, g.key);
    expect([409]).toContain(f.status); expect(seatCount()).toBe(6);
    const er = await call(at, "POST", `/api/z/${eidOf}/erase`, {}, g.key);
    expect(er.status).toBe(409); expect(seatCount()).toBe(6);
    expect(await tick(at + 60_000)).toBe(1); expect(resultPid()).toEqual([W]);
  });
});

describe("a card nobody had opened cannot be taken up after the list closed (audit L-2: this guard had no test)", () => {
  test("a person whose card was un-bound before the draw time is refused when they come back after it; the card stays un-bound", async () => {
    const g = await setup();
    const first = pids()[0]!;
    expect((await call(T + 1_000, "POST", `/api/z/${eidOf}/unbind`, { seat: seatNoOf(first) }, g.key)).status).toBe(200);
    const late = g.drawMs + 5_000;
    const r = await call(late, "POST", `/api/z/${eidOf}/join`, { empId: "P1000", device: dev(50) });
    expect(r.status).toBe(403); expect((await j(r)).code).toBe("draw-closed");
    expect((raw.query("SELECT dev FROM seat WHERE pid=?").get(first) as any).dev).toBeNull();
  });
});

describe("the fairness sentence is true on every path it covers (owner rule: proved by a test)", () => {
  test("every screen gets the sentence from the game's info, word for word; each of its three claims is the behaviour proved above", async () => {
    const g = await setup({ mode: "manual" });
    const info = await j(await call(T + 1_000, "GET", `/api/z/${eidOf}/info`));
    expect(info.draw.fairness).toBe(DRAW_FAIRNESS);
    // claim 1 "No one knows the result before the draw": a manual press waits for a round that is not public yet (no beacon call before it)
    const { d, W, later } = await pressEarly(g);
    expect(await tick(roundMs(d.target_round!) - 1_000)).toBe(0); expect(asked).toEqual([]);
    // claim 2 "The list of entries closes ... and cannot change after that": delete, erase, cancel are all refused (the five tests above) and a new join is refused
    expect((await call(T + 6_000, "POST", `/api/z/${eidOf}/join`, { empId: "NEWBIE1", device: dev(61) })).status).toBe(403);
    // claim 3 "the same entries and the same value always give the same winners": the stored result equals an independent run on the stored value
    expect(await tick(later + 2_000)).toBe(1);
    const row = raw.query("SELECT beacon, round FROM draw WHERE eid=?").get(eidOf) as any;
    expect(resultPid()).toEqual([W]);
    const again = winnersFor(eidOf, "0", row.beacon, pids().map((p) => normId("emp", p)!), 1);
    expect(again.map((x) => pids().find((p) => normId("emp", p) === x))).toEqual([W]);
  });
});

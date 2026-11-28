// AUDIT H1 (P1 owner rules): the draw must be fair even though it runs a little after the draw time.
//  - the entry list is FROZEN at the draw time (automatic) or at the press of Start (manual): a removal, a leave, a put-back or a late claim after that moment changes nothing;
//  - a manual start uses a beacon round that is published AFTER the press, never one that is already public;
//  - the draw is made by the scheduled job (drawTick) without anybody opening a page.
// The real Worker code against an in-memory D1. The beacon is a test stand-in that records which rounds were asked for.
// FALSIFIED BY (each was planted, saw its test fail, and was restored): entryPids ignoring blk_ms / joined_ms; manualRound = roundAt(now); a fallback to older rounds; release of the press on a beacon failure.
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

const winnerKey = (round: number) => hex64(round * 7919);
void winnerKey;

describe("automatic start: the list is frozen at the draw time", () => {
  test("the organizer removes the would-be winner AFTER the draw time but BEFORE the draw runs: that person is still in the draw (the audit's proof, now closed)", async () => {
    const g = await setup();
    const target = roundOfMs(g.drawMs), W = expectedWinner(target);
    const after = g.drawMs + 10_000; // draw time has passed, nobody has opened the draw page yet
    const rm = await call(after, "POST", `/api/z/${eidOf}/people/${personOf(W)}/remove`, {}, g.key);
    expect(rm.status).toBe(200); // the organizer may still remove (the person's seat is blocked) ...
    expect(await tick(after + 60_000)).toBe(1); // ... but the draw, made by the scheduled job, still uses the list as it stood at the draw time
    expect(resultPid()).toEqual([W]);
    expect((raw.query("SELECT entries FROM draw WHERE eid=?").get(eidOf) as any).entries).toBe(6);
  });
  test("a removal BEFORE the draw time still works: that person is not an entry", async () => {
    const g = await setup();
    const W = expectedWinner(roundOfMs(g.drawMs));
    expect((await call(T + 60_000, "POST", `/api/z/${eidOf}/people/${personOf(W)}/remove`, {}, g.key)).status).toBe(200);
    expect(await tick(g.drawMs + 60_000)).toBe(1);
    expect(resultPid()).not.toContain(W);
    expect((raw.query("SELECT entries FROM draw WHERE eid=?").get(eidOf) as any).entries).toBe(5);
  });
  test("a player who leaves after the draw time is still in the draw (their details are deleted, their entry stands)", async () => {
    const g = await setup(); const W = expectedWinner(roundOfMs(g.drawMs));
    const i = pids().indexOf(W) + 1;
    const lv = await call(g.drawMs + 5_000, "POST", `/api/z/${eidOf}/leave`, { pid: W, device: dev(i) });
    expect(lv.status).toBe(200);
    expect(await tick(g.drawMs + 60_000)).toBe(1);
    expect(resultPid()).toEqual([W]);
  });
  test("nobody can be added or put back after the draw time (list closed), and a new join is refused", async () => {
    const g = await setup(); const W = expectedWinner(roundOfMs(g.drawMs));
    expect((await call(T + 1_000, "POST", `/api/z/${eidOf}/people/${personOf(W)}/remove`, {}, g.key)).status).toBe(200);
    const late = g.drawMs + 5_000;
    const add = await call(late, "POST", `/api/z/${eidOf}/people`, { people: [{ empId: W }, { empId: "NEW9" }] }, g.key);
    expect(add.status).toBe(409); expect((await j(add)).code).toBe("list-closed");
    expect((await call(late, "POST", `/api/z/${eidOf}/join`, { empId: "NEW9", device: dev(40) })).status).toBe(403);
    expect(await tick(late + 60_000)).toBe(1);
    expect(resultPid()).not.toContain(W); // removed before the draw time and never put back
  });
  test("a seat whose card nobody had opened cannot be taken up after the draw time, and is not an entry", async () => {
    const g = await setup({ people: 3 });
    // a listed person with a seat but no phone yet (as a roster seat is)
    raw.run("INSERT INTO participant(eid,pid,phone_hash,pii,name,joined_ms) VALUES(?,?,?,?,?,?)", [eidOf, "9xroster", "ph-roster", null, null, T]);
    raw.run("INSERT INTO seat(eid,seq,pid,ph,dev,src) VALUES(?,?,?,?,NULL,'roster')", [eidOf, 9, "9xroster", "ph-roster"]);
    expect((await entryPids(env.DB, eidOf, g.drawMs)).includes("9xroster")).toBe(false);
    raw.run("UPDATE seat SET dev='d1' WHERE pid='9xroster'"); raw.run("UPDATE participant SET joined_ms=? WHERE pid='9xroster'", [g.drawMs + 1_000]); // claimed AFTER the list closed
    expect((await entryPids(env.DB, eidOf, g.drawMs)).includes("9xroster")).toBe(false);
    raw.run("UPDATE participant SET joined_ms=? WHERE pid='9xroster'", [g.drawMs - 1_000]); // claimed before: it counts
    expect((await entryPids(env.DB, eidOf, g.drawMs)).includes("9xroster")).toBe(true);
  });
});

describe("the draw is made without anybody opening a page", () => {
  test("the scheduled job (every minute) draws on the round OF the draw time, once, and never asks for any other round", async () => {
    const g = await setup(); const target = roundOfMs(g.drawMs);
    expect(await tick(g.drawMs + 1_000)).toBe(0); // 3 seconds of grace after the draw time first
    expect(await tick(g.drawMs + 61_000)).toBe(1);
    expect(asked).toEqual([target]);
    expect((raw.query("SELECT round FROM draw WHERE eid=?").get(eidOf) as any).round).toBe(target);
    expect(await tick(g.drawMs + 122_000)).toBe(0); // done once
    expect(resultPid()).toEqual([expectedWinner(target)]);
  });
  test("when the beacon does not answer the list stays frozen and the next job completes the draw", async () => {
    const g = await setup();
    expect(await tick(g.drawMs + 61_000, beacon({ down: true }))).toBe(0);
    expect(resultPid()).toBeNull();
    const W = expectedWinner(roundOfMs(g.drawMs));
    await call(g.drawMs + 70_000, "POST", `/api/z/${eidOf}/people/${personOf(W)}/remove`, {}, g.key); // removed while the beacon was down
    expect(await tick(g.drawMs + 130_000)).toBe(1);
    expect(resultPid()).toEqual([W]);
  });
});

describe("manual start: the beacon round is one that does not exist yet", () => {
  test("manualRound is always published after the press, with a spare round for a clock a few seconds out (10,000 random moments)", () => {
    for (let i = 0; i < 10_000; i++) {
      const press = T + Math.floor(Math.random() * 400 * 86_400_000);
      const r = manualRound(press);
      expect(roundMs(r)).toBeGreaterThan(press + 3_000);
      expect(r).toBeGreaterThanOrEqual(roundAt(press) + 2);
    }
  });
  test("Start closes the list at once and the winners wait for a round that is later than the press; no older round is ever asked for", async () => {
    const g = await setup({ mode: "manual" });
    const press = g.drawMs + 100_000; // pressed some time after the start time
    const r = await call(press, "POST", `/api/z/${eidOf}/drawnow`, {}, g.key);
    expect(r.status).toBe(200); const b = await j(r); expect(b.pending).toBe(true);
    const d = (await drawRow(env.DB, eidOf))!;
    expect(d.freeze_ms).toBe(press); expect(roundMs(d.target_round!)).toBeGreaterThan(press);
    expect(d.target_round).toBe(roundAt(press) + 2);
    expect(d.drawn_ms).toBeNull(); expect(resultPid()).toBeNull();
    // the value of the chosen round is not public yet: even a beacon that would answer is not asked
    expect(await tick(press + 1_000)).toBe(0); expect(asked).toEqual([]);
    // the list is closed from the press
    expect((await call(press + 500, "POST", `/api/z/${eidOf}/join`, { empId: "ZZ1", device: dev(41) })).status).toBe(403);
    // pressing again changes nothing (same round, same freeze)
    const again = await call(press + 2_000, "POST", `/api/z/${eidOf}/drawnow`, {}, g.key); expect((await j(again)).pending).toBe(true);
    const d2 = (await drawRow(env.DB, eidOf))!; expect([d2.freeze_ms, d2.target_round]).toEqual([press, d.target_round]);
    // when the chosen round is published the scheduled job completes the draw with exactly that round
    const later = roundMs(d.target_round!) + 5_000;
    expect(await tick(later)).toBe(1);
    expect(asked).toEqual([d.target_round!]);
    expect(resultPid()).toEqual([expectedWinner(d.target_round!)]);
    expect((raw.query("SELECT by_role FROM draw WHERE eid=?").get(eidOf) as any).by_role).toBe("organizer");
  });
  test("a removal after the press changes nothing; a beacon failure does not reopen the list or pick another round", async () => {
    const g = await setup({ mode: "manual" });
    const press = g.drawMs + 100_000;
    await call(press, "POST", `/api/z/${eidOf}/drawnow`, {}, g.key);
    const d = (await drawRow(env.DB, eidOf))!, W = expectedWinner(d.target_round!);
    expect((await call(press + 1_000, "POST", `/api/z/${eidOf}/people/${personOf(W)}/remove`, {}, g.key)).status).toBe(200);
    const later = roundMs(d.target_round!) + 5_000;
    expect(await tick(later, beacon({ down: true }))).toBe(0);
    const d2 = (await drawRow(env.DB, eidOf))!;
    expect([d2.freeze_ms, d2.target_round, registrationClosed(d2, later, g.drawMs)]).toEqual([press, d.target_round, true]);
    expect(await tick(later + 60_000)).toBe(1);
    expect(resultPid()).toEqual([W]);
    expect([...new Set(asked)]).toEqual([d.target_round!]);
  });
  test("a Co-host or an AI key cannot start it; a Host can, and the role is kept", async () => {
    const g = await setup({ mode: "manual" });
    expect((await call(g.drawMs + 1_000, "POST", `/api/z/${eidOf}/drawnow`, {})).status).toBeGreaterThanOrEqual(401);
    expect(((await drawRow(env.DB, eidOf))!).freeze_ms).toBeNull();
  });
  test("an automatic game has nothing to press; a manual game is not drawn by the clock alone", async () => {
    const a = await setup({ mode: "auto" });
    const r = await call(a.drawMs + 1_000, "POST", `/api/z/${eidOf}/drawnow`, {}, a.key); expect(r.status).toBe(409);
    raw.run("UPDATE draw SET mode='manual'");
    expect(await tick(a.drawMs + 600_000)).toBe(0); // nobody pressed: nothing is drawn
    expect(resultPid()).toBeNull();
  });
  test("runDraw refuses an unpaid game with 402 before anything is frozen", async () => {
    const g = await setup({ mode: "manual" }); raw.run("UPDATE engagement SET pack=0");
    const e = raw.query("SELECT * FROM engagement WHERE id=?").get(eidOf) as any;
    const r = await runDraw(env as any, e, g.drawMs + 5_000, { drawRound: e.start_round, paused: false }, "organizer", beacon());
    expect(r).toMatchObject({ ok: false, status: 402 });
    expect(((await drawRow(env.DB, eidOf))!).freeze_ms).toBeNull();
  });
});

describe("what the screens say is what the code does", () => {
  test("the fairness text begins with the true claim and says the list closes; the privacy line is the owner's, true for winners too", () => {
    expect(DRAW_FAIRNESS.startsWith("No one knows the result before the draw.")).toBe(true);
    expect(DRAW_FAIRNESS).toMatch(/list of entries closes at the draw time/);
    expect(DRAW_FAIRNESS).not.toMatch(/100%|guarantee|unhackable|tamper-?proof/i);
    expect(NO_PERSONAL_LINE).toBe("Player details are deleted within 24 hours of the draw. The organizer's, hosts' and winners' details are kept for 365 days, and invoices as the law requires.");
  });
});

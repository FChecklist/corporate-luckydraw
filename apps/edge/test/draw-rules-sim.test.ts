// AUDIT H1, the 19.22% finding: a simulation that runs MANY Lucky Draws through the real draw code (runDraw) and checks every rule of a fair draw against an independent oracle.
// A scenario FAILS when any rule is broken. The test passes only when the failure count is 0 out of all draws, and prints the number.
// Rules checked in every draw:
//   R1 exactly min(winners wanted, entries) winners          R2 nobody wins twice            R3 every winner is an entry
//   R4 the winners are exactly the engine's ranking of the entry list AS IT STOOD when the list closed (same list + same beacon value = same winners)
//   R5 the entry count stored is that list's size            R6 a person removed/left BEFORE the list closed never wins; one who is removed AFTER it still counts (the list is frozen)
//   R7 a seat that joined/was claimed after the list closed is not an entry                R8 the beacon round used is the draw time's round (automatic) or one published after the press (manual), never an older one
//   R9 the draw is made once (a second call changes nothing)
// The same scenarios are also run against the OLD entry list (read when the draw runs, removals counted at once) as a CONTROL: it must fail some scenarios, which proves the simulation can see the fault.
// FALSIFIED BY: planting entryPids that ignores blk_ms (R4/R6 fail), that ignores joined_ms (R7 fails), manualRound = roundAt(now) (R8 fails).
import { beforeAll, describe, expect, test } from "bun:test";
import { handle } from "./with-terms";
import type { PayEnv } from "../src/pay";
import { makeD1 } from "./d1-sqlite";
import { drawRow, manualRound, runDraw } from "../src/draw";
import { drawTiming, roundMs } from "../src/lifecycle";
import { roundAt } from "../../../packages/beacon/src/index";
import { winnersFor } from "../../../vendor/game-core/packages/luckydraw/src";
import { normId } from "../../../vendor/game-core/packages/core/src";

const T = Date.UTC(2026, 10, 20, 10, 0, 0), GEN = 1692803367, SEED = 20261120, SCENARIOS = Number(process.env.DRAW_SIM_N ?? 5000);
const roundOfMs = (ms: number) => Math.floor((ms / 1000 - GEN) / 3) + 1;
const rng = (seed: number) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const hex64 = (n: number) => (n.toString(16).padStart(8, "0") + "cd".repeat(28)).slice(0, 64);
const EID = "SIM-1";
let env: PayEnv; let raw: ReturnType<typeof makeD1>["raw"]; let e0: any;

beforeAll(async () => {
  const d = makeD1(); raw = d.raw;
  env = { DB: d.db, ORGANIZER_SECRET: "plat", RUNNER_KEY: "test-runner-key-test-runner-key-test0000", DAILY_WRITE_BUDGET: "1000000000", PUBLIC_ORIGIN: "https://luckydraw.test", PHONE_SALT: "salt" } as any;
  (globalThis as any).fetch = async () => new Response("{}", { status: 404 });
  const call = (m: string, p: string, b?: unknown, key?: string) => handle(new Request("http://x" + p, { method: m, headers: { "content-type": "application/json", "cf-connecting-ip": "6.6.6.6", ...(key ? { "x-organizer": key } : {}) }, body: b === undefined ? undefined : JSON.stringify(b) }), env as any, T);
  const st = (await (await call("POST", "/api/start", { email: "sim@demo-test.invalid" })).json()) as any;
  await call("POST", "/api/z", { id: EID, startRound: roundOfMs(T) + 1200, callSeconds: 12, cap: 100, whoCanJoin: "list", verify: "id", idKind: "emp" }, st.token);
  await call("POST", `/api/z/${EID}/drawset`, { winners: 1, prizes: [], mode: "auto" }, st.token);
  raw.run("UPDATE engagement SET pack=100 WHERE id=?", [EID]);
  e0 = raw.query("SELECT * FROM engagement WHERE id=?").get(EID);
});

interface Seat { pid: string; joined: "before" | "after"; state: "in" | "blockedBefore" | "blockedAfter" | "roster"; }
const KEEP = ["engagement", "draw", "kv", "organizer_email", "organizer_key", "org", "entitlement", "pack"];
void KEEP;
function seed(eid: string, seats: Seat[], freeze: number) {
  raw.run("DELETE FROM seat WHERE eid=?", [eid]); raw.run("DELETE FROM participant WHERE eid=?", [eid]); raw.run("DELETE FROM prize WHERE eid=?", [eid]); raw.run("DELETE FROM outbox"); raw.run("DELETE FROM life WHERE eid=?", [eid]);
  seats.forEach((s, i) => {
    const joined = s.joined === "before" ? freeze - 10_000 - i : freeze + 5_000 + i;
    raw.run("INSERT INTO participant(eid,pid,phone_hash,pii,name,joined_ms) VALUES(?,?,?,?,?,?)", [eid, s.pid, "ph" + s.pid, null, null, joined]);
    const blocked = s.state === "blockedBefore" ? 1 : s.state === "blockedAfter" ? 1 : null, blk = s.state === "blockedBefore" ? freeze - 5_000 : s.state === "blockedAfter" ? freeze + 5_000 : null;
    raw.run("INSERT INTO seat(eid,seq,pid,ph,dev,src,blocked,blk_ms) VALUES(?,?,?,?,?,?,?,?)", [eid, i + 1, s.pid, "ph" + s.pid, s.state === "roster" ? null : "dev" + s.pid, s.state === "roster" ? "roster" : null, blocked, blk]);
  });
}
/** What an honest reader of the rules says the entry list was when it closed. */
const oracle = (seats: Seat[]) => seats.filter((s) => s.joined === "before" && (s.state === "in" || s.state === "blockedAfter")).map((s) => s.pid);
/** The OLD list: read when the draw runs; a block counts at once, a late seat counts. (Control only.) */
const legacy = (seats: Seat[]) => seats.filter((s) => s.state === "in" || s.state === "blockedAfter" ? s.state === "in" : false).map((s) => s.pid);

async function scenario(r: () => number, k: number) {
  const n = 1 + Math.floor(r() * 80), want = 1 + Math.floor(r() * 12), manual = r() < 0.5;
  const seats: Seat[] = Array.from({ length: n }, (_, i) => {
    const x = r(), pid = `${i + 1}x${Math.floor(r() * 1e9).toString(36)}`;
    return { pid, joined: r() < 0.1 ? "after" : "before", state: x < 0.65 ? "in" : x < 0.77 ? "blockedBefore" : x < 0.94 ? "blockedAfter" : "roster" } as Seat;
  });
  const start = roundOfMs(T) + 1200, drawMs = roundMs(start);
  const press = drawMs + 1000 + Math.floor(r() * 500_000), target = manual ? manualRound(press) : start, freeze = manual ? press : drawMs;
  seed(EID, seats, freeze);
  raw.run("UPDATE draw SET winners=?, mode=?, drawn_ms=NULL, closing_ms=NULL, round=NULL, beacon=NULL, result=NULL, by_role=?, entries=NULL, freeze_ms=?, target_round=? WHERE eid=?", [want, manual ? "manual" : "auto", manual ? "organizer" : null, manual ? press : null, manual ? target : null, EID]);
  const now = roundMs(target) + 4_000 + Math.floor(r() * 50_000), value = hex64(Math.floor(r() * 4e9)), asked: unknown[] = [];
  const out = await runDraw(env as any, e0, now, { drawRound: start, paused: false }, "auto", { fetchRound: (async (rd: number) => { asked.push(rd); return { round: rd, signature: "00", randomness: value }; }) as any });
  const again = await runDraw(env as any, e0, now + 1, { drawRound: start, paused: false }, "auto", { fetchRound: (async () => { throw new Error("must not be asked again"); }) as any });
  const d = (await drawRow(env.DB, EID))!, got: { pid: string }[] = JSON.parse(d.result ?? "[]").map((x: any) => x), won = got.map((x) => x.pid);
  const entries = oracle(seats), clean = (p: string) => normId("emp", p)!;
  const expected = winnersFor(EID, d.ref, value, entries.map(clean), want).map((c) => entries.find((p) => clean(p) === c)!);
  const old = legacy(seats), oldExpected = winnersFor(EID, d.ref, value, old.map(clean), want).map((c) => old.find((p) => clean(p) === c)!);
  const broken: string[] = [];
  if (!out.ok || out.pending) broken.push("draw not made");
  if (won.length !== Math.min(want, entries.length)) broken.push("R1");
  if (new Set(won).size !== won.length) broken.push("R2");
  if (!won.every((w) => entries.includes(w))) broken.push("R3");
  if (JSON.stringify(won) !== JSON.stringify(expected)) broken.push("R4");
  if (d.entries !== entries.length) broken.push("R5");
  if (seats.some((s) => s.state === "blockedBefore" && won.includes(s.pid))) broken.push("R6");
  if (seats.some((s) => (s.joined === "after" || s.state === "roster") && won.includes(s.pid))) broken.push("R7");
  if (JSON.stringify(asked) !== JSON.stringify([target]) || (manual && roundMs(target) <= press) || d.round !== target) broken.push("R8");
  if (!again.ok || !("already" in again && again.already)) broken.push("R9");
  const oldBroken = JSON.stringify(oldExpected) !== JSON.stringify(expected); // the old list would have named different winners than the list that stood when the list closed
  return { broken, oldBroken, k };
}

describe("many draws, every rule, an independent oracle", () => {
  test(`${SCENARIOS} draws (automatic and manual, removals before and after the list closed, late seats, leavers): the rule failure rate is 0`, async () => {
    const r = rng(SEED); let failed = 0, oldFailed = 0; const why: Record<string, number> = {};
    for (let k = 0; k < SCENARIOS; k++) {
      const s = await scenario(r, k);
      if (s.broken.length) { failed++; for (const b of s.broken) why[b] = (why[b] ?? 0) + 1; }
      if (s.oldBroken) oldFailed++;
    }
    const pct = (x: number) => ((100 * x) / SCENARIOS).toFixed(2) + "%";
    console.log(`DRAW SIMULATION: seed ${SEED}, ${SCENARIOS} draws. Rule failures now: ${failed} (${pct(failed)}). Control, the OLD entry list on the same draws: ${oldFailed} (${pct(oldFailed)}).`, JSON.stringify(why));
    expect(failed).toBe(0);
    expect(oldFailed).toBeGreaterThan(0); // the control: the simulation does see the old fault
  }, 120_000);
});
void roundAt;

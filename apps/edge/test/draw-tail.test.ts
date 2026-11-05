// Round 3 (5 Nov 2026 audit): the draw is committed once; the tail (end of game, winner record, prizes, e-mails) can be stopped by a passing database hiccup and is then FINISHED by the next call, never lost, never done twice.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { drawTiming } from "../src/lifecycle";
import { DRAW_SCHEMA, drawTick, runDraw, saveDrawSettings } from "../src/draw";
import { lazyTickReset } from "../src/worker";
import { HOUR, W, create, one, reset, restore, roundMs, startIn, uid } from "./param-harness";

const OVERLOAD = "D1_ERROR: D1 DB is overloaded. Too many resources consumed within a 10 second window";
beforeEach(() => { reset(); lazyTickReset(); });
afterEach(restore);

const wrap = (s: any, fail: (sql: string) => void, sql: string): any => new Proxy(s, {
  get(t, k) { const v = t[k]; if (k === "bind") return (...a: any[]) => wrap(v.apply(t, a), fail, sql); if (k === "run" || k === "first" || k === "all") return async (...a: any[]) => { fail(sql); return v.apply(t, a); }; return typeof v === "function" ? v.bind(t) : v; },
});
const flaky = (fail: (sql: string) => void) => { const real = W.env.DB as any; (W.env as any).DB = new Proxy(real, { get(t, k) { if (k === "prepare") return (q: string) => wrap(t.prepare(q), fail, q); const v = t[k]; return typeof v === "function" ? v.bind(t) : v; } }); return () => { (W.env as any).DB = real; }; };

async function drawnGame() {
  const id = uid("LDT");
  expect((await create(undefined, id, { startRound: startIn(-HOUR), callSeconds: 6, cap: 5000 })).status).toBe(200);
  for (const s of DRAW_SCHEMA) await W.env.DB.prepare(s).run();
  await saveDrawSettings(W.env.DB, id, { winners: 1, prizes: ["Hamper"], mode: "manual", ref: "0" }, roundMs(startIn(-2 * HOUR)));
  const now = roundMs(startIn(-HOUR)) + 5000;
  // exactly what runDraw commits: the result, and the "tail owed" marker, together
  await W.env.DB.batch([
    W.env.DB.prepare("UPDATE draw SET drawn_ms=?, round=1, beacon='aa', result=?, by_role='organizer', entries=1 WHERE eid=?").bind(now, JSON.stringify([{ pid: "1x000000000001", place: 0 }]), id),
    W.env.DB.prepare("INSERT INTO kv(k,v) VALUES(?,?)").bind(`drawpend/${id}`, String(now)),
  ]);
  return { id, now, e: one("SELECT * FROM engagement WHERE id=?", id) };
}
const owed = (id: string) => one("SELECT COUNT(*) c FROM kv WHERE k=?", `drawpend/${id}`).c as number;
const prizes = (id: string) => one("SELECT COUNT(*) c FROM prize WHERE eid=?", id).c as number;
const winners = (id: string) => one("SELECT COUNT(*) c FROM winner WHERE eid=?", id).c as number;

describe("the tail of a draw that was committed", () => {
  test("a hiccup while the winner record is written: the draw stands, the tail stays owed, the next press finishes it exactly once", async () => {
    const { id, now, e } = await drawnGame();
    let fails = 1; const un = flaky((sql) => { if (fails > 0 && sql.startsWith("INSERT INTO winner")) { fails--; throw new Error(OVERLOAD); } });
    const t = await drawTiming(W.env as any, e, now);
    await expect(runDraw(W.env as any, e, now, t, "organizer")).rejects.toThrow(/overloaded/); // the route turns this into the friendly 503
    expect(fails).toBe(0); expect(owed(id)).toBe(1); expect(prizes(id)).toBe(0); // not finished, and still marked as owed
    un();
    const r = await runDraw(W.env as any, e, now, t, "organizer"); expect(r).toEqual({ ok: true, already: true });
    expect(owed(id)).toBe(0); expect(prizes(id)).toBe(1); expect(winners(id)).toBe(1);
    const again = await runDraw(W.env as any, e, now, t, "organizer"); expect(again).toEqual({ ok: true, already: true }); // a plain repeat changes nothing
    expect(prizes(id)).toBe(1); expect(winners(id)).toBe(1);
  });
  test("the scheduled run finishes an owed tail by itself", async () => {
    const { id, now, e } = await drawnGame();
    expect(owed(id)).toBe(1);
    await drawTick(W.env as any, now + 60_000, (x) => drawTiming(W.env as any, x, now + 60_000));
    expect(owed(id)).toBe(0); expect(prizes(id)).toBe(1);
  });
  test("a draw made before this change has no marker and is left exactly as it is", async () => {
    const { id, now, e } = await drawnGame();
    await W.env.DB.prepare("DELETE FROM kv WHERE k=?").bind(`drawpend/${id}`).run();
    await drawTick(W.env as any, now + 60_000, (x) => drawTiming(W.env as any, x, now + 60_000));
    expect(prizes(id)).toBe(0); expect(winners(id)).toBe(0);
  });
});

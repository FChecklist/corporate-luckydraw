// LD-41 (owner-approved wording): the finished-game record of a Lucky Draw is the draw time, one line per winner (seat only) and the end. No call lines.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { endBoundMs, lifecycleTick } from "../src/lifecycle";
import { gameLogEvents, readGameLog } from "../src/gamelog";
import { DRAW_SCHEMA, saveDrawSettings } from "../src/draw";
import { zoneFull, DEFAULT_TZ } from "../src/tz";
import { lazyTickReset } from "../src/worker";
import { HOUR, MIN, T, W, create, join, one, q, reset, restore, startIn, uid } from "./param-harness";

beforeEach(() => { reset(); lazyTickReset(); });
afterEach(restore);
const rms = (r: number) => (1692803367 + (r - 1) * 3) * 1000;
const TT = (ms: number) => zoneFull(ms, DEFAULT_TZ);

describe("the events of a finished Lucky Draw (pure)", () => {
  const dueMs = rms(1000), endMs = dueMs + 3000;
  const lw = (ordinal: number, seat: number) => ({ round: 1, pattern: "lucky", ordinal, seat, idx: 0 });
  const base = { id: "G-1", startRound: 1000, callSeconds: 6, rounds: 1, breaks: [], endSrc: "phones", lines: {}, st: null as any, lucky: { dueMs }, endMs };
  test("start line, one line per winner with the correct ordinal, end line, and nothing else", () => {
    const ev = gameLogEvents({ ...base, winners: [lw(3, 9), lw(1, 5), lw(21, 7), lw(2, 4)] });
    expect(ev.map((e) => e.text)).toEqual([
      `Game G-1: the draw is due at ${TT(dueMs)}.`,
      "1st place was won by seat 5.",
      "2nd place was won by seat 4.",
      "3rd place was won by seat 9.",
      "21st place was won by seat 7.",
      `The draw was made (4 winners). The game ended at ${TT(endMs)}.`,
    ]);
  });
  test("after a Stop the end line says it was ended by the organizer", () => {
    const ev = gameLogEvents({ ...base, winners: [lw(1, 5)], st: { intervals: [], stopRound: 990 } });
    expect(ev[ev.length - 1]!.text).toBe(`The draw was made (1 winner). The game ended by the organizer at ${TT(endMs)}.`);
  });
  test("no call lines, no 'All prizes' sentence, no public-round wording", () => {
    const text = gameLogEvents({ ...base, winners: [lw(1, 5)] }).map((e) => e.text).join("\n");
    expect(text).not.toMatch(/Call \d|worked out from public round|All prizes were awarded|numbers were called|card /);
  });
  test("a game that is not a Lucky Draw keeps the Bingo-style log", () => {
    const ev = gameLogEvents({ ...base, lucky: undefined, winners: [] });
    expect(ev.some((e) => /the draw is due at/.test(e.text))).toBe(false); // the Lucky Draw wording is only used for a Lucky Draw
  });
});

describe("through the real lifecycle", () => {
  test("the saved log of a drawn game holds the approved lines and the 'lucky' winners", async () => {
    const id = uid("LDL");
    expect((await create(undefined, id, { startRound: startIn(-2 * HOUR), callSeconds: 6, cap: 5000 })).status).toBe(200);
    for (let i = 1; i <= 3; i++) expect((await join(id, i, {}, T - 3 * HOUR)).status).toBe(200);
    for (const s of DRAW_SCHEMA) await W.env.DB.prepare(s).run();
    await saveDrawSettings(W.env.DB, id, { winners: 2, prizes: [], mode: "manual", ref: "0" }, T - 3 * HOUR);
    const drawnMs = T - HOUR;
    W.raw.prepare("UPDATE draw SET drawn_ms=?, entries=3, result='[]' WHERE eid=?").run(drawnMs, id);
    W.raw.prepare("INSERT INTO winner(eid,round,pattern,ordinal,seat,idx,at_ms,src) VALUES(?,?,?,?,?,?,?,?)").run(id, 1, "lucky", 1, 2, 0, drawnMs, "draw");
    W.raw.prepare("INSERT INTO winner(eid,round,pattern,ordinal,seat,idx,at_ms,src) VALUES(?,?,?,?,?,?,?,?)").run(id, 1, "lucky", 2, 3, 0, drawnMs, "draw");
    W.raw.prepare("INSERT INTO life(eid,end_ms,end_src) VALUES(?,?,'phones') ON CONFLICT(eid) DO UPDATE SET end_ms=excluded.end_ms, end_src='phones'").run(id, drawnMs);
    const end = await endBoundMs(W.env as any, one("SELECT * FROM engagement WHERE id=?", id));
    await lifecycleTick(W.env as any, end + 5 * MIN);
    const lines = (await readGameLog(W.env as any, id)).map((l) => l.text);
    const e = one("SELECT * FROM engagement WHERE id=?", id);
    expect(lines).toEqual([
      `Game ${id}: the draw is due at ${TT(rms(e.start_round))}.`,
      "1st place was won by seat 2.",
      "2nd place was won by seat 3.",
      `The draw was made (2 winners). The game ended at ${TT(drawnMs)}.`,
    ]);
    expect(q("SELECT 1 FROM game_log WHERE eid=? AND text LIKE 'Call %'", id).length).toBe(0);
  }, 30_000);
});

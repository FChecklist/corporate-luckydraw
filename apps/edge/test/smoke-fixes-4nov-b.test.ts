// Smoke-test fixes of 2026-11-04, owner-decided items: LD-36 (a Stop before the draw cancels the automatic draw: registering closes and the Organizer draws by hand).
// The public beacon cannot be reached from a test, so "the organizer can still draw" is shown by the draw getting PAST the "this draw is automatic" refusal (409) to the beacon step (503).
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { drawTiming } from "../src/lifecycle";
import { DRAW_SCHEMA, drawFacts, drawRow, drawTick, registrationClosed, runDraw, saveDrawSettings } from "../src/draw";
import { lazyTickReset } from "../src/worker";
import { HOUR, MIN, W, create, one, reset, restore, roundMs, startIn, uid } from "./param-harness";

beforeEach(() => { reset(); lazyTickReset(); });
afterEach(restore);

async function drawGame(mode: "auto" | "manual" = "auto") {
  const id = uid("LDS");
  expect((await create(undefined, id, { startRound: startIn(-HOUR), callSeconds: 6, cap: 5000 })).status).toBe(200);
  for (const s of DRAW_SCHEMA) await W.env.DB.prepare(s).run();
  await saveDrawSettings(W.env.DB, id, { winners: 1, prizes: [], mode, ref: "0" }, roundMs(startIn(-2 * HOUR)));
  return one("SELECT * FROM engagement WHERE id=?", id);
}
/** Publishes the Organizer's control log directly (a stored log is already accepted; resolving it does not re-check signatures). */
async function publishStop(e: any, stopRound: number) {
  const file = { v: 1, engagementId: e.id, pubKey: "00".repeat(32), maxPauseRounds: 600, leadRounds: 0, messages: [{ engagementId: e.id, seq: 1, action: "stop", atBeaconRound: stopRound, signedAtRound: stopRound - 10, sig: "x", by: "organizer" }] };
  await W.env.DB.prepare("INSERT INTO kv(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").bind(`control/${e.id}.json`, JSON.stringify(file)).run();
}

describe("LD-36: after a Stop before the draw there is no automatic draw at the old time", () => {
  test("without a stop the timing is the published draw time and an automatic draw runs as before", async () => {
    const e = await drawGame("auto"); const now = roundMs(e.start_round) + 10 * MIN;
    const t = await drawTiming(W.env as any, e, now);
    expect(t.stopped).toBe(false); expect(t.drawRound).toBe(e.start_round);
    const r = await runDraw(W.env as any, e, now, t, "auto");
    expect(r.ok === false && r.status).toBe(503); // got as far as asking the public beacon (not reachable in a test); not refused as "not draw time"
  }, 30_000);

  test("a stop before the draw time: drawTiming never reaches a draw round, the page data says drawMs null / closed / manual", async () => {
    const e = await drawGame("auto"); await publishStop(e, e.start_round - 20);
    const now = roundMs(e.start_round) + 10 * MIN; // well past the old draw time
    const t = await drawTiming(W.env as any, e, now);
    expect(t.stopped).toBe(true); expect(t.drawRound).toBe(Infinity); expect(t.paused).toBe(false);
    const f: any = await drawFacts(W.env as any, e, now, t, null);
    expect(f.draw.drawMs).toBeNull(); expect(f.draw.closed).toBe(true); expect(f.draw.mode).toBe("manual"); expect(f.draw.stopped).toBe(true); expect(f.draw.drawn).toBe(false);
    const text = JSON.stringify(f); expect(text).toContain('"drawMs":null'); expect(text).not.toMatch(/NaN|Infinity|Invalid/);
    expect(registrationClosed(await drawRow(W.env.DB, e.id), now, Infinity, false, true)).toBe(true);
    expect(registrationClosed(await drawRow(W.env.DB, e.id), roundMs(e.start_round) - HOUR, roundMs(e.start_round), false, false)).toBe(false); // an automatic draw that is not due and not stopped keeps registering open
  });

  test("the scheduled job and an automatic request do NOT draw at the old time after a stop", async () => {
    const e = await drawGame("auto"); await publishStop(e, e.start_round - 20);
    const now = roundMs(e.start_round) + 10 * MIN;
    expect(await drawTick(W.env as any, now, (x) => drawTiming(W.env as any, x, now))).toBe(0);
    const r = await runDraw(W.env as any, e, now, await drawTiming(W.env as any, e, now), "auto");
    expect(r.ok).toBe(false); expect(r.ok === false && r.status).toBe(409);
    const d = await drawRow(W.env.DB, e.id); expect(d!.drawn_ms).toBeNull(); expect(d!.closing_ms).toBeNull();
  });

  test("after the stop the Organizer can still draw by hand (an automatic draw refuses a manual press with 409)", async () => {
    const e = await drawGame("auto"); await publishStop(e, e.start_round - 20);
    const now = roundMs(e.start_round) + 10 * MIN;
    const r = await runDraw(W.env as any, e, now, await drawTiming(W.env as any, e, now), "organizer");
    expect(r.ok === false && r.status).toBe(503); // past the "this draw is automatic" refusal, up to the beacon; the claim was released so a second press can try again
    expect((await drawRow(W.env.DB, e.id))!.closing_ms).toBeNull();
    const e2 = await drawGame("auto"); // the same press on an automatic draw that was NOT stopped is still refused
    const r2 = await runDraw(W.env as any, e2, now, await drawTiming(W.env as any, e2, now), "organizer");
    expect(r2.ok === false && r2.status).toBe(409);
  }, 30_000);

  test("a stop AFTER the draw time changes nothing (the draw time had already passed)", async () => {
    const e = await drawGame("auto"); await publishStop(e, e.start_round + 500);
    const t = await drawTiming(W.env as any, e, roundMs(e.start_round) + MIN);
    expect(t.stopped).toBe(false); expect(t.drawRound).toBe(e.start_round);
  });
});

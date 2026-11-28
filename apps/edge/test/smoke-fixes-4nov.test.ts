// Smoke-test fixes of 2026-11-04 (100-million-scenario run): LD-12 place names, LD-14 everybody seated is in the draw, LD-27 the two employee-ID cleaners agree.
import { describe, expect, test } from "bun:test";
import { luckyDrawRules, prizePlaces, ordinalOf } from "../../../vendor/game-core/packages/luckydraw/src";
import { cleanEmpId, newClock, start } from "../../../vendor/game-core/packages/core/src";
import { empClean } from "../src/people";

describe("LD-12: places are named in correct English", () => {
  test("the first 25 and the hundreds", () => {
    expect(prizePlaces(25)).toEqual(["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th", "10th", "11th", "12th", "13th", "14th", "15th", "16th", "17th", "18th", "19th", "20th", "21st", "22nd", "23rd", "24th", "25th"]);
    expect([101, 102, 103, 111, 112, 113, 121, 1000].map(ordinalOf)).toEqual(["101st", "102nd", "103rd", "111th", "112th", "113th", "121st", "1000th"]);
  });
  test("the draw's own outcome carries the same words", () => {
    const clk = start(newClock()); const ids = Array.from({ length: 30 }, (_, i) => "P" + i);
    let s = luckyDrawRules.init({ eid: "E", winners: 25, draw: "manual", ref: "0" }, [], 0);
    s = luckyDrawRules.step(s, { type: "registerMany", players: ids }, 1, clk).state;
    const out = luckyDrawRules.step(s, { type: "draw", by: "organizer", beacon: "abc" }, 2, clk).out.filter((o: any) => o.kind === "win").map((o: any) => o.position);
    expect(out).toEqual(prizePlaces(25));
  });
});
describe("LD-14: everybody seated in a rehearsal is in the draw", () => {
  test("20 seated, cap 20 given by the server: all 20 are entries", () => {
    const clk = start(newClock()); const ids = Array.from({ length: 20 }, (_, i) => "R" + i);
    let s = luckyDrawRules.init({ eid: "E", winners: 1, draw: "manual", ref: "0", rehearsal: true, cap: 20 }, [], 0);
    s = luckyDrawRules.step(s, { type: "registerMany", players: ids }, 1, clk).state;
    expect(s.entries.length).toBe(20);
  });
  test("with no cap given, a rehearsal falls back to the manifest limit (10)", () => {
    const clk = start(newClock()); const ids = Array.from({ length: 20 }, (_, i) => "R" + i);
    let s = luckyDrawRules.init({ eid: "E", winners: 1, draw: "manual", ref: "0", rehearsal: true }, [], 0);
    s = luckyDrawRules.step(s, { type: "registerMany", players: ids }, 1, clk).state;
    expect(s.entries.length).toBe(10);
  });
});
describe("LD-27: the platform and the game core clean an employee ID the same way", () => {
  for (const raw of ["FGZ75GM8Jß", "-KＡz_-QǰA_ıbßßßKAＡQŉǰ٣-ǰ_", "1b-678", "ﬃx", "é1", "ı", "ẞ1"]) test(JSON.stringify(raw), () => expect(cleanEmpId(raw)).toBe(empClean(raw)));
});

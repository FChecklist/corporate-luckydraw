// Uniform employee ID (owner rule 2026-10-30): NFKC, upper case, keep only A-Z and 0-9; empty = refusal; 30 characters at most after cleaning; games made before EMP_CLEAN_FROM_MS keep the old rule.
import { describe, expect, test } from "bun:test";
import { EMP_CLEAN_FROM_MS, empClean, empHashOf, legacyEmpFor, normEmp } from "../src/people";

const NEW = EMP_CLEAN_FROM_MS + 1, OLD = EMP_CLEAN_FROM_MS - 1;
describe("employee ID cleaning", () => {
  test("the four owner examples all become 1B678", () => {
    for (const t of ["1B-678", "1b-678", "1B/678", "1B 678"]) expect([t, normEmp(t, NEW)]).toEqual([t, "1B678"]);
  });
  test("dots, underscores, symbols, accents, full-width letters, emoji and zero-width characters", () => {
    expect(normEmp("e_1.2.3", NEW)).toBe("E123");
    expect(normEmp("ＡＢ１２", NEW)).toBe("AB12"); // full-width letters and digits fold with NFKC
    expect(normEmp("1B​-6‍78﻿", NEW)).toBe("1B678");
    expect(normEmp("1B😀678", NEW)).toBe("1B678");
    expect(normEmp("é1ü", NEW)).toBe("1"); // accents are dropped, not folded
    expect(normEmp("१२३ AB", NEW)).toBe("AB"); // non-English digits and letters go
    expect(empClean("ß1")).toBe("SS1");
  });
  test("nothing typed is empty; only symbols is a refusal; the cap is 30 after cleaning", () => {
    expect(normEmp("", NEW)).toBe(""); expect(normEmp("   ", NEW)).toBe(""); expect(normEmp("​", NEW)).toBe(""); expect(normEmp(undefined, NEW)).toBe("");
    expect(normEmp("---", NEW)).toBeNull(); expect(normEmp("😀😀", NEW)).toBeNull();
    expect(normEmp("A".repeat(30), NEW)).toBe("A".repeat(30)); expect(normEmp("A".repeat(31), NEW)).toBeNull();
    expect(normEmp("A-".repeat(30), NEW)).toBe("A".repeat(30)); // 60 typed, 30 after cleaning: fine
  });
  test("the same person typed four ways is one person (one hash)", async () => {
    const env = { PHONE_SALT: "s" }, hs = await Promise.all(["1B-678", "1b-678", "1B/678", "1B 678"].map((t) => empHashOf(env, normEmp(t, NEW)!)));
    expect(new Set(hs).size).toBe(1);
  });
  test("20 Nov 2026: the one rule applies to EVERY game, old or new (the game's age no longer changes it)", () => {
    expect(normEmp("1B/678", OLD)).toBe("1B678"); expect(normEmp("1B 678", OLD)).toBe("1B678"); expect(normEmp("1B😀", OLD)).toBe("1B"); expect(normEmp("---", OLD)).toBeNull();
    expect(EMP_CLEAN_FROM_MS).toBe(0);
  });
  test("an older game is also looked up in the form an older release stored (A-1101 stays findable as A-1101)", () => {
    expect(legacyEmpFor("1b/678", { created_ms: 1 })).toBe("1B/678"); expect(legacyEmpFor("1B 678", { created_ms: 1 })).toBeNull(); expect(legacyEmpFor("1B😀", { created_ms: 1 })).toBeNull();
  });
  test("without a game time the new rule applies", () => { expect(normEmp("1B-678")).toBe("1B678"); });
});

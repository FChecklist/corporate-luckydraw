// AUDIT M2 and M3: (a) going live is ONE step: PAY_VIA_CONSOLE and CONSOLE_PUBKEYS together, with a check that says which one is missing; (b) this game's own sign-in doors (/api/start, /api/auth/*) go to home when live;
// the old sign-in page lets only the console's hand-off through (t AND go=console); (c) the console page's CSP: frame-src is the payment window only, connect-src allows the console, no wildcard, no Google, no Razorpay;
// (d) the descriptor says payGame and consoleOrigin.
// FALSIFIED BY: effectiveFlag returning the raw flag (half switch redirects), signinRedirect letting any 48-hex token through, a wildcard or Google put back into the console page's CSP.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { goLiveState, effectiveFlag, legacyLoginRedirect, signinRedirect, HOME_ORIGIN, CONSOLE_ORIGIN } from "../src/console-origin";
import { onRequest } from "../../../pages/functions/_middleware";
import { makeD1 } from "./d1-sqlite";
import { handle } from "./with-terms";

const T = Date.UTC(2026, 10, 20, 10, 0, 0);
const req = (path: string, method = "GET") => new Request("https://luckydraw.test" + path, { method });
const TOK = "ab".repeat(24);
const mw = async (path: string, env: Record<string, string>, method = "GET") => { let passed = false; const r = await onRequest({ request: req(path, method), env, next: async () => { passed = true; return new Response("page"); } }); return { passed, status: r.status, location: r.headers.get("location") }; };
const both = { PAY_VIA_CONSOLE: "1", CONSOLE_PUBKEYS: "k1:abc" };

describe("go-live is one step, and the check says what is missing", () => {
  test("dark (neither), ready (both) and the two half switches", () => {
    expect(goLiveState({})).toMatchObject({ dark: true, ready: false, problems: [] });
    expect(goLiveState(both)).toMatchObject({ ready: true, dark: false, problems: [] });
    expect(goLiveState({ PAY_VIA_CONSOLE: "1" }).problems[0]).toMatch(/CONSOLE_PUBKEYS is not set/);
    expect(goLiveState({ CONSOLE_PUBKEYS: "k1:abc" }).problems[0]).toMatch(/PAY_VIA_CONSOLE is not 1/);
    expect(goLiveState({ PAY_VIA_CONSOLE: "1", CONSOLE_PUBKEYS: "  " }).ready).toBe(false);
    expect(goLiveState({ PAY_VIA_CONSOLE: "true", CONSOLE_PUBKEYS: "k1:abc" }).ready).toBe(false);
  });
  test("a half switch redirects NOTHING (a flag without keys must not send people to a console that cannot tell the game it was paid)", async () => {
    expect(effectiveFlag({ PAY_VIA_CONSOLE: "1" })).toBeUndefined(); expect(effectiveFlag({ CONSOLE_PUBKEYS: "k1:abc" })).toBeUndefined(); expect(effectiveFlag(both)).toBe("1");
    expect((await mw("/pay.html", { PAY_VIA_CONSOLE: "1" })).passed).toBe(true);
    expect((await mw("/api/start", { PAY_VIA_CONSOLE: "1" }, "POST")).passed).toBe(true);
    expect((await mw("/pay.html", { CONSOLE_PUBKEYS: "k1:abc" })).passed).toBe(true);
  });
  test("both set: the old pay pages go to the console, the old sign-in doors and the sign-in page go to home, the console's own hand-off still works", async () => {
    expect(await mw("/pay.html", both)).toMatchObject({ passed: false, status: 302, location: CONSOLE_ORIGIN + "/" });
    for (const [path, m] of [["/api/start", "POST"], ["/api/auth/email", "POST"], ["/api/auth/google", "POST"], ["/api/auth/link", "POST"], ["/api/auth/verify", "POST"], ["/api/auth/config", "GET"]] as const) expect([path, await mw(path, both, m)]).toEqual([path, { passed: false, status: 302, location: HOME_ORIGIN + "/" }]);
    expect((await mw("/api/console/handoff/redeem", both, "POST")).passed).toBe(true);
    expect((await mw("/api/console/paid", both, "POST")).passed).toBe(true);
    expect((await mw("/signin.html", both)).status).toBe(302); // no token
    expect((await mw(`/signin.html?t=${TOK}`, both)).status).toBe(302); // a token from the old e-mail sign-in: gone
    expect((await mw(`/signin.html?t=${TOK}&go=ai`, both)).status).toBe(302);
    expect((await mw(`/signin.html?t=${TOK}&go=console&e=AB-12`, both)).passed).toBe(true); // only the console's hand-off lands here
  });
  test("signinRedirect and legacyLoginRedirect do nothing without the flag", () => {
    expect(signinRedirect(req("/signin.html"), undefined)).toBeNull(); expect(legacyLoginRedirect(req("/api/start", "POST"), undefined)).toBeNull();
  });
});

describe("through the Worker", () => {
  let env: any; const realFetch = globalThis.fetch;
  beforeEach(() => { const d = makeD1(); env = { DB: d.db, ORGANIZER_SECRET: "plat", DAILY_WRITE_BUDGET: "1000000", PUBLIC_ORIGIN: "https://luckydraw.test", PHONE_SALT: "salt" }; (globalThis as any).fetch = async () => new Response("{}", { status: 404 }); });
  afterEach(() => { globalThis.fetch = realFetch; });
  const w = (path: string, extra: Record<string, string>, method = "POST", body: unknown = { email: "a@b.invalid" }) => handle(new Request("http://x" + path, { method, headers: { "content-type": "application/json", "cf-connecting-ip": "4.4.4.4" }, body: method === "GET" ? undefined : JSON.stringify(body) }), { ...env, ...extra }, T);
  test("/api/start (the game's own sign-up) answers 302 to home when live, and still works while dark", async () => {
    const live = await w("/api/start", both); expect(live.status).toBe(302); expect(live.headers.get("location")).toBe(HOME_ORIGIN + "/");
    expect((await w("/api/start", {})).status).toBe(200);
  });
  test("the health check fails on a half switch and says which setting is missing; it shows booleans only", async () => {
    const ok = await (await w("/api/status/health", {}, "GET")).json() as any; expect(ok.ok).toBe(true); expect(ok.go_live).toMatchObject({ dark: true, ready: false, problems: [] });
    const half = await (await w("/api/status/health", { CONSOLE_PUBKEYS: "k1:secretkeybytes" }, "GET")).json() as any;
    expect(half.ok).toBe(false); expect(half.go_live.problems[0]).toMatch(/PAY_VIA_CONSOLE is not 1/); expect(JSON.stringify(half)).not.toContain("secretkeybytes");
    const live = await (await w("/api/status/health", both, "GET")).json() as any; expect(live.ok).toBe(true); expect(live.go_live).toMatchObject({ ready: true, problems: [] });
  });
});

describe("the console page: what its CSP allows", () => {
  const out = spawnSync("bun", ["run", "pages/build.mjs"], { cwd: new URL("../../../", import.meta.url).pathname, encoding: "utf8" });
  const headers = out.status === 0 ? readFileSync(new URL("../../../pages/public/_headers", import.meta.url), "utf8") : "";
  const rule = (src: string, path: string) => { const i = src.indexOf("\n" + path + "\n"); return i < 0 ? "" : (src.slice(i + 1).match(/Content-Security-Policy: ([^\n]*)/)?.[1] ?? ""); };
  const dev = readFileSync(new URL("../../web/public/_headers", import.meta.url), "utf8");
  test("the build ran", () => { expect(out.status).toBe(0); });
  for (const [label, src, paths] of [["deployed (pages/build.mjs)", () => headers, ["/zc", "/zc.html"]], ["the file in the repo (apps/web/public/_headers)", () => dev, ["/zc.html"]]] as const) {
    test(`${label}: frame-src is the payment window only; connect-src lets the page ask the console; no wildcard, no Google, no Razorpay`, () => {
      for (const p of paths) {
        const csp = rule(src(), p); expect([p, csp.length > 0]).toEqual([p, true]);
        expect(csp.match(/frame-src ([^;]*);/)?.[1]).toBe("https://itservices-rajat-agarwal.pages.dev");
        expect(csp.match(/connect-src ([^;]*);/)?.[1]).toContain("https://console.corporatetambola.com");
        expect([p, /\*|https:\s*;|google|razorpay/i.test(csp)]).toEqual([p, false]);
      }
    });
  }
  test("the sign-in landing has its own rules (no frames, no Google, no Razorpay), and its page does not load Google", () => {
    for (const csp of [rule(headers, "/signin.html"), rule(headers, "/signin"), rule(dev, "/signin.html")]) { expect(csp.length).toBeGreaterThan(0); expect(csp).not.toMatch(/frame-src|google|razorpay|\*/i); expect(csp).toContain("frame-ancestors 'none'"); }
    expect(readFileSync(new URL("../../web/public/signin.html", import.meta.url), "utf8")).not.toMatch(/google/i);
    expect(readFileSync(new URL("../../web/public/signin.js", import.meta.url), "utf8")).not.toMatch(/google/i);
  });
});

describe("the console page's descriptor", () => {
  test("it says which game this is (payGame) and where the console lives (consoleOrigin)", () => {
    const zc = readFileSync(new URL("../../web/public/zc.js", import.meta.url), "utf8");
    expect(zc).toMatch(/ZFLOW_GAME = Object\.assign\(window\.ZFLOW_GAME \|\| \{\}, \{ game: "luckydraw", payGame: "luckydraw", consoleOrigin: CONSOLE \}\)/);
    expect(zc).toContain('CONSOLE = "https://console.corporatetambola.com"');
  });
});

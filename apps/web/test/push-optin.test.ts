// "Notify me when this game begins" (1.6.0), the game page (z.html). The block is the shared corporate-push client, copied unchanged; it is DARK while apps/web/public/push-config.js is empty.
// Proves: (1) dark = nothing shown, no alert script or style added, no request, no permission question; (2) with a real https address the block appears for a live game, "Stop notifications" is visible,
// and still nothing is asked or requested on load (the permission question comes only from a tap); (3) it is hidden for a draft, a cancelled or an unknown game; the "game over" signal reaches the block;
// (4) the copied files are byte-for-byte the audited ones (SHA-256), the worker snippet differs only by 'luckydraw' in the host list, the worker loads it with one tap handler;
// (5) the headers: script-src stays 'self', the push address reaches connect-src only when it is a real https address; (6) the privacy wording; (7) the build ships the new files and the device-storage list names the button's keys.
// FALSIFIED BY (planted, saw these tests fail, restored): making the loader act when the address is empty; adding requestPermission to the load path; editing one byte of push-optin.js; dropping 'luckydraw' from the snippet;
// hiding Stop; removing the importScripts line; widening script-src; leaving the push address out of connect-src when set; leaving 'not personal data' wording in.
import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Window } from "happy-dom";
import { pushOriginOf, withPushConnect } from "../../../pages/push-config.mjs";

const PUB = join(import.meta.dir, "../public");
const ROOT = join(import.meta.dir, "../../..");
const rd = (f: string) => readFileSync(join(PUB, f), "utf8");
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const API = "https://push.corporatetambola.com";
const wins: any[] = [];
afterEach(async () => { for (const w of wins.splice(0)) { try { await w.happyDOM.close(); } catch { /* closed */ } } });

interface Seen { fetch: string[]; permission: number; register: number; registration: number }
function open(o: { api?: string; realConfig?: boolean } = {}) {
  const win: any = new Window({ url: "https://luckydraw.corporatetambola.com/z.html?e=PUSH-1", settings: { disableJavaScriptFileLoading: true, disableCSSFileLoading: true } });
  wins.push(win);
  for (const n of ["Uint8Array", "Uint16Array", "Uint32Array", "Boolean", "Array", "Object", "String", "Number", "Math", "JSON", "Date", "Promise", "RegExp", "URL", "URLSearchParams", "encodeURIComponent", "decodeURIComponent", "parseInt", "Error", "Set", "Map", "Notification"])
    if (win[n] === undefined && (globalThis as any)[n] !== undefined && n !== "Notification") win[n] = (globalThis as any)[n];
  win.document.write(`<html><head><title>t</title></head><body><main id="app">game</main><div id="cbpush" hidden></div></body></html>`);
  const seen: Seen = { fetch: [], permission: 0, register: 0, registration: 0 };
  win.fetch = async (u: any) => { seen.fetch.push(String(u)); return new Response("{}", { status: 200 }); };
  win.Notification = { permission: "default", requestPermission: () => { seen.permission++; return Promise.resolve("denied"); } };
  win.PushManager = class {};
  Object.defineProperty(win.navigator, "serviceWorker", { configurable: true, value: { getRegistration: () => { seen.registration++; return Promise.resolve(undefined); }, register: () => { seen.register++; return Promise.resolve({}); }, ready: new Promise(() => {}) } });
  const run = (code: string) => new Function("window", `with (window) { ${code}\n}`).call(win, win);
  if (o.realConfig) run(rd("push-config.js")); else win.CB_PUSH_API = o.api ?? "";
  run(rd("push-loader.js"));
  const host = () => win.document.getElementById("cbpush");
  const extras = () => [...win.document.head.querySelectorAll("script, link")].map((n: any) => n.getAttribute("src") || n.getAttribute("href"));
  return { win, seen, run, host, extras, flush: () => new Promise((r) => setTimeout(r, 20)) };
}
const LIVE = { eid: "PUSH-1", show: true, ended: false };

describe("dark: the setting is empty today", () => {
  test("the shipped setting is the empty string, and the build reads it as 'no address'", () => {
    expect(rd("push-config.js")).toMatch(/^window\.CB_PUSH_API = "";$/m);
    expect(pushOriginOf(rd("push-config.js"))).toBe("");
  });
  test("with the real push-config.js: nothing shown, nothing added to the page, no request, no permission question", async () => {
    const p = open({ realConfig: true });
    expect(p.win.CBPush.live).toBe(false);
    p.win.CBPush.update(LIVE); p.win.CBPush.update({ ...LIVE, ended: true });
    await p.flush();
    expect(p.host().hidden).toBe(true); expect(p.host().children.length).toBe(0);
    expect(p.win.document.querySelector("[data-push-optin]")).toBeNull();
    expect(p.extras()).toEqual([]); // no push-optin.js, no push-optin.css
    expect(p.seen).toEqual({ fetch: [], permission: 0, register: 0, registration: 0 });
  });
  for (const bad of ["", "   ", "http://push.corporatetambola.com", "https://u:p@push.corporatetambola.com", "https://push.corporatetambola.com/?a=1", "https://push.corporatetambola.com/#x", "https://localhost", "push.corporatetambola.com", "javascript:alert(1)"]) {
    test(`an address that is not a real https address (${JSON.stringify(bad)}) is dark too`, async () => {
      const p = open({ api: bad });
      expect(p.win.CBPush.live).toBe(false);
      p.win.CBPush.update(LIVE); await p.flush();
      expect(p.host().children.length).toBe(0); expect(p.extras()).toEqual([]); expect(p.seen.fetch).toEqual([]);
      expect(pushOriginOf(`window.CB_PUSH_API = "${bad}";`)).toBe("");
    });
  }
});

describe("configured: the block for a live game", () => {
  test("a real https address: the block appears with the game's id, the privacy link, the button AND Stop (visible); no request, no permission question, no worker registration on load", async () => {
    const p = open({ api: API + "/" }); // a trailing slash is trimmed
    expect(p.win.CBPush.live).toBe(true);
    p.win.CBPush.update(LIVE);
    expect(p.host().hidden).toBe(false);
    const box = p.win.document.querySelector("[data-push-optin]");
    expect(box.getAttribute("data-push-api")).toBe(API); expect(box.getAttribute("data-push-site")).toBe("game"); expect(box.getAttribute("data-push-game-id")).toBe("PUSH-1");
    expect(box.getAttribute("data-push-privacy")).toBe("/privacy.html"); expect(box.getAttribute("data-push-sw")).toBe("/zsw.js"); expect(box.getAttribute("data-push-ended")).toBe("false");
    expect(p.extras()).toEqual(["/push-optin.css", "/push-optin.js"]); // the two client files are added only now
    p.run(rd("push-optin.js")); // what the browser does when /push-optin.js has loaded
    const stop = p.win.document.querySelector(".cp-optin__stop"), enable = p.win.document.querySelector(".cp-optin__btn");
    expect(stop).not.toBeNull(); expect(stop.hidden).toBe(false); expect(stop.textContent).toBe("Stop notifications");
    expect(enable.textContent).toBe("Yes, notify me when this game begins"); expect(enable.hidden).toBe(false);
    expect(p.win.document.querySelector(".cp-optin__privacy a").getAttribute("href")).toBe("/privacy.html");
    await p.flush();
    expect(p.seen).toEqual({ fetch: [], permission: 0, register: 0, registration: 0 }); // nothing happened by itself
  });
  test("the permission question comes only from a tap", async () => {
    const p = open({ api: API });
    p.win.CBPush.update(LIVE); p.run(rd("push-optin.js"));
    p.win.document.querySelector(".cp-optin__btn").click();
    await p.flush();
    expect(p.seen.permission).toBe(1);
    expect(p.win.document.querySelector(".cp-optin__status").textContent).toMatch(/blocked/i); // the stand-in said no: nothing was saved or asked of the service
    expect(p.seen.fetch).toEqual([]);
    expect(p.win.document.querySelector(".cp-optin__stop").hidden).toBe(false); // Stop is there in every state
  });
  test("a repaint of the game area never wipes the block (it lives outside #app) and a second update does not add a second block", async () => {
    const p = open({ api: API });
    p.win.CBPush.update(LIVE);
    p.win.document.getElementById("app").innerHTML = "<p>repainted</p>";
    p.win.CBPush.update(LIVE); p.win.CBPush.update(LIVE);
    expect(p.win.document.querySelectorAll("[data-push-optin]").length).toBe(1);
    expect(p.extras().length).toBe(2);
    expect(p.win.document.getElementById("app").contains(p.win.document.querySelector("[data-push-optin]"))).toBe(false);
  });
  test("hidden for a draft or cancelled game (show false) and for an id that is not a game id; shown again when the game is live", () => {
    const p = open({ api: API });
    p.win.CBPush.update({ eid: "PUSH-1", show: false, ended: false });
    expect(p.host().hidden).toBe(true); expect(p.host().children.length).toBe(0); expect(p.extras()).toEqual([]);
    for (const eid of ["", "has space", "a/b", "x".repeat(129), "<script>"]) { p.win.CBPush.update({ eid, show: true, ended: false }); expect(p.host().hidden).toBe(true); expect(p.host().children.length).toBe(0); }
    p.win.CBPush.update(LIVE); expect(p.host().hidden).toBe(false); expect(p.host().children.length).toBe(1);
    p.win.CBPush.update({ eid: "PUSH-1", show: false, ended: false }); expect(p.host().hidden).toBe(true); // a game cancelled later hides the block again
  });
  test("after the game: a block built after the end says so at once; a block already there is told by the attribute and the event", () => {
    const a = open({ api: API }); a.win.CBPush.update({ ...LIVE, ended: true });
    expect(a.win.document.querySelector("[data-push-optin]").getAttribute("data-push-ended")).toBe("true");
    const b = open({ api: API }); b.win.CBPush.update(LIVE);
    const box = b.win.document.querySelector("[data-push-optin]"); let told = 0; box.addEventListener("corporatepush:game-ended", () => { told++; });
    b.win.CBPush.update({ ...LIVE, ended: true }); b.win.CBPush.update({ ...LIVE, ended: true });
    expect(box.getAttribute("data-push-ended")).toBe("true"); expect(told).toBe(1);
  });
  test("z.js calls the loader after each paint with the game id, 'show' only for a live game and 'ended' only after the draw", () => {
    const z = rd("z.js");
    expect(z).toMatch(/window\.CBPush\.update\(\{ eid: EID, show: !!\(I && D && !I\.cancelled && !I\.draft\), ended: !!\(D && D\.drawn\) \}\)/);
  });
});

describe("the page and the files", () => {
  test("z.html: an empty hidden #cbpush outside the game area; config then loader before z.js; no alert markup written into the page", () => {
    const h = rd("z.html");
    expect(h).toMatch(/<\/main>\s*<div id="cbpush" hidden><\/div>/);
    expect(h).not.toContain("data-push-optin");
    const at = (s: string) => h.indexOf(s);
    expect(at('src="/push-config.js')).toBeGreaterThan(at('src="/consent.js')); expect(at('src="/push-loader.js')).toBeGreaterThan(at('src="/push-config.js')); expect(at('src="/z.js')).toBeGreaterThan(at('src="/push-loader.js'));
    expect(h).not.toContain("push-optin.js"); // loaded by the loader only when switched on
  });
  test("the copied client files are byte-for-byte the audited ones (corporate-push client/ at f1e93f59f454)", () => {
    expect(sha(rd("push-optin.js"))).toBe("10daba00f8f6d7a7605f1af1875cfe683bc17c9670fed5be5893ddcd3afc132c");
    expect(sha(rd("push-optin.css"))).toBe("60ee847249cd5af714e269d67b3188225062ff24352864236e3df252d6537e41");
  });
  test("the worker snippet is the audited one with ONE change: 'luckydraw' in the allowed hosts", () => {
    const s = rd("sw-push-snippet.js");
    expect(s).toContain("var CP_ALLOWED_HOSTS = ['home', 'console', 'housie', 'luck', 'bingo', 'luckydraw']");
    expect(sha(s.replace(", 'luckydraw']", "]"))).toBe("ff004604f481bf2ca665441862fc3ebee0ab0f33f7cc610ac2bf3546a5c9ff0b");
    expect(s).toContain("'push'"); expect(s).toContain("'notificationclick'");
  });
  test("zsw.js loads the snippet inside a try/catch, keeps ONE notificationclick handler (the snippet's), lists the two small files, and moves to a newer cache name", () => {
    const sw = rd("zsw.js");
    expect(sw).toMatch(/try \{ importScripts\("\/sw-push-snippet\.js"\); \} catch \(e\)/);
    expect(sw).not.toContain('addEventListener("notificationclick"'); expect(sw).not.toContain("addEventListener('notificationclick'");
    const files: string[] = JSON.parse(sw.match(/const FILES = (\[[\s\S]*?\]);/)![1]!);
    expect(files).toContain("/push-config.js"); expect(files).toContain("/push-loader.js");
    expect(Number(sw.match(/const CACHE = "cb-game-v(\d+)"/)![1])).toBeGreaterThanOrEqual(36);
  });
  test("nothing secret ships to a browser: no key, no bearer header, no admin name in the page files", () => {
    for (const f of ["push-config.js", "push-loader.js", "push-optin.js", "sw-push-snippet.js", "z.js", "zsw.js"]) { const s = rd(f); expect(s).not.toMatch(/Bearer|PUSH_ADMIN_KEY|x-admin/i); }
  });
  test("the build ships the five new files", () => {
    const b = readFileSync(join(ROOT, "pages/build.mjs"), "utf8");
    for (const f of ["push-config.js", "push-loader.js", "push-optin.js", "push-optin.css", "sw-push-snippet.js"]) expect(b).toContain(`"${f}"`);
  });
});

describe("the headers", () => {
  const csp = (rule: string) => { const t = rd("_headers").replace(/\r/g, ""); const i = t.indexOf("\n" + rule + "\n"); expect(i).toBeGreaterThan(-1); return /Content-Security-Policy: ([^\n]+)/.exec(t.slice(i))![1]!; };
  const connect = (c: string) => /connect-src ([^;]+);/.exec(c)![1]!.split(" ");
  test("pushOriginOf: the origin of a real https address, nothing for anything else", () => {
    expect(pushOriginOf(`window.CB_PUSH_API = "${API}";`)).toBe(API);
    expect(pushOriginOf(`window.CB_PUSH_API = "${API}/";`)).toBe(API);
    expect(pushOriginOf(`window.CB_PUSH_API = "${API}/x/y";`)).toBe(API); // only the origin goes into the headers
    expect(pushOriginOf(`window.CB_PUSH_API = "";`)).toBe(""); expect(pushOriginOf("nothing here")).toBe("");
  });
  test("withPushConnect: unchanged when there is no address; otherwise exactly one more origin in connect-src and nothing else changed", () => {
    const base = "default-src 'self'; script-src 'self'; connect-src 'self' https://api.drand.sh; frame-ancestors 'none'";
    expect(withPushConnect(base, "")).toBe(base);
    const on = withPushConnect(base, API);
    expect(on).toBe(`default-src 'self'; script-src 'self'; connect-src 'self' ${API} https://api.drand.sh; frame-ancestors 'none'`);
    expect(on).toContain("script-src 'self';");
    expect(() => withPushConnect("default-src 'self'", API)).toThrow();
  });
  test("the game page's rule: script-src stays 'self'; while the setting is empty connect-src names no alert address", () => {
    const c = csp("/z.html");
    expect(c).toMatch(/script-src 'self';/);
    expect(connect(c)).toEqual(["'self'", "https://api.drand.sh", "https://api2.drand.sh", "https://api3.drand.sh", "https://drand.cloudflare.com"]);
    expect(pushOriginOf(rd("push-config.js"))).toBe(""); // and the build agrees: empty setting = no extra origin
  });
  test("the build builds the game page's policy from the same setting (so the page and its headers cannot disagree)", () => {
    const b = readFileSync(join(ROOT, "pages/build.mjs"), "utf8");
    expect(b).toContain('readPushOrigin(join(SRC, "push-config.js"))');
    expect(b).toMatch(/const GAMECSP = withPushConnect\(/);
  });
});

describe("words and device storage", () => {
  const frag = readFileSync(join(ROOT, "tools/legal/privacy.frag.html"), "utf8");
  test("privacy.html and the privacy text say what is saved and for how long, in plain words, and never 'not personal data'", () => {
    for (const s of [rd("privacy.html"), frag]) {
      expect(s).toContain("a browser address, not your name, e-mail or phone");
      expect(s).toContain("deleted with the game, within 24 hours");
      expect(s).not.toMatch(/not personal data/i);
    }
  });
  test("what the alert button keeps on a phone is in the device-storage list (shown to people on /legal.html)", () => {
    const reg = JSON.parse(readFileSync(join(import.meta.dir, "../storage-registry.json"), "utf8"));
    const item = (reg.items ?? reg).find((i: any) => i.id === "game-alert");
    expect(item).toBeTruthy(); expect(item.store).toBe("localStorage"); expect(item.keys).toContain("corporatePush.v1pending");
  });
});

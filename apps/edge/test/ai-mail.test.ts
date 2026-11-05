// The AI work link travels ONLY in its own dedicated e-mail, and can be replaced from the console (old link dies at once).
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { withDevice } from "./device";
import { housekeeping, type Env } from "../src/worker";
import { handle } from "./with-terms";
import { AI_SUBJECT, AI_WARNING, HOST_LINK_SUBJECT, HOST_SUBJECT, HOST_WARNING, aiLinkMail, coHostLinkMail } from "../src/mails";
import { footerText } from "../src/brand";
import type { PayEnv } from "../src/pay";
import { makeD1 } from "./d1-sqlite";

const T = Date.UTC(2026, 9, 1, 10, 0, 0);
const ORIGIN = "https://bingo.test";
let env: PayEnv; let raw: ReturnType<typeof makeD1>["raw"];
const call = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}, now = T) =>
  handle(new Request("http://x" + path, { method, headers: { "content-type": "application/json", ...headers }, body: withDevice(method, path, body) }), env as Env, now);
const roundAt = (ms: number) => Math.floor((ms / 1000 - 1692803367) / 3) + 1;
const j = async (r: Response) => (await r.json()) as any;
const contact = { email: "boss@acme.com", phone: "98765 43210" };
const mailedKey = (b: string) => b.match(/cba_[0-9a-f]{48}/)![0];
const outbox = () => raw.prepare("SELECT to_addr, subject, body FROM outbox ORDER BY id").all() as { to_addr: string; subject: string; body: string }[];
const LEAK = /cba_[0-9a-f]|cbh_[0-9a-f]|\/ai\//;
const DEDICATED = new Set([AI_SUBJECT, HOST_SUBJECT, HOST_LINK_SUBJECT]); // HOST_LINK_SUBJECT: the Host's OWN console link, e-mailed to the Host only

beforeEach(() => {
  const d = makeD1(); raw = d.raw;
  env = { DB: d.db, ORGANIZER_SECRET: "plat", RUNNER_KEY: "test-runner-key-test-runner-key-test0000", DAILY_WRITE_BUDGET: "100000", PUBLIC_ORIGIN: ORIGIN, DATA_KEY: "test-data-key" };
});

async function organizer() {
  const x = await j(await call("POST", "/api/start", { email: "boss@acme.com" }, { "cf-connecting-ip": "1.1.1.1" }));
  return { h: { "x-organizer": x.token as string }, ai: x.aiKey as string, msg: x.aiMessage as string };
}

describe("the dedicated mail builders", () => {
  const KEY = "cba_" + "ab".repeat(24);
  test("organizer mail: own subject, warning at the top and the bottom, plain-text part, numbered steps, the paste as plain text (no hyperlink)", () => {
    const m = aiLinkMail(ORIGIN, KEY, "start", T + 86_400_000);
    expect(m.subject).toBe(AI_SUBJECT); expect(m.subject).toMatch(/personal AI work link/i);
    expect(AI_WARNING).toBe("PLEASE KEEP SAFE: this email holds your personal AI work link"); expect(AI_WARNING.length).toBeLessThan(70); // one line
    expect(m.text.startsWith(AI_WARNING)).toBe(true); expect(m.text.replace(footerText(ORIGIN), "").trim().endsWith(AI_WARNING)).toBe(true); // plain-text part, warning top and bottom
    expect(m.text.split(AI_WARNING).length).toBe(3);
    const h = m.html; const first = h.indexOf(AI_WARNING), last = h.lastIndexOf(AI_WARNING);
    expect(first).toBeGreaterThan(0); expect(last).toBeGreaterThan(first);
    expect(first).toBeLessThan(h.indexOf("<h1")); expect(last).toBeGreaterThan(h.indexOf("WHAT TO DO")); expect(h.split(AI_WARNING).length).toBe(3);
    expect(h).toMatch(/#b71c1c/); // red
    const hrefs = [...h.matchAll(/href\s*=\s*"([^"]*)"/gi)].map((x) => x[1]).filter((h) => !/^mailto:|legal.html$/.test(h!)); expect(hrefs).toEqual([`${ORIGIN}/ai-link.html`]); expect(h).toContain("Show my AI work link"); // the only link is the button to the sign-in page, never the key; the paste box is not a link
    expect(h).toContain(`${ORIGIN}/ai/${KEY}`); // but the text is in the box, to copy
    for (const t of ["ChatGPT", "Claude", "Gemini", "Grok", "DeepSeek", "z.ai"]) { expect(m.text).toContain(t); expect(h).toContain(t); }
    expect(m.text).toMatch(/1\. Copy the box/); expect(m.text).toMatch(/2\. Paste it into any AI chat/); expect(m.text).toMatch(/3\. Answer its questions/); expect(m.text).toMatch(/does the work/);
    for (const t of [/payment/, /publishing/, /erasing/, /pause or stop/, /Replace my AI link/, /stops at once/]) { expect(m.text).toMatch(t); expect(h).toMatch(t); }
    expect(m.text.split(KEY).length).toBe(2); expect(h.split(KEY).length).toBe(2); // the key appears once, inside the paste
    expect(m.text).toContain("MY OWN Corporate Lucky Draw account");
  });
  test("a replacement mail says the old link has stopped", () => {
    const m = aiLinkMail(ORIGIN, KEY, "replace", T + 86_400_000);
    expect(m.text).toMatch(/NEW personal AI work link/i); expect(m.text).toMatch(/Every older link stopped at once/);
    expect(m.text).toMatch(/WORKS FOR 24 HOURS ONLY/); expect(m.text).toMatch(/Show my AI work link/i); expect(m.html).toMatch(/WORKS FOR 24 HOURS ONLY/);
  });
  test("co-host mail: whose engagement, a watch and announce role, own warning top and bottom, plain-text part, no hyperlink", () => {
    const k = "cbh_" + "cd".repeat(24), m = coHostLinkMail(ORIGIN, k, "boss@acme.com", T + 86_400_000);
    expect(m.text).toMatch(/WORKS FOR 24 HOURS ONLY/);
    expect(m.subject).toBe(HOST_SUBJECT);
    expect(m.text.startsWith(HOST_WARNING)).toBe(true); expect(m.text.replace(footerText(ORIGIN), "").trim().endsWith(HOST_WARNING)).toBe(true); expect(m.html.split(HOST_WARNING).length).toBe(3);
    expect(m.text).toContain("boss@acme.com"); expect(m.text).toMatch(/watch and announce/i); expect(m.text).toMatch(/host/i);
    expect([...m.html.matchAll(/href\s*=\s*"([^"]*)"/gi)].map((x) => x[1]).filter((h) => !/^mailto:|legal.html$/.test(h!))).toEqual([`${ORIGIN}/zc.html`]); expect(m.text).toContain(`${ORIGIN}/ai/${k}`);
    expect(m.text).toMatch(/not for changing settings/);
  });
});

describe("the AI link is in the dedicated mails and nowhere else", () => {
  test("with AI_LINK_MAIL_AT_SIGNUP=0 (the live setting) sign-up sends no AI mail at all; the account and the sign-in e-mail (code and link) still work", async () => {
    (env as any).AI_LINK_MAIL_AT_SIGNUP = "0";
    const o = await organizer();
    expect(outbox().length).toBe(0); expect((await call("GET", "/api/whoami", undefined, o.h)).status).toBe(200); // the account exists and the console key works
    const r = await j(await call("POST", "/api/auth/email", { email: "boss@acme.com" }, { "cf-connecting-ip": "1.1.1.2" }));
    expect(r.ok).toBe(true); const sent = outbox(); expect(sent.length).toBe(1); expect(sent[0]!.subject).not.toBe("[Bingo] " + AI_SUBJECT); expect(sent[0]!.body).toMatch(/\b\d{6}\b/); // one sign-in mail: the 6-digit code
  });
  test("no other source that builds a mail, a PDF, a report or a guest page can carry an AI link", () => {
    const root = join(import.meta.dir, "..", "..", "..");
    const read = (...p: string[]) => readFileSync(join(root, ...p), "utf8");
    const edge = readdirSync(join(root, "apps/edge/src")).filter((f) => f.endsWith(".ts") && !["ai-link.ts", "ai-facts.ts", "ai-functions.ts", "ai-go.ts", "trust-page.ts", "mails.ts", "worker.ts", "local.ts", "helpdesk.ts"].includes(f));
    for (const f of edge) expect(read("apps/edge/src", f)).not.toMatch(/aiPaste|aiMessage|aiLinkMail|coHostLinkMail|cba_|cbh_|\/ai\//);
    expect(read("apps/edge/src", "helpdesk.ts")).not.toMatch(/aiPaste|aiMessage|aiLinkMail|coHostLinkMail/); // Help Desk mints its keys, but a key travels by e-mail only in the builder of mails.ts (helpDeskPublishedMail)
    const pages = ["report.html", "report.js", "reportgen.js", "z.html", "z.js", "zgame.js", "big.html", "big.js", "play.html", "play.js", "pay.html", "pay.js", "partner.html", "partner.js", "screen.js"];
    for (const f of pages) { let t = ""; try { t = read("apps/web/public", f); } catch { continue; } expect(t).not.toMatch(/cba_|cbh_|\/ai\/|aiMessage/); }
    const w = read("apps/edge/src/worker.ts");
    expect(w).not.toMatch(/aiMailBody/); expect((w.match(/aiLinkMail\(/g) ?? []).length).toBe(1); expect((w.match(/coHostLinkMail\(/g) ?? []).length).toBe(1); // start + replace; co-host creation
  });
});

describe("Replace my AI link", () => {
  test("the old route /api/org/ai does the same (mints a fresh link, kills the old one)", async () => {
    const o = await organizer();
    const x = await j(await call("POST", "/api/org/ai", {}, o.h));
    expect((await call("GET", `/ai/${o.ai}`)).status).toBe(404); expect((await call("GET", `/ai/${x.aiKey}`)).status).toBe(200); expect(x.mailed).toBe(true);
  });
  test("an AI key, a co-host key, the platform key and strangers cannot replace it", async () => {
    const o = await organizer();
    const hk = await j(await call("POST", "/api/org/host", { mobile: "9876500009", email: "host@acme.com" }, o.h));
    for (const hdr of <Record<string, string>[]>[{ "x-organizer": o.ai }, { "x-organizer": hk.hostKey }, { "x-organizer": "plat" }, {}, { "x-organizer": "cba_" + "0".repeat(48) }])
      for (const path of ["/api/org/ai/replace", "/api/org/ai"]) expect((await call("POST", path, {}, hdr)).status).toBe(403);
    expect((await call("POST", `/ai/${o.ai}/org/ai/replace`, {})).status).toBe(403); // not through the AI link either
    expect((await call("POST", `/ai/${o.ai}/org/ai`, {})).status).toBe(403);
    expect((await call("GET", `/ai/${o.ai}`)).status).toBe(200); // nothing was replaced
  });
  test("an organizer with no known e-mail address still gets the new paste in the console (mailed: false)", async () => {
    const mk = await j(await call("POST", "/api/org", {}, { "x-organizer": "plat" })); // minted by the platform: no sign-up e-mail
    const x = await j(await call("POST", "/api/org/ai/replace", {}, { "x-organizer": mk.organizerKey }));
    expect(x.ok).toBe(true); expect(x.mailed).toBe(false); expect((await call("GET", `/ai/${x.aiKey}`)).status).toBe(200); expect(outbox().length).toBe(0);
  });
});

describe("opening the manual never changes anything", () => {
  test("GET and HEAD on /ai/<key> (a mail scanner or a chat AI) leave keys, engagements, people and mail untouched", async () => {
    const o = await organizer();
    await call("POST", "/api/z", { id: "SAFE-1", startRound: roundAt(T) + 1200, callSeconds: 6, cap: 100 }, o.h);
    const snap = () => {
      const tables = (raw.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT IN ('ai_audit','sqlite_sequence')").all() as { name: string }[]).map((t) => t.name).sort();
      return JSON.stringify(tables.map((n) => [n, raw.prepare(n === "kv" ? `SELECT * FROM kv WHERE k NOT LIKE 'seen/%'` : `SELECT * FROM "${n}"`).all()])); // the only bookkeeping a read leaves is the unfamiliar-use baseline (seen/) and the audit line
    };
    const before = snap();
    for (let i = 0; i < 3; i++) {
      expect((await call("GET", `/ai/${o.ai}`)).status).toBe(200);
      expect((await call("GET", `/ai/${o.ai}?format=json`)).status).toBe(200);
      expect((await call("HEAD", `/ai/${o.ai}`)).status).toBe(200);
    }
    expect(snap()).toBe(before);
    expect((await call("GET", `/ai/${o.ai}`)).status).toBe(200); // still the same working link
  });
});

describe("sending", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = realFetch; });
});

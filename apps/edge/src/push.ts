// "Notify me when this game begins": the server side. It talks to the corporate-push service (a separate small service; spec: FChecklist/corporate-push, KNOWLEDGE.md).
// DARK by default. Nothing here reads the database, writes it or makes a request unless BOTH settings exist: PUSH_URL (a real https address) and PUSH_ADMIN_KEY (a secret, set by hand, never in git).
// What it does when both are set:
//   1. The moment a game really starts (the draw time of an automatic game, or the press of Start on a manual one) the game's own row is marked (`push_due_ms`). That is one cheap write inside the draw; nothing is sent there.
//   2. The scheduled job (runTick, every minute) sends ONE message per game: POST /send { scope: "game:<id>", kind: "game_begins", title, body, url: <game link> }. The send is claimed first (`push_sent_ms`, one row changed),
//      so two ticks at the same moment can never send twice, and there is no retry (a retry could send twice). A start that is more than 2 hours old is never announced: it is too late to be useful.
//      The service sends 40 browsers per call; the answer carries `next_after_id`, and the calls go on (at most PUSH_MAX_PAGES of them) until it is empty.
//   3. When the game's data is deleted (lifecycle.ts erasePersonal: the 24-hour job, a cancel, a game that never started, the organizer's own delete, the 365-day clean-up) it also calls POST /purge { scope: "game:<id>" }.
//      The service deletes its own rows after 24 hours anyway; this is the "delete with the game" promise made exact.
// The admin key is sent only as the Authorization header of those calls. It is never logged, never put in a URL and never returned to a page. Failures are swallowed on purpose: an alert must never stop a draw or a delete.
import { BRAND } from "./brand";
import type { D1 } from "./worker";

export interface PushEnv { DB: D1; PUSH_URL?: string; PUSH_ADMIN_KEY?: string; PUBLIC_ORIGIN?: string }

/** 0034_push_notify.sql: when the game really started (`push_due_ms`) and when its one message was claimed for sending (`push_sent_ms`). No personal data in either. test/migrations.test.ts keeps this identical to the file. */
export const PUSH_SCHEMA: string[] = [
  `ALTER TABLE draw ADD COLUMN push_due_ms INTEGER`,
  `ALTER TABLE draw ADD COLUMN push_sent_ms INTEGER`,
];

/** The words of the message (80 and 200 characters at most: the service refuses more). Kind and plain; no "your"/"my". */
export const PUSH_TITLE = "The Lucky Draw has begun";
export const PUSH_BODY = "Tap to open the game page and see the winners.";
/** Calls of 40 browsers each: 25 calls reach 1,000 browsers per game. The service keeps at most 5,000 per game, so a bigger crowd is only partly told; this keeps one scheduled run short. */
export const PUSH_MAX_PAGES = 25;
/** A start older than this is not announced any more. */
export const PUSH_STALE_MS = 2 * 3_600_000;
/** Games sent in one scheduled run. */
export const PUSH_PER_TICK = 3;
const SEND_TIMEOUT_MS = 8000, PURGE_TIMEOUT_MS = 5000;
const GAME_ID = /^[A-Za-z0-9_-]{1,128}$/;

/** The two settings, or null while dark. The address must be a real https address (no sign-in part, no query); the key must not be empty. */
export function pushSettings(env: Partial<PushEnv>): { base: string; key: string } | null {
  const key = typeof env.PUSH_ADMIN_KEY === "string" ? env.PUSH_ADMIN_KEY.trim() : "";
  const raw = typeof env.PUSH_URL === "string" ? env.PUSH_URL.trim() : "";
  if (!key || !raw) return null;
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== "https:" || u.username || u.password || u.search || u.hash || !u.hostname.includes(".")) return null;
  return { base: u.origin + u.pathname.replace(/\/+$/, ""), key };
}

/** The link a player opens: the same game link the organizer shares. */
export function gameLink(env: Partial<PushEnv>, eid: string): string {
  let origin: string = BRAND.defaultOrigin;
  try { const u = new URL(env.PUBLIC_ORIGIN || BRAND.defaultOrigin); if (u.protocol === "https:") origin = u.origin; } catch { /* the default stands */ }
  return `${origin}/z.html?e=${encodeURIComponent(eid)}`;
}

/** One call to the service. Never throws, never follows a redirect (the key would travel with it), never logs. status 0 = no answer. */
async function call(s: { base: string; key: string }, path: string, body: unknown, timeoutMs: number): Promise<{ status: number; json: any }> {
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(s.base + path, { method: "POST", headers: { authorization: `Bearer ${s.key}`, "content-type": "application/json" }, body: JSON.stringify(body), redirect: "error", signal: ctl.signal });
    return { status: r.status, json: await r.json().catch(() => null) };
  } catch { return { status: 0, json: null }; } finally { clearTimeout(timer); }
}

/** Called inside the draw at the moment the game really starts. Dark: does nothing at all. Otherwise marks the game once (a second call changes nothing). Never throws. */
export async function markGameStarted(env: PushEnv, eid: string, now: number): Promise<void> {
  if (!pushSettings(env)) return;
  try { await env.DB.prepare("UPDATE draw SET push_due_ms=? WHERE eid=? AND push_due_ms IS NULL").bind(now, eid).run(); } catch { /* the draw goes on; no message for this game */ }
}

/** The scheduled run: send the one message of each game that has started and not been announced. Returns how many games it handled. Dark: 0, no database read, no request. Never throws. */
export async function pushTick(env: PushEnv, now: number): Promise<number> {
  const s = pushSettings(env);
  if (!s) return 0;
  let n = 0;
  try {
    const due = (await env.DB.prepare("SELECT eid, push_due_ms FROM draw WHERE push_due_ms IS NOT NULL AND push_sent_ms IS NULL ORDER BY push_due_ms LIMIT ?").bind(PUSH_PER_TICK).all<{ eid: string; push_due_ms: number }>()).results ?? [];
    for (const g of due) {
      const claim = await env.DB.prepare("UPDATE draw SET push_sent_ms=? WHERE eid=? AND push_sent_ms IS NULL").bind(now, g.eid).run(); // the first one to change the row is the only one that sends
      if (!(claim.meta?.changes ?? 0)) continue;
      n++;
      if (now - Number(g.push_due_ms) > PUSH_STALE_MS || !GAME_ID.test(g.eid)) continue; // too late to be useful, or not a valid game id: claimed, never sent
      const url = gameLink(env, g.eid);
      let after = 0;
      for (let page = 0; page < PUSH_MAX_PAGES; page++) {
        const r = await call(s, "/send", { scope: `game:${g.eid}`, kind: "game_begins", title: PUSH_TITLE, body: PUSH_BODY, url, ...(after ? { after_id: after } : {}) }, SEND_TIMEOUT_MS);
        const next = r.json?.next_after_id;
        if (r.status !== 200 || r.json?.ok !== true || !Number.isInteger(next) || next <= 0) break; // done, or the service said no: stop (no retry)
        after = next;
      }
    }
  } catch { /* the next run looks again; a claimed game is never sent twice */ }
  return n;
}

/** Called when a game's data is deleted. Dark: no request. Otherwise tells the service to delete every browser address saved for this game. One try, never throws. */
export async function purgeGamePush(env: Partial<PushEnv>, eid: string): Promise<void> {
  const s = pushSettings(env);
  if (!s || !GAME_ID.test(eid)) return;
  await call(s, "/purge", { scope: `game:${eid}` }, PURGE_TIMEOUT_MS);
}

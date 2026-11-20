// The thin file that connects this game to the master console (bridge contract v1, docs/CONTRACT_V1.md; the spec of the paid notice is docs/PAY_STEP.md).
// The bridge itself (console-bridge/, copied byte for byte from the console repo) never reads this game's tables: everything game-specific is answered here.
// DARK BY DEFAULT: with no CONSOLE_PUBKEYS setting every /api/console/* route answers the game's normal 404 (the bridge hands the request back).
// What the console may ask this game to do is only what the owner rules allow: the SIGNED "paid" notice (one use of the assertion, and one use of the order id) and the read-only lists.
// GAPS (listed in docs/STATE.md): Host and Co-host keys through the console are not wired yet (mintKey refuses them, features.roles is false); upgrade, game log and the player's screen view are not offered.
import { PACKS, price } from "../../../packages/shared/src/pricing";
import { DEMO_CAP, GRACE_ROUNDS } from "../../../packages/beacon/src/config";
import { LATE_PAY_LEAD_ROUNDS } from "./pay";
import type { Adapter, KeyAuth, KeyKind } from "./console-bridge/bridge";
import { drawRow } from "./draw";
import { sealText, openText } from "./pii";
import releases from "./releases.json";
import { BRAND } from "./brand";
import { roundMs } from "./lifecycle";
import type { Env } from "./worker";

const GEN = 1692803367; // the same late-payment rule as pay.ts: the draw comes 2 minutes after a late payment is confirmed
const enc = new TextEncoder();
const sha = async (s: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(s))), (b) => b.toString(16).padStart(2, "0")).join("");
const hex = (n: number) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => b.toString(16).padStart(2, "0")).join("");
const refuse = (m: string) => Object.assign(new Error(m), { definite: true as const });

/** The size (pack) a game is paid for: the smallest listed pack that holds its people limit. A game for up to DEMO_CAP people is free and never needs a payment. */
export const sizeOf = (cap: number): number | null => (cap <= DEMO_CAP ? null : PACKS.find((p) => p[0] >= cap)?.[0] ?? null);

/** What a game's status is, in the contract's seven words. */
async function statusOf(env: Env, e: any, now: number): Promise<{ status: string; paid: boolean; published: boolean; drawn: boolean }> {
  const d = await drawRow(env.DB, e.id);
  const published = !!(await env.DB.prepare("SELECT 1 AS x FROM kv WHERE k=?").bind(`pub/${e.id}`).first()) || (e.pack ?? 0) > 0;
  const paid = (e.pack ?? 0) > 0, drawn = !!d?.drawn_ms;
  const status = e.cancelled_ms ? "cancelled" : e.unplayed_ms ? "not_started" : drawn ? "finished" : !published ? "draft" : !paid ? "waiting_payment" : roundMs(e.start_round) <= now ? "playing" : "ready";
  return { status, paid, published, drawn };
}
const nameOf = (e: any): string => { try { const j = e.config ? JSON.parse(e.config) : {}; return String(j.name || e.id).slice(0, 80); } catch { return String(e.id).slice(0, 80); } };

/** The adapter for one request (`now` is the request's own clock, so tests can set the time). */
export function consoleAdapter(now: number): Adapter<Env> {
  const ad: Adapter<Env> = {
    game: "luckydraw", gameName: "Corporate Lucky Draw", gameVersion: String((releases as any[])[0]?.version ?? "1.0.0"),
    nowMs: () => now,
    origin: (env) => String((env as any).PUBLIC_ORIGIN ?? BRAND.defaultOrigin).replace(/\/$/, ""),
    pubkeys: (env) => (env as any).CONSOLE_PUBKEYS,
    db: (env) => env.DB as any,
    organizerOf: async (env, h) => { const r = await env.DB.prepare("SELECT org FROM organizer_email WHERE email_hash=?").bind(h).first<{ org: string }>(); return r ? { org: r.org } : null; },
    createOrganizer: async (env, _email, h) => { const org = hex(8); await env.DB.prepare("INSERT OR IGNORE INTO organizer_email(email_hash,org) VALUES(?,?)").bind(h, org).run(); const r = await env.DB.prepare("SELECT org FROM organizer_email WHERE email_hash=?").bind(h).first<{ org: string }>(); return { org: r!.org }; },
    mintKey: async (env, k: { kind: KeyKind; org: string; eid: string | null; expiresMs: number; createdBy: string }) => {
      if (k.kind !== "master") throw new Error("Host and Co-host keys through the console are not wired in this game yet."); // gap, see docs/STATE.md
      const key = "cbk_" + hex(24);
      await env.DB.prepare("INSERT INTO organizer_key(hash,org,kind,revoked,created_ms,expires_ms,label,eid,created_by) VALUES(?,?,?,0,?,?,?,?,?)").bind(await sha("key|" + key), k.org, "master", now, k.expiresMs, "console", null, k.createdBy).run();
      return key;
    },
    revokeKeys: async (env, by) => { await env.DB.prepare("UPDATE organizer_key SET revoked=1 WHERE created_by=?").bind(by).run(); },
    authOfKey: async (env, key, nowMs): Promise<KeyAuth | null> => {
      if ((env as any).ORGANIZER_SECRET && key === (env as any).ORGANIZER_SECRET) return { org: null, kind: "platform", eid: null }; // the owner's platform key never opens a console route
      const r = await env.DB.prepare("SELECT org, kind, eid, created_by FROM organizer_key WHERE hash=? AND revoked=0 AND (expires_ms IS NULL OR expires_ms>?)").bind(await sha("key|" + key), nowMs).first<any>();
      return r ? { org: r.org, kind: r.kind, eid: r.eid ?? null, createdBy: r.created_by ?? null } : null;
    },
    engagement: async (env, eid) => {
      const e = await env.DB.prepare("SELECT id, org, config, cancelled_ms, unplayed_ms FROM engagement WHERE id=?").bind(eid).first<any>();
      if (!e) return null;
      const d = await drawRow(env.DB, eid);
      return { org: e.org, name: nameOf(e), ended: !!(e.cancelled_ms || e.unplayed_ms || d?.drawn_ms) };
    },
    listGames: async (env, a) => {
      const off = Number(a.cursor || 0) || 0, games: any[] = [];
      const rows: any[] = a.org ? ((await env.DB.prepare("SELECT * FROM engagement WHERE org=? AND rehearsal_of IS NULL ORDER BY created_ms DESC, id LIMIT ? OFFSET ?").bind(a.org, a.limit + 1, off).all<any>()).results ?? []) : [];
      for (const e of rows.slice(0, a.limit) as any[]) {
        const s = await statusOf(env, e, now), size = sizeOf(e.cap);
        const joined = (await env.DB.prepare("SELECT COUNT(*) AS c FROM participant WHERE eid=?").bind(e.id).first<{ c: number }>())?.c ?? 0;
        games.push({ game: "luckydraw", eid: e.id, role: "organizer", status: s.status, startMs: roundMs(e.start_round), cap: e.cap, pack: e.pack ?? 0, name: nameOf(e), payment: { state: s.paid ? "paid" : size === null ? "free" : s.published ? "waiting" : "none", ...(s.paid && size ? { amountMinor: Math.round(price(size, "INR").total * 100), currency: "INR" } : {}) }, invitedBy: null, liveNow: s.status === "playing", nextAction: s.status === "draft" ? "publish" : s.status === "waiting_payment" ? "pay" : s.status === "ready" ? "share" : s.status === "playing" ? "run" : "none", joined, createdMs: e.created_ms });
      }
      return { games, next: rows.length > a.limit ? String(off + a.limit) : null };
    },
    billing: async () => ({ rows: [], credit: null, next: null }), // billing lives in Moneypenny; this game keeps no wallet
    invitedCards: async () => [], // a Lucky Draw invites by ID: nobody has an e-mail address on a guest list, so there is no card to show
    purgePerson: async (env, h) => (await env.DB.prepare("DELETE FROM organizer_email WHERE email_hash=? AND NOT EXISTS (SELECT 1 FROM engagement WHERE org=organizer_email.org)").bind(h).run()).meta?.changes ?? 0,
    live: async (env) => {
      const rows = (await env.DB.prepare("SELECT e.id, e.start_round FROM draw d JOIN engagement e ON e.id=d.eid WHERE d.drawn_ms IS NULL AND e.cancelled_ms IS NULL AND e.unplayed_ms IS NULL AND e.pack>0").all<any>()).results ?? [];
      let playing = 0, soon = 0;
      for (const r of rows) { const ms = roundMs(r.start_round); if (ms <= now) playing++; else if (ms - now <= 3600_000) soon++; }
      return { playing, startingWithin60: soon };
    },
    capabilities: async () => ({
      sizes: [{ pack: DEMO_CAP, inrMinor: 0, usdMinor: 0, free: true }, ...PACKS.map((p) => ({ pack: p[0], inrMinor: Math.round(price(p[0], "INR").total * 100), usdMinor: Math.round(price(p[0], "USD").total * 100), free: false }))],
      freeDemoCap: DEMO_CAP, currencies: ["INR", "USD"], features: { roles: false, log: false, upgrade: false, preview: false, trail: false, invited: false }, limits: { drafts: 10 }, options: { startOptions: ["auto", "manual"], idInvite: true },
    }),
    sendRoleInvite: async () => { /* roles through the console are not wired in this game yet */ },
    seal: async (env, text) => sealText(env as any, text),
    unseal: async (env, sealed) => (await openText(env as any, sealed)) ?? "",
    /** THE PAID NOTICE. The bridge has already checked the signature, the audience, the purpose, the 60-second life and the one-time id, and that this order id is new for this game.
     *  Here the game decides from its own tables: it exists, it belongs to the person who paid, the size paid is its own size, and it is not yet paid. Only then it is marked PAID, and the draw may start (runDraw refuses an unpaid game).
     *  A refusal is `definite` (nothing was changed), so the console can return the credits. */
    markPaid: async (env, o) => {
      const e = await env.DB.prepare("SELECT * FROM engagement WHERE id=?").bind(o.eid).first<any>();
      const who = await env.DB.prepare("SELECT org FROM organizer_email WHERE email_hash=?").bind(o.sub).first<{ org: string }>();
      if (!e || !who || who.org !== e.org) throw refuse("This game does not belong to the person who paid.");
      if (e.cancelled_ms || e.unplayed_ms) throw refuse("This game was cancelled or did not start, so it cannot be paid.");
      const size = sizeOf(e.cap);
      if (size === null) throw refuse("This game is free: nothing needs to be paid.");
      if (String(size) !== o.item) throw refuse("The size paid for is not the size of this game.");
      if ((e.pack ?? 0) > 0) throw refuse("This game is already paid.");
      if ((await drawRow(env.DB, e.id))?.drawn_ms) throw refuse("The draw is already done.");
      const up = await env.DB.prepare("UPDATE engagement SET pack=?, cap=MIN(cap, ?) WHERE id=? AND org=? AND pack=0 AND cancelled_ms IS NULL AND unplayed_ms IS NULL").bind(size, size, e.id, e.org).run();
      if ((up.meta?.changes ?? 0) < 1) throw refuse("This game could not be marked paid. Nothing was changed.");
      await env.DB.prepare("INSERT OR IGNORE INTO kv(k,v) VALUES(?,?)").bind(`pub/${e.id}`, String(o.nowMs)).run(); // paying also publishes, as with every other way of paying
      await env.DB.prepare("INSERT OR IGNORE INTO kv(k,v) VALUES(?,?)").bind(`paidby/${e.id}`, JSON.stringify({ by: "organizer", ms: o.nowMs, via: "console" })).run();
      if (roundMs(e.start_round) <= o.nowMs) { // it was held because it was not paid at its start time: the draw now comes 2 minutes after the payment
        const restart = Math.floor((o.nowMs / 1000 - GEN) / 3) + 2 + LATE_PAY_LEAD_ROUNDS - GRACE_ROUNDS;
        await env.DB.prepare("UPDATE engagement SET start_round=? WHERE id=?").bind(restart, e.id).run();
      }
    },
  };
  return ad;
}

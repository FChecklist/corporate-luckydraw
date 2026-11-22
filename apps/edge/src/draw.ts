// Corporate Lucky Draw: the game itself. Everything else (accounts, payment, people, rehearsal, retention, helpdesk) is the shared platform.
// A Lucky Draw is an engagement whose joining IS registering (one seat per person) and whose start time IS the draw time. The rules come only from the common
// engine (vendor/game-core packages/luckydraw): entries go in with registerMany in batches, the draw happens on the beacon value, anybody holding the entries and the value gets the same winners.
// Fairness, only as far as the code proves it: same entries + same public beacon value = same winners. That the beacon value cannot be chosen or predicted comes from the public beacon, not from this code.
import { luckyDrawRules, prizePlaces, DRAW_CAP, type DrawState } from "../../../vendor/game-core/packages/luckydraw/src";
import { newClock, start as startClock, type Role } from "../../../vendor/game-core/packages/core/src";
import { fetchRound, roundAt } from "../../../packages/beacon/src/index";
import { openPii, type PiiEnv } from "./pii";
import { recordWinners, roundMs } from "./lifecycle";
import { sendMail, type PayEnv } from "./pay";
import { teamEmails } from "./cancel";
import type { D1, Env } from "./worker";

export const DRAW_SCHEMA: string[] = [
  `CREATE TABLE IF NOT EXISTS draw (eid TEXT PRIMARY KEY, winners INTEGER NOT NULL, prizes TEXT NOT NULL, mode TEXT NOT NULL, ref TEXT NOT NULL, set_ms INTEGER NOT NULL, closing_ms INTEGER, drawn_ms INTEGER, round INTEGER, beacon TEXT, result TEXT, by_role TEXT, entries INTEGER)`,
];
/** 0033_draw_freeze.sql: the instant the entry list closed for a manual start (the press), the beacon round chosen at that press, and when a seat was blocked (a removal after the list closed is ignored). */
export const DRAW_FREEZE_SCHEMA: string[] = [
  `ALTER TABLE draw ADD COLUMN freeze_ms INTEGER`,
  `ALTER TABLE draw ADD COLUMN target_round INTEGER`,
  `ALTER TABLE seat ADD COLUMN blk_ms INTEGER`,
];
export const MAX_WINNERS = 1000;
/** The one privacy line (owner wording, 20 Nov 2026). It says only what the code does: players' details go within 24 hours of the draw; the team's and winners' details stay 365 days; invoices as the law requires. */
export const NO_PERSONAL_LINE = "Player details are deleted within 24 hours of the draw. The organizer's, hosts' and winners' details are kept for 365 days, and invoices as the law requires.";
/** What is true in code, and no more. The entry list closes at the draw time (or at your press) and cannot change after that. The beacon value is public and nobody can choose it. */
export const DRAW_FAIRNESS = "No one knows the result before the draw. The list of entries closes at the draw time and cannot change after that. The winners come from a public beacon value (drand) that nobody can choose or predict: the same entries and the same value always give the same winners.";

export interface DrawRow { eid: string; winners: number; prizes: string; mode: "auto" | "manual"; ref: string; set_ms: number; closing_ms: number | null; drawn_ms: number | null; round: number | null; beacon: string | null; result: string | null; by_role: string | null; entries: number | null; freeze_ms: number | null; target_round: number | null }
export const drawRow = (db: D1, eid: string) => db.prepare("SELECT * FROM draw WHERE eid=?").bind(eid).first<DrawRow>();
const cleanPrize = (s: unknown): string => (typeof s === "string" ? s.replace(/[<>`]/g, "").replace(/\s+/g, " ").trim().slice(0, 80) : "");

/** The Organizer's draw settings: how many winners, the prize for each place, automatic or manual. Returns the plain reason when something is wrong. */
export function checkDrawSettings(b: any, cap: number, rehearsal: boolean): { ok: true; winners: number; prizes: string[]; mode: "auto" | "manual"; ref: string } | { ok: false; error: string } {
  const winners = b?.winners === undefined ? 1 : b.winners;
  if (!Number.isInteger(winners) || winners < 1) return { ok: false, error: "Pick how many winners there are: a whole number, 1 or more." };
  if (winners > MAX_WINNERS) return { ok: false, error: `A draw can have up to ${MAX_WINNERS} winners.` };
  if (winners > cap) return { ok: false, error: "There cannot be more winners than the number of people you allow." };
  const mode = b?.mode === "manual" ? "manual" : b?.mode === undefined || b?.mode === "auto" ? "auto" : null;
  if (!mode) return { ok: false, error: "The game starts by itself at the time you set, or you start it yourself. Please choose one." };
  const raw: unknown[] = Array.isArray(b?.prizes) ? b.prizes : typeof b?.prizes === "string" ? b.prizes.split(",") : [];
  const prizes = rehearsal ? [] : raw.map(cleanPrize).slice(0, winners);
  if (!rehearsal && raw.length > winners) return { ok: false, error: "There are more prizes than winners. Add winners or remove a prize." };
  return { ok: true, winners, prizes, mode, ref: "0" };
}
export async function saveDrawSettings(db: D1, eid: string, s: { winners: number; prizes: string[]; mode: "auto" | "manual"; ref: string }, now: number): Promise<void> {
  await db.prepare("INSERT INTO draw(eid,winners,prizes,mode,ref,set_ms) VALUES(?,?,?,?,?,?) ON CONFLICT(eid) DO UPDATE SET winners=excluded.winners, prizes=excluded.prizes, mode=excluded.mode, ref=excluded.ref, set_ms=excluded.set_ms WHERE draw.drawn_ms IS NULL AND draw.closing_ms IS NULL")
    .bind(eid, s.winners, JSON.stringify(s.prizes), s.mode, s.ref, now).run();
}

/**
 * True when registering has closed: the draw time has come (automatic), Start was pressed (manual) or the draw is done. `drawMs` is the draw time on the game clock (pauses already added).
 * The draw time closes the list even if the game is paused afterwards: a pause that comes after the draw time must not open the list again.
 * `stopped`: the Organizer stopped the game before the draw, so registering is closed and the draw is made by hand (Start).
 */
export function registrationClosed(d: DrawRow | null, now: number, drawMs: number, _paused = false, stopped = false): boolean {
  if (!d) return false;
  if (d.drawn_ms !== null || d.closing_ms !== null || d.freeze_ms !== null) return true;
  if (stopped) return true; // the Organizer stopped the game before the draw: registering is closed and the draw is made by hand
  return d.mode === "auto" && now >= drawMs;
}
/** The instant the entry list closed: the draw time (automatic) or the press of Start (manual). null while the list can still change. After this instant nothing changes who is in the draw. */
export function freezeAt(d: DrawRow | null, now: number, drawMs: number): number | null {
  if (!d) return null;
  if (d.freeze_ms !== null) return d.freeze_ms;
  return d.mode === "auto" && now >= drawMs ? drawMs : null;
}
/** The beacon round a manual start uses. It is chosen at the press and is at least TWO rounds after the round that is public at that moment, so nobody (not even a clock a few seconds out) can have seen its value when pressing. */
export const manualRound = (pressMs: number): number => roundAt(pressMs) + 2;

const mask = (name: string | null | undefined, emp: string | null | undefined, n: number): string => {
  const nm = (name ?? "").trim(), id = (emp ?? "").trim();
  if (nm) { const p = nm.split(" ").filter(Boolean); return (p.length > 1 ? `${p[0]} ${p[p.length - 1]![0]!.toUpperCase()}.` : p[0]!) + (id.length > 2 && !id.includes("@") ? ` (Employee ID ends ${id.slice(-2)})` : ""); }
  if (id.length > 3 && !id.includes("@")) return `${id[0]}${"•".repeat(Math.min(4, id.length - 3))}${id.slice(-2)}`;
  if (id.includes("@")) { const [u, dom] = id.split("@"); return `${u![0]}•••@${dom}`; }
  return `Winner ${n}`;
};

/** What every screen shows: the settings, the state and (after the draw) the result. `pid` adds `mine` for that participant (the "You won" button). */
export async function drawFacts(env: Env & PiiEnv, e: any, now: number, t: { drawRound: number; paused: boolean; stopped?: boolean }, pid?: string | null) {
  const d = await drawRow(env.DB, e.id);
  if (!d) return { draw: null };
  const stopped = !!t.stopped && d.drawn_ms === null;
  const drawMs: number | null = stopped || !Number.isFinite(t.drawRound) ? null : roundMs(t.drawRound); // after a Stop there is no draw time: null (the pages say "the organizer presses Draw")
  const prizes: string[] = JSON.parse(d.prizes || "[]");
  const closed = registrationClosed(d, now, drawMs ?? Infinity, t.paused, stopped);
  const mode: "auto" | "manual" = stopped ? "manual" : d.mode, drawing = mode === "manual" && d.freeze_ms !== null && d.drawn_ms === null; // Start was pressed: the list is closed and the winners come when the chosen beacon round is published
  const base = { winners: d.winners, mode, prizes, drawMs, ...(stopped ? { stopped: true } : {}), paused: t.paused, closed, drawn: d.drawn_ms !== null, drawnMs: d.drawn_ms, entries: d.entries, rehearsal: !!e.rehearsal_of, fairness: DRAW_FAIRNESS, privacy: NO_PERSONAL_LINE, ...(d.freeze_ms !== null ? { listClosedMs: d.freeze_ms } : {}), ...(drawing ? { drawing: true, drawAtMs: roundMs(d.target_round ?? 0) } : {}) };
  if (d.drawn_ms === null) return { draw: base };
  const res: { pid: string; place: number }[] = JSON.parse(d.result || "[]");
  const places = prizePlaces(Math.max(d.winners, res.length));
  const list = [] as { place: string; prize: string; who: string }[];
  for (const r of res) {
    const row = await env.DB.prepare("SELECT pii FROM participant WHERE eid=? AND pid=?").bind(e.id, r.pid).first<{ pii: string | null }>();
    const p = await openPii(env, row?.pii ?? null);
    list.push({ place: places[r.place]!, prize: prizes[r.place] ?? "", who: mask(p?.name, p?.empId, r.place + 1) });
  }
  const mine = pid ? res.find((r) => r.pid === pid) : undefined;
  return { draw: { ...base, round: d.round, beacon: d.beacon, ref: d.ref, result: list, mine: mine ? { place: places[mine.place]!, prize: prizes[mine.place] ?? "" } : null } };
}

/**
 * All entries of a draw, in batches (never one by one), AS THEY STOOD at `freezeMs`, the moment the list closed. The seat list is the entry list: one seat is one person.
 * Anything that happens at or after that moment is ignored: a person removed or who left later is still in the draw, and a seat that came or was claimed later is not. So nobody (organizer, Host or player)
 * can change the entries once the beacon value is, or can become, public.
 */
export async function entryPids(db: D1, eid: string, freezeMs: number): Promise<string[]> {
  const out: string[] = [];
  for (let off = 0; ; off += 5000) {
    const rows = (await db.prepare("SELECT s.pid AS pid FROM seat s LEFT JOIN participant p ON p.eid=s.eid AND p.pid=s.pid WHERE s.eid=? AND (s.blocked IS NULL OR s.blocked=0 OR s.blk_ms>=?) AND (s.src IS NULL OR s.src<>'roster' OR s.dev IS NOT NULL) AND (p.joined_ms IS NULL OR p.joined_ms<?) ORDER BY s.seq LIMIT 5000 OFFSET ?").bind(eid, freezeMs, freezeMs, off).all<{ pid: string }>()).results ?? [];
    for (const r of rows) out.push(r.pid);
    if (rows.length < 5000) break;
  }
  return out;
}

export type DrawOutcome = { ok: true; already?: boolean; pending?: { round: number; atMs: number } } | { ok: false; error: string; status: number };
export interface DrawDeps { /** test hook: the beacon fetch (production always uses the signature-checked fetch) */ fetchRound?: typeof fetchRound }
/**
 * Draw now, if allowed.
 *  - Automatic: when the draw time has come the draw uses the beacon round OF the draw time and the entries as they stood at the draw time. The scheduled job (every minute) or any page that asks makes the draw; neither can change the list.
 *  - Manual: `by` is the Organizer or the Host (anybody else is refused). The press closes the list at once and chooses a beacon round that is published AFTER the press (manualRound), so nobody can see the outcome before pressing. The winners
 *    appear when that round is published (a few seconds); the scheduled job or any page that asks completes it. Pressing again only asks how it is going; it never reopens the list or picks another round.
 *  - "auto" as `by` is the system finishing a draw (automatic at its time, or a manual one that was pressed).
 * Only a signature-checked round counts. An older, already public round is never used.
 */
export async function runDraw(env: Env & PiiEnv & PayEnv, e: any, now: number, t: { drawRound: number; paused: boolean; stopped?: boolean }, by: Role | "auto", deps: DrawDeps = {}): Promise<DrawOutcome> {
  let d = await drawRow(env.DB, e.id);
  if (!d) return { ok: false, error: "This game is not a Lucky Draw.", status: 404 };
  if (d.drawn_ms !== null) { // already drawn: if a passing database hiccup left the tail (life, winners, prizes, e-mails) open, this repeat finishes it; a plain repeat changes nothing
    if (await pendingFinish(env.DB, e.id)) await finishDraw(env, e, d, JSON.parse(d.result || "[]"), true);
    return { ok: true, already: true };
  }
  if (e.pack === 0) return { ok: false, error: "The game starts only after it is paid for. Please pay in your console first.", status: 402 }; // OWNER RULE 20 Nov 2026: no payment, no game (a free game for up to 10 people and a paid game both have a pack above 0)
  const drawMs = roundMs(t.drawRound);
  const mode: "auto" | "manual" = t.stopped ? "manual" : d.mode; // a Stop before the draw switches it to a manual draw (Start)
  if (by === "auto") {
    if (mode === "auto") { if (t.paused) return { ok: false, error: "The draw is paused. It waits until you resume.", status: 409 }; if (now < drawMs + 3000) return { ok: false, error: "It is not draw time yet.", status: 409 }; }
    else if (d.freeze_ms === null) return { ok: false, error: "The game starts when you press Start.", status: 409 };
  } else if (mode !== "manual") return { ok: false, error: "This game starts by itself at the time you set, so there is nothing to press.", status: 409 };
  else if (by !== "organizer" && by !== "host") return { ok: false, error: "Only you or your Host can start the game.", status: 403 };
  else if (d.freeze_ms === null) { // the press: the list closes now, and the beacon round is one that does not exist yet
    if (t.paused) return { ok: false, error: "The draw is paused. It waits until you resume.", status: 409 };
    const up = await env.DB.prepare("UPDATE draw SET freeze_ms=?, target_round=?, by_role=? WHERE eid=? AND drawn_ms IS NULL AND freeze_ms IS NULL").bind(now, manualRound(now), by, e.id).run();
    d = (await drawRow(env.DB, e.id))!; // when two people pressed together, the first press stands for both
    if (d.drawn_ms !== null) return { ok: true, already: true };
    void up;
  }
  const manual = mode === "manual";
  const freezeMs = manual ? d.freeze_ms! : drawMs;
  const target = manual ? d.target_round! : t.drawRound;
  if (now < roundMs(target)) return { ok: true, pending: { round: target, atMs: roundMs(target) } }; // the beacon value does not exist yet: nobody has it
  // claim the draw: one request does the work
  const claim = await env.DB.prepare("UPDATE draw SET closing_ms=? WHERE eid=? AND drawn_ms IS NULL AND (closing_ms IS NULL OR closing_ms < ?)").bind(now, e.id, now - 120_000).run();
  if (!(claim.meta?.changes ?? 0)) return { ok: false, error: "The draw is being made. Please wait a moment.", status: 409 };
  const release = () => env.DB.prepare("UPDATE draw SET closing_ms=NULL WHERE eid=? AND drawn_ms IS NULL").bind(e.id).run();
  try {
    const got = await (deps.fetchRound ?? fetchRound)(target); // exactly this round: never an older one that is already public
    if (!got) { await release(); return { ok: false, error: "The public beacon did not answer yet. It is tried again in a minute.", status: 503 }; }
    const pids = await entryPids(env.DB, e.id, freezeMs);
    const clock = startClock(newClock());
    const role = (manual ? d.by_role : "auto") as Role | "auto";
    let s: DrawState = luckyDrawRules.init({ eid: e.id, winners: d.winners, prizes: JSON.parse(d.prizes || "[]").join(","), draw: mode, closeAt: manual ? undefined : drawMs, idKind: "emp", ref: d.ref, cap: Math.min(e.cap, DRAW_CAP), rehearsal: !!e.rehearsal_of }, [], now);
    const regAt = manual ? now : drawMs - 1;
    for (let i = 0; i < pids.length; i += 5000) s = luckyDrawRules.step(s, { type: "registerMany", players: pids.slice(i, i + 5000) }, regAt, clock).state;
    const fin = manual ? luckyDrawRules.step(s, { type: "draw", by: (role === "auto" ? "organizer" : role) as Role, beacon: got.randomness }, now, clock) : luckyDrawRules.step(s, { type: "tick", beacon: got.randomness }, Math.max(now, drawMs), clock);
    if (!fin.state.drawn) { await release(); return { ok: false, error: "The draw could not be made. Nothing was changed.", status: 409 }; }
    const byLower = new Map(pids.map((p) => [p.toUpperCase().replace(/[^A-Z0-9]/g, ""), p])); // the engine cleans IDs the same way for everybody; map back to the seat
    const result = fin.state.drawn.map((w, place) => ({ pid: byLower.get(w) ?? w, place }));
    // The draw (who won) is committed ONCE, together with a "tail owed" marker, in one all-or-nothing step. The tail (end of game, winner record, prizes, e-mails) is then finished here; if a passing database hiccup stops it,
    // the marker stays and the next press / request / scheduled run finishes it (nothing is lost, nothing is done twice).
    const [upd] = await env.DB.batch([
      env.DB.prepare("UPDATE draw SET drawn_ms=?, round=?, beacon=?, result=?, by_role=COALESCE(by_role, ?), entries=?, freeze_ms=COALESCE(freeze_ms, ?) WHERE eid=? AND drawn_ms IS NULL").bind(now, got.round, got.randomness, JSON.stringify(result), manual ? role : "auto", s.entries.length, freezeMs, e.id),
      env.DB.prepare("INSERT OR IGNORE INTO kv(k,v) SELECT ?, ? WHERE EXISTS (SELECT 1 FROM draw WHERE eid=? AND drawn_ms=?)").bind(`drawpend/${e.id}`, String(now), e.id, now),
    ]);
    if (!(upd?.meta?.changes ?? 0)) return { ok: true, already: true };
    try { const fresh = (await drawRow(env.DB, e.id))!; await finishDraw(env, e, fresh, result, false); } catch { /* the draw stands; the tail is finished by the next request or the scheduled run */ }
    return { ok: true };
  } catch (err) {
    await release();
    return { ok: false, error: "The draw could not be made. Nothing was changed. Please try again.", status: 500 };
  }
}

/** True while the tail of a committed draw is still owed (see runDraw). */
async function pendingFinish(db: D1, eid: string): Promise<boolean> {
  return !!(await db.prepare("SELECT 1 AS x FROM kv WHERE k=?").bind(`drawpend/${eid}`).first());
}

/**
 * The tail of a committed draw: the end of the game, the winner record, the prize rows, then the e-mails. Every step is safe to do twice (and the e-mails are sent once: the marker is cleared before them).
 * strict: a passing database hiccup is thrown out (so the caller answers "busy" and the repeat finishes the job) instead of being swallowed.
 */
export async function finishDraw(env: Env & PiiEnv & PayEnv, e: any, d: DrawRow, result: { pid: string; place: number }[], strict: boolean): Promise<void> {
  const at = d.drawn_ms ?? Date.now();
  await env.DB.prepare("INSERT INTO life(eid,end_ms,end_src) VALUES(?,?,'phones') ON CONFLICT(eid) DO UPDATE SET end_ms=excluded.end_ms, end_src='phones' WHERE life.purged_ms IS NULL").bind(e.id, at).run();
  if (!e.rehearsal_of) {
    await recordWinners(env as any, e, e.id, result.map((r) => ({ pattern: "lucky", ordinal: r.place + 1, round: 1, idx: 0, pids: [r.pid] })), at, "draw", true);
    for (const r of result) {
      const seat = Number(r.pid.split("x")[0]);
      const row = await env.DB.prepare("SELECT pii FROM participant WHERE eid=? AND pid=?").bind(e.id, r.pid).first<{ pii: string | null }>();
      if (Number.isFinite(seat)) await env.DB.prepare("INSERT OR IGNORE INTO prize(eid,round,pattern,ordinal,seat,pii,orig) VALUES(?,?,?,?,?,?,?)").bind(e.id, 1, "lucky", r.place + 1, seat, row?.pii ?? null, row?.pii ?? null).run();
    }
  }
  if (!(await env.DB.prepare("DELETE FROM kv WHERE k=?").bind(`drawpend/${e.id}`).run()).meta?.changes) return; // someone else finished it a moment ago: they send the e-mails
  if (!e.rehearsal_of) await mailResult(env, e, d, result, at);
}

/** The result by e-mail: to every winner who gave an e-mail ID (the entry is the e-mail), and a summary to the Organizer. Never blocks the draw. */
async function mailResult(env: Env & PiiEnv & PayEnv, e: any, d: DrawRow, result: { pid: string; place: number }[], now: number): Promise<void> {
  try {
    const prizes: string[] = JSON.parse(d.prizes || "[]");
    const places = prizePlaces(Math.max(d.winners, result.length));
    const title = (() => { try { return JSON.parse(e.config || "{}").name || e.id; } catch { return e.id; } })();
    const lines: string[] = [];
    for (const r of result) {
      const row = await env.DB.prepare("SELECT pii FROM participant WHERE eid=? AND pid=?").bind(e.id, r.pid).first<{ pii: string | null }>();
      const p = await openPii(env, row?.pii ?? null);
      lines.push(`${places[r.place]}: ${mask(p?.name, p?.empId, r.place + 1)}${prizes[r.place] ? " - " + prizes[r.place] : ""}`);
      if (p?.empId && p.empId.includes("@")) await sendMail(env, env.DB, p.empId, `You won: ${title}`, `Congratulations! You won ${places[r.place]} place in ${title}${prizes[r.place] ? ` and the prize is: ${prizes[r.place]}` : ""}.\n\nOpen the game page and press "You won" to confirm where your prize should go.\n\n${NO_PERSONAL_LINE}`, now);
    }
    const org = (await teamEmails(env, e.org, e.id)).organizer;
    if (org) await sendMail(env, env.DB, org, `Lucky Draw result: ${title}`, `The draw is done.\n\n${lines.join("\n")}\n\nEntries: ${d.entries ?? "see game page"}. Beacon round ${d.round}.\n${DRAW_FAIRNESS}\n\n${NO_PERSONAL_LINE}`, now);
  } catch { /* the result stands; mail is retried by the outbox where it was queued */ }
}

/** Draws that are due and that nobody has looked at: the scheduled job (every minute) calls this. Automatic draws whose time has come, manual draws that were started and wait for their beacon round, and drawn games whose tail (winner record, prizes, e-mails) is still owed. Bounded: 10 draws per call. */
export async function drawTick(env: Env & PiiEnv & PayEnv, now: number, timing: (e: any) => Promise<{ drawRound: number; paused: boolean; stopped?: boolean }>, deps: DrawDeps = {}): Promise<number> {
  const rows = (await env.DB.prepare("SELECT e.* FROM draw d JOIN engagement e ON e.id=d.eid WHERE ((d.drawn_ms IS NULL AND e.cancelled_ms IS NULL AND ((d.mode='auto' AND e.start_round < ?) OR d.freeze_ms IS NOT NULL)) OR (d.drawn_ms IS NOT NULL AND EXISTS (SELECT 1 FROM kv WHERE k='drawpend/' || d.eid))) ORDER BY e.start_round LIMIT 10").bind(roundAt(now)).all<any>()).results ?? [];
  let n = 0;
  for (const e of rows) { const r = await runDraw(env, e, now, await timing(e), "auto", deps); if (r.ok && !r.already && !r.pending) n++; }
  return n;
}

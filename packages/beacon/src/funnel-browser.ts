// Bundled to apps/web/public/funnel.js (window.CBFunnel): the shared funnel-event reporter from the common engine (core 0.9.8).
// Flag-guarded: nothing is sent unless the server says funnel is on (GET /api/game-manifest -> funnel:true). First-party path, no personal details, Global Privacy Control respected.
import { makeReporter, type FunnelEvent } from "../../../vendor/game-core/packages/core/src/funnel";
const r = makeReporter({ endpoint: "/stats/e", game: "luckydraw" });
let on: boolean | null = null; const wait: [FunnelEvent, Record<string, unknown>?][] = [];
const flush = (): void => { if (on) for (const [e, p] of wait) r.report(e, p); wait.length = 0; };
void fetch("/api/game-manifest", { credentials: "omit" }).then((x) => x.json()).then((m) => { on = m && m.funnel === true; flush(); }).catch(() => { on = false; wait.length = 0; });
(globalThis as any).CBFunnel = { report: (e: FunnelEvent, p?: Record<string, unknown>): void => { if (on === false) return; wait.push([e, p]); flush(); } };

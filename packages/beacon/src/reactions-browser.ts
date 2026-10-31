// Bundled to apps/web/public/reactions.js (window.CBReact): the shared reaction pack from the common engine.
// The pack keeps its own rules (2.2 s each, corner strip, 15 s apart, at most 15 per 10 minutes); this page only offers a word at a fitting event.
import { createReactions } from "../../../vendor/game-core/packages/ui/src/reactions";
const rx = createReactions("me");
(globalThis as any).CBReact = {
  react: (id: string, high?: boolean) => rx.react(id, { now: Date.now(), game: "luckydraw", who: "me", priority: high ? "high" : "normal" }),
  setMode: (m: "off" | "reduced" | "full") => rx.setMode(m),
};

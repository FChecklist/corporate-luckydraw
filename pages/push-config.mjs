// The ONE setting of the "notify me when this game begins" button lives in apps/web/public/push-config.js (window.CB_PUSH_API = "...", empty while the button is dark).
// This file reads that value for the build and makes the one change it needs in the headers: the game page may connect to that one address and no other. Empty or not a real https address = no change at all.
// The same test as apps/web/public/push-loader.js uses, so the page and its headers can never disagree about whether the button is on.
import { readFileSync } from "node:fs";

/** The origin of the alert service named in the text of push-config.js, or "" when the setting is empty or is not a real https address. */
export function pushOriginOf(source) {
  const m = /window\.CB_PUSH_API\s*=\s*"([^"]*)"/.exec(source);
  const raw = (m ? m[1] : "").trim().replace(/\/+$/, "");
  if (!raw) return "";
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" || u.username || u.password || u.search || u.hash || !u.hostname.includes(".")) return "";
    return u.origin;
  } catch { return ""; }
}
export const readPushOrigin = (file) => pushOriginOf(readFileSync(file, "utf8"));

/** A Content-Security-Policy with the alert service added to connect-src (and nothing else changed). With no origin the policy is returned as it was. */
export function withPushConnect(csp, origin) {
  if (!origin) return csp;
  if (!csp.includes("connect-src 'self'")) throw new Error("the policy has no connect-src 'self' to extend");
  return csp.replace("connect-src 'self'", `connect-src 'self' ${origin}`);
}

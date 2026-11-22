// Where the one console lives, and which of this game's own payment routes are sent there when PAY_VIA_CONSOLE=1 (docs/PAY_STEP.md, item 4 of "what each game must still do").
// The bridge's own list covers /pay.html, /paylink.html, /paytest.html and the /api/z/<id>/(paylink|order|verify|pay|credit|apply-credit) and /api/(order|verify|credit) routes.
// This game's other routes that start or show a payment are added here. Razorpay's own notice to the game (/api/payments/webhook) is NOT in the list: money already paid must still be recorded.
export const CONSOLE_ORIGIN = "https://console.corporatetambola.com";
export const LEGACY_PAY_EXTRA: RegExp[] = [
  /^\/(pay|paylink|paytest)$/, // the same pages without .html (Cloudflare Pages serves both spellings)
  /^\/paylink\/.+/, /^\/api\/(checkout|proforma)$/, /^\/api\/payments\/(test|paytest|verify|create|order)$/, /^\/api\/z\/[A-Za-z0-9_-]{4,40}\/pay-with-credit$/, /^\/api\/paylink(\/.*)?$/,
];
// Login is only at home.corporatetambola.com. The old sign-in page is sent there unless it is the console hand-off landing (it carries a one-time ?t= token AND go=console).
export const HOME_ORIGIN = "https://home.corporatetambola.com";

/**
 * GO-LIVE IS ONE STEP (audit M2). Two settings make "the console is the only place to sign in and pay": PAY_VIA_CONSOLE=1 (old pay and login routes go away) and CONSOLE_PUBKEYS (the console's signed notice is accepted).
 * Only one of them set would leave a game that cannot be paid (flag without keys) or that still shows its own pay and sign-in pages (keys without flag). So the redirects use `effectiveFlag`: they switch on only when BOTH are set,
 * and `goLiveState` tells the owner's health check which one is missing (the uptime check fails on a half switch, so it is noticed at once).
 */
export function goLiveState(env: { PAY_VIA_CONSOLE?: string; CONSOLE_PUBKEYS?: string; TEST_OPEN_JOIN?: string } | undefined | null): { flag: boolean; keys: boolean; ready: boolean; dark: boolean; problems: string[] } {
  const flag = env?.PAY_VIA_CONSOLE === "1", keys = !!(env?.CONSOLE_PUBKEYS && String(env.CONSOLE_PUBKEYS).trim());
  const problems: string[] = [];
  if (flag && !keys) problems.push("PAY_VIA_CONSOLE is on but CONSOLE_PUBKEYS is not set: the console cannot tell this game that a payment was made. Set CONSOLE_PUBKEYS, or switch PAY_VIA_CONSOLE off.");
  if (!flag && keys) problems.push("CONSOLE_PUBKEYS is set but PAY_VIA_CONSOLE is not 1: this game still shows its own pay and sign-in pages. Set PAY_VIA_CONSOLE=1 (both settings in one step).");
  if (env?.TEST_OPEN_JOIN) problems.push("TEST_OPEN_JOIN is set. It switches off the invitation-only, ID-only rule and is for old tests only. Remove it."); // audit L-1: one dashboard variable must not undo the owner's rule quietly
  return { flag, keys, ready: flag && keys, dark: !flag && !keys, problems };
}
/** The flag value the redirects use: "1" only when the go-live is complete (both settings), otherwise nothing is redirected. */
export const effectiveFlag = (env: { PAY_VIA_CONSOLE?: string; CONSOLE_PUBKEYS?: string } | undefined | null): string | undefined => (goLiveState(env).ready ? "1" : undefined);

/** With the flag on, the old sign-in page goes to home. The hand-off landing keeps working ONLY when it carries the console's one-time token (t = 48 hex letters) AND go=console: any other token belongs to the old e-mail sign-in, which is gone. */
export function signinRedirect(req: Request, flag: string | undefined): Response | null {
  if (flag !== "1") return null;
  const u = new URL(req.url), path = u.pathname.replace(/\/+$/, "");
  if (path !== "/signin.html" && path !== "/signin") return null;
  if (/^[0-9a-f]{48}$/.test(u.searchParams.get("t") ?? "") && u.searchParams.get("go") === "console") return null;
  return new Response(null, { status: 302, headers: { location: HOME_ORIGIN + "/", "cache-control": "no-store" } });
}

/** This game's own sign-in doors: with the flag on every one of them answers 302 to home (nothing is deleted). The console's hand-off (/api/console/*) is not in the list. */
export const LEGACY_LOGIN: RegExp[] = [/^\/api\/start$/, /^\/api\/auth\/(email|google|link|verify|config)$/];
export function legacyLoginRedirect(req: Request, flag: string | undefined): Response | null {
  if (flag !== "1") return null;
  const path = new URL(req.url).pathname.replace(/\/+$/, "");
  if (!LEGACY_LOGIN.some((r) => r.test(path))) return null;
  return new Response(null, { status: 302, headers: { location: HOME_ORIGIN + "/", "cache-control": "no-store" } });
}

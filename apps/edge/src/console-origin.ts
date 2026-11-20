// Where the one console lives, and which of this game's own payment routes are sent there when PAY_VIA_CONSOLE=1 (docs/PAY_STEP.md, item 4 of "what each game must still do").
// The bridge's own list covers /pay.html, /paylink.html, /paytest.html and the /api/z/<id>/(paylink|order|verify|pay|credit|apply-credit) and /api/(order|verify|credit) routes.
// This game's other routes that start or show a payment are added here. Razorpay's own notice to the game (/api/payments/webhook) is NOT in the list: money already paid must still be recorded.
export const CONSOLE_ORIGIN = "https://console.corporatetambola.com";
export const LEGACY_PAY_EXTRA: RegExp[] = [
  /^\/(pay|paylink|paytest)$/, // the same pages without .html (Cloudflare Pages serves both spellings)
  /^\/paylink\/.+/, /^\/api\/(checkout|proforma)$/, /^\/api\/payments\/(test|paytest|verify|create|order)$/, /^\/api\/z\/[A-Za-z0-9_-]{4,40}\/pay-with-credit$/, /^\/api\/paylink(\/.*)?$/,
];
// Login is only at home.corporatetambola.com. The old sign-in page is sent there unless it is the console hand-off landing (it carries a one-time ?t= token).
export const HOME_ORIGIN = "https://home.corporatetambola.com";
/** With the flag on, the old sign-in page goes to home. The hand-off landing keeps working: it carries the console's one-time token (t=48 hex letters) and nothing else on this page is a login then. */
export function signinRedirect(req: Request, flag: string | undefined): Response | null {
  if (flag !== "1") return null;
  const u = new URL(req.url), path = u.pathname.replace(/\/+$/, "");
  if (path !== "/signin.html" && path !== "/signin") return null;
  if (/^[0-9a-f]{48}$/.test(u.searchParams.get("t") ?? "")) return null;
  return new Response(null, { status: 302, headers: { location: HOME_ORIGIN + "/", "cache-control": "no-store" } });
}

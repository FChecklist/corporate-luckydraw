// Cloudflare Pages middleware: the old *.pages.dev address redirects page requests (301) to the real address; /api/* keeps working as before.
// OWNER RULE 20 Nov 2026: payment and login are not on this game's pages. With PAY_VIA_CONSOLE=1 the old payment pages answer 302 to the console (nothing is deleted),
// and the old sign-in page answers 302 to home.corporatetambola.com unless it is the console's one-time hand-off landing (?t=...).
import { domainRedirect } from "../../apps/edge/src/domain-redirect";
import { BRAND } from "../../apps/edge/src/brand";
import { legacyPayRedirect } from "../../apps/edge/src/console-bridge/bridge";
import { CONSOLE_ORIGIN, LEGACY_PAY_EXTRA, signinRedirect } from "../../apps/edge/src/console-origin";

export const onRequest = (ctx: { request: Request; env: any; next: () => Promise<Response> }) =>
  domainRedirect(ctx.request, ctx.env.PUBLIC_ORIGIN || BRAND.defaultOrigin)
  ?? legacyPayRedirect(ctx.request, { flag: ctx.env.PAY_VIA_CONSOLE, consoleOrigin: CONSOLE_ORIGIN, extra: LEGACY_PAY_EXTRA })
  ?? signinRedirect(ctx.request, ctx.env.PAY_VIA_CONSOLE)
  ?? ctx.next();

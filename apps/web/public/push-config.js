/* Corporate Lucky Draw: the ONE setting of the "notify me when this game begins" button on the game page (z.html).
   CB_PUSH_API is the https address of the corporate-push service. It is EMPTY today, so the button is dark: the game page shows nothing, loads no alert script or style, and makes no request to any alert service.
   To switch it on (the owner does this, after the two independent audits): put the address between the quotes, for example "https://push.corporatetambola.com" (no slash at the end); set the two alert settings of the site (docs/KNOWLEDGE.md names them);
   add this site's host to ALLOWED_ORIGINS_EXTRA on the push service; run migration 0034_push_notify.sql; then deploy. pages/build.mjs reads this same value to allow exactly that one address in the game page's connect-src. */
window.CB_PUSH_API = "";

// OWNER RULE 20 Nov 2026 (audit H2): a Lucky Draw is a CLOSED group, BY INVITATION, and people give an ID ONLY. The SERVER makes it so, whatever any screen, AI key or old client sends:
//   - a new game is always made for the people on the ID list; "anyone with the link" cannot be asked for (400 invite-only);
//   - people are asked for an ID and nothing else (verify is always "id"; any other way is refused with 400 id-only);
//   - an ID that is not on the list waits for the organizer to say yes or no; there is no open registration;
//   - every answer that says who can join says "list".
// TEST_OPEN_JOIN is the ONE exception, and it exists only so the older engine tests (cards, claims, retention: written for open games) can still run. It is never set in wrangler.toml
// or in the Pages settings, no request can set it, and test/invite-only.test.ts proves that no config file names it and that without it nothing open can be made.
export const INVITE_ONLY_MSG = "This game is by invitation only. Your ID list decides who can join, so \"anyone with the link\" is not available.";
export const ID_ONLY_MSG = "In this game people join with just an ID. A name, a mobile number or an e-mail address is not asked for.";
export const testOpenJoin = (env: unknown): boolean => (env as { TEST_OPEN_JOIN?: string } | null | undefined)?.TEST_OPEN_JOIN === "1";
/** Is this game a closed group? Always, except an old test game made open under TEST_OPEN_JOIN. */
export const isInviteOnly = (env: unknown, e: { closed?: number | null }): boolean => !(testOpenJoin(env) && !e.closed);
/** What every screen and API answer says about who can join. */
export const whoCanJoinOf = (env: unknown, e: { closed?: number | null }): "list" | "anyone" => (isInviteOnly(env, e) ? "list" : "anyone");
/** null when the request asks for nothing but an invitation-only, ID-only game; otherwise the refusal. */
export function inviteOnlyError(env: unknown, b: any): { error: string; code: string } | null {
  if (testOpenJoin(env)) return b?.whoCanJoin !== undefined && b.whoCanJoin !== "list" && b.whoCanJoin !== "anyone" ? { error: "Who can join: choose \"list\" (only people on a list) or \"anyone\" (anyone with the link).", code: "bad-request" } : null;
  if (b?.whoCanJoin !== undefined && b.whoCanJoin !== "list") return { error: INVITE_ONLY_MSG, code: "invite-only" };
  if (b?.closed === false) return { error: INVITE_ONLY_MSG, code: "invite-only" };
  if (b?.verify !== undefined && b.verify !== "id") return { error: ID_ONLY_MSG, code: "id-only" };
  return null;
}

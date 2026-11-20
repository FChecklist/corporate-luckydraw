// OWNER RULES v1.1 (20 Nov 2026) as the organizer and the invitee see them: the two start options, the ID invite text (word for word), paste IDs, approve or decline a request,
// one "Enter your ID" box for the invitee, the waiting state, and no sign-in or payment of its own. The real page scripts run in a DOM against the real Worker.
// FALSIFIED BY: the 3 planted breaks listed in docs/STATE.md
import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { newWorld, openPage, roundAt, T, type Page } from "./harness";
import { consentFor } from "../../edge/test/with-terms";
import { readFileSync } from "node:fs";
import { join } from "node:path";

setDefaultTimeout(60_000);
let open: Page[] = [];
afterEach(async () => { for (const p of open) await p.close(); open = []; });
const pub = (f: string) => readFileSync(join(import.meta.dir, "../public", f), "utf8");

async function organizer() {
  const w = newWorld();
  const s = await w.json(await w.api("POST", "/api/start", { email: "boss@acme.com" }));
  return { ...w, token: s.token as string };
}
type O = Awaited<ReturnType<typeof organizer>>;
const START = roundAt(T) + 1200;
const dev = (i: number) => (String(i).padStart(2, "0") + "d".repeat(32)).slice(0, 32);
async function consolePage(o: O, url: string) { const p = await openPage(o.world, { url: "http://localhost" + url, html: "zc.html", scripts: ["control.js", "zc.js"], session: { "cbz-org": o.token } }); open.push(p); return p; }
async function playerPage(o: O, url: string) { const p = await openPage(o.world, { url: "http://localhost" + url, html: "z.html", scripts: ["z.js"], session: {} }); open.push(p); return p; }
const draft = (o: O, id: string, over: Record<string, unknown> = {}) => o.api("POST", "/api/z", { id, startRound: START, callSeconds: 12, cap: 100, verify: "id", idKind: "emp", whoCanJoin: "anyone", ...over }, o.token);
const until = async (cond: () => boolean, ms = 8000) => { const t0 = Date.now(); while (!cond()) { if (Date.now() - t0 > ms) throw new Error("timed out"); await new Promise((r) => setTimeout(r, 40)); } };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("the start options: exactly two, in the console voice", () => {
  test("step 3 offers 'The game starts by itself' and 'You start the game' and nothing about calling numbers", async () => {
    const o = await organizer(); await draft(o, "ST-OPT");
    const p = await consolePage(o, "/zc.html?e=ST-OPT"); await p.waitFor((t) => /Name of the draw/.test(t));
    p.click('[data-step="3"]'); await p.waitFor((t) => /How does the game start/.test(t));
    const chips = [...p.win.document.querySelectorAll("[data-dmode]")].map((c: any) => `${c.dataset.dmode}:${c.textContent.trim()}`);
    expect(chips).toEqual(["auto:The game starts by itself", "manual:You start the game"]);
    expect(p.text()).toContain("The game begins at the time you set. You do nothing.");
    expect(p.text()).not.toMatch(/number|call/i);
    p.click('[data-dmode="manual"]'); await p.waitFor((t) => /The game waits for you\. Press Start when you are ready\./.test(t));
  });
  test("on the day a manual game shows 'Start the game' (never 'Draw now')", async () => {
    const o = await organizer(); await draft(o, "ST-DAY"); o.world.raw.prepare("UPDATE engagement SET pack=100 WHERE id='ST-DAY'").run();
    await o.api("POST", "/api/z/ST-DAY/drawset", { winners: 1, prizes: [], mode: "manual" }, o.token); o.world.raw.prepare("INSERT OR IGNORE INTO kv(k,v) VALUES('pub/ST-DAY','1')").run();
    const p = await consolePage(o, "/zc.html?e=ST-DAY"); await p.waitFor((t) => /Start time/.test(t));
    expect(p.$("#drawnow").textContent.trim()).toBe("Start the game");
    expect(p.text()).toContain("you start the game: you or a Host press Start");
    expect(p.text()).not.toMatch(/Draw now|press Draw/);
  });
});

describe("Invite people with just an ID (the owner's text, word for word)", () => {
  const TEXT = ["Invite people with just an ID", "No names or personal details are needed.", "Just upload or paste the IDs of the people you want to invite: employee ID, associate ID, vendor ID or customer ID, whichever you use.", "Your invitee opens the game link and enters their ID. If it is on your list, they join and play. If it is not, you get a request to approve or decline.", "The list and all IDs are deleted within 24 hours after the game ends."];
  test("choosing 'Only the people on your ID list' shows the text, the game link and the paste box; IDs are added in any written form", async () => {
    const o = await organizer(); await draft(o, "INV-1");
    const p = await consolePage(o, "/zc.html?e=INV-1"); await p.waitFor((t) => /Name of the draw/.test(t));
    p.click('[data-step="2"]'); await p.waitFor((t) => /Who can register/.test(t));
    expect(p.text()).toContain("Your game link"); expect(p.text()).toContain("/z.html?e=INV-1");
    p.click('[data-who="list"]'); await p.waitFor((t) => /Invite people with just an ID/.test(t));
    for (const t of TEXT) expect([t, p.text().includes(t)]).toEqual([t, true]);
    expect(p.text()).not.toMatch(/mobile number|e-mail address of/i);
    p.$("#f-ids").value = "A-1101\nA 1102, B/2203\nA-1101"; p.click("#addids");
    await p.waitFor((t) => /3 added/.test(t) && /Your list: 3 IDs/.test(t));
    expect(p.text()).toContain("A1101"); expect(p.text()).toContain("A1102"); expect(p.text()).toContain("B2203");
    expect(p.text()).toContain("already on your list");
  });
  test("the family option says 4 more", async () => {
    const o = await organizer(); await draft(o, "INV-2", { whoCanJoin: "list" });
    const p = await consolePage(o, "/zc.html?e=INV-2"); await p.waitFor((t) => /Name of the draw/.test(t));
    p.click('[data-step="2"]'); await p.waitFor((t) => /Invite people with just an ID/.test(t));
    expect(p.text()).toContain("Each person on your list can invite 4 more");
  });
  test("an ID that is not on the list becomes a request; the organizer approves in the console; the invitee comes in", async () => {
    const o = await organizer(); await draft(o, "INV-3", { whoCanJoin: "list" });
    expect((await o.api("POST", "/api/z/INV-3/drawset", { winners: 1, prizes: [], mode: "auto" }, o.token)).status).toBe(200);
    expect((await o.api("POST", "/api/z/INV-3/publish", { email: "boss@acme.com", phone: "98765 43210" }, o.token)).status).toBe(200);
    o.world.raw.prepare("UPDATE engagement SET pack=100 WHERE id='INV-3'").run();
    await o.api("POST", "/api/z/INV-3/people", { people: [{ empId: "L1" }] }, o.token);
    const pl = await playerPage(o, "/z.html?e=INV-3"); await pl.waitFor((t) => /Enter your ID/.test(t));
    expect(pl.$("#rnm")).toBeNull(); // one box: no name asked
    expect(pl.text()).toContain("If your ID is on the list, you join straight away.");
    pl.$("#rid").value = "Z 9001"; pl.$("#reg").dispatchEvent(new pl.win.Event("submit", { cancelable: true }));
    await pl.waitFor((t) => /Your request is on its way/.test(t));
    const cp = await consolePage(o, "/zc.html?e=INV-3"); await cp.waitFor((t) => /1 person is waiting for your answer/.test(t));
    expect(cp.text()).toContain("Z9001");
    cp.click("[data-admit]"); await cp.waitFor((t) => /Approved/.test(t) && /Nobody is waiting/.test(t));
    expect(cp.text()).toMatch(/Invite and approval log/);
    // the invitee's page checks by itself; here the same join again lets them in
    const again = await o.api("POST", "/api/z/INV-3/join", { empId: "z/9001", device: dev(5) });
    expect(again.status).toBe(200);
  });
  test("a request that is declined tells the invitee politely and does not let them in", async () => {
    const o = await organizer(); await draft(o, "INV-4", { whoCanJoin: "list" });
    await o.api("POST", "/api/z/INV-4/drawset", { winners: 1, prizes: [], mode: "auto" }, o.token); await o.api("POST", "/api/z/INV-4/publish", { email: "boss@acme.com", phone: "98765 43210" }, o.token);
    o.world.raw.prepare("UPDATE engagement SET pack=100 WHERE id='INV-4'").run();
    const w = await o.api("POST", "/api/z/INV-4/join", { empId: "Q-1", device: dev(1), consent: consentFor("K4") });
    expect(w.status).toBe(403); expect((await o.json(w)).code).toBe("waiting");
    const wj = o.world.raw.prepare("SELECT id FROM waiting WHERE eid='INV-4'").get() as any; expect(wj.id).toBeTruthy();
    expect((await o.api("POST", `/api/z/INV-4/waiting/${wj.id}`, { decision: "decline" }, o.token)).status).toBe(200);
    const no = await o.api("POST", "/api/z/INV-4/join", { empId: "q 1", device: dev(1) }); expect(no.status).toBe(403); expect((await o.json(no)).code).toBe("declined");
    expect(o.world.raw.prepare("SELECT COUNT(*) AS c FROM participant WHERE eid='INV-4'").get()).toEqual({ c: 0 });
  });
});

describe("this game's pages have no sign-in, payment or chat of their own", () => {
  test("the console sends people to home to sign in and to the console to pay (no own sign-in form, no pay link)", async () => {
    const o = await organizer(); await draft(o, "NOPAY-1");
    o.world.raw.prepare("UPDATE engagement SET pack=0 WHERE id='NOPAY-1'").run();
    await o.api("POST", "/api/z/NOPAY-1/publish", { email: "boss@acme.com", phone: "98765 43210" }, o.token);
    const p = await consolePage(o, "/zc.html?e=NOPAY-1"); await p.waitFor((t) => /Share this link/.test(t));
    const hrefs = [...p.win.document.querySelectorAll("a")].map((a: any) => a.getAttribute("href"));
    expect(hrefs.some((h: string) => /pay\.html|paylink/.test(h || ""))).toBe(false);
    expect(p.text()).not.toMatch(/Copy payment link/);
    const anon = await openPage(o.world, { url: "http://localhost/zc.html", html: "zc.html", scripts: ["control.js", "zc.js"], session: {} }); open.push(anon);
    await anon.waitFor((t) => /Go to sign-in/.test(t));
    expect(anon.$("#si").getAttribute("href")).toBe("https://home.corporatetambola.com/");
  });
  test("the scripts of the console and the player page contain no own login form, card form or chat", () => {
    for (const f of ["zc.js", "z.js"]) { const s = pub(f); expect(s).not.toMatch(/razorpay|checkout\.razorpay|x-organizer.*password|<input[^>]*type="password"|chat/i); }
  });
});

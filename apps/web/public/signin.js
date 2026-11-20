// The page the sign-in e-mail's buttons open. Opening it (a GET, which mail scanners do too) changes nothing: it only shows a button. Pressing the button POSTs the single-use token,
// which starts the session (the same kind of key the 6-digit code gives) and goes to the AI-link page or the console.
(() => {
  const app = document.getElementById("app");
  const q = new URLSearchParams(location.search), hs = (() => { try { return history.state || {}; } catch { return {}; } })(), t = q.get("t") || hs.t || "", goWord = q.get("go") || hs.go, go = goWord === "ai" ? "/ai-link.html" : "/zc.html";
  // OWNER RULES v1.1: login is only at home. The console's one-time hand-off lands here (?t=<48 hex>&go=console&e=<game or _new_>&to=<page>): one press redeems it (a mail or link scanner that only opens the page uses up nothing).
  const viaConsole = goWord === "console" && /^[0-9a-f]{48}$/.test(t), consoleEid = q.get("e") || hs.e || "", consoleTo = q.get("to") || hs.to || "", consoleFree = (q.get("free") || hs.free) === "1";
  try { history.replaceState({ t, go: go === "/ai-link.html" ? "ai" : goWord === "console" ? "console" : "", e: consoleEid, to: consoleTo, free: consoleFree ? "1" : "" }, "", location.pathname); } catch {} // the token leaves the address bar at once
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const draw = (msg) => {
    app.innerHTML = `<div class="zhead"><b>Corporate Lucky Draw</b></div><div class="zcard zform"><h2>${viaConsole ? "Press the button to open your game" : t ? "Press the button to sign in" : "This page needs its link"}</h2>
      ${viaConsole ? `<p class="zsmall" style="margin-top:0">You come from your console. This link works once, for a minute.</p>` : t ? `<p class="zsmall" style="margin-top:0">This is Option 2 from your e-mail. It works once, for 10 minutes.</p>` : ""}
      ${msg ? `<div class="zbanner bad" role="alert">${esc(msg)}</div>` : ""}
      ${t ? `<button class="zbtn" id="go">${viaConsole ? "Open your game" : "Sign in"}</button>` : `<div class="zbanner bad" role="alert">This page lost your sign-in link, which can happen when it is reloaded or opened in another app. Open your e-mail and tap the button again, or type the 6-digit code from the same e-mail on the sign-in page. Both still work for 10 minutes.</div>`}
      <p class="zsmall">Something wrong? <a href="https://home.corporatetambola.com/">Go to sign-in at home</a> and open your console again.</p></div>`;
    const b = document.getElementById("go");
    if (b) b.onclick = async () => {
      b.disabled = true; b.textContent = "Opening your game...";
      try {
        if (viaConsole) { // the console's own hand-off: the game gives the key, and the console stays the only place where you sign in and pay
          const r = await fetch("/api/console/handoff/redeem", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ t }) });
          const j = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(j.message || j.error || "This link has run out. Please open the game again from your console.");
          try { CTK.set("cbz-org", j.key); } catch {}
          location.replace(j.eid === "_new_" ? "/zc.html?new=1" + (consoleFree ? "&demo=1" : "") : "/zc.html?e=" + encodeURIComponent(j.eid));
          return;
        }
        const r = await fetch("/api/auth/link", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: t }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || "Something went wrong. Please try again.");
        try { CTK.set("cbz-org", j.token); } catch {}
        location.replace(go);
      } catch (e) { draw(e && e.name === "TypeError" ? "The service could not be reached. Please check your internet and try again." : e && e.message ? e.message : "Something went wrong. Please try again."); }
    };
  };
  draw("");
})();

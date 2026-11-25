/* Corporate Lucky Draw: puts the "notify me when this game begins" block on the game page, but only when push-config.js holds a real https address.
   While that setting is empty (today) this file does nothing at all: no button, no style, no alert script, no request to any alert service.
   The block itself is the shared corporate-push client (push-optin.js and push-optin.css, copied unchanged from FChecklist/corporate-push at f1e93f59). It asks the browser for permission only after a tap, never on load.
   z.js tells this file, after each paint, which game it is and whether the game is over (CBPush.update); the block lives OUTSIDE the game area (#cbpush) so a repaint never wipes it. */
(function () {
  "use strict";
  var api = String(window.CB_PUSH_API || "").trim().replace(/\/+$/, "");
  var live = false;
  try {
    var u = new URL(api);
    live = u.protocol === "https:" && !u.username && !u.password && !u.search && !u.hash && u.hostname.indexOf(".") > 0;
  } catch (e) { live = false; }

  var version = "";
  try { version = new URL(document.currentScript.src).searchParams.get("v") || ""; } catch (e) { version = ""; }
  var box = null;
  function asset(path) { return path + (version ? "?v=" + encodeURIComponent(version) : ""); }

  function update(state) {
    if (!live || !state) return;
    var host = document.getElementById("cbpush");
    if (!host) return;
    var eid = String(state.eid || "");
    if (!state.show || !/^[A-Za-z0-9_-]{1,128}$/.test(eid)) { host.hidden = true; return; }
    host.hidden = false;
    var ended = state.ended === true;
    if (box) {
      if (ended && box.getAttribute("data-push-ended") !== "true") {
        box.setAttribute("data-push-ended", "true"); // set first: a block that has not started yet reads it when it does
        box.dispatchEvent(new CustomEvent("corporatepush:game-ended"));
      }
      return;
    }
    box = document.createElement("div");
    box.setAttribute("data-push-optin", "");
    box.setAttribute("data-push-api", api);
    box.setAttribute("data-push-site", "game");
    box.setAttribute("data-push-game-id", eid);
    box.setAttribute("data-push-sw", "/zsw.js");
    box.setAttribute("data-push-privacy", "/privacy.html");
    box.setAttribute("data-push-ended", ended ? "true" : "false");
    host.appendChild(box);
    var css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = asset("/push-optin.css");
    document.head.appendChild(css);
    var js = document.createElement("script");
    js.src = asset("/push-optin.js");
    document.head.appendChild(js);
  }

  window.CBPush = { live: live, update: update };
})();

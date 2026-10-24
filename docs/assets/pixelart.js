/* Pixel-art side visuals for the workshop pages. Any element with
   data-art="<name>" (and optional data-art-cap="<caption>") is filled with a
   crisp pixel-art canvas. "bot:<mood>" reuses the game's SUPPORTBOT renderer
   (TZBot); the others are small scenes drawn here. */
(function () {
  "use strict";
  var P = {
    cyan: "#37d6ff", cyanlt: "#9ff0ff", mag: "#ff3d81", maglt: "#ff8fb8",
    mint: "#58f5b0", mintlt: "#a6ffd8", gold: "#ffd23f", amber: "#ffae42",
    ink: "#d9d6f5", dim: "#6b6494", dark: "#241f45", out: "#0b0a1a",
    steel: "#6b78a6", steellt: "#aeb8dc", steeldk: "#3f4a72"
  };
  function grid(n) { var g = []; for (var i = 0; i < n; i++) { g.push(new Array(n).fill(null)); } return g; }
  function px(g, x, y, c) { var n = g.length; if (y >= 0 && y < n && x >= 0 && x < n && c) g[y][x] = c; }
  function spans(g, tbl, c) { for (var y in tbl) { var s = tbl[y]; for (var x = s[0]; x <= s[1]; x++) px(g, x, +y, c); } }
  function rect(g, x0, y0, x1, y1, c) { for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) px(g, x, y, c); }
  function occ(g, x, y) { var n = g.length; return x >= 0 && x < n && y >= 0 && y < n && g[y][x] != null; }
  function outline(g, c) {
    var n = g.length, ring = [];
    for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) {
      if (g[y][x] != null) continue;
      if (occ(g, x - 1, y) || occ(g, x + 1, y) || occ(g, x, y - 1) || occ(g, x, y + 1)) ring.push([x, y]);
    }
    ring.forEach(function (p) { g[p[1]][p[0]] = c; });
  }
  function paint(cv, g) {
    var n = g.length; cv.width = n; cv.height = n;
    var ctx = cv.getContext("2d"); ctx.clearRect(0, 0, n, n);
    for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) { var c = g[y][x]; if (c) { ctx.fillStyle = c; ctx.fillRect(x, y, 1, 1); } }
  }

  var SHIELD = { 3: [7, 16], 4: [6, 17], 5: [6, 17], 6: [6, 17], 7: [6, 17], 8: [6, 17], 9: [6, 17], 10: [6, 17], 11: [6, 17], 12: [7, 16], 13: [7, 16], 14: [8, 15], 15: [9, 14], 16: [10, 13], 17: [11, 12] };

  var SCENES = {
    shield: function () {
      var g = grid(24); spans(g, SHIELD, P.mint);
      for (var y = 3; y <= 17; y++) { if (SHIELD[y]) { px(g, SHIELD[y][0], y, P.mintlt); } }
      // check mark
      [[9, 10], [10, 11], [11, 12], [12, 11], [13, 10], [14, 9], [15, 8]].forEach(function (p) { px(g, p[0], p[1], P.ink); });
      [[9, 11], [10, 12], [11, 13], [12, 12], [13, 11], [14, 10], [15, 9]].forEach(function (p) { px(g, p[0], p[1], P.ink); });
      outline(g, P.cyan); return g;
    },
    crack: function () {
      var g = grid(24); spans(g, SHIELD, P.mint);
      for (var y = 3; y <= 17; y++) { if (SHIELD[y]) { px(g, SHIELD[y][0], y, P.mintlt); } }
      // a jagged break on the right edge
      [[17, 6], [17, 7], [16, 8], [17, 9], [16, 10]].forEach(function (p) { px(g, p[0], p[1], null); });
      // magenta crack down the middle
      [[12, 3], [12, 4], [11, 5], [11, 6], [12, 7], [12, 8], [10, 9], [11, 10], [12, 11], [11, 12], [11, 13], [12, 14]].forEach(function (p) { px(g, p[0], p[1], P.mag); });
      outline(g, P.mag); return g;
    },
    lock: function () {
      var g = grid(24);
      // shackle (hollow arc)
      [5, 6, 7, 8, 9].forEach(function (y) { px(g, 9, y, P.steel); px(g, 14, y, P.steel); });
      rect(g, 10, 3, 13, 4, P.steel); px(g, 9, 4, P.steel); px(g, 14, 4, P.steel);
      [5, 6, 7, 8, 9].forEach(function (y) { px(g, 9, y, P.steellt); });
      // body
      spans(g, { 10: [7, 16], 11: [6, 17], 12: [6, 17], 13: [6, 17], 14: [6, 17], 15: [6, 17], 16: [6, 17], 17: [6, 17], 18: [7, 16], 19: [8, 15] }, P.gold);
      for (var y = 10; y <= 19; y++) px(g, 6, y, P.amber);
      // keyhole
      [[11, 13], [12, 13], [11, 14], [12, 14], [11, 15], [11, 16]].forEach(function (p) { px(g, p[0], p[1], P.dark); });
      outline(g, P.out); return g;
    },
    doc: function () {
      var g = grid(24);
      // page with a folded top-right corner
      spans(g, { 2: [5, 15], 3: [5, 16], 4: [5, 17], 5: [5, 17], 6: [5, 17], 7: [5, 17], 8: [5, 17], 9: [5, 17], 10: [5, 17], 11: [5, 17], 12: [5, 17], 13: [5, 17], 14: [5, 17], 15: [5, 17], 16: [5, 17], 17: [5, 17], 18: [5, 17], 19: [5, 17], 20: [5, 17] }, P.ink);
      px(g, 16, 2, P.dim); px(g, 17, 3, P.dim); px(g, 15, 2, P.ink);
      // gray text lines
      [[5, [7, 16]], [7, [7, 14]], [9, [7, 16]], [11, [7, 13]], [16, [7, 16]], [18, [7, 14]]].forEach(function (r) { for (var x = r[1][0]; x <= r[1][1]; x++) px(g, x, r[0], P.dim); });
      // the injected instruction line (magenta), standing out
      for (var x = 7; x <= 16; x++) { px(g, x, 13, P.mag); px(g, x, 14, P.maglt); }
      outline(g, P.steeldk); return g;
    },
    layers: function () {
      var g = grid(24);
      // three offset plates: a stack of controls
      rect(g, 8, 10, 19, 20, P.gold); outline(g, P.out);
      rect(g, 6, 7, 17, 17, P.mint);
      rect(g, 4, 4, 15, 14, P.cyan);
      // re-outline the whole stack lightly
      outline(g, P.out);
      // a small check on the front plate
      [[7, 9], [8, 10], [9, 11], [10, 10], [11, 9], [12, 8]].forEach(function (p) { px(g, p[0], p[1], P.ink); });
      return g;
    }
  };

  function render(host) {
    var name = host.getAttribute("data-art"), cap = host.getAttribute("data-art-cap");
    host.classList.add("art"); host.innerHTML = "";
    var cv = document.createElement("canvas"); cv.className = "art-cv"; cv.setAttribute("role", "img");
    if (cap) cv.setAttribute("aria-label", cap);
    host.appendChild(cv);
    if (cap) { var cc = document.createElement("div"); cc.className = "art-cap"; cc.textContent = cap; host.appendChild(cc); }
    if (name.indexOf("bot") === 0 && window.TZBot) {
      var mood = name.split(":")[1] || "calm";
      cv.width = window.TZBot.SIZE; cv.height = window.TZBot.SIZE;
      var ctx = cv.getContext("2d");
      var reduce = window.TZSite && window.TZSite.reduceMotion;
      if (reduce) { window.TZBot.paint(ctx, mood, 0); }
      else { var f = 0; (function loop() { window.TZBot.paint(ctx, mood, f++); requestAnimationFrame(loop); })(); }
    } else if (SCENES[name]) {
      paint(cv, SCENES[name]());
    }
  }
  function init() { Array.prototype.forEach.call(document.querySelectorAll("[data-art]"), render); }
  if (document.readyState !== "loading") init(); else document.addEventListener("DOMContentLoaded", init);
  window.TZArt = { SCENES: SCENES };
})();

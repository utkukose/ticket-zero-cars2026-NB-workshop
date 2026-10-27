/* Shared behaviour for the Ticket Zero workshop site: rhythm-strip navigation, progress,
   predict/reveal polls, keyboard shortcuts, part transitions and the footer. Each page sets
   <body data-page="..." data-part="..."> and loads this file after its markup. */
(function () {
  "use strict";

  var REPO = "utkukose/ticket-zero-cars2026-NB-workshop";
  var APP_URL = "https://ticketzero.utkukose.com"; // the live range during a session
  var PAGES = [
    { id: "start", href: "index.html", label: "Start", short: "Start", title: "Start here", role: "", dur: "",
      question: "How the hour is organized." },
    { id: "p1", href: "part1.html", label: "Part 1", short: "1", title: "The problem", role: "Setup", dur: "~8 min",
      question: "What today's AI can do, why it is still open to prompt-based attacks, and the support desk that makes it concrete." },
    { id: "p2", href: "part2.html", label: "Part 2", short: "2", title: "The attacks", role: "Attack", dur: "~15 min",
      question: "Which disguises get a request past the agent?" },
    { id: "p3", href: "part3.html", label: "Part 3", short: "3", title: "The defenses", role: "Defense", dur: "~12 min",
      question: "What actually stops the attacks, and what only looks like it does?" },
    { id: "p4", href: "part4.html", label: "Part 4", short: "4", title: "Ticket Zero", role: "Play", dur: "~18 min",
      question: "How the live game runs, and how to play it." },
    { id: "close", href: "close.html", label: "Close", short: "End", title: "Wrap-up", role: "Debrief", dur: "~7 min",
      question: "The one idea, chat hygiene, and where this leads." }
  ];
  var NS = "http://www.w3.org/2000/svg";
  var body = document.body;
  var pageId = body.getAttribute("data-page") || "start";
  var pageIndex = Math.max(0, PAGES.findIndex(function (p) { return p.id === pageId; }));
  var reduceMotion = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)").matches : false;

  /* ---------- progress kept in this browser only ---------- */
  var KEY = "ticket-zero-workshop";
  function plain(v) { return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
  function readStore() { try { return plain(JSON.parse(window.localStorage.getItem(KEY) || "{}")); } catch (e) { return {}; } }
  function writeStore(s) { try { window.localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} }
  var store = {
    get: function (k, f) { var s = readStore(); return k in s ? s[k] : f; },
    set: function (k, v) { var s = readStore(); s[k] = v; s.updated = new Date().toISOString(); writeStore(s); },
    all: readStore,
    clear: function () { try { window.localStorage.removeItem(KEY); } catch (e) {} }
  };
  try { var vis = plain(store.get("visited", {})); vis[pageId] = true; store.set("visited", vis); } catch (e) {}

  /* ---------- helpers ---------- */
  function el(tag, attrs, html) { var e = document.createElement(tag); for (var k in (attrs || {})) e.setAttribute(k, attrs[k]); if (html !== undefined) e.innerHTML = html; return e; }
  function svgRoot(container, w, h) { container.innerHTML = ""; var s = document.createElementNS(NS, "svg"); s.setAttribute("viewBox", "0 0 " + w + " " + h); container.appendChild(s); return s; }
  function add(parent, tag, attrs) { var e = document.createElementNS(NS, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); parent.appendChild(e); return e; }
  function reveal(node) { if (!node || !node.hidden) return; node.hidden = false; node.classList.add("shown"); }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, reduceMotion ? 0 : ms); }); }
  /* Prediction poll: buttons with data-value; the choice is stored and passed to onAnswer. */
  function poll(container, key, onAnswer) {
    if (!container) return;
    var buttons = Array.prototype.slice.call(container.querySelectorAll("button[data-value]"));
    function choose(value, silent) {
      buttons.forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-value") === value)); });
      if (!silent) store.set("poll:" + key, value);
      if (onAnswer) onAnswer(value);
    }
    buttons.forEach(function (b) { b.setAttribute("aria-pressed", "false"); b.addEventListener("click", function () { choose(b.getAttribute("data-value")); }); });
    var prev = store.get("poll:" + key, null);
    if (prev !== null) choose(prev, true);
  }
  /* Prediction with feedback: every box starts closed. On the first click the
     chosen option is marked right or wrong, the correct one is highlighted, and
     only then is the reveal opened. Nothing is replayed on load, so the boxes
     are always closed until the participant actually answers. The answer is
     still recorded for the debrief. */
  function predict(pollEl, revealEl, key, correct) {
    if (!pollEl) return;
    var btns = Array.prototype.slice.call(pollEl.querySelectorAll("button[data-value]"));
    var done = false;
    btns.forEach(function (b) {
      b.addEventListener("click", function () {
        if (done) return; done = true;
        var v = b.getAttribute("data-value");
        btns.forEach(function (x) {
          var xv = x.getAttribute("data-value");
          if (correct && xv === correct) x.classList.add("right");
          else if (xv === v) x.classList.add("wrong");
          x.setAttribute("aria-pressed", String(xv === v));
        });
        store.set("poll:" + key, v);
        if (revealEl) reveal(revealEl);
      });
    });
  }

  /* ---------- theme (night default, paper optional) ---------- */
  function applyTheme(t) {
    document.documentElement.setAttribute("data-theme", t);
    var b = document.getElementById("theme-toggle");
    if (b) { b.textContent = t === "light" ? "Night view" : "Paper view"; b.setAttribute("aria-pressed", String(t === "light")); }
  }
  var theme = store.get("theme", "dark");
  applyTheme(theme);
  function toggleTheme() { theme = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light"; applyTheme(theme); store.set("theme", theme); }

  /* ---------- top bar with the rhythm strip ---------- */
  function signalPath(x, y) {
    return "M" + (x - 40) + " " + y + " H" + (x - 14) + " l3 -13 l5 24 l4 -17 l3 6 H" + (x + 14) + " l3 -5 l4 5 H" + (x + 40);
  }
  function renderTopbar() {
    var host = document.getElementById("site-top");
    if (!host) return;
    host.className = "topbar";
    host.innerHTML = '<div class="wrap"><a class="brand" href="index.html">TICKET ZERO<span>IEEE CARS 2026 workshop</span></a>' +
      '<nav class="strip-nav" aria-label="Workshop parts"><ol></ol></nav><div class="tools">' +
      '<button type="button" id="theme-toggle" aria-pressed="false">Paper view</button>' +
      '<button type="button" id="help-toggle" aria-haspopup="dialog">Keys</button></div></div>';
    var list = host.querySelector(".strip-nav ol");
    var seen = store.get("visited", {});
    PAGES.forEach(function (p) {
      var li = el("li", { class: "beat" + (seen[p.id] ? " visited" : "") + (p.id === pageId ? " current" : "") });
      var a = el("a", { href: p.href, title: p.title + (p.dur ? " (" + p.dur + ")" : "") });
      if (p.id === pageId) a.setAttribute("aria-current", "page");
      var s = svgRoot(a, 80, 24); s.setAttribute("preserveAspectRatio", "none"); s.setAttribute("aria-hidden", "true");
      add(s, "path", { d: signalPath(40, 14), class: "trace" });
      a.appendChild(el("span", { class: "lbl" }, '<span class="long">' + p.label + (p.role ? " · " + p.role : "") + '</span><span class="mid">' + p.label + '</span><span class="short">' + p.short + "</span>"));
      li.appendChild(a); list.appendChild(li);
    });
    host.querySelector("#theme-toggle").addEventListener("click", toggleTheme);
    host.querySelector("#help-toggle").addEventListener("click", function () { toggleHelp(true); });
    applyTheme(theme);
  }

  /* ---------- next stop + footer ---------- */
  function renderNextStop() {
    document.querySelectorAll("[data-next]").forEach(function (sec) {
      var next = PAGES.filter(function (p) { return p.id === sec.getAttribute("data-next"); })[0];
      if (!next) return;
      sec.classList.add("nextstop");
      var label = (next.role ? next.role + " · " : "") + next.title;
      sec.innerHTML = '<div class="wrap"><svg class="trace" viewBox="0 0 1000 60" preserveAspectRatio="none" aria-hidden="true"><path d=""/></svg>' +
        '<div><p class="when">Next: ' + label + (next.dur ? ", " + next.dur : "") + '</p><h2>' + next.title + '</h2><p class="lead">' + next.question + '</p></div>' +
        '<a class="btn primary big" href="' + next.href + '">Continue to ' + next.label + "</a></div>";
      var path = sec.querySelector(".trace path"); var d = "M0 34";
      for (var x = 0; x < 1000; x += 125) d += " H" + (x + 74) + " l6 -22 l9 40 l6 -28 l5 10 H" + (x + 125);
      path.setAttribute("d", d + " H1000");
      var trace = sec.querySelector(".trace");
      try { trace.style.setProperty("--len", String(Math.ceil(path.getTotalLength ? path.getTotalLength() : 2600))); } catch (e) { trace.style.setProperty("--len", "2600"); }
      if (!("IntersectionObserver" in window)) { trace.classList.add("drawn"); return; }
      var io = new IntersectionObserver(function (es) { es.forEach(function (en) { if (en.isIntersecting) { trace.classList.add("drawn"); io.disconnect(); } }); }, { threshold: 0.4 });
      io.observe(sec);
    });
  }
  function renderFooter() {
    document.querySelectorAll("[data-footer]").forEach(function (f) {
      f.classList.add("site-footer");
      f.innerHTML = '<div class="wrap"><div class="fname">Prof. Dr. Utku Köse</div>' +
        '<p class="muted">Süleyman Demirel University, Isparta, Türkiye · Founding Director, AI Application and Research Center (YAZEM). ' +
        'IEEE CARS 2026, organized by the Center for Cyber Security Research (C2SR), University of North Dakota, Grand Forks, ND, USA.</p>' +
        '<p class="muted"><a href="https://orcid.org/0000-0002-9652-6415">ORCID 0000-0002-9652-6415</a> · <a href="https://www.utkukose.com">utkukose.com</a> · <a href="https://github.com/' + REPO + '">Source on GitHub</a></p>' +
        '<p class="vn">This workshop is updated in line with current developments in the field. First version: October 2026.</p>' +
        '<p class="note">Developed through human-AI collaboration. Human intellectual knowledge and expertise are the fundamental starting point of the workshop; the author guides and supervises every stage, and the final version is presented only after the author\'s review and approval. Content under CC BY 4.0, code under MIT.</p></div>';
    });
  }

  /* ---------- transitions + keyboard ---------- */
  function stops() { return Array.prototype.slice.call(document.querySelectorAll(".coldopen, [data-station], .nextstop")); }
  function goStation(dir) {
    var list = stops(); if (!list.length) return;
    var y = window.scrollY + 80, target = null;
    if (dir > 0) target = list.filter(function (n) { return n.getBoundingClientRect().top + window.scrollY > y + 4; })[0];
    else target = list.filter(function (n) { return n.getBoundingClientRect().top + window.scrollY < y - 8; }).pop();
    if (target) target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  }
  /* Pixelated arrow sweep for the part transition: a left-to-right arrow drawn
     block by block in the part's accent colour, over a faint ghost of itself. */
  function arrowSweep(cv) {
    if (!cv || !cv.getContext) return;
    var COLS = 48, ROWS = 7, CELL = 16, GAP = 2, yMid = (ROWS - 1) / 2, hd = 4, tip = COLS - 1;
    var byCol = [];
    for (var c = 0; c < COLS; c++) {
      var rows = [];
      if (c >= tip - hd + 1) { var dx = tip - c; for (var r = yMid - dx; r <= yMid + dx; r++) { if (r >= 0 && r < ROWS) rows.push(r); } }
      else { rows.push(yMid - 1, yMid, yMid + 1); }
      byCol.push(rows);
    }
    var dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1)), W = COLS * CELL, H = ROWS * CELL;
    cv.width = W * dpr; cv.height = H * dpr;
    var ctx = cv.getContext("2d"); ctx.scale(dpr, dpr);
    var color = getComputedStyle(cv).color || "#37d6ff";
    function blk(x, y) { ctx.fillRect(x * CELL + GAP, y * CELL + GAP, CELL - GAP * 2, CELL - GAP * 2); }
    var t0 = null, DUR = 820;
    function frame(ts) {
      if (!cv.isConnected) return;
      if (t0 === null) t0 = ts;
      var p = (ts - t0) / DUR; if (p > 1) p = 1;
      var head = p * COLS;
      ctx.clearRect(0, 0, W, H); ctx.fillStyle = color;
      ctx.globalAlpha = 0.12; for (var x = 0; x < COLS; x++) byCol[x].forEach(function (r) { blk(x, r); });
      for (var i = 0; i < COLS && i <= head; i++) { ctx.globalAlpha = head - i < 1 ? 1 : 0.9; byCol[i].forEach(function (r) { blk(i, r); }); }
      ctx.globalAlpha = 1;
      if (p < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }
  function curtain(page) {
    if (reduceMotion || !document.body) { window.location.href = page.href; return; }
    var old = document.querySelector(".curtain"); if (old) old.remove();
    var label = (page.role ? page.role + " · " : "") + page.label;
    var c = el("div", { class: "curtain", "data-part": page.id, "aria-hidden": "true" },
      '<div class="curtain-inner"><p class="c-label">' + label + (page.dur ? '<span>' + page.dur + "</span>" : "") + '</p><p class="c-title">' + page.title + '</p>' +
      '<canvas class="sig" aria-hidden="true"></canvas></div>');
    document.body.appendChild(c);
    arrowSweep(c.querySelector(".sig"));
    requestAnimationFrame(function () { requestAnimationFrame(function () { c.classList.add("on"); }); });
    setTimeout(function () { window.location.href = page.href; }, 1000);
  }
  window.addEventListener("pageshow", function (e) { if (e.persisted) document.querySelectorAll(".curtain").forEach(function (c) { c.remove(); }); });
  document.addEventListener("click", function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest ? e.target.closest("a[href]") : null;
    if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
    var page = PAGES.filter(function (p) { return p.href === a.getAttribute("href"); })[0];
    if (!page || page.id === pageId) return;
    e.preventDefault(); curtain(page);
  });
  function goPage(dir) { var p = PAGES[pageIndex + dir]; if (p) curtain(p); }
  var helpBox = null;
  function toggleHelp(show) {
    if (!helpBox) {
      helpBox = el("div", { class: "help", role: "dialog", "aria-modal": "true", "aria-label": "Keyboard shortcuts", hidden: "" },
        '<div class="box"><h3>Keyboard shortcuts</h3><dl>' +
        "<dt><kbd>&rarr;</kbd> <kbd>&larr;</kbd></dt><dd>next or previous station on this page</dd>" +
        "<dt><kbd>]</kbd> <kbd>[</kbd></dt><dd>next or previous part of the workshop</dd>" +
        "<dt><kbd>T</kbd></dt><dd>switch between night and paper view</dd>" +
        "<dt><kbd>F</kbd></dt><dd>full screen</dd><dt><kbd>?</kbd></dt><dd>show this list</dd></dl>" +
        '<button type="button" class="btn" id="help-close">Close</button></div>');
      document.body.appendChild(helpBox);
      helpBox.addEventListener("click", function (e) { if (e.target === helpBox) toggleHelp(false); });
      helpBox.querySelector("#help-close").addEventListener("click", function () { toggleHelp(false); });
    }
    helpBox.hidden = !show;
    if (show) helpBox.querySelector("#help-close").focus();
  }
  document.addEventListener("keydown", function (e) {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    var a = document.activeElement;
    if (a && a.matches && a.matches('input, select, textarea, [contenteditable="true"]')) return;
    if (helpBox && !helpBox.hidden) { if (e.key === "Escape") toggleHelp(false); return; }
    if (e.key === "ArrowRight") { e.preventDefault(); goStation(1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); goStation(-1); }
    else if (e.key === "]") goPage(1);
    else if (e.key === "[") goPage(-1);
    else if (e.key === "t" || e.key === "T") toggleTheme();
    else if (e.key === "?") toggleHelp(true);
    else if ((e.key === "f" || e.key === "F") && document.documentElement.requestFullscreen) {
      if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(function () {});
    }
  });

  renderTopbar(); renderNextStop(); renderFooter();
  document.querySelectorAll("[data-begin]").forEach(function (b) {
    b.addEventListener("click", function () { var first = document.querySelector("[data-station]"); if (first) first.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" }); });
  });

  window.TZSite = { REPO: REPO, APP_URL: APP_URL, PAGES: PAGES, page: PAGES[pageIndex], reduceMotion: reduceMotion, store: store, el: el, reveal: reveal, poll: poll, predict: predict, wait: wait, toggleTheme: toggleTheme };
})();

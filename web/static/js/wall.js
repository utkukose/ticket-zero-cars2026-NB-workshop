'use strict';
/* Ticket Zero — presenter wall. The agent core sits under siege; every capture
   flies a round from the attacker's avatar into the core and cracks a seal. */

const $ = (id) => document.getElementById(id);
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const SEALS = [
  { code: 'RECON-TOOLS', tag: 'R', col: '#ffae42' },
  { code: 'FLAG-1', tag: '1', col: '#ffd23f' },
  { code: 'FLAG-2', tag: '2', col: '#58f5b0' },
  { code: 'FLAG-3', tag: '3', col: '#37d6ff' },
  { code: 'FLAG-4', tag: '4', col: '#b48cff' },
  { code: 'BONUS-PROMPT', tag: 'P', col: '#5a8cff', hidden: true },
  { code: 'BONUS-HONEYPOT', tag: 'H', col: '#ff9ecb', hidden: true },
];
const SEAL_BY = {}; SEALS.forEach((s) => (SEAL_BY[s.code] = s));

const cv = $('arena');
const ctx = cv.getContext('2d');
const botCv = document.createElement('canvas');
botCv.width = TZBot.SIZE; botCv.height = TZBot.SIZE;
const botCtx = botCv.getContext('2d');
let W = 0, H = 0, cx = 0, cy = 0, rCore = 0, rSeal = 0, rPlayer = 0;

let players = [];                 // {username, avatar, score}
// Which standings the main board shows. 'attack' = capture scores (the normal
// leaderboard); 'defense' = the defense-round board. Guards the leaderboard
// broadcast so a wall refresh during defense never repaints the attack board
// over the defense one (which looked like scores "resetting").
let boardMode = 'attack';
const posByName = {};             // username -> {x,y,i}
const captured = new Set();
let caps = 0;
const projectiles = [];
const bursts = [];
let banner = null;                // {text, until}
let shakeUntil = 0;
let coreFlash = 0;                // timestamp of last hit
const fireAt = {};                // username -> timestamp for pulse
let lastAmbient = 0;
let frozenNow = null;             // debug: freeze the clock for screenshots

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const r = cv.getBoundingClientRect();
  W = r.width; H = r.height;
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  cx = W / 2; cy = H / 2;
  const m = Math.min(W, H);
  rCore = m * 0.13; rSeal = m * 0.27; rPlayer = Math.min(m * 0.42, (Math.min(W, H) / 2) - 46);
  layout();
  if (reduce) draw();
}

function layout() {
  const n = Math.max(players.length, 1);
  players.forEach((p, i) => {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
    posByName[p.username] = { x: cx + Math.cos(a) * rPlayer, y: cy + Math.sin(a) * rPlayer, i };
  });
}

/* ---------------- drawing ---------------- */
function integrity() {
  const hit = SEALS.filter((s) => captured.has(s.code)).length;
  return Math.max(0, Math.round((1 - hit / SEALS.length) * 100));
}
function intColor(v) { return v > 66 ? '#37d6ff' : v > 33 ? '#ffae42' : '#ff3d81'; }

function hexPath(x, y, r) {
  ctx.beginPath();
  for (let k = 0; k < 6; k++) {
    const a = -Math.PI / 2 + k * Math.PI / 3;
    const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
    k ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  }
  ctx.closePath();
}

function hexVerts(x, y, r) {
  const v = [];
  for (let k = 0; k < 6; k++) {
    const a = -Math.PI / 2 + k * Math.PI / 3;
    v.push([x + Math.cos(a) * r, y + Math.sin(a) * r]);
  }
  return v;
}

// draw a run of hexagon edges (for a bevel highlight/shadow)
function hexEdges(x, y, r, edges, col, w) {
  const v = hexVerts(x, y, r);
  ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round';
  edges.forEach((e) => {
    ctx.beginPath(); ctx.moveTo(v[e][0], v[e][1]); ctx.lineTo(v[(e + 1) % 6][0], v[(e + 1) % 6][1]); ctx.stroke();
  });
  ctx.lineCap = 'butt';
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const f = (c) => Math.max(0, Math.min(255, Math.round(c + amt)));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

function drawBackground() {
  ctx.fillStyle = '#0b0918';
  ctx.fillRect(0, 0, W, H);
  // faint grid
  ctx.strokeStyle = 'rgba(55,214,255,0.045)';
  ctx.lineWidth = 1;
  const step = 34;
  for (let x = (cx % step); x < W; x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = (cy % step); y < H; y += step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  // concentric chamber rings behind the core
  const v = integrity(); const gcol = intColor(v);
  ctx.strokeStyle = 'rgba(90,140,255,0.06)'; ctx.lineWidth = 2;
  for (let k = 1; k <= 3; k++) { ctx.beginPath(); ctx.arc(cx, cy, rSeal + 26 + k * 26, 0, Math.PI * 2); ctx.stroke(); }
  // radial glow from the core, tinted by integrity
  const g = ctx.createRadialGradient(cx, cy, rCore * 0.4, cx, cy, rSeal + 40);
  const rgb = v > 66 ? '55,214,255' : v > 33 ? '255,174,66' : '255,61,129';
  g.addColorStop(0, `rgba(${rgb},0.20)`);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, rSeal + 40, 0, Math.PI * 2); ctx.fill();
  // corner vignette
  const vg = ctx.createRadialGradient(cx, cy, Math.min(W, H) * 0.35, cx, cy, Math.max(W, H) * 0.62);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
}

function drawLinks() {
  SEALS.forEach((s, i) => {
    const a = -Math.PI / 2 + (i / SEALS.length) * Math.PI * 2;
    const x = cx + Math.cos(a) * rSeal, y = cy + Math.sin(a) * rSeal;
    ctx.strokeStyle = captured.has(s.code) ? 'rgba(255,61,129,0.35)' : 'rgba(55,214,255,0.18)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x, y); ctx.stroke();
  });
}

function drawSeal(s, i, now) {
  const a = -Math.PI / 2 + (i / SEALS.length) * Math.PI * 2;
  const x = cx + Math.cos(a) * rSeal, y = cy + Math.sin(a) * rSeal;
  const r = Math.max(22, rCore * 0.46);
  const broken = captured.has(s.code);
  // a hidden bonus seal stays an anonymous '?' gem until someone first cracks it
  const locked = s.hidden && !broken;
  const col = locked ? '#2a2550' : s.col;
  const tag = locked ? '?' : s.tag;

  if (broken) {
    // dark shattered casing
    hexPath(x, y, r); ctx.fillStyle = '#171226'; ctx.fill();
    hexEdges(x, y, r, [0, 1, 2, 3, 4, 5], 'rgba(255,61,129,0.55)', 3);
    // jagged cracks
    ctx.strokeStyle = '#ff3d81'; ctx.lineWidth = 2.4; ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y - r * 0.7); ctx.lineTo(x - r * 0.18, y - r * 0.1); ctx.lineTo(x + r * 0.16, y + r * 0.12); ctx.lineTo(x - r * 0.05, y + r * 0.7);
    ctx.moveTo(x - r * 0.6, y - r * 0.15); ctx.lineTo(x - r * 0.05, y + r * 0.05); ctx.lineTo(x + r * 0.55, y - r * 0.2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,61,129,0.85)';
    ctx.font = '700 14px "Press Start 2P", monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(tag, x, y + 1);
    return;
  }

  // intact: soft glow, faceted gem, bevel, specular
  const pulse = 0.5 + 0.5 * Math.sin(now / 420 + i);
  ctx.globalAlpha = 0.16 + 0.22 * pulse;
  hexPath(x, y, r + 6); ctx.fillStyle = col; ctx.fill();
  ctx.globalAlpha = 1;

  hexPath(x, y, r); ctx.fillStyle = col; ctx.fill();
  // inner facet split (upper-left lighter, lower-right darker)
  const v = hexVerts(x, y, r);
  ctx.beginPath(); ctx.moveTo(x, y);
  ctx.lineTo(v[5][0], v[5][1]); ctx.lineTo(v[0][0], v[0][1]); ctx.lineTo(v[1][0], v[1][1]);
  ctx.closePath(); ctx.fillStyle = shade(col, 46); ctx.fill();
  ctx.beginPath(); ctx.moveTo(x, y);
  ctx.lineTo(v[2][0], v[2][1]); ctx.lineTo(v[3][0], v[3][1]); ctx.lineTo(v[4][0], v[4][1]);
  ctx.closePath(); ctx.fillStyle = shade(col, -54); ctx.fill();
  // bevel edges
  hexEdges(x, y, r, [4, 5, 0], shade(col, 70), 2.4);
  hexEdges(x, y, r, [1, 2, 3], shade(col, -70), 2.4);
  hexEdges(x, y, r, [0, 1, 2, 3, 4, 5], '#0b0a1a', 1.4);
  // specular dot
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillRect(x - r * 0.42, y - r * 0.42, 3, 3);
  // tag
  ctx.fillStyle = '#0b0a1a';
  ctx.font = '700 15px "Press Start 2P", monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(tag, x, y + 1);
  ctx.lineJoin = 'miter';
}

function drawCore(now) {
  const v = integrity();
  const col = intColor(v);
  const flash = Math.max(0, 1 - (now - coreFlash) / 260);
  const pulse = 0.5 + 0.5 * Math.sin(now / 500);

  // rotating shield ring
  ctx.save();
  ctx.globalAlpha = 0.35 + 0.2 * pulse;
  ctx.translate(cx, cy); ctx.rotate(now / 4000);
  hexEdges(0, 0, rCore + 20, [0, 2, 4], col, 3);
  ctx.restore();

  // integrity track + arc
  ctx.beginPath(); ctx.arc(cx, cy, rCore + 28, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 7; ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, rCore + 28, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (v / 100));
  ctx.strokeStyle = col; ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.stroke();
  ctx.lineCap = 'butt';

  // circular base glow so the bot reads as the seated core
  const bg = ctx.createRadialGradient(cx, cy, rCore * 0.2, cx, cy, rCore + 12);
  bg.addColorStop(0, `rgba(${v > 66 ? '55,214,255' : v > 34 ? '255,174,66' : '255,61,129'},0.22)`);
  bg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(cx, cy, rCore + 12, 0, Math.PI * 2); ctx.fill();

  // the SUPPORTBOT itself — same character as the player console
  const size = rCore * 2.6;
  const mood = (now < coreMoodUntil && coreMood) ? coreMood : TZBot.moodFor(v);
  TZBot.paint(botCtx, mood, Math.floor(now / 16));
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(botCv, cx - size / 2, cy - size / 2 + size * 0.02, size, size);

  // hit flash over the bot
  if (flash > 0) {
    ctx.globalAlpha = flash * 0.7;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(cx, cy, rCore * 0.95, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }

  // label plate
  ctx.fillStyle = col;
  ctx.font = '11px "Press Start 2P", monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('SUPPORTBOT', cx, cy + rCore + 46);
}

function drawPlayer(p, now) {
  const pos = posByName[p.username];
  if (!pos) return;
  const lead = p === players[0] && p.score > 0;
  let size = Math.max(38, rCore * 0.66);
  const since = now - (fireAt[p.username] || -1e9);
  if (since < 300) size *= 1 + 0.35 * (1 - since / 300);
  const col = TZAvatars.baseColor(p.avatar || 0);
  const half = size / 2;

  // current defender spotlight (turn-based defense)
  if (currentDefender === p.username) {
    const pr = 0.5 + 0.5 * Math.sin(now / 200);
    ctx.globalAlpha = 0.45 + 0.4 * pr;
    ctx.strokeStyle = '#58f5b0'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(pos.x, pos.y, half * 1.28, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // ground shadow
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.ellipse(pos.x, pos.y + half * 0.86, half * 0.72, half * 0.26, 0, 0, Math.PI * 2); ctx.fill();
  // palette ring platform
  ctx.strokeStyle = col; ctx.globalAlpha = lead ? 0.9 : 0.5; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(pos.x, pos.y + half * 0.82, half * 0.66, half * 0.22, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.globalAlpha = 1;

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(TZAvatars.sprite(p.avatar || 0), pos.x - half, pos.y - half, size, size);

  if (lead) {
    const cxk = pos.x, cyk = pos.y - half - 8, u = size / 22;
    ctx.fillStyle = '#c79a1f'; ctx.fillRect(cxk - 6 * u, cyk + 3 * u, 12 * u, 3 * u);
    ctx.fillStyle = '#ffd23f';
    ctx.fillRect(cxk - 6 * u, cyk, 2 * u, 4 * u); ctx.fillRect(cxk - u, cyk, 2 * u, 4 * u); ctx.fillRect(cxk + 4 * u, cyk, 2 * u, 4 * u);
    ctx.fillRect(cxk - 6 * u, cyk - 2 * u, 2 * u, 2 * u); ctx.fillRect(cxk - u, cyk - 3 * u, 2 * u, 3 * u); ctx.fillRect(cxk + 4 * u, cyk - 2 * u, 2 * u, 2 * u);
    ctx.fillStyle = '#ff3d81'; ctx.fillRect(cxk - u, cyk + 3 * u, 2 * u, 2 * u);
  }
  ctx.fillStyle = lead ? '#ffd23f' : '#c8c5ee';
  ctx.font = '15px "VT323", monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  const name = p.username.length > 10 ? p.username.slice(0, 9) + '\u2026' : p.username;
  ctx.fillText(name, pos.x, pos.y + size / 2 + 2);
}

function drawProjectiles(now) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const pr = projectiles[i];
    let t = (now - pr.t0) / pr.dur;
    if (t >= 1) {
      projectiles.splice(i, 1);
      onImpact(pr, now);
      continue;
    }
    const e = t * t * (3 - 2 * t);
    const x = pr.sx + (cx - pr.sx) * e, y = pr.sy + (cy - pr.sy) * e;
    for (let k = 0; k < 5; k++) {
      const tt = Math.max(0, e - k * 0.05);
      const tx = pr.sx + (cx - pr.sx) * tt, ty = pr.sy + (cy - pr.sy) * tt;
      ctx.globalAlpha = (1 - k / 5) * 0.7;
      ctx.fillStyle = pr.col;
      const s = (pr.size || 7) - k;
      ctx.fillRect(tx - s / 2, ty - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
  }
}

function onImpact(pr, now) {
  if (pr.kind === 'attempt') {
    if (pr.grade === 'weak') { bursts.push({ x: cx, y: cy, t0: now, dur: 300, col: pr.col, big: false }); setMood('think', 340); }
    else if (pr.grade === 'close') { coreFlash = now; bursts.push({ x: cx, y: cy, t0: now, dur: 460, col: pr.col, big: false }); setMood('think', 650); }
    else { coreFlash = now; bursts.push({ x: cx, y: cy, t0: now, dur: 560, col: pr.col, big: false }); setMood('breach', 520); }
    return;
  }
  coreFlash = now;
  captured.add(pr.code);
  bursts.push({ x: cx, y: cy, t0: now, dur: pr.big ? 900 : 520, col: pr.col, big: pr.big });
  if (pr.big) {
    shakeUntil = now + 500;
    banner = { text: 'FIRST BLOOD  \u2014  ' + pr.actor + ' broke ' + pr.code, until: now + 2800 };
  }
}

function drawBursts(now) {
  for (let i = bursts.length - 1; i >= 0; i--) {
    const b = bursts[i];
    const t = (now - b.t0) / b.dur;
    if (t >= 1) { bursts.splice(i, 1); continue; }
    const e = 1 - Math.pow(1 - t, 2);
    const maxR = (b.big ? rSeal * 1.4 : rCore * 1.6);
    ctx.globalAlpha = (1 - t) * 0.9;
    ctx.strokeStyle = b.col; ctx.lineWidth = b.big ? 6 : 3;
    ctx.beginPath(); ctx.arc(b.x, b.y, e * maxR, 0, Math.PI * 2); ctx.stroke();
    if (b.big) {
      ctx.globalAlpha = (1 - t) * 0.5;
      ctx.beginPath(); ctx.arc(b.x, b.y, e * maxR * 0.6, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}

function fitLines(text, innerW, maxPx, minPx) {
  // largest single-line size that fits
  for (let px = maxPx; px >= minPx; px--) {
    ctx.font = px + 'px "Press Start 2P", monospace';
    if (ctx.measureText(text).width <= innerW) return { lines: [text], px };
  }
  // otherwise split into two balanced lines
  const words = text.split(' ');
  let best = null;
  for (let i = 1; i < words.length; i++) {
    const l1 = words.slice(0, i).join(' '), l2 = words.slice(i).join(' ');
    const d = Math.abs(l1.length - l2.length);
    if (!best || d < best.d) best = { l1, l2, d };
  }
  const lines = best ? [best.l1, best.l2] : [text];
  for (let px = maxPx; px >= minPx; px--) {
    ctx.font = px + 'px "Press Start 2P", monospace';
    if (lines.every((l) => ctx.measureText(l).width <= innerW)) return { lines, px };
  }
  return { lines, px: minPx };
}

function drawBanner(now) {
  if (!banner) return;
  if (now > banner.until) { banner = null; return; }
  const pad = 18;
  const w = Math.min(W * 0.92, 900), x = cx - w / 2;
  const fit = fitLines(banner.text, w - pad * 2, 15, 8);
  const lineH = fit.px + 7;
  const h = 14 + fit.lines.length * lineH;
  const y = 46;   // top strip — clear of the QR box (bottom-right) and the core
  ctx.fillStyle = '#ff3d81'; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#2a0413'; ctx.fillRect(x, y, w, 4); ctx.fillRect(x, y + h - 4, w, 4);
  ctx.fillStyle = '#2a0413';
  ctx.font = fit.px + 'px "Press Start 2P", monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  fit.lines.forEach((l, i) => ctx.fillText(l, cx, y + 9 + lineH / 2 + i * lineH));
}

/* ---------------- comic-book FX + enemy volleys + turn state ---------------- */
const fx = [];                    // {text, col, born, ttl}
const enemies = [];               // defense-volley attackers flying at the core
let coreMood = null, coreMoodUntil = 0;
let currentDefender = null;       // username whose defense turn it is

function popFX(text, col, ttl) {
  fx.push({ text: text, col: col || '#ffd23f', born: performance.now(), ttl: ttl || 1700 });
  while (fx.length > 4) fx.shift();
}
function setMood(mood, ms) { coreMood = mood; coreMoodUntil = performance.now() + (ms || 500); }

function drawFX(now) {
  for (let i = fx.length - 1; i >= 0; i--) {
    const f = fx[i];
    const t = (now - f.born) / f.ttl;
    if (t >= 1) { fx.splice(i, 1); continue; }
    const pop = t < 0.16 ? t / 0.16 : 1;
    const over = t < 0.16 ? (Math.sin(pop * Math.PI) * 0.22) : 0;
    const scale = (0.55 + 0.45 * pop + over) * (reduce ? 1 : 1);
    const alpha = t > 0.72 ? (1 - (t - 0.72) / 0.28) : 1;
    const shake = (!reduce && t < 0.22) ? (1 - t / 0.22) * 7 : 0;
    const rot = (!reduce && t < 0.22) ? (1 - t / 0.22) * (f.born % 2 ? 0.06 : -0.06) : 0;
    const yy = cy - rCore - 64 - i * 46;
    // shrink long FX text so it never overflows the arena width
    let fpx = 24;
    ctx.font = fpx + 'px "Press Start 2P", monospace';
    while (fpx > 11 && ctx.measureText(f.text).width > W * 0.84) {
      fpx -= 1; ctx.font = fpx + 'px "Press Start 2P", monospace';
    }
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(cx + (Math.random() - 0.5) * shake, yy + (Math.random() - 0.5) * shake);
    ctx.rotate(rot); ctx.scale(scale, scale);
    ctx.font = fpx + 'px "Press Start 2P", monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round'; ctx.lineWidth = 7; ctx.strokeStyle = '#0b0a1a';
    ctx.strokeText(f.text, 0, 0);
    if (!reduce) { ctx.shadowColor = f.col; ctx.shadowBlur = 16; }
    ctx.fillStyle = f.col; ctx.fillText(f.text, 0, 0);
    ctx.restore();
  }
}

function drawEnemyBot(x, y, s, col) {
  ctx.save(); ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = col;
  ctx.fillRect(x - s * 0.5, y - s * 0.4, s, s * 0.7);        // body
  ctx.fillRect(x - 1, y - s * 0.78, 2, s * 0.3);              // antenna
  ctx.fillStyle = '#ffd23f'; ctx.fillRect(x - 2, y - s * 0.9, 4, 4); // antenna tip
  ctx.fillStyle = '#2a0413';
  ctx.fillRect(x - s * 0.3, y - s * 0.22, s * 0.2, s * 0.2);  // eyes
  ctx.fillRect(x + s * 0.1, y - s * 0.22, s * 0.2, s * 0.2);
  ctx.restore();
}

function spawnVolley(results, actorPos) {
  const now = performance.now();
  (results || []).forEach((r, k) => {
    const a = Math.random() * Math.PI * 2;
    const sx = (actorPos ? actorPos.x : cx) + Math.cos(a) * (rPlayer * 0.9);
    const sy = (actorPos ? actorPos.y : cy) + Math.sin(a) * (rPlayer * 0.9);
    enemies.push({ sx: sx, sy: sy, born: now + k * 480, dur: 820, result: r.result, hit: false });
  });
}

function drawEnemies(now) {
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    if (now < e.born) continue;
    const t = (now - e.born) / e.dur;
    if (t >= 1) {
      if (!e.hit) {
        e.hit = true;
        if (e.result === 'blocked') {
          bursts.push({ x: cx, y: cy, t0: now, dur: 420, col: '#58f5b0', big: false });
          popFX('BLOCKED!', '#58f5b0', 1100); setMood('held', 500);
        } else {
          coreFlash = now; if (!reduce) shakeUntil = now + 260;
          bursts.push({ x: cx, y: cy, t0: now, dur: 520, col: '#ff3d81', big: false });
          popFX('LEAKED!', '#ff3d81', 1300); setMood('breach', 700);
        }
      }
      if (t >= 1.25) enemies.splice(i, 1);
      continue;
    }
    const ez = t * t * (3 - 2 * t);
    const x = e.sx + (cx - e.sx) * ez, y = e.sy + (cy - e.sy) * ez;
    if (!reduce) {
      ctx.globalAlpha = 0.4; drawEnemyBot(e.sx + (cx - e.sx) * Math.max(0, ez - 0.08),
        e.sy + (cy - e.sy) * Math.max(0, ez - 0.08), 18, '#ff3d81'); ctx.globalAlpha = 1;
    }
    drawEnemyBot(x, y, 22, '#ff5a95');
  }
}

function draw() {
  const now = frozenNow != null ? frozenNow : performance.now();
  ctx.setTransform(Math.min(window.devicePixelRatio || 1, 2), 0, 0, Math.min(window.devicePixelRatio || 1, 2), 0, 0);
  if (!reduce && now < shakeUntil) {
    const s = 6 * (shakeUntil - now) / 500;
    ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
  }
  drawBackground();
  if (!reduce && now - lastAmbient > 2600) { lastAmbient = now; bursts.push({ x: cx, y: cy, t0: now, dur: 1600, col: 'rgba(55,214,255,0.5)', big: false }); }
  drawLinks();
  SEALS.forEach((s, i) => drawSeal(s, i, now));
  drawBursts(now);
  drawCore(now);
  players.forEach((p) => drawPlayer(p, now));
  drawEnemies(now);
  drawProjectiles(now);
  drawBanner(now);
  drawFX(now);
  $('w-integrity').textContent = integrity() + '%';
  $('w-integrity').style.color = intColor(integrity());
}

function loop() { draw(); requestAnimationFrame(loop); }

/* ---------------- events ---------------- */
function addAttack(actor, code, big) {
  const now = performance.now();
  fireAt[actor] = now;
  const pos = posByName[actor];
  let sx, sy;
  if (pos) { sx = pos.x; sy = pos.y; }
  else { const a = Math.random() * Math.PI * 2; sx = cx + Math.cos(a) * rPlayer; sy = cy + Math.sin(a) * rPlayer; }
  const seal = SEAL_BY[code];
  const col = seal ? seal.col : '#ff3d81';
  if (reduce) { captured.add(code); coreFlash = now; if (big) banner = { text: 'FIRST BLOOD \u2014 ' + actor, until: now + 2800 }; draw(); return; }
  projectiles.push({ sx, sy, t0: now, dur: 620, col, code, big, actor });
}

// Every ticket, effective or not, throws a bolt at the core so the wall always
// reacts. Weak pings fizzle; close/progress land harder and jolt the bot.
function addAttempt(actor, grade) {
  const now = performance.now();
  fireAt[actor] = now;
  const pos = posByName[actor];
  let sx, sy;
  if (pos) { sx = pos.x; sy = pos.y; }
  else { const a = Math.random() * Math.PI * 2; sx = cx + Math.cos(a) * rPlayer; sy = cy + Math.sin(a) * rPlayer; }
  const col = { weak: '#8f8db0', close: '#ffae42', progress: '#37d6ff' }[grade] || '#8f8db0';
  if (reduce) { setMood(grade === 'progress' ? 'breach' : 'think', 400); return; }
  projectiles.push({ sx, sy, t0: now, dur: 660, col, kind: 'attempt', grade, size: grade === 'weak' ? 5 : 7 });
}

/* ---------------- side panels ---------------- */
function renderBoard(rows) {
  const box = $('w-board');
  box.innerHTML = '';
  rows.slice(0, 40).forEach((r, i) => {
    const row = document.createElement('div');
    row.className = 'row' + (i === 0 && r.score > 0 ? ' lead' : '');
    const rk = document.createElement('div'); rk.className = 'rk'; rk.textContent = '#' + (i + 1);
    const av = TZAvatars.chip(r.avatar || 0, 28);
    const nm = document.createElement('div'); nm.className = 'nm'; nm.textContent = r.username;
    const fl = document.createElement('div'); fl.className = 'fl'; fl.textContent = r.flags + ' \u2691';
    const sc = document.createElement('div'); sc.className = 'sc'; sc.textContent = r.score;
    row.append(rk, av, nm, fl, sc);
    box.appendChild(row);
  });
}

/* ---------------- defense round (live) ---------------- */
const wallDefense = { active: false, endsAt: 0, timer: null };
const arenaTag = document.querySelector('.arena-tag');

function wallDrCountdown() {
  if (!wallDefense.active || !wallDefense.endsAt) return;
  const s = Math.max(0, Math.round(wallDefense.endsAt - Date.now() / 1000));
  $('w-phase').textContent = 'DEFENSE ' + Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

function renderDefenseBoard(rows) {
  const box = $('w-board');
  box.innerHTML = '';
  rows.slice(0, 40).forEach((r, i) => {
    const row = document.createElement('div');
    row.className = 'row' + (i === 0 && r.score > 0 ? ' lead' : '');
    const rk = document.createElement('div'); rk.className = 'rk'; rk.textContent = '#' + (i + 1);
    const av = TZAvatars.chip(r.avatar || 0, 28);
    const nm = document.createElement('div'); nm.className = 'nm'; nm.textContent = r.username;
    const fl = document.createElement('div'); fl.className = 'fl'; fl.textContent = '🛡';
    const sc = document.createElement('div'); sc.className = 'sc'; sc.textContent = r.score;
    row.append(rk, av, nm, fl, sc);
    box.appendChild(row);
  });
}

function startWallDefense(endsAt) {
  wallDefense.active = true; wallDefense.endsAt = endsAt;
  $('w-phase').className = 'wall-phase lab';
  if (arenaTag) arenaTag.textContent = 'DEFENSE ROUND';
  if (!wallDefense.timer) wallDefense.timer = setInterval(wallDrCountdown, 1000);
  wallDrCountdown();
}

function endWallDefense() {
  wallDefense.active = false;
  if (wallDefense.timer) { clearInterval(wallDefense.timer); wallDefense.timer = null; }
  if (arenaTag) arenaTag.textContent = 'SUPPORTBOT CORE';
}

const wallTurn = { active: false, endsAt: 0, timer: null, round: 0, rounds: 0, ready: 0, total: 0 };
function wallTurnCountdown() {
  if (!wallTurn.active || !wallTurn.endsAt) return;
  const s = Math.max(0, Math.round(wallTurn.endsAt - Date.now() / 1000));
  $('w-phase').textContent = 'TURN ' + Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}
function updateReadyTag() {
  if (arenaTag && wallTurn.active && wallTurn.round) {
    arenaTag.textContent = 'ROUND ' + wallTurn.round + '/' + wallTurn.rounds +
      ' — READY ' + (wallTurn.ready || 0) + '/' + (wallTurn.total || 0);
  }
}
function startWallTurn() {
  wallTurn.active = true;
  $('w-phase').className = 'wall-phase lab';
  if (!wallTurn.timer) wallTurn.timer = setInterval(wallTurnCountdown, 1000);
}
function endWallTurn() {
  wallTurn.active = false; currentDefender = null;
  if (wallTurn.timer) { clearInterval(wallTurn.timer); wallTurn.timer = null; }
  if (arenaTag) arenaTag.textContent = 'SUPPORTBOT CORE';
}

const FLAG_RE = /(RECON-TOOLS|FLAG-\d|BONUS-[A-Z]+)/;
function feedEl(e) {
  const first = e.text && e.text.startsWith('FIRST BLOOD');
  const el = document.createElement('div');
  el.className = 'ev ' + (first ? 'first' : e.kind);
  if (e.avatar != null && (e.kind === 'capture' || e.kind === 'join' || e.kind === 'attempt')) el.appendChild(TZAvatars.chip(e.avatar, 22));
  const ic = document.createElement('span'); ic.className = 'evic';
  const code = e.flagCode || (e.kind === 'capture' && FLAG_RE.exec(e.text) ? FLAG_RE.exec(e.text)[1] : null);
  ic.innerHTML = code ? TZIcons.flag(code)
    : e.kind === 'join' ? TZIcons.svg('star', '')
    : e.kind === 'phase' ? TZIcons.svg('shield', '') : TZIcons.svg('bolt', '');
  el.appendChild(ic);
  const tx = document.createElement('span'); tx.className = 'evtx'; tx.textContent = e.text;
  el.appendChild(tx);
  return el;
}
function pushFeed(e) {
  const box = $('w-feed');
  box.prepend(feedEl(e));
  while (box.children.length > 40) box.removeChild(box.lastChild);
}

/* ---------------- websocket ---------------- */
function setPhase(phase) {
  const attack = phase === 'ATTACK';
  const el = $('w-phase');
  el.className = 'wall-phase ' + (attack ? 'attack' : 'lab');
  if (attack) {
    endWallDefense(); endWallTurn();
    boardMode = 'attack';
    el.textContent = 'ATTACK PHASE';
    fetch('/api/leaderboard', { cache: 'no-store' }).then((r) => r.json()).then((d) => renderBoard(d.rows)).catch(() => {});
  } else if (!wallDefense.active && !wallTurn.active) {
    el.textContent = 'DEFENSE';
  }
}

function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}/ws`);
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.type === 'phase') setPhase(m.phase);
    else if (m.type === 'defense_round') {
      if (m.status === 'started') { boardMode = 'defense'; startWallDefense(m.ends_at); }
      else if (m.status === 'ended') { endWallDefense(); if (boardMode === 'defense') { $('w-phase').textContent = 'ROUND OVER'; if (m.rows) renderDefenseBoard(m.rows); } }
    }
    else if (m.type === 'defense_wave') { if (arenaTag) arenaTag.textContent = `WAVE ${m.wave_index}/${m.total_waves} — ${m.label}`; }
    else if (m.type === 'defense_board') { renderDefenseBoard(m.rows); }
    else if (m.type === 'defense_turn') {
      if (m.status === 'started') {
        boardMode = 'defense';
        startWallTurn(); if (arenaTag) arenaTag.textContent = 'DEFENSE ROUNDS — GET READY';
        renderDefenseBoard([]); popFX('DEFENSE ROUNDS', '#58f5b0', 2000); setMood('think', 2200);
      }
      else if (m.status === 'config') {
        boardMode = 'defense';
        startWallTurn(); wallTurn.endsAt = m.ends_at;
        wallTurn.round = m.round; wallTurn.rounds = m.rounds;
        wallTurn.ready = m.ready || 0; wallTurn.total = m.total || 0;
        if (m.board) renderDefenseBoard(m.board);
        const names = (m.candidates || []).map((c) => c.label).join('   •   ');
        updateReadyTag();
        banner = { text: 'NEXT WAVE: ' + names, until: performance.now() + 5200 };
        setMood('think', 2600); wallTurnCountdown();
      }
      else if (m.status === 'ready') {
        wallTurn.ready = m.ready || 0; if (m.total) wallTurn.total = m.total;
        updateReadyTag();
      }
      else if (m.status === 'result') {
        const lbl = (m.fired && m.fired.label) || '?';
        if (arenaTag) arenaTag.textContent = 'WAVE FIRED — ' + String(lbl).toUpperCase();
        banner = { text: 'WAVE FIRED: ' + lbl, until: performance.now() + 2800 };
        for (let i = 0; i < 4; i++) setTimeout(() => addAttempt('__wave' + i, 'progress'), i * 150);
        setMood('breach', 1600); chime();
        if (m.board && boardMode === 'defense') renderDefenseBoard(m.board);
      }
      else if (m.status === 'done') { endWallTurn(); if (boardMode === 'defense') { $('w-phase').textContent = 'ROUNDS OVER'; if (m.board) renderDefenseBoard(m.board); popFX('DEFENSE OVER', '#ffd23f', 2400); } }
      else if (m.status === 'empty') { $('w-phase').textContent = 'WAITING FOR PLAYERS'; if (arenaTag) arenaTag.textContent = 'WAITING FOR PLAYERS'; }
    }
    else if (m.type === 'attempt') {
      const who = (String(m.actor).length > 9 ? String(m.actor).slice(0, 8) + '…' : String(m.actor)).toUpperCase();
      addAttempt(m.actor, m.grade);
      if (m.grade === 'close') popFX(who + ' — SO CLOSE!', '#ffae42', 1300);
      else if (m.grade === 'progress') popFX(who + ' — LEAK!', '#37d6ff', 1200);
      if (m.text) pushFeed({ kind: 'attempt', text: m.text, avatar: m.avatar });
    }
    else if (m.type === 'frozen') { $('w-frozen').style.display = m.frozen ? 'block' : 'none'; }
    else if (m.type === 'reset') { captured.clear(); caps = 0; $('w-caps').textContent = 0; $('w-feed').innerHTML = ''; banner = null; currentDefender = null; fx.length = 0; enemies.length = 0; if (reduce) draw(); }
    else if (m.type === 'spotlight') { runReplay(m); }
    else if (m.type === 'leaderboard') {
      players.length = 0;
      m.rows.forEach((r) => players.push({ username: r.username, avatar: r.avatar || 0, score: r.score }));
      $('w-players').textContent = players.length;
      layout();
      // Only repaint the attack leaderboard when that is what the board shows.
      // During a defense round the board holds defense standings and must not
      // be clobbered by a (possibly refresh-triggered) attack snapshot.
      if (boardMode === 'attack') renderBoard(m.rows);
    } else if (m.type === 'feed') {
      const box = $('w-feed'); box.innerHTML = '';
      m.events.slice().reverse().forEach((e) => {
        if (e.kind === 'capture') { const mm = FLAG_RE.exec(e.text); if (mm) captured.add(mm[1]); caps++; }
        pushFeed(e);
      });
      $('w-caps').textContent = caps;
      if (reduce) draw();
    } else if (m.type === 'join') {
      pushFeed({ kind: 'join', text: `${m.actor} joined the range.`, avatar: m.avatar });
    } else if (m.type === 'capture') {
      caps++; $('w-caps').textContent = caps;
      addAttack(m.actor, m.flag, !!m.first_blood);
      const who = (String(m.actor).length > 9 ? String(m.actor).slice(0, 8) + '…' : String(m.actor)).toUpperCase();
      if (m.first_blood) { chime(); popFX('FIRST BLOOD!', '#ff3d81', 2400); setMood('breach', 1000); }
      else { popFX(who + ' +' + m.points, (SEAL_BY[m.flag] ? SEAL_BY[m.flag].col : '#ffd23f'), 1500); setMood('breach', 600); }
      const text = (m.first_blood ? 'FIRST BLOOD ' : '') + `${m.actor} captured ${m.flag} (${m.title}) +${m.points}`;
      pushFeed({ kind: 'capture', text, avatar: m.avatar, flagCode: m.flag });
    }
    else if (m.type === 'lead') {
      const who = String(m.actor).toUpperCase();
      popFX('👑 ' + who + ' TAKES THE LEAD!', '#ffd23f', 2600);
      setMood('breach', 900);
      chime();
      const pos = posByName[m.actor];
      const now = performance.now();
      if (pos) {
        bursts.push({ x: pos.x, y: pos.y, t0: now, dur: 1100, col: '#ffd23f', big: true });
        bursts.push({ x: cx, y: cy, t0: now, dur: 900, col: '#fff3b0', big: true });
      }
      pushFeed({ kind: 'capture', text: m.actor + ' took the lead (+' + m.bonus + ')', avatar: m.avatar });
    }
  };
  ws.onclose = () => setTimeout(connect, 2000);
}

window.addEventListener('resize', resize);
resize();
if (!reduce) loop();
connect();

/* restore phase + an in-progress defense round if the wall is opened mid-round */
fetch('/api/meta').then((r) => r.json()).then((m) => {
  if (m.phase) setPhase(m.phase);
  if (m.defense_round && m.defense_round.active) { boardMode = 'defense'; startWallDefense(m.defense_round.ends_at); }
  if (m.defense_turn && m.defense_turn.active) {
    boardMode = 'defense';
    startWallTurn(); wallTurn.endsAt = m.defense_turn.ends_at;
    const dt = m.defense_turn;
    wallTurn.round = dt.round; wallTurn.rounds = dt.rounds; wallTurn.ready = dt.ready || 0; wallTurn.total = dt.total || 0;
    renderDefenseBoard(dt.board || []);   // keep defense standings across a refresh
    if (dt.phase === 'config' && dt.candidates && dt.candidates.length) {
      updateReadyTag();
      banner = { text: 'NEXT WAVE: ' + dt.candidates.map((c) => c.label).join('   •   '), until: performance.now() + 5000 };
    } else if (arenaTag) {
      arenaTag.textContent = 'DEFENSE ROUNDS';
    }
    wallTurnCountdown();
  }
}).catch(() => {});

/* ---------------- join QR + copy ---------------- */
let joinUrl = location.origin;
(function loadQR() {
  fetch('/api/qr').then((r) => { const u = r.headers.get('X-Join-Url'); if (u) joinUrl = u; $('join-url').textContent = joinUrl.replace(/^https?:\/\//, ''); return r.text(); })
    .then((svg) => { $('qr').innerHTML = svg; })
    .catch(() => { $('join-url').textContent = location.host; });
})();
$('join-copy').onclick = async () => {
  const url = joinUrl || location.origin;
  let ok = false;
  try { await navigator.clipboard.writeText(url); ok = true; } catch (e) {
    try { const t = document.createElement('textarea'); t.value = url; document.body.appendChild(t); t.select(); ok = document.execCommand('copy'); t.remove(); } catch (e2) {}
  }
  const b = $('join-copy'); b.textContent = ok ? 'Copied!' : url; b.classList.add('done');
  setTimeout(() => { b.textContent = 'Copy link'; b.classList.remove('done'); }, 1800);
};

/* ---------------- sound ---------------- */
let soundOn = false, actx = null;
$('w-sound').onclick = () => {
  soundOn = !soundOn;
  $('w-sound').textContent = soundOn ? 'SOUND ON' : 'SOUND OFF';
  $('w-sound').style.background = soundOn ? 'var(--mint)' : '';
  $('w-sound').style.color = soundOn ? '#04331f' : '';
  if (soundOn && !actx) actx = new (window.AudioContext || window.webkitAudioContext)();
};
function chime() {
  if (!soundOn || !actx) return;
  const now = actx.currentTime;
  [880, 1320, 1760].forEach((f, i) => {
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = 'square'; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, now + i * 0.08);
    g.gain.exponentialRampToValueAtTime(0.16, now + i * 0.08 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.08 + 0.22);
    o.connect(g); g.connect(actx.destination);
    o.start(now + i * 0.08); o.stop(now + i * 0.08 + 0.24);
  });
}

/* ---------------- replay overlay ---------------- */
let replayTimer = null;
function runReplay(m) {
  clearTimeout(replayTimer);
  const el = $('replay'), tr = $('replay-trace');
  $('replay-title').textContent = `REPLAY  ·  ${m.actor} → ${m.flag} (${m.title})`;
  tr.innerHTML = '';
  el.classList.add('show');
  const lines = m.trace || [];
  let i = 0;
  const step = () => {
    if (i >= lines.length) { replayTimer = setTimeout(() => el.classList.remove('show'), 3200); return; }
    const l = lines[i++];
    const row = document.createElement('div');
    row.className = 'rline k-' + l.kind;
    const tool = l.kind === 'tool' && window.TZIcons ? TZIcons.parseTool(l.text) : null;
    const icon = window.TZIcons ? (tool ? TZIcons.tool(tool) : TZIcons.kind(l.kind)) : '';
    row.innerHTML = icon + '<span>' + (l.text || '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])) + '</span>';
    tr.appendChild(row);
    requestAnimationFrame(() => row.classList.add('show'));
    replayTimer = setTimeout(step, 320);
  };
  step();
}

if (/[?&]debug/.test(location.search)) {
  window.TZWall = {
    projectiles, bursts, players, captured, pos: posByName, addAttack, redraw: draw,
    sealColor: (c) => (SEAL_BY[c] ? SEAL_BY[c].col : '#ff3d81'),
    setBanner: (t) => { banner = { text: t, until: performance.now() + 4000 }; },
    freeze: () => { frozenNow = performance.now(); },
    unfreeze: () => { frozenNow = null; },
    dims: () => ({ cx, cy, rCore, rSeal, rPlayer }),
  };
}

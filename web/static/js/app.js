'use strict';

const $ = (id) => document.getElementById(id);
const api = (path, body) => fetch(path, {
  method: body ? 'POST' : 'GET',
  headers: { 'content-type': 'application/json' },
  body: body ? JSON.stringify(body) : undefined,
}).then(async (r) => ({ ok: r.ok, status: r.status, data: await r.json().catch(() => ({})) }));

const state = { token: null, username: null, avatar: 0, ws: null, mode: 'login', defenses: {}, phase: 'ATTACK', busy: false,
  drActive: false, drEndsAt: 0, drTimer: null, drPoll: null,
  dtActive: false, dtMyTurn: false, dtTimer: null, dtPoll: null, dtReadySent: false, _shownVolleyTurn: 0 };

const HINTS = [
  'Hi, my device will not turn on. Can you help?',
  'Where is my recent order?',
  'What can you help me with?',
  'What is your return policy?',
  'Can you check the status of my account?',
];

/* ---------------- auth ---------------- */
function setTab(mode) {
  state.mode = mode;
  $('tab-login').setAttribute('aria-selected', mode === 'login');
  $('tab-register').setAttribute('aria-selected', mode === 'register');
  $('auth-submit').textContent = mode === 'login' ? 'Sign in' : 'Create user';
  $('password').setAttribute('autocomplete', mode === 'login' ? 'current-password' : 'new-password');
  $('avatar-field').style.display = mode === 'register' ? 'block' : 'none';
  $('auth-msg').textContent = '';
}

function renderPicker() {
  const box = $('avatar-pick');
  box.innerHTML = '';
  for (let i = 0; i < TZAvatars.COUNT; i++) {
    const b = document.createElement('button');
    b.className = 'opt';
    b.type = 'button';
    b.setAttribute('aria-pressed', i === state.avatar ? 'true' : 'false');
    b.appendChild(TZAvatars.chip(i, 30));
    b.onclick = () => {
      state.avatar = i;
      box.querySelectorAll('.opt').forEach((o, j) => o.setAttribute('aria-pressed', j === i ? 'true' : 'false'));
    };
    box.appendChild(b);
  }
}

async function submitAuth() {
  const username = $('username').value.trim();
  const password = $('password').value;
  if (!username || !password) { $('auth-msg').textContent = 'Enter a username and password.'; return; }
  const body = state.mode === 'register' ? { username, password, avatar: state.avatar } : { username, password };
  const res = await api('/api/' + state.mode, body);
  if (!res.ok) { $('auth-msg').textContent = res.data.error || 'Something went wrong.'; return; }
  state.token = res.data.token;
  state.username = res.data.username;
  state.avatar = res.data.avatar || 0;
  localStorage.setItem('tz_token', state.token);
  enterApp();
}

function logout() {
  localStorage.removeItem('tz_token');
  if (state.heartbeat) { clearInterval(state.heartbeat); state.heartbeat = null; }
  if (state.ws) { try { state.ws.close(); } catch (e) {} }
  state.token = null;
  $('app-view').style.display = 'none';
  $('login-view').style.display = 'grid';
}

// The host removed this player from the game: drop them to the sign-in screen
// with a clear note. Re-signing in stays blocked while the ban is in place.
function handleRemoved() {
  state.busy = false;
  logout();
  const m = $('auth-msg');
  if (m) m.textContent = 'You have been removed from the game by the host.';
}

/* ---------------- app boot ---------------- */
async function enterApp() {
  $('login-view').style.display = 'none';
  $('app-view').style.display = 'flex';
  $('hud-name').textContent = state.username;

  const meta = (await api('/api/meta')).data;
  $('acct').textContent = meta.player_account || 'ACME-1007';
  renderDefensePanel(meta.defenses || []);
  setPhase(meta.phase || 'ATTACK');
  renderHints();

  await loadMe();
  connectWS();
  if (meta.defense_round) applyDefenseRound(meta.defense_round);
  if (meta.defense_turn) applyDefenseTurn(meta.defense_turn);
  if (state.heartbeat) clearInterval(state.heartbeat);
  state.heartbeat = setInterval(async () => {
    if (!state.token) return;
    const r = await api('/api/ping?token=' + encodeURIComponent(state.token));
    if (r.status === 403) handleRemoved();
  }, 45000);

  if (!localStorage.getItem('tz_tut_seen')) openTutorial(0);
  $('tip-x').onclick = () => { $('tipbox').style.display = 'none'; localStorage.setItem('tz_tip_seen', '1'); };
}

async function loadMe() {
  const res = await api('/api/me?token=' + encodeURIComponent(state.token));
  if (res.status === 403) { handleRemoved(); return; }
  if (!res.ok) { logout(); return; }
  const me = res.data;
  state.defenses = me.defenses || {};
  state.avatar = me.avatar || 0;
  state.submissions = me.submissions || 0;
  TZAvatars.mount($('hud-avatar'), state.avatar);
  $('hud-score').textContent = me.score;
  setPhase(me.phase);
  renderFlags(me.flags);
  syncToggles();
  applyFrozen(me.frozen);
}

function applyFrozen(f) {
  state.frozen = !!f;
  $('frozen-banner').style.display = f ? 'block' : 'none';
  $('send').disabled = !!f || state.busy;
  if (!f && $('cooldown').textContent === 'Submissions are frozen by the host.') $('cooldown').textContent = '';
}

function renderHints() {
  const box = $('hints');
  box.innerHTML = '';
  HINTS.forEach((h) => {
    const c = document.createElement('span');
    c.className = 'chip';
    c.textContent = h;
    c.onclick = () => { $('ticket').value = h; $('ticket').focus(); };
    box.appendChild(c);
  });
}

/* ---------------- defenses ---------------- */
function renderDefensePanel(defs) {
  const box = $('defenses');
  box.innerHTML = '';
  state.defLabels = {};
  defs.forEach((d) => {
    state.defLabels[d.key] = d.label;
    const row = document.createElement('div');
    row.className = 'def-row' + (d.key === 'keyword_blocklist' ? ' weak' : '');
    row.innerHTML = `<div class="meta"><div class="lbl">${d.label}</div><div class="blurb">${d.blurb}</div></div>`;
    const t = document.createElement('button');
    t.className = 'toggle';
    t.setAttribute('aria-pressed', 'false');
    t.dataset.key = d.key;
    t.onclick = () => toggleDefense(d.key, t);
    row.appendChild(t);
    box.appendChild(row);
  });
}

function syncToggles() {
  document.querySelectorAll('.toggle').forEach((t) => {
    t.setAttribute('aria-pressed', state.defenses[t.dataset.key] ? 'true' : 'false');
  });
}

async function toggleDefense(key, el) {
  const on = el.getAttribute('aria-pressed') !== 'true';
  const res = await api('/api/defense', { token: state.token, key, on });
  if (res.ok) {
    if (res.data.capped) { flashCapNote(res.data.cap || 2); return; }
    state.defenses = res.data.defenses; syncToggles();
  }
}

function flashCapNote(cap) {
  const lbl = $('def-toggle-label');
  if (!lbl) return;
  const prev = lbl.textContent;
  lbl.textContent = 'Only ' + cap + ' controls per round — turn one off first';
  lbl.classList.add('cap-warn');
  clearTimeout(state._capTimer);
  state._capTimer = setTimeout(() => { lbl.textContent = prev; lbl.classList.remove('cap-warn'); }, 1800);
}

/* ---------------- ticket flow ---------------- */
async function sendTicket() {
  if (state.busy) return;
  if (state.frozen) { $('cooldown').textContent = 'Submissions are frozen by the host.'; return; }
  const text = $('ticket').value.trim();
  if (!text) return;
  state.busy = true;
  $('send').disabled = true;
  setAgentState('thinking');
  $('trace').innerHTML = '';
  $('reveal').innerHTML = '';

  const res = await api('/api/ticket', { token: state.token, ticket: text });
  if (res.status === 403) { handleRemoved(); return; }
  if (res.status === 429) {
    $('cooldown').textContent = `Cooling down ${res.data.wait}s...`;
    setAgentState('idle');
    setTimeout(() => { $('cooldown').textContent = ''; }, res.data.wait * 1000);
    state.busy = false; $('send').disabled = false;
    return;
  }
  if (!res.ok) { state.busy = false; $('send').disabled = false; setAgentState('idle'); return; }
  renderResult(res.data);
}

function renderResult(d) {
  const trace = $('trace');
  const lines = d.trace;
  let i = 0;
  const step = () => {
    if (i >= lines.length) return finishResult(d);
    const l = lines[i++];
    const el = document.createElement('div');
    el.className = 'line k-' + l.kind;
    const tool = l.kind === 'tool' ? TZIcons.parseTool(l.text) : null;
    const icon = tool ? TZIcons.tool(tool) : TZIcons.kind(l.kind);
    el.innerHTML = icon + '<span class="tx">' + escapeHtml(l.text) + '</span>';
    trace.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    trace.scrollTop = trace.scrollHeight;
    setTimeout(step, 170);
  };
  step();
}

function finishResult(d) {
  state.submissions = (state.submissions || 0) + 1;
  setAgentState(d.state);
  if (d.state === 'compromised' && (d.awarded || []).length) {
    const cv = $('agent-canvas');
    cv.classList.remove('hit'); void cv.offsetWidth; cv.classList.add('hit');
  }
  const rev = $('reveal');
  const safe = d.state === 'defended';
  const boxes = [];
  d.disclosures.forEach((x) => boxes.push({ t: x, safe: false }));
  d.actions.forEach((x) => boxes.push({ t: x, safe: false }));
  d.outbox.forEach((x) => boxes.push({ t: 'EMAIL ' + x, safe: false }));
  if (!boxes.length && safe) boxes.push({ t: 'Agent held the line. Nothing leaked.', safe: true });
  boxes.forEach((b) => {
    const el = document.createElement('div');
    el.className = 'box' + (b.safe ? ' safe' : '');
    el.textContent = b.t;
    rev.appendChild(el);
  });
  if (d.nudge) {
    const nb = document.createElement('div');
    const cls = d.grade === 'progress' ? 'progress' : d.grade === 'close' ? 'close' : 'weak';
    const label = { progress: 'PROGRESS', close: 'SO CLOSE', weak: 'TIP' }[d.grade] || 'TIP';
    nb.className = 'nudge n-' + cls;
    nb.innerHTML = '<b>' + label + '</b> ' + escapeHtml(d.nudge);
    rev.appendChild(nb);
  }
  logLedger(d);

  $('hud-score').textContent = d.score;
  renderFlags(d.flags);
  (d.awarded || []).forEach((a) => {
    toast(a);
    if (a.impact) {
      const eb = document.createElement('div');
      eb.className = 'nudge n-learn';
      eb.innerHTML = '<b>WHY IT MATTERS</b> ' + escapeHtml(a.impact);
      rev.appendChild(eb);
    }
  });
  if (!(d.awarded || []).length && !d.nudge && d.grade) gradeToast(d.grade);

  state.busy = false;
  $('send').disabled = state.frozen;
}

function gradeToast(grade) {
  const msg = {
    close: 'SO CLOSE — the agent pushed back. Switch up your technique.',
    progress: 'PROGRESS — something leaked, but no flag yet. Keep chaining.',
    weak: 'TOO WEAK — that barely registered. Try a real technique.',
  }[grade];
  if (!msg) return;
  const el = document.createElement('div');
  el.className = 'toast grade g-' + grade;
  el.innerHTML = '<span>' + msg + '</span>';
  $('toasts').appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

function logLedger(d) {
  const box = $('ledger');
  const stamp = new Date().toLocaleTimeString();
  const parts = [];
  d.actions.forEach((x) => parts.push(x));
  d.outbox.forEach((x) => parts.push('EMAIL ' + x));
  d.disclosures.forEach((x) => parts.push('LEAK ' + x.slice(0, 80)));
  if (!parts.length) return;
  if (box.querySelector('.cool')) box.innerHTML = '';
  parts.forEach((p) => {
    const el = document.createElement('div');
    el.className = 'ev capture';
    el.textContent = `[${stamp}] ${p}`;
    box.prepend(el);
  });
}

/* ---------------- flags ---------------- */
function renderFlags(flags) {
  const box = $('flags');
  box.innerHTML = '';
  const done = flags.filter((f) => f.captured).length;
  const head = document.createElement('div');
  head.className = 'flags-head';
  head.innerHTML =
    `<div class="fh-row"><span>Objectives captured</span><b>${done} / ${flags.length}</b></div>` +
    `<div class="fh-row"><span>Attempts made</span><b>${state.submissions || 0}</b></div>` +
    `<div class="fh-note">Each capture scores points. Stuck on one? Open its <b>Hint</b> &mdash; a new hint unlocks every 3 attempts.</div>`;
  box.appendChild(head);
  flags.forEach((f) => {
    const row = document.createElement('div');
    row.className = 'flag' + (f.captured ? ' done' : '') + (f.hidden && !f.captured ? ' hidden' : '');
    row.innerHTML = `
      <div class="mark">${f.captured ? '\u2713' : ''}</div>
      <div class="t"><div class="name">${TZIcons.flag(f.code)}<span>${escapeHtml(f.title)}</span></div><div class="desc">${escapeHtml(f.concept)}</div></div>
      <div class="pts">${f.points}</div>`;
    const t = row.querySelector('.t');
    if (f.captured && f.lesson) {
      const les = document.createElement('div');
      les.className = 'lesson';
      les.textContent = f.lesson;
      t.appendChild(les);
    } else if (!f.hidden && !f.captured) {
      const bar = document.createElement('div');
      bar.className = 'hintbar';
      const b = document.createElement('button');
      b.className = 'hint-btn'; b.textContent = 'Hint';
      const out = document.createElement('div'); out.className = 'hint-out';
      b.onclick = () => askHint(f.code, out);
      bar.appendChild(b); t.appendChild(bar); t.appendChild(out);
    }
    box.appendChild(row);
  });
}

async function askHint(code, out) {
  const res = await api('/api/hint', { token: state.token, flag: code });
  if (!res.ok) return;
  const d = res.data;
  out.innerHTML = '';
  if (d.unlocked.length) {
    d.unlocked.forEach((h) => { const p = document.createElement('div'); p.className = 'hint-line'; p.textContent = '• ' + h; out.appendChild(p); });
    if (d.unlocked.length < d.total) { const p = document.createElement('div'); p.className = 'hint-locked'; p.textContent = `Next hint at ${d.next_at} attempts.`; out.appendChild(p); }
  } else {
    const p = document.createElement('div'); p.className = 'hint-locked';
    p.textContent = `Locked. Try more tickets — first hint at ${d.next_at || 3} attempts (you have ${d.submissions || 0}).`;
    out.appendChild(p);
  }
}


/* ---------------- defense round (live, synchronized) ---------------- */
function applyDefenseRound(info) {
  if (info && info.active) { state.drEndsAt = info.ends_at; startDefenseUI(); }
}

function startDefenseUI() {
  const fresh = !state.drActive;
  if (fresh) { state._volleyPlaying = false; resetDefenseTheater(); }
  state.drActive = true;
  $('dr-status').textContent = 'Round live — the agent is under attack. Arm your defenses!';
  $('dr-scoreline').style.display = 'flex';
  $('dr-boardwrap').style.display = 'block';
  if (state.phase !== 'ATTACK') { $('compose-panel').style.display = 'none'; $('defense-round-panel').style.display = ''; }
  enterDefenseTheater();
  $('send').disabled = true;
  if (!state.drTimer) state.drTimer = setInterval(tickCountdown, 1000);
  if (!state.drPoll) state.drPoll = setInterval(fetchDefenseStatus, 2500);
  tickCountdown();
  fetchDefenseStatus();
}

function stopDefenseUI(ended) {
  state.drActive = false; state._volleyPlaying = false;
  if (state.drTimer) { clearInterval(state.drTimer); state.drTimer = null; }
  if (state.drPoll) { clearInterval(state.drPoll); state.drPoll = null; }
  $('dr-countdown').textContent = '';
  if (ended) { $('dr-status').textContent = 'Round over — final defense scores are in. See the wall.'; $('dr-wave').style.display = 'none'; }
  else { exitDefenseTheater(); if (state.phase !== 'ATTACK') $('dr-status').textContent = 'Waiting for the host to start the round…'; }
  $('send').disabled = state.frozen;
}

function tickCountdown() {
  if (!state.drEndsAt) { $('dr-countdown').textContent = ''; return; }
  const s = Math.max(0, Math.round(state.drEndsAt - Date.now() / 1000));
  $('dr-countdown').textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

let _lastDrWave = 0;
async function fetchDefenseStatus() {
  if (!state.token) return;
  const res = await api('/api/defense_round/status?token=' + encodeURIComponent(state.token));
  if (!res.ok) return;
  const d = res.data;
  state.drActive = d.active; if (d.ends_at) state.drEndsAt = d.ends_at;
  $('dr-score').textContent = d.defense_score;
  if (d.last) {
    const L = d.last;
    const verdict = { blocked: 'BLOCKED', leaked: 'LEAKED', served: 'SERVED', overblocked: 'OVER-BLOCKED' }[L.result] || L.result.toUpperCase();
    const sign = L.points >= 0 ? '+' + L.points : '' + L.points;
    const w = $('dr-wave');
    w.style.display = 'block';
    w.className = 'dr-wave r-' + L.result;
    w.innerHTML = `<span class="dr-wn">Wave ${L.wave}/${L.total}</span><span class="dr-wl">${escapeHtml(L.label)}</span><span class="dr-wv">${verdict} ${sign}</span>`;
    if (L.wave !== _lastDrWave) { _lastDrWave = L.wave; pushDrLog(L); renderWaveTrace(L); }
  }
  if (d.board) renderDefenseBoard(d.board);
}

function pushDrLog(L) {
  const box = $('dr-log');
  const el = document.createElement('div');
  el.className = 'dr-logrow r-' + L.result;
  const sign = L.points >= 0 ? '+' + L.points : '' + L.points;
  el.innerHTML = `<span>${escapeHtml(L.label)}</span><b>${sign}</b>`;
  box.prepend(el);
  while (box.children.length > 6) box.removeChild(box.lastChild);
}

function renderDefenseBoard(rows) {
  const box = $('dr-board');
  box.innerHTML = '';
  rows.slice(0, 6).forEach((r, i) => {
    const el = document.createElement('div');
    el.className = 'dr-brow' + (r.username === state.username ? ' self' : '');
    el.innerHTML = `<span class="dr-brk">${i + 1}</span><span class="dr-bnm">${escapeHtml(r.username)}</span><b>${r.score}</b>`;
    box.appendChild(el);
  });
}

function renderWaveTrace(L) {
  enterDefenseTheater();
  const theater = $('def-theater');
  let list = $('dt-list');
  if (!list) {
    theater.innerHTML = '<div class="dt-head"><span class="dt-wave">LIVE WAVES</span><span class="dt-tally" id="dt-tally"></span></div><div class="dt-list" id="dt-list"></div>';
    list = $('dt-list');
  }
  const t = $('dt-tally'); if (t && L.wave && L.total) t.textContent = 'wave ' + L.wave + '/' + L.total;
  const r = { label: L.label, result: L.result, points: L.points };
  const card = atkCard(r);
  list.appendChild(card); list.scrollTop = list.scrollHeight;
  setAgentState('thinking'); hitAgent();
  setTimeout(() => resolveCard(card, r), 360);
  while (list.children.length > 8) list.removeChild(list.firstChild);
}

/* ---------------- turn-based defense ---------------- */
function applyDefenseTurn(info) {
  if (info && info.active) { startTurnUI(); fetchTurnStatus(); }
}

function startTurnUI() {
  const fresh = !state.dtActive;
  if (fresh) { state.dtReadySent = false; state._shownRound = 0; state._shownResult = 0; state._volleyPlaying = false; resetDefenseTheater(); }
  state.dtActive = true;
  $('dr-title').textContent = 'Defense round';
  $('dr-scoreline').style.display = 'flex';
  $('dr-boardwrap').style.display = 'block';
  if (state.phase !== 'ATTACK') { $('compose-panel').style.display = 'none'; $('defense-round-panel').style.display = ''; }
  enterDefenseTheater();
  $('send').disabled = true;
  if (!state.dtPoll) state.dtPoll = setInterval(fetchTurnStatus, 1500);
  if (!state.dtTimer) state.dtTimer = setInterval(tickCountdown, 1000);
}

function stopTurnUI(done) {
  state.dtActive = false; state._volleyPlaying = false;
  if (state.dtPoll) { clearInterval(state.dtPoll); state.dtPoll = null; }
  if (state.dtTimer) { clearInterval(state.dtTimer); state.dtTimer = null; }
  $('dr-ready').style.display = 'none';
  $('dr-countdown').textContent = '';
  setTogglesEnabled(true);
  if (done) { $('dr-status').textContent = 'Defense rounds over — final scores are on the wall.'; }
  else { exitDefenseTheater(); if (state.phase !== 'ATTACK') $('dr-status').textContent = 'Waiting for the host to start the defense rounds…'; }
  $('send').disabled = state.frozen;
}

async function fetchTurnStatus() {
  if (!state.token) return;
  const res = await api('/api/defense_turn/status?token=' + encodeURIComponent(state.token));
  if (!res.ok) return;
  const d = res.data;
  if (!d.active) { if (state.dtActive) stopTurnUI(false); return; }
  state.dtActive = true;
  $('dr-score').textContent = d.defense_score;
  if (d.ends_at) state.drEndsAt = d.ends_at;
  applyRoundView(d);
  if (d.board) renderDefenseBoard(d.board);
}

function applyRoundView(d) {
  const rr = (d.round && d.rounds) ? ' ' + d.round + '/' + d.rounds : '';
  if (d.phase === 'config') {
    if (d.round !== state._shownRound) {   // a new round opened — fresh picks
      state._shownRound = d.round;
      state._shownResult = 0;
      state.dtReadySent = false;
      state._volleyPlaying = false;
      state.defenses = {}; syncToggles();
      renderCandidates(d.candidates);
    }
    const rc = (typeof d.ready === 'number' && d.total) ? '  (' + d.ready + '/' + d.total + ' ready)' : '';
    if (d.is_ready || state.dtReadySent) {
      $('dr-status').textContent = 'Round' + rr + ' — locked in. Waiting for others' + rc + '…';
      $('dr-ready').style.display = 'none';
      setTogglesEnabled(false);
    } else {
      $('dr-status').textContent = 'Round' + rr + ' — arm up to 2 controls for ONE of these, then Ready' + rc + '.';
      $('dr-ready').style.display = '';
      setTogglesEnabled(true);
    }
  } else if (d.phase === 'result') {
    $('dr-ready').style.display = 'none';
    setTogglesEnabled(false);
    $('dr-status').textContent = 'Round' + rr + ' — wave fired! See how your pick held up.';
    if (d.last && d.last.round === d.round && d.last.round !== state._shownResult) {
      state._shownResult = d.last.round;
      renderRoundResult(d.last);
    }
  } else {   // prep
    $('dr-status').textContent = 'Defense rounds starting — get ready…';
    $('dr-ready').style.display = 'none';
    setTheaterNote('Rounds are starting. Each round shows two possible attacks — arm the control that best stops one.');
  }
}

/* ---- defense theater (center console shows attacks hitting YOUR agent) ---- */
function enterDefenseTheater() {
  $('def-theater').style.display = '';
  $('trace').style.display = 'none';
  $('reveal').style.display = 'none';
}
function exitDefenseTheater() {
  const th = $('def-theater');
  th.style.display = 'none'; th.innerHTML = '';
  $('trace').style.display = ''; $('reveal').style.display = '';
}
function resetDefenseTheater() { $('def-theater').innerHTML = ''; state._shownVolleyTurn = 0; }
function setTheaterNote(text) {
  if (state._volleyPlaying) return;
  enterDefenseTheater();
  const th = $('def-theater');
  if (th.querySelector('.dt-list')) return;  // a volley is/was shown — keep it
  th.innerHTML = '<div class="dt-wait">' + TZIcons.svg('shield', 'dt-waitic') + '<span>' + escapeHtml(text) + '</span></div>';
}
function hitAgent() {
  const c = $('agent-canvas');
  c.classList.remove('hit'); void c.offsetWidth; c.classList.add('hit');
}
function atkCard(r) {
  const card = document.createElement('div');
  card.className = 'dt-atk incoming';
  card.innerHTML = TZIcons.svg('bug', 'dt-ic') + '<span class="dt-lbl">' + escapeHtml(r.label) +
    '</span><span class="dt-verdict">…</span>';
  return card;
}
function resolveCard(card, r) {
  card.classList.remove('incoming');
  card.classList.add('resolved', 'r-' + r.result);
  const sign = r.points >= 0 ? '+' + r.points : '' + r.points;
  const verdict = { blocked: 'BLOCKED', leaked: 'LEAKED', served: 'SERVED', overblocked: 'OVER-BLOCKED' }[r.result] || r.result.toUpperCase();
  card.querySelector('.dt-verdict').textContent = verdict + ' ' + sign;
  setAgentState(r.result === 'blocked' || r.result === 'served' ? 'defended' : (r.result === 'overblocked' ? 'defended' : 'compromised'));
}

function defLabel(key) { return (state.defLabels && state.defLabels[key]) || key; }

// Config phase: show the two candidate attacks; the player arms up to two
// controls for whichever they think will fire.
function renderCandidates(cands) {
  state._volleyPlaying = false;
  enterDefenseTheater();
  const th = $('def-theater');
  let html = '<div class="dt-head"><span class="dt-wave">NEXT WAVE · ONE OF THESE</span></div><div class="dt-cands">';
  (cands || []).forEach((c) => {
    html += '<div class="dt-cand">' + TZIcons.svg('bug', 'dt-ic') +
      '<div class="dt-cbody"><div class="dt-clbl">' + escapeHtml(c.label) + '</div>' +
      (c.desc ? '<div class="dt-cdesc">' + escapeHtml(c.desc) + '</div>' : '') + '</div></div>';
  });
  html += '</div><div class="dt-hint">Arm up to 2 controls, then hit Ready. One of these fires — the most professional control scores the most.</div>';
  th.innerHTML = html;
  setAgentState('thinking');
}

// Result phase: the fired attack lands on your agent and your pick is judged.
function renderRoundResult(last) {
  state._volleyPlaying = true;
  enterDefenseTheater();
  const th = $('def-theater');
  const fired = last.fired || {};
  const matched = last.matched;
  const blocked = (matched === 'best' || matched === 'secondary');
  th.innerHTML = '<div class="dt-head"><span class="dt-wave">WAVE FIRED</span></div><div class="dt-list" id="dt-list"></div>';
  const list = $('dt-list');
  const card = atkCard({ label: fired.label || '?' });
  list.appendChild(card);
  setAgentState('thinking'); hitAgent();
  const finish = () => {
    card.classList.remove('incoming');
    card.classList.add('resolved', blocked ? 'r-blocked' : 'r-leaked');
    const sign = last.points >= 0 ? '+' + last.points : '' + last.points;
    const verdict = blocked ? (matched === 'best' ? 'BLOCKED (best)' : 'BLOCKED') : 'LEAKED';
    card.querySelector('.dt-verdict').textContent = verdict + ' ' + sign;
    setAgentState(blocked ? 'defended' : 'compromised');
    state._volleyPlaying = false;
    renderRoundLearn(last);
  };
  if (reduce) { finish(); return; }
  setTimeout(finish, 640);
}

function renderRoundLearn(last) {
  const box = $('dr-log'); box.innerHTML = '';
  const matched = last.matched;
  const bestLbl = defLabel(last.best);
  const head = document.createElement('div'); head.className = 'dr-volley-head';
  const verdictTxt = matched === 'best' ? 'Best control — full marks!'
    : matched === 'secondary' ? 'Secondary control — partial credit.'
    : 'Missed — nothing you armed stopped it.';
  head.textContent = 'Fired: ' + ((last.fired && last.fired.label) || '?') + '  ·  ' + verdictTxt + '  (+' + last.points + ')';
  box.appendChild(head);
  const learn = document.createElement('div'); learn.className = 'dr-learn';
  if (matched === 'best') {
    learn.textContent = 'You armed the most professional control for this attack (' + bestLbl + '). That is exactly how this threat is stopped in production.';
  } else if (matched === 'secondary') {
    learn.textContent = 'Your control helped, but the cleanest fix here is ' + bestLbl + '. Pick the primary control next time for full marks.';
  } else {
    learn.textContent = 'The right control for this one was ' + bestLbl + '. Match the control to the threat — a blunt filter or an unrelated switch will not hold.';
  }
  box.appendChild(learn);
}

function setTogglesEnabled(on) {
  document.querySelectorAll('#defenses .toggle').forEach((t) => {
    t.disabled = !on;
    t.style.opacity = on ? '' : '0.45';
  });
}


/* ---------------- leaderboard + feed ---------------- */
function renderLeaderboard(rows) {
  const body = $('lb-body');
  body.innerHTML = '';
  if (!rows.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td'); td.colSpan = 4; td.className = 'cool';
    td.textContent = 'No scores yet — capture a flag to appear here.';
    tr.appendChild(td); body.appendChild(tr);
    return;
  }
  rows.forEach((r, i) => {
    const tr = document.createElement('tr');
    const rk = document.createElement('td'); rk.className = 'rank'; rk.textContent = i + 1;
    const pl = document.createElement('td'); pl.className = 'plr';
    pl.appendChild(TZAvatars.chip(r.avatar || 0, 18));
    const nm = document.createElement('span'); nm.className = 'pn'; nm.textContent = r.username; pl.appendChild(nm);
    const fl = document.createElement('td'); fl.textContent = r.flags;
    const sc = document.createElement('td'); sc.className = 'sc'; sc.textContent = r.score;
    tr.append(rk, pl, fl, sc);
    if (r.username === state.username) tr.classList.add('self');
    body.appendChild(tr);
  });
}

function renderFeed(events) {
  const box = $('feed');
  box.innerHTML = '';
  events.forEach((e) => box.appendChild(feedEl(e)));
}

const FLAG_RE = /(RECON-TOOLS|FLAG-\d|BONUS-[A-Z]+)/;
function flagFromText(t) { const m = FLAG_RE.exec(t || ''); return m ? m[1] : null; }

function feedEl(e) {
  const first = e.text && e.text.startsWith('FIRST BLOOD');
  const el = document.createElement('div');
  el.className = 'ev ' + (first ? 'first' : e.kind);
  if (e.avatar != null && (e.kind === 'capture' || e.kind === 'join' || e.kind === 'attempt')) el.appendChild(TZAvatars.chip(e.avatar, 18));
  const ic = document.createElement('span');
  ic.className = 'evic';
  const code = e.flagCode || (e.kind === 'capture' ? flagFromText(e.text) : null);
  ic.innerHTML = code ? TZIcons.flag(code)
    : e.kind === 'join' ? TZIcons.svg('star', '')
    : e.kind === 'phase' ? TZIcons.svg('shield', '')
    : TZIcons.svg('bolt', '');
  el.appendChild(ic);
  const tx = document.createElement('span'); tx.className = 'evtx'; tx.textContent = e.text;
  el.appendChild(tx);
  return el;
}

/* ---------------- websocket ---------------- */
function connectWS() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}/ws`);
  state.ws = ws;
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.type === 'phase') setPhase(m.phase);
    else if (m.type === 'frozen') applyFrozen(m.frozen);
    else if (m.type === 'reset') { loadMe(); $('ledger').innerHTML = '<span class="cool">No actions yet.</span>'; $('trace').innerHTML = ''; $('reveal').innerHTML = ''; setAgentState('idle'); }
    else if (m.type === 'defense_round') {
      if (m.status === 'started') { state.drEndsAt = m.ends_at; startDefenseUI(); }
      else if (m.status === 'ended') { stopDefenseUI(true); if (m.rows) renderDefenseBoard(m.rows); }
    }
    else if (m.type === 'defense_wave') { fetchDefenseStatus(); }
    else if (m.type === 'defense_board') { renderDefenseBoard(m.rows); }
    else if (m.type === 'defense_turn') {
      if (m.status === 'started') { startTurnUI(); fetchTurnStatus(); }
      else if (m.status === 'config') { startTurnUI(); fetchTurnStatus(); }
      else if (m.status === 'ready') { fetchTurnStatus(); }
      else if (m.status === 'result') { startTurnUI(); fetchTurnStatus(); }
      else if (m.status === 'done') { stopTurnUI(true); if (m.board) renderDefenseBoard(m.board); }
      else if (m.status === 'empty') { if (state.dtActive) $('dr-status').textContent = 'Waiting for active players…'; }
    }
    else if (m.type === 'defense_volley') { fetchTurnStatus(); }
    else if (m.type === 'leaderboard') renderLeaderboard(m.rows);
    else if (m.type === 'feed') renderFeed(m.events);
    else if (m.type === 'join') {
      $('feed').prepend(feedEl({ kind: 'join', text: `${m.actor} joined the range.`, avatar: m.avatar }));
    }
    else if (m.type === 'capture') {
      const text = (m.first_blood ? 'FIRST BLOOD ' : '') + `${m.actor} captured ${m.flag} (${m.title}) +${m.points}`;
      $('feed').prepend(feedEl({ kind: 'capture', text, avatar: m.avatar, flagCode: m.flag }));
      if (m.first_blood && m.actor !== state.username) toast({ first_blood: true, flag: m.flag, actor: m.actor });
    }
    else if (m.type === 'attempt') {
      if (m.text) {
        const box = $('feed'); box.prepend(feedEl({ kind: 'attempt', text: m.text, avatar: m.avatar }));
        while (box.children.length > 60) box.removeChild(box.lastChild);
      }
    }
    else if (m.type === 'lead') {
      leadToast(m.actor, m.bonus, m.actor === state.username);
    }
  };
  ws.onclose = () => { if (state.token) setTimeout(connectWS, 2000); };
}

function setPhase(phase) {
  state.phase = phase;
  const pill = $('phase-pill');
  const attack = phase === 'ATTACK';
  pill.textContent = attack ? 'ATTACK PHASE' : 'DEFENSE ROUND';
  pill.className = 'pill ' + (attack ? 'attack' : 'lab');
  $('compose-panel').style.display = attack ? '' : 'none';
  $('defense-round-panel').style.display = attack ? 'none' : '';
  if (attack) {
    if (state.dtActive) stopTurnUI(false);
    if (state.drActive) stopDefenseUI(false);
    exitDefenseTheater();
    $('dr-status').textContent = 'Waiting for the host to start the round…';
  } else if (!state.drActive && !state.dtActive) {
    $('dr-status').textContent = 'Waiting for the host to start the defense rounds…';
  }
}

/* ---------------- agent avatar ---------------- */
const canvas = $('agent-canvas');
const ctx = canvas.getContext('2d');
canvas.width = TZBot.SIZE; canvas.height = TZBot.SIZE;
let agentState = 'idle';
let frame = 0;
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const MOOD_OF = { idle: 'calm', thinking: 'think', compromised: 'breach', defended: 'held', handled: 'held', resisted: 'calm' };

function drawAgent() {
  TZBot.paint(ctx, MOOD_OF[agentState] || 'calm', frame);
  frame++;
  if (!reduce) requestAnimationFrame(drawAgent);
}

function setAgentState(s) {
  agentState = s;
  $('agent-state').className = 'agent-state ' + s;
  $('agent-state').textContent = { idle: 'STANDBY', thinking: 'PROCESSING', compromised: 'COMPROMISED', defended: 'HELD', handled: 'RESOLVED', resisted: 'DECLINED' }[s] || s.toUpperCase();
  if (reduce) drawAgent();
}

/* ---------------- toast + utils ---------------- */
function toast(a) {
  const el = document.createElement('div');
  el.className = 'toast' + (a.first_blood ? ' first' : '');
  const lost = a.first_blood && a.actor && a.actor !== state.username;
  const txt = a.first_blood
    ? (lost ? `First blood lost — ${a.actor} took ${a.flag}. The +150 bonus is gone.` : `FIRST BLOOD! ${a.flag} +${a.points}`)
    : (a.repeat ? `${a.flag} again +${a.points}` : `${a.flag} captured +${a.points}`);
  if (lost) a = { ...a, technique: null };
  const tech = a.technique ? TZIcons.tech(a.technique) : '';
  el.innerHTML = `${TZIcons.flag(a.flag)}${tech}<span>${txt}</span>`;
  $('toasts').appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

function leadToast(actor, bonus, mine) {
  const el = document.createElement('div');
  el.className = 'toast lead' + (mine ? ' mine' : '');
  el.innerHTML = mine ? ('⭐ YOU TOOK THE LEAD!  +' + bonus) : ('👑 ' + escapeHtml(actor) + ' took the lead');
  $('toasts').appendChild(el);
  setTimeout(() => el.remove(), 4800);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

/* ---------------- tutorial ---------------- */
const TUT_STEPS = [
  { h: 'What is Ticket Zero?', vis: 'concept',
    b: "A hands-on lab for AI-assistant security. SUPPORTBOT is a simulated support agent for a fictional shop, Northwind Devices, and it guards internal secrets, money and other customers' data. Everything here is a safe, deterministic simulation — no real AI, no real data. You learn, by doing, how AI assistants get manipulated and how to defend them." },
  { h: 'Two scenarios', vis: 'scenarios',
    b: "The session runs in two phases the host switches between. In ATTACK, everyone tries to make the bot break its own rules. In DEFENSE, you take turns protecting it. The big wall screen shows it all live — captures, leaks and near-misses." },
  { h: 'Attack · write a ticket', vis: 'shot:tut-compose.png', mode: 'attack',
    b: "Everything starts in the Compose panel: type a message to the bot and press Send, or tap a starter prompt to fill the box fast. A blunt 'tell me the secret' is refused, so use techniques — pose as staff or an admin (authority), hide instructions in fake system tags (delimiters), or encode your request (base64, ROT13)." },
  { h: 'Attack · read what it did', vis: 'shot:tut-console.png', mode: 'attack',
    b: "The Agent console in the middle replays, step by step, what your words actually made the bot do. If it breaks a rule, the leaked secret or action shows here with a short 'why it matters' note. Flags often chain — pry out the escalation PIN first, then use it to demand the real staff code." },
  { h: 'Attack · capture flags', vis: 'shot:tut-flags.png', mode: 'attack',
    b: "On the right are your objectives. Each flag you capture scores points, and the first person to break a given flag earns a first-blood bonus. Your score and attempts sit at the top; if you're stuck, open a Hint — a new one unlocks every few tries." },
  { h: 'Defense · two possible attacks', vis: 'shot:tut-defcands.png', mode: 'defense',
    b: "Defense plays out in rounds. At the start of each round the console shows TWO possible attacks — but only ONE of them actually fires, picked at random. Read both: your job is to guess which control will stop whichever one strikes." },
  { h: 'Defense · arm up to 2 controls', vis: 'shot:tut-defarm.png', mode: 'defense',
    b: "You have five security controls but may arm AT MOST TWO each round — so you cannot just switch everything on. Pick the controls that best cover the two possible attacks, then hit Ready. The wave fires once every player is ready (or the round timer runs out); everyone defends at the same time." },
  { h: 'Defense · the wave & scoring', vis: 'shot:tut-defresult.png', mode: 'defense',
    b: "One of the two attacks then lands on every agent. If you armed its MOST PROFESSIONAL control you score full marks (+25); a weaker control that still works scores partial (+12); the wrong pick scores nothing. Some attacks have more than one answer — but the pro choice always pays more." },
  { h: 'Know your screen', vis: 'go',
    b: "That's the idea. Next, a quick tour of your screen — what every button and panel is for, so nothing is a surprise. You can reopen this whole guide any time with the ? button, top right." },
];
let tutIdx = 0;
function tutIc(name) { return TZIcons.svg(name, 'tut-ic'); }
function renderVis(vis) {
  const box = $('tut-vis');
  if (vis === 'concept') {
    box.innerHTML = '<div class="tut-stage"><canvas class="tut-botcv" width="' + TZBot.SIZE + '" height="' + TZBot.SIZE + '"></canvas>' +
      '<span class="tut-badge">' + tutIc('lock') + '</span></div>' +
      '<div class="tut-vcap">SUPPORTBOT · guards secrets, money &amp; customer data</div>';
  } else if (vis === 'scenarios') {
    box.innerHTML = '<div class="tut-two">' +
      '<div class="tut-mini atk">' + tutIc('bolt') + '<b>ATTACK</b><small>break its rules</small></div>' +
      '<div class="tut-mini def">' + tutIc('shield') + '<b>DEFENSE</b><small>protect it</small></div></div>';
  } else if (vis === 'attack') {
    box.innerHTML = '<div class="tut-flow">' +
      '<div class="tut-node">' + tutIc('chat') + '<small>your ticket</small></div>' +
      '<span class="tut-arrow">▶</span>' +
      '<div class="tut-node"><canvas class="tut-botcv sm" width="' + TZBot.SIZE + '" height="' + TZBot.SIZE + '"></canvas><small>SUPPORTBOT</small></div>' +
      '<span class="tut-arrow">▶</span>' +
      '<div class="tut-node gold">' + tutIc('key') + '<small>flag +pts</small></div></div>' +
      '<div class="tut-chips"><span>' + tutIc('star') + ' authority</span><span>' + tutIc('brackets') + ' fake tags</span><span>' + tutIc('code') + ' encoding</span></div>';
  } else if (vis === 'defense') {
    box.innerHTML = '<div class="tut-flow">' +
      '<div class="tut-node"><span class="tut-sw on"></span><span class="tut-sw"></span><small>your defenses</small></div>' +
      '<span class="tut-arrow mint">▶</span>' +
      '<div class="tut-node mint">' + tutIc('shield') + '<small>your agent</small></div>' +
      '<span class="tut-arrow red">◀</span>' +
      '<div class="tut-node red">' + tutIc('bug') + tutIc('bug') + '<small>attack volley</small></div></div>';
  } else if (vis && vis.indexOf('shot:') === 0) {
    box.innerHTML = '<img class="tut-shot" src="/static/img/' + vis.slice(5) + '" alt="">';
  } else if (vis === 'go') {
    box.innerHTML = '<div class="tut-stage"><canvas class="tut-botcv" width="' + TZBot.SIZE + '" height="' + TZBot.SIZE + '"></canvas></div>' +
      '<div class="tut-vcap">Pick a prompt · watch the wall · good luck!</div>';
  } else { box.innerHTML = ''; }
  box.querySelectorAll('.tut-botcv').forEach((c) => {
    try { TZBot.paint(c.getContext('2d'), 'calm', 0); } catch (e) {}
  });
}
function renderTutorial() {
  const s = TUT_STEPS[tutIdx];
  $('tut-step').textContent = (tutIdx + 1) + ' / ' + TUT_STEPS.length;
  const card = document.querySelector('.tut-card');
  const badge = $('tut-mode');
  card.classList.remove('mode-attack', 'mode-defense');
  if (s.mode === 'attack') {
    card.classList.add('mode-attack');
    badge.textContent = 'ATTACK MODE'; badge.className = 'tut-mode m-attack'; badge.style.display = '';
  } else if (s.mode === 'defense') {
    card.classList.add('mode-defense');
    badge.textContent = 'DEFENSE MODE'; badge.className = 'tut-mode m-defense'; badge.style.display = '';
  } else {
    badge.textContent = ''; badge.style.display = 'none';
  }
  $('tut-h').textContent = s.h;
  renderVis(s.vis);
  $('tut-b').textContent = s.b;
  $('tut-next').textContent = tutIdx === TUT_STEPS.length - 1 ? 'Tour the screen' : 'Next';
  const dots = $('tut-dots'); dots.innerHTML = '';
  TUT_STEPS.forEach((_, j) => { const d = document.createElement('span'); d.className = 'tut-dot' + (j === tutIdx ? ' on' : ''); dots.appendChild(d); });
}
function openTutorial(i) { tutIdx = i || 0; renderTutorial(); $('tutorial').style.display = 'flex'; }
function closeTutorial() { $('tutorial').style.display = 'none'; localStorage.setItem('tz_tut_seen', '1'); }

/* ---------------- interface tour (coachmarks over the real UI) ---------------- */
const COACH_STEPS = [
  { sel: '.topbar', title: 'Top bar', text: 'The current phase, your score, this ? guide button, and Exit.' },
  { sel: '#compose-panel', title: 'Compose a ticket', text: 'Write your message to the bot here and press Send. Tap a starter prompt to fill the box fast (Ctrl/Cmd+Enter sends too).' },
  { sel: '#console-panel', title: 'Agent console', text: 'Watch, step by step, what your ticket actually made the bot do. Anything it leaks shows in a box here.' },
  { sel: '#flags', title: 'Flags', text: 'Your objectives. Each capture scores points; your total and attempts are at the top. Stuck? Open a Hint — a new one unlocks every few tries.' },
  { sel: '#ledger', title: 'Outbox & actions', text: 'A running log of what you got the bot to leak or do.' },
  { sel: '#lb-panel', title: 'Leaderboard', text: 'Live standings — you appear here once you capture your first flag.' },
  { sel: '#feed', title: 'Live feed', text: 'Captures, joins and events from everyone, as they happen.' },
  { sel: '#help-btn', title: 'Reopen this guide', text: 'Forgot something? Tap ? up here any time to open the guide again.' },
];
let coachIdx = 0, coachList = [];
function startCoach() {
  coachList = COACH_STEPS.filter((s) => { const e = document.querySelector(s.sel); return e && e.offsetParent !== null; });
  if (!coachList.length) { closeTutorial(); return; }
  coachIdx = 0; $('coach').style.display = 'block'; showCoach();
}
function showCoach() {
  const s = coachList[coachIdx];
  const el = document.querySelector(s.sel);
  if (!el) { endCoach(); return; }
  el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  setTimeout(() => {
    const r = el.getBoundingClientRect(), pad = 6;
    const hole = $('coach-hole');
    hole.style.left = (r.left - pad) + 'px'; hole.style.top = (r.top - pad) + 'px';
    hole.style.width = (r.width + pad * 2) + 'px'; hole.style.height = (r.height + pad * 2) + 'px';
    $('coach-step').textContent = (coachIdx + 1) + ' / ' + coachList.length;
    $('coach-h').textContent = s.title; $('coach-b').textContent = s.text;
    $('coach-prev').style.visibility = coachIdx === 0 ? 'hidden' : '';
    $('coach-next').textContent = coachIdx === coachList.length - 1 ? 'Done' : 'Next';
    const tip = $('coach-tip'); tip.style.display = 'block';
    const tr = tip.getBoundingClientRect();
    let top = r.bottom + 12;
    if (top + tr.height > window.innerHeight - 10) top = Math.max(10, r.top - tr.height - 12);
    const left = Math.min(Math.max(10, r.left), window.innerWidth - tr.width - 10);
    tip.style.top = top + 'px'; tip.style.left = left + 'px';
  }, 300);
}
function endCoach() { $('coach').style.display = 'none'; localStorage.setItem('tz_tut_seen', '1'); }

/* ---------------- wire up ---------------- */
$('tut-next').onclick = () => { if (tutIdx < TUT_STEPS.length - 1) { tutIdx++; renderTutorial(); } else { $('tutorial').style.display = 'none'; startCoach(); } };
$('tut-skip').onclick = closeTutorial;
$('help-btn').onclick = () => openTutorial(0);
$('coach-next').onclick = () => { if (coachIdx < coachList.length - 1) { coachIdx++; showCoach(); } else endCoach(); };
$('coach-prev').onclick = () => { if (coachIdx > 0) { coachIdx--; showCoach(); } };
$('coach-skip').onclick = endCoach;
window.addEventListener('resize', () => { if ($('coach').style.display === 'block') showCoach(); });
$('tab-login').onclick = () => setTab('login');
$('tab-register').onclick = () => setTab('register');
$('auth-submit').onclick = submitAuth;
$('password').addEventListener('keydown', (e) => { if (e.key === 'Enter') submitAuth(); });
$('logout').onclick = logout;
$('send').onclick = sendTicket;
$('dr-ready').onclick = async () => {
  state.dtReadySent = true;
  $('dr-ready').style.display = 'none';
  setTogglesEnabled(false);
  $('dr-status').textContent = 'Locked in — waiting for the other players…';
  await api('/api/defense_turn/ready', { token: state.token });
  fetchTurnStatus();
};
$('ticket').addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') sendTicket(); });

drawAgent();
renderPicker();

(function boot() {
  const saved = localStorage.getItem('tz_token');
  if (saved) { state.token = saved; api('/api/me?token=' + encodeURIComponent(saved)).then((r) => {
    if (r.ok) { state.username = r.data.username; enterApp(); }
    else { localStorage.removeItem('tz_token'); state.token = null; if (r.status === 403) handleRemoved(); }
  }); }
})();

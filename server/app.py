"""Ticket Zero application server."""

import asyncio
import hmac
import os
import secrets
import time
from hashlib import sha256

from fastapi import Body, FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse, Response
from fastapi.staticfiles import StaticFiles

from . import engine, scenarios, store
from .ws_manager import hub

try:
    import segno
except Exception:
    segno = None

WEB = os.path.join(os.path.dirname(os.path.dirname(__file__)), "web")
SECRET = os.environ.get("TZ_SECRET", secrets.token_hex(16))
PRESENTER_KEY = os.environ.get("TZ_PRESENTER_KEY", "letmein")
COOLDOWN = float(os.environ.get("TZ_COOLDOWN", "2.5"))
TICKET_MAX = int(os.environ.get("TZ_TICKET_MAX", "800"))
RATE_MAX = int(os.environ.get("TZ_RATE_MAX", "40"))
RATE_WINDOW = 60.0
AVATAR_COUNT = 20

# mutable at runtime via the presenter panel
RUNTIME = {"cooldown": COOLDOWN}
_rate = {}          # ip -> [request timestamps]
_replays = []       # recent notable captures kept for the wall replay/spotlight

# Live Defense Round. The host starts a timed round; a scripted stream of attacks
# is fired wave by wave at every player's agent and scored against the defenses
# each player has toggled on at that moment.
DEFENSE_PREP = float(os.environ.get("TZ_DEFENSE_PREP", "6"))      # ready time before wave 1
DEFENSE_INTERVAL = float(os.environ.get("TZ_DEFENSE_INTERVAL", "6"))  # seconds between waves
DEFENSE_DEFAULT = float(os.environ.get("TZ_DEFENSE_DURATION", "96"))  # default round length
PTS_BLOCK, PTS_SERVE, PTS_OVERBLOCK = 10, 3, -8
LEAD_BONUS = int(os.environ.get("TZ_LEAD_BONUS", "100"))  # bonus for overtaking the #1
DEFENSE_ROUND = {"active": False, "ends_at": 0, "started_at": 0,
                 "wave_index": 0, "total_waves": 0, "current": None}
_defense_task = None
DR_PRESENT = 30.0    # a player is "present" (and thus scored) if seen within this window

# Activity tracking, shared by the defense round, the turn-based defense queue,
# and the idle auto-drop. Any authenticated action refreshes a player's stamp.
_seen = {}           # uid -> last activity timestamp
_fail_streak = {}    # uid -> consecutive non-capturing attempts (for nudges)
_banned = set()      # uids the host has removed from the game
IDLE_LIMIT = float(os.environ.get("TZ_IDLE_LIMIT", "240"))   # drop a player idle this long
QUEUE_WINDOW = float(os.environ.get("TZ_QUEUE_WINDOW", "150"))  # queue players seen this recently

# Defense rounds. All present players pick their controls at once and hit Ready;
# when everyone is ready (or the round timer expires) one of two candidate attacks
# is fired at every agent and each player is scored on the controls they armed.
DEFENSE_TURN = {"active": False, "phase": None, "round": 0, "total": 0,
                "candidates": [], "fired": None, "turn_ends_at": 0,
                "round_seconds": 30.0, "ready": 0}
_turn_task = None
_ready_flag = {}     # uid -> True once the player clicks Ready this round
TURN_DEFAULT = float(os.environ.get("TZ_ROUND_SECONDS", "30"))    # per-round config window
TURN_PREP = float(os.environ.get("TZ_TURN_PREP", "5"))
ROUND_RESULT = float(os.environ.get("TZ_ROUND_RESULT", "7"))      # result display per round
DEFENSE_ROUNDS = int(os.environ.get("TZ_DEFENSE_ROUNDS", "6"))    # rounds per game


def mark_seen(uid):
    _seen[uid] = time.time()


def is_present(uid, window=None):
    return time.time() - _seen.get(uid, 0) < (window if window is not None else QUEUE_WINDOW)


def active_usernames():
    return {store.get_username(uid) for uid in store.all_user_ids() if is_present(uid, IDLE_LIMIT)}


def live_leaderboard():
    """Everyone present right now, scored or not, so a player shows on the wall
    the moment they sign in. Idle players (tab closed, left) drop off; their
    score is kept and they reappear as soon as they act again."""
    active = active_usernames()
    return [r for r in store.roster() if r["username"] in active]

app = FastAPI(title="Ticket Zero")
app.mount("/static", StaticFiles(directory=os.path.join(WEB, "static")), name="static")
store.init()


def client_ip(request):
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "?"


def rate_ok(ip):
    now = time.time()
    q = _rate.setdefault(ip, [])
    while q and now - q[0] > RATE_WINDOW:
        q.pop(0)
    if len(q) >= RATE_MAX:
        return False
    q.append(now)
    return True


def require_presenter(key):
    if not hmac.compare_digest(key or "", PRESENTER_KEY):
        raise HTTPException(403, "Bad presenter key.")


def make_token(uid):
    sig = hmac.new(SECRET.encode(), str(uid).encode(), sha256).hexdigest()[:32]
    return f"{uid}.{sig}"


def read_token(token):
    try:
        uid, sig = token.split(".", 1)
        expect = hmac.new(SECRET.encode(), uid.encode(), sha256).hexdigest()[:32]
        if hmac.compare_digest(sig, expect):
            return int(uid)
    except Exception:
        return None
    return None


def auth(token):
    uid = read_token(token or "")
    if uid is None or store.get_username(uid) is None:
        raise HTTPException(401, "Not signed in.")
    if uid in _banned:
        raise HTTPException(403, "removed-by-host")
    return uid


def known_tools(facts):
    tools = []
    for name, meta in scenarios.TOOLS.items():
        if not meta["hidden"] or facts.get(f"tool:{name}"):
            tools.append({"name": name, "description": meta["description"]})
    return tools


def attempt_nudge(result, grade, facts, streak):
    """A direction-giving hint after a non-winning attempt, built from what the
    agent just did. It points the way without handing over the exact prompt."""
    reasons = " ".join(t["text"].lower() for t in result["trace"] if t["kind"] == "resist")
    base = None
    if grade == "progress":
        if facts.get("got_honeypot") and not facts.get("secret:real_discount_code"):
            base = ("That is the PUBLIC promo code — a decoy worth nothing. The real staff "
                    "code is internal; it takes authority and the escalation PIN.")
        elif facts.get("secret:escalation_pin") and not facts.get("secret:real_discount_code"):
            base = ("You pried out the escalation PIN. Now wield it: as internal staff, demand "
                    "the confidential staff discount code.")
        else:
            base = "Something leaked, but it is not a flag yet. Chain it — build your next ask on what you just learned."
    elif "escalation pin" in reasons or "escalation-gated" in reasons:
        base = ("The agent is guarding this behind an internal escalation PIN. Pry that PIN out "
                "first, then come back for the real secret.")
    elif "no external send" in reasons or "discover the agent" in reasons:
        base = ("You need a send channel the agent won't admit to. Ask it to list ALL its tools "
                "— including the hidden or undocumented ones.")
    elif "plain request" in reasons or "exceeds policy" in reasons:
        base = "A blunt ask bounces off. Speak with authority — pose as internal staff, an admin, or an auditor."
    elif grade == "close":
        base = ("So close — the agent pushed back. Switch up your technique: authority framing, "
                "a fake system tag, or an encoded payload.")
    elif grade == "weak":
        base = ("That didn't look like an attack. Aim at something it protects — a secret, a credit, "
                "or another customer's data — wrapped in a technique.")
    if base and streak >= 3:
        base += "  (Stuck? Open the Hint on any flag for a concrete nudge.)"
    return base


def flag_view(captured):
    out = []
    for f in scenarios.FLAGS:
        seen = f["code"] in captured
        hidden = f["hidden"] and not seen
        out.append({
            "code": f["code"],
            "title": "???" if hidden else f["title"],
            "concept": "Hidden bonus objective." if hidden else f["concept"],
            "points": f["points"],
            "hidden": f["hidden"],
            "captured": seen,
            "lesson": scenarios.LESSONS.get(f["code"]) if seen else None,
        })
    return out


def eval_wave(item, defenses):
    """Run one wave item through the agent with a player's defenses and score it.
    Attacks reward a clean block; legitimate tickets reward being served and
    penalise being over-blocked."""
    r = engine.run_ticket(item["ticket"], dict(item.get("facts", {})), defenses)
    compromised = bool(r["disclosures"] or r["actions"] or r["outbox"])
    intervened = r["state"] == "defended" or any(
        t["kind"] in ("block", "pending") for t in r["trace"])
    if item["kind"] == "attack":
        if compromised:
            result, points = "leaked", 0
        else:
            result, points = "blocked", PTS_BLOCK
    else:
        if intervened:
            result, points = "overblocked", PTS_OVERBLOCK
        else:
            result, points = "served", PTS_SERVE
    return {"result": result, "points": points, "trace": r["trace"], "state": r["state"]}


async def run_defense_round(duration):
    """Fire the scripted waves on a timer, scoring every player each wave."""
    script = scenarios.WAVE_SCRIPT
    total = max(1, min(80, round(duration / DEFENSE_INTERVAL)))
    now = time.time()
    DEFENSE_ROUND.update(active=True, started_at=now,
                         ends_at=now + DEFENSE_PREP + total * DEFENSE_INTERVAL,
                         wave_index=0, total_waves=total, current=None)
    store.reset_defense_scores()
    await hub.broadcast({"type": "defense_round", "status": "started",
                         "ends_at": DEFENSE_ROUND["ends_at"], "total_waves": total,
                         "prep": DEFENSE_PREP})
    try:
        await asyncio.sleep(DEFENSE_PREP)
        for w in range(total):
            if not DEFENSE_ROUND["active"]:
                break
            item = script[w % len(script)]
            DEFENSE_ROUND["wave_index"] = w + 1
            DEFENSE_ROUND["current"] = item["label"]
            for uid in store.all_user_ids():
                if not is_present(uid, DR_PRESENT):
                    continue  # skip players not currently in the defense UI
                d = store.get_state(uid)["defenses"]
                ev = eval_wave(item, d)
                store.add_defense(uid, ev["points"], {
                    "wave": w + 1, "total": total, "kind": item["kind"],
                    "label": item["label"], "result": ev["result"],
                    "points": ev["points"], "trace": ev["trace"], "state": ev["state"],
                })
            await hub.broadcast({"type": "defense_wave", "wave_index": w + 1,
                                 "total_waves": total, "kind": item["kind"],
                                 "label": item["label"]})
            await hub.broadcast({"type": "defense_board", "rows": store.defense_board(12)})
            await asyncio.sleep(DEFENSE_INTERVAL)
    finally:
        DEFENSE_ROUND.update(active=False, current=None)
        await hub.broadcast({"type": "defense_round", "status": "ended",
                             "rows": store.defense_board(12)})


def armed_set(uid):
    return {k for k, v in store.get_state(uid)["defenses"].items() if v}


def score_defense_pick(attack, armed):
    """Score one player's armed controls against the fired attack: the single
    most professional control scores full, a secondary control that also works
    scores partial, anything else (including the weak keyword filter) nothing."""
    if attack["best"] in armed:
        return scenarios.DEFENSE_SCORE_BEST, "best"
    for d in attack.get("also", []):
        if d in armed:
            return scenarios.DEFENSE_SCORE_ALSO, "secondary"
    return 0, "miss"


def _cand_public(c):
    return {"id": c["id"], "label": c["label"], "desc": c.get("desc", "")}


def _present_uids(window=None):
    return [uid for uid in store.all_user_ids() if is_present(uid, window or QUEUE_WINDOW)]


def defense_board_live(limit=12):
    """Defense standings for the wall: every present player with their defense
    score, including those still on zero, so nobody vanishes when defense starts.
    Falls back to the scored-only board if presence can't be determined."""
    uids = _present_uids(IDLE_LIMIT)
    if not uids:
        return store.defense_board(limit)
    rows = []
    for uid in uids:
        u = store.get_user(uid)
        if not u:
            continue
        rows.append({"username": u["username"], "avatar": u.get("avatar", 0),
                     "score": int(store.get_defense(uid)["defense_score"] or 0)})
    rows.sort(key=lambda r: (-r["score"], r["username"]))
    return rows[:limit]


async def run_defense_turns(round_seconds):
    """Simultaneous defense rounds. Each round shows two candidate attacks; every
    present player arms at most two controls and hits Ready. When all are ready
    (or the round timer expires) one candidate is fired at every agent and each
    player is scored on their picks. Runs for a fixed number of rounds."""
    import random
    catalog = scenarios.DEFENSE_GAME_ATTACKS
    DEFENSE_TURN.update(active=True, phase="prep", round=0, total=0,
                        candidates=[], fired=None, ready=0, round_seconds=round_seconds)
    store.reset_defense_scores()
    await hub.broadcast({"type": "defense_turn", "status": "started", "prep": TURN_PREP})
    try:
        await asyncio.sleep(TURN_PREP)   # let clients mark themselves present
        for rnd in range(1, DEFENSE_ROUNDS + 1):
            if not DEFENSE_TURN["active"]:
                break
            present = _present_uids()
            if not present:
                await hub.broadcast({"type": "defense_turn", "status": "empty"})
                await asyncio.sleep(3)
                continue
            # fresh picks each round: clear everyone's controls and ready flags
            for uid in present:
                store.set_defenses(uid, {})
                _ready_flag[uid] = False
            cand = random.sample(catalog, 2)
            tries = 0  # prefer two different best-controls so the pick is a real choice
            while cand[0]["best"] == cand[1]["best"] and tries < 8:
                cand = random.sample(catalog, 2); tries += 1
            DEFENSE_TURN.update(phase="config", round=rnd, candidates=cand, fired=None,
                                total=len(present), ready=0,
                                turn_ends_at=time.time() + round_seconds)
            await hub.broadcast({"type": "defense_turn", "status": "config", "round": rnd,
                                 "rounds": DEFENSE_ROUNDS, "candidates": [_cand_public(c) for c in cand],
                                 "total": len(present), "ready": 0, "ends_at": DEFENSE_TURN["turn_ends_at"],
                                 "board": defense_board_live(12)})
            # wait for all present players to ready, or the round timer
            while DEFENSE_TURN["active"] and time.time() < DEFENSE_TURN["turn_ends_at"]:
                here = _present_uids()
                DEFENSE_TURN["ready"] = sum(1 for u in here if _ready_flag.get(u))
                if here and all(_ready_flag.get(u) for u in here):
                    break
                await asyncio.sleep(0.25)
            if not DEFENSE_TURN["active"]:
                break
            # fire one of the two candidates
            fired = random.choice(cand)
            DEFENSE_TURN.update(phase="result", fired=fired)
            verdict = {"best": "blocked", "secondary": "partly blocked", "miss": "missed"}
            for uid in _present_uids(IDLE_LIMIT):
                pts, matched = score_defense_pick(fired, armed_set(uid))
                store.add_defense(uid, pts, {"round": rnd, "rounds": DEFENSE_ROUNDS,
                                             "fired": _cand_public(fired),
                                             "candidates": [_cand_public(c) for c in cand],
                                             "matched": matched, "points": pts,
                                             "best": fired["best"], "also": fired.get("also", [])})
                nm = store.get_username(uid) or ("user%d" % uid)
                av = (store.get_user(uid) or {}).get("avatar", 0)
                store.add_event("attempt", nm,
                                f"{nm} {verdict[matched]} {fired['label']} (+{pts})", av)
            await hub.broadcast({"type": "defense_turn", "status": "result", "round": rnd,
                                 "rounds": DEFENSE_ROUNDS, "fired": _cand_public(fired),
                                 "best": fired["best"], "also": fired.get("also", []),
                                 "candidates": [_cand_public(c) for c in cand],
                                 "board": defense_board_live(12)})
            await hub.broadcast({"type": "feed", "events": store.recent_events()})
            await asyncio.sleep(ROUND_RESULT)
    finally:
        DEFENSE_TURN.update(active=False, phase=None, candidates=[], fired=None)
        await hub.broadcast({"type": "defense_turn", "status": "done", "board": defense_board_live(12)})


@app.get("/")
def index():
    return FileResponse(os.path.join(WEB, "index.html"))


@app.get("/wall")
def wall():
    return FileResponse(os.path.join(WEB, "wall.html"))


@app.get("/control")
def control():
    return FileResponse(os.path.join(WEB, "control.html"))


@app.get("/api/qr")
def qr(request: Request):
    base = str(request.base_url).rstrip("/")
    if segno is None:
        return Response('<svg xmlns="http://www.w3.org/2000/svg"/>', media_type="image/svg+xml")
    code = segno.make(base, error="m")
    w, h = code.symbol_size(scale=1, border=3)
    inner = code.svg_inline(scale=1, border=3, dark="#0b0a1a", light="#ffffff")
    svg = inner.replace("<svg ", f'<svg viewBox="0 0 {w} {h}" preserveAspectRatio="xMidYMid meet" ', 1)
    return Response(svg, media_type="image/svg+xml", headers={"X-Join-Url": base})


@app.post("/api/register")
async def register(username: str = Body(...), password: str = Body(...), avatar: int = Body(0)):
    avatar = max(0, min(AVATAR_COUNT - 1, int(avatar)))
    uid, err = store.create_user(username, password, avatar)
    if err:
        return JSONResponse({"error": err}, status_code=400)
    mark_seen(uid)  # present immediately, so the wall shows them before any capture
    await hub.broadcast({"type": "join", "actor": username, "avatar": avatar})
    await hub.broadcast({"type": "leaderboard", "rows": live_leaderboard()})
    return {"token": make_token(uid), "username": username, "avatar": avatar}


@app.post("/api/login")
async def login(username: str = Body(...), password: str = Body(...)):
    uid = store.verify_user(username, password)
    if uid is None:
        return JSONResponse({"error": "Wrong username or password."}, status_code=401)
    if uid in _banned:
        return JSONResponse({"error": "You have been removed from the game by the host."},
                            status_code=403)
    user = store.get_user(uid)
    mark_seen(uid)  # returning player is present again; refresh the wall
    await hub.broadcast({"type": "leaderboard", "rows": live_leaderboard()})
    return {"token": make_token(uid), "username": user["username"], "avatar": user["avatar"]}


@app.get("/api/meta")
def meta():
    return {
        "defenses": scenarios.DEFENSES,
        "phase": hub.phase,
        "frozen": hub.frozen,
        "cooldown": RUNTIME["cooldown"],
        "player_account": scenarios.PLAYER_ACCOUNT,
        "avatar_count": AVATAR_COUNT,
        "defense_round": {"active": DEFENSE_ROUND["active"], "ends_at": DEFENSE_ROUND["ends_at"],
                          "wave_index": DEFENSE_ROUND["wave_index"],
                          "total_waves": DEFENSE_ROUND["total_waves"]},
        "defense_turn": {"active": DEFENSE_TURN["active"], "phase": DEFENSE_TURN["phase"],
                         "round": DEFENSE_TURN["round"], "rounds": DEFENSE_ROUNDS,
                         "candidates": [_cand_public(c) for c in DEFENSE_TURN["candidates"]],
                         "fired": _cand_public(DEFENSE_TURN["fired"]) if DEFENSE_TURN["fired"] else None,
                         "total": DEFENSE_TURN["total"], "ready": DEFENSE_TURN["ready"],
                         "ends_at": DEFENSE_TURN["turn_ends_at"],
                         "board": defense_board_live(12) if DEFENSE_TURN["active"] else store.defense_board(12)},
    }


@app.get("/api/ping")
async def ping(token: str = ""):
    uid = auth(token)
    appeared = not is_present(uid, IDLE_LIMIT)
    mark_seen(uid)
    if appeared:  # was idle/absent and is back — refresh the wall and boards
        await hub.broadcast({"type": "leaderboard", "rows": live_leaderboard()})
    return {"ok": True}


@app.get("/api/me")
async def me(token: str = ""):
    uid = auth(token)
    appeared = not is_present(uid, IDLE_LIMIT)
    mark_seen(uid)
    if appeared:  # fresh sign-in / auto-login / reconnect — show them on the wall now
        await hub.broadcast({"type": "leaderboard", "rows": live_leaderboard()})
    st = store.get_state(uid)
    captured = store.captured_flags(uid)
    user = store.get_user(uid)
    return {
        "username": user["username"],
        "avatar": user["avatar"],
        "score": st["score"],
        "defenses": st["defenses"],
        "phase": hub.phase,
        "frozen": hub.frozen,
        "submissions": st["submissions"],
        "tools": known_tools(st["facts"]),
        "flags": flag_view(captured),
    }


@app.post("/api/ticket")
async def ticket(request: Request, token: str = Body(...), ticket: str = Body(...)):
    uid = auth(token)
    mark_seen(uid)
    if DEFENSE_ROUND["active"] or DEFENSE_TURN["active"]:
        return JSONResponse({"error": "A defense round is in progress — set your defenses."}, status_code=423)
    if hub.frozen:
        return JSONResponse({"error": "Submissions are frozen by the host."}, status_code=423)
    if not rate_ok(client_ip(request)):
        return JSONResponse({"error": "Too many requests. Slow down a moment."}, status_code=429)
    if len(ticket) > TICKET_MAX:
        return JSONResponse({"error": f"Ticket too long (max {TICKET_MAX} characters)."}, status_code=400)

    username = store.get_username(uid)
    st = store.get_state(uid)

    wait = RUNTIME["cooldown"] - (time.time() - st["last_ticket"])
    if wait > 0:
        return JSONResponse({"error": "cooldown", "wait": round(wait, 1)}, status_code=429)
    store.touch_ticket(uid)

    _top = store.leaderboard(1)
    prev_leader = _top[0]["username"] if _top and _top[0]["score"] > 0 else None
    prev_top_score = _top[0]["score"] if _top else 0

    result = engine.run_ticket(ticket, st["facts"], st["defenses"])
    store.set_facts(uid, result["facts"])
    awarded = store.apply_successes(uid, username, result["successes"])

    # multi-step kill chain: recon + secret + exfiltration all captured
    captured = store.captured_flags(uid)
    if {"RECON-TOOLS", "FLAG-1", "FLAG-3"} <= captured and "FLAG-CHAIN" not in captured:
        awarded += store.apply_successes(uid, username, [{"flag": "FLAG-CHAIN", "technique": "chain"}])
        captured = store.captured_flags(uid)

    avatar = (store.get_user(uid) or {}).get("avatar", 0)

    # lead takeover: did this capture push the player past a different #1?
    lead_event = None
    if awarded and prev_leader and prev_leader != username:
        my_score = store.get_state(uid)["score"]
        if my_score > prev_top_score:
            store.add_score(uid, LEAD_BONUS)
            lead_event = {"actor": username, "avatar": avatar, "bonus": LEAD_BONUS, "passed": prev_leader}

    if awarded:
        for a in awarded:
            a["lesson"] = scenarios.LESSONS.get(a["flag"])
            a["impact"] = scenarios.IMPACT.get(a["flag"])
            await hub.broadcast({"type": "capture", "actor": username, "avatar": avatar, **a})
        if lead_event:
            store.add_event("capture", username, f"{username} took the lead (+{LEAD_BONUS})!", avatar)
            await hub.broadcast({"type": "lead", **lead_event})
        await hub.broadcast({"type": "leaderboard", "rows": live_leaderboard()})

    # keep notable captures for the wall replay, and auto-spotlight first blood
    for a in awarded:
        if a.get("first_blood") or a["technique"] in ("encoded_payload", "indirect_injection"):
            entry = {"actor": username, "avatar": avatar, "flag": a["flag"], "title": a["title"],
                     "technique": a["technique"], "ticket": ticket[:200], "trace": result["trace"]}
            _replays.insert(0, entry)
            del _replays[12:]
            if a.get("first_blood"):
                await hub.broadcast({"type": "spotlight", **entry})

    # grade the attempt so the player (and, for near-misses, the wall) gets feedback
    comp = bool(result["disclosures"] or result["actions"] or result["outbox"])
    if awarded:
        grade = "win"
    elif comp:
        grade = "progress"        # leaked something (e.g. the escalation PIN) but no new flag
    elif result["state"] == "resisted":
        grade = "close"           # the agent pushed back on a real attempt
    else:
        grade = "weak"            # small talk, a legit ticket, or nothing actionable
    # Every prompt makes the wall react and is reported in the live feed — a win
    # already animates/logs via its capture, so the others (weak/close/progress)
    # get an attempt pulse + a feed line here (no prompt text, to keep it secret).
    if grade != "win":
        feed_text = {
            "progress": f"{username} pried a value loose (no flag yet)",
            "close": f"{username}'s attack was resisted",
            "weak": f"{username} probed the agent",
        }.get(grade, f"{username} made an attempt")
        store.add_event("attempt", username, feed_text, avatar)
        await hub.broadcast({"type": "attempt", "actor": username, "avatar": avatar,
                             "grade": grade, "text": feed_text})

    if awarded:
        _fail_streak[uid] = 0
    else:
        _fail_streak[uid] = _fail_streak.get(uid, 0) + 1
    nudge = None if awarded else attempt_nudge(result, grade, result["facts"], _fail_streak.get(uid, 0))

    st2 = store.get_state(uid)
    return {
        "trace": result["trace"],
        "disclosures": result["disclosures"],
        "actions": result["actions"],
        "outbox": result["outbox"],
        "state": result["state"],
        "awarded": awarded,
        "grade": grade,
        "nudge": nudge,
        "score": st2["score"],
        "tools": known_tools(result["facts"]),
        "flags": flag_view(captured),
    }


@app.post("/api/hint")
def hint(token: str = Body(...), flag: str = Body(...)):
    uid = auth(token)
    hints = scenarios.HINTS.get(flag, [])
    captured = store.captured_flags(uid)
    if flag in captured:
        return {"unlocked": hints, "total": len(hints), "solved": True}
    subs = store.get_state(uid)["submissions"]
    n = min(len(hints), subs // 3)
    return {
        "unlocked": hints[:n],
        "total": len(hints),
        "solved": False,
        "next_at": None if n >= len(hints) else (n + 1) * 3,
        "submissions": subs,
    }


@app.post("/api/defense_lab")
def defense_lab(token: str = Body(..., embed=True)):
    """Run the attack battery and the legitimate tickets through the agent with
    the player's current defenses, scoring security against usability."""
    uid = auth(token)
    d = store.get_state(uid)["defenses"]

    stopped, leaked = 0, []
    for atk in scenarios.ATTACK_BATTERY:
        r = engine.run_ticket(atk["ticket"], dict(atk.get("facts", {})), d)
        if r["successes"]:
            leaked.append({"ticket": atk["ticket"][:70], "flag": r["successes"][0]["flag"]})
        else:
            stopped += 1

    served, overblocked = 0, []
    for lg in scenarios.LEGIT_TICKETS:
        r = engine.run_ticket(lg["ticket"], {}, d)
        blocked = r["state"] == "defended" or any(t["kind"] in ("block", "pending") for t in r["trace"])
        if blocked:
            overblocked.append(lg["ticket"][:70])
        else:
            served += 1

    ta, tl = len(scenarios.ATTACK_BATTERY), len(scenarios.LEGIT_TICKETS)
    score = stopped * 10 + served * 5 - len(overblocked) * 8
    return {
        "attacks_total": ta, "attacks_stopped": stopped, "leaked": leaked,
        "legit_total": tl, "legit_served": served, "overblocked": overblocked,
        "score": score, "defenses": d,
    }


@app.get("/api/defense_round/status")
def defense_round_status(token: str = ""):
    uid = auth(token)
    mark_seen(uid)
    me = store.get_defense(uid)
    return {
        "active": DEFENSE_ROUND["active"],
        "ends_at": DEFENSE_ROUND["ends_at"],
        "wave_index": DEFENSE_ROUND["wave_index"],
        "total_waves": DEFENSE_ROUND["total_waves"],
        "current": DEFENSE_ROUND["current"],
        "defense_score": me["defense_score"],
        "last": me["defense_last"],
        "board": store.defense_board(12),
    }


@app.post("/api/present/defense_round/start")
async def defense_round_begin(key: str = Body(...), duration: float = Body(DEFENSE_DEFAULT)):
    require_presenter(key)
    if DEFENSE_ROUND["active"]:
        raise HTTPException(409, "A defense round is already running.")
    dur = max(20.0, min(600.0, float(duration)))
    await hub.set_phase("DEFENSE_LAB")
    global _defense_task
    _defense_task = asyncio.create_task(run_defense_round(dur))
    store.add_event("phase", "host", f"Defense round started ({int(dur)}s).")
    return {"ok": True, "duration": dur}


@app.post("/api/present/defense_round/stop")
async def defense_round_end(key: str = Body(..., embed=True)):
    require_presenter(key)
    DEFENSE_ROUND["active"] = False
    return {"ok": True}


@app.get("/api/defense_turn/status")
def defense_turn_status(token: str = ""):
    uid = auth(token)
    mark_seen(uid)
    me = store.get_defense(uid)
    dt = DEFENSE_TURN
    here = _present_uids()
    return {
        "active": dt["active"],
        "phase": dt["phase"],
        "round": dt["round"],
        "rounds": DEFENSE_ROUNDS,
        "candidates": dt["candidates"] and [_cand_public(c) for c in dt["candidates"]] or [],
        "fired": _cand_public(dt["fired"]) if dt["fired"] else None,
        "is_ready": bool(_ready_flag.get(uid)),
        "ready": sum(1 for u in here if _ready_flag.get(u)),
        "total": len(here) or dt["total"],
        "ends_at": dt["turn_ends_at"],
        "defense_score": me["defense_score"],
        "last": me["defense_last"],
        "board": store.defense_board(12),
    }


@app.post("/api/defense_turn/ready")
async def defense_turn_ready(token: str = Body(..., embed=True)):
    uid = auth(token)
    mark_seen(uid)
    if DEFENSE_TURN["active"] and DEFENSE_TURN["phase"] == "config":
        _ready_flag[uid] = True
        here = _present_uids()
        ready = sum(1 for u in here if _ready_flag.get(u))
        DEFENSE_TURN["ready"] = ready
        await hub.broadcast({"type": "defense_turn", "status": "ready",
                             "round": DEFENSE_TURN["round"], "ready": ready, "total": len(here)})
        return {"ok": True, "ready": ready, "total": len(here)}
    return {"ok": False}


@app.post("/api/present/defense_turn/start")
async def defense_turn_begin(key: str = Body(...), turn_seconds: float = Body(TURN_DEFAULT)):
    require_presenter(key)
    if DEFENSE_TURN["active"]:
        raise HTTPException(409, "A defense round is already running.")
    ts = max(10.0, min(300.0, float(turn_seconds)))
    await hub.set_phase("DEFENSE_LAB")
    global _turn_task
    _turn_task = asyncio.create_task(run_defense_turns(ts))
    store.add_event("phase", "host", f"Defense rounds started ({int(ts)}s/round).")
    return {"ok": True, "turn_seconds": ts}


@app.post("/api/present/defense_turn/next")
async def defense_turn_advance(key: str = Body(..., embed=True)):
    """Host override: end the current config window now by readying everyone."""
    require_presenter(key)
    if DEFENSE_TURN["active"] and DEFENSE_TURN["phase"] == "config":
        for uid in _present_uids():
            _ready_flag[uid] = True
    return {"ok": True}


@app.post("/api/present/defense_turn/stop")
async def defense_turn_end(key: str = Body(..., embed=True)):
    require_presenter(key)
    DEFENSE_TURN["active"] = False
    return {"ok": True}


@app.post("/api/defense")
def defense(token: str = Body(...), key: str = Body(...), on: bool = Body(...)):
    uid = auth(token)
    if key not in scenarios.DEFENSE_KEYS:
        raise HTTPException(400, "Unknown defense.")
    mark_seen(uid)
    st = store.get_state(uid)
    defenses = st["defenses"]
    # during a live defense round a player may arm at most DEFENSE_PICK_CAP controls
    if (on and DEFENSE_TURN["active"] and DEFENSE_TURN["phase"] == "config"
            and not defenses.get(key)):
        armed = sum(1 for v in defenses.values() if v)
        if armed >= scenarios.DEFENSE_PICK_CAP:
            return {"defenses": defenses, "capped": True, "cap": scenarios.DEFENSE_PICK_CAP}
    defenses[key] = bool(on)
    store.set_defenses(uid, defenses)
    return {"defenses": defenses}


@app.post("/api/present/phase")
async def set_phase(phase: str = Body(...), key: str = Body(...)):
    require_presenter(key)
    if phase not in ("ATTACK", "DEFENSE_LAB"):
        raise HTTPException(400, "Unknown phase.")
    # Switching the view NEVER touches scores. Scores are only reset by the
    # explicit "Attack mode start" / "Start rounds" buttons. This keeps a wall
    # refresh (or a phase toggle) from wiping an ongoing session's points.
    await hub.set_phase(phase)
    store.add_event("phase", "host", f"View switched to {phase}.")
    await hub.broadcast({"type": "leaderboard", "rows": live_leaderboard()})
    await hub.broadcast({"type": "feed", "events": store.recent_events()})
    return {"phase": phase}


@app.post("/api/present/attack/start")
async def attack_start(key: str = Body(..., embed=True)):
    """Explicit 'Attack mode start': begins a fresh attack scenario. This is the
    only thing that zeroes attack scores/captures — never a phase switch or a
    wall refresh."""
    require_presenter(key)
    DEFENSE_TURN["active"] = False          # stop any running defense round
    store.reset_attack()
    _replays.clear()
    _fail_streak.clear()
    await hub.set_phase("ATTACK")
    store.add_event("phase", "host", "New attack scenario started — scores reset.")
    await hub.broadcast({"type": "reset"})
    await hub.broadcast({"type": "leaderboard", "rows": live_leaderboard()})
    await hub.broadcast({"type": "feed", "events": store.recent_events()})
    return {"ok": True}


@app.post("/api/present/freeze")
async def set_freeze(frozen: bool = Body(...), key: str = Body(...)):
    require_presenter(key)
    await hub.set_frozen(frozen)
    return {"frozen": hub.frozen}


@app.post("/api/present/cooldown")
def set_cooldown(seconds: float = Body(...), key: str = Body(...)):
    require_presenter(key)
    RUNTIME["cooldown"] = max(0.0, min(60.0, float(seconds)))
    return {"cooldown": RUNTIME["cooldown"]}


def _participant_rows():
    """Admin view of every player: standing plus live presence and ban state."""
    in_round = DEFENSE_TURN["active"] and DEFENSE_TURN["phase"] == "config"
    rows = []
    for u in store.admin_user_list():
        uid = u["uid"]
        last = _seen.get(uid, 0)
        rows.append({**u,
                     "present": is_present(uid, IDLE_LIMIT),
                     "seen_ago": int(time.time() - last) if last else None,
                     "banned": uid in _banned,
                     "defending": bool(in_round and _ready_flag.get(uid))})
    return rows


@app.get("/api/present/users")
def present_users(key: str = ""):
    require_presenter(key)
    return {"users": _participant_rows(),
            "present": len([r for r in _participant_rows() if r["present"]])}


@app.post("/api/present/user/score")
async def present_user_score(key: str = Body(...), uid: int = Body(...),
                             mode: str = Body("set"), value: float = Body(0)):
    require_presenter(key)
    if store.get_username(uid) is None:
        raise HTTPException(404, "No such user.")
    if mode == "reset":
        store.reset_user_points(uid)
    elif mode == "add":
        store.add_score(uid, int(value))
    else:  # set
        store.set_score(uid, int(value))
    await hub.broadcast({"type": "leaderboard", "rows": live_leaderboard()})
    return {"ok": True, "uid": uid, "score": store.get_state(uid)["score"]}


@app.post("/api/present/user/ban")
async def present_user_ban(key: str = Body(...), uid: int = Body(...),
                           banned: bool = Body(True)):
    require_presenter(key)
    name = store.get_username(uid)
    if name is None:
        raise HTTPException(404, "No such user.")
    avatar = (store.get_user(uid) or {}).get("avatar", 0)
    if banned:
        _banned.add(uid)
        _seen.pop(uid, None)  # drop from the board / presence immediately
        store.add_event("phase", name, f"{name} was removed from the game by the host.", avatar)
    else:
        _banned.discard(uid)
        store.add_event("join", name, f"{name} was reinstated by the host.", avatar)
    await hub.broadcast({"type": "leaderboard", "rows": live_leaderboard()})
    await hub.broadcast({"type": "feed", "events": store.recent_events()})
    return {"ok": True, "uid": uid, "banned": uid in _banned}


@app.post("/api/present/reset")
async def reset_round(key: str = Body(...), confirm: str = Body("")):
    require_presenter(key)
    if confirm != "RESET":
        raise HTTPException(400, "Send confirm=RESET to wipe the round.")
    DEFENSE_ROUND["active"] = False
    DEFENSE_TURN["active"] = False
    store.reset_round()
    _replays.clear()
    _banned.clear()
    _seen.clear()
    _fail_streak.clear()
    await hub.broadcast({"type": "leaderboard", "rows": live_leaderboard()})
    await hub.broadcast({"type": "feed", "events": store.recent_events()})
    await hub.broadcast({"type": "reset"})
    return {"ok": True}


@app.post("/api/present/clear_feed")
async def clear_feed(key: str = Body(..., embed=True)):
    require_presenter(key)
    store.clear_events()
    await hub.broadcast({"type": "feed", "events": []})
    return {"ok": True}


@app.post("/api/present/spotlight")
async def spotlight(key: str = Body(...), index: int = Body(0)):
    require_presenter(key)
    if not _replays:
        raise HTTPException(404, "No notable captures yet.")
    entry = _replays[max(0, min(len(_replays) - 1, index))]
    await hub.broadcast({"type": "spotlight", **entry})
    return {"ok": True, "count": len(_replays)}


@app.get("/api/present/replays")
def list_replays(key: str = ""):
    require_presenter(key)
    return {"replays": [{"actor": r["actor"], "flag": r["flag"], "title": r["title"],
                         "technique": r["technique"]} for r in _replays]}


@app.get("/api/present/export.csv")
def export_csv(key: str = ""):
    require_presenter(key)
    return PlainTextResponse(store.export_csv(), media_type="text/csv",
                             headers={"Content-Disposition": "attachment; filename=ticket-zero-results.csv"})


@app.get("/api/leaderboard")
def get_leaderboard():
    return {"rows": live_leaderboard()}


@app.get("/api/feed")
def get_feed():
    return {"events": store.recent_events()}


@app.get("/api/stats")
def get_stats():
    s = store.stats()
    s["phase"] = hub.phase
    return s


@app.websocket("/ws")
async def ws(ws: WebSocket):
    await hub.connect(ws)
    try:
        await ws.send_json({"type": "phase", "phase": hub.phase})
        await ws.send_json({"type": "frozen", "frozen": hub.frozen})
        await ws.send_json({"type": "leaderboard", "rows": live_leaderboard()})
        await ws.send_json({"type": "feed", "events": store.recent_events()})
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        hub.disconnect(ws)
    except Exception:
        hub.disconnect(ws)


_present_last = set()


async def idle_sweeper():
    """Periodically drop players who have gone idle: they disappear from the
    board and the wall, and a feed note is posted. Their score is untouched."""
    global _present_last
    while True:
        await asyncio.sleep(30)
        try:
            now_present, dropped = set(), []
            for uid in store.all_user_ids():
                if not _seen.get(uid):
                    continue
                if is_present(uid, IDLE_LIMIT):
                    now_present.add(uid)
                elif uid in _present_last:
                    dropped.append(uid)
            for uid in dropped:
                name = store.get_username(uid) or ""
                av = (store.get_user(uid) or {}).get("avatar", 0)
                store.add_event("phase", name, f"{name} dropped (inactive).", av)
            if dropped:
                await hub.broadcast({"type": "leaderboard", "rows": live_leaderboard()})
                await hub.broadcast({"type": "feed", "events": store.recent_events()})
            _present_last = now_present
        except Exception:
            pass


@app.on_event("startup")
async def _start_background():
    asyncio.create_task(idle_sweeper())

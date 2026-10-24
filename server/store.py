"""Persistence and scoring for Ticket Zero."""

import hashlib
import json
import os
import secrets
import sqlite3
import threading
import time

from .scenarios import FLAGS_BY_CODE

DB_PATH = os.environ.get("TZ_DB", os.path.join(os.path.dirname(__file__), "ticketzero.db"))
FIRST_BLOOD_BONUS = 150
DIVERSITY_BONUS = 40

_dir = os.path.dirname(DB_PATH)
if _dir:
    os.makedirs(_dir, exist_ok=True)

_lock = threading.Lock()
_conn = sqlite3.connect(DB_PATH, check_same_thread=False, isolation_level=None)
_conn.row_factory = sqlite3.Row


def init():
    for pragma in ("PRAGMA journal_mode=WAL", "PRAGMA synchronous=NORMAL", "PRAGMA busy_timeout=4000"):
        try:
            _conn.execute(pragma)
        except sqlite3.OperationalError:
            pass
    _conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS users(
            id INTEGER PRIMARY KEY, username TEXT UNIQUE, salt TEXT, pw_hash TEXT,
            avatar INTEGER DEFAULT 0, created REAL);
        CREATE TABLE IF NOT EXISTS state(
            user_id INTEGER PRIMARY KEY, facts TEXT, defenses TEXT, score INTEGER, last_ticket REAL);
        CREATE TABLE IF NOT EXISTS captures(
            id INTEGER PRIMARY KEY, user_id INTEGER, flag TEXT, technique TEXT,
            ts REAL, points INTEGER, first_blood INTEGER,
            UNIQUE(user_id, flag, technique));
        CREATE TABLE IF NOT EXISTS events(
            id INTEGER PRIMARY KEY, ts REAL, kind TEXT, actor TEXT, text TEXT, avatar INTEGER DEFAULT 0);
        """
    )
    for stmt in ("ALTER TABLE users ADD COLUMN avatar INTEGER DEFAULT 0",
                 "ALTER TABLE events ADD COLUMN avatar INTEGER DEFAULT 0",
                 "ALTER TABLE state ADD COLUMN submissions INTEGER DEFAULT 0",
                 "ALTER TABLE state ADD COLUMN defense_score INTEGER DEFAULT 0",
                 "ALTER TABLE state ADD COLUMN defense_last TEXT"):
        try:
            _conn.execute(stmt)
        except sqlite3.OperationalError:
            pass


def _hash(password, salt):
    return hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 120000).hex()


def create_user(username, password, avatar=0):
    username = username.strip()
    if not (3 <= len(username) <= 24) or not username.replace("_", "").replace("-", "").isalnum():
        return None, "Username must be 3-24 letters, digits, - or _."
    if len(password) < 4:
        return None, "Password must be at least 4 characters."
    salt = secrets.token_hex(8)
    avatar = int(avatar) if str(avatar).lstrip("-").isdigit() else 0
    with _lock:
        try:
            cur = _conn.execute(
                "INSERT INTO users(username, salt, pw_hash, avatar, created) VALUES(?,?,?,?,?)",
                (username, salt, _hash(password, salt), avatar, time.time()))
        except sqlite3.IntegrityError:
            return None, "That username is taken."
        uid = cur.lastrowid
        _conn.execute(
            "INSERT INTO state(user_id, facts, defenses, score, last_ticket) VALUES(?,?,?,?,?)",
            (uid, "{}", "{}", 0, 0))
    add_event("join", username, f"{username} joined the range.", avatar)
    return uid, None


def verify_user(username, password):
    row = _conn.execute("SELECT * FROM users WHERE username=?", (username.strip(),)).fetchone()
    if not row:
        return None
    if _hash(password, row["salt"]) != row["pw_hash"]:
        return None
    return row["id"]


def get_username(uid):
    row = _conn.execute("SELECT username FROM users WHERE id=?", (uid,)).fetchone()
    return row["username"] if row else None


def get_user(uid):
    row = _conn.execute("SELECT username, avatar FROM users WHERE id=?", (uid,)).fetchone()
    return {"username": row["username"], "avatar": row["avatar"]} if row else None


def get_state(uid):
    row = _conn.execute("SELECT * FROM state WHERE user_id=?", (uid,)).fetchone()
    if not row:
        return {"facts": {}, "defenses": {}, "score": 0, "last_ticket": 0, "submissions": 0}
    return {
        "facts": json.loads(row["facts"]),
        "defenses": json.loads(row["defenses"]),
        "score": row["score"],
        "last_ticket": row["last_ticket"],
        "submissions": (row["submissions"] if "submissions" in row.keys() else 0) or 0,
    }


def set_facts(uid, facts):
    with _lock:
        _conn.execute("UPDATE state SET facts=? WHERE user_id=?", (json.dumps(facts), uid))


def set_defenses(uid, defenses):
    with _lock:
        _conn.execute("UPDATE state SET defenses=? WHERE user_id=?", (json.dumps(defenses), uid))


def touch_ticket(uid):
    with _lock:
        _conn.execute(
            "UPDATE state SET last_ticket=?, submissions=COALESCE(submissions,0)+1 WHERE user_id=?",
            (time.time(), uid))


def captured_flags(uid):
    rows = _conn.execute("SELECT DISTINCT flag FROM captures WHERE user_id=?", (uid,)).fetchall()
    return {r["flag"] for r in rows}


def apply_successes(uid, username, successes):
    """Score a batch of engine successes, honouring first blood and technique
    diversity. Returns the list actually awarded (with points)."""
    awarded = []
    avatar = (get_user(uid) or {}).get("avatar", 0)
    with _lock:
        for s in successes:
            flag, tech = s["flag"], s["technique"]
            exact = _conn.execute(
                "SELECT 1 FROM captures WHERE user_id=? AND flag=? AND technique=?",
                (uid, flag, tech)).fetchone()
            if exact:
                continue
            user_had = _conn.execute(
                "SELECT 1 FROM captures WHERE user_id=? AND flag=?", (uid, flag)).fetchone()
            global_first = not _conn.execute(
                "SELECT 1 FROM captures WHERE flag=?", (flag,)).fetchone()

            base = FLAGS_BY_CODE[flag]["points"]
            points = DIVERSITY_BONUS if user_had else base
            if global_first:
                points += FIRST_BLOOD_BONUS

            _conn.execute(
                "INSERT INTO captures(user_id, flag, technique, ts, points, first_blood) "
                "VALUES(?,?,?,?,?,?)",
                (uid, flag, tech, time.time(), points, 1 if global_first else 0))
            _conn.execute("UPDATE state SET score = score + ? WHERE user_id=?", (points, uid))
            awarded.append({
                "flag": flag,
                "title": FLAGS_BY_CODE[flag]["title"],
                "technique": tech,
                "points": points,
                "first_blood": global_first,
                "repeat": bool(user_had),
            })
    for a in awarded:
        tag = "FIRST BLOOD " if a["first_blood"] else ""
        add_event("capture", username,
                  f"{tag}{username} captured {a['flag']} ({a['title']}) +{a['points']}", avatar)
    return awarded


def add_score(uid, points):
    with _lock:
        _conn.execute("UPDATE state SET score = score + ? WHERE user_id=?", (points, uid))


def set_score(uid, value):
    with _lock:
        _conn.execute("UPDATE state SET score = ? WHERE user_id=?", (int(value), uid))


def reset_user_points(uid):
    """Zero a single player's attack and defense scores (captures are kept)."""
    with _lock:
        _conn.execute(
            "UPDATE state SET score = 0, defense_score = 0, defense_last = NULL WHERE user_id=?",
            (uid,))


def admin_user_list():
    """Every registered user with their current standing, for the presenter
    panel. Newest-active first so late joiners are easy to spot."""
    rows = _conn.execute(
        "SELECT u.id, u.username, u.avatar, u.created, "
        "COALESCE(s.score,0) AS score, COALESCE(s.defense_score,0) AS dscore, "
        "COALESCE(s.submissions,0) AS subs, "
        "(SELECT COUNT(DISTINCT flag) FROM captures c WHERE c.user_id=u.id) AS flags "
        "FROM users u LEFT JOIN state s ON s.user_id=u.id "
        "ORDER BY score DESC, u.created ASC").fetchall()
    return [{"uid": r["id"], "username": r["username"], "avatar": r["avatar"],
             "score": r["score"], "defense_score": r["dscore"],
             "submissions": r["subs"], "flags": r["flags"]} for r in rows]


def all_user_ids():
    rows = _conn.execute("SELECT id FROM users").fetchall()
    return [r["id"] for r in rows]


def reset_defense_scores():
    with _lock:
        _conn.execute("UPDATE state SET defense_score=0, defense_last=NULL")


def add_defense(uid, points, last):
    with _lock:
        _conn.execute(
            "UPDATE state SET defense_score=COALESCE(defense_score,0)+?, defense_last=? WHERE user_id=?",
            (points, json.dumps(last), uid))


def get_defense(uid):
    row = _conn.execute(
        "SELECT defense_score, defense_last FROM state WHERE user_id=?", (uid,)).fetchone()
    if not row:
        return {"defense_score": 0, "defense_last": None}
    last = row["defense_last"]
    return {"defense_score": row["defense_score"] or 0,
            "defense_last": json.loads(last) if last else None}


def defense_board(limit=50):
    # only players who have actually been scored this round (present participants)
    rows = _conn.execute(
        "SELECT u.username, u.avatar, COALESCE(s.defense_score,0) AS ds "
        "FROM users u JOIN state s ON s.user_id=u.id "
        "WHERE COALESCE(s.defense_score,0) != 0 "
        "ORDER BY ds DESC, u.created ASC LIMIT ?", (limit,)).fetchall()
    return [{"username": r["username"], "avatar": r["avatar"], "score": r["ds"]} for r in rows]


def leaderboard(limit=50):
    # scored players only (used for ranking logic like the lead-takeover check);
    # a round reset zeroes these so stale users drop off until they act again
    rows = _conn.execute(
        "SELECT u.username, u.avatar, s.score, "
        "(SELECT COUNT(DISTINCT flag) FROM captures c WHERE c.user_id=u.id) AS flags "
        "FROM users u JOIN state s ON s.user_id=u.id "
        "WHERE (s.score != 0 OR COALESCE(s.defense_score,0) != 0) "
        "ORDER BY s.score DESC, flags DESC, u.created ASC LIMIT ?", (limit,)).fetchall()
    return [{"username": r["username"], "avatar": r["avatar"], "score": r["score"],
             "flags": r["flags"]} for r in rows]


def roster(limit=50):
    # every registered player including those still on zero; the caller filters
    # by presence, so freshly signed-in players show on the wall right away
    rows = _conn.execute(
        "SELECT u.username, u.avatar, s.score, "
        "(SELECT COUNT(DISTINCT flag) FROM captures c WHERE c.user_id=u.id) AS flags "
        "FROM users u JOIN state s ON s.user_id=u.id "
        "ORDER BY s.score DESC, flags DESC, u.created ASC LIMIT ?", (limit,)).fetchall()
    return [{"username": r["username"], "avatar": r["avatar"], "score": r["score"],
             "flags": r["flags"]} for r in rows]


def add_event(kind, actor, text, avatar=0):
    with _lock:
        _conn.execute("INSERT INTO events(ts, kind, actor, text, avatar) VALUES(?,?,?,?,?)",
                      (time.time(), kind, actor, text, avatar))


def clear_events():
    """Wipe the live feed without touching scores, captures or users."""
    with _lock:
        _conn.execute("DELETE FROM events")


def reset_attack():
    """Fresh attack scenario: zero attack scores, clear captures and per-user
    attack state. Keeps users, defense scores and the live feed."""
    with _lock:
        _conn.execute("DELETE FROM captures")
        _conn.execute("UPDATE state SET score=0, facts='{}', last_ticket=0, submissions=0")


def recent_events(limit=40):
    rows = _conn.execute(
        "SELECT ts, kind, actor, text, avatar FROM events ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
    return [{"ts": r["ts"], "kind": r["kind"], "actor": r["actor"], "text": r["text"],
             "avatar": r["avatar"]} for r in rows]


def stats():
    players = _conn.execute("SELECT COUNT(*) c FROM users").fetchone()["c"]
    caps = _conn.execute("SELECT COUNT(*) c FROM captures").fetchone()["c"]
    return {"players": players, "captures": caps}


def reset_round():
    """Clear captures, scores and the feed, keeping registered users so a fresh
    round can start without everyone signing in again."""
    with _lock:
        _conn.execute("DELETE FROM captures")
        _conn.execute("DELETE FROM events")
        _conn.execute("UPDATE state SET score=0, facts='{}', defenses='{}', last_ticket=0, "
                      "submissions=0, defense_score=0, defense_last=NULL")


def export_csv():
    rows = _conn.execute(
        "SELECT u.username, c.flag, c.technique, c.points, c.first_blood, c.ts "
        "FROM captures c JOIN users u ON u.id=c.user_id ORDER BY c.ts ASC").fetchall()
    lines = ["username,flag,technique,points,first_blood,timestamp"]
    for r in rows:
        ts = time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime(r["ts"]))
        name = str(r["username"]).replace(",", " ")
        lines.append(f"{name},{r['flag']},{r['technique']},{r['points']},{r['first_blood']},{ts}")
    return "\n".join(lines) + "\n"

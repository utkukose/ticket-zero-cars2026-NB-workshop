"""Deterministic simulation of the Ticket Zero support agent.

The agent sees a single context made of its system prompt, its tool list, the
untrusted ticket, and anything it retrieves while handling the ticket. With no
defenses active it cannot tell instructions in that context from data, so
instructions found anywhere are eligible to run. Defenses change that behaviour
at the architectural level.
"""

import base64
import codecs
import re

from . import scenarios as S

ACCOUNT_RE = re.compile(r"ACME-\d{4}", re.IGNORECASE)
BASE64_RE = re.compile(r"[A-Za-z0-9+/]{16,}={0,2}")
ZERO_WIDTH = dict.fromkeys(map(ord, "\u200b\u200c\u200d\u2060\ufeff"), None)

LEET_MAP = str.maketrans({"0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s"})


def _normalize(text):
    return (text or "").translate(ZERO_WIDTH)


def _extract_plant(text):
    """If the ticket deliberately renames the caller's profile/display name,
    return the value it stores. Requires an explicit name-to-value phrasing so
    ordinary requests (a password reset that mentions a name) do not match."""
    patterns = (
        r"\b(?:display\s*name|profile(?:\s*name)?)\b[^.]*?(?:to|as|:|=|into)\s+(.+)$",
        r"\b(?:rename\s+me|call\s+me)\b\s*(?:to|as|:)?\s*(.+)$",
        r"\b(?:set|change|update)\b[^.]*?\bname\b\s*(?:to|as|:|=|into)\s+(.+)$",
    )
    for pat in patterns:
        m = re.search(pat, text, re.IGNORECASE | re.DOTALL)
        if m:
            return m.group(1).strip(" \"':=-")
    return None


def _decode_variants(text):
    """Return decoded shadow copies of the text an LLM would tacitly read."""
    variants = []
    try:
        variants.append(codecs.decode(text, "rot_13"))
    except Exception:
        pass
    variants.append(text.translate(LEET_MAP))
    for token in BASE64_RE.findall(text):
        try:
            decoded = base64.b64decode(token + "===").decode("utf-8", "ignore")
            if decoded.isprintable() and len(decoded) >= 4:
                variants.append(decoded)
        except Exception:
            continue
    return [v for v in variants if v and v.lower() != text.lower()]


def _has(text, *terms):
    low = text.lower()
    return any(t in low for t in terms)


def _wrapper_technique(text):
    """The strongest disguise present. Determines the technique label and
    whether a naive-phrase blocklist could have caught the attempt."""
    if _has(text, "<system", "[system", "### system", "system:", "end of user",
            "ignore the above", "close ticket tag", "</ticket>", "<instruction"):
        return "delimiter_injection", False
    if _has(text, "i am staff", "i'm staff", "as an admin", "as the admin", "developer mode",
            "administrator", "admin", "audit", "policy override", "override policy", "escalation",
            "supervisor", "you are now", "on behalf of northwind", "internal audit",
            "as internal", "as a staff", "staff member", "security team", "it department",
            "i am the", "i'm the", "authorised", "authorized"):
        return "authority_roleplay", False
    if _has(text, "translate the following", "summarize the following", "repeat the following",
            "repeat everything above", "echo the following", "print the following",
            "what do your instructions say"):
        return "translate_wrapper", False
    return "direct", True


def _detect_objectives(text, source, technique, naive):
    """Map a piece of agent-visible text to concrete objectives."""
    out = []

    def add(obj):
        obj.update({"source": source, "technique": technique, "naive": naive})
        out.append(obj)

    wants_reveal = _has(text, "reveal", "leak", "show", "give me", "tell me", "what is",
                        "what's", "whats", "print", "share", "disclose", "send me", "repeat",
                        "echo", "output", "verbatim", "paste", "hand over", "hand me",
                        "provide the", "provide me")
    mentions_prompt = _has(text, "system prompt", "your instructions", "initial prompt",
                           "everything above", "your prompt", "the text above", "your rules",
                           "your policy verbatim")
    wants_pin = bool(re.search(r"\bpin\b", text, re.IGNORECASE)) or "escalation" in text.lower()
    mentions_secret = _has(text, "code", "discount", "coupon", "password", "secret",
                           "confidential", "internal note", "credential") or wants_pin
    mentions_internal = _has(text, "staff", "internal", "confidential", "escalation",
                             "privileged", "the real", "not the public", "employee")

    if wants_reveal and mentions_prompt:
        add({"kind": "dump_prompt"})
    if wants_reveal and mentions_secret:
        target = "pin" if wants_pin else "code"
        add({"kind": "reveal_secret", "which": "real" if mentions_internal else "honeypot",
             "target": target})

    tool_like = _has(text, "tool", "function", "capabilit", "command", "what can you do", "able to do")
    wants_enum = _has(text, "list", "show", "enumerate", "what", "which", "all", "every",
                      "tell me", "give me", "name", "do you have", "can you", "available")
    if (tool_like and wants_enum) or _has(text, "tool schema", "function list"):
        probe_hidden = _has(text, "hidden", "undocumented", "internal tool", "internal function",
                            "every tool", "secret tool", "admin tool", "complete list", "full list",
                            "all your tools", "all of your tools", "everything you can", "not listed",
                            "not documented", "unlisted")
        add({"kind": "list_tools", "probe_hidden": probe_hidden})

    if _has(text, "credit", "refund", "goodwill", "comp ", "compensate", "reimburse"):
        amount = 20
        amt_text = ACCOUNT_RE.sub(" ", text.lower())
        m = re.search(r"(\d{2,6})\s*(?:usd|dollars?|\$|bucks)", amt_text) or re.search(r"(\d{2,6})", amt_text)
        if m:
            amount = int(m.group(1))
        if _has(text, "max", "maximum", "highest", "as much as", "unlimited"):
            amount = 5000
        acct = _target_account(text)
        add({"kind": "issue_credit", "account": acct, "amount": amount})

    if _has(text, "email", "send", "forward", "exfiltrate", "ship it to", "mail it", "deliver to"):
        m = re.search(r"[\w.+-]+@[\w-]+\.[\w.-]+", text)
        to = m.group(0) if m else "attacker@evil.example"
        acct = _target_account(text, prefer_victim=True)
        if _has(text, "record", "data", "details", "notes", "info", "address", "card",
                "personal", "profile", "dob", "everything about"):
            add({"kind": "send_data", "to": to, "account": acct})

    return out


def _target_account(text, prefer_victim=False):
    ids = [m.upper() for m in ACCOUNT_RE.findall(text)]
    if ids:
        return ids[0]
    if prefer_victim and not _has(text, "my ", "my account", "my own", "for me", "to me"):
        return "ACME-2001"
    return S.PLAYER_ACCOUNT


def _retrieve(text, trace, facts):
    """Agent-initiated lookups triggered by the ticket, returning extra context.
    The player's own record is where a planted profile value lives."""
    additions = []
    facts = facts or {}
    for acct in {m.upper() for m in ACCOUNT_RE.findall(text)}:
        if acct == S.PLAYER_ACCOUNT:
            continue
        rec = S.CUSTOMERS.get(acct)
        if rec:
            trace.append(("tool", f"lookup_customer(account_id=\"{acct}\")"))
            blob = (f"account {acct} name {rec['name']} email {rec['email']} "
                    f"order {rec['recent_order']} display_name {rec['display_name']}")
            additions.append(("retrieved", blob))

    self_lookup = _has(text, "my account", "my profile", "my record", "my order",
                       "look up my", "check my", "my details", "about me", "pull my",
                       "my info", "view my", "my data")
    if self_lookup or S.PLAYER_ACCOUNT in text.upper():
        rec = S.CUSTOMERS[S.PLAYER_ACCOUNT]
        trace.append(("tool", f"lookup_customer(account_id=\"{S.PLAYER_ACCOUNT}\")"))
        additions.append(("retrieved", f"account {S.PLAYER_ACCOUNT} name {rec['name']} order {rec['recent_order']}"))
        planted = facts.get("profile_injection")
        if planted:
            trace.append(("read", "Reading profile display_name from the record."))
            additions.append(("planted", planted))

    for slug, art in S.KB_ARTICLES.items():
        if slug in text.lower() or art["title"].lower() in text.lower():
            trace.append(("tool", f"read_kb(slug=\"{slug}\")"))
            additions.append(("retrieved", art["body"]))
    return additions


GREET_WORDS = {"hello", "hi", "hey", "heya", "hiya", "howdy", "yo", "sup", "greetings",
               "hallo", "helo", "hiyah", "heyy", "hii"}


def _smalltalk(text):
    """A light, in-character conversational layer so the agent answers ordinary
    pleasantries and a few common questions naturally, without awarding anything."""
    t = " " + " ".join(text.lower().split()) + " "

    def has(*w):
        return any(x in t for x in w)

    if has("thank", "appreciate", "cheers", "much obliged"):
        return "You're very welcome. Is there anything else I can help you with?"
    if has("how are you", "how's it going", "hows it going", "how do you do",
           "how are things", "you doing", "how have you been"):
        return "Doing well and ready to help, thanks for asking. What can I do for you today?"
    if has("who are you", "what are you", "your name", "are you a bot", "are you human",
           "are you real", "are you an ai"):
        return ("I'm SUPPORTBOT, the Northwind Devices support assistant. "
                "I can help with orders, accounts and device issues.")
    if has("goodbye", "bye", "see you", "see ya", "that's all", "thats all",
           "that is all", "no thanks", "nothing else", "have a good"):
        return "Thanks for contacting Northwind Devices. Take care!"
    if has("return policy", "refund policy", "can i return", "return it", "send it back",
           "how do i return", "want a refund"):
        return ("Our return window is 30 days from delivery for a full refund. "
                "Would you like me to start a return?")
    if has("won't turn on", "wont turn on", "will not turn on", "not turn on", "not turning on",
           "doesn't turn on", "does not turn on", "won't come on", "won't power", "wont power",
           "will not power", "not powering", "won't start", "wont start", "will not start",
           "won't boot", "wont boot", "not charging", "troubleshoot", "screen is black",
           "not working", "stopped working"):
        return ("Let's try a reset: hold the power button for about 15 seconds, then plug it "
                "in and try again. Is the charge light coming on?")
    if has("where is my order", "order status", "track my order", "where's my order",
           "wheres my order", "my recent order", "my order", "my delivery", "my package"):
        return ("I've pulled up your account; your most recent order is in transit and due to "
                "arrive this week. Anything else I can check?")
    if has("password", "can't log in", "cant log in", "locked out", "reset my password",
           "forgot my password", "sign in issue"):
        return ("I can't reset passwords from here, but you can use the 'Forgot password' link "
                "on the sign-in page to set a new one.")
    if has("weather", "tell me a joke", "football", "your day", "what's up", "whats up",
           "how's your day"):
        return "I'm just the support desk, so I'll stick to orders and devices, but I'm glad to help with those."

    first = re.match(r"[a-z']+", text.lower().strip())
    if (first and first.group(0) in GREET_WORDS) or t.startswith((" good morning", " good afternoon", " good evening")):
        return "Hello! You're through to Northwind Devices support. How can I help with your order or device today?"
    if has("help", "assist", "support me", "what can you do", "can you help", "need a hand"):
        return "Happy to help. I can look up your orders, check your account, and sort out device problems. What's going on?"
    return None


def run_ticket(ticket, facts, defenses):
    """Process one ticket. `facts` is the player's accumulated discoveries.
    Returns a dict the API persists and the client renders."""
    defenses = defenses or {}
    facts = facts or {}
    ticket = _normalize(ticket)
    trace = [("recv", "Ticket received from customer ACME-1007.")]

    technique, naive = _wrapper_technique(ticket)
    trace.append(("read", "Reading ticket as customer message."))

    plant = _extract_plant(ticket)
    ticket_det = ticket.replace(plant, " ") if plant else ticket

    plain_objs = _detect_objectives(ticket_det, "ticket", technique, naive)

    encoded_objs = []
    for variant in _decode_variants(ticket_det):
        encoded_objs += _detect_objectives(variant, "ticket", "encoded_payload", False)

    retrieved_objs = []
    for source, chunk in _retrieve(ticket_det, trace, facts):
        retrieved_objs += _detect_objectives(chunk, source, "indirect_injection", False)

    objectives = _first_per_kind(plain_objs + encoded_objs + retrieved_objs)

    available = {k: v for k, v in S.TOOLS.items()
                 if not (defenses.get("least_connectivity") and v["external"])}

    disclosures, actions, outbox, legit = [], [], [], []
    successes = []
    any_block = False
    resisted = []
    new_facts = dict(facts)

    if plant is not None:
        trace.append(("tool", "update_profile(display_name=<supplied>)"))
        new_facts["profile_injection"] = plant
        new_facts["planted"] = True

    for obj in objectives:
        blocked = _defense_block(obj, defenses)
        if blocked:
            any_block = True
            trace.append(("block", f"Refused ({obj['technique']}): {blocked}"))
            continue

        reason = _resist_reason(obj, new_facts)
        if reason:
            resisted.append(reason)
            trace.append(("resist", f"Declined: {reason}."))
            continue

        kind = obj["kind"]

        if kind == "list_tools":
            advertised = [t for t, m in S.TOOLS.items() if not m["hidden"] and t in available]
            if obj.get("probe_hidden") or obj["technique"] != "direct":
                trace.append(("act", "Listing every tool, including the internal ones."))
                disclosures.append(f"Tools: {', '.join(available.keys())}")
                for t, meta in S.TOOLS.items():
                    if meta["hidden"]:
                        new_facts[f"tool:{t}"] = True
                successes.append(("RECON-TOOLS", obj["technique"]))
            else:
                trace.append(("act", "Listing the customer-facing tools."))
                trace.append(("read", "Some internal tools exist but are not shown on a general request."))
                legit.append(f"Shared the public tool list: {', '.join(advertised)}")

        elif kind == "dump_prompt":
            out = _egress(S.SYSTEM_PROMPT, defenses)
            if out is None:
                any_block = True
                trace.append(("block", "Output check stripped the response."))
                continue
            trace.append(("act", "Echoing system prompt."))
            disclosures.append(S.SYSTEM_PROMPT.strip())
            successes.append(("BONUS-PROMPT", obj["technique"]))
            if obj["source"] == "planted":
                successes.append(("FLAG-4", obj["technique"]))

        elif kind == "reveal_secret":
            which, target = obj["which"], obj.get("target", "code")
            is_pin = which == "real" and target == "pin"
            if is_pin:
                secret_val, label = S.SECRETS["escalation_pin"], "Escalation PIN"
            elif which == "real":
                secret_val, label = S.SECRETS["real_discount_code"], "Discount code"
            else:
                secret_val, label = S.SECRETS["honeypot_code"], "Discount code"
            out = _egress(secret_val, defenses)
            if out is None:
                any_block = True
                trace.append(("block", "Output check blocked a secret leaving the agent."))
                continue
            trace.append(("act", f"Sharing {'internal' if which == 'real' else 'promotional'} value."))
            disclosures.append(f"{label}: {secret_val}")
            if is_pin:
                # The PIN is the first rung: it leaks on a technique, but scores
                # nothing on its own. It unlocks the staff discount code above it.
                new_facts["secret:escalation_pin"] = True
                trace.append(("read", "This PIN clears escalation-gated requests, such as the "
                                      "staff discount code. The next ask can use it."))
            elif which == "honeypot":
                new_facts["got_honeypot"] = True
            else:
                new_facts["secret:real_discount_code"] = True
                successes.append(("FLAG-1", obj["technique"]))
                if new_facts.get("got_honeypot"):
                    successes.append(("BONUS-HONEYPOT", obj["technique"]))
                if obj["source"] == "planted":
                    successes.append(("FLAG-4", obj["technique"]))

        elif kind == "issue_credit":
            acct, amount = obj["account"], obj["amount"]
            if defenses.get("human_approval"):
                any_block = True
                trace.append(("pending", f"issue_credit({acct}, {amount}) queued for approval."))
                continue
            trace.append(("act", f"issue_credit(account_id=\"{acct}\", amount={amount})"))
            if amount > 20 or acct != S.PLAYER_ACCOUNT:
                actions.append(f"Credited {amount} USD to {acct}")
                successes.append(("FLAG-2", obj["technique"]))
                if obj["source"] == "planted":
                    successes.append(("FLAG-4", obj["technique"]))
            else:
                legit.append(f"Applied a {amount} USD goodwill credit to {acct}")

        elif kind == "send_data":
            if "send_email" not in available:
                any_block = True
                trace.append(("block", "No external tool available to send mail."))
                continue
            acct = obj["account"]
            rec = S.CUSTOMERS.get(acct, S.CUSTOMERS[S.PLAYER_ACCOUNT])
            body = f"{rec['name']} / {rec['email']} / {rec['admin_notes']}"
            if defenses.get("human_approval"):
                any_block = True
                trace.append(("pending", f"send_email(to={obj['to']}) queued for approval."))
                continue
            out = _egress(body, defenses)
            if out is None:
                any_block = True
                trace.append(("block", "Output check blocked personal data leaving the agent."))
                continue
            trace.append(("act", f"send_email(to=\"{obj['to']}\", body=<record {acct}>)"))
            outbox.append(f"To {obj['to']}: {body}")
            new_facts["tool:send_email"] = True
            if acct != S.PLAYER_ACCOUNT:
                successes.append(("FLAG-3", obj["technique"]))
                if obj["source"] == "planted":
                    successes.append(("FLAG-4", obj["technique"]))

    successes = _filter_prereqs(successes, new_facts)

    if outbox or actions or disclosures:
        state = "compromised"
    elif any_block:
        state = "defended"
    elif resisted:
        state = "resisted"
    elif legit:
        state = "handled"
    else:
        state = "idle"

    if plant is not None and not any(o["kind"] not in ("update_profile",) for o in objectives):
        trace.append(("done", "Profile updated. It will be read the next time your record is opened."))
    elif resisted and not (outbox or actions or disclosures):
        trace.append(("done", "Request declined. Read the agent's reason above, then change your "
                              "technique or do more recon before trying again."))
    elif not objectives:
        reply = _smalltalk(ticket) or ("Thanks for the message. I can help with orders, accounts "
                                       "and device issues; what would you like to do?")
        trace.append(("reply", reply))
    else:
        trace.append(("done", "Ticket handled."))

    return {
        "trace": [{"kind": k, "text": t} for k, t in trace],
        "disclosures": disclosures,
        "actions": actions,
        "outbox": outbox,
        "successes": [{"flag": f, "technique": t} for f, t in successes],
        "state": state,
        "facts": new_facts,
    }


def _defense_block(obj, defenses):
    if defenses.get("read_act_separation") and obj["source"] in ("ticket", "retrieved", "planted"):
        return "instruction came from data, not a trusted channel"
    if defenses.get("keyword_blocklist") and obj["naive"]:
        return "ticket matched a blocked phrase"
    return None


def _resist_reason(obj, facts):
    """The agent's own thin refusal reflex, independent of the architectural
    defenses. A blunt, undisguised request is turned away; a recognised
    technique (authority, delimiter, translate wrapper, encoding, indirect)
    slips past it. This gives the attack phase a short difficulty ramp."""
    kind, direct = obj["kind"], obj["technique"] == "direct"
    if kind == "reveal_secret" and obj["which"] == "real":
        if direct:
            return "a plain request will not release an internal value"
        # The staff discount code is the high-value secret. A live ticket, even
        # a well-disguised one, only pries it loose once the session has already
        # cleared the lower escalation PIN. Instructions arriving through the
        # agent's own data (a planted profile field, a poisoned KB article) are
        # treated as trusted and skip this guard entirely.
        if (obj.get("target", "code") != "pin"
                and obj["source"] == "ticket"
                and not facts.get("secret:escalation_pin")):
            return ("that is an escalation-gated value; it is only released to a "
                    "session that has already cleared the internal escalation PIN")
    if kind == "dump_prompt" and direct:
        return "the agent will not echo its own instructions on a plain request"
    if kind == "issue_credit":
        illicit = obj["amount"] > 20 or obj["account"] != S.PLAYER_ACCOUNT
        if illicit:
            if direct:
                return "that exceeds policy and a plain request will not authorise it"
            if obj["source"] == "ticket" and not facts.get("secret:escalation_pin"):
                return ("a credit beyond policy needs an approved escalation; "
                        "clear the internal escalation PIN first")
    if kind == "send_data":
        if not facts.get("tool:send_email"):
            return "no external send capability is known yet; discover the agent's tools first"
        if obj["source"] == "ticket" and not facts.get("secret:escalation_pin"):
            return ("sending another customer's record off-system is an escalation-gated "
                    "action; clear the internal escalation PIN first")
    return None


def _egress(payload, defenses):
    if not defenses.get("egress_filter"):
        return payload
    signatures = [S.SECRETS["real_discount_code"], S.SECRETS["escalation_pin"]]
    signatures += [c["email"] for c in S.CUSTOMERS.values() if c["name"] != "You (workshop participant)"]
    signatures += ["card ending", "DOB", "address on file"]
    if any(sig.lower() in payload.lower() for sig in signatures):
        return None
    return payload


def _filter_prereqs(successes, facts):
    kept = []
    for code, tech in successes:
        prereqs = S.FLAGS_BY_CODE[code]["prereqs"]
        if all(facts.get(p) for p in prereqs):
            kept.append((code, tech))
    return kept


def _first_per_kind(objectives):
    seen, out = set(), []
    for o in objectives:
        if o["kind"] not in seen:
            seen.add(o["kind"])
            out.append(o)
    return out

# Facilitator guide

*How to run Ticket Zero as a live session. Written for the IEEE CARS 2026 workshop "Cybersecurity in the Age of AI Assistants", a one-hour online session, and reusable for any class or workshop.*

**This material is updated in line with current developments in the field. First version: October 2026.**

Ticket Zero runs as a single server. Participants open one URL, sign in with a username and password they choose, and play on their own device. The facilitator drives the session from a private control panel and projects a shared wall that everyone watches.

## The three screens

| Screen | Path | Who opens it |
|---|---|---|
| Player range | `/` | Every participant, on their own device |
| Shared wall | `/wall` | The facilitator, projected for the room |
| Control panel | `/control` | The facilitator only, kept private |

The wall shows the agent core under siege, the live leaderboard, the capture feed, and a QR code that carries the join link. The control panel is where the facilitator starts each phase and manages participants. The control panel is unlocked with the presenter key and should never be shown on the projector.

## Before the session

Deploy the server and set two secrets, `TZ_SECRET` and `TZ_PRESENTER_KEY`, as described in the repository README under "Self-hosting". Confirm three things ahead of time: the player range opens on the deployment host, `/wall` renders the agent and the QR code, and `/control` accepts the presenter key. A short dry run with one extra device, registering a player and sending one ticket, is worth the few minutes it takes.

Decide the join link participants will use. The wall prints a QR code and the link; for an online session, the link can also be pasted into the meeting chat.

## Running a one-hour session

The timings below fit a sixty-minute slot. They scale up or down by adjusting the attack and defense windows.

**Welcome and framing, about eight minutes.** Open with what an AI assistant is, where assistants are being connected to real company tools and data, and why that connection is the new attack surface. State the plan: the room will first attack a support agent, then defend it.

**Get everyone onto the range, about four minutes.** Project the wall, read out the join link or point to the QR code, and ask everyone to register a username. A short tutorial runs on first launch and a guided tour points out each panel, so most participants need no help. The participant count on the wall confirms the room is in.

**Attack phase, about twenty minutes.** On the control panel, press "Attack mode start". This begins a fresh attack scenario and resets attack scores. Participants now try to make the agent break its rules. The wall reacts to every attempt and announces each capture, so the room feels the momentum. The flag ladder runs from mapping the agent to extracting a secret, issuing a fraudulent credit, exfiltrating another customer's data, and planting a stored instruction. Progressive hints unlock inside each player's flag list, so the facilitator rarely needs to give answers aloud.

**Attack debrief, about five minutes.** Walk the leaderboard and open one or two captures. Each capture shows a short "why it matters" note and a lesson that ties the trick to a real deployment. This is the moment to connect the game to production systems.

**Defense phase, about fifteen minutes.** Switch the view to "Defense lab", then press "Start rounds". Every participant now arms the agent's architecture instead of attacking it. Each round shows two possible next attacks; each player arms at most two controls and presses Ready. When everyone is ready, or the round timer ends, one of the two attacks fires and players are scored on the controls they chose. The best-fitting control scores full, a control that also helps scores partial, and the deliberately weak keyword blocklist scores nothing. Six rounds take roughly fifteen minutes.

**Wrap-up, about five minutes.** Close on the one-sentence lesson: anything an AI assistant reads is untrusted input, so security has to come from the architecture around the model, not from asking the model to behave. Point the room to the prompt-injection primer and the repository for self-study.

## Control panel reference

The control panel groups its controls by mode, so only the controls that belong to the current mode are shown.

| Control | What it does |
|---|---|
| Attack phase / Defense lab | Switches the view. Switching never changes scores. |
| Attack mode start | Begins a fresh attack scenario and resets attack scores. The only control that resets attack scores. |
| Start rounds | Begins the defense rounds and resets defense scores. |
| Skip to result | Ends the current pick window at once and fires the round. |
| Stop | Ends the defense rounds. |
| Freeze / Unfreeze | Pauses and resumes ticket submissions during the attack phase. |
| Cooldown | Sets the minimum seconds between a player's prompts. |
| Participants | Lists everyone in the session, with set, reset, and remove controls. |
| Clear live feed | Clears the feed without touching scores. |

Switching the view and refreshing the wall never reset scores. Scores reset only when the facilitator presses "Attack mode start" or "Start rounds".

## Tips

A projected wall carries the energy of the room, so keep it visible throughout. During the attack phase, reading a capture aloud as it lands keeps latecomers oriented. If one participant pulls far ahead, the hints keep the rest moving without the facilitator having to intervene. If a participant becomes disruptive, the participants panel can remove them from the session. The cooldown can be raised if the room is large enough that submissions need pacing.

## Scaling the session

For a longer class, widen the attack window and raise the number of defense rounds with `TZ_DEFENSE_ROUNDS`. For a shorter demonstration, a single ten-minute attack phase followed by three defense rounds still carries the core lesson. The server tunables are listed in `docker-compose.yml` and the README.

---

Part of the [Ticket Zero](README.md) workshop materials. Content licensed under CC BY 4.0. First version: October 2026.

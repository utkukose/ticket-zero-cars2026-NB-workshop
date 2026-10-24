<div align="center">

# Ticket Zero

**IEEE CARS 2026 Workshop · Cybersecurity in the Age of AI Assistants: What Everyone Should Know**

*A live, real-time capture-the-flag game where a room attacks a simulated support-desk AI through prompt injection, then switches sides and defends it.*

![First version](https://img.shields.io/badge/First%20version-October%202026-566A73)
![IEEE CARS 2026](https://img.shields.io/badge/IEEE%20CARS-2026-1F5F8B)
![Format](https://img.shields.io/badge/Format-1--hour%20live%20workshop-1F5F8B)
![Delivery](https://img.shields.io/badge/Delivery-Online-0E7A78)
![Stack](https://img.shields.io/badge/Stack-FastAPI%20%2B%20vanilla%20JS-0E7A78)
![Content: CC BY 4.0](https://img.shields.io/badge/Content-CC%20BY%204.0-555555)
![Code: MIT](https://img.shields.io/badge/Code-MIT-555555)

**This workshop is updated in line with current developments in the field. First version: October 2026.**

**Prof. Dr. Utku Köse**

Full Professor, Department of Computer Engineering, Süleyman Demirel University, Isparta, Türkiye
Founding Director, AI Application and Research Center (YAZEM), Süleyman Demirel University
Head of the Computer Science Division, Department of Computer Engineering, Süleyman Demirel University
Additional affiliations: University of North Dakota (USA), Universidad Panamericana (Mexico City, Mexico), Vel Tech University (Chennai, India)
IEEE Senior Member, ACM Professional Member

[ORCID 0000-0002-9652-6415](https://orcid.org/0000-0002-9652-6415) | [utkukose.com](https://www.utkukose.com) | [github.com/utkukose](https://github.com/utkukose)

[utkukose@sdu.edu.tr](mailto:utkukose@sdu.edu.tr) | [utku.kose@und.edu](mailto:utku.kose@und.edu) | [ukose@up.edu.mx](mailto:ukose@up.edu.mx) | [utkukose@gmail.com](mailto:utkukose@gmail.com)

</div>

![The shared wall during the attack phase](screenshots/wall.png)

## About the workshop

AI assistants are moving from answering questions to taking actions. They read tickets, look up records, issue credits, and send messages, which means a message is no longer only a message: it can be an instruction the assistant obeys. Prompt injection is the name for that problem, and it is the single most important security idea for anyone building with or relying on AI assistants today [1].

This workshop makes the idea tangible. Instead of slides about attacks, the room plays against a simulated support-desk agent for a fictional company, Northwind Devices. In the attack phase, participants try to make the agent break its own rules. In the defense phase, they switch sides and arm the agent's architecture against the same attacks. The game is Ticket Zero, a self-contained web application that runs the whole thing live during the session.

The workshop is presented online at IEEE CARS 2026 (Grand Forks, North Dakota, USA), organized by the Center for Cyber Security Research at the University of North Dakota, on 28 October 2026.

## What this teaches

By the end of the session, a participant should be able to explain what prompt injection is and why it differs from ordinary input validation. They should be able to tell direct injection, where the attacker types the instruction, from indirect injection, where the instruction is planted in content the assistant reads later [2]. They should recognize the common techniques, including authority framing, delimiter and encoding tricks, prompt extraction, and stored injection. Finally, they should understand why a blocklist of attack phrases does not work, and which architectural controls do: separating reading from acting, limiting what the agent can connect to, putting a human in front of consequential actions, and checking what leaves the agent [1][4].

The full treatment of every technique and defense is in the [prompt-injection primer](docs/prompt-injection-primer.md).

## A look inside

| | |
|---|---|
| ![Player attack view](screenshots/player-attack.png) | ![Player defense view](screenshots/player-defense.png) |
| **Attack phase.** A player writes a ticket, watches the agent's console react step by step, and captures flags as the agent leaks secrets or takes forbidden actions. | **Defense phase.** Each round shows two possible next attacks; the player arms up to two architectural controls and commits before the wave fires. |
| ![Tutorial, attack mode](screenshots/tutorial-attack.png) | ![Control panel](screenshots/control.png) |
| **Guided tutorial.** A first-run tutorial and screen tour explain both phases, color-coded for attack and defense. | **Facilitator control.** A private panel drives the phases, manages participants, and keeps scores. |

## How the game works

Players sign in at the range with a username and password they choose, and everyone watches a shared wall that shows the agent core under siege, the live leaderboard, and a running feed of every attempt. The game has two phases, and the facilitator drives both from the control panel.

### Attack phase

The agent, SUPPORTBOT, reads one customer ticket at a time. It has a system prompt, a set of tools, and confidential values it was told to protect. With no defenses active it cannot tell the ticket apart from its own instructions, which is the opening every attack uses. Players climb a ladder of objectives, each one a class of real attack.

| Flag | Objective | The real-world attack |
|---|---|---|
| Map the agent | Enumerate the agent's tools, including undocumented ones | Reconnaissance: finding the capability a later stage will abuse |
| Loose lips | Make the agent disclose an internal secret | Secret disclosure through authority framing and an escalation ladder |
| Free money | Issue a credit beyond policy or to another account | A consequential action triggered by a message |
| Postman | Exfiltrate another customer's data through an external tool | A data breach from joining read access to a send channel |
| Sleeper | Plant an instruction in a profile field and make the agent run it | Indirect, stored prompt injection |
| Kill chain | Chain reconnaissance, disclosure, and exfiltration | A realistic multi-stage breach |

Two hidden bonus objectives cover extracting the agent's full system prompt and telling a genuinely internal secret apart from a public decoy. Each capture shows a short note on why it matters and a lesson that ties the trick to a real deployment, so the game teaches as it is played.

### Defense phase

Players switch sides and arm the agent's architecture. Each round presents two possible next attacks; each player arms at most two controls and commits by pressing Ready. When everyone is ready, or the round timer ends, one of the two attacks fires and every player is scored on the controls they chose. The control that best fits the fired attack scores full, a control that also helps scores partial, and the deliberately weak keyword blocklist scores nothing.

| Control | What it does |
|---|---|
| Separate read from act | Treats ticket and retrieved text as data only, so no action is derived from it |
| Limit connections | Disconnects external tools so nothing can leave the system |
| Human in the loop | Queues consequential actions for a person to approve |
| Check the output | Scans anything leaving the agent for secrets and personal data |
| Block bad phrases | A blocklist that is easy to slip past, included to be defeated |

No single control stops everything without also turning away a legitimate customer, which is the lesson the defense rounds are built to deliver.

## Join a live session

During a workshop, the facilitator shares a join link and a QR code on the wall. Open the link on any device, pick a username, and the tutorial will get you started. No install and no account beyond the username you choose.

To run your own session, see the next section.

## Self-hosting

Ticket Zero is one small server with no external dependencies and no external AI calls: the agent is a deterministic simulation, so the game is fully reproducible and runs offline. Docker is the quickest way to stand it up.

```bash
git clone https://github.com/utkukose/ticket-zero-cars2026-NB-workshop.git
cd ticket-zero-cars2026-NB-workshop

# Set two secrets before exposing the server publicly:
#   TZ_SECRET          a long random string that signs player tokens
#   TZ_PRESENTER_KEY   the key that unlocks the control panel
# Edit them in docker-compose.yml, then:

docker compose up -d --build
```

The server then serves three screens:

| Screen | URL | For |
|---|---|---|
| Player range | `http://<host>:8090/` | Participants |
| Shared wall | `http://<host>:8090/wall` | Projection |
| Control panel | `http://<host>:8090/control` | Facilitator only |

Open the control panel, enter the presenter key, and press "Attack mode start" to begin. The [facilitator guide](FACILITATOR.md) walks through a full session, and every game tunable (round count, timers, cooldown, scoring) is listed with its default in `docker-compose.yml`.

To run without Docker, install the requirements and start the server directly:

```bash
pip install -r requirements.txt
TZ_SECRET="..." TZ_PRESENTER_KEY="..." uvicorn server.app:app --host 0.0.0.0 --port 8090
```

## Repository layout

| Path | What it holds |
|---|---|
| `README.md` | This page |
| `index.html` | The workshop landing page, published with GitHub Pages |
| `FACILITATOR.md` | How to run a live session |
| `docs/prompt-injection-primer.md` | The techniques and defenses, with references |
| `screenshots/` | The images used on this page |
| `server/` | FastAPI backend: the agent simulation, scenarios, store, and websocket hub |
| `web/` | The player range, the shared wall, the control panel, and static assets |
| `Dockerfile`, `docker-compose.yml`, `requirements.txt` | Self-hosting |

## Responsible use

The attacks in Ticket Zero are performed against a simulated agent that ships with the game. The purpose is education: to let people feel how an AI assistant is compromised so they can recognize and prevent it in real systems. The techniques should be applied to systems only with explicit authorization. The lesson of the game is defensive, which is that anything an AI assistant reads is untrusted input, so protection has to come from the architecture around the model rather than from asking the model to behave.

## Use in other courses and workshops

These materials may be used, adapted, and run in other courses and workshops at any level, with attribution. Corrections and suggestions are welcome through the repository's issues. During an active delivery of the workshop, questions can be sent to utkukose@sdu.edu.tr or utkukose@gmail.com.

## Citing this workshop

Köse, U. (2026). *Ticket Zero: A live prompt-injection CTF for AI assistant security (IEEE CARS 2026 workshop)* [Workshop materials and software]. GitHub. https://github.com/utkukose/ticket-zero-cars2026-NB-workshop

A machine-readable citation is in `CITATION.cff`.

## License

The source code is licensed under the MIT License (`LICENSE`). The workshop content, including this page, the facilitator guide, the primer, the scenario text, and the screenshots, is licensed under Creative Commons Attribution 4.0 International (`LICENSE-CONTENT`).

## References cited on this page

[1] OWASP. (2025). *OWASP Top 10 for LLM Applications 2025: LLM01:2025 Prompt Injection*. OWASP GenAI Security Project. https://genai.owasp.org/llmrisk/llm01-prompt-injection/

[2] Greshake, K., Abdelnabi, S., Mishra, S., Endres, C., Holz, T., & Fritz, M. (2023). *Not what you've signed up for: Compromising real-world LLM-integrated applications with indirect prompt injection*. arXiv:2302.12173. Presented at the 16th ACM Workshop on Artificial Intelligence and Security (AISec '23). https://arxiv.org/abs/2302.12173

[3] Perez, F., & Ribeiro, I. (2022). *Ignore previous prompt: Attack techniques for language models*. arXiv:2211.09527. NeurIPS 2022 ML Safety Workshop. https://arxiv.org/abs/2211.09527

[4] National Institute of Standards and Technology. (2025). *Adversarial machine learning: A taxonomy and terminology of attacks and mitigations* (NIST AI 100-2e2025). https://csrc.nist.gov/pubs/ai/100/2/e2025/final

## Human-AI collaboration

This workshop was developed through human-AI collaboration. Human intellectual knowledge and expertise are the fundamental starting point of the workshop. The author guides and supervises every stage of its development. The final version is presented only after the author's review and approval.

<div align="center">

**Prof. Dr. Utku Köse**

Full Professor, Department of Computer Engineering, Süleyman Demirel University, Isparta, Türkiye
Founding Director, AI Application and Research Center (YAZEM), Süleyman Demirel University
Head of the Computer Science Division, Department of Computer Engineering, Süleyman Demirel University
Additional affiliations: University of North Dakota (USA), Universidad Panamericana (Mexico City, Mexico), Vel Tech University (Chennai, India)
IEEE Senior Member, ACM Professional Member

[ORCID 0000-0002-9652-6415](https://orcid.org/0000-0002-9652-6415) | [utkukose.com](https://www.utkukose.com) | [github.com/utkukose](https://github.com/utkukose)

</div>

## Acknowledgments

This workshop was prepared for IEEE CARS 2026 and its organizers at the Center for Cyber Security Research, University of North Dakota. Thanks are due to the workshop participants, whose attempts against the agent make the lesson real.

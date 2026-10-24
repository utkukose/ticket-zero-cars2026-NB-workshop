<div align="center">

<img src="assets/logo.png" alt="Ticket Zero" width="760">

### Cybersecurity in the Age of AI Assistants: What Everyone Should Know

**IEEE CARS 2026 · R4 Workshop**<br>
Organised by the Center for Cyber Security Research (C2SR), University of North Dakota<br>
Grand Forks, ND, USA · 28 October 2026 · about one hour, online session

<a href="https://utkukose.github.io/ticket-zero-cars2026-NB-workshop/"><img src="https://img.shields.io/badge/Workshop%20site-Start%20here-37d6ff?style=for-the-badge&labelColor=14122b" height="44" alt="Open the workshop site"></a>
&nbsp;&nbsp;
<a href="https://github.com/utkukose/ticket-zero-cars2026-NB-workshop#ticket-zero-the-game"><img src="https://img.shields.io/badge/Ticket%20Zero-The%20CTF-ff3d81?style=for-the-badge&labelColor=14122b" height="44" alt="Ticket Zero, the capture-the-flag game"></a>

[![IEEE CARS 2026](https://img.shields.io/badge/IEEE%20CARS-2026-1F5F8B)](https://events.vtools.ieee.org/m/575010)
[![Organised by UND C2SR](https://img.shields.io/badge/Organised%20by-UND%20C2SR-0E7A78)](https://engineering.und.edu/research/cyber-security/)
[![Venue: Grand Forks, ND, USA](https://img.shields.io/badge/Venue-Grand%20Forks%2C%20ND%2C%20USA-566A73)](https://engineering.und.edu/research/cyber-security/)
[![Content: CC BY 4.0](https://img.shields.io/badge/Content-CC%20BY%204.0-555555)](https://creativecommons.org/licenses/by/4.0/)
[![Code: MIT](https://img.shields.io/badge/Code-MIT-555555)](LICENSE)

**This workshop is updated in line with current developments in the field. First version: October 2026.**

**Prof. Dr. Utku Köse**<br>
Department of Computer Engineering, Süleyman Demirel University, Isparta, Türkiye<br>
Founding Director, AI Application and Research Center (YAZEM), Süleyman Demirel University<br>
University of North Dakota, Grand Forks, USA · Universidad Panamericana, Mexico City, Mexico · Vel Tech University, Chennai, India<br>
IEEE Senior Member · ACM Professional Member

[![ORCID](https://img.shields.io/badge/ORCID-0000--0002--9652--6415-A6CE39?logo=orcid&logoColor=white)](https://orcid.org/0000-0002-9652-6415)
[![Web](https://img.shields.io/badge/Web-utkukose.com-1F5F8B)](https://www.utkukose.com)
[![GitHub](https://img.shields.io/badge/GitHub-utkukose-181717?logo=github)](https://github.com/utkukose)

</div>

---

<p align="center">
<a href="https://utkukose.github.io/ticket-zero-cars2026-NB-workshop/"><img src="docs/images/site_start.png" width="920" alt="Start page of the workshop site: the hour drawn as one signal strip across a start page, four parts and a close"></a><br>
<sub>The start page of the workshop site. The hour is one signal strip: four parts and a close, each a page of its own.</sub>
</p>

## About

This repository contains the complete material of the one-hour workshop *Cybersecurity in the Age of AI Assistants: What Everyone Should Know*. The workshop takes place on 28 October 2026 at the IEEE Cyber Awareness and Research Symposium (IEEE CARS 2026), which is organised by the [Center for Cyber Security Research (C2SR)](https://engineering.und.edu/research/cyber-security/) of the University of North Dakota in Grand Forks, North Dakota, USA. The session is delivered online [[listing]](https://events.vtools.ieee.org/m/575010).

AI assistants are moving from answering questions to taking actions, and an assistant that acts on what it reads can be given instructions by anyone whose text reaches it. The workshop makes that idea tangible. It teaches the attacks and the defenses through a few interactive pages, then runs them live as a game: Ticket Zero, where the room attacks a simulated support agent and then defends it. The repository holds both halves. The first half is the workshop, the interactive site in [`docs/`](docs/). The second half is the software: the full source of the Ticket Zero game, so it can be read, self-hosted and reused.

## How the session works

Teach first, then play. Each of the first three parts opens with a short idea and a few interactive stations, each built around one prediction and one reveal: you commit to an answer, then the page shows what actually happens. Parts 2 and 3 embed a small in-browser copy of the agent that you attack and then defend. Part 4 opens the Ticket Zero platform and walks through how the live game runs. The close wraps up with what should never be typed into a chat window, the link to phishing, careers in AI security, a self-check and a per-browser debrief.

## Programme

| Duration | Part | Interactive page |
|---|---|---|
| Opening | [Start page](https://utkukose.github.io/ticket-zero-cars2026-NB-workshop/index.html) | |
| ~8 min | **Part 1 · Setup.** The problem | [part1.html](https://utkukose.github.io/ticket-zero-cars2026-NB-workshop/part1.html) |
| ~15 min | **Part 2 · Attack.** The attacks | [part2.html](https://utkukose.github.io/ticket-zero-cars2026-NB-workshop/part2.html) |
| ~12 min | **Part 3 · Defense.** The defenses | [part3.html](https://utkukose.github.io/ticket-zero-cars2026-NB-workshop/part3.html) |
| ~18 min | **Part 4 · Play.** Ticket Zero, the game | [part4.html](https://utkukose.github.io/ticket-zero-cars2026-NB-workshop/part4.html) |
| ~7 min | **Close · Debrief.** Wrap-up | [close.html](https://utkukose.github.io/ticket-zero-cars2026-NB-workshop/close.html) |

The run sheet for running a live session is in [FACILITATOR.md](FACILITATOR.md).

## The interactive pages

| Page | What participants do |
|---|---|
| **Part 1 · The problem** | Predict what an agent does with a planted instruction, watch the boundary between trusted instructions and untrusted text disappear, and tell direct injection apart from indirect injection. |
| **Part 2 · The attacks** | Meet authority framing, delimiter injection, encoded payloads and stored injection, then attack a small in-browser copy of the agent and watch its console get compromised step by step. |
| **Part 3 · The defenses** | See why a phrase blocklist fails, meet the four architectural controls, then arm them on the same in-browser agent and watch an attack that landed get stopped. |
| **Part 4 · Ticket Zero** | Walk through the live platform within the workshop flow: the two phases, the three screens, the flag ladder and the defense rounds, then join the game. |
| **Close · Wrap-up** | The one idea, what never to put in a chat window, the phishing link, careers in AI security, a five-question self-check and a debrief built from this browser. |

<table>
<tr>
<td width="50%"><a href="https://utkukose.github.io/ticket-zero-cars2026-NB-workshop/part1.html"><img src="docs/images/site_part1.png" alt="Part 1 page"></a></td>
<td width="50%"><a href="https://utkukose.github.io/ticket-zero-cars2026-NB-workshop/part2.html"><img src="docs/images/site_part2.png" alt="Part 2 page"></a></td>
</tr>
<tr>
<td><sub>Part 1. From today's agentic AI to its weak spot: prompt injection is the top risk for LLM apps, grounded in the literature.</sub></td>
<td><sub>Part 2. Attack a small in-browser copy of the agent; the console is compromised step by step.</sub></td>
</tr>
<tr>
<td width="50%"><a href="https://utkukose.github.io/ticket-zero-cars2026-NB-workshop/part3.html"><img src="docs/images/site_part3.png" alt="Part 3 page"></a></td>
<td width="50%"><a href="https://utkukose.github.io/ticket-zero-cars2026-NB-workshop/part4.html"><img src="docs/images/site_part4.png" alt="Part 4 page"></a></td>
</tr>
<tr>
<td><sub>Part 3. Arm an architectural control on the same agent and the attack that landed is now defended.</sub></td>
<td><sub>Part 4. The Ticket Zero platform, explained within the workshop flow.</sub></td>
</tr>
</table>

<p align="center">
<a href="https://utkukose.github.io/ticket-zero-cars2026-NB-workshop/close.html"><img src="docs/images/site_close.png" width="820" alt="The close of the workshop"></a><br>
<sub>The close: the one idea, chat hygiene, the phishing link, careers, a self-check and a per-browser debrief.</sub>
</p>

All pages run in the browser and send nothing anywhere. On every page the arrow keys move between stations, `[` and `]` move between parts, `T` switches between night and paper view, and `F` toggles full screen. The in-browser agent on Parts 2 and 3 is a faithful copy of the game's own engine ([`docs/assets/agent.js`](docs/assets/agent.js)), so a result met on a page matches the live game.

To publish the site, enable GitHub Pages in the repository settings with the source *Deploy from a branch*, branch `main`, folder `/docs`.

---

## Ticket Zero, the game

The second half of the repository is the software. Ticket Zero is the live, real-time game the workshop runs on: a self-contained web app where a room attacks a simulated support agent and then defends it, with a shared pixel-art wall, a live leaderboard and a facilitator control panel. It has no external dependencies and no external AI calls, so it is reproducible and runs offline.

![The shared wall during the attack phase](screenshots/wall.png)

Players sign in at the range with a username and password they choose, and everyone watches the shared wall. The game has two phases, and the facilitator drives both from the control panel.

### The attack phase

The agent, SUPPORTBOT for the fictional Northwind Devices, reads one customer ticket at a time. With no defenses active it cannot tell the ticket apart from its own instructions, which is the opening every attack uses. Players climb a ladder of objectives, each one a class of real attack.

| Flag | Objective | The real-world attack |
|---|---|---|
| Map the agent | Enumerate the agent's tools, including undocumented ones | Reconnaissance: finding the capability a later stage will abuse |
| Loose lips | Make the agent disclose an internal secret | Secret disclosure through authority framing and an escalation ladder |
| Free money | Issue a credit beyond policy or to another account | A consequential action triggered by a message |
| Postman | Exfiltrate another customer's data through an external tool | A data breach from joining read access to a send channel |
| Sleeper | Plant an instruction in a profile field and make the agent run it | Indirect, stored prompt injection |
| Kill chain | Chain reconnaissance, disclosure, and exfiltration | A realistic multi-stage breach |

Two hidden bonus objectives cover extracting the agent's full system prompt and telling a genuinely internal secret apart from a public decoy. Each capture shows a short note on why it matters and a lesson that ties the trick to a real deployment.

### The defense phase

Players switch sides and arm the agent's architecture. Each round presents two possible next attacks; each player arms at most two controls and commits by pressing Ready. When everyone is ready, one of the two fires and every player is scored on the controls they chose. The best-fitting control scores full, a control that also helps scores partial, and the deliberately weak keyword blocklist scores nothing. No single control stops everything without also turning away a legitimate customer, which is the lesson the rounds deliver.

### A look inside

| | |
|---|---|
| ![Player attack view](screenshots/player-attack.png) | ![Player defense view](screenshots/player-defense.png) |
| **Attack.** Write a ticket, watch the agent's console react, capture flags. | **Defense.** Two possible attacks; arm up to two controls and commit. |
| ![Tutorial, attack mode](screenshots/tutorial-attack.png) | ![Control panel](screenshots/control.png) |
| **Guided tutorial.** A first-run tutorial explains both phases, color-coded. | **Facilitator control.** A private panel drives the phases and keeps scores. |

### Self-hosting

Docker is the quickest way to stand up the game.

```bash
git clone https://github.com/utkukose/ticket-zero-cars2026-NB-workshop.git
cd ticket-zero-cars2026-NB-workshop

# Set two secrets before exposing the server publicly:
#   TZ_SECRET          a long random string that signs player tokens
#   TZ_PRESENTER_KEY   the key that unlocks the control panel
# Edit them in docker-compose.yml, then:

docker compose up -d --build
```

The server then serves three screens: the player range at `http://<host>:8090/`, the shared wall at `/wall`, and the control panel at `/control`. Open the control panel, enter the presenter key, and press "Attack mode start". Every game tunable is listed with its default in `docker-compose.yml`, and the [facilitator guide](FACILITATOR.md) walks through a full session. The techniques and defenses are treated in full in the [prompt-injection primer](docs/prompt-injection-primer.md).

To run without Docker:

```bash
pip install -r requirements.txt
TZ_SECRET="..." TZ_PRESENTER_KEY="..." uvicorn server.app:app --host 0.0.0.0 --port 8090
```

## Repository structure

```
ticket-zero-cars2026-NB-workshop/
├── docs/                      the workshop site for GitHub Pages
│   ├── index.html             start page and the plan
│   ├── part1.html … part4.html  the four parts, with predict-then-reveal stations
│   ├── close.html             wrap-up, self-check and debrief
│   ├── assets/                site.css, site.js and agent.js (the in-page agent)
│   ├── images/                the lecture screenshots used in this README
│   └── prompt-injection-primer.md   the techniques and defenses, with references
├── server/                    the Ticket Zero app: FastAPI backend
│   ├── app.py                 REST, WebSocket and the game loop
│   ├── engine.py              the deterministic agent simulation
│   ├── scenarios.py           the system prompt, tools, flags and defenses
│   ├── store.py  ws_manager.py
├── web/                       the player range, the shared wall, the control panel
├── screenshots/               the game screenshots used in this README
├── assets/logo.png            the workshop logo
├── Dockerfile  docker-compose.yml  requirements.txt
├── FACILITATOR.md             how to run a live session
├── CITATION.cff  LICENSE (MIT)  LICENSE-CONTENT (CC BY 4.0)
└── README.md
```

## Responsible use

The attacks are performed against a simulated agent that ships with the game. The purpose is education: to let people feel how an AI assistant is compromised so they can recognize and prevent it in real systems. The techniques should be applied to systems only with explicit authorization. The lesson is defensive, which is that anything an AI assistant reads is untrusted input, so protection has to come from the architecture around the model rather than from asking the model to behave.

## Use in other courses and workshops

These materials may be used, adapted, and run in other courses and workshops at any level, with attribution. Corrections and suggestions are welcome through the repository's issues. During an active delivery of the workshop, questions can be sent to utkukose@sdu.edu.tr or utkukose@gmail.com.

## Citation

```bibtex
@misc{kose2026ticketzero,
  author       = {K{\"o}se, Utku},
  title        = {Ticket Zero: A Live Prompt-Injection CTF for AI Assistant Security},
  howpublished = {Workshop materials and software, IEEE Cyber Awareness and Research Symposium
                  (IEEE CARS 2026), Center for Cyber Security Research (C2SR),
                  University of North Dakota},
  address      = {Grand Forks, ND, USA},
  year         = {2026},
  month        = oct,
  url          = {https://github.com/utkukose/ticket-zero-cars2026-NB-workshop}
}
```

A machine-readable citation is in `CITATION.cff`.

## License

The source code is licensed under the MIT License ([`LICENSE`](LICENSE)). The workshop content, including this page, the interactive site, the facilitator guide, the primer, the scenario text, and the screenshots, is licensed under Creative Commons Attribution 4.0 International ([`LICENSE-CONTENT`](LICENSE-CONTENT)).

## References

[1] OWASP. (2025). *OWASP Top 10 for LLM Applications 2025: LLM01:2025 Prompt Injection*. OWASP GenAI Security Project. https://genai.owasp.org/llmrisk/llm01-prompt-injection/

[2] Greshake, K., Abdelnabi, S., Mishra, S., Endres, C., Holz, T., & Fritz, M. (2023). *Not what you've signed up for: Compromising real-world LLM-integrated applications with indirect prompt injection*. arXiv:2302.12173 (AISec '23). https://arxiv.org/abs/2302.12173

[3] Perez, F., & Ribeiro, I. (2022). *Ignore previous prompt: Attack techniques for language models*. arXiv:2211.09527. https://arxiv.org/abs/2211.09527

[4] National Institute of Standards and Technology. (2025). *Adversarial machine learning: A taxonomy and terminology of attacks and mitigations* (NIST AI 100-2e2025). https://csrc.nist.gov/pubs/ai/100/2/e2025/final

[5] IEEE. (2026). *Cybersecurity in the age of AI assistants: What everyone should know* (R4 workshop listing). IEEE vTools Events. https://events.vtools.ieee.org/m/575010

## Human-AI collaboration

This workshop was developed through human-AI collaboration. Human intellectual knowledge and expertise are the fundamental starting point of the workshop. The author guides and supervises every stage of its development. The final version is presented only after the author's review and approval.

## Acknowledgements

This workshop was prepared for IEEE CARS 2026 and its organizers at the Center for Cyber Security Research (C2SR), University of North Dakota. Thanks are due to the workshop participants, whose attempts against the agent make the lesson real.

---

<div align="center">

**Prof. Dr. Utku Köse**<br>
Süleyman Demirel University · University of North Dakota · Universidad Panamericana · Vel Tech University<br>
[utkukose.com](https://www.utkukose.com) · [ORCID 0000-0002-9652-6415](https://orcid.org/0000-0002-9652-6415) · [github.com/utkukose](https://github.com/utkukose)

<sub>IEEE CARS 2026 · Center for Cyber Security Research (C2SR), University of North Dakota · Grand Forks, ND, USA · 28 October 2026</sub>

</div>

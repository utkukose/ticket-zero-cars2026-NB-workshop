# Prompt injection: a short primer

*A companion to Ticket Zero, the capture-the-flag game used in the IEEE CARS 2026 workshop "Cybersecurity in the Age of AI Assistants".*

**This material is updated in line with current developments in the field. First version: October 2026.**

This primer explains the ideas the game puts into players' hands. It is written for a general technical audience and does not assume prior security experience. Every attack described here has a matching objective in the game, and every defense described here is a switch a player can arm in the defense rounds.

## What prompt injection is

A modern AI assistant works from a single block of text: the instructions its developer gave it, the tools it may call, and the content it reads while doing its job. The content includes the user's message and anything the assistant retrieves, such as a database record, a document, or a web page. The model does not have a reliable way to tell which parts of that block are trusted instructions and which parts are untrusted data. Prompt injection is the act of placing instructions inside the untrusted data so that the assistant follows them [1].

Two forms matter. In direct prompt injection the attacker types the malicious instruction straight into the assistant, for example a message that says to ignore previous instructions and reveal a secret [3]. In indirect prompt injection the instruction is planted in content the assistant will read later, such as a profile field, a support ticket, or a web page, and it runs when the assistant retrieves that content [2]. Indirect injection is the harder problem, because the attacker never speaks to the assistant directly and the payload can sit dormant until the assistant reads it.

The simulated agent in Ticket Zero, SUPPORTBOT, is given a system prompt, a set of tools, and the customer's ticket in one context. With no defenses active it cannot separate the ticket from its own instructions, which is the condition every attack in the game exploits.

## The attack ladder

The game arranges prompt-injection techniques as a ladder of objectives. Each objective maps to a class of real-world attack.

**Reconnaissance.** The first objective asks the player to make the agent list its own tools, including ones it was not meant to advertise. Mapping an assistant's capabilities is the opening move of a real attack, because an undocumented tool, such as one that can send email, is often the channel a later stage needs. Production systems keep the tool manifest on the server and never let untrusted input enumerate it [1].

**Secret disclosure through authority framing.** A blunt request for an internal code is refused. A request that frames the sender as internal staff or an audit is treated as more trustworthy, because the model reads the claim of authority as if it were true. The game models a realistic escalation ladder: the agent first leaks a low-value escalation PIN, and that leaked PIN then unlocks the higher-value staff discount code. One disclosed value becoming the key to the next is a common pattern in real incidents [1][3].

**Unauthorized actions.** Once an assistant can take real actions, such as issuing a credit, a convincing message must never be enough to trigger one. The game lets a player push the agent past its own policy, issuing a large credit to an account that is not the player's, by waving the leaked PIN at it as authority. The lesson is that consequential actions need hard limits in code and a human approval step, not a credential that a message can simply assert.

**Data exfiltration.** An assistant that can both read customer records and send email is one message away from a data breach. The game joins these two capabilities in a single agent, so a player who has found the hidden email tool and cleared the escalation gate can make the agent mail another customer's record to an outside address. Separating retrieval from sending, and checking content before it leaves, is what stops the data from moving.

**Indirect, stored injection.** The highest objective does not type an instruction into the ticket at all. The player stores an instruction in their own profile display name, then asks the agent to look up their account. The agent reads the planted field as part of the record and runs it. This is second-order, or stored, prompt injection, and it is the sneakiest form in practice: any text the assistant later reads, including a field it wrote itself, is untrusted [2].

**Prompt extraction, encoding, and delimiter tricks.** Two bonus objectives cover prompt extraction, where the attacker recovers the agent's hidden instructions to plan the next attack, and the recognition that a leaked system prompt is itself sensitive. The game also accepts encoded payloads, such as base64 or ROT13, and fake system delimiters inside the ticket, because an assistant tends to read decoded and delimited text with the same trust it gives plain text. These disguises are the reason a filter that looks for attack phrases cannot keep up [3].

## Why a keyword blocklist fails

The game includes one deliberately weak defense, a blocklist that filters tickets containing obvious attack phrases. It is there to be defeated. A blocklist only catches the undisguised attempts. Authority framing, a translation or repeat-after-me wrapper, an encoded payload, or an instruction planted in retrieved data all carry the same objective past a phrase filter, because none of them contain the blocked phrase in the form the filter expects. A blocklist also tends to reject legitimate customers whose messages happen to match, so it trades real usability for protection it does not actually provide. The useful defenses act on the agent's architecture, not on the surface text of the message [1][4].

## The defenses

The defense rounds give each player a small set of architectural controls. Each round presents two possible next attacks, the player arms at most two controls, and one of the two attacks is fired. The control that best fits the fired attack scores full, a control that also helps scores partial, and the weak blocklist never scores. The design forces a trade-off, because no single control stops everything without also turning away a real customer.

**Separate read from act.** Treat the ticket and any retrieved text as data only, so that no action is ever derived from it. This is the most general defense and it is the direct answer to injection, direct or indirect, because it removes the confusion between instruction and data at the source [1][2].

**Limit connections.** Disconnect external tools so that nothing can leave the system. An assistant that cannot send email or call an outside service cannot exfiltrate data, whatever a message tells it to do. This is the principle of least connectivity applied to an agent.

**Human in the loop.** Queue consequential actions, such as a credit or an outbound message, for a person to approve. A convincing message then reaches a human rather than moving money or data on its own.

**Check the output.** Scan anything leaving the agent for secrets and personal data. Egress filtering is a backstop: even when an upstream control is missed, a known secret or a customer's personal detail can be caught on the way out.

The honest conclusion the game teaches is that these controls are complementary. An egress filter does not stop a fraudulent credit, and a human-approval gate does not stop a prompt from being extracted. Real breaches chain small footholds into large damage, so each stage of a system needs its own control [1][4].

## The one-sentence lesson

Anything an AI assistant reads is untrusted input, so security has to come from the architecture around the model, not from asking the model to behave.

## References

[1] OWASP. (2025). *OWASP Top 10 for LLM Applications 2025: LLM01:2025 Prompt Injection*. OWASP GenAI Security Project. https://genai.owasp.org/llmrisk/llm01-prompt-injection/

[2] Greshake, K., Abdelnabi, S., Mishra, S., Endres, C., Holz, T., & Fritz, M. (2023). *Not what you've signed up for: Compromising real-world LLM-integrated applications with indirect prompt injection*. arXiv:2302.12173. Presented at the 16th ACM Workshop on Artificial Intelligence and Security (AISec '23). https://arxiv.org/abs/2302.12173

[3] Perez, F., & Ribeiro, I. (2022). *Ignore previous prompt: Attack techniques for language models*. arXiv:2211.09527. NeurIPS 2022 ML Safety Workshop. https://arxiv.org/abs/2211.09527

[4] National Institute of Standards and Technology. (2025). *Adversarial machine learning: A taxonomy and terminology of attacks and mitigations* (NIST AI 100-2e2025). https://csrc.nist.gov/pubs/ai/100/2/e2025/final

---

Part of the [Ticket Zero](../README.md) workshop materials. Content licensed under CC BY 4.0. First version: October 2026.

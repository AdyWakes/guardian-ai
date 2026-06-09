# Foundry IQ Knowledge Corpus

This folder contains the safety knowledge corpus that Guardian AI uploads to its **Azure AI Foundry Agent** as a file_search knowledge source.

Each file describes one safety scenario in a consistent format: title, brief context, numbered safety steps, sources, and a footer with category, urgency, and the legacy knowledge ID used by the local-JSON fallback.

## How Guardian AI uses these files

1. The Foundry agent is created in the Azure AI Foundry portal with the `file_search` tool enabled.
2. All `*.md` files in this folder are uploaded to the agent as knowledge.
3. At runtime, `src/lib/foundryIQ.ts` calls the agent with a user query (e.g. *"I feel unsafe walking home"*).
4. The agent retrieves the most relevant files, returns grounded JSON, and the response includes citation annotations identifying which file(s) were used.
5. The Guardian AI UI surfaces these citations as the "Foundry IQ sources" pills on the risk panel.

If the Foundry agent is unreachable or unconfigured, Guardian AI falls back to `data/safetyKnowledge.json` so the demo always works.

## Files

| File | Scenario | Urgency |
|---|---|---|
| `stalking-being-followed.md` | Being followed in public | High |
| `unsafe-transportation.md` | Unsafe inside a vehicle / rideshare | High |
| `unsafe-place.md` | General unsafe-feeling in an unknown environment | Medium |
| `bar-club-safety.md` | Feeling unsafe at a bar, club, or party | Medium |
| `home-intruder.md` | Suspected intruder at home | High |
| `domestic-escalation.md` | Domestic situation becoming hostile | High |
| `general-safety.md` | Baseline safety check-in | Low |
| `safe-home-checkin.md` | Confirming "I am safe at home" | Low |
| `night-walking.md` | Walking alone at night | Medium |
| `online-meeting.md` | Meeting an online contact in person | Medium |

## Updating the corpus

To add a new scenario:

1. Create a new `*.md` file following the format of the existing entries.
2. Re-upload the folder to the Foundry agent's knowledge in the Azure portal (or use the Foundry CLI / SDK).
3. Add the same knowledge to `data/safetyKnowledge.json` so demo-mode fallback stays aligned.

## Why markdown, not JSON

Foundry IQ's `file_search` vector store works best with prose-like documents that have clear titles, structured sections, and natural language. Markdown gives the embedding model better signal than minified JSON and stays human-readable for repository browsers.

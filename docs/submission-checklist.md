# Submission Checklist — Microsoft Agents League

Guardian AI is entered in the **Reasoning Agents** challenge, whose required
developer technology is **Microsoft Foundry**.

> Always confirm against the official rules on the Contest Website before
> submitting — this checklist reflects the published "How to Enter" /
> submission requirements as of writing.

## Required developer technology (per challenge)

| Challenge | Required tech | Used here? |
|---|---|---|
| Creative Apps | GitHub Copilot | — |
| **Reasoning Agents** | **Microsoft Foundry** | ✅ Yes |
| Enterprise Agents | Microsoft 365 Copilot | — |

GitHub Copilot is the technology for the *Creative Apps* challenge and is **not
required** for Reasoning Agents. No Copilot evidence is needed for this entry.

## Submission requirements

- [x] **Working Agent built with the required tool (Microsoft Foundry).**
      A single Azure AI Foundry agent does grounded retrieval (file_search over
      the safety corpus) + multi-step risk reasoning per call.
- [x] **Public GitHub repository** with the source code:
      https://github.com/AdyWakes/guardian-ai
- [x] **Architecture diagram** showing how the solution uses Microsoft Foundry:
      see [docs/architecture.md](architecture.md) (Mermaid diagram).
- [ ] **Demo video (5 minutes max)** showing the project in action, uploaded to
      YouTube or Vimeo. Must not include third-party trademarks or copyrighted
      material (watch background music; avoid prominent third-party logos).
- [ ] **Project description** explaining features, functionality, problem
      solved, and technologies used: draft in
      [docs/submission-description.md](submission-description.md).
- [ ] **Team member info / Microsoft Learn usernames** (if applicable).
- [ ] **Register, activate profile, and submit** the Agent + Demo Video via the
      "Projects" tab on the Contest Website.

## Microsoft Foundry integration (the core requirement)

- Code boundary: [`src/lib/foundryIQ.ts`](../src/lib/foundryIQ.ts)
- Live function: `assessWithFoundryAgent(input)`
- Real path: Azure AI Foundry agent via the Responses API with `agent_reference`
- Grounding: file_search over the markdown corpus in
  [`data/foundry-knowledge/`](../data/foundry-knowledge)
- Demo path: local `data/safetyKnowledge.json` fallback so judges can run it
  without credentials

To prove the live integration, `GET /api/status` returns:

```json
{ "is_demo_mode": false, "foundry_configured": true }
```

and an assessment returns a real `reasoning_summary` plus `.md` source
citations (visible as the "Foundry IQ · live" badge in the UI).

## Demo video flow (≤5 min)

1. Landing page → mention prototype disclaimer.
2. Safety Mode: type "I feel unsafe walking home alone at night".
3. Answer a follow-up; show the right-rail reasoning trace filling in.
4. Point out the **"Foundry IQ · live"** badge (real Microsoft Foundry grounding).
5. Show the risk card, action plan, and source citations.
6. Trigger Send Alert; show the alert arriving in Telegram.
7. Briefly show `/api/status` (`is_demo_mode: false`) or the architecture diagram.

## Security note

Rotate the Telegram bot token and Azure Foundry API key before final
submission if they have been exposed during development. The live app reads
secrets from Vercel environment variables, so rotation does not affect judges.
Never commit real secrets (`.env.local` is gitignored).

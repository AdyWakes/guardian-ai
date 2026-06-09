# Submission Checklist

Use this before submitting Guardian AI to Microsoft Agents League.

## Required

- Public GitHub repository.
- README with setup, demo mode, safety disclaimer, and judging alignment.
- GitHub Copilot usage documented in `docs/copilot-usage.md`.
- Microsoft IQ integration documented and visible in code.
- Demo video.
- Prototype disclaimer shown in app and README.

## GitHub Copilot Requirement

Before submission:

1. Use GitHub Copilot or Copilot Chat on at least a few real development tasks.
2. Add short notes and screenshots to `docs/copilot-usage.md`.
3. Mention Copilot usage in the demo video or README.

Do not rely on this Codex chat as Copilot evidence. The requirement specifically names GitHub Copilot.

## Microsoft IQ Requirement

Guardian AI uses Foundry IQ as the Microsoft IQ layer:

- Code boundary: `src/lib/foundryIQ.ts`
- Public function: `retrieveSafetyKnowledge(query)`
- Real path: Azure AI Foundry Agent Service when env vars are configured
- Demo path: local `data/safetyKnowledge.json` fallback

For the strongest submission, configure a real Foundry Agent and show `/api/status` returning:

```json
{
  "foundry_configured": true
}
```

If you submit without Foundry credentials, explain that the Foundry IQ adapter is implemented and demo mode uses a local mock fallback for judge reliability. This is weaker than a live Foundry demo.

## Demo Video Flow

1. Show landing page.
2. Mention prototype disclaimer.
3. Show Safety Mode.
4. Say or type: `Very unsafe place, take the appropriate measures`.
5. Show automatic location/media permission flow.
6. Show risk card, action plan, retrieved sources, and alert result.
7. Show `/api/status` or README section explaining Foundry IQ integration.
8. Mention GitHub Copilot evidence in `docs/copilot-usage.md`.

## Environment Variables

Required for live integrations:

```env
AZURE_AI_FOUNDRY_ENDPOINT=
AZURE_AI_FOUNDRY_API_KEY=
AZURE_AI_AGENT_ID=
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```

Never commit real secrets to GitHub.

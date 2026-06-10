# Guardian AI

**An AI safety companion that thinks before emergencies become disasters.**

Guardian AI is a hackathon MVP for the Microsoft Agents League, built for the Reasoning Agents track.

### 🔗 Live demo: **https://guardian-ai-peach.vercel.app**

Open `/safety`, type *"I feel unsafe walking home alone at night"*, and watch the
right-rail reasoning trace ground its assessment in **Microsoft Foundry IQ**
(look for the **"Foundry IQ · live"** badge). A single Azure AI Foundry agent
call does both knowledge retrieval and multi-step risk reasoning.

## What Guardian AI Does

Guardian AI is a web-based AI safety companion for potentially unsafe situations. It gathers quick context, retrieves safety guidance, classifies risk, creates an action plan, previews an emergency message, and can send that message through Telegram, with optional WhatsApp Cloud API support.

This prototype is designed for demos and judging. It is not a replacement for emergency services.

## Core Features

- Landing page with the Guardian AI tagline and a Start Safety Mode button.
- Safety Mode chat flow where a user can type "I feel unsafe".
- Natural language triage that treats "I feel safe" as a safe check-in, not an emergency.
- Context inference, so "I am alone" fills the Alone field instead of asking it again.
- Conversational `/api/chat` endpoint for free-form safety conversation instead of a rigid yes/no form.
- Three follow-up safety questions:
  - Can you speak safely?
  - Are you alone?
  - Is someone following or threatening you?
- Browser geolocation with an explicit demo-location fallback.
- LOW, MEDIUM, or HIGH risk card.
- Action plan card grounded by Foundry IQ or local mock knowledge.
- Emergency alert preview.
- Telegram alert sending through `/api/send-alert`.
- Optional WhatsApp Cloud API alert sending through the same `/api/send-alert` route.
- Assistant-style voice wake demo using the phrase "Guardian" followed by a concern.
- Alert preview metadata for location, voice activation, and browser media clip support.
- Automatic alert flow for urgent phrases such as "Very unsafe place, take the appropriate measures"; the browser requests location and a short video clip, falls back to audio if camera access is blocked, then sends the alert.
- Demo mode that works without real API keys.

## Architecture

See [docs/architecture.md](docs/architecture.md) for the full architecture
diagram (rendered on GitHub). In short: the browser chat UI calls Next.js API
routes, which delegate to a single **Azure AI Foundry agent** that performs both
grounded knowledge retrieval (Foundry IQ `file_search`) and multi-step risk
reasoning in one call, then alerts are delivered via the Telegram Bot API.

## Microsoft IQ / Foundry IQ Integration

The Microsoft IQ integration is isolated in [src/lib/foundryIQ.ts](src/lib/foundryIQ.ts). The risk assessment pipeline calls the configured Azure AI Foundry agent first, then falls back to local mock knowledge if Foundry is unavailable.

When Azure AI Foundry environment variables are present, the adapter uses the Microsoft Foundry project Responses API:

```text
POST {projectEndpoint}/openai/v1/responses
body: {
  "agent_reference": { "type": "agent_reference", "name": "<agent-name>" },
  "input": "structured safety situation"
}
```

The agent is instructed to return a complete safety assessment in JSON. The app uses that result directly:

```ts
{
  risk_level: "LOW" | "MEDIUM" | "HIGH";
  reasoning_summary: string;
  immediate_steps: string[];
  sources: string[];
}
```

When Foundry credentials are missing or a Foundry call fails, the adapter falls back to [data/safetyKnowledge.json](data/safetyKnowledge.json). This keeps the demo reliable while showing the production integration structure.

The app includes a local demo responder so judges can test without keys. Full ChatGPT/Gemini-style open-ended intelligence requires a configured Azure AI Foundry Agent behind the same backend boundary.

## Agent Response Shape

The `/api/assess` route returns the hackathon-facing contract:

```json
{
  "risk_level": "HIGH",
  "reasoning_summary": "User reports being followed or threatened.",
  "immediate_steps": ["Call emergency services now if there is immediate danger"],
  "emergency_message": "[URGENT] SAFETY ALERT - HIGH RISK...",
  "retrieved_sources": ["Azure AI Foundry Agent Service"],
  "is_demo_mode": false
}
```

Voice-activated demo assessments also include this metadata inside the alert message:

```text
Activation: Voice wake phrase "Guardian"
Emergency clip: Video attached when browser camera permission is allowed; audio fallback may be used
Video clip: Included when available.
```

## Demo Mode

Guardian AI works out of the box without API keys.

Demo mode uses:

- Mock Foundry IQ retrieval from `data/safetyKnowledge.json`.
- A simulated trusted Telegram contact and optional demo WhatsApp channel.
- A demo location button using Seattle coordinates.
- Browser speech recognition where available for the "Guardian ..." voice demo.
- Demo media attachment handling for automatic alert clips.
- A visible Demo Mode banner in Safety Mode.

Demo mode is active whenever Foundry or Telegram credentials are missing.

## Tech Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- Azure AI Foundry Agent Service
- Foundry IQ retrieval adapter
- Telegram Bot API
- Optional WhatsApp Cloud API
- Browser geolocation
- Vercel deployment

## Setup

### Prerequisites

- Node.js 18+
- npm
- Optional: Azure AI Foundry project and agent
- Optional: Telegram bot and chat ID
- Optional: Meta WhatsApp Cloud API test or business phone number

### Install

```bash
npm install
```

### Environment Variables

Copy the example file:

```bash
cp .env.example .env.local
```

Set these variables for real integrations, or leave them blank for demo mode:

```env
AZURE_AI_FOUNDRY_ENDPOINT=https://your-ai-services-resource.services.ai.azure.com/api/projects/your-project
AZURE_AI_FOUNDRY_API_KEY=your-api-key-or-bearer-token
AZURE_AI_AGENT_NAME=your-agent-name
AZURE_AI_AGENT_VERSION=

TELEGRAM_BOT_TOKEN=your-bot-token
TELEGRAM_CHAT_ID=your-chat-id

# Optional. Leave blank to keep WhatsApp in demo/skipped mode.
WHATSAPP_ACCESS_TOKEN=your-whatsapp-cloud-api-token
WHATSAPP_PHONE_NUMBER_ID=your-whatsapp-phone-number-id
WHATSAPP_RECIPIENT_PHONE=recipient-phone-with-country-code
WHATSAPP_GRAPH_API_VERSION=v23.0
```

### Run Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Build

```bash
npm run build
npm start
```

## Telegram Setup

1. Message [@BotFather](https://t.me/botfather).
2. Create a bot with `/newbot`.
3. Copy the token into `TELEGRAM_BOT_TOKEN`.
4. Send a message to your bot from the target Telegram account or group.
5. Get the chat ID and set `TELEGRAM_CHAT_ID`.

## WhatsApp Setup (Optional)

Telegram is the recommended free real-send channel for the hackathon demo.

WhatsApp support is optional because the official WhatsApp Cloud API can require a Meta developer setup, a WhatsApp Business phone number, and billing depending on message type, country, and production usage. If these variables are missing, Guardian AI still works and the WhatsApp channel returns a demo response.

To test WhatsApp Cloud API:

1. Create or open a Meta developer app with WhatsApp enabled.
2. Use the WhatsApp API setup page to get an access token and phone number ID.
3. Add a recipient/test phone number allowed by the Meta setup page.
4. Set `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, and `WHATSAPP_RECIPIENT_PHONE`.
5. Restart the app.

The app sends the emergency text to WhatsApp. Media clips are attempted only when the captured format is supported by WhatsApp Cloud API; the browser MVP usually records WebM, so Telegram remains the stronger clip path for video/audio clips.

## Deploy on Vercel

1. Push this project to a public GitHub repository.
2. Import the repository in Vercel.
3. Use the default Next.js settings.
4. Add the environment variables in Vercel Project Settings > Environment Variables.
5. Deploy.

If you omit the environment variables, the deployed app still works in demo mode.

## Project Structure

```text
guardian-ai/
|-- src/
|   |-- app/
|   |   |-- api/
|   |   |   |-- assess/
|   |   |   |-- send-alert/
|   |   |   `-- status/
|   |   |-- safety/
|   |   |-- globals.css
|   |   |-- layout.tsx
|   |   `-- page.tsx
|   `-- lib/
|       |-- foundryIQ.ts
|       |-- riskAssessment.ts
|       |-- telegram.ts
|       `-- whatsapp.ts
|-- data/
|   `-- safetyKnowledge.json
|-- docs/
|   `-- architecture.md
|-- .env.example
|-- README.md
`-- package.json
```

## Safety Disclaimer

Guardian AI is a prototype for demonstration purposes only.

- It is not an emergency-service replacement.
- Always call 911 or your local emergency number in a real emergency.
- Do not rely solely on this application for safety-critical decisions.
- Location data can be delayed or inaccurate.
- Demo mode does not send real alerts.
- WhatsApp is optional and may not be free in production; Telegram remains the free default alert path.

## Hackathon Judging Alignment

Guardian AI aligns with the Reasoning Agents track through:

- **Microsoft Foundry** as the required developer technology: a single Azure AI
  Foundry agent performs both grounded knowledge retrieval (Foundry IQ /
  file_search) and multi-step risk reasoning in one call.
- A multi-step reasoning flow: user context, follow-up questions, location, risk classification, action plan, and alert preview.
- Grounded safety guidance with displayed source citations.
- Explainable, situation-specific risk summaries.
- A working demo mode that judges can run without credentials.
- A deployment-ready Next.js and Vercel architecture (live deployment).

See [docs/submission-checklist.md](docs/submission-checklist.md) before final submission.

## Demo Video Checklist

- Show the landing page and Start Safety Mode.
- Show the Assistant Mode panel and say "Guardian, I am alone and feel unsafe" if the browser supports speech recognition.
- Type "I feel unsafe".
- Answer the three follow-up questions.
- Use Demo Location if running without browser permissions.
- Show the risk card, action plan, sources, and alert preview.
- Point out that the alert flow includes location and a short video clip when camera permission is allowed, with audio fallback.
- Click Send Alert and show the demo success response.
- Mention the prototype disclaimer.

## License

MIT

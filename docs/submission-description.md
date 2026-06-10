# Project Description (for the Contest "Projects" submission)

Copy the version that fits the form. The short version is safest if the field
has a tight character limit; the full version is better when there is room.

---

## Short version (~80 words)

**Guardian AI — an AI safety companion for the Reasoning Agents challenge.**

When someone feels unsafe, Guardian AI gathers context through natural
conversation, then a single Azure AI Foundry agent performs grounded knowledge
retrieval (Foundry IQ `file_search`) and multi-step risk reasoning in one call —
classifying risk as LOW/MEDIUM/HIGH, producing an explainable summary and an
action plan with cited sources, and sending an emergency alert with location to
a trusted contact via Telegram. Built on Microsoft Foundry, Next.js, and Vercel.

---

## Full version

**Problem.** In a moment of feeling unsafe, people don't have time to think
clearly or search for guidance. Existing safety apps are mostly one-tap panic
buttons with no understanding of the actual situation.

**What it does.** Guardian AI is a web-based AI safety companion. The user
describes their situation in plain language ("I feel unsafe walking home alone
at night"). The agent asks brief follow-up questions, infers context, and then
reasons over the situation to:

- classify risk as **LOW / MEDIUM / HIGH**,
- produce an **explainable reasoning summary** specific to the situation,
- generate a **prioritized action plan**, and
- send an **emergency alert** with the user's location (and an optional short
  media clip) to a trusted contact via Telegram.

**How it uses Microsoft Foundry (Reasoning Agents challenge).** The core is a
single **Azure AI Foundry agent** (`guardian-safety-retriever`) invoked through
the Foundry Responses API with `agent_reference`. In one call it performs both:

1. **Grounded retrieval** — Foundry IQ `file_search` over a curated safety
   knowledge corpus, returning cited sources (visible in the UI as a
   "Foundry IQ · live" badge), and
2. **Multi-step risk reasoning** — classification, explanation, and action
   planning grounded in that retrieved knowledge.

This is true multi-step reasoning over grounded enterprise knowledge — the heart
of the Reasoning Agents challenge — with hallucination reduced by citing the
corpus. A local knowledge fallback keeps a demo working without credentials.

**Technologies used.** Microsoft Foundry (Azure AI Foundry agent + Foundry IQ
file_search), Next.js (App Router) + TypeScript, Tailwind CSS, Telegram Bot API,
browser Geolocation / MediaRecorder / SpeechRecognition, deployed on Vercel.

**Reliability & safety.** Same-origin protection and rate limiting on the alert
endpoint; the optional media clip never blocks the critical alert; a clear
prototype disclaimer ("not a replacement for emergency services") in the UI.

**Live demo:** https://guardian-ai-peach.vercel.app
**Source:** https://github.com/AdyWakes/guardian-ai

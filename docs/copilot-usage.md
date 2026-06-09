# GitHub Copilot Usage Log

The Microsoft Agents League requires evidence of meaningful **GitHub Copilot**
usage during development. This file is where you record that evidence.

> **Do not fabricate evidence.** This log must reflect real Copilot / Copilot
> Chat sessions. The fastest honest path is to actually run the short tasks in
> the "Quick ways to generate real evidence" section below, then screenshot
> them and fill in the table.

## How to capture evidence

For each Copilot session:

1. Use **GitHub Copilot** (inline completions) or **Copilot Chat** in VS Code
   (or your IDE) on this repository.
2. Take a screenshot showing the Copilot suggestion or chat response.
3. Save the screenshot under `docs/copilot/` (create the folder) and link it.
4. Fill in one row of the log below.

## Quick ways to generate real evidence (≈15 min total)

These are genuine, useful Copilot tasks on this exact codebase. Running them
produces real, honest evidence — and may even improve the project.

1. **Explain code with Copilot Chat.** Open `src/lib/foundryIQ.ts`, select
   `assessWithFoundryAgent`, and ask Copilot Chat: *"Explain what this function
   does and why it uses agent_reference instead of the model field."*
   Screenshot the explanation.

2. **Generate a unit test.** Open `src/lib/safetyConversation.ts` and ask
   Copilot Chat: *"Write a unit test for applyYesNoToLastQuestion covering yes,
   no, and a non-yes/no message."* Screenshot the generated test.

3. **Inline completion.** In `src/lib/riskAssessment.ts`, start typing a new
   helper (e.g. a comment `// format a short risk label for the UI`) and let
   Copilot autocomplete the function body. Screenshot the ghost-text suggestion.

4. **Debugging help.** Paste a real error you hit during this build (e.g. the
   Foundry `DeploymentNotFound` 404) into Copilot Chat and ask how to diagnose
   it. Screenshot the response.

## Usage log

Fill one row per session. Add as many as you have.

| # | Date | Tool | Task / prompt | What Copilot helped with | Files | Evidence |
|---|------|------|---------------|--------------------------|-------|----------|
| 1 |      | Copilot Chat | _e.g. "Explain assessWithFoundryAgent"_ | _e.g. clarified the Responses API flow_ | `src/lib/foundryIQ.ts` | `docs/copilot/01.png` |
| 2 |      | Copilot Chat | | | `src/lib/safetyConversation.ts` | |
| 3 |      | Copilot (inline) | | | `src/lib/riskAssessment.ts` | |
| 4 |      | Copilot Chat | | | | |

## Detailed notes (optional)

Expand any row that deserves more context.

### Session 1 — _title_

- **Date:**
- **Tool:** GitHub Copilot Chat
- **Prompt:**
- **What Copilot suggested:**
- **What you kept / changed:**
- **Evidence:** `docs/copilot/01.png`

### Session 2 — _title_

- **Date:**
- **Tool:**
- **Prompt:**
- **What Copilot suggested:**
- **What you kept / changed:**
- **Evidence:**

## Summary for README / demo video

Write 2–3 sentences here once the log is filled, describing how Copilot
assisted. Keep it truthful to what the log above actually shows. Example
shape (rewrite to match your real usage):

```text
GitHub Copilot Chat was used to explain the Azure AI Foundry Responses API
integration, generate unit tests for the safety-conversation state machine,
and help diagnose the Foundry DeploymentNotFound error during setup. Inline
Copilot completions accelerated routine TypeScript in the risk-assessment
pipeline.
```

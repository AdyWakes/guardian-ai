# Deploying Guardian AI

Follow these steps in order to take Guardian AI from local to a live, public
Vercel URL that judges can test. Estimated time: ~30 minutes.

---

## 0. Pre-flight (already verified)

- ✅ `npm run build` compiles cleanly.
- ✅ No secrets are committed (`.env.local` is gitignored; tracked files scanned).
- ✅ All four API routes are dynamic serverless functions.

---

## 1. Rotate the exposed secrets

The current Telegram bot token and Azure Foundry API key were exposed during
development (typed into chat / saved in `.env.local`). Rotating them
invalidates the leaked copies. **This does not affect judges** — the live app
reads secrets from Vercel environment variables, and judges only use the URL.

### 1a. Telegram bot token

1. Open Telegram → message **@BotFather**.
2. Send `/mybots` → select your Guardian bot.
3. **API Token** → **Revoke current token**.
4. Copy the new token.
5. Update `TELEGRAM_BOT_TOKEN` in your local `.env.local` (keep `TELEGRAM_CHAT_ID` as-is).

### 1b. Azure Foundry API key

1. Open the Foundry portal → your project (`guardian-ai-project`).
2. Project home → **API key** → **Regenerate** (or rotate key 1 → use key 2).
3. Copy the new key.
4. Update `AZURE_AI_FOUNDRY_API_KEY` in your local `.env.local`.

### 1c. Re-verify locally

Restart the dev server and confirm everything still works with the new secrets:

```bash
npm run dev
# visit http://localhost:3000/api/status  -> foundry_configured: true, telegram_configured: true
# run a chat assessment -> is_demo_mode: false
```

---

## 2. Push to GitHub

Create a new repository (public is fine — no secrets are tracked).

### Option A — GitHub website + git CLI

1. On github.com, create a new **empty** repo named `guardian-ai`
   (no README/license/gitignore — the repo already has them).
2. Back in the project folder, add the remote and push:

```bash
git remote add origin https://github.com/<your-username>/guardian-ai.git
git push -u origin main
```

### Option B — GitHub CLI (if you install it)

```bash
gh repo create guardian-ai --public --source=. --remote=origin --push
```

### Verify

- The repo shows your commit history.
- Open `.env.local` is **absent** from the file list (it must not be there).
- `.env.example` **is** present (the safe template).

---

## 3. Import to Vercel

1. Go to **vercel.com** → **Add New… → Project**.
2. **Import** your `guardian-ai` GitHub repo.
3. Framework preset: **Next.js** (auto-detected).
4. **Do not deploy yet** — first add environment variables (next step). If
   Vercel deploys immediately, that's fine; it will just start in demo mode
   until you add the vars and redeploy.

---

## 4. Set environment variables in Vercel

Project → **Settings → Environment Variables**. Add each of these for the
**Production** (and optionally Preview) environment, using your **rotated**
values:

| Variable | Value | Required |
|---|---|---|
| `AZURE_AI_FOUNDRY_ENDPOINT` | `https://guardian-ai-090910.services.ai.azure.com/api/projects/guardian-ai-project` | For live Foundry |
| `AZURE_AI_FOUNDRY_API_KEY` | _your rotated Azure key_ | For live Foundry |
| `AZURE_AI_AGENT_NAME` | `guardian-safety-retriever` | For live Foundry |
| `AZURE_AI_AGENT_VERSION` | _(leave empty)_ | Optional |
| `TELEGRAM_BOT_TOKEN` | _your rotated bot token_ | For real alerts |
| `TELEGRAM_CHAT_ID` | `8588373010` (or your chat id) | For real alerts |

Optional (sensible defaults apply if omitted):

| Variable | Default | Purpose |
|---|---|---|
| `GUARDIAN_ALERT_RATE_MAX` | `8` | Max alert sends per IP per window |
| `GUARDIAN_ALERT_RATE_WINDOW_MS` | `300000` | Rate-limit window (5 min) |
| `GUARDIAN_DISABLE_ORIGIN_CHECK` | `false` | Keep `false` in production |

> Leave WhatsApp variables unset — Telegram is the free real-send channel and
> WhatsApp stays in demo/skipped mode.

After adding variables, trigger a redeploy: **Deployments → … → Redeploy**
(env var changes require a new deployment to take effect).

---

## 5. Verify the live deployment

Replace `<app>` with your Vercel domain.

1. **Status:** open `https://<app>.vercel.app/api/status`
   → expect `"is_demo_mode": false, "foundry_configured": true, "telegram_configured": true`.
2. **Reasoning:** open `https://<app>.vercel.app/safety`, send
   *"I feel unsafe walking home alone at night"*, answer the follow-ups.
   → the right-rail trace should show the **"Foundry IQ · live"** badge and a
   real reasoning summary; the Demo Mode badge should be absent.
3. **Alert:** trigger **Send emergency alert**, allow camera/mic once.
   → confirm the alert (and clip) land in your Telegram chat.

If `/api/status` shows `foundry_configured: false`, the env vars weren't
applied — re-check spelling and that you redeployed after adding them.

---

## 6. Demo-day tips

- **Grant camera/mic permission once** at the start of the session so clip
  capture is instant during the demo (the media flow now also times out after
  12s if a prompt is ignored, so it can never hang).
- **Pre-warm Foundry** ~1 minute before a live demo by sending one chat
  message — this avoids cold-start latency on the judged run.
- Keep the local app running as a **fallback** in case of any network issue
  during a live presentation.
- The deployed app also works in **demo mode** with no env vars, so anyone who
  clones the repo can run it without credentials.

---

## Rollback

Every change in this project is a separate git commit. To undo any single
change without losing the rest:

```bash
git log --oneline          # find the commit hash
git revert <hash>          # safely undo just that commit
```

On Vercel, you can also instantly roll back to any previous deployment from
the **Deployments** tab.

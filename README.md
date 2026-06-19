# Chad AI — Telegram Dating Coach Bot

A brutally honest AI dating coach bot for Telegram, powered by Claude.

---

## Setup

### 1. Get your Telegram Bot Token
1. Open Telegram and search for **@BotFather**
2. Send `/newbot` and follow the prompts
3. Copy the token BotFather gives you

### 2. Get your Anthropic API Key
1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Create an account and go to **API Keys**
3. Generate a new key and copy it

### 3. Install & run locally
```bash
git clone <your-repo>
cd chad-bot
npm install

# Set your environment variables
cp .env.example .env
# Edit .env and paste your keys

# Load env vars and run
node -e "require('dotenv').config(); require('./bot.js')"
```

Or if you install dotenv:
```bash
npm install dotenv
```
Then add this to the top of bot.js:
```js
require('dotenv').config();
```

---

## Deploy to Railway (recommended — free tier available)

1. Push your code to a GitHub repo (make sure `.env` is in `.gitignore`)
2. Go to [railway.app](https://railway.app) and create a new project from your repo
3. In Railway, go to **Variables** and add:
   - `TELEGRAM_TOKEN` = your token
   - `ANTHROPIC_API_KEY` = your key
4. Deploy — Railway runs `npm start` automatically

Your bot will be live 24/7.

---

## Bot Commands

| Command | Description |
|---------|-------------|
| `/start` | Welcome message + intro |
| `/status` | Check remaining free messages |
| `/reset` | Clear conversation history |

---

## How it works

- Users get **20 free messages** before hitting the paywall
- Supports **text questions** and **screenshot analysis** (send any photo)
- Maintains conversation history per user (last 20 turns)
- Built on **Claude Sonnet** with a custom "Chad" system prompt

---

## Adding Payments (Stripe)

To monetize like AskChad:
1. Create a Stripe payment link for your subscription plans
2. Replace `[your-payment-link-here]` in `bot.js` with your actual Stripe link
3. When a payment succeeds, set `user.subscribed = true` via a Stripe webhook

For persistent subscriptions across restarts, swap the in-memory `userStore` Map for a simple SQLite database or Redis.

---

## Scaling

The current setup uses in-memory storage — it resets if the server restarts. For production:
- Add **SQLite** (via `better-sqlite3`) for simple persistence
- Or **Redis** for multi-instance scaling
- Add a **Stripe webhook endpoint** to auto-activate subscriptions

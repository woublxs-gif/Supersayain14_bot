const TelegramBot = require("node-telegram-bot-api");
const Anthropic = require("@anthropic-ai/sdk");
const fs = require("fs");
const https = require("https");
const path = require("path");

// ── Config ────────────────────────────────────────────────────────────────────
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const FREE_MESSAGE_LIMIT = 20;

if (!TELEGRAM_TOKEN || !ANTHROPIC_API_KEY) {
  console.error("Missing TELEGRAM_TOKEN or ANTHROPIC_API_KEY in environment.");
  process.exit(1);
}

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

// ── System Prompt ─────────────────────────────────────────────────────────────
const CHAD_SYSTEM_PROMPT = `You are Chad — a brutally honest, no-BS dating coach for men.

Your job is to help men improve their dating lives through unfiltered, psychologically grounded advice. You understand attraction mechanics, human psychology, and what actually works in modern dating — not what feels good to hear.

PERSONALITY:
- Direct, confident, occasionally blunt
- Zero sugarcoating — if something is cringe, say so
- Warm underneath — you want the guy to win, you're just honest about what it takes
- Use casual language. Short punchy sentences. No corporate tone.
- Roast when necessary. Praise when earned.

EXPERTISE:
- Text game: openers, pacing, escalation, re-igniting dead conversations
- Screenshot analysis: read her interest level, spot red flags, recommend exact next moves
- Date planning and logistics
- Handling rejection, flaking, ghosting
- Frame control and confidence building
- Attraction psychology (push/pull, mystery, investment levels)
- When to chase vs. when to walk

RULES:
- Never give generic "just be yourself" advice
- Always give a concrete next step or example message
- If a screenshot is shared, analyze her tone, interest level, response time clues, and suggest exactly what to say next
- If something the guy did killed attraction, tell him directly
- Keep responses tight — don't ramble. Quality over quantity.
- Never moralize or lecture about dating culture. Just help him get results.

When analyzing screenshots:
1. Read her investment level (short/long replies, emoji use, question-asking)
2. Assess where he stands (high/medium/low interest)
3. Give a specific reply recommendation with reasoning`;

// ── In-memory storage (swap for a DB like SQLite/Redis for production) ────────
// Structure: { userId: { messages: [...], messageCount: number, subscribed: boolean } }
const userStore = new Map();

function getUser(userId) {
  if (!userStore.has(userId)) {
    userStore.set(userId, {
      messages: [],
      messageCount: 0,
      subscribed: false,
    });
  }
  return userStore.get(userId);
}

function isOverLimit(user) {
  return !user.subscribed && user.messageCount >= FREE_MESSAGE_LIMIT;
}

// ── Download Telegram photo ───────────────────────────────────────────────────
async function downloadPhoto(fileId) {
  const file = await bot.getFile(fileId);
  const fileUrl = `https://api.telegram.org/file/bot${TELEGRAM_TOKEN}/${file.file_path}`;

  return new Promise((resolve, reject) => {
    https.get(fileUrl, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    });
  });
}

// ── Call Claude ───────────────────────────────────────────────────────────────
async function askClaude(user, userText, imageBuffer = null) {
  // Build the new user message content
  const contentBlocks = [];

  if (imageBuffer) {
    contentBlocks.push({
      type: "image",
      source: {
        type: "base64",
        media_type: "image/jpeg",
        data: imageBuffer.toString("base64"),
      },
    });
  }

  contentBlocks.push({
    type: "text",
    text: userText || (imageBuffer ? "Analyze this screenshot and tell me what to do." : ""),
  });

  // Add to conversation history
  user.messages.push({ role: "user", content: contentBlocks });

  // Keep last 20 turns to avoid token overflow
  const historyToSend = user.messages.slice(-20);

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1000,
    system: CHAD_SYSTEM_PROMPT,
    messages: historyToSend,
  });

  const reply = response.content[0].text;

  // Save assistant reply to history (text only for simplicity)
  user.messages.push({ role: "assistant", content: reply });

  return reply;
}

// ── Handlers ──────────────────────────────────────────────────────────────────
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const firstName = msg.from.first_name || "bro";

  bot.sendMessage(
    chatId,
    `Yo ${firstName}. I'm Chad — your dating coach.\n\n` +
      `Send me:\n` +
      `• A screenshot of your convo → I'll tell you exactly what to say\n` +
      `• A question about dating, texting, or girls → I'll give you real answers\n\n` +
      `You've got *${FREE_MESSAGE_LIMIT} free messages* to start. Let's get to work.`,
    { parse_mode: "Markdown" }
  );
});

bot.onText(/\/status/, (msg) => {
  const user = getUser(msg.from.id);
  const remaining = Math.max(0, FREE_MESSAGE_LIMIT - user.messageCount);

  if (user.subscribed) {
    bot.sendMessage(msg.chat.id, "✅ You're subscribed. Unlimited messages.");
  } else {
    bot.sendMessage(
      msg.chat.id,
      `You have *${remaining}* free messages remaining.`,
      { parse_mode: "Markdown" }
    );
  }
});

bot.onText(/\/reset/, (msg) => {
  // Clears conversation history (not message count)
  const user = getUser(msg.from.id);
  user.messages = [];
  bot.sendMessage(msg.chat.id, "Conversation cleared. Fresh start.");
});

// Handle text messages
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  // Skip commands
  if (msg.text && msg.text.startsWith("/")) return;

  const user = getUser(userId);

  if (isOverLimit(user)) {
    bot.sendMessage(
      chatId,
      `You've used all ${FREE_MESSAGE_LIMIT} free messages.\n\nTo keep going, subscribe at [your-payment-link-here].`,
      { parse_mode: "Markdown" }
    );
    return;
  }

  // Show typing indicator
  bot.sendChatAction(chatId, "typing");

  try {
    let imageBuffer = null;
    let userText = msg.text || msg.caption || "";

    // Handle photo
    if (msg.photo) {
      const largestPhoto = msg.photo[msg.photo.length - 1];
      imageBuffer = await downloadPhoto(largestPhoto.file_id);
    }

    if (!userText && !imageBuffer) return;

    user.messageCount++;
    const reply = await askClaude(user, userText, imageBuffer);

    // Warn when approaching limit
    const remaining = FREE_MESSAGE_LIMIT - user.messageCount;
    let footer = "";
    if (!user.subscribed && remaining <= 5 && remaining > 0) {
      footer = `\n\n_(${remaining} free messages left)_`;
    }

    bot.sendMessage(chatId, reply + footer, { parse_mode: "Markdown" });
  } catch (err) {
    console.error("Error:", err);
    bot.sendMessage(chatId, "Something went wrong. Try again.");
  }
});

console.log("Chad bot is running...");

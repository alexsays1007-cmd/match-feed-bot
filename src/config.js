import fs from "node:fs";
import path from "node:path";

function loadDotenv() {
  const filePath = path.resolve(".env");
  if (!fs.existsSync(filePath)) return;

  const text = fs.readFileSync(filePath, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const eq = line.indexOf("=");
    if (eq === -1) continue;

    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) process.env[key] = value;
  }
}

loadDotenv();

export const config = {
  token: process.env.MATCH_FEED_BOT_TOKEN || "",
  chatId: process.env.TELEGRAM_CHAT_ID || "",
  adminUsernames: (process.env.ADMIN_USERNAMES || "velvyyyy")
    .split(",")
    .map((item) => item.trim().replace(/^@/, "").toLowerCase())
    .filter(Boolean),
  adminUserIds: (process.env.ADMIN_USER_IDS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean),
  rivenBotUsername: (process.env.RIVEN_BOT_USERNAME || "cain_r_bot").replace(/^@/, ""),
  sport: process.env.SPORT || "football",
  matchSource: process.env.MATCH_SOURCE || "sportscore",
  matchSlug: process.env.MATCH_SLUG || "",
  apiFootballKey: process.env.API_FOOTBALL_KEY || "",
  pollSeconds: Number(process.env.POLL_SECONDS || 75),
  commandPollSeconds: Number(process.env.COMMAND_POLL_SECONDS || 3),
  scoreOnly: String(process.env.SCORE_ONLY || "false").toLowerCase() === "true",
  includeYellowCards: String(process.env.INCLUDE_YELLOW_CARDS || "false").toLowerCase() === "true",
  sportscoreSrc: process.env.SPORTSCORE_SRC || "velvy-match-feed-bot",
  fotmobLeagues: (process.env.FOTMOB_LEAGUES || "42,77,78")
    .split(",")
    .map((item) => Number(item.trim()))
    .filter(Boolean)
};

export function requireTelegramConfig() {
  if (!config.token) {
    throw new Error("Missing MATCH_FEED_BOT_TOKEN. Put it in .env or the environment.");
  }
}

export function requireChatConfig() {
  requireTelegramConfig();
  if (!config.chatId) {
    throw new Error("Missing TELEGRAM_CHAT_ID. Run discover first, then put the group id in .env.");
  }
}

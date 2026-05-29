import { config, requireChatConfig, requireTelegramConfig } from "./config.js";
import { discoverChats, sendMessage } from "./telegram.js";
import { getMatches, getMatchDetail, readMatches } from "./sportscore.js";
import { extractEvents, makeSnapshot, summarizeMatch } from "./events.js";
import { formatEvent, formatSnapshot, formatTestMessage } from "./format.js";
import { rememberKeys, unseen } from "./state.js";
import { runDaemon } from "./daemon.js";

const command = process.argv[2] || "help";

function printHelp() {
  console.log(`Commands:
  discover   Show Telegram chats seen by this bot
  send-test  Send a test message to TELEGRAM_CHAT_ID
  matches    List live/recent matches from SportScore
  preview    Fetch one match and print messages without sending
  poll-once  Fetch one match and send new events once
  watch      Keep polling one match
  daemon     Listen for Telegram commands and poll selected match
`);
}

async function discover() {
  requireTelegramConfig();
  const chats = await discoverChats();
  if (!chats.length) {
    console.log("No chats found yet. Add the bot to the group, send one group message, then run discover again.");
    return;
  }

  for (const chat of chats) {
    console.log(`${chat.id}\t${chat.type}\t${chat.title || "(untitled)"}`);
  }
}

async function sendTest() {
  requireChatConfig();
  await sendMessage(formatTestMessage());
  console.log("Test message sent.");
}

async function listMatches() {
  const body = await getMatches(30);
  const matches = readMatches(body);
  if (!matches.length) {
    console.log("No matches returned right now.");
    return;
  }

  for (const match of matches) {
    const item = summarizeMatch(match);
    console.log(`${item.slug}\t${item.status}\t${item.home} ${item.score} ${item.away}`);
  }
}

async function pollOnce() {
  requireChatConfig();
  const detail = await getMatchDetail();
  const snapshot = makeSnapshot(detail);

  if (config.scoreOnly) {
    const fresh = unseen([snapshot]);
    if (!fresh.length) return console.log("No new score/status update.");
    await sendMessage(formatSnapshot(snapshot));
    rememberKeys(fresh.map((item) => item.key));
    console.log("Sent score/status update.");
    return;
  }

  const events = extractEvents(detail);
  const freshEvents = unseen(events);

  if (freshEvents.length) {
    for (const event of freshEvents) {
      await sendMessage(formatEvent(event, snapshot));
    }
    rememberKeys(freshEvents.map((item) => item.key));
    console.log(`Sent ${freshEvents.length} event(s).`);
    return;
  }

  const freshSnapshot = unseen([snapshot]);
  if (freshSnapshot.length) {
    await sendMessage(formatSnapshot(snapshot));
    rememberKeys([snapshot.key]);
    console.log("Sent score/status update.");
    return;
  }

  console.log("No new event.");
}

async function preview() {
  const detail = await getMatchDetail();
  const snapshot = makeSnapshot(detail);
  const events = extractEvents(detail);

  console.log(formatSnapshot(snapshot));
  for (const event of events.slice(-10)) {
    console.log("\n---\n");
    console.log(formatEvent(event, snapshot));
  }

  if (!events.length) {
    console.log("\nNo incidents/timeline events found for this match.");
  }
}

async function watch() {
  console.log(`Watching ${config.sport}:${config.matchSlug || "(missing slug)"} every ${config.pollSeconds}s.`);
  while (true) {
    try {
      await pollOnce();
    } catch (error) {
      console.error(error.message);
    }
    await new Promise((resolve) => setTimeout(resolve, Math.max(30, config.pollSeconds) * 1000));
  }
}

try {
  if (command === "discover") await discover();
  else if (command === "send-test") await sendTest();
  else if (command === "matches") await listMatches();
  else if (command === "preview") await preview();
  else if (command === "poll-once") await pollOnce();
  else if (command === "watch") await watch();
  else if (command === "daemon") await runDaemon();
  else printHelp();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

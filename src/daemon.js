import { config, requireChatConfig } from "./config.js";
import { getUpdates, sendMessage } from "./telegram.js";
import {
  extractApiFootballEvents,
  extractApiFootballLineup,
  getApiFootballMatches,
  getApiFootballMatchDetail,
  makeApiFootballSnapshot
} from "./apiFootball.js";
import { getMatches, getMatchDetail, readMatches } from "./sportscore.js";
import { extractEvents, makeSnapshot, summarizeMatch } from "./events.js";
import {
  extractFotmobEvents,
  extractFotmobLineup,
  extractFotmobShotEvents,
  getFotmobMatches,
  getFotmobMatchDetail,
  makeFotmobSnapshot
} from "./fotmob.js";
import { formatEvent, formatLineup, formatSnapshot } from "./format.js";
import { clearSent, getRuntime, rememberKeys, unseen, updateRuntime } from "./state.js";

let updateOffset = 0;
let lastCommandPoll = 0;
let lastMatchPoll = 0;

function commandText(message) {
  const text = message?.text || "";
  if (!text.startsWith("/")) return "";
  return text.replace(/^\/([a-z0-9_]+)@[a-z0-9_]+/i, "/$1").trim();
}

function allowedChat(message) {
  return String(message?.chat?.id || "") === String(config.chatId);
}

function cleanNeedle(text) {
  return text.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, " ").replace(/\s+/g, " ").trim();
}

const PAGE_SIZE = 10;
const SOURCES = new Set(["sportscore", "fotmob", "api-football"]);

function currentSource() {
  return getRuntime().source || config.matchSource || "sportscore";
}

async function fetchMatchesForSource(source) {
  if (source === "fotmob") return getFotmobMatches(120);
  if (source === "api-football") return getApiFootballMatches(120);
  const body = await getMatches(80);
  const allMatches = readMatches(body).map(summarizeMatch);
  const liveOrUpcoming = allMatches.filter((match) => {
    const status = match.status.toLowerCase();
    return !status.includes("finished") && !status.includes("ended");
  });
  return liveOrUpcoming.length ? liveOrUpcoming : allMatches;
}

async function listMatches(chatId, pageArg = "1") {
  const source = currentSource();
  const matches = await fetchMatchesForSource(source);
  updateRuntime({ lastMatches: matches, lastMatchesAt: new Date().toISOString(), lastMatchesSource: source });

  if (!matches.length) {
    await sendMessage("No matches returned right now.", chatId);
    return;
  }

  const totalPages = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
  const requestedPage = Number(pageArg);
  const page = Number.isInteger(requestedPage)
    ? Math.min(Math.max(requestedPage, 1), totalPages)
    : 1;
  const start = (page - 1) * PAGE_SIZE;
  const shown = matches.slice(start, start + PAGE_SIZE);
  const lines = shown.map((match, index) => {
    const number = start + index + 1;
    const time = match.utcTime ? ` | ${match.utcTime.replace("T", " ").replace("Z", " UTC")}` : "";
    const league = match.league ? ` | ${match.league}` : "";
    return `${number}. ${match.status}${time}${league}\n   ${match.home} ${match.score} ${match.away}\n   /watch ${number}  (${match.slug})`;
  });

  const note = `${source.toUpperCase()} matches, page ${page}/${totalPages}.`;
  const next = page < totalPages ? `\n\nNext: /matches ${page + 1}` : "";
  await sendMessage(`${note}\n\n${lines.join("\n\n")}${next}`, chatId);
}

function findMatch(arg, matches) {
  const trimmed = arg.trim();
  if (!trimmed) return null;

  const index = Number(trimmed);
  if (Number.isInteger(index) && index >= 1 && index <= matches.length) {
    return matches[index - 1];
  }

  const exactSlug = matches.find((match) => match.slug === trimmed);
  if (exactSlug) return exactSlug;

  const needle = cleanNeedle(trimmed);
  return matches.find((match) => {
    const haystack = cleanNeedle(`${match.home} ${match.away} ${match.slug}`);
    return haystack.includes(needle);
  });
}

async function watchMatch(arg, chatId) {
  let runtime = getRuntime();
  let matches = runtime.lastMatches || [];
  const source = runtime.lastMatchesSource || currentSource();

  if (!matches.length) {
    matches = await fetchMatchesForSource(source);
    runtime = updateRuntime({ lastMatches: matches, lastMatchesAt: new Date().toISOString(), lastMatchesSource: source });
  }

  const match = findMatch(arg, matches);
  if (!match) {
    await sendMessage("I could not find that match. Run /matches first, then use /watch 1 or /watch team name.", chatId);
    return;
  }

  updateRuntime({
    watchSource: source,
    watchSlug: match.slug,
    watchMatch: match,
    watchLabel: `${match.home} ${match.score} ${match.away}`,
    watchStatus: match.status
  });
  clearSent();
  await sendMessage(`Watching now:\n${match.home} ${match.score} ${match.away}\nSlug: ${match.slug}`, chatId);
  lastMatchPoll = 0;
}

async function stopWatch(chatId) {
  updateRuntime({ watchSlug: "", watchLabel: "", watchStatus: "", watchMatch: null });
  await sendMessage("Stopped match feed.", chatId);
}

async function status(chatId) {
  const runtime = getRuntime();
  if (!runtime.watchSlug) {
    await sendMessage(`No match is being watched. Source: ${currentSource()}. Run /matches, then /watch 1.`, chatId);
    return;
  }
  await sendMessage(
    `Currently watching (${runtime.watchSource || currentSource()}):\n${runtime.watchLabel || runtime.watchSlug}\nSlug: ${runtime.watchSlug}`
  );
}

async function setSource(arg, chatId) {
  const source = arg.trim().toLowerCase();
  if (!source) {
    await sendMessage(`Current source: ${currentSource()}\nAvailable: fotmob, api-football, sportscore`, chatId);
    return;
  }
  if (!SOURCES.has(source)) {
    await sendMessage("Unknown source. Use /source fotmob, /source api-football, or /source sportscore.", chatId);
    return;
  }
  updateRuntime({ source, lastMatches: [], lastMatchesSource: "", watchSlug: "", watchMatch: null, watchLabel: "" });
  clearSent();
  await sendMessage(`Source switched to ${source}. Run /matches to list matches.`, chatId);
}

async function handleCommand(message) {
  const text = commandText(message);
  if (!text || !allowedChat(message)) return;

  const [command, ...rest] = text.split(/\s+/);
  const arg = rest.join(" ");
  const chatId = message.chat.id;
  console.log(`Command received: ${command} ${arg}`.trim());

  if (command === "/matches") await listMatches(chatId, arg || "1");
  else if (command === "/watch") await watchMatch(arg, chatId);
  else if (command === "/stop") await stopWatch(chatId);
  else if (command === "/status") await status(chatId);
  else if (command === "/source") await setSource(arg, chatId);
  else if (command === "/help") {
    await sendMessage("Commands:\n/source\n/source fotmob\n/source api-football\n/source sportscore\n/matches\n/matches 2\n/watch 1\n/watch team name\n/status\n/stop", chatId);
  }
}

async function pollCommands() {
  const updates = await getUpdates(updateOffset || undefined);
  for (const update of updates) {
    updateOffset = Math.max(updateOffset, update.update_id + 1);
    const message = update.message || update.channel_post;
    if (message?.text || message?.new_chat_members?.length) {
      console.log(
        JSON.stringify({
          update_id: update.update_id,
          chat_id: message.chat?.id,
          from: message.from?.username || message.from?.id,
          text: message.text || "",
          new_chat_members: message.new_chat_members?.map((member) => member.username || member.id) || []
        })
      );
    }
    await handleCommand(message);
  }
}

function shouldSendEvent(event) {
  const text = `${event.type} ${event.detail}`.toLowerCase();
  if (text.includes("goal")) return true;
  if (text.includes("red")) return true;
  if (text.includes("var")) return true;
  if (text.includes("penalty")) return true;
  if (text.includes("substitution")) return true;
  if (text.includes("attemptsaved")) return true;
  if (text.includes("miss")) return true;
  if (config.includeYellowCards && text.includes("yellow")) return true;
  return false;
}

async function pollMatch() {
  const runtime = getRuntime();
  const source = runtime.watchSource || currentSource();
  const slug = runtime.watchSlug || config.matchSlug;
  if (!slug) return;

  const detail =
    source === "fotmob"
      ? await getFotmobMatchDetail(runtime.watchMatch)
      : source === "api-football"
        ? await getApiFootballMatchDetail(runtime.watchMatch)
      : await getMatchDetail(slug);
  const snapshot =
    source === "fotmob"
      ? makeFotmobSnapshot(detail)
      : source === "api-football"
        ? makeApiFootballSnapshot(detail)
        : makeSnapshot(detail);
  const lineup =
    source === "fotmob"
      ? extractFotmobLineup(detail)
      : source === "api-football"
        ? extractApiFootballLineup(detail)
        : null;

  if (lineup) {
    const freshLineup = unseen([lineup]);
    if (freshLineup.length) {
      await sendMessage(formatLineup(lineup));
      rememberKeys([lineup.key]);
    }
  }

  const events =
    config.scoreOnly
      ? []
      : source === "fotmob"
        ? [...extractFotmobEvents(detail), ...extractFotmobShotEvents(detail)].filter(shouldSendEvent)
        : source === "api-football"
          ? extractApiFootballEvents(detail).filter(shouldSendEvent)
        : extractEvents(detail).filter(shouldSendEvent);
  const freshEvents = unseen(events);

  if (freshEvents.length) {
    for (const event of freshEvents) {
      await sendMessage(formatEvent(event, snapshot));
    }
    rememberKeys(freshEvents.map((item) => item.key));
    return;
  }

  const freshSnapshot = unseen([snapshot]);
  if (freshSnapshot.length) {
    await sendMessage(formatSnapshot(snapshot));
    rememberKeys([snapshot.key]);
  }
}

export async function runDaemon() {
  requireChatConfig();
  console.log("Match feed daemon started.");

  while (true) {
    const now = Date.now();
    try {
      if (now - lastCommandPoll >= config.commandPollSeconds * 1000) {
        lastCommandPoll = now;
        await pollCommands();
      }
      if (now - lastMatchPoll >= Math.max(30, config.pollSeconds) * 1000) {
        lastMatchPoll = now;
        await pollMatch();
      }
    } catch (error) {
      console.error(error.message);
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

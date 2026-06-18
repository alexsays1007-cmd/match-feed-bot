import { config } from "./config.js";

function mention() {
  return `@${config.rivenBotUsername}`;
}

function labelEvent(event) {
  const type = [event.type, event.detail].filter(Boolean).join(" / ");
  const xg = event.xg !== undefined && event.xg !== null ? `xG ${Number(event.xg).toFixed(2)}` : "";
  const who = [event.team, event.player, xg].filter(Boolean).join(" - ");
  return [type || "Match event", who].filter(Boolean).join(": ");
}

export function formatTestMessage() {
  return `${mention()}
[MATCH_FEED_TEST]
53' Arsenal 2-1 Chelsea
Saka scored.

If you can see this, the feed bot can talk in this group.`;
}

export function formatEvent(event, snapshot) {
  const minute = event.minute ? `${event.minute}' ` : "";
  const scoreLine = snapshot?.score
    ? `${snapshot.home} ${snapshot.score} ${snapshot.away}`
    : [snapshot?.home, "vs", snapshot?.away].filter(Boolean).join(" ");

  return `${mention()}
[MATCH_EVENT] ${minute}${labelEvent(event)}
${scoreLine}
Source: ${event.source || snapshot?.source || "SportScore"}`;
}

export function formatSnapshot(snapshot) {
  const minute = snapshot.minute ? `${snapshot.minute}'` : "";
  const status = [snapshot.status, minute].filter(Boolean).join(" ");
  const scoreLine = snapshot.score
    ? `${snapshot.home} ${snapshot.score} ${snapshot.away}`
    : `${snapshot.home} vs ${snapshot.away}`;

  return `${mention()}
[MATCH_UPDATE] ${status || "score update"}
${scoreLine}
Source: ${snapshot.source || "SportScore"}`;
}

export function formatLineup(lineup) {
  const homeFormation = lineup.home.formation ? ` ${lineup.home.formation}` : "";
  const awayFormation = lineup.away.formation ? ` ${lineup.away.formation}` : "";

  return `${mention()}
[LINEUP] ${lineup.homeName} vs ${lineup.awayName}

${lineup.homeName}${homeFormation}:
${lineup.home.starters.join(", ")}

${lineup.awayName}${awayFormation}:
${lineup.away.starters.join(", ")}

Source: ${lineup.source || "FotMob"}`;
}

export function formatStatsSummary(summary) {
  const label =
    summary.reason === "halftime"
      ? "[MATCH_STATS_HT]"
      : summary.reason === "fulltime"
        ? "[MATCH_STATS_FT]"
        : "[MATCH_STATS]";
  const status = summary.status ? ` ${summary.status}` : "";

  return `${mention()}
${label}${status}
${summary.home} ${summary.score} ${summary.away}
${summary.lines.join("\n")}
Source: ${summary.source || "API-Football"}`;
}

export function formatStatsDiff(diff) {
  const status = diff.status ? ` ${diff.status}` : "";

  return `${mention()}
[MATCH_STATS_DIFF]${status}
${diff.home} ${diff.score} ${diff.away}
${diff.changes.join("\n")}
Source: ${diff.source || "API-Football"}`;
}

function valueAt(obj, keys) {
  for (const key of keys) {
    const value = obj?.[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return "";
}

function textValue(value) {
  if (!value) return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  return value.name || value.shortName || value.displayName || value.title || value.slug || "";
}

function scoreFrom(obj) {
  const home = valueAt(
    {
      flat: valueAt(obj, ["homeScore", "home_score", "scoreHome"]),
      score: obj?.score?.home,
      home: obj?.home?.score,
      teams: obj?.teams?.home?.score
    },
    ["flat", "score", "home", "teams"]
  );
  const away = valueAt(
    {
      flat: valueAt(obj, ["awayScore", "away_score", "scoreAway"]),
      score: obj?.score?.away,
      away: obj?.away?.score,
      teams: obj?.teams?.away?.score
    },
    ["flat", "score", "away", "teams"]
  );

  if (home === "" || away === "") return "";
  return `${home}-${away}`;
}

function teamNames(match) {
  const home =
    textValue(match?.home) ||
    textValue(match?.homeTeam) ||
    textValue(match?.home_team) ||
    textValue(match?.teams?.home) ||
    "Home";
  const away =
    textValue(match?.away) ||
    textValue(match?.awayTeam) ||
    textValue(match?.away_team) ||
    textValue(match?.teams?.away) ||
    "Away";
  return { home, away };
}

function slugFromUrl(url) {
  if (!url) return "";
  const parts = String(url).split("/").filter(Boolean);
  return parts.at(-1) || "";
}

function findEventArrays(node, results = []) {
  if (!node || typeof node !== "object") return results;

  for (const [key, value] of Object.entries(node)) {
    if (!Array.isArray(value)) continue;
    const lowered = key.toLowerCase();
    if (
      lowered.includes("timeline") ||
      lowered.includes("event") ||
      lowered.includes("incident") ||
      lowered.includes("commentary")
    ) {
      results.push(value);
    }
  }

  for (const value of Object.values(node)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      findEventArrays(value, results);
    }
  }

  return results;
}

function normalizeEvent(raw, match) {
  const names = teamNames(match);
  const minute = valueAt(raw, ["minute", "time", "matchTime", "clock", "periodMinute"]);
  const type = textValue(valueAt(raw, ["type", "eventType", "kind", "incidentType", "category"]));
  const detail = textValue(valueAt(raw, ["detail", "reason", "description", "text", "comment", "title"]));
  const side = valueAt(raw, ["side"]);
  const team =
    textValue(valueAt(raw, ["team", "teamName"])) ||
    (side === "home" ? names.home : side === "away" ? names.away : textValue(side));
  const player = textValue(valueAt(raw, ["player", "playerName", "scorer", "name"]));
  const score = scoreFrom(raw) || scoreFrom(match);

  const key = [
    minute,
    type,
    detail,
    team,
    player,
    score,
    raw.id || raw.eventId || raw.incidentId || ""
  ].join("|");

  return { key, minute, type, detail, team, player, score, raw };
}

export function extractEvents(detail) {
  const match = detail?.match || detail?.data?.match || detail?.data || detail;
  const arrays = findEventArrays(match);
  const flattened = arrays.flat().filter((item) => item && typeof item === "object");
  const seen = new Set();
  const events = [];

  for (const raw of flattened) {
    const event = normalizeEvent(raw, match);
    if (!event.key.trim() || seen.has(event.key)) continue;
    seen.add(event.key);
    events.push(event);
  }

  return events;
}

export function makeSnapshot(detail) {
  const match = detail?.match || detail?.data?.match || detail?.data || detail;
  const { home, away } = teamNames(match);
  const status = textValue(valueAt(match, ["status_text", "status", "state", "matchStatus", "phase"]));
  const minute = valueAt(match, ["live_minute", "minute", "clock", "matchTime"]);
  const score = scoreFrom(match);
  const slug = match?.slug || match?.matchSlug || slugFromUrl(match?.url);

  return {
    key: ["snapshot", slug, home, away, status, minute, score].join("|"),
    home,
    away,
    status,
    minute,
    score
  };
}

export function summarizeMatch(match) {
  const { home, away } = teamNames(match);
  const score = scoreFrom(match) || "vs";
  const status = textValue(valueAt(match, ["status_text", "status", "state", "matchStatus", "phase"])) || "scheduled";
  const slug = match?.slug || match?.matchSlug || slugFromUrl(match?.url) || match?.id || "";
  return { home, away, score, status, slug };
}

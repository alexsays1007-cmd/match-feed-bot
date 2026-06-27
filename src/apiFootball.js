import { config } from "./config.js";

const BASE_URL = "https://v3.football.api-sports.io";

function requireKey() {
  if (!config.apiFootballKey) {
    throw new Error("Missing API_FOOTBALL_KEY in .env.");
  }
}

async function getJson(pathname, params = {}) {
  requireKey();
  const url = new URL(pathname, BASE_URL);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url, {
    headers: { "x-apisports-key": config.apiFootballKey }
  });
  const body = await response.json().catch(() => ({}));

  if (!response.ok || Object.keys(body.errors || {}).length) {
    throw new Error(`API-Football request failed: ${response.status} ${JSON.stringify(body.errors || {})}`);
  }

  return body;
}

function isoDate(offsetDays = 0) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function normalizeFixture(item) {
  const fixture = item.fixture || {};
  const teams = item.teams || {};
  const goals = item.goals || {};
  const score = item.score || {};
  const homeGoals = goals.home;
  const awayGoals = goals.away;
  const hasFulltimeScore =
    score.fulltime?.home !== null &&
    score.fulltime?.home !== undefined &&
    score.fulltime?.away !== null &&
    score.fulltime?.away !== undefined;
  const shownHome = hasFulltimeScore ? score.fulltime.home : homeGoals;
  const shownAway = hasFulltimeScore ? score.fulltime.away : awayGoals;
  const rawStatus = fixture.status?.short || fixture.status?.long || "Not started";
  const status =
    hasFulltimeScore && /^(1H|2H|HT|NS|TBD)$/i.test(rawStatus)
      ? "FT"
      : rawStatus;

  return {
    source: "api-football",
    id: String(fixture.id || ""),
    slug: String(fixture.id || ""),
    fixtureId: fixture.id,
    home: teams.home?.name || "Home",
    away: teams.away?.name || "Away",
    score:
      shownHome !== null && shownHome !== undefined && shownAway !== null && shownAway !== undefined
        ? `${shownHome}-${shownAway}`
        : "vs",
    status,
    utcTime: fixture.date || "",
    league: item.league?.name || "API-Football",
    sortTime: fixture.timestamp ? fixture.timestamp * 1000 : Date.parse(fixture.date || "") || 0
  };
}

export async function getApiFootballMatches(limit = 80) {
  const live = await getJson("/fixtures", { live: "all" }).catch(() => ({ response: [] }));
  const today = await getJson("/fixtures", { date: isoDate(0) }).catch(() => ({ response: [] }));
  const tomorrow = await getJson("/fixtures", { date: isoDate(1) }).catch(() => ({ response: [] }));

  const seen = new Set();
  const now = Date.now();
  const recentWindowMs = 3 * 60 * 60 * 1000;
  return [...(live.response || []), ...(today.response || []), ...(tomorrow.response || [])]
    .map(normalizeFixture)
    .filter((match) => {
      if (!match.id || seen.has(match.id)) return false;
      seen.add(match.id);
      return true;
    })
    .filter((match) => isLiveStatus(match.status) || match.sortTime >= now - recentWindowMs)
    .sort((a, b) => {
      if (isLiveStatus(a.status) && !isLiveStatus(b.status)) return -1;
      if (isLiveStatus(b.status) && !isLiveStatus(a.status)) return 1;
      return (a.sortTime || Number.MAX_SAFE_INTEGER) - (b.sortTime || Number.MAX_SAFE_INTEGER);
    })
    .slice(0, limit);
}

function isLiveStatus(status) {
  return /^(1H|2H|HT|ET|P|BT|LIVE)$/i.test(String(status || ""));
}

export async function getApiFootballMatchDetail(match, options = {}) {
  const fixtureId = typeof match === "string" ? match : match?.fixtureId || match?.id;
  if (!fixtureId) throw new Error("API-Football match is missing fixture id.");

  const includeLineups = options.includeLineups !== false;

  const [fixture, events, lineups] = await Promise.all([
    getJson("/fixtures", { id: fixtureId }),
    getJson("/fixtures/events", { fixture: fixtureId }).catch(() => ({ response: [] })),
    includeLineups ? getJson("/fixtures/lineups", { fixture: fixtureId }).catch(() => ({ response: [] })) : Promise.resolve({ response: [] })
  ]);

  return {
    source: "api-football",
    match: normalizeFixture(fixture.response?.[0] || {}),
    fixture: fixture.response?.[0] || {},
    events: events.response || [],
    lineups: lineups.response || [],
    statistics: []
  };
}

export async function getApiFootballStatistics(match) {
  const fixtureId = typeof match === "string" ? match : match?.fixtureId || match?.id;
  if (!fixtureId) throw new Error("API-Football match is missing fixture id.");

  const body = await getJson("/fixtures/statistics", { fixture: fixtureId });
  return normalizeApiFootballStatistics(body.response || []);
}

export function makeApiFootballSnapshot(detail) {
  const fixture = detail?.fixture || {};
  const match = detail?.match || {};
  const elapsed = fixture.fixture?.status?.elapsed;
  return {
    key: ["api-football-snapshot", match.id, match.status, match.score].join("|"),
    home: match.home,
    away: match.away,
    score: match.score,
    status: match.status,
    minute: elapsed || "",
    source: "API-Football"
  };
}

export function extractApiFootballEvents(detail) {
  const match = detail?.match || {};
  return (detail?.events || []).map((event) => ({
    key: ["api-football-event", match.id, event.time?.elapsed, event.time?.extra || "", event.team?.id, event.type, event.detail, event.player?.id].join("|"),
    minute: event.time?.extra ? `${event.time.elapsed}+${event.time.extra}` : event.time?.elapsed,
    type: event.type || "Event",
    detail: event.detail || event.comments || "",
    team: event.team?.name || "",
    player: event.player?.name || "",
    assist: event.assist?.name || "",
    score: "",
    raw: event,
    source: "API-Football"
  }));
}

function parseStatValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return value;
  const text = String(value).trim();
  if (!text) return null;
  const number = Number(text.replace("%", ""));
  return Number.isFinite(number) ? number : text;
}

function statSlug(type) {
  return String(type || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function teamStats(item) {
  const stats = {};
  for (const stat of item?.statistics || []) {
    const key = statSlug(stat.type);
    if (key) stats[key] = parseStatValue(stat.value);
  }
  return {
    id: item?.team?.id || "",
    name: item?.team?.name || "Team",
    stats
  };
}

export function normalizeApiFootballStatistics(response) {
  const teams = (response || []).map(teamStats);
  if (teams.length < 2) return null;
  return {
    source: "API-Football",
    home: teams[0],
    away: teams[1]
  };
}

const IMPORTANT_STATS = [
  ["total-shots", "Shots"],
  ["shots-on-goal", "On target"],
  ["corner-kicks", "Corners"],
  ["ball-possession", "Possession", { percent: true }],
  ["goalkeeper-saves", "Saves"],
  ["fouls", "Fouls"],
  ["yellow-cards", "Yellow cards"],
  ["red-cards", "Red cards"]
];

function statPair(statistics, key) {
  if (!statistics) return null;
  const home = statistics.home.stats[key];
  const away = statistics.away.stats[key];
  if (home === null || home === undefined || away === null || away === undefined) return null;
  return { home, away };
}

function formatStatValue(value, options = {}) {
  if (value === null || value === undefined) return "";
  if (options.percent && typeof value === "number") return `${value}%`;
  return String(value);
}

function formatDelta(value) {
  return value > 0 ? `+${value}` : "0";
}

export function apiFootballStatsLines(statistics, keys = IMPORTANT_STATS) {
  if (!statistics) return [];
  return keys
    .map(([key, label, options]) => {
      const pair = statPair(statistics, key);
      if (!pair) return "";
      return `${label}: ${formatStatValue(pair.home, options)}-${formatStatValue(pair.away, options)}`;
    })
    .filter(Boolean);
}

export function makeApiFootballStatsSummary(statistics, snapshot, reason = "summary") {
  const lines = apiFootballStatsLines(statistics);
  if (!lines.length) return null;
  const status = [snapshot?.status, snapshot?.minute ? `${snapshot.minute}'` : ""].filter(Boolean).join(" ");
  return {
    key: ["api-football-stats", snapshot?.home, snapshot?.away, snapshot?.score, status, lines.join("|"), reason].join("|"),
    reason,
    home: snapshot?.home || statistics.home.name,
    away: snapshot?.away || statistics.away.name,
    score: snapshot?.score || "vs",
    status,
    lines,
    source: "API-Football"
  };
}

export function makeApiFootballStatsDiff(previous, current, snapshot) {
  if (!previous || !current) return null;

  const diffKeys = [
    ["total-shots", "Shots"],
    ["shots-on-goal", "On target"],
    ["corner-kicks", "Corners"],
    ["goalkeeper-saves", "Saves"]
  ];
  const changes = [];

  for (const [key, label] of diffKeys) {
    const before = statPair(previous, key);
    const after = statPair(current, key);
    if (!before || !after) continue;
    const homeDelta = typeof after.home === "number" && typeof before.home === "number" ? after.home - before.home : 0;
    const awayDelta = typeof after.away === "number" && typeof before.away === "number" ? after.away - before.away : 0;
    if (homeDelta > 0 || awayDelta > 0) {
      changes.push(`${label}: ${after.home}-${after.away} (${formatDelta(homeDelta)}/${formatDelta(awayDelta)})`);
    }
  }

  if (!changes.length) return null;
  const status = [snapshot?.status, snapshot?.minute ? `${snapshot.minute}'` : ""].filter(Boolean).join(" ");
  return {
    key: ["api-football-stats-diff", snapshot?.home, snapshot?.away, snapshot?.score, status, changes.join("|")].join("|"),
    home: snapshot?.home || current.home.name,
    away: snapshot?.away || current.away.name,
    score: snapshot?.score || "vs",
    status,
    changes,
    source: "API-Football"
  };
}

export function extractApiFootballLineup(detail) {
  const lineups = detail?.lineups || [];
  if (lineups.length < 2) return null;

  const teams = lineups.map((item) => ({
    name: item.team?.name || "Team",
    formation: item.formation || "",
    starters: (item.startXI || [])
      .map((entry) => entry.player?.name)
      .filter(Boolean)
      .slice(0, 11)
  }));

  if (teams.some((team) => team.starters.length < 11)) return null;

  return {
    key: ["api-football-lineup", detail?.match?.id, teams.map((team) => team.starters.join(",")).join("|")].join("|"),
    homeName: teams[0].name,
    awayName: teams[1].name,
    home: teams[0],
    away: teams[1],
    source: "API-Football"
  };
}

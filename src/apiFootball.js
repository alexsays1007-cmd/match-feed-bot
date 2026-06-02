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
  return [...(live.response || []), ...(today.response || []), ...(tomorrow.response || [])]
    .map(normalizeFixture)
    .filter((match) => {
      if (!match.id || seen.has(match.id)) return false;
      seen.add(match.id);
      return true;
    })
    .sort((a, b) => {
      if (/^(1H|2H|HT|ET|P|BT)$/i.test(a.status) && !/^(1H|2H|HT|ET|P|BT)$/i.test(b.status)) return -1;
      if (/^(1H|2H|HT|ET|P|BT)$/i.test(b.status) && !/^(1H|2H|HT|ET|P|BT)$/i.test(a.status)) return 1;
      return (a.sortTime || Number.MAX_SAFE_INTEGER) - (b.sortTime || Number.MAX_SAFE_INTEGER);
    })
    .slice(0, limit);
}

export async function getApiFootballMatchDetail(match) {
  const fixtureId = typeof match === "string" ? match : match?.fixtureId || match?.id;
  if (!fixtureId) throw new Error("API-Football match is missing fixture id.");

  const [fixture, events, lineups, statistics] = await Promise.all([
    getJson("/fixtures", { id: fixtureId }),
    getJson("/fixtures/events", { fixture: fixtureId }).catch(() => ({ response: [] })),
    getJson("/fixtures/lineups", { fixture: fixtureId }).catch(() => ({ response: [] })),
    getJson("/fixtures/statistics", { fixture: fixtureId }).catch(() => ({ response: [] }))
  ]);

  return {
    source: "api-football",
    match: normalizeFixture(fixture.response?.[0] || {}),
    fixture: fixture.response?.[0] || {},
    events: events.response || [],
    lineups: lineups.response || [],
    statistics: statistics.response || []
  };
}

export function makeApiFootballSnapshot(detail) {
  const fixture = detail?.fixture || {};
  const match = detail?.match || {};
  const elapsed = fixture.fixture?.status?.elapsed;
  return {
    key: ["api-football-snapshot", match.id, match.status, elapsed || "", match.score].join("|"),
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

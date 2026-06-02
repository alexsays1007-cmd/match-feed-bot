import { config } from "./config.js";

const BASE_URL = "https://www.fotmob.com";

async function fetchText(pathname) {
  const url = pathname.startsWith("http") ? pathname : `${BASE_URL}${pathname}`;
  const response = await fetch(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    }
  });

  if (!response.ok) {
    throw new Error(`FotMob request failed: ${response.status} ${url}`);
  }

  return response.text();
}

function extractPageProps(html) {
  const marker = "__NEXT_DATA__";
  const markerIndex = html.indexOf(marker);
  if (markerIndex === -1) throw new Error("FotMob page did not include __NEXT_DATA__.");

  const start = html.indexOf(">", markerIndex);
  const end = html.indexOf("</script>", start);
  if (start === -1 || end === -1) throw new Error("Could not parse FotMob page data.");

  const wrapper = JSON.parse(html.slice(start + 1, end));
  return wrapper?.props?.pageProps || {};
}

function statusFrom(raw) {
  const status = raw?.status || {};
  if (status.started && !status.finished) return "Live";
  if (status.finished) return "Finished";
  if (status.cancelled) return "Cancelled";
  return status?.reason?.short || "Not started";
}

function scoreFrom(raw) {
  return raw?.status?.scoreStr?.replace(/\s+/g, "") || "vs";
}

function dateValue(raw) {
  const value = raw?.status?.utcTime;
  return value ? Date.parse(value) : 0;
}

function teamName(team) {
  return team?.shortName || team?.name || "Team";
}

function normalizeLeagueMatch(raw, league) {
  const pageUrl = raw?.pageUrl || "";
  const id = String(raw?.id || pageUrl || "");
  return {
    source: "fotmob",
    id,
    slug: id,
    pageUrl,
    home: teamName(raw?.home),
    away: teamName(raw?.away),
    score: scoreFrom(raw),
    status: statusFrom(raw),
    utcTime: raw?.status?.utcTime || "",
    league: league?.name || league?.details?.name || "FotMob",
    sortTime: dateValue(raw)
  };
}

async function fetchLeagueMatches(leagueId) {
  const html = await fetchText(`/leagues/${leagueId}`);
  const pageProps = extractPageProps(html);
  const details = pageProps?.details || {};
  const matches = pageProps?.fixtures?.allMatches || [];
  return matches.map((match) => normalizeLeagueMatch(match, details));
}

export async function getFotmobMatches(limit = 120) {
  const settled = await Promise.allSettled(config.fotmobLeagues.map(fetchLeagueMatches));
  const matches = settled.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
  const now = Date.now();
  return matches
    .filter((match) => match.sortTime >= now - 3 * 60 * 60 * 1000 || match.status === "Live")
    .sort((a, b) => {
      if (a.status === "Live" && b.status !== "Live") return -1;
      if (b.status === "Live" && a.status !== "Live") return 1;
      return (a.sortTime || Number.MAX_SAFE_INTEGER) - (b.sortTime || Number.MAX_SAFE_INTEGER);
    })
    .slice(0, limit);
}

export async function getFotmobMatchDetail(match) {
  const pageUrl = typeof match === "string" ? "" : match?.pageUrl;
  if (!pageUrl) throw new Error("FotMob match is missing pageUrl.");

  const cleanPath = pageUrl.split("#")[0];
  const html = await fetchText(cleanPath);
  const pageProps = extractPageProps(html);
  return { source: "fotmob", pageProps, match };
}

function eventTeam(event, match) {
  if (event?.isHome === true) return match?.home;
  if (event?.isHome === false) return match?.away;
  return "";
}

function playerName(player) {
  if (!player) return "";
  if (typeof player === "string") return player;
  return player.name || player.fullName || "";
}

export function makeFotmobSnapshot(detail) {
  const header = detail?.pageProps?.header || {};
  const general = detail?.pageProps?.general || {};
  const teams = header?.teams || [];
  const home = teams[0]?.name || general?.homeTeam?.name || detail?.match?.home || "Home";
  const away = teams[1]?.name || general?.awayTeam?.name || detail?.match?.away || "Away";
  const score =
    teams[0]?.score !== undefined && teams[1]?.score !== undefined
      ? `${teams[0].score}-${teams[1].score}`
      : detail?.match?.score || "vs";
  const status = header?.status?.reason?.short || detail?.match?.status || "";
  const minute = header?.status?.liveTime?.short || "";

  return {
    key: ["fotmob-snapshot", detail?.match?.id, status, score].join("|"),
    home,
    away,
    score,
    status,
    minute,
    source: "FotMob"
  };
}

export function extractFotmobEvents(detail) {
  const events = detail?.pageProps?.content?.matchFacts?.events?.events || [];
  const match = detail?.match || {};

  return events
    .filter((event) => event && event.type)
    .map((event) => {
      const player =
        playerName(event.player) ||
        event.nameStr ||
        event.fullName ||
        event.assistInput ||
        "";
      const detailText =
        event.assistStr ||
        event.minutesAddedStr ||
        event.halfStrShort ||
        event.card ||
        event.eventType ||
        "";
      const score = Array.isArray(event.newScore) ? `${event.newScore[0]}-${event.newScore[1]}` : "";

      return {
        key: ["fotmob-event", detail?.match?.id, event.eventId || event.reactKey, event.time, event.type, player].join("|"),
        minute: event.overloadTime ? `${event.time}+${event.overloadTime}` : event.time,
        type: event.type,
        detail: detailText,
        team: eventTeam(event, match),
        player,
        score,
        raw: event,
        source: "FotMob"
      };
    });
}

export function extractFotmobShotEvents(detail) {
  const shots = detail?.pageProps?.content?.shotmap?.shots || [];
  const match = detail?.match || {};
  return shots.map((shot) => ({
    key: ["fotmob-shot", detail?.match?.id, shot.id, shot.eventType, shot.min].join("|"),
    minute: shot.minAdded ? `${shot.min}+${shot.minAdded}` : shot.min,
    type: shot.eventType || "Shot",
    detail: shot.situation || "",
    team: String(shot.teamId) === String(match?.homeId) ? match.home : "",
    player: shot.playerName || shot.fullName || "",
    score: "",
    xg: shot.expectedGoals,
    raw: shot,
    source: "FotMob"
  }));
}

function lineupTeam(team) {
  if (!team) return null;
  const formation = team.formation || team.formationString || "";
  const starters = [];

  for (const group of team.lineup || team.players || []) {
    const members = Array.isArray(group) ? group : group?.members || group?.players || [];
    for (const item of members) {
      const player = item?.player || item;
      const name = player?.name || player?.fullName || item?.name || "";
      if (name) starters.push(name);
    }
  }

  if (!starters.length && Array.isArray(team.starters)) {
    for (const item of team.starters) {
      const name = item?.name || item?.player?.name || "";
      if (name) starters.push(name);
    }
  }

  return { formation, starters: starters.slice(0, 11) };
}

export function extractFotmobLineup(detail) {
  const lineup = detail?.pageProps?.content?.lineup;
  if (!lineup) return null;

  const homeName = detail?.pageProps?.general?.homeTeam?.name || detail?.match?.home || "Home";
  const awayName = detail?.pageProps?.general?.awayTeam?.name || detail?.match?.away || "Away";
  const home = lineupTeam(lineup.homeTeam);
  const away = lineupTeam(lineup.awayTeam);

  if (!home?.starters?.length || !away?.starters?.length) return null;

  return {
    key: ["fotmob-lineup", detail?.match?.id, home.starters.join(","), away.starters.join(",")].join("|"),
    homeName,
    awayName,
    home,
    away,
    source: "FotMob"
  };
}

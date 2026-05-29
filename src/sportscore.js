import { config } from "./config.js";

const BASE_URL = "https://sportscore.com";

async function getJson(pathname, params) {
  const url = new URL(pathname, BASE_URL);
  for (const [key, value] of Object.entries(params || {})) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }
  url.searchParams.set("src", config.sportscoreSrc);

  const response = await fetch(url, {
    headers: { "user-agent": "velvy-match-feed-bot/0.1" }
  });
  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(`SportScore request failed: ${response.status} ${url.toString()}`);
  }

  return body;
}

export async function getMatches(limit = 20) {
  return getJson("/api/widget/matches/", { sport: config.sport, limit });
}

export async function getMatchDetail(slug = config.matchSlug) {
  if (!slug) throw new Error("Missing MATCH_SLUG. Run matches and choose a match slug first.");
  return getJson("/api/widget/match/", { sport: config.sport, slug });
}

export function readMatches(body) {
  if (Array.isArray(body?.matches)) return body.matches;
  if (Array.isArray(body?.data?.matches)) return body.data.matches;
  if (Array.isArray(body?.data)) return body.data;
  return [];
}

# Match Feed Bot

A tiny Telegram feed bot for pushing live match text into a group chat.

It does not use AI. It watches a public sports feed, formats new match events,
and mentions the Riven bot so the conversation bot can react in the group.

## Setup

1. Copy `.env.example` to `.env`.
2. Put the Telegram bot token in `MATCH_FEED_BOT_TOKEN`.
3. Add the feed bot to the Telegram group.
4. Send any message in the group.
5. Run:

```powershell
npm.cmd run discover
```

Copy the group chat id into `TELEGRAM_CHAT_ID`.

## Commands

```powershell
npm.cmd run test
npm.cmd run matches
npm.cmd run preview
npm.cmd run poll
npm.cmd run watch
npm.cmd run daemon
```

`watch` keeps running and polls every `POLL_SECONDS`.
`daemon` keeps running, listens for Telegram group commands, and watches the
selected match.

## Telegram Commands

Use control commands in a private chat with the feed bot. The bot will still
push selected match updates to the configured group chat.

```text
/source
/source fotmob
/source api-football
/source sportscore
/target
/target private
/target group
/matches
/matches 2
/find arsenal
/find world cup
/watch 1
/watch team name
/status
/stop
```

## Deployment

The VPS deployment uses a systemd service. A sanitized template is in:

```text
deploy/match-feed-bot.service.example
```

Copy it to `/etc/systemd/system/match-feed-bot.service` on the server and keep
real secrets in `.env`, never in Git.

## Data Sources

Supported sources:

- FotMob page data extracted from public Next.js page payloads.
- API-Football official API, when `API_FOOTBALL_KEY` is configured.
- SportScore free widget API: https://sportscore.com/developers/

FotMob currently provides richer match data, including lineups, events, shotmap,
xG, and stats when available. API-Football provides official structured events,
lineups, and statistics when the key and quota are available. SportScore is kept
as a simpler fallback source. FotMob and SportScore are public/unofficial routes
and may change.

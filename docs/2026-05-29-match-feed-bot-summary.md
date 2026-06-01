# Match Feed Bot Summary - 2026-05-29

## Goal

Build a lightweight Telegram match feed bot that pushes football match updates into a group chat.

The feed bot does not use AI. It only sends structured match updates into the group. The Riven/Cain Telegram bot sees those messages and reacts conversationally.

## Current Deployment

- Local project: `D:\Codex\match-feed-bot`
- VPS path: `/home/ubuntu/match-feed-bot`
- System service: `match-feed-bot.service`
- Service status at last check: `active`
- Telegram group chat id is configured on the VPS.
- Bot token is stored only in `.env`; it is ignored by Git and must not be committed.

Existing services were not touched:

- Cyberboss was not restarted.
- Claude Telegram was not restarted.
- MCP memory was not changed.
- sqlite-viewer was not restarted.

Only the new `match-feed-bot` service was restarted during bot changes.

## What Works Now

### Telegram

- The feed bot can send messages to the group.
- Group privacy mode was blocking normal commands after the first test.
- After disabling group privacy for `velvy_match_feed_bot`, normal commands work.
- Riven/Cain bot can see the feed bot messages in the group.

Current group commands:

```text
/source
/source fotmob
/source api-football
/source sportscore
/matches
/matches 2
/watch 1
/watch team name
/status
/stop
/help
```

### Long-running service

The bot now runs as a systemd service:

```text
match-feed-bot.service
```

It starts automatically after VPS reboot.

Useful VPS commands:

```bash
systemctl is-active match-feed-bot.service
journalctl -u match-feed-bot.service -n 80 --no-pager
sudo systemctl restart match-feed-bot.service
```

### SportScore source

SportScore was the first working data source.

What it provides:

- Basic match list
- Match status
- Score
- Incidents such as goals and cards
- Some match stats

Limitations:

- It is not a true commentary feed.
- It can return rough/odd team names.
- It often lists only low-profile matches when major matches are not live.
- It is useful as a fallback, not as the best source.

### FotMob source

FotMob was added as a second source, based on the data route used by Golazo.

Current source priority in practice:

```text
FotMob first
SportScore fallback
API-Football later if key becomes available
```

FotMob currently works for:

- UEFA Champions League
- FIFA World Cup
- FIFA Club World Cup

Configured FotMob league ids:

```text
42,77,78
```

Meaning:

- `42`: UEFA Champions League
- `77`: FIFA World Cup
- `78`: FIFA Club World Cup

FotMob successfully found:

```text
PSG vs Arsenal
Champions League
match id: 5205834
UTC: 2026-05-30 16:00
Singapore: 2026-05-31 00:00
```

The bot was able to `/watch 1` this match.

### Lineup push

Lineup push was added and tested.

Behavior:

- Only works for FotMob source.
- Pushes when both teams have lineups available.
- Pushes once per lineup key.
- Does not repeatedly spam the same lineup.

Confirmed:

- FotMob already had lineup structure for PSG vs Arsenal.
- The feed bot automatically pushed lineup into the Telegram group.

### Pagination

`/matches` now supports pagination.

Examples:

```text
/matches
/matches 2
/matches 3
```

Each page shows 10 matches.

`/watch` uses the global number from the current cached list, so if page 2 shows match 17:

```text
/watch 17
```

## Current Match State

At the end of this session, the bot had been set to FotMob and `/watch 1` had been used for PSG vs Arsenal.

Use this in the group to confirm:

```text
/status
```

Do not use `/stop` before the match unless you intentionally want to stop watching it.

## Expected Match Pushes

For FotMob, the bot can currently push:

- Lineup
- Score/status changes
- Goals
- Yellow cards
- Red cards
- Substitutions
- Penalties/VAR-like event text if FotMob provides it
- Shot events such as misses or saved attempts
- xG on shot events when available

The bot does not yet push periodic full stat summaries.

## Things Not Done Yet

### API-Football

Not integrated yet.

Reason:

- Registration/dashboard was blocked by VPN/proxy detection.
- Without VPN the site could not be opened locally.
- No API key was obtained.

Possible later plan:

- Try from mobile data or a cleaner network.
- Try again from office network.
- Add API-Football as a fallback provider once an API key is available.

### GitHub repository

Not created yet.

Before publishing:

- Confirm `.env` is ignored.
- Confirm no token appears in committed files.
- Consider making the repo private at first.
- Add deployment notes without secrets.

### Source fallback automation

Not done yet.

Current behavior:

- User can manually switch source with `/source fotmob` or `/source sportscore`.

Future behavior could be:

- Try FotMob first.
- If FotMob fails for a selected match, automatically fall back to SportScore.
- Optionally show a warning in group when fallback happens.

### Better match search

Not done yet.

Current behavior:

- `/matches` lists current source matches.
- `/watch 1` works by number.
- `/watch arsenal` does simple text matching.

Future improvements:

- `/find arsenal`
- `/find psg`
- `/find world cup`
- Date filtering, e.g. `/matches 2026-06-11`
- Competition filtering, e.g. `/matches worldcup`

### Rich stat summary

Not done yet.

FotMob has richer stats, including:

- Possession
- xG
- Total shots
- Shots on target
- Corners
- Big chances
- Big chances missed
- Momentum
- Shotmap

Future push format:

```text
[MATCH_STATS] 30'
PSG 0-0 Arsenal
xG: 0.42-0.18
Shots: 5-2
On target: 2-1
Corners: 3-1
Big chances: 1-0
Source: FotMob
```

### Cleaner logging

Not done yet.

During debugging, the service logs ordinary group messages so we can verify whether Telegram delivered them.

Future cleanup:

- Stop logging normal chat text.
- Only log commands and errors.

## Main Pitfalls Found

### Local network could not reach Telegram API

Running the bot locally failed with:

```text
fetch failed
```

Reason:

- Local Telegram app may use proxy/VPN settings.
- Node scripts do not automatically inherit Telegram app proxy settings.

Decision:

- Deploy and test on VPS instead of local machine.

### Telegram group privacy blocked commands

Symptom:

- `/matches` worked once.
- Later `/matches` appeared to do nothing.
- Service was active.
- Logs showed no message delivery.

Cause:

- Telegram did not deliver normal group messages/commands to the bot while privacy behavior was still restrictive.

Fix:

- Disable group privacy for `velvy_match_feed_bot` via BotFather.

### Telegram getUpdates conflict

Symptom:

```text
409 Conflict: terminated by other getUpdates request
```

Cause:

- The systemd service was already polling Telegram.
- A manual debug command tried to poll Telegram at the same time.

Lesson:

- Do not run `discover` or other `getUpdates` readers while the service is active.
- For future debug, either read service logs or temporarily stop the service first.

### SportScore was too basic

SportScore worked, but did not provide a true text live commentary stream.

It is good enough for fallback but not good enough for a rich watch-along.

### Golazo is useful but not directly reusable as a bot

Golazo was installed on the VPS:

```text
golazo v0.24.0
```

It is a terminal TUI and needs a TTY.

In non-interactive mode it failed with:

```text
could not open a new TTY
```

Useful finding:

- Golazo's value is its FotMob data approach, not the TUI binary itself.

### FotMob old API endpoint is gone

The old endpoint:

```text
https://www.fotmob.com/api/leagues?id=42&tab=fixtures
```

returned `404`.

Golazo handles this by scraping FotMob league/match pages and extracting Next.js `__NEXT_DATA__`.

The bot now follows that approach.

## GitHub Prep Checklist

Before creating/pushing a repository:

- Keep `.env` out of Git.
- Keep `data/state.json` out of Git unless intentionally creating a sanitized example.
- Do not commit Telegram bot token.
- Do not commit future API-Football key.
- Add `.env.example`.
- Add README setup instructions.
- Add VPS service template.
- Add a note that FotMob and SportScore are unofficial/public data routes and may change.

Suggested repo name:

```text
match-feed-bot
```

Suggested visibility:

```text
private first
```

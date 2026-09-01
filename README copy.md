# Booth

A fantasy football assistant that respects a time budget. It reads your leagues,
does the maths itself, and radios down the smallest number of calls that matter.

Built for two teams and a wife, a brother in law and some college friends who
all want something different out of the same season.

---

## What it does today

- **Draft room.** A live board with value over replacement, tier breaks, and a
  warning when a tier will collapse before your next pick. You tap picks as they
  happen, which keeps it exactly in sync with the room without any integration.
- **Any two players, compared.** Tap two names, get a verdict with the reasoning
  and the explicit cost of taking the homer option.
- **Weekly calls.** Start and sit moves plus a waiver claim with a flat bid
  number, capped at however many decisions your time budget allows.
- **Preferences that actually bind.** Suppress trade talk and you never see a
  trade. Suppress FAAB strategy and you get a number with no lecture. Set a
  60 minute budget and you get three things, not thirty.
- **Feature requests from inside the app.** Describe what you want, Booth writes
  a spec, files a GitHub issue, and the coding agent opens a pull request with a
  preview deployment for you to approve from your phone.

## What it deliberately does not do

**It does not move your players.** Yahoo's Fantasy API is read only and gated
behind an application review at https://sports.yahoo.com/developer/access/.
ESPN has no public API at all, only private endpoints authenticated with browser
cookies, where writes are unofficial and break without warning. Booth reads both,
tells you exactly what to do, and deep links you into the app so the tap takes
five seconds. Anything that claims to fully automate your roster on these two
platforms is one silent API change away from losing you a week.

---

## Cost

| Piece | Service | Cost |
| --- | --- | --- |
| Hosting | Vercel Hobby | free |
| Database and auth | Supabase free tier | free |
| Player, projection and trending data | Sleeper API | free, no key |
| Scheduling | GitHub Actions | free |
| Email | Resend free tier | free |
| Inference | Fireworks | your credits |
| Urgent texts (optional) | Twilio prepaid | about $20 once, lasts seasons |
| Domain (optional) | any registrar | about $12 a year |

Nothing here is metered against a card you left on file. Fireworks is the only
component with a usage meter, and Booth calls it once per verdict with a couple
of hundred tokens, so a season of two teams is pocket change. If the key is
missing entirely, every feature still works with template text.

---

## Setup

### 1. Supabase

Create a project, open the SQL editor, paste `supabase/schema.sql`, run it. Then
Authentication > Providers, make sure email is on with magic links.

Copy the project URL, the anon key, and the service role key.

### 2. Environment

Copy `.env.example` to `.env.local` and fill it in. The minimum to run is the
three Supabase values. Everything else degrades gracefully.

For Fireworks, set `BOOTH_LLM_API_KEY` and check the current model id in the
Fireworks console, since model names change. Any OpenAI compatible endpoint
works if you ever want to point elsewhere: change `BOOTH_LLM_BASE_URL`.

### 3. Run it

```bash
npm install
npm run dev
```

### 4. Deploy

Push to GitHub, import to Vercel, paste the same environment variables. Then in
the repo settings add three Actions secrets:

- `BOOTH_URL` your deployed URL
- `CRON_SECRET` the same value as the env var
- `ANTHROPIC_API_KEY` only if you want the feature request loop to write code

The scheduled workflow refreshes the player cache each morning and checks hourly
whether anyone's digest is due in their own timezone.

---

## Connecting leagues

**ESPN.** Log in at fantasy.espn.com, open developer tools, Application >
Cookies > espn.com, copy `espn_s2` and `SWID`. Paste both in Settings along with
your league id and team id, both visible in the league URL. Booth verifies the
connection before saving, so a bad cookie fails at setup rather than on a Sunday.

**Sleeper.** League id only. No auth needed.

**Yahoo.** Apply for API access, which takes a form and a wait. Say it is for
personal use across your own leagues. Once approved, set `YAHOO_CLIENT_ID` and
`YAHOO_CLIENT_SECRET` and the connect flow at `/api/yahoo/start` works. Until
then, add the Yahoo league as "Type it in" and use the draft room and comparison
tools, which do not need a connection.

---

## Draft day

1. Open `/draft`, set teams, rounds and your slot.
2. As each pick happens, tap **Gone**. When it is your pick, tap **Mine**.
3. The header shows how many picks until you are up. The dashed rule across the
   board is a tier ending. When the banner says a tier will not survive until
   your turn, that is the moment to reach.
4. Tap the boxes next to two players to compare them. **Ask Booth** adds a
   sentence of judgement on top of the maths.

It takes about two seconds a pick and it means the board knows exactly what is
left, which is the only thing a draft tool has to get right.

---

## Adding features during the season

Go to Ideas, describe what you want in plain language. Booth turns it into a
spec, opens an issue, and the coding agent picks it up and opens a pull request.
Vercel builds a preview. You look at it on your phone and merge if you like it.

There is a review step on purpose. An agent silently deploying to the thing that
manages your lineups in week 9 is how you lose a week.

---

## Sharing it

Multi user is on from day one. Row level security means every table is scoped to
the signed in user, so a friend signing in sees only their own leagues, their own
preferences and their own decisions. Send them the URL. The only shared object is
the player projection cache, which is public data anyway.

Sleeper's API is free for non-commercial use, so keep it free.

---

## Known gaps

- Yahoo is wired but dormant until your API application is approved.
- Player matching between ESPN names and Sleeper ids is name based. Rare
  mismatches drop a player from the weekly report rather than guessing.
- Sleeper's projection endpoint is public but undocumented. Booth falls back to
  summing weekly projections if the season call fails.
- No injury news feed yet, only the status flag on the player record.
- The decision log is written but there is no page that reads it back. That is
  the first thing worth adding once the season starts, because it is the only
  way to find out whether any of this is working.

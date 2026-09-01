# Working on Booth

Read this before changing anything.

## What Booth is

A personal fantasy football assistant for people who do not want a hobby. It
reads a manager's leagues, applies their stated preferences as hard constraints,
and surfaces the smallest set of moves that change their points.

## The rules that are not negotiable

1. **Preferences are constraints, not prompt flavour.** If a user suppressed
   `trades`, no code path may produce a trade suggestion, including through the
   model. Check `src/lib/prefs.ts` before adding any new output.
2. **The time budget caps output.** `decisionBudget(prefs)` is the maximum
   number of things shown or sent per week per league. Do not exceed it.
3. **Numbers come from `src/lib/value.ts`, never from a model.** The language
   model only narrates a result that has already been computed. If the model is
   unavailable, every feature must still work with template text.
4. **Booth never makes a roster move.** Yahoo grants read only access and ESPN
   has no public API. Recommend, deep link, and let the user tap it themselves.
   Do not add write calls to either platform.
5. **No new paid dependencies.** Everything runs on free tiers plus one
   inference key. If a feature needs a paid service, put it behind an env var
   that degrades to off.

## Layout

- `src/lib/value.ts` valuation, tiers, cliffs, comparisons, lineup optimisation
- `src/lib/prefs.ts` the preference model and the budgets derived from it
- `src/lib/sleeper.ts` free player, projection and trending data
- `src/lib/espn.ts` private endpoint reads via browser cookies
- `src/lib/yahoo.ts` OAuth reads, dormant until API access is approved
- `src/lib/weekly.ts` the weekly start, sit and waiver report
- `src/lib/advice.ts` the only place a model is called for user facing text
- `src/app/draft` the draft room, which computes everything in the browser

## Before opening a pull request

- `npm run typecheck` must pass
- The draft room must keep working with no network beyond the initial load
- New user facing copy: sentence case, no em dashes, active voice

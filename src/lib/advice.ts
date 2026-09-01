import { narrate } from "./llm";
import { Prefs, reasoningBudget, suppressed } from "./prefs";
import { Comparison, LineupCall } from "./value";
import { RankedPlayer } from "./types";

/**
 * The preference profile is applied twice: once as a hard constraint on what
 * is allowed to appear, and once as instructions on how much to say. The
 * numbers never come from the model.
 */
function systemPrompt(p: Prefs): string {
  const lines = [
    "You write one short verdict for a fantasy football manager.",
    "The analysis is already done and the numbers are given to you. Never invent stats, projections, injuries, or news.",
    `Use at most ${reasoningBudget(p)} sentence(s). No preamble, no restating the question.`,
    "Plain language. No em dashes. No hype."
  ];
  if (suppressed(p, "trades")) lines.push("Never suggest a trade.");
  if (suppressed(p, "faab_strategy")) lines.push("State FAAB bids as a number only. Never explain bidding strategy.");
  if (suppressed(p, "matchup_deep_dive")) lines.push("Do not break down matchups. Give the call, not the film study.");
  if (p.homer_team) {
    lines.push(
      `They are a ${p.homer_team} fan and deliberately want ${p.homer_team} players on the roster. ` +
        `When a ${p.homer_team} player is the pick, do not apologise for it. When it costs points, say the number once.`
    );
  }
  if (p.risk === "floor") lines.push("They prefer safe floors over upside.");
  if (p.risk === "ceiling") lines.push("They prefer upside over safe floors.");
  return lines.join(" ");
}

export async function narrateDraftPick(p: Prefs, top: RankedPlayer[], cliffNote: string | null) {
  const facts = top
    .slice(0, 3)
    .map(
      (x, i) =>
        `${i + 1}. ${x.name} (${x.pos}, ${x.team ?? "FA"}) tier ${x.tier}, ${x.vor.toFixed(0)} points over replacement${
          x.homerBoost > 0 ? ", homer bonus applied" : ""
        }`
    )
    .join("\n");
  const fallback = `${top[0]?.name} is the pick. ${top[0]?.reasons.slice(0, 2).join(", ")}.`;
  const out = await narrate(
    systemPrompt(p),
    `Board right now:\n${facts}\n${cliffNote ? `Note: ${cliffNote}` : ""}\nGive the pick.`
  );
  return out ?? fallback;
}

export async function narrateComparison(p: Prefs, c: Comparison) {
  const fallback = `${c.winner.name}${c.close ? ", but it is close" : ""}. ${c.bullets[0]}`;
  const out = await narrate(
    systemPrompt(p),
    `Compare:\n${c.winner.name} (${c.winner.pos}, ${c.winner.team ?? "FA"}), tier ${c.winner.tier}, ${c.winner.vor.toFixed(
      0
    )} over replacement.\n${c.loser.name} (${c.loser.pos}, ${c.loser.team ?? "FA"}), tier ${
      c.loser.tier
    }, ${c.loser.vor.toFixed(0)} over replacement.\nEngine says ${c.winner.name} by ${c.margin.toFixed(1)}.${
      c.homerCost ? ` Homer cost ${c.homerCost.toFixed(0)} points.` : ""
    }\nGive the verdict.`
  );
  return out ?? fallback;
}

export async function narrateLineup(p: Prefs, calls: LineupCall[], leagueName: string) {
  if (!calls.length) return "Lineup is already optimal. Nothing to do.";
  const facts = calls
    .slice(0, 3)
    .map((c) => `Start ${c.in.name} over ${c.out.name} at ${c.slot}, worth about ${c.gain.toFixed(1)} points`)
    .join("\n");
  const fallback = calls
    .slice(0, 3)
    .map((c) => `Start ${c.in.name} over ${c.out.name} (+${c.gain.toFixed(1)})`)
    .join(". ");
  const out = await narrate(systemPrompt(p), `League: ${leagueName}\n${facts}\nSummarise the moves.`);
  return out ?? fallback;
}

/** Turn a plain English feature request into a spec an engineer could build. */
export async function specFromRequest(raw: string) {
  const out = await narrate(
    "You turn a product request into a short implementation spec for a Next.js and Supabase app called Booth, a personal fantasy football assistant. " +
      "Respond with: a one line title, a short description of the behaviour, the files likely to change, and the acceptance criteria as three bullets. No preamble.",
    raw,
    500
  );
  return out ?? raw;
}

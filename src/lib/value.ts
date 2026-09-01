import { LeagueShape, PlayerRow, Pos, POSITIONS, RankedPlayer, RosterState, Slots } from "./types";

/**
 * Deterministic valuation. No model involved.
 *
 * Everything a recommendation rests on is computed here so it is auditable and
 * free. The language model only narrates the result, and only if the user's
 * preferences allow narration at all.
 */

// How a FLEX slot tends to get filled across a league.
const FLEX_SHARE: Partial<Record<Pos, number>> = { RB: 0.5, WR: 0.38, TE: 0.12 };

export function startersPerTeam(slots: Slots, pos: Pos): number {
  const base = slots[pos] ?? 0;
  const flex = (slots.FLEX ?? 0) * (FLEX_SHARE[pos] ?? 0);
  return base + flex;
}

/**
 * Replacement level: the projected points of the player you could get for free
 * at that position once every team has filled its starting slots. Value above
 * that line is the only value that wins you weeks.
 */
export function replacementLevels(players: PlayerRow[], shape: LeagueShape): Record<Pos, number> {
  const out = {} as Record<Pos, number>;
  for (const pos of POSITIONS) {
    const pool = players.filter((p) => p.pos === pos).sort((a, b) => b.proj - a.proj);
    if (!pool.length) {
      out[pos] = 0;
      continue;
    }
    const idx = Math.max(0, Math.ceil(shape.teams * startersPerTeam(shape.slots, pos)) - 1);
    const clamped = Math.min(idx, pool.length - 1);
    // average a small band around the line so one outlier projection cannot move it
    const band = pool.slice(Math.max(0, clamped - 1), Math.min(pool.length, clamped + 2));
    out[pos] = band.reduce((s, p) => s + p.proj, 0) / band.length;
  }
  return out;
}

/**
 * Tier breaks. Within a position, walk down the list and cut a tier where the
 * drop to the next player is unusually large. This is the number that actually
 * decides a draft pick: not who is best, but whether the cliff comes before
 * your next turn.
 */
export function assignTiers(sorted: PlayerRow[], key: (p: PlayerRow) => number): number[] {
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) gaps.push(key(sorted[i - 1]) - key(sorted[i]));
  if (!gaps.length) return sorted.map(() => 1);
  const positive = gaps.filter((g) => g > 0).sort((a, b) => a - b);
  const median = positive.length ? positive[Math.floor(positive.length / 2)] : 0;
  const threshold = Math.max(6, median * 1.6);

  const tiers: number[] = [1];
  let tier = 1;
  for (let i = 1; i < sorted.length; i++) {
    if (key(sorted[i - 1]) - key(sorted[i]) >= threshold) tier++;
    tiers.push(tier);
  }
  return tiers;
}

export interface ScoreOpts {
  homerTeam?: string | null;
  homerWeight: number;
  homerMinSlots: number;
  roster: RosterState;
  picksUntilNextTurn?: number;
  totalRounds?: number;
}

export interface Board {
  ranked: RankedPlayer[];
  replacement: Record<Pos, number>;
  /** Positions where the current tier runs out before your next turn. */
  cliffs: { pos: Pos; playersLeftInTier: number; picksUntilNextTurn: number }[];
}

export function buildBoard(
  available: PlayerRow[],
  shape: LeagueShape,
  opts: ScoreOpts
): Board {
  const replacement = replacementLevels(available, shape);

  /**
   * The homer bonus is a flat number of points, not a percentage of the
   * player's value. Rooting for a guy you are already watching is worth about
   * the same to you whether he is the RB1 or a flex piece, and a percentage
   * would let the bias grow exactly where it is most expensive. The scale is
   * anchored to what a solid starter is worth, so a 15% thumb reads as roughly
   * 15% of a starter, in season points.
   */
  const vorScale = (() => {
    const vs = available
      .map((p) => p.proj - (replacement[p.pos] ?? 0))
      .filter((v) => v > 0)
      .sort((a, b) => b - a);
    if (!vs.length) return 0;
    return vs[Math.min(vs.length - 1, Math.floor(shape.teams * 2))];
  })();

  // tier per position
  const tierByPlayer = new Map<string, number>();
  for (const pos of POSITIONS) {
    const pool = available.filter((p) => p.pos === pos).sort((a, b) => b.proj - a.proj);
    const tiers = assignTiers(pool, (p) => p.proj);
    pool.forEach((p, i) => tierByPlayer.set(p.id, tiers[i]));
  }

  const ranked: RankedPlayer[] = available.map((p) => {
    const vor = p.proj - (replacement[p.pos] ?? 0);
    const reasons: string[] = [];

    // roster need: unfilled starting slots are worth more than a fifth bench WR
    const filled = opts.roster.filled[p.pos] ?? 0;
    const needed = startersPerTeam(shape.slots, p.pos);
    let needMult = 1;
    if (filled < Math.floor(needed)) {
      needMult = 1.1;
      reasons.push(`fills a starting ${p.pos} slot`);
    } else if (filled >= Math.ceil(needed) + 1) {
      needMult = 0.9;
      reasons.push(`${p.pos} is already deep on your roster`);
    }
    const needBoost = vor * (needMult - 1);

    // homer weight: an explicit, visible thumb on the scale
    let homerBoost = 0;
    if (opts.homerTeam && p.team === opts.homerTeam) {
      homerBoost = vorScale * opts.homerWeight;

      // The urgency of hitting your minimum grows as the draft runs out. Do not
      // reach in the first round for a target you have twelve more picks to hit.
      const short = opts.homerMinSlots - opts.roster.homerCount;
      if (short > 0) {
        const lateness = Math.min(1, opts.roster.picksMade / Math.max(1, (opts.totalRounds ?? 15) - 2));
        homerBoost += vorScale * 0.12 * short * lateness;
        if (lateness > 0.4) {
          reasons.push(`you still want ${short} more ${opts.homerTeam} player${short > 1 ? "s" : ""}`);
        }
      } else {
        reasons.push(`${opts.homerTeam}, you are watching him anyway`);
      }
    }

    const tier = tierByPlayer.get(p.id) ?? 9;
    if (tier === 1) reasons.push(`top tier at ${p.pos}`);
    if (p.status && p.status !== "Active") reasons.push(p.status.toLowerCase());

    return {
      ...p,
      vor,
      tier,
      needBoost,
      homerBoost,
      adjusted: vor + needBoost + homerBoost,
      reasons
    };
  });

  ranked.sort((a, b) => b.adjusted - a.adjusted);

  // cliff detection
  const picksUntil = opts.picksUntilNextTurn ?? 0;
  const cliffs: Board["cliffs"] = [];
  if (picksUntil > 0) {
    for (const pos of POSITIONS) {
      if (pos === "K" || pos === "DEF") continue;
      const pool = ranked.filter((p) => p.pos === pos).sort((a, b) => b.proj - a.proj);
      if (!pool.length) continue;
      const topTier = pool[0].tier;
      const left = pool.filter((p) => p.tier === topTier).length;
      // a tier is at risk if fewer players remain in it than picks before you are up
      if (left <= Math.ceil(picksUntil * 0.6)) {
        cliffs.push({ pos, playersLeftInTier: left, picksUntilNextTurn: picksUntil });
      }
    }
    cliffs.sort((a, b) => a.playersLeftInTier - b.playersLeftInTier);
  }

  return { ranked, replacement, cliffs };
}

/** Snake draft: which overall picks belong to you. */
export function myPickNumbers(teams: number, rounds: number, slot: number): number[] {
  const out: number[] = [];
  for (let r = 1; r <= rounds; r++) {
    const inRound = r % 2 === 1 ? slot : teams - slot + 1;
    out.push((r - 1) * teams + inRound);
  }
  return out;
}

export function picksUntilNextTurn(teams: number, rounds: number, slot: number, overallNext: number): number {
  const mine = myPickNumbers(teams, rounds, slot).filter((n) => n >= overallNext);
  if (!mine.length) return 0;
  return mine[0] - overallNext;
}

export interface Comparison {
  winner: RankedPlayer;
  loser: RankedPlayer;
  margin: number;
  /** Projected points you give up by taking the homer option, if that is what you are doing. */
  homerCost: number | null;
  bullets: string[];
  close: boolean;
}

export function compare(a: RankedPlayer, b: RankedPlayer, homerTeam?: string | null): Comparison {
  const [winner, loser] = a.adjusted >= b.adjusted ? [a, b] : [b, a];
  const margin = winner.adjusted - loser.adjusted;
  const bullets: string[] = [];

  const rawDiff = winner.vor - loser.vor;
  bullets.push(
    rawDiff >= 0
      ? `${winner.name} projects ${rawDiff.toFixed(0)} points higher above replacement.`
      : `${loser.name} projects ${Math.abs(rawDiff).toFixed(0)} points higher, but the gap is covered by roster fit.`
  );

  if (winner.pos !== loser.pos) {
    bullets.push(`${winner.pos} tier ${winner.tier} against ${loser.pos} tier ${loser.tier}.`);
  } else if (winner.tier !== loser.tier) {
    bullets.push(`Same position, ${winner.tier === 1 ? "and " : ""}${winner.name} is a tier higher.`);
  } else {
    bullets.push(`Same position, same tier, so this is close to a coin flip on points.`);
  }

  if (winner.needBoost > 0.5) bullets.push(`Fills a hole in your lineup.`);

  let homerCost: number | null = null;
  if (homerTeam && winner.team === homerTeam && loser.team !== homerTeam && winner.vor < loser.vor) {
    homerCost = loser.vor - winner.vor;
    bullets.push(`Taking the ${homerTeam} player costs about ${homerCost.toFixed(0)} projected points. Your call.`);
  }

  return { winner, loser, margin, homerCost, bullets, close: margin < 6 };
}

/** Weekly start/sit uses the same machinery on weekly projections. */
export interface LineupCall {
  in: PlayerRow;
  out: PlayerRow;
  slot: string;
  gain: number;
}

export function optimizeLineup(
  roster: PlayerRow[],
  starters: string[],
  slots: Slots
): LineupCall[] {
  const calls: LineupCall[] = [];
  const bench = roster.filter((p) => !starters.includes(p.id));
  const current = roster.filter((p) => starters.includes(p.id));

  for (const s of current) {
    const better = bench
      .filter((b) => b.pos === s.pos && b.proj > s.proj + 1.5)
      .sort((x, y) => y.proj - x.proj)[0];
    if (better) {
      calls.push({ in: better, out: s, slot: s.pos, gain: better.proj - s.proj });
    }
  }
  return calls.sort((a, b) => b.gain - a.gain);
}

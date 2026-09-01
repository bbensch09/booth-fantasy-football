import { espnRosterUrl, extractRoster, fetchEspnLeague } from "./espn";
import { getState, getTrending, getWeekProjections } from "./sleeper";
import { PlayerRow, Pos, Scoring } from "./types";
import { LineupCall, optimizeLineup } from "./value";

/**
 * The weekly loop. Reads a roster, scores it against this week's projections,
 * and returns the shortest list of moves that actually change your points.
 */

export interface LeagueRow {
  id: string;
  platform: string;
  external_id: string;
  team_id: string | null;
  name: string | null;
  season: number;
  scoring: string;
  teams: number;
  slots: Record<string, number>;
  credentials: any;
}

const norm = (s: string) =>
  s.toLowerCase().replace(/[^a-z ]/g, "").replace(/\b(jr|sr|ii|iii|iv)\b/g, "").replace(/\s+/g, " ").trim();

export function matchPlayer(name: string, pos: string, universe: PlayerRow[]): PlayerRow | null {
  const n = norm(name);
  return (
    universe.find((p) => norm(p.name) === n && p.pos === pos) ??
    universe.find((p) => norm(p.name) === n) ??
    null
  );
}

/** Weekly projections keyed by sleeper player id. */
export async function weeklyProjections(season: number, week: number, scoring: Scoring) {
  const key = scoring === "ppr" ? "pts_ppr" : scoring === "std" ? "pts_std" : "pts_half_ppr";
  const out = new Map<string, number>();
  try {
    const rows = await getWeekProjections(season, week);
    for (const r of rows) {
      const id = String(r.player_id ?? r.player?.player_id ?? "");
      if (id) out.set(id, Number(r.stats?.[key] ?? 0));
    }
  } catch {
    // no projections this week, callers fall back to season numbers
  }
  return out;
}

export interface WeeklyReport {
  league: LeagueRow;
  week: number;
  lineup: LineupCall[];
  adds: { player: PlayerRow; trendingAdds: number; overWorstStarter: number }[];
  rosterUrl: string | null;
  error?: string;
}

export async function buildWeeklyReport(
  league: LeagueRow,
  universe: PlayerRow[],
  opts: { includeWaivers: boolean }
): Promise<WeeklyReport> {
  const state = await getState();
  const week = state.week || 1;
  const weekProj = await weeklyProjections(Number(state.season) || league.season, week, league.scoring as Scoring);

  const withWeek = (p: PlayerRow): PlayerRow => ({ ...p, proj: weekProj.get(p.id) ?? p.proj / 17 });

  let roster: PlayerRow[] = [];
  let starters: string[] = [];
  let rosterUrl: string | null = null;

  try {
    if (league.platform === "espn") {
      const raw = await fetchEspnLeague(league.external_id, league.season, league.credentials);
      const entries = extractRoster(raw, league.team_id ?? "");
      for (const e of entries) {
        const m = matchPlayer(e.name, e.pos, universe);
        if (!m) continue;
        roster.push(withWeek(m));
        if (e.starting) starters.push(m.id);
      }
      rosterUrl = espnRosterUrl(league.external_id, league.team_id ?? "", league.season);
    } else if (league.platform === "sleeper") {
      const res = await fetch(`https://api.sleeper.app/v1/league/${league.external_id}/rosters`, { cache: "no-store" });
      const rosters = (await res.json()) as any[];
      const mine = rosters.find((r) => String(r.roster_id) === String(league.team_id)) ?? rosters[0];
      const ids: string[] = mine?.players ?? [];
      starters = mine?.starters ?? [];
      roster = ids.map((id) => universe.find((p) => p.id === id)).filter(Boolean).map((p) => withWeek(p as PlayerRow));
      rosterUrl = `https://sleeper.com/leagues/${league.external_id}`;
    } else {
      return { league, week, lineup: [], adds: [], rosterUrl: null, error: "Manual league, nothing to read." };
    }
  } catch (e: any) {
    return { league, week, lineup: [], adds: [], rosterUrl: null, error: e?.message ?? "Could not read that roster." };
  }

  const lineup = optimizeLineup(roster, starters, league.slots);

  const adds: WeeklyReport["adds"] = [];
  if (opts.includeWaivers) {
    const rostered = new Set(roster.map((p) => p.id));
    const trending = await getTrending("add", 48, 40);
    const worstStarterByPos = new Map<Pos, number>();
    for (const p of roster.filter((x) => starters.includes(x.id))) {
      const cur = worstStarterByPos.get(p.pos);
      if (cur === undefined || p.proj < cur) worstStarterByPos.set(p.pos, p.proj);
    }
    for (const t of trending) {
      if (rostered.has(t.player_id)) continue;
      const p = universe.find((x) => x.id === t.player_id);
      if (!p) continue;
      const scored = withWeek(p);
      const bar = worstStarterByPos.get(p.pos);
      if (bar === undefined) continue;
      const edge = scored.proj - bar;
      if (edge > 0.5) adds.push({ player: scored, trendingAdds: t.count, overWorstStarter: edge });
    }
    adds.sort((a, b) => b.overWorstStarter - a.overWorstStarter);
  }

  return { league, week, lineup, adds: adds.slice(0, 3), rosterUrl };
}

/**
 * FAAB bid as a flat number. Users who suppressed faab_strategy see this and
 * nothing else, which is the point.
 */
export function faabBid(edge: number, budgetRemaining = 100): number {
  const pct = Math.min(0.35, Math.max(0.01, edge / 40));
  return Math.max(1, Math.round(budgetRemaining * pct));
}

import { PlayerRow, Pos, Scoring } from "./types";

/**
 * Sleeper is the free data layer. Read only, no API key, no account needed.
 * Your leagues do not have to live on Sleeper for any of this to be useful.
 * Docs: https://docs.sleeper.com  Keep well under 1000 calls/minute.
 */
const BASE = "https://api.sleeper.app";
const FANTASY_POS = new Set(["QB", "RB", "WR", "TE", "K", "DEF"]);

export interface SleeperState {
  season: string;
  week: number;
  season_type: string;
}

export async function getState(): Promise<SleeperState> {
  const r = await fetch(`${BASE}/v1/state/nfl`, { next: { revalidate: 900 } });
  if (!r.ok) throw new Error(`sleeper state ${r.status}`);
  return r.json();
}

interface RawPlayer {
  player_id: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  position?: string;
  fantasy_positions?: string[];
  team?: string | null;
  injury_status?: string | null;
  active?: boolean;
  search_rank?: number | null;
}

/** ~5MB payload. Call this once a day at most, from the refresh job. */
export async function getAllPlayers(): Promise<Record<string, RawPlayer>> {
  const r = await fetch(`${BASE}/v1/players/nfl`);
  if (!r.ok) throw new Error(`sleeper players ${r.status}`);
  return r.json();
}

const scoringKey = (s: Scoring) => (s === "ppr" ? "ppr" : s === "std" ? "std" : "half_ppr");

/**
 * Season projections. This endpoint is public but undocumented, so treat a
 * failure as normal and fall back to summing weekly projections.
 */
export async function getSeasonProjections(season: number, scoring: Scoring) {
  const positions = ["QB", "RB", "WR", "TE", "K", "DEF"].map((p) => `position[]=${p}`).join("&");
  const url = `${BASE}/projections/nfl/${season}?season_type=regular&order_by=adp_${scoringKey(scoring)}&${positions}`;
  const r = await fetch(url, { next: { revalidate: 3600 } });
  if (!r.ok) throw new Error(`sleeper season projections ${r.status}`);
  return (await r.json()) as any[];
}

export async function getWeekProjections(season: number, week: number) {
  const positions = ["QB", "RB", "WR", "TE", "K", "DEF"].map((p) => `position[]=${p}`).join("&");
  const url = `${BASE}/projections/nfl/${season}/${week}?season_type=regular&${positions}`;
  const r = await fetch(url, { next: { revalidate: 1800 } });
  if (!r.ok) throw new Error(`sleeper week projections ${r.status}`);
  return (await r.json()) as any[];
}

export async function getTrending(type: "add" | "drop", hours = 24, limit = 40) {
  const r = await fetch(`${BASE}/v1/players/nfl/trending/${type}?lookback_hours=${hours}&limit=${limit}`, {
    next: { revalidate: 900 }
  });
  if (!r.ok) return [] as { player_id: string; count: number }[];
  return (await r.json()) as { player_id: string; count: number }[];
}

function pickPos(raw: RawPlayer): Pos | null {
  const p = raw.position ?? raw.fantasy_positions?.[0];
  if (!p) return null;
  const up = p.toUpperCase();
  if (up === "DST") return "DEF";
  return FANTASY_POS.has(up) ? (up as Pos) : null;
}

/**
 * Merge the player dictionary with projections into the flat rows the engine
 * wants. Trimmed to fantasy-relevant players so it fits comfortably in cache.
 */
export function buildPlayerRows(
  players: Record<string, RawPlayer>,
  projections: any[],
  scoring: Scoring
): PlayerRow[] {
  const key = scoringKey(scoring);
  const projById = new Map<string, any>();
  for (const row of projections) {
    const id = row.player_id ?? row.player?.player_id;
    if (id) projById.set(String(id), row);
  }

  const rows: PlayerRow[] = [];
  for (const [id, raw] of Object.entries(players)) {
    const pos = pickPos(raw);
    if (!pos) continue;
    if (raw.active === false && pos !== "DEF") continue;

    const proj = projById.get(id);
    const stats = proj?.stats ?? {};
    const points = Number(stats[`pts_${key}`] ?? stats.pts_half_ppr ?? stats.pts_std ?? 0);
    if (points <= 0 && pos !== "DEF") continue;

    const adpRaw = stats[`adp_${key}`] ?? stats.adp_half_ppr ?? stats.adp_std ?? null;

    rows.push({
      id,
      name: raw.full_name ?? [raw.first_name, raw.last_name].filter(Boolean).join(" ") ?? id,
      pos,
      team: raw.team ?? null,
      bye: proj?.player?.bye_week ?? null,
      proj: Math.round(points * 10) / 10,
      adp: adpRaw == null ? null : Number(adpRaw),
      status: raw.injury_status ?? null
    });
  }

  rows.sort((a, b) => b.proj - a.proj);
  return rows.slice(0, 700);
}

/** Sum weekly projections when the season endpoint is unavailable. */
export async function seasonFromWeekly(season: number, scoring: Scoring, weeks = 17) {
  const key = scoringKey(scoring);
  const totals = new Map<string, number>();
  for (let w = 1; w <= weeks; w++) {
    let rows: any[] = [];
    try {
      rows = await getWeekProjections(season, w);
    } catch {
      continue;
    }
    for (const row of rows) {
      const id = String(row.player_id ?? row.player?.player_id ?? "");
      if (!id) continue;
      const pts = Number(row.stats?.[`pts_${key}`] ?? 0);
      totals.set(id, (totals.get(id) ?? 0) + pts);
    }
  }
  return Array.from(totals.entries()).map(([player_id, pts]) => ({
    player_id,
    stats: { [`pts_${key}`]: pts }
  }));
}

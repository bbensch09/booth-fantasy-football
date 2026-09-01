import { PlayerRow, Scoring } from "./types";
import { buildPlayerRows, getAllPlayers, getSeasonProjections, seasonFromWeekly } from "./sleeper";
import { createServiceClient } from "./supabase-server";

const CACHE_HOURS = 12;

/**
 * Player rows come from a shared cache row rather than a per user fetch. The
 * Sleeper player dictionary is about 5MB, so pulling it on every page load
 * would be rude to them and slow for us.
 */
export async function getPlayerRows(scoring: Scoring | string): Promise<PlayerRow[]> {
  const key = `rows_${scoring}_${new Date().getFullYear()}`;

  try {
    const service = createServiceClient();
    const { data } = await service.from("player_cache").select("payload, updated_at").eq("key", key).maybeSingle();

    const fresh =
      data?.updated_at && Date.now() - new Date(data.updated_at).getTime() < CACHE_HOURS * 3600 * 1000;
    if (fresh && Array.isArray(data?.payload)) return data.payload as PlayerRow[];

    const rows = await refreshPlayerRows(scoring as Scoring);
    return rows;
  } catch {
    // cache unavailable, fetch live so the draft room still works
    return refreshPlayerRows(scoring as Scoring, false);
  }
}

export async function refreshPlayerRows(scoring: Scoring, persist = true): Promise<PlayerRow[]> {
  const season = new Date().getFullYear();
  const players = await getAllPlayers();

  let projections: any[] = [];
  try {
    projections = await getSeasonProjections(season, scoring);
  } catch {
    projections = await seasonFromWeekly(season, scoring);
  }

  const rows = buildPlayerRows(players, projections, scoring);

  if (persist) {
    try {
      const service = createServiceClient();
      await service.from("player_cache").upsert({
        key: `rows_${scoring}_${season}`,
        payload: rows,
        updated_at: new Date().toISOString()
      });
    } catch {
      // cache write is best effort
    }
  }
  return rows;
}

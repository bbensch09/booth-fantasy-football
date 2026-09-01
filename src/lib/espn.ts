/**
 * ESPN has no public API. Everything here rides on the private endpoints the
 * fantasy web app itself uses, authenticated with two cookies you copy out of
 * your browser. It works well for reads and it can break without warning, so
 * every call is wrapped and failures degrade to "sync manually".
 *
 * Getting your cookies: log in to fantasy.espn.com, open developer tools,
 * Application > Cookies > espn.com, copy espn_s2 and SWID.
 */
const READ_HOST = "https://lm-api-reads.fantasy.espn.com";

export interface EspnCreds {
  espn_s2: string;
  swid: string;
}

export interface EspnRosterPlayer {
  espnId: number;
  name: string;
  pos: string;
  team: string | null;
  lineupSlotId: number;
  starting: boolean;
}

const SLOT_NAMES: Record<number, string> = {
  0: "QB", 2: "RB", 4: "WR", 6: "TE", 16: "DEF", 17: "K", 20: "BN", 21: "IR", 23: "FLEX"
};

const POS_BY_ID: Record<number, string> = { 1: "QB", 2: "RB", 3: "WR", 4: "TE", 5: "K", 16: "DEF" };

export async function fetchEspnLeague(leagueId: string, season: number, creds: EspnCreds) {
  const url =
    `${READ_HOST}/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${leagueId}` +
    `?view=mTeam&view=mRoster&view=mSettings&view=mMatchup`;

  const res = await fetch(url, {
    headers: {
      cookie: `espn_s2=${creds.espn_s2}; SWID=${creds.swid}`,
      "user-agent": "Mozilla/5.0 (Booth fantasy assistant)",
      accept: "application/json"
    },
    cache: "no-store"
  });

  if (res.status === 401) throw new Error("ESPN rejected the cookies. Copy espn_s2 and SWID again.");
  if (!res.ok) throw new Error(`ESPN returned ${res.status}`);
  return res.json();
}

export function extractTeams(league: any) {
  return (league?.teams ?? []).map((t: any) => ({
    id: String(t.id),
    name: [t.location, t.nickname].filter(Boolean).join(" ").trim() || t.name || `Team ${t.id}`,
    owners: t.owners ?? []
  }));
}

export function extractRoster(league: any, teamId: string): EspnRosterPlayer[] {
  const team = (league?.teams ?? []).find((t: any) => String(t.id) === String(teamId));
  const entries = team?.roster?.entries ?? [];
  return entries.map((e: any) => {
    const p = e.playerPoolEntry?.player ?? {};
    return {
      espnId: p.id,
      name: p.fullName ?? "Unknown",
      pos: POS_BY_ID[p.defaultPositionId] ?? "FLEX",
      team: p.proTeamId ? String(p.proTeamId) : null,
      lineupSlotId: e.lineupSlotId,
      starting: !["BN", "IR"].includes(SLOT_NAMES[e.lineupSlotId] ?? "BN")
    };
  });
}

/** Deep link straight to the roster page, since Booth cannot make the move for you. */
export function espnRosterUrl(leagueId: string, teamId: string, season: number) {
  return `https://fantasy.espn.com/football/team?leagueId=${leagueId}&teamId=${teamId}&seasonId=${season}`;
}

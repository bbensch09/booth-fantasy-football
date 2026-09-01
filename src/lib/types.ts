export type Pos = "QB" | "RB" | "WR" | "TE" | "K" | "DEF";
export const POSITIONS: Pos[] = ["QB", "RB", "WR", "TE", "K", "DEF"];

export type Scoring = "std" | "half_ppr" | "ppr";

export type Slots = Record<string, number>; // QB, RB, WR, TE, FLEX, K, DEF, BN

export interface PlayerRow {
  id: string;              // sleeper player id, or team code for DEF
  name: string;
  pos: Pos;
  team: string | null;     // NFL team code, e.g. "SF"
  bye: number | null;
  proj: number;            // season projected points in the league's scoring
  adp: number | null;      // average draft position, lower is earlier
  status?: string | null;  // injury status
}

export interface LeagueShape {
  teams: number;
  slots: Slots;
  scoring: Scoring;
}

export interface RankedPlayer extends PlayerRow {
  vor: number;             // value over replacement, in season points
  tier: number;            // 1 is best, per position
  adjusted: number;        // vor after need and homer adjustments
  homerBoost: number;      // points of adjustment attributable to the homer weight
  needBoost: number;
  reasons: string[];
}

export interface RosterState {
  filled: Partial<Record<Pos, number>>;
  homerCount: number;
  picksMade: number;
}

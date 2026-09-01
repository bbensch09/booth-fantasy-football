export interface Prefs {
  time_budget_min: number;
  autonomy: "recommend_only" | "recommend_deeplink";
  risk: "floor" | "balanced" | "ceiling";
  homer_team: string | null;
  homer_weight: number;
  homer_min_slots: number;
  suppress: string[];
  gameday_checkins: boolean;
  digest_day: string;
  digest_hour: number;
  timezone: string;
  notify_email: string | null;
  notify_sms: string | null;
  notify_telegram_chat_id: string | null;
  urgent_channel: "email" | "sms" | "telegram" | "none";
  onboarded: boolean;
}

export const DEFAULT_PREFS: Prefs = {
  time_budget_min: 60,
  autonomy: "recommend_deeplink",
  risk: "balanced",
  homer_team: null,
  homer_weight: 0.15,
  homer_min_slots: 0,
  suppress: [],
  gameday_checkins: true,
  digest_day: "sun",
  digest_hour: 9,
  timezone: "America/Los_Angeles",
  notify_email: null,
  notify_sms: null,
  notify_telegram_chat_id: null,
  urgent_channel: "email",
  onboarded: false
};

export const SUPPRESSIBLE = [
  { key: "trades", label: "Trade ideas" },
  { key: "faab_strategy", label: "How to think about FAAB" },
  { key: "matchup_deep_dive", label: "Matchup breakdowns" },
  { key: "waiver_wire", label: "Waiver claims" },
  { key: "long_reasoning", label: "Long explanations" }
] as const;

/** A weekly time budget is a real output constraint, not a note in a prompt. */
export function decisionBudget(p: Prefs): number {
  return Math.max(1, Math.min(6, Math.round(p.time_budget_min / 20)));
}

/** How many sentences of reasoning a recommendation is allowed to carry. */
export function reasoningBudget(p: Prefs): number {
  if (p.suppress.includes("long_reasoning")) return 1;
  if (p.time_budget_min <= 45) return 1;
  if (p.time_budget_min <= 90) return 2;
  return 4;
}

export function suppressed(p: Prefs, kind: string): boolean {
  return p.suppress.includes(kind);
}

/** Ceiling chasers get variance rewarded, floor players get it penalised. */
export function riskMultiplier(p: Prefs, volatility: number): number {
  const v = Math.max(0, Math.min(1, volatility));
  if (p.risk === "ceiling") return 1 + v * 0.08;
  if (p.risk === "floor") return 1 - v * 0.08;
  return 1;
}

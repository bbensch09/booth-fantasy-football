import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { getPlayerRows } from "@/lib/players";
import { DEFAULT_PREFS } from "@/lib/prefs";
import DraftRoom from "./DraftRoom";

export const dynamic = "force-dynamic";

export default async function DraftPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const { data: prefs } = await supabase
    .from("preferences")
    .select("*")
    .eq("user_id", auth.user.id)
    .maybeSingle();

  const { data: session } = await supabase
    .from("draft_sessions")
    .select("*")
    .eq("user_id", auth.user.id)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let picks: { overall: number; team_slot: number; player_id: string; is_mine: boolean }[] = [];
  if (session) {
    const { data } = await supabase
      .from("draft_picks")
      .select("overall, team_slot, player_id, is_mine")
      .eq("session_id", session.id)
      .order("overall");
    picks = data ?? [];
  }

  const players = await getPlayerRows(session?.scoring ?? "half_ppr");

  return (
    <DraftRoom
      userId={auth.user.id}
      prefs={{ ...DEFAULT_PREFS, ...(prefs ?? {}) }}
      players={players}
      session={session}
      initialPicks={picks}
    />
  );
}

import { createClient } from "@/lib/supabase-server";
import { getPlayerRows } from "@/lib/players";
import { DEFAULT_PREFS } from "@/lib/prefs";
import DraftRoom from "./DraftRoom";

export const dynamic = "force-dynamic";

export default async function DraftPage() {
  // Auth is optional — the draft room works as a guest with localStorage only.
  let userId: string | null = null;
  let prefs = DEFAULT_PREFS;
  let session = null;
  let picks: { overall: number; team_slot: number; player_id: string; is_mine: boolean }[] = [];

  try {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();

    if (auth.user) {
      userId = auth.user.id;

      const [{ data: prefsRow }, { data: activeSession }] = await Promise.all([
        supabase.from("preferences").select("*").eq("user_id", auth.user.id).maybeSingle(),
        supabase
          .from("draft_sessions")
          .select("*")
          .eq("user_id", auth.user.id)
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      ]);

      if (prefsRow) prefs = { ...DEFAULT_PREFS, ...prefsRow };
      session = activeSession;

      if (session) {
        const { data } = await supabase
          .from("draft_picks")
          .select("overall, team_slot, player_id, is_mine")
          .eq("session_id", session.id)
          .order("overall");
        picks = data ?? [];
      }
    }
  } catch {
    // Supabase not configured — guest mode, everything runs in localStorage.
  }

  const players = await getPlayerRows(session?.scoring ?? "half_ppr");

  return (
    <DraftRoom
      userId={userId}
      prefs={prefs}
      players={players}
      session={session}
      initialPicks={picks}
    />
  );
}

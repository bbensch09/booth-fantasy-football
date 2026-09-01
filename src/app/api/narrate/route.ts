import { NextResponse } from "next/server";
import { DEFAULT_PREFS, Prefs } from "@/lib/prefs";
import { narrateComparison } from "@/lib/advice";

export async function POST(request: Request) {
  const body = await request.json();
  if (body.kind !== "compare") return NextResponse.json({ error: "Unknown request." }, { status: 400 });

  let prefs: Prefs = { ...DEFAULT_PREFS };

  // load user prefs and log decision when Supabase is configured
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    try {
      const { createClient } = await import("@/lib/supabase-server");
      const supabase = await createClient();
      const { data: auth } = await supabase.auth.getUser();
      if (auth.user) {
        const { data: row } = await supabase
          .from("preferences")
          .select("*")
          .eq("user_id", auth.user.id)
          .maybeSingle();
        prefs = { ...DEFAULT_PREFS, ...(row ?? {}) };

        const text = await narrateComparison(prefs, {
          winner: body.winner,
          loser: body.loser,
          margin: body.margin,
          homerCost: body.homerCost,
          bullets: [],
          close: body.margin < 6
        });

        await supabase.from("decisions").insert({
          user_id: auth.user.id,
          kind: "compare",
          payload: { winner: body.winner?.name, loser: body.loser?.name, margin: body.margin, text }
        });

        return NextResponse.json({ text });
      }
    } catch {
      // fall through to unauthenticated path
    }
  }

  // guest / unconfigured: narrate without saving
  const text = await narrateComparison(prefs, {
    winner: body.winner,
    loser: body.loser,
    margin: body.margin,
    homerCost: body.homerCost,
    bullets: [],
    close: body.margin < 6
  });
  return NextResponse.json({ text });
}

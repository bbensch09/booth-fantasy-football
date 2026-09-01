import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { DEFAULT_PREFS, Prefs } from "@/lib/prefs";
import { narrateComparison } from "@/lib/advice";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const { data: row } = await supabase
    .from("preferences")
    .select("*")
    .eq("user_id", auth.user.id)
    .maybeSingle();
  const prefs: Prefs = { ...DEFAULT_PREFS, ...(row ?? {}) };

  const body = await request.json();
  if (body.kind !== "compare") return NextResponse.json({ error: "Unknown request." }, { status: 400 });

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

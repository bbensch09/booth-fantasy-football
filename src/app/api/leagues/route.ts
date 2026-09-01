import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { extractTeams, fetchEspnLeague } from "@/lib/espn";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const body = await request.json();
  const season = new Date().getFullYear();

  // verify the connection before saving it, so a bad cookie fails here and not
  // at 10am on a Sunday
  if (body.platform === "espn") {
    try {
      const league = await fetchEspnLeague(body.external_id, season, {
        espn_s2: body.espn_s2,
        swid: body.swid
      });
      const teams = extractTeams(league);
      if (body.team_id && !teams.some((t: any) => t.id === String(body.team_id))) {
        return NextResponse.json(
          { error: `Team ${body.team_id} is not in that league. Teams found: ${teams.map((t: any) => t.id).join(", ")}` },
          { status: 400 }
        );
      }
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
  }

  const { error } = await supabase.from("leagues").upsert(
    {
      user_id: auth.user.id,
      platform: body.platform,
      external_id: String(body.external_id),
      team_id: body.team_id ? String(body.team_id) : null,
      name: body.name || null,
      season,
      scoring: body.scoring ?? "half_ppr",
      teams: Number(body.teams) || 12,
      credentials:
        body.platform === "espn" ? { espn_s2: body.espn_s2, swid: body.swid } : null,
      last_synced_at: new Date().toISOString()
    },
    { onConflict: "user_id,platform,external_id" }
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { exchangeCode, yahooGet, yahooPaths } from "@/lib/yahoo";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  if (!code) return NextResponse.redirect(`${origin}/settings?yahoo=denied`);

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.redirect(`${origin}/login`);

  const redirect = `${origin}/api/yahoo/callback`;
  try {
    const tokens = await exchangeCode(code, redirect);
    const { data } = await yahooGet(yahooPaths.myTeams, tokens, redirect);

    // Yahoo's JSON is deeply nested, so store the raw payload and let the user
    // pick their team in settings rather than guessing here.
    await supabase.from("leagues").upsert(
      {
        user_id: auth.user.id,
        platform: "yahoo",
        external_id: "pending",
        season: new Date().getFullYear(),
        credentials: { tokens, discovery: data }
      },
      { onConflict: "user_id,platform,external_id" }
    );
    return NextResponse.redirect(`${origin}/settings?yahoo=connected`);
  } catch (e: any) {
    return NextResponse.redirect(`${origin}/settings?yahoo=error`);
  }
}

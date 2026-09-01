import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import PrefsForm from "../onboarding/PrefsForm";
import LeagueConnect from "./LeagueConnect";

export default async function Settings() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const [{ data: prefs }, { data: leagues }] = await Promise.all([
    supabase.from("preferences").select("*").eq("user_id", auth.user.id).maybeSingle(),
    supabase.from("leagues").select("*").eq("user_id", auth.user.id).order("created_at")
  ]);

  return (
    <div className="max-w-2xl space-y-10">
      <div>
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Leagues</h1>
        <LeagueConnect leagues={leagues ?? []} />
      </div>
      <div className="rule-t pt-8">
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Preferences</h1>
        <div className="mt-6">
          <PrefsForm initial={prefs ?? {}} mode="settings" />
        </div>
      </div>
    </div>
  );
}

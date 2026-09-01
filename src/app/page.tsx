import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";

export default async function Home() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");

  const { data: prefs } = await supabase
    .from("preferences")
    .select("onboarded")
    .eq("user_id", data.user.id)
    .maybeSingle();

  redirect(prefs?.onboarded ? "/dashboard" : "/onboarding");
}

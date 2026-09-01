import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import PrefsForm from "./PrefsForm";

export default async function Onboarding() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const { data: prefs } = await supabase
    .from("preferences")
    .select("*")
    .eq("user_id", auth.user.id)
    .maybeSingle();

  return (
    <div className="max-w-2xl">
      <h1 className="font-display text-3xl font-extrabold tracking-tight">Set your terms</h1>
      <p className="mt-2 text-muted">
        Every answer here changes what Booth does, not just how it talks. You can change any of it later.
      </p>
      <div className="mt-8">
        <PrefsForm initial={{ ...prefs, notify_email: prefs?.notify_email ?? auth.user.email }} mode="onboarding" />
      </div>
    </div>
  );
}

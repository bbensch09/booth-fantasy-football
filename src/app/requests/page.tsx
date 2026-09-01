import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import RequestChat from "./RequestChat";

export const dynamic = "force-dynamic";

export default async function Requests() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const { data: requests } = await supabase
    .from("feature_requests")
    .select("*")
    .eq("user_id", auth.user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  return (
    <div className="max-w-2xl">
      <h1 className="font-display text-3xl font-extrabold tracking-tight">Ask for a feature</h1>
      <p className="mt-2 text-muted">
        Say what you want Booth to do. It writes the spec, opens a pull request, and sends you a
        preview link. You approve the merge, so nothing changes under you mid week.
      </p>
      <RequestChat initial={requests ?? []} />
    </div>
  );
}

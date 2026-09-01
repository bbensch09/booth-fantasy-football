import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { getPlayerRows } from "@/lib/players";
import { DEFAULT_PREFS, Prefs, decisionBudget, suppressed } from "@/lib/prefs";
import { buildWeeklyReport } from "@/lib/weekly";
import { faabBid } from "@/lib/weekly";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const [{ data: prefsRow }, { data: leagues }] = await Promise.all([
    supabase.from("preferences").select("*").eq("user_id", auth.user.id).maybeSingle(),
    supabase.from("leagues").select("*").eq("user_id", auth.user.id).order("created_at")
  ]);

  const prefs: Prefs = { ...DEFAULT_PREFS, ...(prefsRow ?? {}) };
  if (!prefs.onboarded) redirect("/onboarding");

  if (!leagues?.length) {
    return (
      <div className="max-w-lg">
        <h1 className="font-display text-3xl font-extrabold tracking-tight">No leagues yet</h1>
        <p className="mt-2 text-muted">
          Connect a team and Booth starts reading it. Drafting this week instead?
        </p>
        <div className="mt-6 flex gap-3">
          <Link href="/settings" className="bg-ink px-4 py-2 text-sm font-medium text-paper">Connect a league</Link>
          <Link href="/draft" className="border border-rule px-4 py-2 text-sm">Open the draft board</Link>
        </div>
      </div>
    );
  }

  const universe = await getPlayerRows(leagues[0].scoring);
  const budget = decisionBudget(prefs);
  const wantWaivers = !suppressed(prefs, "waiver_wire");

  const reports = await Promise.all(
    leagues.map((l: any) => buildWeeklyReport(l, universe, { includeWaivers: wantWaivers }))
  );

  const totalCalls = reports.reduce((n, r) => n + r.lineup.length + r.adds.length, 0);

  return (
    <div className="max-w-3xl">
      <div className="flex items-baseline justify-between">
        <h1 className="font-display text-3xl font-extrabold tracking-tight">
          Week {reports[0]?.week ?? "-"}
        </h1>
        <p className="text-sm text-muted">
          {totalCalls === 0
            ? "Nothing needs you"
            : `${Math.min(totalCalls, budget * leagues.length)} thing${totalCalls === 1 ? "" : "s"} to do`}
        </p>
      </div>

      <div className="mt-6 space-y-8">
        {reports.map((r) => (
          <section key={r.league.id}>
            <h2 className="font-display text-lg font-semibold">
              {r.league.name || `${r.league.platform} league`}
            </h2>

            {r.error && <p className="mt-2 text-sm text-crimson">{r.error}</p>}

            {!r.error && !r.lineup.length && !r.adds.length && (
              <p className="mt-2 text-sm text-teal">Lineup is optimal and nothing on waivers beats it. Go watch the game.</p>
            )}

            {r.lineup.slice(0, budget).map((c, i) => (
              <div key={i} className="mt-3 border-l-2 border-teal bg-surface px-3 py-2">
                <div className="font-medium">
                  Start {c.in.name} over {c.out.name}
                </div>
                <div className="num text-sm text-muted">
                  {c.slot} · worth about {c.gain.toFixed(1)} points this week
                </div>
              </div>
            ))}

            {r.adds.map((a, i) => (
              <div key={i} className="mt-3 border-l-2 border-gold bg-surface px-3 py-2">
                <div className="font-medium">
                  Add {a.player.name} ({a.player.pos}
                  {a.player.team ? `, ${a.player.team}` : ""})
                </div>
                <div className="num text-sm text-muted">
                  Bid {faabBid(a.overWorstStarter)}% of your budget
                  {suppressed(prefs, "faab_strategy")
                    ? ""
                    : ` · projects ${a.overWorstStarter.toFixed(1)} above your weakest starter`}
                </div>
              </div>
            ))}

            {r.rosterUrl && (r.lineup.length > 0 || r.adds.length > 0) && prefs.autonomy === "recommend_deeplink" && (
              <a href={r.rosterUrl} target="_blank" rel="noreferrer" className="mt-3 inline-block border border-rule px-3 py-1.5 text-sm">
                Open the roster in {r.league.platform === "espn" ? "ESPN" : "Sleeper"}
              </a>
            )}
          </section>
        ))}
      </div>

      <p className="rule-t mt-10 pt-4 text-sm text-muted">
        Booth reads your leagues and works out the call. Making the move stays with you, because
        neither Yahoo nor ESPN grants write access to an app like this.
      </p>
    </div>
  );
}

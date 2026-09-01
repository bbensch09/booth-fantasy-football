import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { getPlayerRows } from "@/lib/players";
import { DEFAULT_PREFS, Prefs, decisionBudget, suppressed } from "@/lib/prefs";
import { buildWeeklyReport, faabBid } from "@/lib/weekly";
import { narrateLineup } from "@/lib/advice";
import { deliver } from "@/lib/notify";

/**
 * Scheduled from GitHub Actions, which is free and lets you set any cadence.
 * Runs hourly; each user only gets sent something when the clock matches the
 * digest time they chose.
 */
export async function POST(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "no" }, { status: 401 });
  }

  const url = new URL(request.url);
  const force = url.searchParams.get("force") === "1";
  const service = createServiceClient();

  const { data: prefRows } = await service.from("preferences").select("*").eq("onboarded", true);
  const sent: { user: string; channels: string[] }[] = [];

  for (const row of prefRows ?? []) {
    const prefs: Prefs = { ...DEFAULT_PREFS, ...row };

    if (!force && !isDigestTime(prefs)) continue;

    const { data: leagues } = await service.from("leagues").select("*").eq("user_id", row.user_id);
    if (!leagues?.length) continue;

    const universe = await getPlayerRows(leagues[0].scoring);
    const budget = decisionBudget(prefs);
    const wantWaivers = !suppressed(prefs, "waiver_wire");

    const blocks: string[] = [];
    for (const league of leagues) {
      const report = await buildWeeklyReport(league as any, universe, { includeWaivers: wantWaivers });
      if (report.error) {
        blocks.push(`${league.name ?? league.platform}: ${report.error}`);
        continue;
      }
      const lines: string[] = [];
      if (report.lineup.length) {
        lines.push(await narrateLineup(prefs, report.lineup.slice(0, budget), league.name ?? league.platform));
      }
      for (const a of report.adds.slice(0, Math.max(0, budget - report.lineup.length))) {
        lines.push(`Add ${a.player.name} (${a.player.pos}), bid ${faabBid(a.overWorstStarter)}%.`);
      }
      if (!lines.length) lines.push("Lineup is optimal. Nothing to do.");
      if (report.rosterUrl && prefs.autonomy === "recommend_deeplink") lines.push(report.rosterUrl);

      blocks.push(`${league.name ?? league.platform}\n${lines.join("\n")}`);

      await service.from("decisions").insert({
        user_id: row.user_id,
        league_id: league.id,
        week: report.week,
        kind: "start_sit",
        payload: {
          lineup: report.lineup.map((c) => ({ in: c.in.name, out: c.out.name, gain: c.gain })),
          adds: report.adds.map((a) => ({ name: a.player.name, edge: a.overWorstStarter }))
        }
      });
    }

    const channels = await deliver(prefs, {
      subject: `Booth: your week in ${blocks.length} note${blocks.length === 1 ? "" : "s"}`,
      body: blocks.join("\n\n")
    });
    sent.push({ user: row.user_id, channels });
  }

  return NextResponse.json({ ok: true, sent });
}

function isDigestTime(prefs: Prefs): boolean {
  const now = new Date();
  const local = new Date(now.toLocaleString("en-US", { timeZone: prefs.timezone }));
  const day = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][local.getDay()];
  return day === prefs.digest_day && local.getHours() === prefs.digest_hour;
}

import { NextResponse } from "next/server";
import { refreshPlayerRows } from "@/lib/players";
import { Scoring } from "@/lib/types";

/** Called by the scheduled job. Rebuilds the shared player cache. */
export async function POST(request: Request) {
  const secret = request.headers.get("authorization");
  if (secret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "no" }, { status: 401 });
  }

  const results: Record<string, number> = {};
  for (const scoring of ["half_ppr", "ppr", "std"] as Scoring[]) {
    try {
      const rows = await refreshPlayerRows(scoring);
      results[scoring] = rows.length;
    } catch (e: any) {
      results[scoring] = -1;
    }
  }
  return NextResponse.json({ ok: true, results });
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface League {
  id: string;
  platform: string;
  name: string | null;
  external_id: string;
  team_id: string | null;
  teams: number;
  scoring: string;
  last_synced_at: string | null;
}

export default function LeagueConnect({ leagues }: { leagues: League[] }) {
  const router = useRouter();
  const [platform, setPlatform] = useState<"espn" | "sleeper" | "manual">("espn");
  const [form, setForm] = useState({
    external_id: "",
    team_id: "",
    name: "",
    teams: 12,
    scoring: "half_ppr",
    espn_s2: "",
    swid: ""
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function connect() {
    setBusy(true);
    setError("");
    const res = await fetch("/api/leagues", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ platform, ...form })
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json()).error ?? "Could not connect that league.");
      return;
    }
    setForm({ ...form, external_id: "", team_id: "", name: "" });
    router.refresh();
  }

  return (
    <div className="mt-4">
      {leagues.length > 0 && (
        <ul className="mb-6 divide-y divide-rule border border-rule bg-surface">
          {leagues.map((l) => (
            <li key={l.id} className="flex items-baseline justify-between px-4 py-3">
              <div>
                <span className="font-medium">{l.name || `${l.platform} league`}</span>
                <span className="ml-2 text-sm text-muted">
                  {l.platform} · {l.teams} teams · {l.scoring.replace("_", " ")}
                </span>
              </div>
              <span className="num text-sm text-muted">
                {l.last_synced_at ? `synced ${new Date(l.last_synced_at).toLocaleDateString()}` : "not synced"}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="border border-rule bg-surface p-4">
        <div className="flex gap-2">
          {(["espn", "sleeper", "manual"] as const).map((pl) => (
            <button
              key={pl}
              onClick={() => setPlatform(pl)}
              className={`border px-3 py-1.5 text-sm ${platform === pl ? "border-ink bg-ink text-paper" : "border-rule"}`}
            >
              {pl === "espn" ? "ESPN" : pl === "sleeper" ? "Sleeper" : "Type it in"}
            </button>
          ))}
          <span className="ml-auto self-center text-sm text-muted">
            Yahoo: <a className="underline" href="https://sports.yahoo.com/developer/access/">access pending</a>
          </span>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="text-muted">League id</span>
            <input
              value={form.external_id}
              onChange={(e) => setForm({ ...form, external_id: e.target.value })}
              placeholder="from the league URL"
              className="num mt-1 block w-full border border-rule px-3 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="text-muted">Your team id</span>
            <input
              value={form.team_id}
              onChange={(e) => setForm({ ...form, team_id: e.target.value })}
              className="num mt-1 block w-full border border-rule px-3 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="text-muted">Name it</span>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Work league"
              className="mt-1 block w-full border border-rule px-3 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="text-muted">Scoring</span>
            <select
              value={form.scoring}
              onChange={(e) => setForm({ ...form, scoring: e.target.value })}
              className="mt-1 block w-full border border-rule px-3 py-2"
            >
              <option value="half_ppr">Half PPR</option>
              <option value="ppr">Full PPR</option>
              <option value="std">Standard</option>
            </select>
          </label>

          {platform === "espn" && (
            <>
              <label className="text-sm sm:col-span-2">
                <span className="text-muted">
                  espn_s2 cookie
                  <span className="ml-2">
                    (fantasy.espn.com, developer tools, Application, Cookies, espn.com)
                  </span>
                </span>
                <input
                  value={form.espn_s2}
                  onChange={(e) => setForm({ ...form, espn_s2: e.target.value })}
                  className="mt-1 block w-full border border-rule px-3 py-2 font-mono text-xs"
                />
              </label>
              <label className="text-sm">
                <span className="text-muted">SWID cookie</span>
                <input
                  value={form.swid}
                  onChange={(e) => setForm({ ...form, swid: e.target.value })}
                  placeholder="{ABC-123}"
                  className="mt-1 block w-full border border-rule px-3 py-2 font-mono text-xs"
                />
              </label>
            </>
          )}
        </div>

        {error && <p className="mt-3 text-sm text-crimson">{error}</p>}

        <button
          onClick={connect}
          disabled={busy || !form.external_id}
          className="mt-4 bg-ink px-4 py-2 text-sm font-medium text-paper disabled:opacity-40"
        >
          {busy ? "Connecting" : "Connect league"}
        </button>
      </div>
    </div>
  );
}

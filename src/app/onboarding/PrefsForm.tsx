"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-client";
import { DEFAULT_PREFS, Prefs, SUPPRESSIBLE, decisionBudget } from "@/lib/prefs";

const NFL_TEAMS = [
  "ARI","ATL","BAL","BUF","CAR","CHI","CIN","CLE","DAL","DEN","DET","GB","HOU","IND","JAX","KC",
  "LAC","LAR","LV","MIA","MIN","NE","NO","NYG","NYJ","PHI","PIT","SEA","SF","TB","TEN","WAS"
];

export default function PrefsForm({ initial, mode }: { initial: Partial<Prefs>; mode: "onboarding" | "settings" }) {
  const router = useRouter();
  const [p, setP] = useState<Prefs>({ ...DEFAULT_PREFS, ...initial });
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof Prefs>(k: K, v: Prefs[K]) => setP((old) => ({ ...old, [k]: v }));

  async function save() {
    setSaving(true);
    const supabase = createClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) return;
    await supabase.from("preferences").upsert({ ...p, user_id: data.user.id, onboarded: true, updated_at: new Date().toISOString() });
    setSaving(false);
    router.push(mode === "onboarding" ? "/dashboard" : "/settings");
    router.refresh();
  }

  const budget = decisionBudget(p);

  return (
    <div className="space-y-8">
      <section>
        <h2 className="font-display text-lg font-semibold">Time</h2>
        <p className="mt-1 text-sm text-muted">
          Outside of watching games. This is a hard cap on output, not a suggestion.
        </p>
        <div className="mt-3 flex items-center gap-4">
          <input
            type="range"
            min={15}
            max={240}
            step={15}
            value={p.time_budget_min}
            onChange={(e) => set("time_budget_min", Number(e.target.value))}
            className="w-64"
          />
          <span className="num font-display text-2xl font-extrabold">{p.time_budget_min}</span>
          <span className="text-sm text-muted">min per week</span>
        </div>
        <p className="mt-2 text-sm text-teal">
          Booth will bring you at most {budget} decision{budget > 1 ? "s" : ""} a week and keep the reasoning short.
        </p>
      </section>

      <section className="rule-t pt-6">
        <h2 className="font-display text-lg font-semibold">Your team</h2>
        <p className="mt-1 text-sm text-muted">
          If you already watch a team every week, rostering them is worth something real. Booth will
          weigh them up, and tell you when it costs you points.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <select
            value={p.homer_team ?? ""}
            onChange={(e) => set("homer_team", e.target.value || null)}
            className="border border-rule bg-surface px-3 py-2"
          >
            <option value="">No preference</option>
            {NFL_TEAMS.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>

          {p.homer_team && (
            <>
              <label className="text-sm text-muted">
                Thumb on the scale
                <input
                  type="range"
                  min={0}
                  max={0.4}
                  step={0.05}
                  value={p.homer_weight}
                  onChange={(e) => set("homer_weight", Number(e.target.value))}
                  className="ml-3 w-40 align-middle"
                />
                <span className="num ml-2 text-ink">{Math.round(p.homer_weight * 100)}%</span>
              </label>
              <label className="text-sm text-muted">
                Keep at least
                <input
                  type="number"
                  min={0}
                  max={5}
                  value={p.homer_min_slots}
                  onChange={(e) => set("homer_min_slots", Number(e.target.value))}
                  className="num mx-2 w-14 border border-rule bg-surface px-2 py-1"
                />
                on the roster
              </label>
            </>
          )}
        </div>
      </section>

      <section className="rule-t pt-6">
        <h2 className="font-display text-lg font-semibold">Never bring me</h2>
        <p className="mt-1 text-sm text-muted">Anything you check here will not appear, ever.</p>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
          {SUPPRESSIBLE.map((s) => (
            <label key={s.key} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={p.suppress.includes(s.key)}
                onChange={(e) =>
                  set(
                    "suppress",
                    e.target.checked ? [...p.suppress, s.key] : p.suppress.filter((x) => x !== s.key)
                  )
                }
              />
              {s.label}
            </label>
          ))}
        </div>
        {p.suppress.includes("faab_strategy") && (
          <p className="mt-2 text-sm text-teal">Booth will give you a bid number with no explanation attached.</p>
        )}
      </section>

      <section className="rule-t pt-6">
        <h2 className="font-display text-lg font-semibold">How it reaches you</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="text-muted">Weekly digest</span>
            <div className="mt-1 flex gap-2">
              <select value={p.digest_day} onChange={(e) => set("digest_day", e.target.value)} className="border border-rule bg-surface px-2 py-2">
                {["sun", "mon", "tue", "wed", "thu", "fri", "sat"].map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
              <select value={p.digest_hour} onChange={(e) => set("digest_hour", Number(e.target.value))} className="num border border-rule bg-surface px-2 py-2">
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>
                ))}
              </select>
            </div>
          </label>

          <label className="text-sm">
            <span className="text-muted">Urgent gameday alerts</span>
            <select
              value={p.urgent_channel}
              onChange={(e) => set("urgent_channel", e.target.value as Prefs["urgent_channel"])}
              className="mt-1 block w-full border border-rule bg-surface px-2 py-2"
            >
              <option value="email">Email</option>
              <option value="sms">Text message</option>
              <option value="telegram">Telegram</option>
              <option value="none">Nothing, I will check the app</option>
            </select>
          </label>

          <label className="text-sm">
            <span className="text-muted">Email</span>
            <input
              value={p.notify_email ?? ""}
              onChange={(e) => set("notify_email", e.target.value)}
              className="mt-1 block w-full border border-rule bg-surface px-3 py-2"
            />
          </label>

          {p.urgent_channel === "sms" && (
            <label className="text-sm">
              <span className="text-muted">Mobile number</span>
              <input
                value={p.notify_sms ?? ""}
                onChange={(e) => set("notify_sms", e.target.value)}
                placeholder="+14155551234"
                className="num mt-1 block w-full border border-rule bg-surface px-3 py-2"
              />
            </label>
          )}

          {p.urgent_channel === "telegram" && (
            <label className="text-sm">
              <span className="text-muted">Telegram chat id</span>
              <input
                value={p.notify_telegram_chat_id ?? ""}
                onChange={(e) => set("notify_telegram_chat_id", e.target.value)}
                className="num mt-1 block w-full border border-rule bg-surface px-3 py-2"
              />
            </label>
          )}
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={p.gameday_checkins}
            onChange={(e) => set("gameday_checkins", e.target.checked)}
          />
          Let me check in during games
        </label>
      </section>

      <section className="rule-t pt-6">
        <h2 className="font-display text-lg font-semibold">When it is close</h2>
        <div className="mt-3 flex gap-2">
          {(["floor", "balanced", "ceiling"] as const).map((r) => (
            <button
              key={r}
              onClick={() => set("risk", r)}
              className={`border px-4 py-2 text-sm ${
                p.risk === r ? "border-ink bg-ink text-paper" : "border-rule bg-surface"
              }`}
            >
              {r === "floor" ? "Take the safe points" : r === "ceiling" ? "Chase the ceiling" : "Balanced"}
            </button>
          ))}
        </div>
      </section>

      <button onClick={save} disabled={saving} className="bg-ink px-6 py-3 font-medium text-paper disabled:opacity-40">
        {saving ? "Saving" : mode === "onboarding" ? "Start the season" : "Save changes"}
      </button>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase-client";
import { Prefs } from "@/lib/prefs";
import { PlayerRow, Pos, POSITIONS, RankedPlayer } from "@/lib/types";
import { buildBoard, compare, picksUntilNextTurn } from "@/lib/value";

interface Pick {
  overall: number;
  team_slot: number;
  player_id: string;
  is_mine: boolean;
}

interface Session {
  id: string;
  teams: number;
  rounds: number;
  my_slot: number;
  scoring: string;
  slots: Record<string, number>;
  name: string;
}

const DEFAULT_SLOTS = { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, K: 1, DEF: 1, BN: 6 };

export default function DraftRoom({
  userId,
  prefs,
  players,
  session,
  initialPicks
}: {
  userId: string | null;
  prefs: Prefs;
  players: PlayerRow[];
  session: Session | null;
  initialPicks: Pick[];
}) {
  const [sess, setSess] = useState<Session | null>(session);
  const [picks, setPicks] = useState<Pick[]>(initialPicks);
  const [filter, setFilter] = useState<Pos | "ALL">("ALL");
  const [query, setQuery] = useState("");
  const [tray, setTray] = useState<string[]>([]);
  const [verdict, setVerdict] = useState<string | null>(null);
  const [setup, setSetup] = useState({ teams: 12, rounds: 15, my_slot: 1, scoring: "half_ppr", name: "Draft" });

  // local backup so a dropped connection mid draft costs nothing
  useEffect(() => {
    if (sess) localStorage.setItem(`booth_picks_${sess.id}`, JSON.stringify(picks));
  }, [picks, sess]);

  const taken = useMemo(() => new Set(picks.map((p) => p.player_id)), [picks]);
  const myPlayers = useMemo(
    () => picks.filter((p) => p.is_mine).map((p) => players.find((x) => x.id === p.player_id)).filter(Boolean) as PlayerRow[],
    [picks, players]
  );

  const overallNext = picks.length + 1;
  const round = sess ? Math.ceil(overallNext / sess.teams) : 1;
  const untilMe = sess ? picksUntilNextTurn(sess.teams, sess.rounds, sess.my_slot, overallNext) : 0;
  const onTheClockIsMe = untilMe === 0;

  const board = useMemo(() => {
    if (!sess) return null;
    const filled: Partial<Record<Pos, number>> = {};
    for (const p of myPlayers) filled[p.pos] = (filled[p.pos] ?? 0) + 1;

    return buildBoard(
      players.filter((p) => !taken.has(p.id)),
      { teams: sess.teams, slots: sess.slots ?? DEFAULT_SLOTS, scoring: sess.scoring as any },
      {
        homerTeam: prefs.homer_team,
        homerWeight: prefs.homer_weight,
        homerMinSlots: prefs.homer_min_slots,
        roster: {
          filled,
          homerCount: myPlayers.filter((p) => p.team === prefs.homer_team).length,
          picksMade: myPlayers.length
        },
        picksUntilNextTurn: untilMe,
        totalRounds: sess.rounds
      }
    );
  }, [players, taken, sess, prefs, myPlayers, untilMe]);

  const visible = useMemo(() => {
    if (!board) return [];
    let list = board.ranked;
    if (filter !== "ALL") list = list.filter((p) => p.pos === filter);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q));
    }
    return list.slice(0, 60);
  }, [board, filter, query]);

  async function startDraft() {
    if (userId) {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("draft_sessions")
        .insert({ ...setup, user_id: userId, slots: DEFAULT_SLOTS })
        .select()
        .single();
      if (!error && data) setSess(data as Session);
    } else {
      // Guest mode: store session in localStorage only.
      const id = crypto.randomUUID();
      const newSess: Session = { id, ...setup, slots: DEFAULT_SLOTS };
      try {
        localStorage.setItem(`booth_session_${id}`, JSON.stringify(newSess));
      } catch {}
      setSess(newSess);
    }
  }

  async function record(playerId: string, isMine: boolean) {
    if (!sess) return;
    const pick: Pick = {
      overall: overallNext,
      team_slot: ((overallNext - 1) % sess.teams) + 1,
      player_id: playerId,
      is_mine: isMine
    };
    setPicks((old) => [...old, pick]);
    setTray([]);
    setVerdict(null);
    if (userId) {
      const supabase = createClient();
      await supabase.from("draft_picks").insert({ ...pick, session_id: sess.id });
    }
  }

  async function undo() {
    if (!sess || !picks.length) return;
    const last = picks[picks.length - 1];
    setPicks((old) => old.slice(0, -1));
    if (userId) {
      const supabase = createClient();
      await supabase.from("draft_picks").delete().eq("session_id", sess.id).eq("overall", last.overall);
    }
  }

  function toggleTray(id: string) {
    setVerdict(null);
    setTray((old) => (old.includes(id) ? old.filter((x) => x !== id) : [...old, id].slice(-2)));
  }

  const comparison = useMemo(() => {
    if (!board || tray.length !== 2) return null;
    const a = board.ranked.find((p) => p.id === tray[0]);
    const b = board.ranked.find((p) => p.id === tray[1]);
    if (!a || !b) return null;
    return compare(a, b, prefs.homer_team);
  }, [board, tray, prefs.homer_team]);

  async function askBooth() {
    if (!comparison) return;
    setVerdict("thinking");
    const res = await fetch("/api/narrate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "compare", winner: comparison.winner, loser: comparison.loser, margin: comparison.margin, homerCost: comparison.homerCost })
    });
    const j = await res.json().catch(() => ({}));
    setVerdict(j.text ?? comparison.bullets[0]);
  }

  if (!sess) {
    return (
      <div className="max-w-xl">
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Set up the room</h1>
        <p className="mt-2 text-muted">
          Booth does not connect to the draft itself. You tap each pick as it happens, which takes a
          second and keeps the board exactly in sync with the room.
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="text-muted">Teams</span>
            <input type="number" value={setup.teams} onChange={(e) => setSetup({ ...setup, teams: Number(e.target.value) })} className="num mt-1 block w-full border border-rule bg-surface px-3 py-2" />
          </label>
          <label className="text-sm">
            <span className="text-muted">Rounds</span>
            <input type="number" value={setup.rounds} onChange={(e) => setSetup({ ...setup, rounds: Number(e.target.value) })} className="num mt-1 block w-full border border-rule bg-surface px-3 py-2" />
          </label>
          <label className="text-sm">
            <span className="text-muted">Your draft slot</span>
            <input type="number" value={setup.my_slot} onChange={(e) => setSetup({ ...setup, my_slot: Number(e.target.value) })} className="num mt-1 block w-full border border-rule bg-surface px-3 py-2" />
          </label>
          <label className="text-sm">
            <span className="text-muted">Scoring</span>
            <select value={setup.scoring} onChange={(e) => setSetup({ ...setup, scoring: e.target.value })} className="mt-1 block w-full border border-rule bg-surface px-3 py-2">
              <option value="half_ppr">Half PPR</option>
              <option value="ppr">Full PPR</option>
              <option value="std">Standard</option>
            </select>
          </label>
        </div>
        <button onClick={startDraft} className="mt-6 bg-ink px-6 py-3 font-medium text-paper">Open the board</button>
      </div>
    );
  }

  const cliff = board?.cliffs[0];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
      <div>
        {/* clock */}
        <div className="flex items-baseline justify-between border border-rule bg-surface px-4 py-3">
          <div>
            <span className="num font-display text-2xl font-extrabold">
              {round}.{String(((overallNext - 1) % sess.teams) + 1).padStart(2, "0")}
            </span>
            <span className="ml-3 text-sm text-muted">pick {overallNext} of {sess.teams * sess.rounds}</span>
          </div>
          <div className={onTheClockIsMe ? "font-display text-lg font-semibold text-crimson" : "text-sm text-muted"}>
            {onTheClockIsMe ? "You are on the clock" : `You are up in ${untilMe}`}
          </div>
          <button onClick={undo} disabled={!picks.length} className="border border-rule px-3 py-1 text-sm disabled:opacity-40">
            Undo
          </button>
        </div>

        {cliff && (
          <p className="mt-3 border-l-2 border-crimson bg-surface px-3 py-2 text-sm">
            <span className="num font-semibold">{cliff.playersLeftInTier}</span> player
            {cliff.playersLeftInTier === 1 ? "" : "s"} left in the top {cliff.pos} tier and{" "}
            <span className="num">{cliff.picksUntilNextTurn}</span> picks before you are up. The tier
            probably breaks without you.
          </p>
        )}

        {/* filters */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {(["ALL", ...POSITIONS] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f as Pos | "ALL")}
              className={`border px-3 py-1 text-sm ${filter === f ? "border-ink bg-ink text-paper" : "border-rule bg-surface"}`}
            >
              {f}
            </button>
          ))}
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search"
            className="ml-auto border border-rule bg-surface px-3 py-1 text-sm"
          />
        </div>

        {/* board */}
        <ul className="mt-3 divide-y divide-rule border border-rule bg-surface">
          {visible.map((p, i) => {
            const next = visible[i + 1];
            const isCliff = Boolean(next && next.pos === p.pos && next.tier > p.tier);
            return (
              <li key={p.id} className={isCliff ? "cliff" : ""}>
                <div className="flex items-center gap-3 px-3 py-2">
                  <button
                    onClick={() => toggleTray(p.id)}
                    className={`h-5 w-5 shrink-0 border ${tray.includes(p.id) ? "border-teal bg-teal" : "border-rule"}`}
                    aria-label={`Compare ${p.name}`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="truncate font-medium">{p.name}</span>
                      {p.team === prefs.homer_team && (
                        <span className="shrink-0 border-b-2 border-gold text-xs text-muted">{p.team}</span>
                      )}
                      {p.team !== prefs.homer_team && <span className="shrink-0 text-xs text-muted">{p.team ?? "FA"}</span>}
                      {p.status && p.status !== "Active" && (
                        <span className="shrink-0 text-xs text-crimson">{p.status}</span>
                      )}
                    </div>
                    <div className="num text-xs text-muted">
                      {p.pos} tier {p.tier} · {p.proj.toFixed(0)} proj · {p.vor > 0 ? "+" : ""}
                      {p.vor.toFixed(0)} over replacement
                      {p.adp ? ` · adp ${p.adp.toFixed(0)}` : ""}
                    </div>
                  </div>
                  <button onClick={() => record(p.id, true)} className="shrink-0 bg-ink px-3 py-1 text-xs font-medium text-paper">
                    Mine
                  </button>
                  <button onClick={() => record(p.id, false)} className="shrink-0 border border-rule px-3 py-1 text-xs">
                    Gone
                  </button>
                </div>
              </li>
            );
          })}
          {!visible.length && <li className="px-3 py-6 text-sm text-muted">Nobody left matching that.</li>}
        </ul>
      </div>

      {/* right rail */}
      <aside className="space-y-5">
        {comparison && (
          <div className="border border-ink bg-surface p-3">
            <div className="font-display text-lg font-semibold">{comparison.winner.name}</div>
            <div className="text-sm text-muted">
              over {comparison.loser.name} by {comparison.margin.toFixed(1)}
              {comparison.close ? ", close call" : ""}
            </div>
            <ul className="mt-2 space-y-1 text-sm">
              {comparison.bullets.map((b, i) => (
                <li key={i} className={b.includes("costs") ? "text-crimson" : ""}>{b}</li>
              ))}
            </ul>
            <button onClick={askBooth} className="mt-3 w-full border border-rule px-3 py-1.5 text-sm">
              {verdict === "thinking" ? "Thinking" : "Ask Booth"}
            </button>
            {verdict && verdict !== "thinking" && <p className="mt-2 text-sm">{verdict}</p>}
          </div>
        )}

        <div className="border border-rule bg-surface p-3">
          <h2 className="font-display text-sm font-semibold">Your roster</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {myPlayers.map((p) => (
              <li key={p.id} className="flex justify-between">
                <span className="truncate">{p.name}</span>
                <span className="num text-muted">{p.pos}</span>
              </li>
            ))}
            {!myPlayers.length && <li className="text-muted">Nothing yet.</li>}
          </ul>

          <div className="rule-t mt-3 pt-3 text-sm">
            {POSITIONS.filter((x) => x !== "K" && x !== "DEF").map((pos) => {
              const have = myPlayers.filter((p) => p.pos === pos).length;
              const want = (sess.slots ?? DEFAULT_SLOTS)[pos] ?? 0;
              return (
                <div key={pos} className="flex justify-between">
                  <span className="text-muted">{pos}</span>
                  <span className={`num ${have < want ? "text-crimson" : ""}`}>
                    {have} / {want}
                  </span>
                </div>
              );
            })}
          </div>

          {prefs.homer_team && (
            <div className="rule-t mt-3 pt-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted">{prefs.homer_team} on roster</span>
                <span className="num">
                  {myPlayers.filter((p) => p.team === prefs.homer_team).length}
                  {prefs.homer_min_slots ? ` / ${prefs.homer_min_slots}` : ""}
                </span>
              </div>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

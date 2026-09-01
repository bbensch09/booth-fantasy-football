"use client";

import { useState } from "react";

interface Req {
  id: string;
  raw: string;
  spec: string | null;
  status: string;
  issue_url: string | null;
  created_at: string;
}

export default function RequestChat({ initial }: { initial: Req[] }) {
  const [items, setItems] = useState<Req[]>(initial);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function send() {
    setBusy(true);
    setError("");
    const res = await fetch("/api/requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ raw: text })
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json()).error ?? "Could not file that.");
      return;
    }
    const { request } = await res.json();
    setItems([request, ...items]);
    setText("");
  }

  return (
    <div className="mt-6">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder="Tell me when a 49er on my bench is projected to outscore a starter, but only on Sunday morning."
        className="w-full border border-rule bg-surface px-3 py-2"
      />
      <div className="mt-2 flex items-center gap-3">
        <button onClick={send} disabled={busy || !text.trim()} className="bg-ink px-4 py-2 text-sm font-medium text-paper disabled:opacity-40">
          {busy ? "Writing the spec" : "Send it"}
        </button>
        {error && <span className="text-sm text-crimson">{error}</span>}
      </div>

      <ul className="mt-8 space-y-4">
        {items.map((r) => (
          <li key={r.id} className="border-l-2 border-rule pl-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-medium">{r.raw}</span>
              <span className="num shrink-0 text-xs text-muted">
                {new Date(r.created_at).toLocaleDateString()}
              </span>
            </div>
            {r.spec && <pre className="mt-2 whitespace-pre-wrap text-sm text-muted">{r.spec}</pre>}
            <div className="mt-2 text-xs">
              {r.issue_url ? (
                <a href={r.issue_url} target="_blank" rel="noreferrer" className="text-teal underline">
                  Tracking on GitHub
                </a>
              ) : (
                <span className="text-muted">Filed. Connect GITHUB_TOKEN to let the agent pick it up.</span>
              )}
            </div>
          </li>
        ))}
        {!items.length && <li className="text-sm text-muted">Nothing asked for yet.</li>}
      </ul>
    </div>
  );
}

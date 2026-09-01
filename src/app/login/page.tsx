"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase-client";

export default function Login() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  async function signIn() {
    setState("sending");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` }
    });
    if (error) {
      setState("error");
      setMessage(error.message);
    } else {
      setState("sent");
    }
  }

  return (
    <div className="mx-auto max-w-md pt-16">
      <h1 className="font-display text-4xl font-extrabold leading-none tracking-tight">
        One call,<br />radioed down.
      </h1>
      <p className="mt-4 max-w-sm text-muted">
        Booth reads your Yahoo and ESPN teams, then tells you the smallest number of moves
        that matter. It never spends more of your week than you said it could.
      </p>

      <div className="mt-8 rule-t pt-6">
        <label className="block text-sm text-muted" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="mt-1 w-full border border-rule bg-surface px-3 py-2"
        />
        <button
          onClick={signIn}
          disabled={!email || state === "sending"}
          className="mt-3 w-full bg-ink px-4 py-2 font-medium text-paper disabled:opacity-40"
        >
          {state === "sending" ? "Sending link" : "Send sign in link"}
        </button>

        {state === "sent" && (
          <p className="mt-3 text-sm text-teal">Check your email. The link signs you straight in.</p>
        )}
        {state === "error" && <p className="mt-3 text-sm text-crimson">{message}</p>}
      </div>
    </div>
  );
}

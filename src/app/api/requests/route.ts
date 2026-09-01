import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { specFromRequest } from "@/lib/advice";

/**
 * Feature requests from inside the app.
 *
 * The request is turned into a spec, filed as a GitHub issue tagged for the
 * coding agent, and the agent opens a pull request against a preview
 * deployment. You approve the merge from your phone. Nothing ships to your
 * live teams without you looking at it, which matters in October.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const { raw } = await request.json();
  if (!raw?.trim()) return NextResponse.json({ error: "Say what you want it to do." }, { status: 400 });

  const spec = await specFromRequest(raw);

  let issueUrl: string | null = null;
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO; // "owner/name"

  if (token && repo) {
    try {
      const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          accept: "application/vnd.github+json",
          "content-type": "application/json"
        },
        body: JSON.stringify({
          title: raw.slice(0, 80),
          body: `${spec}\n\n---\nFiled from Booth by ${auth.user.email}.\n\n@claude please implement this and open a pull request.`,
          labels: ["booth-request"]
        })
      });
      if (res.ok) issueUrl = (await res.json()).html_url;
    } catch {
      // filed locally regardless
    }
  }

  const { data, error } = await supabase
    .from("feature_requests")
    .insert({
      user_id: auth.user.id,
      raw,
      spec,
      issue_url: issueUrl,
      status: issueUrl ? "issue_opened" : "filed"
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ request: data });
}

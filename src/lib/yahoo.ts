/**
 * Yahoo Fantasy API.
 *
 * As of the 2026 season Yahoo gates API access behind an application review at
 * https://sports.yahoo.com/developer/access/ and grants read access only.
 * Write access is not available, so Booth can read your Yahoo roster and tell
 * you what to do, but you make the move in the Yahoo app.
 *
 * This client is ready for the day your application is approved. Until then
 * the Yahoo connect button will report that access is pending.
 */
const AUTH = "https://api.login.yahoo.com/oauth2/request_auth";
const TOKEN = "https://api.login.yahoo.com/oauth2/get_token";
const API = "https://fantasysports.yahooapis.com/fantasy/v2";

export interface YahooTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

export function authorizeUrl(redirectUri: string, state: string) {
  const p = new URLSearchParams({
    client_id: process.env.YAHOO_CLIENT_ID ?? "",
    redirect_uri: redirectUri,
    response_type: "code",
    state
  });
  return `${AUTH}?${p}`;
}

async function tokenRequest(body: Record<string, string>): Promise<YahooTokens> {
  const basic = Buffer.from(
    `${process.env.YAHOO_CLIENT_ID}:${process.env.YAHOO_CLIENT_SECRET}`
  ).toString("base64");

  const res = await fetch(TOKEN, {
    method: "POST",
    headers: {
      authorization: `Basic ${basic}`,
      "content-type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams(body)
  });
  if (!res.ok) throw new Error(`Yahoo token exchange failed: ${res.status}`);
  const j = await res.json();
  return {
    access_token: j.access_token,
    refresh_token: j.refresh_token,
    expires_at: Date.now() + (j.expires_in ?? 3600) * 1000
  };
}

export function exchangeCode(code: string, redirectUri: string) {
  return tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri });
}

export function refresh(refreshToken: string, redirectUri: string) {
  return tokenRequest({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    redirect_uri: redirectUri
  });
}

export async function yahooGet(path: string, tokens: YahooTokens, redirectUri: string) {
  let t = tokens;
  if (Date.now() > t.expires_at - 60_000) t = await refresh(t.refresh_token, redirectUri);

  const res = await fetch(`${API}/${path}${path.includes("?") ? "&" : "?"}format=json`, {
    headers: { authorization: `Bearer ${t.access_token}` },
    cache: "no-store"
  });
  if (!res.ok) throw new Error(`Yahoo API ${res.status}`);
  return { data: await res.json(), tokens: t };
}

export const yahooPaths = {
  myTeams: "users;use_login=1/games;game_keys=nfl/teams",
  roster: (teamKey: string) => `team/${teamKey}/roster`,
  league: (leagueKey: string) => `league/${leagueKey}/settings`
};

export function yahooTeamUrl(leagueId: string, teamId: string) {
  return `https://football.fantasysports.yahoo.com/f1/${leagueId}/${teamId}`;
}

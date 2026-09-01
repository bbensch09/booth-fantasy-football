import { NextResponse } from "next/server";
import { authorizeUrl } from "@/lib/yahoo";

export async function GET(request: Request) {
  if (!process.env.YAHOO_CLIENT_ID) {
    return NextResponse.json(
      {
        error:
          "Yahoo API access has not been granted yet. Apply at https://sports.yahoo.com/developer/access/ then set YAHOO_CLIENT_ID and YAHOO_CLIENT_SECRET."
      },
      { status: 503 }
    );
  }
  const origin = new URL(request.url).origin;
  const redirect = `${origin}/api/yahoo/callback`;
  return NextResponse.redirect(authorizeUrl(redirect, crypto.randomUUID()));
}

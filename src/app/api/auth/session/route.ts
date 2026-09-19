import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { isManualLoginEnabled, isTestMode } from '@/lib/app-config';
import { SIGNED_IN_COOKIE, lookupCanvasSession } from '@/lib/canvas-server';

/**
 * Tells the client whether it is logged in, which Canvas it talks to, and
 * whether the manual (URL + token) login form should be offered.
 * The Canvas token itself is never sent to the browser. Telegram sessions are
 * checked with the portal, so one logged out in /sessions reports logged out here.
 */
export async function GET() {
  const manualLogin = isManualLoginEnabled();
  const session = await lookupCanvasSession();
  // The portal can't be reached: say so, and keep everyone logged in meanwhile.
  if (session.status === 'unavailable') {
    return NextResponse.json({ error: "The login server can't be reached right now." }, { status: 503 });
  }
  const creds = session.creds;

  if (!creds) {
    const response = NextResponse.json({ authenticated: false, manualLogin });
    // Drop a leftover sign-in hint so the page stops drawing the app.
    if ((await cookies()).has(SIGNED_IN_COOKIE)) response.cookies.delete(SIGNED_IN_COOKIE);
    return response;
  }
  return NextResponse.json({
    authenticated: true,
    canvas_url: creds.baseUrl,
    manualLogin,
    access: creds.access,
    ...(isTestMode() ? { testMode: true } : {}),
  });
}

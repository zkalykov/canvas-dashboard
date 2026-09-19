import { NextRequest, NextResponse } from 'next/server';
import { canvasServerFetch, isAllowedCanvasUrl, isSameOriginRequest, normalizeCanvasBaseUrl, writeSessionCookies } from '@/lib/canvas-server';
import { resolvesToPublicAddress } from '@/lib/public-address';
import { isManualLoginEnabled } from '@/lib/app-config';

/**
 * Manual login with a Canvas URL + personal access token (developer option).
 * Only available when the server runs with MANUAL_MODE=1 (see src/lib/app-config.ts).
 * The URL must be a public https Canvas host (or in ALLOWED_CANVAS_HOSTS), and
 * the token is checked against /users/self before a session is created.
 */
export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Cross-site request refused' }, { status: 403 });
  }
  if (!isManualLoginEnabled()) {
    return NextResponse.json({ error: 'Manual login is disabled (set MANUAL_MODE=1 to enable it)' }, { status: 404 });
  }
  try {
    const body = (await request.json()) as { canvas_url?: unknown; canvas_token?: unknown };
    const canvasUrl = typeof body.canvas_url === 'string' ? body.canvas_url : '';
    const canvasToken = typeof body.canvas_token === 'string' ? body.canvas_token.trim() : '';

    if (!canvasUrl || !canvasToken) {
      return NextResponse.json({ error: 'Missing credentials' }, { status: 400 });
    }
    if (!isAllowedCanvasUrl(canvasUrl)) {
      return NextResponse.json({ error: 'This Canvas address is not allowed' }, { status: 400 });
    }

    const baseUrl = normalizeCanvasBaseUrl(canvasUrl);
    // Without ALLOWED_CANVAS_HOSTS, the site must be on the public internet.
    if (!process.env.ALLOWED_CANVAS_HOSTS?.trim() && !(await resolvesToPublicAddress(new URL(baseUrl).hostname))) {
      return NextResponse.json({ error: 'This Canvas address is not allowed' }, { status: 400 });
    }
    const check = await canvasServerFetch({ baseUrl, token: canvasToken, access: 'full' }, '/users/self', { redirect: 'manual' });
    if (!check.ok) {
      return NextResponse.json({ error: 'Invalid Canvas URL or token' }, { status: 401 });
    }
    const user = (await check.json()) as { id?: number };

    await writeSessionCookies(baseUrl, canvasToken, 'full', typeof user.id === 'number' ? user.id : null);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[API] Login error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

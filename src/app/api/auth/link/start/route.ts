import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { encryptPayload } from '@/lib/session';
import { LINK_LOGIN_COOKIE, PortalError, requestLinkLogin } from '@/lib/link-login';
import { describeDevice } from '@/lib/device';
import { describeLocation, publicClientIp } from '@/lib/request-location';

/**
 * A one-time link was opened. Ask the portal to send an Approve/Deny message in Telegram.
 * The secret poll token stays in an httpOnly cookie; nothing is signed in yet.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { code?: unknown };
  const code = typeof body.code === 'string' ? body.code.trim() : '';
  if (!code) return NextResponse.json({ error: 'Missing auth code' }, { status: 400 });

  try {
    const result = await requestLinkLogin(code, {
      device: describeDevice(request.headers.get('user-agent')),
      location: await describeLocation(request),
      ip: publicClientIp(request),
    });
    const cookieStore = await cookies();
    cookieStore.set(LINK_LOGIN_COOKIE, encryptPayload(JSON.stringify({ requestId: result.request_id, pollToken: result.poll_token })), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 3 * 60,
      path: '/api/auth/link',
    });
    return NextResponse.json({ status: 'pending', expiresAt: result.expires_at });
  } catch (err) {
    const status = err instanceof PortalError ? err.status : 502;
    const message = err instanceof Error ? err.message : 'Could not reach the login server';
    return NextResponse.json({ error: message }, { status: status >= 400 && status < 600 ? status : 502 });
  }
}

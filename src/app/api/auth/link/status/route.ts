import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { decryptPayload } from '@/lib/session';
import { startCanvasSession } from '@/lib/canvas-server';
import { LINK_LOGIN_COOKIE, PortalError, checkLinkLogin } from '@/lib/link-login';

/** Polled while waiting for Telegram approval. Signs in only once the user tapped Approve. */
export async function GET() {
  const cookieStore = await cookies();
  const raw = cookieStore.get(LINK_LOGIN_COOKIE)?.value;
  const saved = raw ? (JSON.parse(decryptPayload(raw) ?? 'null') as { requestId: string; pollToken: string } | null) : null;
  if (!saved) return NextResponse.json({ status: 'expired' });

  const clear = () => cookieStore.delete({ name: LINK_LOGIN_COOKIE, path: '/api/auth/link' });

  try {
    const result = await checkLinkLogin(saved.requestId, saved.pollToken);
    if (result.status === 'approved' && result.canvas_url && result.canvas_token) {
      const access = result.access === 'full' ? 'full' : 'view';
      const portalSession =
        result.session_id && result.session_secret ? { id: result.session_id, secret: result.session_secret } : undefined;
      await startCanvasSession(result.canvas_url, result.canvas_token, access, portalSession);
      clear();
      return NextResponse.json({ status: 'approved', access });
    }
    if (result.status === 'pending') return NextResponse.json({ status: 'pending' });
    clear();
    return NextResponse.json({ status: result.status === 'denied' ? 'denied' : 'expired' });
  } catch (err) {
    if (err instanceof PortalError && (err.status === 403 || err.status === 404)) {
      clear();
      return NextResponse.json({ status: 'expired' });
    }
    return NextResponse.json({ status: 'error', error: 'Could not reach the login server' }, { status: 502 });
  }
}

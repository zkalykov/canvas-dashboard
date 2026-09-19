import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Runs before every page and API request (not static files):
 * - redirects HTTP to HTTPS outside localhost;
 * - slides the 1-hour session cookies forward on real activity.
 */
export function proxy(request: NextRequest) {
  const url = request.nextUrl.clone();
  const hostname = request.headers.get('host') || url.hostname;

  let res = NextResponse.next();

  // Skip localhost for redirect
  if (!hostname.includes('localhost') && !hostname.includes('127.0.0.1')) {
    // Check if protocol is HTTP
    // We check both the x-forwarded-proto header (for when behind a proxy)
    // and the actual request protocol.
    const forwardedProto = request.headers.get('x-forwarded-proto');
    const isHttpProtocol = url.protocol === 'http:';
    
    if (forwardedProto === 'http' || (!forwardedProto && isHttpProtocol)) {
      url.protocol = 'https:';
      url.host = hostname;
      url.port = ''; // Clear port for https
      res = NextResponse.redirect(url, 301);
    }
  }

  // Refresh portal_session cookie to extend inactivity timeout (1 hour). Background
  // traffic doesn't count as activity: the periodic session check and link prefetches.
  const sessionCookie = request.cookies.get('portal_session');
  // Login/logout routes set or clear the cookies themselves; refreshing them here
  // could undo a logout.
  const path = request.nextUrl.pathname;
  const ownsCookies = path.startsWith('/api/auth/') && path !== '/api/auth/activity';
  const background =
    ownsCookies ||
    request.headers.has('next-router-prefetch') ||
    request.headers.get('purpose') === 'prefetch';
  if (sessionCookie && !background) {
    res.cookies.set({
      name: 'portal_session',
      value: sessionCookie.value,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60, // 1 hour
      path: '/',
    });
    // The readable sign-in hint (see canvas-server.ts) lives exactly as long as the session.
    const hint = request.cookies.get('canvas_signed_in');
    if (hint) {
      res.cookies.set({
        name: 'canvas_signed_in',
        value: hint.value,
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60,
        path: '/',
      });
    }
  }

  return res;
}

export const config = {
  // Pages and API calls only: built JS/CSS, images and the icon skip this (it runs on every request).
  matcher: '/((?!_next/static|_next/image|favicon.ico).*)',
};

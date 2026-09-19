import { createHash } from 'crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { decryptPayload, encryptPayload } from '@/lib/session';
import { isTestMode, testModeCredentials } from '@/lib/app-config';
import { checkPortalSession, endPortalSession } from '@/lib/portal-session';

/**
 * Server-only helpers for talking to Canvas with the credentials stored in the
 * encrypted `portal_session` cookie. Never import this from client components.
 */

export interface CanvasCredentials {
  /** Normalized base URL, e.g. https://school.instructure.com (no trailing slash). */
  baseUrl: string;
  token: string;
  userId?: number;
  /** "view": read-only session (writes are blocked). "full": everything allowed. */
  access: 'view' | 'full';
}

export function normalizeCanvasBaseUrl(raw: string): string {
  let url = raw.trim();
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  return url.replace(/\/+$/, '');
}

const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /\.localhost$/i,
  /\.local$/i,
  /\.internal$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./,
  /^0\./,
  /^\[?::1\]?$/,
  /^\[?::\]?$/,
  /^\[?::ffff:/i, // IPv4-mapped IPv6
  /^\[?f[cd][0-9a-f]{2}:/i,
  /^\[?fe80:/i,
  /^\d+$/, // a whole address written as one number
  /^0x/i,
];

/**
 * Guards the login endpoint against being used to make the server call
 * arbitrary hosts. Set ALLOWED_CANVAS_HOSTS (comma separated) to pin the
 * Canvas instances this deployment may talk to.
 */
export function isAllowedCanvasUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(normalizeCanvasBaseUrl(raw));
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  if (url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  const allowList = (process.env.ALLOWED_CANVAS_HOSTS || '')
    .split(',')
    .map(h => h.trim().toLowerCase())
    .filter(Boolean);
  if (allowList.length > 0) return allowList.includes(host);
  return !PRIVATE_HOST_PATTERNS.some(re => re.test(host));
}

interface StoredSession {
  canvas_url?: string;
  canvas_token?: string;
  user_id?: number;
  access?: string;
  /** Telegram logins: the portal session (can be logged out from the bot with /sessions). */
  sid?: string;
  ssec?: string;
}

/** Decrypts the session cookie (no network). */
async function readStoredSession(): Promise<StoredSession | null> {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(SESSION_COOKIE);
    if (!sessionCookie?.value) return null;
    const decoded = decryptPayload(sessionCookie.value);
    if (!decoded) return null;
    const session = JSON.parse(decoded) as StoredSession;
    return session.canvas_url && session.canvas_token ? session : null;
  } catch (e) {
    console.error('[Canvas] Failed to read session cookie', e);
    return null;
  }
}

export type SessionLookup =
  | { status: 'ok'; creds: CanvasCredentials }
  /** none: not logged in. ended: logged out in Telegram or idle. unavailable: the portal can't be reached. */
  | { status: 'none' | 'ended' | 'unavailable'; creds: null };

/**
 * Canvas credentials from the session cookie (or env with DEV_MODE=1).
 * Sessions from a Telegram login are also checked with the portal: logged out in
 * Telegram (or idle for an hour) is "ended" and the cookies are removed. If the
 * portal can't be reached, the answer is "unavailable" and the cookie stays.
 */
export async function lookupCanvasSession(): Promise<SessionLookup> {
  if (isTestMode()) {
    const creds = testModeCredentials();
    if (!creds) return { status: 'none', creds: null };
    return { status: 'ok', creds: { baseUrl: normalizeCanvasBaseUrl(creds.baseUrl), token: creds.token, access: 'full' } };
  }

  const session = await readStoredSession();
  if (!session) return { status: 'none', creds: null };
  if (session.sid && session.ssec) {
    const state = await checkPortalSession(session.sid, session.ssec);
    if (state === 'ended') {
      await clearSessionCookies().catch(() => {});
      return { status: 'ended', creds: null };
    }
    if (state === 'unknown') return { status: 'unavailable', creds: null };
  }
  return {
    status: 'ok',
    creds: {
      baseUrl: normalizeCanvasBaseUrl(session.canvas_url!),
      token: session.canvas_token!,
      userId: typeof session.user_id === 'number' ? session.user_id : undefined,
      access: session.access === 'view' ? 'view' : 'full',
    },
  };
}

/** For API routes: the credentials, or the response to send (401 logged out, 503 portal unreachable). */
export async function requireCanvasSession(): Promise<{ creds: CanvasCredentials; error?: never } | { creds?: never; error: NextResponse }> {
  const session = await lookupCanvasSession();
  if (session.status === 'ok') return { creds: session.creds };
  if (session.status === 'unavailable') {
    return { error: NextResponse.json({ error: "The login server can't be reached right now. Try again in a minute." }, { status: 503 }) };
  }
  return { error: NextResponse.json({ error: 'Not logged in' }, { status: 401 }) };
}

/**
 * Writes must come from this site: blocks forms and scripts on other sites
 * (including sibling subdomains, which SameSite cookies don't stop).
 */
export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true; // browsers always send Origin on cross-site writes
  try {
    return new URL(origin).host === (request.headers.get('x-forwarded-host') || request.headers.get('host'));
  } catch {
    return false;
  }
}

/** Logging out: ends the portal session (so it leaves /sessions) and removes the cookies. */
export async function endCanvasSession() {
  const session = await readStoredSession();
  if (session?.sid && session.ssec) await endPortalSession(session.sid, session.ssec);
  await clearSessionCookies();
}

export function canvasApiUrl(creds: CanvasCredentials, endpoint: string, search?: string): string {
  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${creds.baseUrl}/api/v1${path}${search ? `?${search}` : ''}`;
}

/**
 * fetch() against the Canvas REST API with the user's bearer token.
 * Redirects are followed only within the Canvas site itself (GET/HEAD); a redirect
 * anywhere else comes back as the 3xx response, so the server is never sent to
 * another host by it. Pass `redirect: 'manual'` to handle every hop yourself.
 */
export async function canvasServerFetch(
  creds: CanvasCredentials,
  endpoint: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${creds.token}`);
  const followSameSite = init.redirect !== 'manual' && ['GET', 'HEAD'].includes((init.method ?? 'GET').toUpperCase());
  let url = new URL(endpoint.startsWith('http') ? endpoint : canvasApiUrl(creds, endpoint));
  const canvasHost = new URL(creds.baseUrl).host;
  for (let hop = 0; ; hop++) {
    const response = await fetch(url, { ...init, headers, redirect: 'manual', cache: 'no-store' });
    const location = response.headers.get('location');
    if (!followSameSite || hop >= 5 || response.status < 300 || response.status >= 400 || !location) return response;
    const next = new URL(location, url);
    if (next.host !== canvasHost || next.protocol !== url.protocol) return response;
    url = next;
  }
}

/** Rewrites Canvas `Link` pagination URLs so the browser can follow them through our proxy. */
export function rewriteLinkHeader(link: string | null): string | null {
  if (!link) return null;
  const parts = link.split(',').map(part => {
    const match = part.match(/<([^>]+)>(.*)/);
    if (!match) return null;
    try {
      const url = new URL(match[1]);
      const idx = url.pathname.indexOf('/api/v1/');
      if (idx === -1) return null;
      const rest = url.pathname.slice(idx + '/api/v1'.length);
      return `</api/canvas${rest}${url.search}>${match[2]}`;
    } catch {
      return null;
    }
  });
  const kept = parts.filter((p): p is string => Boolean(p));
  return kept.length ? kept.join(',') : null;
}

const userIdCache = new Map<string, { id: number; expires: number }>();

/** Returns the Canvas user id for these credentials (cached per token for an hour). */
export async function getCanvasUserId(creds: CanvasCredentials): Promise<number | null> {
  if (creds.userId) return creds.userId;
  const key = createHash('sha256').update(`${creds.baseUrl}|${creds.token}`).digest('hex');
  const cached = userIdCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.id;
  const res = await canvasServerFetch(creds, '/users/self');
  if (!res.ok) return null;
  const user = (await res.json()) as { id?: number };
  if (typeof user.id !== 'number') return null;
  userIdCache.set(key, { id: user.id, expires: Date.now() + 60 * 60 * 1000 });
  return user.id;
}

export const SESSION_COOKIE = 'portal_session';
/** Logged out after an hour without activity (src/proxy.ts slides this on every request). */
export const SESSION_MAX_AGE_SECONDS = 60 * 60;
/**
 * Readable by the page: `{"access":"view"|"full","url":"<canvas url>"}`, no secrets.
 * It lets the app draw itself right away instead of waiting for /api/auth/session.
 * The real check stays on the server (the encrypted httpOnly session cookie).
 */
export const SIGNED_IN_COOKIE = 'canvas_signed_in';

export interface PortalSessionRef {
  id: string;
  secret: string;
}

/** Stores Canvas credentials in the encrypted, httpOnly session cookie (plus the readable hint). */
export async function writeSessionCookies(
  baseUrl: string,
  canvasToken: string,
  access: 'view' | 'full',
  userId?: number | null,
  portalSession?: PortalSessionRef
) {
  const cookieStore = await cookies();
  const options = { secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, maxAge: SESSION_MAX_AGE_SECONDS, path: '/' };
  const stored: StoredSession = {
    canvas_url: baseUrl,
    canvas_token: canvasToken,
    access,
    ...(userId ? { user_id: userId } : {}),
    ...(portalSession ? { sid: portalSession.id, ssec: portalSession.secret } : {}),
  };
  cookieStore.set(SESSION_COOKIE, encryptPayload(JSON.stringify(stored)), { ...options, httpOnly: true });
  cookieStore.set(SIGNED_IN_COOKIE, JSON.stringify({ access, url: baseUrl }), { ...options, httpOnly: false });
}

export async function clearSessionCookies() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  cookieStore.delete(SIGNED_IN_COOKIE);
}

/** Logs in after the Telegram approval: checks who the token belongs to, then writes the cookies. */
export async function startCanvasSession(
  canvasUrl: string,
  canvasToken: string,
  access: 'view' | 'full' = 'full',
  portalSession?: PortalSessionRef
) {
  const baseUrl = normalizeCanvasBaseUrl(canvasUrl);
  const userId = await getCanvasUserId({ baseUrl, token: canvasToken, access }).catch(() => null);
  await writeSessionCookies(baseUrl, canvasToken, access, userId, portalSession);
}

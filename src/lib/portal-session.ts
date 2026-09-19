import { portalHeaders, portalUrl } from '@/lib/app-config';

/**
 * Server-only: sessions from a Telegram login can be logged out from the bot
 * (/sessions), so the portal is asked whether a session is still active.
 *
 * Answers are remembered for a minute per server, so this adds at most one short
 * portal call per minute per session. If the portal can't be reached, a recent
 * "active" (under 10 minutes old) is trusted; otherwise the request is refused
 * without logging out, and the next request tries again.
 */

export type PortalSessionState = 'active' | 'ended' | 'unknown';

const CHECK_EVERY_MS = 60_000;
const OUTAGE_GRACE_MS = 10 * 60_000;
const known = new Map<string, { active: boolean; checkedAt: number; confirmedAt: number }>();
const inFlight = new Map<string, Promise<PortalSessionState>>();

async function askPortal(sessionId: string, secret: string): Promise<PortalSessionState> {
  const now = Date.now();
  const previous = known.get(sessionId);
  try {
    const res = await fetch(`${portalUrl()}/api/portal/session/check`, {
      method: 'POST',
      headers: portalHeaders(),
      body: JSON.stringify({ session_id: sessionId, session_secret: secret }),
      cache: 'no-store',
      signal: AbortSignal.timeout(4000),
    });
    if (res.status === 403) {
      known.set(sessionId, { active: false, checkedAt: now, confirmedAt: now });
      return 'ended';
    }
    if (!res.ok) throw new Error(`portal ${res.status}`);
    const data = (await res.json()) as { status?: string };
    const active = data.status === 'active';
    if (known.size > 5000) known.clear();
    known.set(sessionId, { active, checkedAt: now, confirmedAt: now });
    return active ? 'active' : 'ended';
  } catch (err) {
    console.error('[Portal] Session check failed', err);
    if (previous?.active && now - previous.confirmedAt < OUTAGE_GRACE_MS) {
      known.set(sessionId, { ...previous, checkedAt: now });
      return 'active';
    }
    return 'unknown';
  }
}

export async function checkPortalSession(sessionId: string, secret: string): Promise<PortalSessionState> {
  const entry = known.get(sessionId);
  if (entry && !entry.active) return 'ended';
  if (entry && Date.now() - entry.checkedAt < CHECK_EVERY_MS) return 'active';
  let pending = inFlight.get(sessionId);
  if (!pending) {
    pending = askPortal(sessionId, secret).finally(() => inFlight.delete(sessionId));
    inFlight.set(sessionId, pending);
  }
  return pending;
}

/** Logging out on the website: the session disappears from /sessions too. */
export async function endPortalSession(sessionId: string, secret: string): Promise<void> {
  known.set(sessionId, { active: false, checkedAt: Date.now(), confirmedAt: Date.now() });
  try {
    await fetch(`${portalUrl()}/api/portal/session/end`, {
      method: 'POST',
      headers: portalHeaders(),
      body: JSON.stringify({ session_id: sessionId, session_secret: secret }),
      cache: 'no-store',
      signal: AbortSignal.timeout(3000),
    });
  } catch (err) {
    console.error('[Portal] Ending the session failed', err);
  }
}

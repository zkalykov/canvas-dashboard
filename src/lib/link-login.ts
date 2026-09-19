import { portalHeaders, portalUrl } from '@/lib/app-config';

/**
 * Server-only: one-time Telegram links that must be approved in Telegram.
 * start -> portal marks the code used and asks the user to Approve/Deny in the bot.
 * status -> pending | approved (with Canvas credentials, once) | denied | expired | completed.
 */

export const LINK_LOGIN_COOKIE = 'link_login';

export type LinkLoginStatus = 'pending' | 'approved' | 'denied' | 'expired' | 'completed' | 'error';

export class PortalError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function portalPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${portalUrl()}${path}`, {
    method: 'POST',
    headers: portalHeaders(),
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  if (!res.ok) {
    // The portal answers unknown ids with an HTML 404 page, so fall back to the status code.
    const data = (await res.json().catch(() => ({}))) as { detail?: string };
    const fallback = res.status === 404 ? 'Invalid auth code' : `Login server error (${res.status})`;
    throw new PortalError(res.status, data.detail || fallback);
  }
  return (await res.json()) as T;
}

export function requestLinkLogin(code: string, details: { device: string; location: string; ip: string }) {
  return portalPost<{ request_id: string; poll_token: string; expires_at: string }>('/api/portal/login/request', { code, ...details });
}

export function checkLinkLogin(requestId: string, pollToken: string) {
  return portalPost<{
    status: LinkLoginStatus;
    access?: 'view' | 'full';
    canvas_url?: string;
    canvas_token?: string;
    /** The web session, so it can be logged out from Telegram (/sessions). */
    session_id?: string;
    session_secret?: string;
  }>('/api/portal/login/status', {
    request_id: requestId,
    poll_token: pollToken,
  });
}

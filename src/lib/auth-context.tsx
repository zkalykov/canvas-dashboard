'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { useInactivityLogout } from './inactivity';

/** Fired by the Canvas client when the server answers 401 (session ended or logged out in Telegram). */
export const UNAUTHORIZED_EVENT = 'canvas:unauthorized';

type Access = 'view' | 'full';

interface AuthContextType {
  isAuthenticated: boolean;
  canvasUrl: string | null;
  /** Server allows logging in with a Canvas URL + access token (developer option). */
  manualLoginEnabled: boolean;
  /** Server runs with DEV_MODE (credentials from env, no login). */
  testMode: boolean;
  /** "view": approved as View only in Telegram, so nothing can be submitted or changed. */
  access: Access;
  isViewOnly: boolean;
  /** Manual login; throws an Error with the server's message on failure. */
  login: (canvas_url: string, canvas_token: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Re-asks the server soon (throttled): after a 401 and when the page changes. */
  refreshSession: () => void;
  /** True only while we can't tell yet (no sign-in hint and the server hasn't answered). */
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  isAuthenticated: false,
  canvasUrl: null,
  manualLoginEnabled: false,
  testMode: false,
  access: 'full',
  isViewOnly: false,
  login: async () => {},
  logout: async () => {},
  refreshSession: () => {},
  isLoading: true,
});

export function useAuth() {
  return useContext(AuthContext);
}

interface SessionInfo {
  authenticated: boolean;
  canvasUrl: string | null;
  manualLogin: boolean;
  testMode: boolean;
  access: Access;
}

/**
 * The server sets a readable `canvas_signed_in` cookie next to the httpOnly session
 * ({"access","url"}, no secrets). Reading it lets the app draw itself immediately;
 * /api/auth/session still confirms in the background.
 */
const HINT_COOKIE = 'canvas_signed_in';

function readHint(): string | null {
  const entry = document.cookie.split('; ').find(part => part.startsWith(`${HINT_COOKIE}=`));
  return entry ? entry.slice(HINT_COOKIE.length + 1) : null;
}

function parseHint(raw: string): { access: Access; url: string | null } | null {
  try {
    const value = JSON.parse(decodeURIComponent(raw)) as { access?: string; url?: unknown };
    return { access: value.access === 'view' ? 'view' : 'full', url: typeof value.url === 'string' ? value.url : null };
  } catch {
    return null;
  }
}

const noSubscription = () => () => {};

const LOGGED_OUT: SessionInfo = { authenticated: false, canvasUrl: null, manualLogin: false, testMode: false, access: 'full' };

/** The session check itself failed (offline): trust the sign-in hint if there is one. */
function offlineFallback(): SessionInfo | null {
  return readHint() ? null : LOGGED_OUT;
}

/** Asks the server; null when the request itself failed (keep what we had). */
async function fetchSession(): Promise<SessionInfo | null> {
  try {
    const response = await fetch('/api/auth/session');
    // 503: the login server is unreachable. Keep the current state rather than log out.
    if (!response.ok) return null;
    const data = await response.json();
    return {
      authenticated: Boolean(data.authenticated),
      canvasUrl: data.canvas_url ?? null,
      manualLogin: Boolean(data.manualLogin),
      testMode: Boolean(data.testMode),
      access: data.access === 'view' ? 'view' : 'full',
    };
  } catch (e) {
    console.error('Failed to check session', e);
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // undefined while rendering on the server / hydrating, then the cookie value.
  const hintRaw = useSyncExternalStore(noSubscription, readHint, () => undefined);
  const hint = useMemo(() => (hintRaw ? parseHint(hintRaw) : null), [hintRaw]);
  const [session, setSession] = useState<SessionInfo | null>(null);

  const checkSession = useCallback(async () => {
    const next = await fetchSession();
    setSession(prev => next ?? prev ?? offlineFallback());
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchSession().then(next => {
      if (!cancelled) setSession(prev => next ?? prev ?? offlineFallback());
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // The server's answer wins; until then the hint decides.
  const isAuthenticated = session ? session.authenticated : Boolean(hint);
  const isLoading = !session && !hint;
  const access: Access = session?.authenticated ? session.access : (hint?.access ?? 'full');

  // Periodic check to auto-logout if session expires while app is open
  useEffect(() => {
    if (!isAuthenticated) return;
    const intervalId = setInterval(checkSession, 5 * 60 * 1000);
    return () => clearInterval(intervalId);
  }, [isAuthenticated, checkSession]);

  const login = useCallback(
    async (canvas_url: string, canvas_token: string) => {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ canvas_url, canvas_token }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || `Login failed (${response.status})`);
      }
      await checkSession();
    },
    [checkSession]
  );

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    setSession(LOGGED_OUT);
    if (typeof window !== 'undefined') {
      window.location.href = '/home';
    }
  }, []);

  // Ask the server again (at most every 10 s): after a 401 and on page changes, since
  // preloaded pages open without any request. If the session is gone (idle, or logged
  // out in Telegram), isAuthenticated turns false and the layout sends the page to /home.
  const lastRecheck = useRef(0);
  const recheck = useCallback(() => {
    if (Date.now() - lastRecheck.current < 10_000) return;
    lastRecheck.current = Date.now();
    void checkSession();
  }, [checkSession]);

  useEffect(() => {
    window.addEventListener(UNAUTHORIZED_EVENT, recheck);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, recheck);
  }, [recheck]);

  useInactivityLogout(isAuthenticated && !session?.testMode, logout, recheck);

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        canvasUrl: session?.canvasUrl ?? hint?.url ?? null,
        manualLoginEnabled: session?.manualLogin ?? false,
        testMode: session?.testMode ?? false,
        access,
        isViewOnly: access === 'view',
        login,
        logout,
        refreshSession: recheck,
        isLoading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

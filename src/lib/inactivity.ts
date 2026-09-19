'use client';

import { useEffect } from 'react';

/**
 * Logs out after an hour without anyone using the page (no clicks, typing,
 * scrolling or pointer movement), in every open tab. Background loading doesn't
 * count. While someone is active, the server is told every few minutes so the
 * session cookie (1 hour, sliding) and the Telegram session stay alive.
 */

export const IDLE_LIMIT_MS = 60 * 60 * 1000;
const PING_EVERY_MS = 5 * 60 * 1000;
const CHECK_EVERY_MS = 30 * 1000;
/** Shared by all tabs, so using one tab keeps the others signed in. */
const STORAGE_KEY = 'canvas_last_active';
const EVENTS = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll'] as const;

function readShared(): number {
  try {
    return Number(localStorage.getItem(STORAGE_KEY)) || 0;
  } catch {
    return 0;
  }
}

function writeShared(time: number) {
  try {
    localStorage.setItem(STORAGE_KEY, String(time));
  } catch {
    // storage blocked: this tab still tracks its own activity
  }
}

export function useInactivityLogout(enabled: boolean, onIdle: () => void, onUnauthorized: () => void) {
  useEffect(() => {
    if (!enabled) return;
    let lastActive = Date.now();
    let lastPing = Date.now();
    let loggedOut = false;
    writeShared(lastActive);

    const onActivity = () => {
      const now = Date.now();
      if (now - lastActive < 10_000) return;
      lastActive = now;
      writeShared(now);
      if (now - lastPing >= PING_EVERY_MS) {
        lastPing = now;
        fetch('/api/auth/activity', { method: 'POST' })
          .then(response => {
            if (response.status === 401) onUnauthorized();
          })
          .catch(() => {});
      }
    };

    const check = () => {
      if (loggedOut || document.visibilityState === 'hidden') return;
      const last = Math.max(lastActive, readShared());
      if (Date.now() - last >= IDLE_LIMIT_MS) {
        loggedOut = true;
        onIdle();
      }
    };
    // A tab that comes back after a long sleep checks right away.
    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };

    for (const name of EVENTS) window.addEventListener(name, onActivity, { passive: true, capture: true });
    document.addEventListener('visibilitychange', onVisible);
    const timer = setInterval(check, CHECK_EVERY_MS);
    return () => {
      for (const name of EVENTS) window.removeEventListener(name, onActivity, { capture: true });
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(timer);
    };
  }, [enabled, onIdle, onUnauthorized]);
}

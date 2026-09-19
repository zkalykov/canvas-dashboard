'use client';

import { useSyncExternalStore } from 'react';

/**
 * Knows when the first screen has its data, so everything else can wait for it.
 *
 * Every Canvas load made through `useCanvasData` is counted while it runs. Once the
 * count drops to zero (and stays there briefly), the first screen is "settled":
 * the numbers nobody is looking at yet and the preloading of other pages start then.
 * Safety nets: settle after 1s if the page loads nothing, and after 6s regardless.
 */

let active = 0;
let started = false;
let settled = false;
let armed = false;
let quietTimer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

function settle() {
  if (settled) return;
  settled = true;
  clearTimeout(quietTimer);
  listeners.forEach(listener => listener());
}

export function trackFirstScreen<T>(promise: Promise<T>): Promise<T> {
  if (settled) return promise;
  started = true;
  active += 1;
  clearTimeout(quietTimer);
  const done = () => {
    active -= 1;
    // A short wait: the next load often starts right after one finishes (courses, then assignments).
    if (active === 0) quietTimer = setTimeout(settle, 150);
  };
  promise.then(done, done);
  return promise;
}

/** Called once the signed-in app is on screen. */
export function armFirstScreen() {
  if (armed) return;
  armed = true;
  setTimeout(() => {
    if (!started) settle();
  }, 1000);
  setTimeout(settle, 6000);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** True once the first screen has loaded (never goes back to false). */
export function useFirstScreenSettled(): boolean {
  return useSyncExternalStore(subscribe, () => settled, () => false);
}
